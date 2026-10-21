<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Flujo;
use App\Services\ValidadorFlujo;
use Illuminate\Http\JsonResponse;
use stdClass;

/**
 * Lo que consume el proyecto existente (con API key): los bots ACTIVOS para que cada aplicación elija el suyo.
 * La aplicación copia el JSON al elegirlo; lo que se edite después aquí le llega solo cuando vuelva a aplicarlo.
 */
class BotController extends Controller
{
    private const JSON = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

    /**
     * GET /api/bots → { "bots": [ { slug, nombre, actualizado_en } ] }, solo los activos, por nombre.
     */
    public function index(): JsonResponse
    {
        $bots = Flujo::where('activo', true)->with('ultimaVersion')->orderBy('nombre')->get()
            ->map(fn (Flujo $flujo) => [
                'slug' => $flujo->slug,
                'nombre' => $flujo->nombre,
                'actualizado_en' => $flujo->ultimaVersion?->updated_at?->toIso8601String(),
            ]);

        return response()->json(['bots' => $bots], 200, [], self::JSON);
    }

    /**
     * GET /api/bots/{slug} → { "FLUJO": {…}, "_bot": { slug, nombre, actualizado_en } } con lo último guardado.
     * El motor solo lee FLUJO (FlujoBotService ignora las demás claves). _editor (nombres visibles, posiciones) no va.
     * Inactivo → 404. Guardado con fallas → 422: nunca se entrega un bot roto.
     */
    public function show(Flujo $flujo, ValidadorFlujo $validador): JsonResponse
    {
        if (! $flujo->activo) {
            return response()->json(['message' => 'Este bot no existe o está inactivo.'], 404);
        }

        $version = $flujo->ultimaVersion;
        $errores = $validador->errores($version->contenido['FLUJO'] ?? []);
        if ($errores) {
            return response()->json([
                'message' => 'Este bot tiene fallas: corrígelo en el editor antes de usarlo.',
                'errores' => $errores,
            ], 422, [], self::JSON);
        }

        // Como objeto: {} se queda {} (el motor distingue "options": {} de no tener options).
        $contenido = json_decode((string) $version->getRawOriginal('contenido'));

        return response()->json([
            'FLUJO' => $contenido->FLUJO ?? new stdClass,
            '_bot' => [
                'slug' => $flujo->slug,
                'nombre' => $flujo->nombre,
                'actualizado_en' => $version->updated_at?->toIso8601String(),
            ],
        ], 200, [], self::JSON);
    }
}
