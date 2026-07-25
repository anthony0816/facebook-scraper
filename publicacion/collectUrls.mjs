import { getDriver } from '../drivers/index.mjs';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const browserName = process.argv[2] || 'chrome';
const driver = getDriver(browserName);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = join(__dirname, 'collected_groups.json');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function extractUrls(page) {
  return page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/groups/"]');
    const seen = new Set();
    const result = [];
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const match = href.match(/\/groups\/(\d+)/);
      if (match) {
        const full = `https://www.facebook.com/groups/${match[1]}`;
        if (!seen.has(full)) {
          seen.add(full);
          result.push(full);
        }
      }
    }
    return result;
  });
}

async function main() {
  console.log(`[1/4] Lanzando ${browserName}...`);
  const context = await driver.launch();

  console.log('[2/4] Navegando a grupos...');
  const page = await context.newPage();
  await page.goto('https://www.facebook.com/groups/feed/#', { waitUntil: 'load', timeout: 60000 });
  await sleep(5000);

  console.log('[3/4] Haciendo scroll infinito...');
  const container = await page.$('div.x14nfmen');
  if (!container) {
    console.log('⚠️ No se encontró el contenedor de scroll. Extrayendo sin scroll...');
  } else {
    let prevCount = 0;
    let stalls = 0;

    while (stalls < 3) {
      await page.evaluate(el => { el.scrollTop = el.scrollHeight; }, container);
      await sleep(3000);

      const current = (await extractUrls(page)).length;
      if (current === prevCount) stalls++;
      else stalls = 0;

      if (current !== prevCount) {
        console.log(`  ${current} grupos encontrados...`);
      }
      prevCount = current;
    }
  }

  console.log(`[4/4] Recolectando URLs finales...`);
  const urls = await extractUrls(page);

  writeFileSync(OUTPUT_FILE, JSON.stringify(urls, null, 2), 'utf-8');
  console.log(`✅ ${urls.length} grupos guardados en collected_groups.json`);
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
