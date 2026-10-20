@extends('layouts.app')

@section('titulo', $flujo->nombre)

@section('contenido')
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
        <div class="d-flex align-items-start gap-2">
            {{-- Volver: flecha a la altura del título (no del bloque título + slug), lejos de Guardar. --}}
            <a href="{{ route('flujos.index') }}" class="btn btn-outline-secondary btn-volver"
               title="Volver a mis flujos" aria-label="Volver a mis flujos">&larr;</a>
            <div>
                <h1 class="h3 mb-0">{{ $flujo->nombre }}</h1>
                <small class="text-body-secondary">
                    <code>{{ $flujo->slug }}</code> · versión {{ $version->numero }}
                    <span class="badge text-bg-{{ $version->estado === 'publicada' ? 'success' : 'secondary' }}">{{ $version->estado }}</span>
                </small>
            </div>
        </div>
        <div class="d-flex align-items-center gap-3">
            <span id="resumen" class="text-body-secondary"></span>
            {{-- Semáforo del diseño (revision.js): ✅ bien cerrado · ⚠ por revisar · ⛔ falla. Clic: ver los avisos. --}}
            <button type="button" id="diseno" class="badge diseno border-0"></button>
            <span id="sin-guardar" class="badge text-bg-warning d-none">Cambios sin guardar</span>
            <span id="guardado" class="text-success small d-none"></span>
            <button type="button" id="exportar" class="btn btn-outline-secondary" data-url="{{ route('flujos.exportar', $flujo) }}"
                    data-archivo="{{ $flujo->slug }}.json" title="Descargar como .json">&#11015; Exportar</button>
            {{-- Acción principal: al final. --}}
            <button type="button" id="guardar" class="btn btn-primary" data-url="{{ route('flujos.guardar', $flujo) }}"
                    title="Guardar el borrador (Ctrl+S)">Guardar</button>
        </div>
    </div>

    {{-- Barra de herramientas, de izquierda a derecha como se trabaja: recorrer (su panel se abre a la izquierda) ·
         construir · ver el lienzo · probar (su panel se abre a la derecha). Los botones solo llevan id/data-*;
         editor.js hace el resto. Los estados normales se crean desde las bolitas de cada caja. --}}
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="documento-abrir"
                title="Recorrer el flujo paso a paso (se abre a la izquierda)">&#128196; Recorrer</button>
        <div class="vr"></div>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="abrir-sistema"
                title="Pasos que el bot ya trae listos">&#129513; Pasos especiales</button>
        <div class="vr"></div>
        {{-- Qué hace arrastrar el fondo: mover la vista o seleccionar cajas con un rectángulo. --}}
        <div class="btn-group btn-group-sm" role="group" aria-label="Arrastrar el fondo">
            <button type="button" class="btn btn-outline-secondary active" data-modo="mover" aria-pressed="true" title="Arrastrar el fondo mueve la vista">&#9995; Mover</button>
            <button type="button" class="btn btn-outline-secondary" data-modo="seleccionar" aria-pressed="false" title="Arrastrar el fondo selecciona cajas">&#11034; Seleccionar</button>
        </div>
        {{-- Solo cambia la vista: cada caja en una línea, con viñeta para desplegarla (editor.js, `comprimido`). --}}
        <button type="button" class="btn btn-sm btn-outline-secondary" id="comprimir" aria-pressed="false">&#8661; Comprimir</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="ordenar"
                title="Acomodar las cajas en forma de árbol">&#8862; Ordenar</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="copias" aria-pressed="false"
                title="Ver copias de los pasos compartidos junto a cada caja">&#10697; Copias</button>
        <span id="aviso" class="badge text-bg-danger d-none" role="status"></span>
        <div class="ms-auto d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="atajos" title="Atajos del teclado y del ratón">&#9000; Atajos</button>
            <button type="button" class="btn btn-sm btn-success" id="probar"
                    title="Chatear con el bot como si fueras un cliente (se abre a la derecha)">&#9654; Probar el bot</button>
        </div>
    </div>
    {{-- Contenido del botón ⌨ Atajos (popover, editor.js). --}}
    <template id="atajos-lista">
        <ul class="list-unstyled small mb-0">
            <li><strong>Doble clic</strong> en una caja: editar</li>
            <li><strong>Clic derecho</strong> en una bolita: crear o conectar</li>
            <li><kbd>Ctrl</kbd> + rueda: zoom</li>
            <li>Rueda apretada: mover la vista</li>
            <li><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd>: copiar y pegar pasos</li>
            <li><kbd>Supr</kbd>: borrar lo seleccionado</li>
            <li><kbd>Esc</kbd>: quitar la selección</li>
            <li><kbd>Ctrl</kbd>+<kbd>S</kbd>: guardar</li>
        </ul>
    </template>

    {{-- El marco lleva el estilo; Drawflow va en el div interior SIN clases propias: decide si arrastrar
         el lienzo mirando solo la primera clase del elemento pulsado (debe ser "parent-drawflow").
         El zoom va fuera del div de Drawflow para que sus clics no muevan el lienzo. --}}
    <div class="lienzo">
        <div id="lienzo"></div>
        <div class="btn-group btn-group-sm controles-zoom shadow-sm" role="group" aria-label="Zoom">
            <button type="button" class="btn btn-light" id="zoom-menos" title="Alejar">&minus;</button>
            <button type="button" class="btn btn-light font-monospace" id="zoom-nivel" title="Volver al 100 %">100%</button>
            <button type="button" class="btn btn-light" id="zoom-mas" title="Acercar">+</button>
            <button type="button" class="btn btn-light" id="zoom-ajustar" title="Ver todo el flujo">&#10530; Ajustar</button>
        </div>
    </div>

    {{-- Menú de una bolita (salida): editor.js lo rellena y lo coloca junto a la bolita pulsada. --}}
    <div id="menu-salida" class="dropdown-menu shadow menu-salida"></div>

    {{-- Estados del sistema: los que hay en el flujo y los que se pueden añadir. editor.js rellena las listas. --}}
    <div class="modal fade" id="modal-sistema" tabindex="-1" aria-labelledby="modal-sistema-titulo" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title h5" id="modal-sistema-titulo">&#129513; Pasos especiales del bot</h2>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                </div>
                <div class="modal-body">
                    <p class="small text-body-secondary">Vienen listos: añádelos y conéctalos desde una opción.</p>

                    <h3 class="h6">Los más usados</h3>
                    <table class="table table-sm align-middle">
                        <tbody id="sistema-basicos"></tbody>
                    </table>

                    <details class="mt-3" id="sistema-avanzado">
                        <summary class="h6 mb-2">Más pasos especiales (avanzado)</summary>
                        <p class="small text-body-secondary">Úsalos solo si tu equipo técnico te lo pide.</p>
                        <table class="table table-sm align-middle">
                            <tbody id="sistema-avanzados"></tbody>
                        </table>

                        <h4 class="h6 mt-3">Pasos para un área concreta</h4>
                        <table class="table table-sm align-middle">
                            <tbody id="sistema-patron-presentes"></tbody>
                        </table>
                    <form id="form-patron" class="row g-2 align-items-start" novalidate>
                        <div class="col-md-5">
                            <select id="patron-tipo" class="form-select form-select-sm"></select>
                        </div>
                        <div class="col-md-4">
                            <input type="text" id="patron-parte" class="form-control form-control-sm font-monospace" autocomplete="off" placeholder="nombre del área, ej. notificaciones">
                            <div class="invalid-feedback" id="patron-error"></div>
                        </div>
                        <div class="col-md-3">
                            <button type="submit" class="btn btn-sm btn-primary w-100">Añadir al flujo</button>
                        </div>
                        <div class="col-12 form-text" id="patron-ayuda"></div>
                    </form>
                    </details>
                </div>
            </div>
        </div>
    </div>

    {{-- Modal para editar una caja (doble clic o lápiz). editor.js lo rellena y aplica los cambios al modelo. --}}
    <div class="modal fade" id="modal-estado" tabindex="-1" aria-labelledby="modal-estado-titulo" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <form class="modal-content" id="form-estado" novalidate>
                <div class="modal-header">
                    <h2 class="modal-title h5" id="modal-estado-titulo">Editar estado</h2>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                </div>
                <div class="modal-body">
                  <div class="row g-4">
                  <div class="col-lg-7">
                    <div class="mb-3">
                        <label for="estado-titulo" class="form-label">Nombre visible</label>
                        <input type="text" id="estado-titulo" class="form-control" maxlength="80" autocomplete="off">
                        <div class="form-text">Cómo lo ves tú en el editor; el bot no lo usa.</div>
                    </div>

                    <div class="mb-3">
                        <label for="estado-nombre" class="form-label">&#128274; Identificador <span class="text-body-secondary small">(lo usa el bot)</span></label>
                        <input type="text" id="estado-nombre" class="form-control font-monospace bg-body-tertiary" readonly tabindex="-1">
                        <div class="invalid-feedback" id="estado-nombre-error"></div>
                        <div class="form-text" id="estado-nombre-ayuda"></div>
                    </div>

                    <div class="mb-3">
                        <label for="estado-mensaje" class="form-label">Mensaje</label>
                        {{-- Barra de formato: solo lo que WhatsApp entiende. editor.js aplica cada botón (data-formato / data-lineas). --}}
                        <div class="btn-toolbar gap-1 mb-1 barra-formato" role="toolbar" aria-label="Formato del mensaje">
                            <div class="btn-group btn-group-sm">
                                <button type="button" class="btn btn-outline-secondary" data-formato="negrita" title="Negrita (*texto*)"><strong>B</strong></button>
                                <button type="button" class="btn btn-outline-secondary" data-formato="cursiva" title="Cursiva (_texto_)"><em>I</em></button>
                                <button type="button" class="btn btn-outline-secondary" data-formato="tachado" title="Tachado (~texto~)"><s>S</s></button>
                                <button type="button" class="btn btn-outline-secondary font-monospace" data-formato="mono" title="Monoespaciado (```texto```)">&lt;/&gt;</button>
                            </div>
                            <div class="btn-group btn-group-sm">
                                <button type="button" class="btn btn-outline-secondary" data-lineas="vinetas" title="Viñetas (- )">&bull; Lista</button>
                                <button type="button" class="btn btn-outline-secondary" data-lineas="numerada" title="Lista numerada (1. )">1. Lista</button>
                                <button type="button" class="btn btn-outline-secondary" data-lineas="cita" title="Cita (> )">&#10077; Cita</button>
                            </div>
                            <div class="dropdown">
                                <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown"
                                        data-bs-auto-close="outside" title="Insertar emoji">&#128512; Emoji</button>
                                <div class="dropdown-menu p-2 selector-emojis" id="selector-emojis"></div>
                            </div>
                        </div>
                        <textarea id="estado-mensaje" class="form-control" rows="6"></textarea>
                        <div class="d-flex justify-content-between form-text">
                            <span id="mensaje-ayuda">Selecciona texto y elige un formato.</span>
                            <span id="mensaje-contador"></span>
                        </div>
                    </div>

                    <label class="form-label d-block">¿Qué hace después del mensaje?</label>
                    <div class="btn-group mb-3" role="group">
                        <input type="radio" class="btn-check" name="estado-tipo" id="tipo-final" value="final">
                        <label class="btn btn-outline-danger" for="tipo-final">Nada (final)</label>
                        <input type="radio" class="btn-check" name="estado-tipo" id="tipo-paso" value="paso">
                        <label class="btn btn-outline-success" for="tipo-paso">Continuar a otro estado</label>
                        <input type="radio" class="btn-check" name="estado-tipo" id="tipo-menu" value="menu">
                        <label class="btn btn-outline-primary" for="tipo-menu">Mostrar un menú</label>
                    </div>

                    <div id="seccion-paso" class="form-text mb-3">Conecta el siguiente paso en el lienzo, desde la bolita «sigue».</div>

                    <div id="seccion-menu">
                        <table class="table table-sm align-middle mb-2">
                            <thead>
                                <tr><th style="width: 7rem">Nº / clave</th><th>Texto de la opción</th>
                                    <th style="width: 32%" title="Si el cliente escribe una de estas palabras, se elige esta opción">Palabras clave <span class="text-body-secondary fw-normal small">(opcional)</span></th><th></th></tr>
                            </thead>
                            <tbody id="filas-opciones"></tbody>
                        </table>
                        <div class="text-danger small mb-2 d-none" id="opciones-error"></div>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="agregar-opcion">+ Opción</button>
                        <div class="form-text">Conecta cada opción desde su bolita en el lienzo.</div>
                    </div>

                    {{-- Avisos que no impiden aplicar (QA): final que deja al bot mudo, paso que pide datos, comandos… --}}
                    <div class="alert alert-warning small mt-3 mb-0 d-none" id="estado-avisos" role="status"></div>
                    <div class="alert alert-danger mt-3 mb-0 d-none" id="estado-error"></div>
                  </div>

                  {{-- Vista previa: cómo verá el mensaje el usuario en WhatsApp (formato + menú como lo arma el bot). --}}
                  <div class="col-lg-5">
                    <div class="vista-whatsapp">
                        <div class="vista-whatsapp-cabecera">Vista previa en WhatsApp</div>
                        <div class="vista-whatsapp-chat">
                            <div class="vista-whatsapp-burbuja" id="vista-previa"></div>
                        </div>
                    </div>
                    <div class="form-text mt-2">Las opciones con letras (ej. <code>salir</code>) no salen en el menú.</div>
                  </div>
                  </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Aplicar</button>
                </div>
            </form>
        </div>
    </div>

    {{-- Documento: recorrer el flujo paso a paso, a la izquierda. Empieza en start; cada opción se despliega debajo. --}}
    <div class="offcanvas offcanvas-start documento" tabindex="-1" id="documento" data-bs-scroll="true" data-bs-backdrop="false"
         aria-labelledby="documento-titulo">
        <div class="offcanvas-header border-bottom py-2">
            <h2 class="offcanvas-title fs-6 mb-0" id="documento-titulo">&#128196; Recorrer el flujo</h2>
            <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" id="documento-copiar" title="Copiar todo el flujo como texto">Copiar</button>
            <button type="button" class="btn btn-sm btn-outline-secondary ms-1 me-2" id="documento-descargar" title="Descargar todo el flujo como texto (.md)">Descargar</button>
            <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
        </div>
        <div class="nav-barra px-3 py-2 border-bottom" id="documento-barra"></div>
        <div class="offcanvas-body small" id="documento-contenido"></div>
    </div>

    {{-- Simulador: conversación con el bot (lo que respondería el motor), usando el flujo tal como está en el editor. --}}
    <div class="offcanvas offcanvas-end simulador" tabindex="-1" id="simulador" data-bs-scroll="true" data-bs-backdrop="false"
         aria-labelledby="simulador-titulo">
        <div class="offcanvas-header vista-whatsapp-cabecera">
            <h2 class="offcanvas-title fs-6 mb-0" id="simulador-titulo">&#9654; Probar el flujo</h2>
            <button type="button" class="btn btn-sm btn-light ms-auto me-2" id="simulador-reiniciar">&#8634; Reiniciar</button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
        </div>
        <div class="offcanvas-body vista-whatsapp-chat d-flex flex-column gap-2" id="simulador-chat" aria-live="polite"></div>
        <div class="border-top p-2 bg-body">
            <div class="small text-body-secondary mb-1">
                Estado actual: <button type="button" class="btn btn-link btn-sm p-0 align-baseline" id="simulador-estado"
                                       title="Ir a la caja en el lienzo"></button>
            </div>
            <div class="d-flex flex-wrap gap-1 mb-2" id="simulador-opciones"></div>
            <form id="simulador-form" class="input-group input-group-sm">
                <input type="text" class="form-control" id="simulador-texto" placeholder="Escribe como la persona (ej. 1)"
                       autocomplete="off" aria-label="Mensaje de la persona">
                <button class="btn btn-success" type="submit">Enviar</button>
            </form>
            <div class="form-text">Prueba lo que ves en pantalla, aunque no esté guardado.</div>
        </div>
    </div>

    {{-- Datos para editor.js: el FLUJO guardado y las posiciones de las cajas. --}}
    <script type="application/json" id="datos-flujo">@json(['contenido' => $version->contenido, 'layout' => $version->layout])</script>
@endsection

@push('scripts')
    @vite('resources/js/editor.js')
@endpush
