@extends('layouts.app')

@section('titulo', $flujo->nombre)

@section('contenido')
    <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
            <h1 class="h3 mb-0">{{ $flujo->nombre }}</h1>
            <small class="text-body-secondary">
                <code>{{ $flujo->slug }}</code> · versión {{ $version->numero }}
                <span class="badge text-bg-{{ $version->estado === 'publicada' ? 'success' : 'secondary' }}">{{ $version->estado }}</span>
            </small>
        </div>
        <div class="d-flex align-items-center gap-3">
            <span id="resumen" class="text-body-secondary"></span>
            <a href="{{ route('flujos.index') }}" class="btn btn-outline-secondary">Volver</a>
        </div>
    </div>

    <div id="lienzo" class="lienzo"></div>

    {{-- Datos para editor.js: el FLUJO guardado y las posiciones de las cajas. --}}
    <script type="application/json" id="datos-flujo">@json(['contenido' => $version->contenido, 'layout' => $version->layout])</script>
@endsection

@push('scripts')
    @vite('resources/js/editor.js')
@endpush
