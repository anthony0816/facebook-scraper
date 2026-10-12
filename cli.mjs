#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
  const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
  const width = Math.max(...Object.keys(scripts).map(s => s.length));

  console.log('Uso: scraper <script> [args...]');
  console.log('Ej: scraper public:reset  |  scraper public chrome  |  scraper status:count\n');
  for (const [name, cmd] of Object.entries(scripts)) {
    console.log(`  ${name.padEnd(width)}  ${cmd}`);
  }
  process.exit(0);
}

const [script, ...rest] = args;
const result = spawnSync('pnpm', [script, ...rest], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
