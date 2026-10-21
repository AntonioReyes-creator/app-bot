<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Rutas /api/*: solo para el proyecto existente (servidor a servidor), que envía
 * "Authorization: Bearer <API_KEY>". Sin API_KEY configurada se rechaza todo (nunca queda abierto).
 */
class RequiereApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $esperada = (string) config('app.api_key');
        $recibida = (string) $request->bearerToken();

        // hash_equals tarda lo mismo acierte o no: no deja adivinar la clave midiendo el tiempo de respuesta.
        if ($esperada === '' || ! hash_equals($esperada, $recibida)) {
            return response()->json(['message' => 'API key inválida o ausente.'], 401);
        }

        return $next($request);
    }
}
