# Facebook Scraper & Publisher

Automatización de Facebook usando Playwright con Chrome/Edge/Firefox real. Abre el navegador con tu perfil real — no necesita cookies exportadas ni login por credenciales.

## Requisitos

- Node.js + pnpm
- Chrome, Edge o Firefox instalado con sesión de Facebook iniciada

## Instalación

```powershell
pnpm install
```

## Comandos

### Navegación / Test

Abre el navegador, navega a Facebook y toma un screenshot del feed.

```powershell
pnpm start chrome      # Chrome (por defecto)
pnpm start edge        # Microsoft Edge
pnpm start firefox     # Firefox
pnpm chrome            # atajo para Chrome
pnpm edge              # atajo para Edge
pnpm firefox           # atajo para Firefox
```

### Publicación en grupos

Lee los grupos de `publicacion/grups_urls/grups.mjs`, escribe el mensaje de `publicacion/message/message.mjs`, sube todas las imágenes de `publicacion/imgs/` y publica en cada grupo con una espera aleatoria entre cada uno.

```powershell
pnpm public            # Chrome (por defecto)
pnpm public:chrome     # Chrome
pnpm public:edge       # Edge
```

El navegador **no se cierra** al terminar. El archivo `publicacion/visited.json` registra los grupos donde ya se publicó para evitar duplicados en la próxima ejecución.

### Estado

```powershell
pnpm status:count      # Muestra cuántos grupos están publicados del total
pnpm status:dedup      # Elimina URLs duplicadas de grups.mjs
```

Ejemplo de `status:count`:

```
Publicados: 4/6 (66.7%)

✔️  Ya publicados:
  https://www.facebook.com/groups/1196110561363948
  ...

⏳ Pendientes:
  https://www.facebook.com/groups/3828672430713429
  ...
```

## Estructura del proyecto

```
facebook-scraper/
├── drivers/
│   ├── index.mjs          ← Factory/DI: resuelve el driver por nombre
│   ├── chrome.mjs         ← Driver para Chrome
│   ├── edge.mjs           ← Driver para Edge
│   └── firefox.mjs        ← Driver para Firefox
├── scripts/
│   ├── launch-chrome.ps1  ← (obsoleto) Antes iniciaba Chrome con CDP
│   ├── launch-edge.ps1
│   └── launch-firefox.ps1
├── publicacion/
│   ├── public.mjs         ← Script de publicación en grupos
│   ├── public_params.mjs  ← Configuración de tiempos (tuneable)
│   ├── groupTrace.mjs     ← Control de grupos ya publicados
│   ├── status.mjs         ← Comandos de estado (count, dedup)
│   ├── visited.json       ← Registro de grupos publicados (se genera solo)
│   ├── grups_urls/
│   │   └── grups.mjs      ← URLs de los grupos destino
│   ├── message/
│   │   └── message.mjs    ← Texto del mensaje a publicar
│   └── imgs/              ← Imágenes para adjuntar (jpg, png)
├── index.mjs              ← Script de prueba / navegación simple
├── package.json
└── README.md
```

## Configuración de tiempos

En `publicacion/public_params.mjs`:

| Variable | Default | Descripción |
|---|---|---|
| `POST_INTERVAL_MIN` | 60s | Espera mínima entre grupos |
| `POST_INTERVAL_MAX` | 180s | Espera máxima entre grupos (aleatorio) |
| `WAIT_AFTER_NAVIGATION` | 8s | Espera al cargar el grupo |
| `WAIT_FOR_COMPOSER` | 5s | Espera al abrir el editor |
| `WAIT_AFTER_TYPING` | 3s | Espera después de escribir |
| `WAIT_FOR_IMAGES_UPLOAD` | 15s | Espera subida de imágenes |
| `WAIT_AFTER_POST_CLICK` | 5s | Espera después de publicar |

## Notas

- El script **mata el navegador** al inicio para liberar el perfil (Chrome/Edge/Firefox se cierran automáticamente).
- Chrome 127+ no permite usar `--remote-debugging-pipe` con el `user-data-dir` por defecto. El driver copia cookies del perfil real a uno temporal para evitarlo.
- El navegador queda abierto al finalizar para que puedas ver el resultado.
