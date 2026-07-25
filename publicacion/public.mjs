import { getDriver } from '../drivers/index.mjs';
import { grups_urls } from './grups_urls/grups.mjs';
import { message } from './message/message.mjs';
import { params } from './public_params.mjs';
import { isVisited, markVisited, markVisitedOnError } from './groupTrace.mjs';
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

function getAllImages() {
  return getImages();
}

async function postToGroup(page, url) {
  console.log(`  Navegando a: ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  console.log('Loaded ✅')
  await sleep(params.WAIT_AFTER_NAVIGATION);

  const crearBtnSelectors = [
    'div[role="button"]:has-text("Escribe algo")',
    'div[role="button"]:has-text("Escribe")',
    'div[role="button"]:has-text("Write something")',
    'div[role="button"]:has-text("Write")',
    'div[role="button"]:has-text("Crear publicación")',
  ];

  let clicked = false;
  for (const sel of crearBtnSelectors) {
    const btn = await page.$(sel);
    if (btn) {
      console.log(`  Haciendo clic en botón de creación...`);
      await btn.click();
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    console.log(`  ⚠️ No se encontró botón "Escribe algo", buscando otro selector...`);
    const fallbackSelectors = [
      'div[role="button"]:has-text("Crear")',
      'div[role="button"]:has-text("publicación")',
      'form[method="POST"] div[role="button"]',
    ];
    for (const sel of fallbackSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        break;
      }
    }
  }

  await sleep(params.WAIT_FOR_COMPOSER);

  const lexicalEditor = await page.$('div[role="dialog"] div[contenteditable="true"][data-lexical-editor="true"]');
  if (!lexicalEditor) {
    console.log(`  ❌ No se pudo encontrar el editor de texto`);
    return {error : 'no_text_editor_found'};
  }

  console.log(`  Escribiendo mensaje...`);
  await lexicalEditor.click();
  await sleep(1500);

  await page.keyboard.type(message, { delay: 10 });

  await sleep(params.WAIT_AFTER_TYPING);

  const textContent = await page.evaluate(() => {
    const spans = document.querySelectorAll('span[data-lexical-text="true"]');
    return Array.from(spans).map(s => s.textContent).join('');
  });
  console.log(`  Texto detectado: "${textContent.substring(0, 50)}..."`);

  const images = getAllImages();
  if (images.length > 0) {
    console.log(`  Subiendo ${images.length} imágenes...`);

    const photoBtnSelectors = [
      'div[aria-label="Foto/video"]',
      'div[aria-label="Photo/video"]',
      'div[role="button"]:has-text("Foto")',
      'div[role="button"]:has-text("Photo")',
      'div[aria-label="Añade a tu publicación"] div[role="button"]',
      'div[aria-label="Add to your post"] div[role="button"]',
      'div[role="button"]:has-text("video")',
    ];

    let uploaded = false;
    for (const sel of photoBtnSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        console.log(`  Haciendo clic en botón de foto...`);
        await btn.click();
        await sleep(2000);

        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
        ]);

        if (fileChooser) {
          await fileChooser.setFiles(images);
          console.log(`  ${images.length} imágenes seleccionadas, esperando subida...`);
          await sleep(params.WAIT_FOR_IMAGES_UPLOAD);
          uploaded = true;
        }
        if (uploaded) break;
      }
    }

    if (!uploaded) {
      const modalFileInput = await page.$('div[role="dialog"] input[type="file"]');
      if (modalFileInput) {
        await modalFileInput.setInputFiles(images);
        console.log(`  ${images.length} imágenes subidas por input directo, esperando...`);
        await sleep(params.WAIT_FOR_IMAGES_UPLOAD);
        uploaded = true;
      }
    }

    if (!uploaded) {
      console.log(`  ⚠️ No se pudieron subir las imágenes`);
    }
  } else {
    console.log(`  ⚠️ No hay imágenes en la carpeta imgs/`);
  }

  await sleep(3000);

  const postBtnSelectors = [
    'div[role="dialog"] div[aria-label="Publicar"]',
    'div[role="dialog"] div[aria-label="Post"]',
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
    if (btn && await btn.isVisible()) {
      await btn.click();
      console.log(`  ✅ Publicado en: ${url}`);
      posted = true;
      break;
    }
  }

  if (!posted) {
    console.log(`  ⚠️ No se encontró botón de publicar`);
    return {error  : 'not_public_button_found'};
  }

  await sleep(params.WAIT_AFTER_POST_CLICK);
  return {success : true};
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

    let withError = ''
    if (isVisited(url, (row)=> {
      if (!row.error) return true
      if (
        // row.error == 'not_public_button_found' 
        // || 
        row.error == 'no_text_editor_found'
      ){
        withError =  row.error
        return true
      }
    })) {
      console.log(`\n--- Grupo ${i + 1}/${grups_urls.length} --- ⏭️ Ya publicado${withError !== '' ? ` ,❌ con error : ${withError}, url: ${url}` : '' }`);
      continue;
    }

    console.log(`\n--- Grupo ${i + 1}/${grups_urls.length} ---`);
    const {success, error} = await postToGroup(page, url);

    if (success) {
      markVisited(url);
    }
    if(error){
      if(error == 'not_public_button_found')  markVisitedOnError(url, error)
      if(error == 'no_text_editor_found') markVisitedOnError(url, error)
      
    }

    if (i < grups_urls.length - 1) {
      const delay = randomBetween(params.POST_INTERVAL_MIN, params.POST_INTERVAL_MAX);
      console.log(`  Esperando ${(delay / 1000).toFixed(0)}s antes del próximo grupo...`);
      await sleep(delay);
    }
  }

  console.log(`\n[4/4] Proceso finalizado. El navegador queda abierto.`);
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
