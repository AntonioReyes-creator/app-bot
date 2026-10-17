<?php

use App\Http\Controllers\FlujoController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/flujos');

Route::get('/flujos', [FlujoController::class, 'index'])->name('flujos.index');
Route::get('/flujos/crear', [FlujoController::class, 'create'])->name('flujos.create');
Route::post('/flujos', [FlujoController::class, 'store'])->name('flujos.store');
