@extends('layouts.app')

@section('titulo', 'Flujos')

@section('contenido')
    <div class="d-flex justify-content-between align-items-center mb-3">
        <h1 class="h3 mb-0">Flujos</h1>
        <a href="{{ route('flujos.create') }}" class="btn btn-primary">Nuevo flujo</a>
    </div>

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
                        <td>{{ $flujo->created_at->format('d/m/Y H:i') }}</td>
                        <td class="text-end text-nowrap">
                            <a href="{{ route('flujos.edit', $flujo) }}" class="btn btn-sm btn-outline-primary">Editar</a>
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
@endsection
