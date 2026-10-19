<?php

use App\Http\Controllers\FlujoController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/flujos');

Route::get('/flujos', [FlujoController::class, 'index'])->name('flujos.index');
Route::get('/flujos/crear', [FlujoController::class, 'create'])->name('flujos.create');
Route::post('/flujos', [FlujoController::class, 'store'])->name('flujos.store');
Route::post('/flujos/importar', [FlujoController::class, 'importar'])->name('flujos.importar');
Route::get('/flujos/{flujo:slug}/editar', [FlujoController::class, 'edit'])->name('flujos.edit');
Route::put('/flujos/{flujo:slug}/borrador', [FlujoController::class, 'guardar'])->name('flujos.guardar');
Route::get('/flujos/{flujo:slug}/exportar', [FlujoController::class, 'exportar'])->name('flujos.exportar');
Route::delete('/flujos/{flujo:slug}', [FlujoController::class, 'destroy'])->name('flujos.destroy');
