import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Versionado de meta/profiles vía snapshots .zip, sin dependencias nuevas:
// usa Compress-Archive / Expand-Archive de PowerShell (ya vienen con Windows).
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROFILES_DIR = join(ROOT, 'meta', 'profiles');
const VERSIONS_DIR = join(ROOT, 'meta', 'versions', 'profile_versions');

function psQuote(path) {
  return `'${path.replace(/'/g, "''")}'`;
}

function runPowerShell(cmd) {
  execSync(`powershell -NoProfile -Command "${cmd}"`, { stdio: 'inherit' });
}

function ensureVersionsDir() {
  if (!existsSync(VERSIONS_DIR)) mkdirSync(VERSIONS_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '');
}

function sanitizeLabel(label) {
  return label ? '_' + label.replace(/[^a-zA-Z0-9_-]+/g, '-') : '';
}

function saveVersion(label) {
  if (!existsSync(PROFILES_DIR)) {
    console.error(`❌ No existe ${PROFILES_DIR}, nada que guardar`);
    process.exit(1);
  }
  ensureVersionsDir();

  const name = `${timestamp()}${sanitizeLabel(label)}.zip`;
  const zipPath = join(VERSIONS_DIR, name);
  const srcGlob = join(PROFILES_DIR, '*');

  runPowerShell(
    `Compress-Archive -Path ${psQuote(srcGlob)} -DestinationPath ${psQuote(zipPath)} -Force`
  );

  console.log(`✅ Snapshot guardado: ${name}`);
  return name;
}

function getVersions() {
  ensureVersionsDir();
  return readdirSync(VERSIONS_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => {
      const full = join(VERSIONS_DIR, f);
      const stat = statSync(full);
      return { name: f, size: stat.size, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function listVersions() {
  const versions = getVersions();
  if (versions.length === 0) {
    console.log('No hay versiones guardadas todavía. Usá "save" para crear la primera.');
    return versions;
  }

  console.log(`Versiones disponibles (${versions.length}), más reciente primero:\n`);
  versions.forEach((v, i) => {
    const sizeKb = (v.size / 1024).toFixed(1);
    console.log(`  [${i}] ${v.name}  (${sizeKb} KB, ${v.mtime.toLocaleString()})`);
  });
  return versions;
}

function resolveVersion(versions, identifier) {
  if (/^\d+$/.test(identifier)) {
    return versions[Number(identifier)] || null;
  }
  return (
    versions.find(v => v.name === identifier) ||
    versions.find(v => v.name.startsWith(identifier)) ||
    null
  );
}

function restoreVersion(identifier) {
  if (!identifier) {
    console.error('❌ Especificá qué versión restaurar: índice de "list" (ej: 0) o nombre de archivo');
    process.exit(1);
  }

  const versions = getVersions();
  const target = resolveVersion(versions, identifier);
  if (!target) {
    console.error(`❌ No se encontró la versión "${identifier}". Corré "list" para ver las disponibles.`);
    process.exit(1);
  }

  // Red de seguridad: antes de pisar el estado actual, lo snapshotea — así
  // restaurar nunca es un camino sin vuelta, aunque te equivoques de versión.
  if (existsSync(PROFILES_DIR)) {
    console.log('ℹ️ Guardando snapshot de seguridad del estado actual antes de restaurar...');
    saveVersion('pre_restore');
    rmSync(PROFILES_DIR, { recursive: true, force: true });
  }
  mkdirSync(PROFILES_DIR, { recursive: true });

  const zipPath = join(VERSIONS_DIR, target.name);
  runPowerShell(
    `Expand-Archive -Path ${psQuote(zipPath)} -DestinationPath ${psQuote(PROFILES_DIR)} -Force`
  );

  console.log(`✅ Restaurado a la versión: ${target.name}`);
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'save':
    saveVersion(rest[0]);
    break;
  case 'list':
    listVersions();
    break;
  case 'restore':
    restoreVersion(rest[0]);
    break;
  default:
    console.log('Uso:');
    console.log('  node scripts/profileVersions.mjs save [etiqueta]');
    console.log('  node scripts/profileVersions.mjs list');
    console.log('  node scripts/profileVersions.mjs restore <índice|nombre>');
    process.exit(1);
}
