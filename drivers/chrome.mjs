import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { getBrowserProfileDir, getUserDataDir, browserProfilePath, browserProfileExists } from '../publicacion/browserProfile.mjs';

// El perfil del navegador es el perfil de la app (mismo nombre) dentro del
// user-data-dir dedicado. No se puede usar el user-data-dir real de Chrome:
// desde la 127 bloquea el remote debugging sobre el perfil por defecto, y sus
// cookies están atadas al perfil de origen (App-Bound Encryption), así que una
// copia no se puede desencriptar en otro lado. Por eso este directorio propio:
// las cookies nacen y viven acá, y solo hay que loguearse una vez a mano.
export async function launch() {
  const userDataDir = getUserDataDir('chrome');
  const profileDir = getBrowserProfileDir();
  const profilePath = browserProfilePath('chrome');
  const isFirstRun = !browserProfileExists('chrome');

  if (isFirstRun) mkdirSync(profilePath, { recursive: true });

  console.log(`ℹ️  Chrome → perfil "${profileDir}"`);

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      chromiumSandbox: true,
      args: [`--profile-directory=${profileDir}`],
      timeout: 30000,
    });
  } catch (err) {
    if (/already in use|ProcessSingleton|lock/i.test(err.message || '')) {
      console.error(
        `❌ El perfil de Chrome "${profileDir}" está en uso (${profilePath}) — ` +
        `cerrá la ventana de Chrome que dejó abierta una corrida anterior y volvé a intentar.`
      );
    }
    throw err;
  }

  if (isFirstRun) {
    console.log(`ℹ️  Primera vez con este perfil (${profilePath}).`);
    console.log('   Logueate a Facebook manualmente en la ventana que se abrió — queda guardado para las próximas corridas.');
  }

  return context;
}