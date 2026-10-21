@extends('layouts.app')

@section('titulo', 'Sin acceso')

@section('contenido')
    <div class="row justify-content-center">
        <div class="col-md-6 col-lg-5">
            <div class="card shadow-sm">
                <div class="card-body text-center p-4">
                    <div class="fs-1 mb-2">🔒</div>
                    <h1 class="h5">Sin acceso</h1>
                    <p class="text-secondary mb-0">{{ $mensaje }}</p>
                </div>
            </div>
        </div>
    </div>
@endsection
