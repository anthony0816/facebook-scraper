import { firefox } from 'playwright';
import { execSync } from 'child_process';

const PROFILE_PATH = 'C:\\Users\\Antonio Luis\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles';

export async function launch() {
  try {
    execSync('taskkill /f /im firefox.exe 2>nul', { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1500));
  } catch {}

  return firefox.launchPersistentContext(PROFILE_PATH, {
    headless: false,
  });
}
