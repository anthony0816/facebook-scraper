import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COLLECTED = join(__dirname, 'collected_groups.json');
const OUTPUT = join(__dirname, 'grups_urls', 'grups.mjs');

if (!existsSync(COLLECTED)) {
  console.error('❌ No se encuentra collected_groups.json. Ejecutá pnpm collect primero.');
  process.exit(1);
}

const groups = JSON.parse(readFileSync(COLLECTED, 'utf-8'));
const urls = groups.map(g => g.url);

const content = `export const grups_urls = [
${urls.map(u => `  "${u}"`).join(',\n')}
]
`;

if (!existsSync(dirname(OUTPUT))) {
  mkdirSync(dirname(OUTPUT), { recursive: true });
}

writeFileSync(OUTPUT, content, 'utf-8');
console.log(`✅ ${urls.length} URLs migradas a grups_urls/grups.mjs`);
