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
            <span id="sin-guardar" class="badge text-bg-warning d-none" title="El guardado llega en el paso 2c">Cambios sin guardar</span>
            <a href="{{ route('flujos.index') }}" class="btn btn-outline-secondary">Volver</a>
        </div>
    </div>

    {{-- Barra de herramientas: los botones solo llevan data-*; editor.js hace el resto. --}}
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span class="text-body-secondary small">Añadir:</span>
        <button type="button" class="btn btn-sm btn-outline-primary" data-agregar="menu">+ Menú</button>
        <button type="button" class="btn btn-sm btn-outline-success" data-agregar="paso">+ Paso</button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-agregar="final">+ Final</button>
        <div class="dropdown">
            <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                + Estado del sistema
            </button>
            <ul id="menu-sistema" class="dropdown-menu"></ul>
        </div>
        <span id="aviso" class="badge text-bg-danger d-none" role="status"></span>
        <span class="text-body-secondary small ms-auto">
            Arrastra para mover · <strong>doble clic</strong> o &#9998; para editar · <kbd>Supr</kbd> o <strong>×</strong> para borrar
        </span>
    </div>

    <div id="lienzo" class="lienzo sin-conectar"></div>

    {{-- Modal para el nombre de un estado nuevo. --}}
    <div class="modal fade" id="modal-nombre" tabindex="-1" aria-labelledby="modal-nombre-titulo" aria-hidden="true">
        <div class="modal-dialog">
            <form class="modal-content" id="form-nombre" novalidate>
                <div class="modal-header">
                    <h2 class="modal-title h5" id="modal-nombre-titulo">Nuevo estado</h2>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                </div>
                <div class="modal-body">
                    <label for="campo-nombre" class="form-label">Nombre del estado</label>
                    <input type="text" id="campo-nombre" class="form-control font-monospace" autocomplete="off">
                    <div class="invalid-feedback" id="error-nombre"></div>
                    <div class="form-text">Minúsculas, números y guion bajo. El usuario de WhatsApp no lo ve.</div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Añadir</button>
                </div>
            </form>
        </div>
    </div>

    {{-- Modal para editar una caja (doble clic o lápiz). editor.js lo rellena y aplica los cambios al modelo. --}}
    <div class="modal fade" id="modal-estado" tabindex="-1" aria-labelledby="modal-estado-titulo" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <form class="modal-content" id="form-estado" novalidate>
                <div class="modal-header">
                    <h2 class="modal-title h5" id="modal-estado-titulo">Editar estado</h2>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="estado-nombre" class="form-label">Nombre</label>
                        <input type="text" id="estado-nombre" class="form-control font-monospace" autocomplete="off">
                        <div class="form-text" id="estado-nombre-ayuda"></div>
                    </div>

                    <div class="mb-3">
                        <label for="estado-mensaje" class="form-label">Mensaje</label>
                        <textarea id="estado-mensaje" class="form-control" rows="5"></textarea>
                        <div class="form-text">
                            WhatsApp: <code>*negrita*</code>, <code>_cursiva_</code>.
                            <code>{&#123;departamentos}&#125;</code> se reemplaza por la lista de cortes.
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

                    <div id="seccion-paso" class="mb-3">
                        <label for="estado-siguiente" class="form-label">Ir a</label>
                        <select id="estado-siguiente" class="form-select font-monospace"></select>
                        <div class="form-text">Si el siguiente estado no pide datos, el bot envía los dos mensajes juntos.</div>
                    </div>

                    <div id="seccion-menu">
                        <table class="table table-sm align-middle mb-2">
                            <thead>
                                <tr><th style="width: 7rem">Nº / clave</th><th>Texto de la opción</th><th style="width: 14rem">Ir a</th><th></th></tr>
                            </thead>
                            <tbody id="filas-opciones"></tbody>
                        </table>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="agregar-opcion">+ Opción</button>
                        <div class="form-text">
                            Una clave que no es número (ej. <code>salir</code>) no se lista en el menú principal, pero el usuario puede escribirla.
                        </div>
                    </div>

                    <div class="alert alert-danger mt-3 mb-0 d-none" id="estado-error"></div>
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
