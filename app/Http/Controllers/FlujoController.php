<?php

namespace App\Http\Controllers;

use App\Models\Flujo;
use App\Models\FlujoVersion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;
use stdClass;

class FlujoController extends Controller
{
    /**
     * Lista de flujos, del más reciente al más antiguo.
     */
    public function index(): View
    {
        $flujos = Flujo::withCount('versiones')->with('ultimaVersion')->latest()->get();

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
        // Nombre único (QA H17): en la lista dos flujos con el mismo nombre no se distinguen.
        $datos = $request->validate([
            'nombre' => ['required', 'string', 'max:100', Rule::unique('flujos', 'nombre')],
        ], [
            'nombre.unique' => 'Ya existe un flujo con ese nombre.',
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

        // validate() devuelve solo los campos con reglas: se usa para comprobar, pero se guarda $crudo completo
        // (si no, se perderían las claves fuera de FLUJO, como _editor con los nombres visibles).
        Validator::make(is_array($crudo) ? $crudo : [], [
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
        if (array_is_list($crudo['contenido']['FLUJO'])) {
            throw ValidationException::withMessages(['contenido.FLUJO' => 'FLUJO debe ser un objeto con los estados.']);
        }

        $version = $flujo->ultimaVersion;
        if ($version->estado === 'publicada') {
            $version = $flujo->versiones()->make(['numero' => $version->numero + 1, 'estado' => 'borrador']);
        }

        $version->fill([
            'contenido' => $crudo['contenido'],
            'layout' => $crudo['layout'] ?? null,
        ]);
        // Sin cambios, save() no toca updated_at y "Guardado a las…" mostraría la hora anterior.
        $version->exists && ! $version->isDirty() ? $version->touch() : $version->save();

        return response()->json([
            'numero' => $version->numero,
            'guardado_en' => $version->updated_at->toIso8601String(), // el navegador lo muestra en hora local
        ]);
    }

    /**
     * Elimina el flujo. Sus versiones se borran solas: la clave foránea tiene ON DELETE CASCADE.
     */
    public function destroy(Flujo $flujo): RedirectResponse
    {
        $flujo->delete();

        return redirect()->route('flujos.index')
            ->with('estado', "Flujo «{$flujo->nombre}» eliminado.");
    }

    /**
     * Copia el flujo (lo último guardado: pasos, nombres visibles y posiciones) como uno NUEVO en borrador.
     * Nombre: «Copia de X»; si ya existe, «Copia de X (2)», «(3)»…
     */
    public function duplicar(Flujo $flujo): RedirectResponse
    {
        $version = $flujo->ultimaVersion;
        $base = 'Copia de ' . mb_substr($flujo->nombre, 0, 80);
        $nombre = $base;
        for ($n = 2; Flujo::where('nombre', $nombre)->exists(); $n++) {
            $nombre = "{$base} ({$n})";
        }

        $copia = DB::transaction(function () use ($nombre, $version) {
            $copia = Flujo::create(['nombre' => $nombre, 'slug' => $this->slugUnico($nombre)]);
            // Tal cual se guardó (como objetos: {} no se convierte en []).
            $copia->versiones()->create([
                'numero' => 1,
                'estado' => 'borrador',
                'contenido' => json_decode((string) $version->getRawOriginal('contenido')),
                'layout' => json_decode((string) $version->getRawOriginal('layout')),
            ]);

            return $copia;
        });

        return redirect()->route('flujos.edit', $copia);
    }

    /**
     * Descarga lo guardado como «slug.json»: { "FLUJO": …, "_editor": { titulos, layout } }.
     * El bot existente solo lee FLUJO (FlujoBotService exige la clave FLUJO e ignora las demás), así que el archivo
     * le sirve tal cual; _editor permite reimportarlo con los nombres visibles y las posiciones.
     * UTF-8 sin BOM, legible y sin escapar tildes ni barras.
     */
    public function exportar(Flujo $flujo): Response
    {
        $version = $flujo->ultimaVersion;

        // Como objetos (no arreglos): así {} no se convierte en [] y todo queda tal cual se guardó.
        $contenido = json_decode((string) $version->getRawOriginal('contenido')) ?: new stdClass;
        $layout = json_decode((string) $version->getRawOriginal('layout'));

        $editor = isset($contenido->_editor) && is_object($contenido->_editor) ? $contenido->_editor : new stdClass;
        unset($editor->nuevos); // al importar, los pasos quedan con su identificador fijo
        if ($layout) {
            $editor->layout = $layout;
        }
        unset($contenido->_editor);
        if (count((array) $editor)) {
            $contenido->_editor = $editor;
        }

        $json = json_encode($contenido, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return response($json . "\n", 200, [
            'Content-Type' => 'application/json; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $flujo->slug . '.json"',
        ]);
    }

    /**
     * Importa un .json como flujo NUEVO (borrador nº1). Acepta lo mismo que el bot: un JSON con FLUJO como objeto
     * (con o sin BOM). Se conserva todo tal cual (campos extra como keywords, departamento o _comentario); de _editor
     * se toman los nombres visibles y las posiciones (layout va a su columna).
     */
    public function importar(Request $request): RedirectResponse
    {
        $request->validate([
            'archivo' => ['required', 'file', 'max:2048'],
            'nombre' => ['nullable', 'string', 'max:100'],
        ], [
            'archivo.required' => 'Elige un archivo .json.',
            'archivo.max' => 'El archivo pesa más de 2 MB.',
        ]);

        $archivo = $request->file('archivo');
        $texto = preg_replace('/^\xEF\xBB\xBF/', '', (string) file_get_contents($archivo->getRealPath()));
        $json = json_decode($texto);

        $error = match (true) {
            json_last_error() !== JSON_ERROR_NONE => 'No es un JSON válido.',
            ! is_object($json) || ! isset($json->FLUJO) || ! is_object($json->FLUJO) => 'Falta la clave «FLUJO».',
            count((array) $json->FLUJO) === 0 => 'El flujo no tiene pasos.',
            default => null,
        };
        foreach ($error ? [] : (array) $json->FLUJO as $paso => $estado) {
            if (! is_object($estado)) {
                $error = "El paso «{$paso}» no tiene el formato correcto.";
                break;
            }
        }
        if ($error) {
            throw ValidationException::withMessages(['archivo' => $error]);
        }

        // Nombre: el escrito o, si no, el del archivo sin la extensión. Único (QA H17).
        $nombre = trim((string) ($request->input('nombre') ?: pathinfo($archivo->getClientOriginalName(), PATHINFO_FILENAME)));
        if ($nombre === '' || mb_strlen($nombre) > 100) {
            throw ValidationException::withMessages(['nombre' => 'Escribe un nombre (máx. 100 caracteres).']);
        }
        if (Flujo::where('nombre', $nombre)->exists()) {
            throw ValidationException::withMessages(['nombre' => "Ya existe «{$nombre}». Usa otro nombre."]);
        }

        // Datos del editor: las posiciones van a su columna; «nuevos» no se importa (los pasos quedan fijos).
        $layout = null;
        if (isset($json->_editor) && is_object($json->_editor)) {
            $layout = isset($json->_editor->layout) && is_object($json->_editor->layout) ? $json->_editor->layout : null;
            unset($json->_editor->layout, $json->_editor->nuevos);
            if (! count((array) $json->_editor)) {
                unset($json->_editor);
            }
        }

        $flujo = DB::transaction(function () use ($nombre, $json, $layout) {
            $flujo = Flujo::create(['nombre' => $nombre, 'slug' => $this->slugUnico($nombre)]);
            $flujo->versiones()->create(['numero' => 1, 'estado' => 'borrador', 'contenido' => $json, 'layout' => $layout]);

            return $flujo;
        });

        $pasos = count((array) $json->FLUJO);

        return redirect()->route('flujos.index')
            ->with('estado', "«{$nombre}» importado ({$pasos} pasos).");
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
