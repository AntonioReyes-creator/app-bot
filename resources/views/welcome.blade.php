@extends('layouts.app')

@section('titulo', 'Inicio')

@section('contenido')
    <div class="alert alert-success">
        Servicio de flujos en marcha: Laravel {{ app()->version() }} · PHP {{ PHP_VERSION }} · Bootstrap 5.
    </div>
@endsection
