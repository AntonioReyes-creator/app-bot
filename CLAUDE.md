# app-bot: servicio de flujos de bot

Editor visual de bots de WhatsApp que publica el JSON `FLUJO` para el proyecto existente
(`D:\WORK_REMOTE\REMOTE-HOLA_CLIENTE\whatsapp_business_gupshup_app\whatsapp_business_gupshup_app`, Laravel 8, solo lectura salvo la etapa 4).

**Antes de trabajar, lee [docs/PLAN.md](docs/PLAN.md)**: contexto, decisiones, restricciones del motor y los pasos pendientes.
Al terminar cada paso, marca la casilla en el plan y actualiza la línea "Estado".

## Entorno (Windows)

- PHP: usar **`C:\tools\php83\php.exe`**. El `php` del PATH es 7.4 y no sirve; Herd 8.4 tira warnings; Laragon 8.4 no tiene php.ini.
- Composer: `C:\tools\php83\php.exe C:\laragon\bin\composer\composer.phar ...`
- Frontend: `npm run build` (o `npm run dev`). `.npmrc` tiene `ignore-scripts=true`: no quitarlo.
- Servidor local: `C:\tools\php83\php.exe artisan serve` (usar `--port=8001` cuando corra junto al proyecto existente).
- Base de datos local: SQLite (`database/database.sqlite`).

## Convenciones

- Stack: Laravel 13 + Blade + **Bootstrap 5** (no Tailwind) + **Drawflow** + JS sin framework.
- Código, nombres y textos de la interfaz en español, como el proyecto existente (`Flujo`, `FlujoVersion`, `contenido`, `layout`).
- El JSON `FLUJO` es la fuente de verdad; Drawflow es solo la vista. Conservar campos desconocidos al importar/exportar.
- Nunca permitir renombrar los estados del sistema listados en docs/PLAN.md §4.
- Git: un commit local por paso. **No hacer push** salvo que el usuario lo pida.
