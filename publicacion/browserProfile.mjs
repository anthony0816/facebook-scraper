import { existsSync } from 'fs';
import { join } from 'path';
import { getActiveProfileName } from './profileManager.mjs';

// Cada perfil de la app tiene su propio perfil de navegador, con el MISMO
// nombre. No hay configuración ni mapeo: el perfil activo de la app determina
// directamente el --profile-directory con el que se abre el navegador. Hacé
// checkout a otro perfil y el navegador abre otro perfil, sin tocar nada.
//
// Lo que resuelve Chromium no es dónde está el perfil, sino qué directorio usa
// DENTRO de un user-data-dir — y ese user-data-dir tiene que estar en Windows,
// porque el navegador no lee el perfil de ningún otro lado. Por eso los datos
// del perfil (cookies, sesión, historial) viven allá y no en
// meta/profiles/<nombre>/: meta solo guarda los datos de la app.
//
//   chrome → user-data-dir DEDICADO .../facebook-scraper-chrome-profile.
//            No puede usar el real: Chrome 127+ bloquea el remote debugging
//            sobre el perfil por defecto y ata las cookies al perfil de origen
//            (App-Bound Encryption), así que una copia no se puede
//            desencriptar en otro lado.
//   edge   → user-data-dir REAL .../Microsoft/Edge/User Data.
//
// El directorio con el nombre del perfil lo crea el navegador solo la primera
// vez que se usa; en esa primera corrida hay que loguearse a Facebook a mano
// (una vez por perfil). Después la sesión queda guardada ahí.

const USER_DATA_DIRS = {
  chrome: join('C:\\Users\\Antonio Luis\\AppData\\Local', 'facebook-scraper-chrome-profile'),
  edge: 'C:\\Users\\Antonio Luis\\AppData\\Local\\Microsoft\\Edge\\User Data',
};

export function getUserDataDir(browser) {
  return USER_DATA_DIRS[browser] ?? null;
}

// El nombre del perfil del navegador es, simplemente, el del perfil de la app.
export function getBrowserProfileDir() {
  const name = getActiveProfileName();
  if (!name) {
    throw new Error('No hay perfil activo. Ejecutá pnpm profile:init o pnpm profile:checkout <nombre>');
  }
  return name;
}

export function browserProfilePath(browser) {
  return join(getUserDataDir(browser), getBrowserProfileDir());
}

export function browserProfileExists(browser) {
  const userDataDir = getUserDataDir(browser);
  if (!userDataDir) return false;
  return existsSync(join(userDataDir, getBrowserProfileDir()));
}