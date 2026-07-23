import { getDriver } from './drivers/index.mjs';

const browserName = process.argv[2] || 'chrome';
console.log(`[1/8] Driver seleccionado: ${browserName}`);
const driver = getDriver(browserName);

async function main() {
  console.log(`[2/8] Lanzando ${browserName}...`);
  const context = await driver.launch();
  console.log(`[3/8] ${browserName} lanzado, creando página...`);

  const page = await context.newPage();
  console.log('[4/8] Página creada, navegando a Facebook...');

  await page.goto('https://facebook.com', { waitUntil: 'networkidle0' });
  console.log(`[5/8] Página cargada: ${page.url()}`);

  console.log('Título:', await page.title());
  console.log('URL:', page.url());

  const loggedIn = !page.url().includes('login');
  console.log(`[6/8] ¿Logueado? ${loggedIn ? '✅ Sí' : '❌ No'}`);

  console.log('[7/8] Extrayendo texto del body...');
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log(bodyText.substring(0, 1000));

  console.log('[8/8] Tomando screenshot...');
  await page.screenshot({ path: `facebook-feed-${browserName}.png`, fullPage: true });

  await page.close();
  await context.close();
  console.log('✅ Proceso completo');
}

main().catch(err => {
  if (err.message?.includes('already in use') || err.message?.includes('existing browser session')) {
    console.error(`❌ [ERROR] El perfil de ${browserName} está bloqueado.
    Cerra todas las ventanas de ${browserName} y volvé a intentar.
    Si el problema persiste, ejecutá en PowerShell:
    taskkill /f /im ${browserName === 'edge' ? 'msedge' : browserName}.exe`);
  } else {
    console.error(`❌ [ERROR] Falló en el paso ${err.paso || '?'}:`, err.message || err);
    console.error(err);
  }
});
