@extends('layouts.app')

@section('titulo', 'Flujos')

@section('contenido')
    <div class="d-flex justify-content-between align-items-center mb-3">
        <h1 class="h3 mb-0">Flujos</h1>
        <div class="d-flex gap-2">
            <button type="button" class="btn btn-outline-secondary" id="abrir-importar"
                    onclick="document.getElementById('importar').toggleAttribute('open')">&#11014; Importar</button>
            <a href="{{ route('flujos.create') }}" class="btn btn-primary">Nuevo flujo</a>
        </div>
    </div>

    {{-- Importar un .json (exportado de aquí o un archivo del bot): siempre crea un flujo NUEVO; no toca los demás. --}}
    <details id="importar" class="card mb-3" @if ($errors->has('archivo') || $errors->has('nombre')) open @endif>
        <summary class="d-none">Importar</summary>
        <div class="card-body">
            <h2 class="h6">&#11014; Importar un flujo</h2>
            <p class="small text-body-secondary mb-2">
                Elige un archivo <code>.json</code> exportado de aquí o un flujo del bot (con la clave <code>FLUJO</code>).
                Se crea un flujo nuevo en borrador; los demás no se tocan.
            </p>
            <form method="POST" action="{{ route('flujos.importar') }}" enctype="multipart/form-data" class="row g-2 align-items-start">
                @csrf
                <div class="col-md-5">
                    <input type="file" name="archivo" accept=".json,application/json" required
                           class="form-control @error('archivo') is-invalid @enderror" aria-label="Archivo del flujo">
                    @error('archivo')<div class="invalid-feedback">{{ $message }}</div>@enderror
                </div>
                <div class="col-md-5">
                    <input type="text" name="nombre" value="{{ old('nombre') }}" maxlength="100"
                           class="form-control @error('nombre') is-invalid @enderror"
                           placeholder="Nombre (si lo dejas vacío, el del archivo)" aria-label="Nombre del flujo">
                    @error('nombre')<div class="invalid-feedback">{{ $message }}</div>@enderror
                </div>
                <div class="col-md-2">
                    <button type="submit" class="btn btn-primary w-100">Importar</button>
                </div>
            </form>
        </div>
    </details>

    @if (session('estado'))
        <div class="alert alert-success">{{ session('estado') }}</div>
    @endif

    @if ($flujos->isEmpty())
        <div class="alert alert-info">Todavía no hay flujos. Crea el primero con «Nuevo flujo».</div>
    @else
        <table class="table table-hover bg-white align-middle">
            <thead>
                <tr>
                    <th>Nombre</th>
                    <th>Slug</th>
                    <th class="text-center">Versiones</th>
                    <th title="¿Todos los caminos del bot terminan bien? Lo calcula la misma revisión que el editor.">Diseño</th>
                    <th>Creado</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                @foreach ($flujos as $flujo)
                    <tr>
                        <td>{{ $flujo->nombre }}</td>
                        <td><code>{{ $flujo->slug }}</code></td>
                        <td class="text-center">{{ $flujo->versiones_count }}</td>
                        <td data-diseno="{{ $flujo->slug }}" data-url="{{ route('flujos.edit', $flujo) }}"><span class="text-body-secondary small">…</span></td>
                        <td>{{ $flujo->created_at->format('d/m/Y H:i') }}</td>
                        <td class="text-end text-nowrap">
                            <a href="{{ route('flujos.edit', $flujo) }}" class="btn btn-sm btn-outline-primary">Editar</a>
                            <a href="{{ route('flujos.exportar', $flujo) }}" class="btn btn-sm btn-outline-secondary"
                               title="Descargar lo guardado como .json (sirve para el bot y para volver a importarlo)">Exportar</a>
                            {{-- Borrar es definitivo (también sus versiones): se pide confirmación. --}}
                            <form method="POST" action="{{ route('flujos.destroy', $flujo) }}" class="d-inline"
                                  onsubmit="return confirm(@js('¿Eliminar el flujo «' . $flujo->nombre . '» y todas sus versiones? No se puede deshacer.'))">
                                @csrf
                                @method('DELETE')
                                <button type="submit" class="btn btn-sm btn-outline-danger">Eliminar</button>
                            </form>
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    {{-- Para la columna «Diseño»: el FLUJO y los nombres visibles de la última versión de cada flujo (lista.js). --}}
    <script type="application/json" id="flujos-datos">@json($flujos->mapWithKeys(fn ($flujo) => [$flujo->slug => [
        'FLUJO' => $flujo->ultimaVersion?->contenido['FLUJO'] ?? [],
        'titulos' => $flujo->ultimaVersion?->contenido['_editor']['titulos'] ?? [],
    ]]))</script>
@endsection

@push('scripts')
    @vite('resources/js/lista.js')
@endpush
