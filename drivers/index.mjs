import * as chrome from './chrome.mjs';
import * as edge from './edge.mjs';
import * as firefox from './firefox.mjs';

const drivers = { chrome, edge, firefox };

export function getDriver(name) {
  const driver = drivers[name];
  if (!driver) {
    const available = Object.keys(drivers).join(', ');
    throw new Error(`Browser "${name}" no soportado. Usá: ${available}`);
  }
  return driver;
}
