import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function doMigrate(profilePath, profileName) {
  const collected = join(profilePath, 'collected_groups.json');
  const output = join(profilePath, 'grups.json');

  if (!existsSync(collected)) {
    console.log(`ℹ️ ${profileName}: no hay collected_groups.json aún`);
    if (!existsSync(dirname(output))) mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, '[]', 'utf-8');
    return;
  }

  const groups = JSON.parse(readFileSync(collected, 'utf-8'));
  const urls = groups.map(g => g.url);
  if (!existsSync(dirname(output))) mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(urls, null, 2), 'utf-8');
  console.log(`✅ ${profileName}: ${urls.length} URLs migradas a grups.json`);
}

export function migrateProfile(profileName) {
  const profilePath = join(__dirname, 'profiles', profileName);
  doMigrate(profilePath, profileName);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ensureActiveProfilePath, getActiveProfileName } = await import('./profileManager.mjs');

  const nameArg = process.argv[2];
  if (nameArg) {
    const profilePath = join(__dirname, 'profiles', nameArg);
    doMigrate(profilePath, nameArg);
  } else {
    const profilePath = ensureActiveProfilePath();
    const name = getActiveProfileName();
    if (name) doMigrate(profilePath, name);
  }
}
