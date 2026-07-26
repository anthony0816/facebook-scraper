import { readdirSync } from 'fs';
import { join } from 'path';

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function waitForElement(page, selector, maxRetries = 15, delay = 1000) {
  console.log('awaiting for the element ' + maxRetries);
  const el = await page.$(selector);
  if (el) return el;
  if (maxRetries <= 0) return null;
  await sleep(delay);
  return waitForElement(page, selector, maxRetries - 1, delay);
}

export function getAllImages(dir) {
  return readdirSync(dir)
    .filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f))
    .map(f => join(dir, f));
}

export async function goto(page, url, retries = 4, timeout = 240000) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout });
  } catch (err) {
    console.error('Navegation Fails:', err.message);
    console.log('retrying:', retries);
    if (retries < 0) {
      console.log('max retries exeeded');
      return;
    }
    await goto(page, url, retries - 1, timeout);
  }
}
