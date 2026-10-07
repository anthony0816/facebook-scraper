import { getDriver } from '../drivers/index.mjs';
import { readFileSync, existsSync } from 'fs';
import { params } from './public_params.mjs';
import { isVisited, markVisited, markVisitedOnError } from './groupTrace.mjs';
import { sleep, randomBetween, waitForElement, getAllImages, goto } from './utils.mjs';
import { join } from 'path';
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

const collectedGroups = existsSync(COLLECTED_FILE)
  ? JSON.parse(readFileSync(COLLECTED_FILE, 'utf-8'))
  : [];

const grups_urls = collectedGroups
  .filter(g => g.approved !== false)
  .filter(g => !depuratorName || g.depuration?.depurators?.[depuratorName]?.passed === true)
  .map(g => g.url);

if (depuratorName) {
  console.log(`🔍 Filtrando por depurador "${depuratorName}" (solo passed === true, sin recomputar)`);
}

const message = existsSync(MESSAGE_FILE)
  ? JSON.parse(readFileSync(MESSAGE_FILE, 'utf-8')).text
  : '';async function postToGroup(page, url) {
  console.log(`  Navegando a: ${url}`);
  // await page.goto(url, { waitUntil: 'load', timeout: 600000 });
  await goto(page, url, params.MAX_NAVEGATION_RETRIES)
  console.log('Loaded ✅')

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

    return {error : 'not_public_button_found'}
  }

  const lexicalEditor = await waitForElement(
    page,
    'div[role="dialog"] div[contenteditable="true"][data-lexical-editor="true"]',
    params.MAX_TEXT_EDITOR_FINDER_SECONDS_AWAIT
  );
  if (!lexicalEditor) {
    console.log(`  ❌ No se pudo encontrar el editor de texto`);
    return {error : 'no_text_editor_found'};
  }

  console.log(`  Escribiendo mensaje...`);
  await lexicalEditor.click();
  await sleep(1500);

  await page.keyboard.type(message, { delay: 10 });

  const textContent = await page.evaluate(() => {
    const spans = document.querySelectorAll('span[data-lexical-text="true"]');
    return Array.from(spans).map(s => s.textContent).join('');
  });
  console.log(`  Texto detectado: "${textContent.substring(0, 50)}..."`);

  const images = getAllImages(imgsDir);
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
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null),
          btn.click(),
        ]);
        await sleep(2000);

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
        row.error == 'not_public_button_found' 
        // || 
        // row.error == 'no_text_editor_found'
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
