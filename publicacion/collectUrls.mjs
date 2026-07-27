import { getDriver } from '../drivers/index.mjs';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { ensureActiveProfilePath } from './profileManager.mjs';

const browserName = process.argv[2] || 'chrome';
const driver = getDriver(browserName);

const OUTPUT_FILE = join(ensureActiveProfilePath(), 'collected_groups.json');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function extractUrls(page) {
  return page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/groups/"]');
    const groups = new Map();

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const match = href.match(/\/groups\/(\d+)/);
      if (!match) continue;
      const full = `https://www.facebook.com/groups/${match[1]}`;
      const text = link.textContent.trim();

      if (text && !/^\d+$/.test(text)) {
        const clean = text.replace(/Activo por última vez.*/i, '').trim();
        const existing = groups.get(full);
        if (!existing || /^\d+$/.test(existing)) {
          groups.set(full, clean);
        }
      } else if (!groups.has(full)) {
        groups.set(full, match[1]);
      }
    }

    for (const [url, name] of groups) {
      if (/^\d+$/.test(name)) {
        const path = url.replace('https://www.facebook.com', '');
        const link = document.querySelector(`a[href="${path}"]`);
        if (link) {
          const card = link.closest('div.x1jx94hy, div[role="article"], div.x9f619');
          if (card) {
            const nameSpan = card.querySelector('span.x193iq5w span.x193iq5w, [role="heading"]');
            if (nameSpan) {
              const t = nameSpan.textContent.trim().replace(/Activo por última vez.*/i, '').trim();
              if (t) groups.set(url, t);
            }
          }
        }
      }
    }

    return Array.from(groups.entries()).map(([url, name]) => ({ url, name }));
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
