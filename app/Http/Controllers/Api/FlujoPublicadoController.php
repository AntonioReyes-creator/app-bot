<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Flujo;
use Illuminate\Http\JsonResponse;
use stdClass;

/**
 * Lo que consume el proyecto existente (con API key): la última versión publicada de un flujo.
 */
class FlujoPublicadoController extends Controller
{
    /**
     * GET /api/flujos/{slug}/publicado → { "FLUJO": {…}, "_publicacion": { flujo, slug, version, publicada_en } }.
     * El motor solo lee FLUJO (FlujoBotService ignora las demás claves); _publicacion dice de qué versión viene el
     * archivo que guarde. _editor (nombres visibles, posiciones) no se envía: al bot no le sirve.
     */
    public function __invoke(Flujo $flujo): JsonResponse
    {
        $version = $flujo->ultimaPublicada;

        if (! $version) {
            return response()->json(['message' => 'Este flujo todavía no tiene una versión publicada.'], 404);
        }

        // Como objeto: {} se queda {} (el motor distingue "options": {} de no tener options).
        $contenido = json_decode((string) $version->getRawOriginal('contenido'));

        return response()->json([
            'FLUJO' => $contenido->FLUJO ?? new stdClass,
            '_publicacion' => [
                'flujo' => $flujo->nombre,
                'slug' => $flujo->slug,
                'version' => $version->numero,
                'publicada_en' => $version->publicada_en?->toIso8601String(),
            ],
        ], 200, [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
