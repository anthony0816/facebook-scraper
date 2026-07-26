import { getDriver } from '../drivers/index.mjs';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { message } from './message/message.mjs';
import { params } from './public_params.mjs';
import { isVisited, markVisited, markVisitedOnError } from './groupTrace.mjs';
import { sleep, randomBetween, waitForElement, getAllImages, goto } from './utils.mjs';

const browserName = process.argv[2] || 'chrome';
const driver = getDriver(browserName);

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const COLLECTED_FILE = join(__dirname, 'collected_groups.json');
const imgsDir = join(__dirname, 'imgs');

if (!existsSync(COLLECTED_FILE)) {
  console.error('❌ No se encuentra collected_groups.json. Ejecutá pnpm collect primero.');
  process.exit(1);
}

const allGroups = JSON.parse(readFileSync(COLLECTED_FILE, 'utf-8'));

const queue = allGroups.filter(g => !isVisited(g.url, r => r?.status === 'success'));
console.log(`  ${allGroups.length} grupos totales, ${queue.length} pendientes (${allGroups.length - queue.length} ya publicados)`);

const byName = new Map();
for (const g of queue) {
  const key = g.name.toLowerCase();
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(g);
}

const batches = [];
for (const [, gs] of byName) {
  for (let i = 0; i < gs.length; i += params.BATCH_SIZE) {
    batches.push(gs.slice(i, i + params.BATCH_SIZE));
  }
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
    params.MAX_TEXT_EDITOR_FINDER_SECONDS_AWAIT
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
    await btn.click();
    await sleep(2000);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
    ]);
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

async function searchInputWith(page, groupName) {
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
  const searchInput = await searchInputWith(page, groupName);
  if (!searchInput) return 0;

  await sleep(1500);

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
  const name = batch[0].name;

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
  await sleep(2000);

  console.log(`  Buscando "${name}" en el modal...`);
  const selected = await selectGroupsInModal(page, name);
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

  console.log(`[2/3] ${queue.length} pendientes | ${batches.length} batches`);
  for (const [i, b] of batches.entries()) {
    console.log(`  Batch ${i + 1} (${b.length}): "${b[0].name}"`);
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
        console.log(`  ✅ ${actualBatch.length} publicados, ${remaining} quedaron sin seleccionar (límite de FB)`);
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
