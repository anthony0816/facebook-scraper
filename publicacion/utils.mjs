import { readdirSync } from 'fs';
import { join } from 'path';
import { params } from './public_params.mjs';
import {flags as existing_flags}  from '../consts/flags.mjs'

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Inserta el mensaje completo en el compositor de una sola vez.
//
// page.keyboard.type() manda un key event POR CARÁCTER: es lento y le deja a
// Facebook margen para disparar sus handlers en cada tecla.
// page.keyboard.insertText() inserta el texto entero con un solo input event,
// que es lo que se busca acá — y es la API de Playwright para hacerlo, sin
// pasar por el clipboard del sistema ni pedir permisos de clipboard.
export async function pasteMessage(page, editor, text) {
  if (!text) return;

  await editor.click();
  await sleep(2300);
  await page.keyboard.insertText(text);
  await sleep(1300);
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

// Misma mecánica que waitForElement (reintentos con espera), pero para
// condiciones que no son un selector CSS: se consulta una función que devuelve
// true/false y recibe la page. Sirve para botones que hay que localizar
// recorriendo el DOM (ej. "Añadir grupos", cuyo texto vive en un span dentro de
// varios divs), donde no alcanza con page.$.
export async function waitForCondition(page, fn, maxRetries = params.MAX_TEXT_EDITOR_FINDER_SECONDS_AWAIT, delay = 1000) {
  console.log('awaiting for condition ' + maxRetries);
  if (await fn(page)) return true;
  if (maxRetries <= 0) return false;
  await sleep(delay);
  return waitForCondition(page, fn, maxRetries - 1, delay);
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

// Parsea argv estilo `-flag valor` / `--flag valor` (ambos se normalizan a la
// misma key, sin guiones) + argumentos posicionales (ej: el nombre del
// navegador). Cada flag reconocido consume el siguiente argumento como su
// valor. Evita los bugs de hacer matching por índice a mano (ej: calcular
// "el argumento que no es ni el flag ni su valor" se rompe fácil cuando el
// flag no está presente).
export function parseCliArgs(argv) {
  const flags = {};
  const positional = [];
  const FLAGS_DEFAULT_TRUE = existing_flags.filter(ex_flag => ex_flag.required_argument == false)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('-')) {
      const key = arg.replace(/^--?/, '');
      const coincidences = FLAGS_DEFAULT_TRUE.filter(flag => key == flag.name)
      if (coincidences.length > 0){
        flags[key] = coincidences[0].default
        continue
      }
      flags[key] = argv[i + 1];
      i++;
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

export function verifyFlags(flags, method){
  if (!method) throw new Error('no methon provided in verify flag')
  const ALLOWED_FLAGS_SLINGE = existing_flags.filter(flag => flag.exe_envs.some(env => env == 'single'))
  const ALLOWED_FLAGS_MULTI =  existing_flags.filter(flag => flag.exe_envs.some(env => env == 'multi'))
  let  target = null
  if (method ==  'multi') target =  ALLOWED_FLAGS_MULTI
  if (method == 'single') target = ALLOWED_FLAGS_SLINGE
  if (!target)  throw new Error ('no valid method provided in verify flag')
  Object.keys(flags).forEach(f => {
    if (!target.some(allowed => f == allowed.name )) throw new Error('Not allowed flag ' + f)
  })
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
export function mixArray(array){

  const result =  [...array]
  for (let i = result.length - 1 ; i > 0 ; i --){
    const j = Math.floor(Math.random() * (i + 1))
    const result_i = result[i]
    const result_j = result[j]
    result[i] = result_j
    result[j] = result_i
  }
  return result
}

export function actionNoDepurator(name){
  console.error(`el depurador ${name} no existe`)
  process.exit(1)
}
