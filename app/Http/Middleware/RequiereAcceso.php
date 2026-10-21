<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Deja pasar solo a quien tiene una sesión de administrador (session('acceso')).
 * Los administradores no tienen usuario aquí: entran desde el sistema principal, que abre la sesión
 * con un pase de un solo uso (ver docs/PLAN.md, acceso). Sin sesión: 401.
 */
class RequiereAcceso
{
    public function handle(Request $request, Closure $next): Response
    {
        // Desarrollo: ACCESO_LOCAL=true abre una sesión de prueba, pero SOLO con APP_ENV=local
        // (en producción no hace nada aunque el flag quede puesto por error).
        if (! $request->session()->has('acceso') && app()->isLocal() && config('app.acceso_local')) {
            $request->session()->put('acceso', ['id' => null, 'nombre' => 'Desarrollo local']);
        }

        if ($request->session()->has('acceso')) {
            return $next($request);
        }

        $mensaje = 'Tu sesión venció o no iniciaste sesión. Entra desde el sistema principal.';

        // Guardar usa fetch: el editor muestra datos.message en el aviso de error.
        if ($request->expectsJson()) {
            return response()->json(['message' => $mensaje], 401);
        }

        return response()->view('acceso.sin-acceso', ['mensaje' => $mensaje], 401);
    }
}
