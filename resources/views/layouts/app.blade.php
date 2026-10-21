<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('titulo', 'App Bot') · {{ config('app.name') }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @stack('estilos')
</head>
<body class="bg-light">
    <nav class="navbar navbar-dark bg-dark mb-4">
        <div class="container-fluid">
            <a class="navbar-brand" href="{{ url('/') }}">App Bot · Flujos</a>
            @if (session('acceso.nombre'))
                <span class="navbar-text small">👤 {{ session('acceso.nombre') }}</span>
            @endif
        </div>
    </nav>

    <main class="container-fluid">
        @yield('contenido')
    </main>

    @stack('scripts')
</body>
</html>
