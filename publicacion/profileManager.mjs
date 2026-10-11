import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_DIR = join(__dirname, '..', 'meta', 'profiles');
const PROFILES_FILE = join(PROFILES_DIR, 'profiles.json');

// "global" es una palabra reservada: no es un perfil real, es la carpeta de
// fallback compartido entre perfiles (por ahora solo para depuración).
export const RESERVED_PROFILE_NAMES = ['global'];

export function getGlobalProfilePath(subpath = '') {
  return join(PROFILES_DIR, 'global', subpath);
}

function readData() {
  if (!existsSync(PROFILES_FILE)) return null;
  return JSON.parse(readFileSync(PROFILES_FILE, 'utf-8'));
}

function writeData(data) {
  if (!existsSync(PROFILES_DIR)) mkdirSync(PROFILES_DIR, { recursive: true });
  writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getActiveProfileName() {
  const data = readData();
  if (!data || !data.activeProfile) return null;
  return data.activeProfile;
}

export function getActiveProfilePath(subpath = '') {
  const name = getActiveProfileName();
  if (!name) return null;
  return join(PROFILES_DIR, name, subpath);
}

export function ensureActiveProfilePath(subpath = '') {
  const path = getActiveProfilePath(subpath);
  if (!path) {
    console.error('❌ No hay perfil activo. Ejecutá pnpm profile:init o pnpm profile:checkout <nombre>');
    process.exit(1);
  }
  return path;
}

export function createProfile(name) {
  if (!name || typeof name !== 'string') {
    console.error('❌ Debes especificar un nombre de perfil');
    return false;
  }

  if (RESERVED_PROFILE_NAMES.includes(name)) {
    console.error(`❌ "${name}" es una palabra reservada del sistema, no se puede usar como nombre de perfil`);
    return false;
  }

  let data = readData();
  if (!data) data = { activeProfile: null, profiles: [] };

  if (data.profiles.includes(name)) {
    console.error(`❌ El perfil "${name}" ya existe`);
    return false;
  }

  const dir = join(PROFILES_DIR, name);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const files = {
    'collected_groups.json': '[]',
    'visited.json': '{}',
    'message.json': '{"text": ""}',
  };

  for (const [file, content] of Object.entries(files)) {
    const path = join(dir, file);
    if (!existsSync(path)) writeFileSync(path, content, 'utf-8');
  }

  const imgsDir = join(dir, 'imgs');
  if (!existsSync(imgsDir)) mkdirSync(imgsDir);

  data.profiles.push(name);
  writeData(data);
  console.log(`✅ Perfil "${name}" creado`);
  return true;
}

export async function checkoutProfile(name) {
  const data = readData();
  if (!data) {
    console.error('❌ No hay archivo de perfiles. Ejecutá pnpm profile:init primero');
    return false;
  }
  if (!data.profiles.includes(name)) {
    console.error(`❌ El perfil "${name}" no existe`);
    return false;
  }

  data.activeProfile = name;
  writeData(data);
  console.log(`✅ Perfil activo cambiado a: "${name}"`);

  return true;
}

export function listProfiles() {
  const data = readData();
  if (!data || data.profiles.length === 0) {
    console.log('No hay perfiles creados');
    return;
  }
  for (const p of data.profiles) {
    const marker = p === data.activeProfile ? '🔸' : '  ';
    console.log(` ${marker} ${p}`);
  }
}

export function deleteProfile(name) {
  const data = readData();
  if (!data || !data.profiles.includes(name)) {
    console.error(`❌ El perfil "${name}" no existe`);
    return false;
  }

  data.profiles = data.profiles.filter(p => p !== name);
  if (data.activeProfile === name) data.activeProfile = null;
  writeData(data);

  const dir = join(PROFILES_DIR, name);
  if (existsSync(dir)) rmSync(dir, { recursive: true });

  console.log(`✅ Perfil "${name}" eliminado`);
  return true;
}

export async function initDefault() {
  if (existsSync(PROFILES_FILE)) {
    console.log('ℹ️ Ya existe profiles.json');
    return;
  }

  mkdirSync(PROFILES_DIR, { recursive: true });
  writeData({ activeProfile: null, profiles: [] });
  createProfile('default');
  await checkoutProfile('default');
  console.log('✅ Perfil "default" creado y activado');
}

export function getAllProfileNames() {
  const data = readData();
  if (!data) return [];
  return data.profiles;
}
