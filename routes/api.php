<?php

use App\Http\Controllers\AccesoController;
use App\Http\Controllers\Api\FlujoPublicadoController;
use Illuminate\Support\Facades\Route;

// Prefijo /api (bootstrap/app.php). Solo el proyecto existente, con su API key. Ver App\Http\Middleware\RequiereApiKey.
Route::middleware('api.key')->group(function () {
    // Para que el proyecto existente compruebe que llega y que su clave es correcta.
    Route::get('/estado', fn () => response()->json(['ok' => true, 'servicio' => 'app-bot']))->name('api.estado');

    // Pase de un solo uso para que un administrador entre al editor (lo canjea GET /entrar/{pase}).
    Route::post('/accesos', [AccesoController::class, 'crear'])->name('api.accesos.crear');

    // La última versión publicada, para que el bot la use.
    Route::get('/flujos/{flujo:slug}/publicado', FlujoPublicadoController::class)->name('api.flujos.publicado');
});
