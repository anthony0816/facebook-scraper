import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Perfil persistente y dedicado para el scraper, separado del perfil "Default"
// de uso diario. Dos razones para no reusar el real:
//   1. Chrome 127+ bloquea adjuntar remote debugging al user-data-dir por
//      defecto (protección anti-secuestro de sesión) — por eso el driver de
//      Edge (que sí usa su perfil real directo) no sirve de referencia acá.
//   2. Copiar cookies del perfil real a un directorio temporal (como hacía
//      este driver antes) dejó de funcionar: Chrome las encripta con una clave
//      ligada al perfil original (App-Bound Encryption), así que una copia no
//      se puede desencriptar en otro lado.
// La solución es este directorio propio: no es el perfil Default (no aplica el
// bloqueo) y las cookies nacen y viven acá (nada que desencriptar fuera de
// contexto) — solo hace falta loguearse una vez a mano la primera vez.
const PROFILE_DIR = join(
  'C:\\Users\\Antonio Luis\\AppData\\Local',
  'facebook-scraper-chrome-profile'
);

export async function launch() {
  const isFirstRun = !existsSync(PROFILE_DIR);
  if (isFirstRun) {
    mkdirSync(PROFILE_DIR, { recursive: true });
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      channel: 'chrome',
      chromiumSandbox: true,
      args: ['--profile-directory=Default'],
      timeout: 30000,
    });
  } catch (err) {
    if (/already in use|ProcessSingleton|lock/i.test(err.message || '')) {
      console.error(
        `❌ El perfil de Chrome dedicado (${PROFILE_DIR}) está en uso — ` +
        `cerrá la ventana de Chrome que dejó abierta una corrida anterior y volvé a intentar.`
      );
    }
    throw err;
  }

  if (isFirstRun) {
    console.log(`ℹ️ Primera vez con este perfil de Chrome dedicado (${PROFILE_DIR}).`);
    console.log('   Logueate a Facebook manualmente en la ventana que se abrió — queda guardado para las próximas corridas.');
  }

  return context;
}
