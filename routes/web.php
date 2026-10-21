<?php

use App\Http\Controllers\AccesoController;
use App\Http\Controllers\FlujoController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/flujos');

// Canjea el pase que el proyecto existente pidió por API (fuera del grupo: aquí todavía no hay sesión).
Route::get('/entrar/{pase}', [AccesoController::class, 'entrar'])->name('acceso.entrar');

// Solo administradores con sesión (entran desde el sistema principal). Ver App\Http\Middleware\RequiereAcceso.
Route::middleware('acceso')->group(function () {
    Route::get('/flujos', [FlujoController::class, 'index'])->name('flujos.index');
    Route::get('/flujos/crear', [FlujoController::class, 'create'])->name('flujos.create');
    Route::post('/flujos', [FlujoController::class, 'store'])->name('flujos.store');
    Route::post('/flujos/importar', [FlujoController::class, 'importar'])->name('flujos.importar');
    Route::get('/flujos/{flujo:slug}/editar', [FlujoController::class, 'edit'])->name('flujos.edit');
    Route::put('/flujos/{flujo:slug}/borrador', [FlujoController::class, 'guardar'])->name('flujos.guardar');
    Route::post('/flujos/{flujo:slug}/publicar', [FlujoController::class, 'publicar'])->name('flujos.publicar');
    Route::get('/flujos/{flujo:slug}/exportar', [FlujoController::class, 'exportar'])->name('flujos.exportar');
    Route::delete('/flujos/{flujo:slug}', [FlujoController::class, 'destroy'])->name('flujos.destroy');
    Route::post('/flujos/{flujo:slug}/duplicar', [FlujoController::class, 'duplicar'])->name('flujos.duplicar');
});
