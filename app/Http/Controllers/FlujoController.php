<?php

namespace App\Http\Controllers;

use App\Models\Flujo;
use App\Models\FlujoVersion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class FlujoController extends Controller
{
    /**
     * Lista de flujos, del más reciente al más antiguo.
     */
    public function index(): View
    {
        $flujos = Flujo::withCount('versiones')->latest()->get();

        return view('flujos.index', compact('flujos'));
    }

    /**
     * Formulario para crear un flujo nuevo.
     */
    public function create(): View
    {
        return view('flujos.create');
    }

    /**
     * Crea el flujo y su versión nº1 (borrador) con el contenido mínimo: start → end.
     */
    public function store(Request $request): RedirectResponse
    {
        $datos = $request->validate([
            'nombre' => ['required', 'string', 'max:100'],
        ]);

        $flujo = DB::transaction(function () use ($datos) {
            $flujo = Flujo::create([
                'nombre' => $datos['nombre'],
                'slug' => $this->slugUnico($datos['nombre']),
            ]);

            $flujo->versiones()->create([
                'numero' => 1,
                'estado' => 'borrador',
                'contenido' => FlujoVersion::contenidoInicial(),
            ]);

            return $flujo;
        });

        return redirect()->route('flujos.index')
            ->with('estado', "Flujo «{$flujo->nombre}» creado.");
    }

    /**
     * Página del editor con la última versión del flujo. {flujo:slug} lo busca por slug (404 si no existe).
     */
    public function edit(Flujo $flujo): View
    {
        $version = $flujo->ultimaVersion;

        return view('flujos.edit', compact('flujo', 'version'));
    }

    /**
     * Guarda el borrador que envía el editor (fetch): { contenido: { FLUJO: {...} }, layout: {...} }.
     * Si la última versión ya está publicada (inmutable), crea un borrador nuevo con el número siguiente.
     */
    public function guardar(Request $request, Flujo $flujo): JsonResponse
    {
        // Se lee el cuerpo original: los middleware TrimStrings y ConvertEmptyStringsToNull modificarían
        // los mensajes del bot (quitarían saltos de línea finales y cambiarían "" por null).
        $crudo = json_decode($request->getContent(), true);

        $datos = Validator::make(is_array($crudo) ? $crudo : [], [
            'contenido' => ['required', 'array'],
            'contenido.FLUJO' => ['required', 'array'],
            'contenido.FLUJO.*' => ['array'],
            'layout' => ['nullable', 'array'],
        ], [
            'contenido.FLUJO.required' => 'El contenido debe tener la clave FLUJO.',
            'contenido.FLUJO.array' => 'FLUJO debe ser un objeto con los estados.',
            'contenido.FLUJO.*.array' => 'Cada estado de FLUJO debe ser un objeto.',
        ])->validate();

        // FLUJO es un objeto de estados {"start": {...}}, no una lista [...].
        if (array_is_list($datos['contenido']['FLUJO'])) {
            throw ValidationException::withMessages(['contenido.FLUJO' => 'FLUJO debe ser un objeto con los estados.']);
        }

        $version = $flujo->ultimaVersion;
        if ($version->estado === 'publicada') {
            $version = $flujo->versiones()->make(['numero' => $version->numero + 1, 'estado' => 'borrador']);
        }

        $version->fill([
            'contenido' => $datos['contenido'],
            'layout' => $datos['layout'] ?? null,
        ])->save();

        return response()->json([
            'numero' => $version->numero,
            'guardado_en' => $version->updated_at->toIso8601String(), // el navegador lo muestra en hora local
        ]);
    }

    /**
     * "Poder Judicial" → "poder-judicial"; si ya existe, "poder-judicial-2", "-3"…
     */
    private function slugUnico(string $nombre): string
    {
        $base = Str::slug($nombre) ?: 'flujo';
        $slug = $base;

        for ($n = 2; Flujo::where('slug', $slug)->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }
}
