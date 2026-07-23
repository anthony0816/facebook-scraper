import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';

const REAL_DATA = 'C:\\Users\\Antonio Luis\\AppData\\Local\\Google\\Chrome\\User Data';
const PROFILE = 'Default';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function copyIf(src, dst) {
  if (existsSync(src)) {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
}

export async function launch() {
  try {
    execSync('taskkill /f /im chrome.exe 2>nul', { stdio: 'ignore' });
    await sleep(1500);
  } catch {}

  const tempDir = join(tmpdir(), `chrome-scraper-${Date.now()}`);
  const profileDir = join(tempDir, PROFILE);
  const networkDir = join(profileDir, 'Network');
  mkdirSync(networkDir, { recursive: true });

  copyIf(join(REAL_DATA, 'Local State'), join(tempDir, 'Local State'));
  copyIf(join(REAL_DATA, PROFILE, 'Cookies'), join(profileDir, 'Cookies'));
  copyIf(join(REAL_DATA, PROFILE, 'Network', 'Cookies'), join(networkDir, 'Cookies'));

  return chromium.launchPersistentContext(tempDir, {
    headless: false,
    channel: 'chrome',
    args: [`--profile-directory=${PROFILE}`],
    timeout: 30000,
  });
}
