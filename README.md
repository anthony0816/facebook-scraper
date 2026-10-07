# Facebook Scraper & Publisher

Automatización de Facebook usando Playwright con Chrome/Edge/Firefox real. Abre el navegador con tu perfil real — no necesita cookies exportadas ni login por credenciales.

## Requisitos

- Node.js + pnpm
- Chrome, Edge o Firefox instalado con sesión de Facebook iniciada

## Instalación

```powershell
pnpm install
```

## Sistema de Perfiles

Cada perfil tiene sus propios grupos, imágenes, mensaje y registro de publicación. Útil para manejar múltiples cuentas o nichos.

```powershell
pnpm profile:init                     # Crea perfil "default"
pnpm profile:create <name>            # Crea nuevo perfil
pnpm profile:list                     # Lista perfiles existentes
pnpm profile:checkout <name>          # Cambia perfil activo
pnpm profile:delete <name>            # Elimina perfil
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

### Publicación secuencial (grupo por grupo)

Lee los grupos aprobados de `<perfil>/collected_groups.json` (todos salvo los marcados `"approved": false`), escribe el mensaje de `<perfil>/message.json`, sube todas las imágenes de `<perfil>/imgs/` y publica en cada grupo con una espera aleatoria entre cada uno.

```powershell
pnpm public            # Chrome (por defecto)
pnpm public:chrome     # Chrome
pnpm public:edge       # Edge
```

### Publicación multi-grupo (compositor nativo)

Usa el modal "Añadir grupos" de Facebook para publicar en hasta 10 grupos a la vez con el mismo mensaje e imágenes. Agrupa por nombre para manejar duplicados, busca por nombre exacto, y publica en lotes dinámicos.

```powershell
pnpm public:multi           # Chrome (por defecto)
pnpm public:multi:edge      # Edge
```

### Colectar URLs de grupos

Navega al feed y extrae las URLs y nombres de los grupos visibles por scroll.

```powershell
pnpm collect            # Chrome (por defecto)
pnpm collect:edge       # Edge
```

El resultado se guarda en `<perfil>/collected_groups.json`. Todos los grupos ahí se consideran aprobados para publicar salvo que se les marque manualmente `"approved": false`.

### Estado

```powershell
pnpm status:count      # Muestra cuántos grupos están publicados del total
pnpm status:dedup      # Elimina URLs duplicadas de collected_groups.json
```

El navegador **no se cierra** al terminar ningún script. El archivo `<perfil>/visited.json` registra los grupos donde ya se publicó (con estado success/error) para evitar duplicados.

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
├── publicacion/
│   ├── public.mjs         ← Script de publicación secuencial
│   ├── publicMulti.mjs    ← Script de publicación multi-grupo (compositor nativo)
│   ├── collectUrls.mjs    ← Script para extraer URLs y nombres de grupos
│   ├── public_params.mjs  ← Configuración de tiempos (tuneable)
│   ├── groupTrace.mjs     ← Control de grupos ya publicados (visited.json)
│   ├── status.mjs         ← Comandos de estado (count, dedup)
│   ├── profileManager.mjs ← CRUD de perfiles
│   ├── profile.mjs        ← CLI de perfiles
│   ├── utils.mjs          ← Utilidades compartidas (sleep, waitForElement, goto, etc.)
│   └── profiles/          ← Datos de cada perfil
│       ├── profiles.json  ← Registro de perfiles (activo + lista)
│       └── <nombre>/
│           ├── collected_groups.json  ← URLs + nombres extraídos (añadir "approved": false para excluir uno de publicar)
│           ├── message.json           ← Texto del mensaje
│           ├── visited.json           ← Registro de publicaciones
│           └── imgs/                  ← Imágenes para adjuntar
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
| `BATCH_SIZE` | 10 | Grupos máximos por lote en multi-grupo |
| `REST_BETWEEN_BATCHES` | 120s | Espera entre lotes en multi-grupo |
| `MAX_NAVEGATION_RETRIES` | 4 | Reintentos de navegación ante fallo |

## Notas

- El script **mata el navegador** al inicio para liberar el perfil (Chrome/Edge/Firefox se cierran automáticamente).
- Chrome 127+ no permite usar `--remote-debugging-pipe` con el `user-data-dir` por defecto. El driver copia cookies del perfil real a uno temporal para evitarlo.
- El navegador queda abierto al finalizar para que puedas ver el resultado.
- La publicación multi-grupo usa el modal nativo de Facebook ("Añadir grupos"), buscando por nombre. Soporta duplicados (nombres repetidos) y grupos únicos.
- `collected_groups.json` es la única fuente de verdad de grupos: todo grupo se considera aprobado para publicar salvo que se le marque `"approved": false` manualmente.
