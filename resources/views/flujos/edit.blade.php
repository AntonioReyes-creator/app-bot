@extends('layouts.app')

@section('titulo', $flujo->nombre)

@section('contenido')
    <div class="d-flex justify-content-between align-items-center mb-2">
        <div>
            <h1 class="h3 mb-0">{{ $flujo->nombre }}</h1>
            <small class="text-body-secondary">
                <code>{{ $flujo->slug }}</code> · versión {{ $version->numero }}
                <span class="badge text-bg-{{ $version->estado === 'publicada' ? 'success' : 'secondary' }}">{{ $version->estado }}</span>
            </small>
        </div>
        <div class="d-flex align-items-center gap-3">
            <span id="resumen" class="text-body-secondary"></span>
            <span id="sin-guardar" class="badge text-bg-warning d-none">Cambios sin guardar</span>
            <span id="guardado" class="text-success small d-none"></span>
            <button type="button" id="guardar" class="btn btn-primary" data-url="{{ route('flujos.guardar', $flujo) }}"
                    title="Guardar el borrador (Ctrl+S)">Guardar</button>
            <a href="{{ route('flujos.index') }}" class="btn btn-outline-secondary">Volver</a>
        </div>
    </div>

    {{-- Barra de herramientas: los botones solo llevan data-*; editor.js hace el resto. --}}
    {{-- Barra de herramientas. Los estados normales se crean desde las bolitas de cada caja. --}}
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="abrir-sistema"
                title="Ver, añadir, editar o quitar los estados que usa el código del bot">&#128274; Estados del sistema</button>
        <button type="button" class="btn btn-sm btn-outline-dark" id="ordenar"
                title="Recoloca las cajas como un árbol de izquierda a derecha y encuadra todo el flujo">&#8862; Ordenar</button>
        <span id="aviso" class="badge text-bg-danger d-none" role="status"></span>
        <span class="text-body-secondary small ms-auto">
            Arrastra para mover · <strong>doble clic</strong> o &#9998; para editar · clic en una <strong>bolita</strong> para conectar o crear · <kbd>Supr</kbd> borra la caja o línea seleccionada · <kbd>Ctrl</kbd>+rueda: zoom
        </span>
    </div>

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
                    <h2 class="modal-title h5" id="modal-sistema-titulo">Estados del sistema</h2>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                </div>
                <div class="modal-body">
                    <p class="small text-body-secondary">
                        El motor del bot los reconoce por su nombre (aunque no tengan flechas), por eso su nombre no se puede cambiar.
                    </p>

                    <h3 class="h6">Básicos</h3>
                    <table class="table table-sm align-middle">
                        <tbody id="sistema-basicos"></tbody>
                    </table>

                    <details class="mt-3" id="sistema-avanzado">
                        <summary class="h6 mb-2">Avanzado: lógica del motor actual</summary>
                        <p class="small text-body-secondary">
                            Estados con comportamiento propio en el motor actual (pensado para el Poder Judicial: cortes, encuesta,
                            derivaciones). Úsalos solo si tu bot necesita esa lógica.
                        </p>
                        <table class="table table-sm align-middle">
                            <tbody id="sistema-avanzados"></tbody>
                        </table>

                        <h4 class="h6 mt-3">Por área o trámite</h4>
                        <table class="table table-sm align-middle">
                            <tbody id="sistema-patron-presentes"></tbody>
                        </table>
                    <form id="form-patron" class="row g-2 align-items-start" novalidate>
                        <div class="col-md-5">
                            <select id="patron-tipo" class="form-select form-select-sm"></select>
                        </div>
                        <div class="col-md-4">
                            <input type="text" id="patron-parte" class="form-control form-control-sm font-monospace" autocomplete="off" placeholder="ej. notificaciones">
                            <div class="invalid-feedback" id="patron-error"></div>
                        </div>
                        <div class="col-md-3">
                            <button type="submit" class="btn btn-sm btn-primary w-100">Añadir</button>
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
                        <label for="estado-nombre" class="form-label">Nombre</label>
                        <input type="text" id="estado-nombre" class="form-control font-monospace" autocomplete="off">
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
                            <span id="mensaje-ayuda">Selecciona texto y pulsa un botón para darle formato.</span>
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

                    <div id="seccion-paso" class="form-text mb-3">
                        El destino se elige en el lienzo: clic en la bolita de «sigue».
                        Si el siguiente estado no pide datos, el bot envía los dos mensajes juntos.
                    </div>

                    <div id="seccion-menu">
                        <table class="table table-sm align-middle mb-2">
                            <thead>
                                <tr><th style="width: 7rem">Nº / clave</th><th>Texto de la opción</th><th></th></tr>
                            </thead>
                            <tbody id="filas-opciones"></tbody>
                        </table>
                        <div class="text-danger small mb-2 d-none" id="opciones-error"></div>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="agregar-opcion">+ Opción</button>
                        <div class="form-text">
                            Cada opción tiene su bolita en el lienzo: haz clic en ella para conectarla o crear el siguiente estado.
                            Una clave que no es número (ej. <code>salir</code>) no siempre se lista en el menú, pero el usuario puede escribirla.
                        </div>
                    </div>

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
                    <div class="form-text mt-2">
                        Las opciones con clave que no es número (ej. <code>salir</code>) no se listan en el menú.
                    </div>
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

    {{-- Datos para editor.js: el FLUJO guardado y las posiciones de las cajas. --}}
    <script type="application/json" id="datos-flujo">@json(['contenido' => $version->contenido, 'layout' => $version->layout])</script>
@endsection

@push('scripts')
    @vite('resources/js/editor.js')
@endpush
