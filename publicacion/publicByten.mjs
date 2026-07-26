import { getDriver } from '../drivers/index.mjs';
import { grups_urls } from './grups_urls/grups.mjs';
import { message } from './message/message.mjs';
import { params } from './public_params.mjs';
import { isVisited, markVisited, markVisitedOnError } from './groupTrace.mjs';
import { sleep, randomBetween, waitForElement, getAllImages, goto } from './utils.mjs';
import { fileURLToPath } from 'url';
import { join } from 'path';

const browserName = process.argv[2] || 'chrome';
const driver = getDriver(browserName);

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const imgsDir = join(__dirname, 'imgs');

async function postToGroup(page, url) {
  console.log(`  Navegando a: ${url}`);
  await goto(page, url, params.MAX_NAVEGATION_RETRIES);
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
    console.log(`  ⚠️ No se encontró botón "Escribe algo"`);

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

    return { error: 'not_public_button_found' };
  }

  const lexicalEditor = await waitForElement(
    page,
    'div[role="dialog"] div[contenteditable="true"][data-lexical-editor="true"]',
    params.MAX_TEXT_EDITOR_FINDER_SECONDS_AWAIT
  );
  if (!lexicalEditor) {
    console.log(`  ❌ No se pudo encontrar el editor de texto`);
    return { error: 'no_text_editor_found' };
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
    return { error: 'not_public_button_found' };
  }

  return { success: true };
}

async function main() {
  console.log(`[1/4] Lanzando ${browserName}...`);
  const context = await driver.launch();

  console.log('[2/4] Creando página...');
  const page = await context.newPage();

  const gruposSinPublicar = grups_urls
    .map(u => u.trim())
    .filter(Boolean)
    .filter(u => !isVisited(u));

  console.log(`[3/4] Grupos pendientes: ${gruposSinPublicar.length}`);

  const batches = [];
  for (let i = 0; i < gruposSinPublicar.length; i += params.BATCH_SIZE) {
    batches.push(gruposSinPublicar.slice(i, i + params.BATCH_SIZE));
  }

  console.log(`  Lotes: ${batches.length} (${params.BATCH_SIZE} grupos por lote)`);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`\n=== Lote ${b + 1}/${batches.length} (${batch.length} grupos) ===`);

    for (const url of batch) {
      console.log(`\n  Grupo en lote ${b + 1}:`);
      const { success, error } = await postToGroup(page, url);

      if (success) {
        markVisited(url);
      }
      if (error) {
        if (error == 'not_public_button_found') markVisitedOnError(url, error);
        if (error == 'no_text_editor_found') markVisitedOnError(url, error);
      }
    }

    if (b < batches.length - 1) {
      console.log(`\n⏳ Lote ${b + 1} completado. Descanso de ${(params.REST_BETWEEN_BATCHES / 1000).toFixed(0)}s...`);
      await sleep(params.REST_BETWEEN_BATCHES);
    }
  }

  console.log(`\n[4/4] Todos los lotes procesados. El navegador queda abierto.`);
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
