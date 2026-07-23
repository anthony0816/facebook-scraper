import { getDriver } from '../drivers/index.mjs';
import { grups_urls } from './grups_urls/grups.mjs';
import { message } from './message/message.mjs';
import { params } from './public_params.mjs';
import { readdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const browserName = process.argv[2] || 'chrome';
const driver = getDriver(browserName);

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const imgsDir = join(__dirname, 'imgs');

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getImages() {
  return readdirSync(imgsDir)
    .filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f))
    .map(f => join(imgsDir, f));
}

function getRandomImagePath() {
  const images = getImages();
  if (images.length === 0) return null;
  return images[Math.floor(Math.random() * images.length)];
}

async function postToGroup(page, url) {
  console.log(`  Navegando a: ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  console.log('Loaded ✅')
  await sleep(params.WAIT_AFTER_NAVIGATION);

  const composerSelectors = [
    'div[role="textbox"]',
    'div[contenteditable="true"]',
    'div[aria-label*="What\'s on your mind"]',
    'div[aria-label*="Escribe"]',
    'div[aria-label*="publicación"]',
    'form [contenteditable="true"]',
  ];

  let composer = null;
  for (const sel of composerSelectors) {
    composer = await page.$(sel);
    if (composer) break;
  }

  if (!composer) {
    console.log(`  ⚠️ No se encontró el composer, intentando hacer clic en el área de publicación...`);

    const clickSelectors = [
      'div[role="button"]:has-text("Write")',
      'div[role="button"]:has-text("Escribe")',
      'div[role="button"]:has-text("Crear")',
      'div[role="button"]:has-text("publicación")',
      'form[method="POST"] div[role="button"]',
    ];

    for (const sel of clickSelectors) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await sleep(params.WAIT_FOR_COMPOSER);
        break;
      }
    }

    for (const sel of composerSelectors) {
      composer = await page.$(sel);
      if (composer) break;
    }
  }

  if (!composer) {
    console.log(`  ❌ No se pudo encontrar el editor de texto`);
    return false;
  }

  console.log(`  Escribiendo mensaje...`);
  await composer.click();
  await sleep(1000);
  await composer.fill(message);
  await sleep(params.WAIT_AFTER_TYPING);

  const imagePath = getRandomImagePath();
  if (imagePath) {
    console.log(`  Subiendo imagen: ${imagePath}`);

    const fileInputSelectors = [
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
      'form input[type="file"]',
    ];

    let fileInput = null;
    for (const sel of fileInputSelectors) {
      fileInput = await page.$(sel);
      if (fileInput) break;
    }

    if (fileInput) {
      await fileInput.setInputFiles(imagePath);
      console.log(`  Esperando subida de imagen...`);
      await sleep(params.WAIT_FOR_IMAGES_UPLOAD);
    } else {
      console.log(`  ⚠️ No se encontró input de archivo, intentando clic en botón de fotos...`);

      const photoBtnSelectors = [
        'div[aria-label="Foto"]',
        'div[aria-label*="photo"]',
        'div[aria-label*="foto"]',
        'div[aria-label*="imagen"]',
        'div[role="button"]:has-text("Foto")',
        'div[role="button"]:has-text("Add")',
      ];

      for (const sel of photoBtnSelectors) {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          await sleep(2000);

          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
          ]);

          if (fileChooser) {
            await fileChooser.setFiles(imagePath);
            console.log(`  Imagen seleccionada, esperando subida...`);
            await sleep(params.WAIT_FOR_IMAGES_UPLOAD);
          }
          break;
        }
      }
    }
  } else {
    console.log(`  ⚠️ No hay imágenes en la carpeta imgs/`);
  }

  const postBtnSelectors = [
    'div[aria-label="Publicar"]',
    'div[aria-label="Post"]',
    'div[role="button"]:has-text("Publicar")',
    'div[role="button"]:has-text("Post")',
    'div[role="button"]:has-text("Compartir")',
    'button:has-text("Publicar")',
    'button:has-text("Post")',
  ];

  let posted = false;
  for (const sel of postBtnSelectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click();
      console.log(`  ✅ Publicado en: ${url}`);
      posted = true;
      break;
    }
  }

  if (!posted) {
    console.log(`  ⚠️ No se encontró botón de publicar`);
    return false;
  }

  await sleep(params.WAIT_AFTER_POST_CLICK);
  return true;
}

async function main() {
  console.log(`[1/4] Lanzando ${browserName}...`);
  const context = await driver.launch();

  console.log('[2/4] Creando página...');
  const page = await context.newPage();

  console.log(`[3/4] Grupos a publicar: ${grups_urls.length}`);

  for (let i = 0; i < grups_urls.length; i++) {
    const url = grups_urls[i].trim();
    if (!url) continue;

    console.log(`\n--- Grupo ${i + 1}/${grups_urls.length} ---`);
    await postToGroup(page, url);

    if (i < grups_urls.length - 1) {
      const delay = randomBetween(params.POST_INTERVAL_MIN, params.POST_INTERVAL_MAX);
      console.log(`  Esperando ${(delay / 1000).toFixed(0)}s antes del próximo grupo...`);
      await sleep(delay);
    }
  }

  console.log(`\n[4/4] Proceso finalizado. Cerrando...`);
  await page.close();
  await context.close();
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
