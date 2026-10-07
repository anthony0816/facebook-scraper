import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ensureActiveProfilePath } from './profileManager.mjs';

const profilePath = ensureActiveProfilePath();
const VISITED_FILE = join(profilePath, 'visited.json');
const COLLECTED_FILE = join(profilePath, 'collected_groups.json');

const command = process.argv[2];

function readCollected() {
  if (!existsSync(COLLECTED_FILE)) return [];
  return JSON.parse(readFileSync(COLLECTED_FILE, 'utf-8'));
}

function getTotalGroups() {
  return readCollected()
    .filter(g => g.approved !== false)
    .map(g => g.url)
    .filter(Boolean);
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
  const groups = getTotalGroups();
  const visited = readVisited();
  const published = groups.filter(url => url in visited);
  const pct = groups.length ? ((published.length / groups.length) * 100).toFixed(1) : '0';

  if (published.length > 0) {
    console.log('\n✔️  Ya publicados:');
    published.forEach(u => console.log(`  ${u}`));
  }
  if (published.length < groups.length) {
    console.log('\n⏳ Pendientes:');
    groups.filter(u => !(u in visited)).forEach(u => console.log(`  ${u}`));
  }
  console.log(`✅ Publicados: ${published.length}/${groups.length} (${pct}%)`);
}

async function dedup() {
  const groups = readCollected();
  const seen = new Set();
  const unique = [];
  let removed = 0;

  for (const g of groups) {
    const normalized = normalizeUrl(g.url);
    if (seen.has(normalized)) {
      removed++;
      continue;
    }
    seen.add(normalized);
    unique.push({ ...g, url: normalized });
  }

  writeFileSync(COLLECTED_FILE, JSON.stringify(unique, null, 2), 'utf-8');
  console.log(`Duplicados eliminados: ${removed}`);
  console.log(`URLs únicas en collected_groups.json: ${unique.length}`);
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
