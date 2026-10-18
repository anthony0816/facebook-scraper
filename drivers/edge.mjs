import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { getBrowserProfileDir, getUserDataDir, browserProfileExists } from '../publicacion/browserProfile.mjs';

// A diferencia de Chrome, Edge sí puede usar el user-data-dir real (no tiene el
// bloqueo de la 127+ ni el App-Bound Encryption). El perfil que se abre es el
// de la app, con el mismo nombre, dentro de ese directorio — se crea solo la
// primera vez.
export async function launch() {
  const userDataDir = getUserDataDir('edge');
  const profileDir = getBrowserProfileDir();
  const isFirstRun = !browserProfileExists('edge');

  console.log(`ℹ️  Edge → perfil "${profileDir}"`);

  try {
    execSync('taskkill /f /im msedge.exe 2>nul', { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1500));
  } catch {}

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'msedge',
    chromiumSandbox: true,
    args: [`--profile-directory=${profileDir}`],
  });

  if (isFirstRun) {
    console.log('ℹ️  Primera vez con este perfil de Edge. Logueate a Facebook manualmente en la ventana que se abrió.');
  }

  return context;
}