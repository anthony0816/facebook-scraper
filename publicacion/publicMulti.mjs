import { getDriver } from '../drivers/index.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { params } from './public_params.mjs';
import { isVisited, markVisited, markVisitedOnError } from './groupTrace.mjs';
import {
  sleep,
  randomBetween,
  waitForElement,
  waitForElementToDisappear,
  waitForHandleToDisappear,
  getAllImages,
  goto,
} from './utils.mjs';
import { ensureActiveProfilePath } from './profileManager.mjs';

const args = process.argv.slice(2);
const depuratorFlagIdx = args.findIndex(a => a === '-depurator' || a === '--depurator');
const depuratorName = depuratorFlagIdx !== -1 ? args[depuratorFlagIdx + 1] : null;
const browserName = args.find((a, i) => i !== depuratorFlagIdx && i !== depuratorFlagIdx + 1 && !a.startsWith('-')) || 'chrome';
const driver = getDriver(browserName);

const profilePath = ensureActiveProfilePath();
const COLLECTED_FILE = join(profilePath, 'collected_groups.json');
const MESSAGE_FILE = join(profilePath, 'message.json');
const imgsDir = join(profilePath, 'imgs');

if (!existsSync(COLLECTED_FILE)) {
  console.error('❌ No se encuentra collected_groups.json. Ejecutá pnpm collect primero.');
  process.exit(1);
}

const allGroups = JSON.parse(readFileSync(COLLECTED_FILE, 'utf-8'));

const message = existsSync(MESSAGE_FILE)
  ? JSON.parse(readFileSync(MESSAGE_FILE, 'utf-8')).text
  : '';

if (depuratorName) {
  console.log(`🔍 Filtrando por depurador "${depuratorName}" (solo passed === true, sin recomputar)`);
}

const pending = allGroups.filter(g =>
  g.approved !== false &&
  (!depuratorName || g.depuration?.depurators?.[depuratorName]?.passed === true) &&
  !isVisited(g.url, r => r?.status === 'success')
);
console.log(`  ${allGroups.length} en collected_groups.json, ${pending.length} pendientes`);

async function openComposer(page) {
  const sel = 'div[role="button"]:has-text("Escribe")';
  const btn = await page.$(sel);
  if (btn) { await btn.click(); return true; }

  const fallback = [
    'div[role="button"]:has-text("Crear publicación")',
    'div[role="button"]:has-text("Write")',
  ];
  for (const s of fallback) {
    const el = await page.$(s);
    if (el) { await el.click(); return true; }
  }
  return false;
}

async function writeText(page) {
  const editor = await waitForElement(
    page,
    'div[role="dialog"] div[contenteditable="true"][data-lexical-editor="true"]',
  );
  if (!editor) return null;

  await editor.click();
  await sleep(1500);
  await page.keyboard.type(message, { delay: 10 });
  return editor;
}

async function uploadImages(page) {
  const images = getAllImages(imgsDir);
  if (images.length === 0) return false;

  const photoSel = 'div[aria-label="Foto/video"], div[aria-label="Photo/video"], div[role="button"]:has-text("Foto")';
  const btn = await page.$(photoSel);
  if (btn) {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null),
      btn.click(),
    ]);
    await sleep(2000);
    if (chooser) {
      await chooser.setFiles(images);
      await sleep(params.WAIT_FOR_IMAGES_UPLOAD);
      return true;
    }
  }

  const fileInput = await page.$('div[role="dialog"] input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles(images);
    await sleep(params.WAIT_FOR_IMAGES_UPLOAD);
    return true;
  }
  return false;
}

async function clickAddGroups(page) {
  return page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent.trim();
      if (text === 'Añadir grupos' || text === 'Add groups') {
        let p = span.parentElement;
        for (let i = 0; i < 8; i++) {
          if (!p) break;
          if (p.getAttribute('role') === 'button' || p.tagName === 'A') {
            p.click();
            return true;
          }
          p = p.parentElement;
        }
        span.click();
        return true;
      }
    }
    return false;
  });
}

// Pega el texto completo de una sola vez (no tecla por tecla, para no disparar
// un request de búsqueda por cada letra): borra de golpe con fill('') y pega el
// nombre completo de golpe con fill(groupName).
async function pasteSearch(page, groupName) {
  const input = await page.$(
    'div[role="dialog"] input[type="search"], ' +
    'div[role="dialog"] input[placeholder*="buscar" i], ' +
    'div[role="dialog"] input[placeholder*="search" i]'
  );
  if (!input) return null;

  await input.click();
  await input.fill('');
  await sleep(150);
  await input.fill(groupName);

  return input;
}

// Una sola pasada: busca en el DOM actual spans con match EXACTO de `name` y hace
// click en el checkbox de hasta `max` cards sin marcar todavía. El nombre del grupo
// vive en un <span> propio (sin mezclarse con texto extra como "Última visita:
// ..."), así que el match se hace sobre esos spans — no sobre el textContent de
// toda la card, que sí incluye ese texto adicional y nunca sería igual al nombre
// buscado. El checkbox real está varios niveles de div por encima del span, dentro
// de un contenedor con role="none" (no role="button"), por eso se sube por
// parentElement hasta encontrarlo en vez de clickear el span o la card entera.
//
// El click() es síncrono pero React confirma el estado real (aria-checked) de
// forma asíncrona en su próximo render. Si se hacen varios clicks seguidos sobre
// filas que resultan ser duplicados fantasma de la virtualización de la lista,
// solo uno termina realmente marcado — por eso no se cuenta cuántos .click() se
// llamaron, sino cuántos quedaron de verdad en aria-checked="true" después de
// darle un respiro a React para reconciliar.
async function attemptSelectMatches(page, lowerName, maxToSelect) {
  return page.evaluate(async ({ name, max }) => {
    const spans = document.querySelectorAll('div[role="dialog"] span');
    const candidates = [];
    const seen = new Set();

    for (const span of spans) {
      if (candidates.length >= max) break;
      if (span.textContent.trim().toLowerCase() !== name) continue;

      let p = span;
      let cb = null;
      for (let i = 0; i < 12; i++) {
        p = p.parentElement;
        if (!p) break;
        cb = p.querySelector('input[type="checkbox"]');
        if (cb) break;
      }
      if (!cb || seen.has(cb)) continue;
      if (cb.getAttribute('aria-checked') !== 'false') continue;

      seen.add(cb);
      candidates.push(cb);
    }

    for (const cb of candidates) {
      cb.click();
    }

    await new Promise(r => setTimeout(r, 400));

    return candidates.filter(cb => cb.getAttribute('aria-checked') === 'true').length;
  }, { name: lowerName, max: maxToSelect });
}

// El tiempo que tarda Facebook en traer y renderizar los resultados no es fijo,
// así que en vez de dormir un tiempo arbitrario, reintenta el click-evaluate
// (mismo patrón que waitForElement) hasta que aparezca un match real o se agoten
// los reintentos — rápido cuando Facebook responde rápido, con margen cuando no.
// El delay entre reintentos se randomiza (GROUP_SEARCH_POLL_DELAY_MIN/MAX_MS)
// para que el ritmo entre búsquedas no sea siempre el mismo número exacto.
async function pollForMatches(page, lowerName, maxToSelect, retries) {
  const clicked = await attemptSelectMatches(page, lowerName, maxToSelect);
  if (clicked > 0) return clicked;
  if (retries <= 0) return 0;
  await sleep(randomBetween(params.GROUP_SEARCH_POLL_DELAY_MIN_MS, params.GROUP_SEARCH_POLL_DELAY_MAX_MS));
  return pollForMatches(page, lowerName, maxToSelect, retries - 1);
}

// Busca `groupName` en el modal "Añadir grupos" y marca, de una sola búsqueda,
// hasta `maxToSelect` cards que matcheen exacto y sigan sin marcar. Soporta
// duplicados (mismo nombre, distinta URL real) porque Facebook puede mostrar
// varias cards para un mismo texto buscado.
async function selectExactMatchesInModal(
  page,
  groupName,
  maxToSelect,
  retries = params.GROUP_SEARCH_MAX_RETRIES,
) {
  const searchInput = await pasteSearch(page, groupName);
  if (!searchInput) return 0;

  const lowerName = groupName.toLowerCase().trim();
  return pollForMatches(page, lowerName, maxToSelect, retries);
}

// Cuando se marca una card, Facebook la agrega como "chip" a una bandeja de
// seleccionados (botón con aria-label "Suprimir <nombre> de la lista para
// compartir" / "Remove <name> from the list to share") que es PERSISTENTE —
// a diferencia de la lista de resultados de búsqueda (que se reemplaza con cada
// búsqueda nueva y hace desaparecer cards ya marcadas de búsquedas anteriores),
// esta bandeja sobrevive mientras el campo de búsqueda esté vacío. Por eso es la
// única fuente confiable para saber "cuántos llevo marcados en total" y "cuáles
// son exactamente" — el aria-label además trae el nombre completo sin el recorte
// visual (line-clamp) que tiene el texto del chip en pantalla.
async function getSelectedChipNames(page) {
  const input = await page.$(
    'div[role="dialog"] input[type="search"], ' +
    'div[role="dialog"] input[placeholder*="buscar" i], ' +
    'div[role="dialog"] input[placeholder*="search" i]'
  );
  if (input) {
    await input.fill('');
    await sleep(300);
  }

  return page.evaluate(() => {
    const chips = document.querySelectorAll(
      'div[role="dialog"] [aria-label^="Suprimir "], div[role="dialog"] [aria-label^="Remove "]'
    );
    const names = [];
    for (const chip of chips) {
      const label = chip.getAttribute('aria-label') || '';
      const match =
        label.match(/^Suprimir (.+) de la lista para compartir$/) ||
        label.match(/^Remove (.+) from the list to share$/i);
      if (match) {
        names.push(match[1].trim());
      }
    }
    return names;
  });
}

async function clickBack(page) {
  const sel = 'div[aria-label="Atrás"], div[aria-label="Back"]';
  const el = await page.$(sel);
  if (el) { await el.click(); return true; }
  return false;
}

async function clickPublish(page) {
  const sels = [
    'div[role="dialog"] div[aria-label="Publicar"]',
    'div[role="dialog"] div[aria-label="Post"]',
    'div[aria-label="Publicar"]',
    'div[aria-label="Post"]',
    'div[role="button"]:has-text("Publicar")',
    'button:has-text("Publicar")',
    'div[role="button"]:has-text("Post")',
    'button:has-text("Post")',
  ];
  for (const sel of sels) {
    const el = await page.$(sel);
    if (el && await el.isVisible()) {
      await el.click();
      return true;
    }
  }
  return false;
}

// Publica partiendo de `anchor` como grupo ancla, buscando en el modal "Añadir
// grupos" (uno por uno, por nombre) hasta `capacity` grupos adicionales de
// `remaining`. El tope y la lista final de consumidos se leen de la bandeja de
// chips de seleccionados (getSelectedChipNames), no de lo que cada búsqueda cree
// haber marcado. Esos grupos quedan "quemados" — sacados de `remaining` (misma
// referencia que usa main(), se le hace splice in-place) — sin importar si la
// publicación final tiene éxito o no; por eso solo se persiste en visited.json
// cuando `success` es true.
async function postDynamicBatch(page, anchor, remaining, capacity) {
  console.log(`  Navegando a: ${anchor.url}`);
  await goto(page, anchor.url, params.MAX_NAVEGATION_RETRIES);

  console.log(`  Abriendo compositor...`);
  if (!await openComposer(page)) {
    console.log(`  ❌ No se pudo abrir el compositor en ${anchor.url}`);
    return { success: false, consumed: [] };
  }

  console.log(`  Escribiendo mensaje...`);
  const editor = await writeText(page);
  if (!editor) return { success: false, consumed: [] };

  const dialogHandle = (await editor.evaluateHandle(
    el => el.closest('div[role="dialog"]')
  )).asElement();

  console.log(`  Subiendo imágenes...`);
  await uploadImages(page);

  console.log(`  Abriendo "Añadir grupos"...`);
  if (!await clickAddGroups(page)) {
    console.log(`  ❌ No se encontró botón "Añadir grupos"`);
    return { success: false, consumed: [] };
  }

  console.log(`  Esperando a que cargue el modal...`);
  const searchInput = await waitForElement(
    page,
    'div[role="dialog"] input[type="search"], ' +
    'div[role="dialog"] input[placeholder*="buscar" i], ' +
    'div[role="dialog"] input[placeholder*="search" i]',
  );
  if (!searchInput) {
    console.log(`  ⚠️ No se detectó el campo de búsqueda en el modal`);
    return { success: false, consumed: [] };
  }

  // "Cuántos llevo" y "cuáles son" se leen de la bandeja de chips de
  // seleccionados (getSelectedChipNames), no de lo que cada búsqueda cree haber
  // marcado — esa bandeja es la única vista persistente que no se destruye al
  // cambiar de búsqueda.
  const uniqueNames = [...new Set(remaining.map(g => g.name.toLowerCase().trim()))];

  for (const name of uniqueNames) {
    const selectedSoFar = await getSelectedChipNames(page);
    if (selectedSoFar.length >= capacity) {
      console.log(`  Tope de ${capacity} alcanzado (${selectedSoFar.length} chips), no se buscan más nombres`);
      break;
    }

    const matchCount = remaining.filter(g => g.name.toLowerCase().trim() === name).length;
    if (matchCount === 0) continue;

    const wanted = Math.min(matchCount, capacity - selectedSoFar.length);

    console.log(`  Buscando "${name}"...`);
    const clicked = await selectExactMatchesInModal(page, name, wanted);
    console.log(clicked > 0 ? `    ✅ ${clicked} marcado(s)` : `    sin match en el modal, se omite`);
  }

  // Barrido final por chips: esto es lo que realmente quedó seleccionado, así
  // que es lo que se saca de `remaining` para no volver a ofrecerlo después.
  const finalSelectedNames = await getSelectedChipNames(page);
  const consumed = [];
  for (const selectedName of finalSelectedNames) {
    const lowerSelected = selectedName.toLowerCase().trim();
    const idx = remaining.findIndex(g => g.name.toLowerCase().trim() === lowerSelected);
    if (idx === -1) continue;
    consumed.push(remaining[idx]);
    remaining.splice(idx, 1);
  }

  console.log(`  ${consumed.length} grupos adicionales confirmados por los chips de seleccionados`);

  console.log(`  Cerrando modal (Atrás)...`);
  await clickBack(page);
  await sleep(1500);

  console.log(`  Publicando...`);
  const published = await clickPublish(page);
  if (!published) {
    console.log(`  ❌ No se encontró botón "Publicar"`);
    return { success: false, consumed };
  }

  console.log(`  Esperando a que se cierre el modal de publicación...`);
  const modalClosed = dialogHandle
    ? await waitForHandleToDisappear(dialogHandle, params.MAX_MODAL_CLOSE_SECONDS_AWAIT)
    : await waitForElementToDisappear(page, 'div[role="dialog"]', params.MAX_MODAL_CLOSE_SECONDS_AWAIT);
  if (!modalClosed) {
    console.log(`  ⚠️ El modal no se cerró en el tiempo esperado, continuando de todas formas`);
  }

  return { success: true, consumed };
}

async function main() {
  console.log(`[1/3] Lanzando ${browserName}...`);
  const context = await driver.launch();
  const page = await context.newPage();

  const alreadyPublished = allGroups.filter(g => isVisited(g.url, r => r?.status === 'success'));
  if (alreadyPublished.length > 0) {
    console.log(`\n✔️  Ya publicados (${alreadyPublished.length}):`);
    alreadyPublished.forEach(g => console.log(`  ${g.name} - ${g.url}`));
  }

  const remaining = [...pending];
  const capacity = Math.max(params.BATCH_SIZE - 1, 0);

  console.log(`\n[2/3] ${remaining.length} pendientes | hasta ${capacity} grupo(s) adicionale(s) por publicación`);

  let round = 0;
  while (remaining.length > 0) {
    round++;
    const anchor = remaining.shift();
    console.log(`\n--- Ronda ${round} | quedan ${remaining.length} ---`);
    console.log(`  Grupo (ancla): ${anchor.name} - ${anchor.url}`);

    const { success, consumed } = await postDynamicBatch(page, anchor, remaining, capacity);

    if (success) {
      markVisited(anchor.url);
      for (const g of consumed) markVisited(g.url);

      const publishedGroups = [anchor, ...consumed];
      console.log(`\n✅ Publicación exitosa para grupos (${publishedGroups.length}):`);
      publishedGroups.forEach(g => console.log(`  ${g.name} - ${g.url}`));
    } else {
      markVisitedOnError(anchor.url, 'multi_anchor_failed');
      console.log(`  ❌ Falló el ancla "${anchor.name}" (${consumed.length} adicionales quemados igual para esta corrida, sin marcar en visited.json)`);
    }

    if (remaining.length > 0) {
      const delay = params.REST_BETWEEN_BATCHES;
      console.log(`  Descansando ${(delay / 1000).toFixed(0)}s...`);
      await sleep(delay);
    }
  }

  console.log(`\n[3/3] Finalizado. El navegador queda abierto.`);
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
