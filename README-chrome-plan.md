# Plan: Controlar Chrome real con Playwright (no headless)

## Problema

Obscura no tiene motor de layout/CSS, lo que causa:
- `element is not visible` al hacer fill/click
- Sin screenshots
- La sesión de Facebook no se restaura con cookies exportadas (las cookies son inválidas o Facebook las rechaza en entornos no estándar)

## Solución

Usar Playwright para controlar **Chrome real** con tu perfil de usuario, donde ya tienes la sesión de Facebook iniciada. Nada headless, nada de cookies exportadas — Chrome real con tu sesión real.

## Requisitos

- Chrome instalado (Chrome, Edge, Brave, etc.)
- Node.js + pnpm
- Playwright (no `playwright-core`, sino `playwright` completo)

## Instalación

```powershell
cd C:\Antonio\Rust\Repos\Obscura\facebook-scrapper
pnpm remove playwright-core
pnpm add playwright
```

## Cómo encontrar tu perfil de Chrome

### Windows

```
C:\Users\TU_USUARIO\AppData\Local\Google\Chrome\User Data\Default
```

Para saber tu perfil exacto:
1. Abrí Chrome
2. Andá a `chrome://version/`
3. Buscá **"Profile Path"** — ej: `C:\Users\Antonio Luis\AppData\Local\Google\Chrome\User Data\Default`

### macOS

```
~/Library/Application Support/Google/Chrome/Default
```

### Linux

```
~/.config/google-chrome/Default
```

## Script básico

```javascript
import { chromium } from 'playwright';

// CAMBIÁ ESTO por tu ruta real de Chrome
const USER_DATA_DIR = 'C:\\Users\\Antonio Luis\\AppData\\Local\\Google\\Chrome\\User Data';
const PROFILE_DIR = 'Default';

async function main() {
  const browser = await chromium.launchPersistentContext(
    USER_DATA_DIR,
    {
      headless: false,
      args: [`--profile-directory=${PROFILE_DIR}`],
      // No cerrar el navegador al final
    }
  );

  const page = await browser.newPage();
  await page.goto('https://facebook.com', { waitUntil: 'networkidle0' });

  console.log('Título:', await page.title());
  console.log('URL:', page.url());

  // Ya deberías estar logueado si Chrome tiene la sesión
  const loggedIn = !page.url().includes('login');
  console.log('¿Logueado automáticamente?', loggedIn ? '✅ Sí' : '❌ No');

  // Ejemplo: extraer texto del feed
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log(bodyText.substring(0, 1000));

  // Screenshot
  await page.screenshot({ path: 'facebook-feed.png', fullPage: true });

  // Cerrar solo la página, no el navegador
  await page.close();
  await browser.close();
}

main().catch(console.error);
```

## Ventajas

| Característica | Con Chrome real |
|---|---|
| Sesión de Facebook | ✅ Ya está iniciada en tu perfil |
| CSS / Layout | ✅ Renderizado completo |
| Screenshots | ✅ |
| `page.fill()`, `page.click()` | ✅ Funcionan normalmente |
| Anti-bot de Facebook | ✅ Chrome real pasa todos los checks |
| Ejecución de JS | ✅ V8 real |

## Desventajas

| Aspecto | Impacto |
|---|---|
| Memoria | Chrome consume 200-500 MB |
| Velocidad | Más lento que Obscura (~500ms vs ~50ms) |
| Ventana visible | Molesta si querés hacer muchas requests |
| Perfil exclusivo | No podés usar Chrome mientras el script lo controla |

## Alternativa: Chrome headless pero con perfil real

Si querés que Chrome no se vea pero use tu perfil:

```javascript
const browser = await chromium.launchPersistentContext(
  USER_DATA_DIR,
  {
    headless: true,  // ← modo headless
    args: [`--profile-directory=${PROFILE_DIR}`],
  }
);
```

Esto corre Chrome headless pero con tu perfil real (incluyendo sesión de Facebook). Sigue teniendo el motor de renderizado, a diferencia de Obscura. Es un buen punto medio.

## Archivos del proyecto

```
C:\Antonio\Rust\Repos\Obscura\facebook-scrapper\
├── .env                      ← (opcional) ya sin FB_EMAIL/FB_PASS
├── index.mjs                 ← script principal (a reescribir)
├── package.json
├── README-chrome-plan.md     ← este archivo
└── facebook-session/
    └── cookies.json          ← ya no necesario con este plan
```
