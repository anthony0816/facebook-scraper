import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ensureActiveProfilePath, getActiveProfileName } from './profileManager.mjs';
import { clearVisited } from './groupTrace.mjs';

const onlyErrors = process.argv.slice(2).some(a => a === '--errors' || a === '-errors');

const VISITED_FILE = join(ensureActiveProfilePath(), 'visited.json');

function readVisited() {
  if (!existsSync(VISITED_FILE)) return {};
  return JSON.parse(readFileSync(VISITED_FILE, 'utf-8'));
}

// Misma bucketing que isHandled() en public.mjs: sin error = ya resuelto,
// 'not_public_button_found' = también se da por resuelto (no reintentable),
// cualquier otro error = pendiente de reintentar.
function bucket(entries) {
  return {
    success: entries.filter(([, row]) => row.status === 'success'),
    skipped: entries.filter(([, row]) => row.error === 'not_public_button_found'),
    retryable: entries.filter(([, row]) => row.status === 'error' && row.error !== 'not_public_button_found'),
  };
}

function resetAll() {
  const visited = readVisited();
  const entries = Object.entries(visited);

  if (entries.length === 0) {
    console.log('ℹ️ visited.json está vacío — no hay nada que resetear.');
    return;
  }

  const { success, skipped, retryable } = bucket(entries);
  console.log(`Perfil "${getActiveProfileName()}": ${entries.length} entradas (${success.length} publicadas, ${skipped.length} saltadas, ${retryable.length} con error)`);

  clearVisited();

  console.log(`✅ visited.json resetado — ${entries.length} entradas borradas.`);
}

function resetErrors() {
  const visited = readVisited();
  const entries = Object.entries(visited);

  if (entries.length === 0) {
    console.log('ℹ️ visited.json está vacío — no hay nada que resetear.');
    return;
  }

  const { retryable } = bucket(entries);
  if (retryable.length === 0) {
    console.log('ℹ️ No hay errores reintentables — no hay nada que resetear.');
    return;
  }

  console.log(`Perfil "${getActiveProfileName()}": limpiando ${retryable.length} errores reintentables`);
  retryable.forEach(([url, row]) => console.log(`  ${url} — ${row.error}`));

  const kept = Object.fromEntries(
    entries.filter(([, row]) => row.status !== 'error' || row.error === 'not_public_button_found')
  );

  writeFileSync(VISITED_FILE, JSON.stringify(kept, null, 2), 'utf-8');

  console.log(`✅ ${retryable.length} errores limpiados. Se conservan ${Object.keys(kept).length} entradas.`);
}

if (onlyErrors) resetErrors();
else resetAll();
