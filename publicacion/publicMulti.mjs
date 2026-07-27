import { getDriver } from '../drivers/index.mjs';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { params } from './public_params.mjs';
import { isVisited, markVisited, markVisitedOnError } from './groupTrace.mjs';
import { sleep, randomBetween, waitForElement, getAllImages, goto, waitForSearchResults } from './utils.mjs';
import { ensureActiveProfilePath, getActiveProfileName } from './profileManager.mjs';

const browserName = process.argv[2] || 'chrome';
const driver = getDriver(browserName);

const profilePath = ensureActiveProfilePath();
const COLLECTED_FILE = join(profilePath, 'collected_groups.json');
const GRUPS_FILE = join(profilePath, 'grups.json');
const MESSAGE_FILE = join(profilePath, 'message.json');
const imgsDir = join(profilePath, 'imgs');

if (!existsSync(COLLECTED_FILE)) {
  console.error('❌ No se encuentra collected_groups.json. Ejecutá pnpm collect primero.');
  process.exit(1);
}

const allGroups = JSON.parse(readFileSync(COLLECTED_FILE, 'utf-8'));
const allowedUrls = existsSync(GRUPS_FILE)
  ? new Set(JSON.parse(readFileSync(GRUPS_FILE, 'utf-8')))
  : new Set();

const message = existsSync(MESSAGE_FILE)
  ? JSON.parse(readFileSync(MESSAGE_FILE, 'utf-8')).text
  : '';

const pending = allGroups.filter(g =>
  allowedUrls.has(g.url) && !isVisited(g.url, r => r?.status === 'success')
);
console.log(`  ${allGroups.length} en collected.json, ${allowedUrls.size} en grups.json, ${pending.length} pendientes`);

const nameCount = new Map();
for (const g of pending) {
  const key = g.name.toLowerCase();
  nameCount.set(key, (nameCount.get(key) || 0) + 1);
}

const dupGroups = [];
const uniqueGroups = [];
for (const g of pending) {
  const key = g.name.toLowerCase();
  if (nameCount.get(key) >= 2) {
    dupGroups.push(g);
  } else {
    uniqueGroups.push(g);
  }
}

const batches = [];
const byName = new Map();
for (const g of dupGroups) {
  const key = g.name.toLowerCase();
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(g);
}
for (const [, gs] of byName) {
  for (let i = 0; i < gs.length; i += params.BATCH_SIZE) {
    batches.push(gs.slice(i, i + params.BATCH_SIZE));
  }
}
for (let i = 0; i < uniqueGroups.length; i += params.BATCH_SIZE) {
  batches.push(uniqueGroups.slice(i, i + params.BATCH_SIZE));
}

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
  if (!editor) return false;

  await editor.click();
  await sleep(1500);
  await page.keyboard.type(message, { delay: 10 });
  return true;
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

async function searchAndClear(page, groupName) {
  const input = await page.$(
    'div[role="dialog"] input[type="search"], ' +
    'div[role="dialog"] input[placeholder*="buscar" i], ' +
    'div[role="dialog"] input[placeholder*="search" i]'
  );
  if (!input) return null;

  await input.click();
  await sleep(300);
  await page.keyboard.press('Control+a');
  await sleep(200);
  await page.keyboard.press('Delete');
  await sleep(300);
  await page.keyboard.type(groupName, { delay: 20 });

  return input;
}

async function selectGroupsInModal(page, groupName) {
  const lowerName = groupName.toLowerCase();
  const searchInput = await searchAndClear(page, groupName);
  if (!searchInput) return 0;

  await waitForSearchResults(page, groupName);

  const clicked = await page.evaluate((name) => {
    const items = document.querySelectorAll(
      'div[role="dialog"] div[role="button"], ' +
      'div[role="dialog"] [role="listitem"], ' +
      'div[role="dialog"] div.x9f619'
    );
    let count = 0;
    for (const item of items) {
      if (!item.textContent.toLowerCase().includes(name)) continue;
      const cb = item.querySelector('input[type="checkbox"]');
      if (!cb || cb.getAttribute('aria-checked') !== 'false') continue;
      item.click();
      count++;
    }
    return count;
  }, lowerName);

  return clicked;
}

async function selectNamesInModal(page, names) {
  let selected = 0;
  for (const name of names) {
    const searchInput = await searchAndClear(page, name);
    if (!searchInput) continue;
    await waitForSearchResults(page, name);

    const clicked = await page.evaluate((n) => {
      const spans = document.querySelectorAll('div[role="dialog"] span');
      for (const span of spans) {
        if (span.textContent.trim().toLowerCase() !== n.toLowerCase()) continue;
        let p = span;
        for (let i = 0; i < 10; i++) {
          p = p.parentElement;
          if (!p) break;
          const cb = p.querySelector('input[type="checkbox"]');
          if (cb && cb.getAttribute('aria-checked') === 'false') {
            cb.click();
            return true;
          }
        }
      }
      return false;
    }, name);

    if (clicked) selected++;
  }
  return selected;
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

async function postBatch(page, batch) {
  const firstUrl = batch[0].url;
  const sameName = batch.every(g => g.name.toLowerCase() === batch[0].name.toLowerCase());

  console.log(`  Navegando a: ${firstUrl}`);
  await goto(page, firstUrl, params.MAX_NAVEGATION_RETRIES);

  console.log(`  Abriendo compositor...`);
  if (!await openComposer(page)) {
    console.log(`  ❌ No se pudo abrir el compositor en ${firstUrl}`);
    return { success: false };
  }

  console.log(`  Escribiendo mensaje...`);
  if (!await writeText(page)) return { success: false };

  console.log(`  Subiendo imágenes...`);
  await uploadImages(page);

  console.log(`  Abriendo "Añadir grupos"...`);
  if (!await clickAddGroups(page)) {
    console.log(`  ❌ No se encontró botón "Añadir grupos"`);
    return { success: false };
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
    return { success: false };
  }

  let selected = 0;
  if (sameName) {
    console.log(`  Buscando "${batch[0].name}" en el modal...`);
    selected = await selectGroupsInModal(page, batch[0].name);
  } else {
    const names = batch.slice(1).map(g => g.name);
    console.log(`  Buscando ${names.length} nombres distintos...`);
    selected = await selectNamesInModal(page, names);
  }
  console.log(`  ${selected} grupos adicionales seleccionados`);

  const actualBatch = [batch[0], ...batch.slice(1, 1 + selected)];

  console.log(`  Cerrando modal (Atrás)...`);
  await clickBack(page);
  await sleep(1500);

  console.log(`  Publicando...`);
  const published = await clickPublish(page);
  if (!published) {
    console.log(`  ❌ No se encontró botón "Publicar"`);
    return { success: false, actualBatch };
  }

  return { success: true, actualBatch };
}

async function main() {
  console.log(`[1/3] Lanzando ${browserName}...`);
  const context = await driver.launch();
  const page = await context.newPage();

  const dupCount = dupGroups.length;
  const uniCount = uniqueGroups.length;
  console.log(`[2/3] ${pending.length} pendientes | ${dupCount} con nombres repetidos, ${uniCount} únicos | ${batches.length} batches`);

  for (const [i, b] of batches.entries()) {
    const label = b.every(g => g.name.toLowerCase() === b[0].name.toLowerCase())
      ? `"${b[0].name}" (x${b.length})`
      : `mixto (${b.length} grupos)`;
    console.log(`  Batch ${i + 1} (${b.length}): ${label}`);
  }

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`\n--- Batch ${b + 1}/${batches.length} ---`);
    console.log(`  Ancla: ${batch[0].name} (${batch[0].url})`);

    const { success, actualBatch } = await postBatch(page, batch);

    if (success) {
      for (const g of actualBatch) {
        markVisited(g.url);
      }
      const remaining = batch.length - actualBatch.length;
      if (remaining > 0) {
        console.log(`  ✅ ${actualBatch.length} publicados, ${remaining} sin seleccionar (límite de FB)`);
      } else {
        console.log(`  ✅ ${actualBatch.length} publicados`);
      }
    } else {
      console.log(`  ❌ Batch ${b + 1} falló`);
      markVisitedOnError(batch[0].url, 'multi_anchor_failed');
    }

    if (b < batches.length - 1) {
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
