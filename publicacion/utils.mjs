import { readdirSync } from 'fs';
import { join } from 'path';
import { params } from './public_params.mjs';

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function waitForElement(page, selector, maxRetries = params.MAX_TEXT_EDITOR_FINDER_SECONDS_AWAIT, delay = 1000) {
  console.log('awaiting for the element ' + maxRetries);
  const el = await page.$(selector);
  if (el) return el;
  if (maxRetries <= 0) return null;
  await sleep(delay);
  return waitForElement(page, selector, maxRetries - 1, delay);
}

export async function waitForElementToDisappear(page, selector, maxRetries = params.MAX_TEXT_EDITOR_FINDER_SECONDS_AWAIT, delay = 1000) {
  console.log('awaiting for the element to disappear ' + maxRetries);
  const el = await page.$(selector);
  if (!el) return true;
  if (maxRetries <= 0) return false;
  await sleep(delay);
  return waitForElementToDisappear(page, selector, maxRetries - 1, delay);
}

// A un selector genérico (ej: 'div[role="dialog"]') pueden matchear varios elementos
// a la vez (tooltips, menús, otros overlays), así que re-consultarlo nunca da null
// aunque el modal que nos interesa ya haya cerrado. Por eso esta variante recibe un
// ElementHandle concreto (el modal que realmente se abrió) y espera a que ESE nodo
// específico se desconecte del DOM.
export async function waitForHandleToDisappear(handle, maxRetries = params.MAX_TEXT_EDITOR_FINDER_SECONDS_AWAIT, delay = 1000) {
  console.log('awaiting for the handle to disappear ' + maxRetries);
  const stillAttached = await handle.evaluate(el => !!el && document.contains(el)).catch(() => false);
  if (!stillAttached) return true;
  if (maxRetries <= 0) return false;
  await sleep(delay);
  return waitForHandleToDisappear(handle, maxRetries - 1, delay);
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

export async function waitForSearchResults(page, searchText, maxRetries = params.MAX_TEXT_EDITOR_FINDER_SECONDS_AWAIT, delay = 1000) {
  const lower = searchText.toLowerCase();
  for (let i = 0; i < maxRetries; i++) {
    const ready = await page.evaluate((text) => {
      const items = document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="dialog"] [role="listitem"], div[role="dialog"] div.x9f619');
      if (items.length === 0) return false;

      for (const item of items) {
        const style = window.getComputedStyle(item);
        const hidden = style.display === 'none' || style.visibility === 'hidden';
        if (!hidden && item.textContent.toLowerCase().includes(text)) return true;
      }

      const spans = document.querySelectorAll('div[role="dialog"] span');
      for (const span of spans) {
        const t = span.textContent.toLowerCase();
        if (t.includes('no se encontraron grupos') || t.includes('no groups found')) return true;
      }

      const input = document.querySelector('div[role="dialog"] input[type="search"]');
      if (input && input.value.toLowerCase() === text) {
        const anyVisible = Array.from(items).some(item => {
          const style = window.getComputedStyle(item);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        if (anyVisible) return true;
      }

      return false;
    }, lower);

    if (ready) return true;
    await sleep(delay);
  }
  return false;
}
