import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VISITED_FILE = join(__dirname, 'visited.json');
const GRUPS_FILE = join(__dirname, 'grups_urls', 'grups.mjs');

const command = process.argv[2];

async function getTotalGroups() {
  const mod = await import(pathToFileURL(GRUPS_FILE).href);
  return mod.grups_urls.map(u => u.trim()).filter(Boolean);
}

function readVisited() {
  if (!existsSync(VISITED_FILE)) return {};
  return JSON.parse(readFileSync(VISITED_FILE, 'utf-8'));
}

function writeVisited(data) {
  writeFileSync(VISITED_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function normalizeUrl(url) {
  return url.replace(/\/+$/, '').replace(/^https?:\/\//, 'https://');
}

async function count() {
  const groups = await getTotalGroups();
  const visited = readVisited();
  const published = groups.filter(url => url in visited);
  const pct = groups.length ? ((published.length / groups.length) * 100).toFixed(1) : '0';

  console.log(`Publicados: ${published.length}/${groups.length} (${pct}%)`);
  if (published.length > 0) {
    console.log('\n✔️  Ya publicados:');
    published.forEach(u => console.log(`  ${u}`));
  }
  if (published.length < groups.length) {
    console.log('\n⏳ Pendientes:');
    groups.filter(u => !(u in visited)).forEach(u => console.log(`  ${u}`));
  }
}

async function dedup() {
  const content = readFileSync(GRUPS_FILE, 'utf-8');
  const lines = content.split('\n');

  const seen = new Set();
  const newLines = [];
  let removed = 0;

  for (const line of lines) {
    const match = line.match(/"((?:https?:\/\/)?[^"]+)"/);
    if (match) {
      const url = normalizeUrl(match[1]);
      if (seen.has(url)) {
        removed++;
        continue;
      }
      seen.add(url);
    }
    newLines.push(line);
  }

  writeFileSync(GRUPS_FILE, newLines.join('\n'), 'utf-8');
  console.log(`Duplicados eliminados: ${removed}`);
  console.log(`URLs únicas en grups.mjs: ${seen.size}`);

  const mod = await import(pathToFileURL(GRUPS_FILE).href);
  const active = mod.grups_urls.length;
  console.log(`Activas (sin comentar): ${active}`);
}

async function main() {
  switch (command) {
    case 'count':
      await count();
      break;
    case 'dedup':
      await dedup();
      break;
    default:
      console.log('Usá: node publicacion/status.mjs [count|dedup]');
  }
}

main().catch(console.error);
