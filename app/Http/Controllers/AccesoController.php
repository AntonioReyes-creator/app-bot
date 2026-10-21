<?php

namespace App\Http\Controllers;

use App\Models\Acceso;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

/**
 * Entrada de los administradores sin un segundo login: el proyecto existente (ya logueado) pide un pase
 * y redirige el navegador a /entrar/{pase}. Ver docs/PLAN.md, «Acceso».
 */
class AccesoController extends Controller
{
    /**
     * POST /api/accesos (con API key): crea un pase de un solo uso y devuelve la URL para entrar.
     */
    public function crear(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'usuario_id' => ['required', 'integer', 'min:1'],
            'nombre' => ['required', 'string', 'max:150'],
            'aplicacion_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $pase = Str::random(64);
        $acceso = Acceso::create([
            ...$datos,
            'pase_hash' => Acceso::hashDe($pase),
            'vence_en' => now()->addMinutes(Acceso::MINUTOS),
        ]);

        return response()->json([
            'url' => route('acceso.entrar', ['pase' => $pase]),
            'vence_en' => $acceso->vence_en->toIso8601String(),
        ], 201);
    }

    /**
     * GET /entrar/{pase}: si el pase existe, no venció y no se usó, abre la sesión del administrador.
     */
    public function entrar(Request $request, string $pase): RedirectResponse|Response
    {
        $acceso = Acceso::where('pase_hash', Acceso::hashDe($pase))->first();

        // Se marca usado con una condición (usado_en IS NULL): si dos peticiones llegan a la vez, solo una lo logra.
        $usado = $acceso && $acceso->vence_en->isFuture()
            && Acceso::whereKey($acceso->id)->whereNull('usado_en')->update(['usado_en' => now()]) === 1;

        if (! $usado) {
            return response()->view('acceso.sin-acceso', [
                'mensaje' => 'El enlace venció o ya se usó. Vuelve a entrar desde el sistema principal.',
            ], 401);
        }

        // ID de sesión nuevo al entrar (evita la fijación de sesión).
        $request->session()->regenerate();
        $request->session()->put('acceso', [
            'id' => $acceso->usuario_id,
            'nombre' => $acceso->nombre,
            'aplicacion_id' => $acceso->aplicacion_id,
        ]);

        return redirect()->route('flujos.index');
    }
}
