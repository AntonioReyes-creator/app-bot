# Plan del servicio de flujos (app-bot)

> Documento de traspaso entre sesiones. Léelo completo antes de seguir.
> Última actualización: 2026-10-16 · Estado: **etapa 1, pasos 1a, 1b y 1c terminados**; sigue el **1d** (importar).

## 1. Objetivo

Un **servicio** (este repo) para diseñar bots de WhatsApp de forma **visual** (cajas y flechas) que,
al publicar, genere el JSON con clave `FLUJO` que ya usa el proyecto existente. El proyecto existente
se conecta por **API** a este servicio, recibe el JSON, lo guarda y el bot lo empieza a usar.

```
app-bot (este servicio, Laravel 13)              proyecto existente (Laravel 8, en producción)
 Editor Drawflow ─▶ borrador ─▶ [Publicar]        D:\WORK_REMOTE\REMOTE-HOLA_CLIENTE\
 validar ─▶ traducir a FLUJO ─▶ versión             whatsapp_business_gupshup_app\
 API REST ──────── JSON {"FLUJO":{...}} ───────▶     whatsapp_business_gupshup_app
                                                   storage/app/flujos/*.json ─▶ bot
```

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Dónde se edita el flujo | Solo dentro de este servicio |
| Proyectos conectados | Por ahora **uno** (el principal). Si funciona, se suman los demás |
| Comunicación | **Pull** para pruebas locales (el proyecto existente pide el JSON). **Push** al desplegar (el servicio envía al publicar) |
| Versión de Laravel del proyecto existente | **No se actualiza** para esto (PHP 7.4 + Laravel 8, 38 mil líneas, 9 tests: proyecto aparte) |
| Stack del servicio | Laravel 13.37 · PHP 8.3 · MariaDB 10.4 local (XAMPP, base `app_bot`; antes SQLite) · Bootstrap 5.3 · Drawflow 0.0.60 · Vite |
| Fuente de verdad | Se guarda el **JSON `FLUJO`** tal cual; las posiciones del lienzo van aparte (`layout`). Drawflow es solo la vista |
| Git | **El usuario hace los commits**; Claude solo propone el mensaje al terminar cada proceso. Sin `git commit` ni `git push` por parte de Claude |

## 3. El formato `FLUJO` (contrato con el bot)

```json
{ "FLUJO": {
    "start": { "message": "...", "options": { "1": { "text": "...", "next_state": "otro_estado" } } },
    "paso":  { "message": "...", "next_state": "otro_estado" },
    "end":   { "message": "..." }
} }
```

Tipos de caja que necesita el editor:

1. **Menú**: `message` + `options` (cada opción = una salida).
2. **Paso directo**: `message` + `next_state` sin opciones.
3. **Final**: solo `message`.
4. **Pedir corte/departamento**: estados `*_pedir_corte` (lógica escrita en PHP, ver §4).
5. **Sistema**: nombre bloqueado (texto editable, nombre no).

Detalles que hay que soportar:

- Placeholder `{{departamentos}}` en mensajes (el motor lo reemplaza por la lista de cortes).
- Claves de opción **no numéricas** (`"salir"`): el motor no las muestra en el menú (opción oculta).
- Campos extra en opciones: `departamento`, `keywords` (los usa `MenuMatcher`). Hay que **conservarlos** al importar/exportar.
- Destinos muy usados (`end_or_menu` recibe 49 flechas en el flujo PJ, `mas_informacion` 34):
  mostrarlos como "atajo" en la caja, no como flecha larga, o el lienzo será ilegible.

## 4. Restricciones del motor existente (verificadas en su código)

Rutas relativas a `...\whatsapp_business_gupshup_app\whatsapp_business_gupshup_app\`:

- `app/Services/WhatsApp/FlujoBotService.php`: solo exige la clave `FLUJO` (`catalogo()`, `guardarSubida()` l.528);
  `asignar()` l.415 asigna un flujo a una aplicación; `registrarVigencia()` l.274 guarda versiones.
  Claves extra fuera de `FLUJO` (p. ej. `_editor`) son ignoradas por el motor.
- `app/Http/Controllers/WhatsAppController.php` tiene **nombres de estado escritos a mano**. El editor NO debe permitir renombrarlos:
  `start`, `end`, `end_or_menu`, `esperando_agente` (y prefijo `esperando_agente*`, l.3430), `mas_informacion`,
  `seleccionar_departamento`, `encuesta_inicio`, `encuesta_fin`, `verificacion_numero`,
  `*_pedir_corte` (l.2658–3371), `*_confirmar`, `derivar_*`, incluido el typo `derivar_expedientes_cofirmar` (l.2885).
- `*_pedir_corte`: el controlador valida la corte, guarda `conversacion->departamento` y envía **su propio mensaje**
  ("Usted ingresó: X…"), ignorando el `message` del `*_confirmar` en ese paso.
- Mapa oculto (l.1695, modo "sin jurisdicción"): `*_pedir_corte` → `derivar_*`. Por eso `derivar_notificaciones`
  parece huérfano en el JSON pero **sí se usa**.
- `renderEstado()` l.1664: arma el menú como `"\n{clave}. {text}"` y salta claves no numéricas.

## 5. Flujos reales para probar

En `D:\WORK_REMOTE\REMOTE-HOLA_CLIENTE\whatsapp_business_gupshup_app\flujos\`:

| Archivo | Estados | Alcanzables desde `start` | Huérfanos |
|---|---|---|---|
| `flujo2poder_juidicial.json` | 95 | 87 | 8 (`alimentos_confirmar`, `alimentos_links`, `asesor_general`, `derivar_notificaciones`*, `esperando_agente_notificaciones`, `esperando_agente_quejas`, `no_entendi`, `seleccionar_departamento`*) |
| `flujo1_onpe_2026.json` | 42 | 12 | 30 (estados `EG/EMC/Otras consultas/Servicios - …` y `end_or_menu`) |

\* usados por el código PHP aunque no tengan flechas en el JSON.

Errores de contenido detectados en el flujo PJ (para que el validador/vista previa los muestre):
`derivar_expedientes_agente` dice "NOTIFICACIONES"; `derivar_orient_virtual` tiene `"nPor favor"` (falta `\`);
`cert_menu` abre con `"9. Certificado Judicial*"` (falta `*` inicial); `start` tiene `11` y `salir` que hacen lo mismo.
En ONPE hay dos estados casi iguales: `"Servicios - Información General"` y `"Servicios - Informacion general"`.

## 6. Pasos

### Etapa 1: Importar y visualizar (solo lectura)

- [x] **1a** Proyecto Laravel 13 + SQLite (commit `ca0cca6`).
- [x] **1b** Quitar Tailwind; Bootstrap 5 + Drawflow; layout `resources/views/layouts/app.blade.php`.
- [x] **1c** Migraciones y modelos:
  - `flujos`: `id`, `nombre`, `slug` (único), timestamps.
  - `flujo_versiones`: `id`, `flujo_id` (FK), `numero`, `estado` (`borrador`|`publicada`), `contenido` (JSON con `FLUJO`),
    `layout` (JSON nullable, posiciones), `publicada_en` (nullable), timestamps.
  - Modelos `Flujo` (hasMany versiones) y `FlujoVersion` (casts `array` en `contenido` y `layout`).
  - Probar: `php artisan migrate` y crear un registro con tinker.
- [ ] **1d** Importar (`FlujoController@store`, formulario con archivo):
  - Quitar BOM, `json_decode`, exigir `FLUJO` como objeto (misma regla que `FlujoBotService`).
  - Crear `Flujo` + `FlujoVersion` nº1 en estado `borrador`.
  - Probar: JSON válido (PJ, ONPE), archivo no JSON (error), JSON sin `FLUJO` (rechazo con mensaje claro).
- [ ] **1e** Lista de flujos (`index`) y visor (`show`) en Blade + Bootstrap.
- [ ] **1f** `resources/js/visor.js`, el traductor `FLUJO` → Drawflow:
  - 1 nodo por estado; 1 salida por opción (+1 si tiene `next_state`); 1 conexión por `next_state`.
  - Posición automática: recorrido en anchura desde `start` (columna = distancia); huérfanos en columna aparte.
  - Colores por tipo: menú, paso, final, sistema, huérfano. Panel con totales (estados / alcanzables / huérfanos).
  - Probar: PJ → 95 cajas, 87 alcanzables, 8 huérfanas; ONPE → 42 / 12 / 30; la opción `salir` aparece.
- [ ] Proponer al usuario el mensaje de commit "Etapa 1".

### Etapa 2: Edición

- Crear, borrar, mover y conectar cajas; editar nombre, mensaje y opciones (modal Bootstrap).
- Bloquear el renombrado de los estados del sistema (§4).
- Guardar borrador (contenido + layout) sin perder campos extra (`keywords`, `departamento`).
- Probar: importar → editar → guardar → recargar y ver lo mismo.

### Etapa 3: Traductor inverso, validador y versiones

- Drawflow → `FLUJO` (inverso de 1f). Prueba de ida y vuelta: importar PJ, exportar sin cambios ⇒ JSON equivalente.
- Validador: estado `start` presente, destinos inexistentes, huérfanos, nombres de sistema renombrados,
  opciones sin conectar, `\n` mal escritos, `*` sin cerrar.
- "Publicar": valida → crea versión `publicada` (inmutable) → descarga el JSON.

### Etapa 4: API pull (pruebas locales)

- Servicio: `GET /api/flujos/{slug}/publicado` con **token** (Sanctum o API key en `.env`). Respuesta: `{"FLUJO": …}`.
- Proyecto existente (único cambio en producción, hecho con cuidado):
  - Separar en `FlujoBotService` la parte "validar y guardar contenido" de `guardarSubida()` (hoy espera un archivo subido).
  - Comando `php artisan flujo:traer {slug}` con `Http::withToken()->get(...)` → guardar en `storage/app/flujos/` → opcional `asignar()`.
- Ejecución local en paralelo: este servicio con `C:\tools\php83\php.exe artisan serve --port=8001`; el existente con su PHP 7.4.

### Etapa 5: Push (al desplegar)

- Endpoint en el proyecto existente que recibe el JSON, protegido con token propio.
- "Publicar" en el servicio hace `POST`; si falla, la versión queda "pendiente de envío" con reintento.
- Base del servidor: local ya es MariaDB (`DB_CONNECTION=mariadb`). **Si producción usa MySQL 8**, su tipo `JSON` nativo reordena las claves (cambiaría el orden de las opciones del menú): comprobarlo y, si pasa, cambiar `contenido`/`layout` a `longText`. MariaDB no reordena (verificado).

## 7. Preguntas abiertas para el usuario

1. Los 30 estados sueltos de ONPE (`EMC 2025 - …`, `Otras consultas - …`): ¿son categorías para reportes o restos para borrar?
2. `convertir_flujo.php` (en el proyecto existente) convierte un "generador gráfico" con marcadores `${{estado}}`. ¿Qué herramienta era?
3. Más adelante (no ahora): llevar la lógica de `*_pedir_corte` del PHP al JSON (`"tipo": "pedir_departamento"`). Implica cambiar el motor.
