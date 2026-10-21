<?php

use App\Http\Controllers\AccesoController;
use App\Http\Controllers\Api\BotController;
use Illuminate\Support\Facades\Route;

// Prefijo /api (bootstrap/app.php). Solo el proyecto existente, con su API key. Ver App\Http\Middleware\RequiereApiKey.
Route::middleware('api.key')->group(function () {
    // Para que el proyecto existente compruebe que llega y que su clave es correcta.
    Route::get('/estado', fn () => response()->json(['ok' => true, 'servicio' => 'app-bot']))->name('api.estado');

    // Pase de un solo uso para que un administrador entre al editor (lo canjea GET /entrar/{pase}).
    Route::post('/accesos', [AccesoController::class, 'crear'])->name('api.accesos.crear');

    // Bots activos, para que cada aplicación elija el suyo, y el JSON de uno.
    Route::get('/bots', [BotController::class, 'index'])->name('api.bots.index');
    Route::get('/bots/{flujo:slug}', [BotController::class, 'show'])->name('api.bots.show');
});
