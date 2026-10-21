# app-bot

Editor visual de bots de WhatsApp. Los bots se dibujan con cajas y flechas; cada bot es un JSON con la clave
`FLUJO`, que es lo que entiende el motor del proyecto principal. Los bots **activos** se ofrecen por API para que
cada **aplicación** del proyecto principal elija el suyo.

```
Administrador (ya logueado en el proyecto principal)
   │ «Diseñar flujos» → pase de un solo uso → /entrar/{pase}
   ▼
app-bot: lista de bots ─ editor (dibujar, probar, guardar) ─ interruptor «Activo»
   │
   └── API con clave ──▶ proyecto principal: GET /api/bots → la aplicación elige y copia su bot
```

Contexto, decisiones y pasos pendientes: [docs/PLAN.md](docs/PLAN.md).

## Requisitos

- PHP **8.3** o superior, con las extensiones habituales de Laravel (`pdo_mysql`, `mbstring`, `openssl`…).
- Composer 2.
- Node.js (probado con la 24) y npm.
- MariaDB 10.4+ o MySQL. Las pruebas usan SQLite en memoria (no tocan la base).

> **En Windows, en esta máquina:** el `php` del PATH es 7.4 y no sirve. Usa `C:\tools\php83\php.exe`
> y Composer como `C:\tools\php83\php.exe C:\laragon\bin\composer\composer.phar …`.
> La base local es la de XAMPP (`127.0.0.1:3306`, usuario `root` sin clave).

## Instalación

```bash
composer install
cp .env.example .env
php artisan key:generate
```

Crea la base (por defecto `app_bot`) y revisa en `.env`:

| Variable | Para qué |
|---|---|
| `DB_*` | Conexión a la base |
| `API_KEY` | Clave que usa el proyecto principal para llamar a `/api/*`. Genera una con `php -r "echo bin2hex(random_bytes(32));"` y pon **la misma** en el proyecto principal. Vacía = la API rechaza todo |
| `ACCESO_LOCAL` | Solo desarrollo: `true` deja entrar al editor sin pasar por el proyecto principal. **Solo funciona con `APP_ENV=local`**; en producción, `false` |

Después:

```bash
php artisan migrate
npm install
npm run build
```

`.npmrc` lleva `ignore-scripts=true` a propósito (los paquetes no ejecutan scripts al instalarse): no lo quites.

## Ejecutar

```bash
php artisan serve              # http://127.0.0.1:8000
npm run dev                    # opcional: recarga el CSS/JS al editarlo
```

Si corre junto al proyecto principal en la misma máquina, usa otro puerto: `php artisan serve --port=8001`.

Para entrar en local, pon `ACCESO_LOCAL=true` (y `APP_ENV=local`) y abre `/flujos`. En producción se entra solo
desde el proyecto principal (ver «Cómo entra un administrador»).

## Pruebas

```bash
php artisan test               # PHP: controladores, API, acceso (SQLite en memoria)
npm test                       # JS: la lógica del editor (resources/js/flujo/*)
```

## Cómo entra un administrador

Los administradores no tienen usuario en app-bot: entran desde el proyecto principal, que responde por ellos.

1. El servidor del proyecto principal pide un pase: `POST /api/accesos` con la API key y
   `{ "usuario_id": 7, "nombre": "Ana Pérez" }`.
2. app-bot responde `201 { "url": ".../entrar/{pase}", "vence_en": … }`. El pase vale **una vez** y **2 minutos**.
3. El proyecto principal redirige el navegador a esa `url`; app-bot abre la sesión y muestra la lista de bots.

«Salir» (barra superior) cierra la sesión.

## API

Todas las rutas llevan la cabecera `Authorization: Bearer <API_KEY>`. Sin ella, o con otra clave: `401`.

| Método y ruta | Respuesta |
|---|---|
| `GET /api/estado` | `{ "ok": true }`: para probar la conexión y la clave |
| `POST /api/accesos` | Pase de un solo uso para un administrador (ver arriba) |
| `GET /api/bots` | `{ "bots": [ { "slug", "nombre", "actualizado_en" } ] }`: solo los **activos** |
| `GET /api/bots/{slug}` | `{ "FLUJO": {…}, "_bot": { "slug", "nombre", "actualizado_en" } }` con lo último guardado. Inactivo: `404`. Guardado con fallas: `422` con la lista de `errores` |

Ejemplo:

```bash
curl -H "Authorization: Bearer $API_KEY" http://127.0.0.1:8001/api/bots
```

La aplicación **copia** el JSON al elegir el bot: lo que se edite después en app-bot le llega solo cuando lo
vuelva a aplicar. Desactivar un bot lo quita de la lista, pero no cambia las aplicaciones que ya lo usan.

## Dónde está cada cosa

| Ruta | Qué hay |
|---|---|
| `app/Http/Controllers/FlujoController.php` | Lista, crear, editar, guardar, activar, importar, exportar, duplicar, borrar |
| `app/Http/Controllers/AccesoController.php` | Pase de un solo uso (`/api/accesos`, `/entrar/{pase}`) y salir |
| `app/Http/Controllers/Api/BotController.php` | `GET /api/bots` y `/api/bots/{slug}` |
| `app/Http/Middleware/` | `RequiereAcceso` (sesión del editor) y `RequiereApiKey` (API) |
| `app/Services/ValidadorFlujo.php` | Lo que rompería el bot; se revisa al activar y al entregar por la API |
| `resources/js/editor.js` | El editor (lienzo Drawflow, paneles, guardar) |
| `resources/js/flujo/` | Lógica pura del editor, con pruebas: modelo, dibujo, orden, revisión, simulador… |
| `tests/Feature/`, `tests/js/` | Pruebas de PHP y de JS |
| `docs/PLAN.md` | Decisiones, reglas del motor y pasos |
| `docs/QA-flujos.md` | Pruebas manuales de flujos y hallazgos |

## Reglas que no hay que romper

- El JSON `FLUJO` es la fuente de verdad; el lienzo (Drawflow) es solo la vista. Se conservan los campos que el
  editor no conoce (`keywords`, `departamento`…).
- Los **identificadores** de los pasos (las claves de `FLUJO`) los guarda el bot en cada conversación: no se
  renombran una vez que el bot está activo, y los del sistema (`start`, `end`, `esperando_agente`…) nunca.
  Lista completa en [docs/PLAN.md §4](docs/PLAN.md).
- Código, nombres y textos de la interfaz en español.
