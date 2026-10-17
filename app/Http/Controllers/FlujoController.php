<?php

namespace App\Http\Controllers;

use App\Models\Flujo;
use App\Models\FlujoVersion;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
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
