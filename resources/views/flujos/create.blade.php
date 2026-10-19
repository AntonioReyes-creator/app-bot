@extends('layouts.app')

@section('titulo', 'Nuevo flujo')

@section('contenido')
    <h1 class="h3 mb-3">Nuevo flujo</h1>

    <form method="POST" action="{{ route('flujos.store') }}" class="card card-body" style="max-width: 32rem">
        @csrf

        <div class="mb-3">
            <label for="nombre" class="form-label">Nombre</label>
            <input type="text" id="nombre" name="nombre" value="{{ old('nombre') }}" maxlength="100" autofocus
                   class="form-control @error('nombre') is-invalid @enderror">
            @error('nombre')
                <div class="invalid-feedback">{{ $message }}</div>
            @enderror
            <div class="form-text">Arranca con una bienvenida y una despedida.</div>
        </div>

        <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary">Crear</button>
            <a href="{{ route('flujos.index') }}" class="btn btn-outline-secondary">Cancelar</a>
        </div>
    </form>
@endsection
