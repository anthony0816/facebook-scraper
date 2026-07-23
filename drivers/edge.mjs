import { chromium } from 'playwright';
import { execSync } from 'child_process';

const USER_DATA_DIR = 'C:\\Users\\Antonio Luis\\AppData\\Local\\Microsoft\\Edge\\User Data';
const PROFILE_DIR = 'Default';

export async function launch() {
  try {
    execSync('taskkill /f /im msedge.exe 2>nul', { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1500));
  } catch {}

  return chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: 'msedge',
    chromiumSandbox: true,
    args: [`--profile-directory=${PROFILE_DIR}`],
  });
}
