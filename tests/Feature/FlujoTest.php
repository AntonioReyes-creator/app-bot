<?php

namespace Tests\Feature;

use App\Models\Flujo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FlujoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Estas pruebas son del editor: entran como un administrador con sesión (el bloqueo se prueba en AccesoTest).
        $this->withSession(['acceso' => ['id' => 1, 'nombre' => 'Admin de prueba']]);
    }

    public function test_la_portada_redirige_a_la_lista(): void
    {
        $this->get('/')->assertRedirect('/flujos');
    }

    public function test_la_lista_vacia_invita_a_crear(): void
    {
        $this->get('/flujos')->assertOk()->assertSee('Todavía no hay flujos');
    }

    public function test_crear_flujo_con_su_borrador_inicial(): void
    {
        $this->post('/flujos', ['nombre' => 'Poder Judicial'])
            ->assertRedirect('/flujos')
            ->assertSessionHas('estado', 'Flujo «Poder Judicial» creado.');

        $flujo = Flujo::sole();
        $this->assertSame('poder-judicial', $flujo->slug);

        $version = $flujo->versiones()->sole();
        $this->assertSame(1, $version->numero);
        $this->assertSame('borrador', $version->estado);
        $this->assertSame('end', $version->contenido['FLUJO']['start']['next_state']);
        $this->assertArrayHasKey('end', $version->contenido['FLUJO']);

        $this->get('/flujos')->assertSee('Poder Judicial')->assertSee('poder-judicial');
    }

    public function test_el_contenido_se_guarda_sin_escapar_tildes(): void
    {
        $this->post('/flujos', ['nombre' => 'Atención']);
        $this->putJson('/flujos/atencion/borrador', ['contenido' => ['FLUJO' => ['start' => ['message' => '¡Hola! Atención 👋']]]]);

        $crudo = DB::table('flujo_versiones')->value('contenido');
        $this->assertStringContainsString('¡Hola! Atención 👋', $crudo);
    }

    public function test_guardar_conserva_los_objetos_vacios(): void
    {
        $this->post('/flujos', ['nombre' => 'Vacios']);
        $this->putJson('/flujos/vacios/borrador', [
            'contenido' => [
                'FLUJO' => [
                    'start' => ['message' => 'Hola', 'next_state' => 'end', 'options' => new \stdClass],
                    'end' => ['message' => 'Chau'],
                ],
                '_editor' => ['titulos' => ['start' => 'Inicio']],
            ],
            'layout' => ['start' => ['x' => 0, 'y' => 0], 'end' => new \stdClass],
        ])->assertOk();

        // {} se queda {} (antes se guardaba como []), en la base y al exportar.
        $fila = DB::table('flujo_versiones')->first();
        $this->assertStringContainsString('"options":{}', str_replace(' ', '', $fila->contenido));
        $this->assertStringContainsString('"end":{}', str_replace(' ', '', $fila->layout));
        $this->assertStringContainsString('"options": {}', $this->get('/flujos/vacios/exportar')->getContent());
        $this->assertSame('Inicio', Flujo::sole()->ultimaVersion->contenido['_editor']['titulos']['start'], 'lo de fuera de FLUJO se conserva');
    }

    public function test_el_flujo_nuevo_nace_con_bienvenida_y_despedida_con_mensaje(): void
    {
        $this->post('/flujos', ['nombre' => 'Nuevo']);

        $flujo = Flujo::sole()->ultimaVersion->contenido['FLUJO'];
        $this->assertSame(['start', 'end'], array_keys($flujo));
        $this->assertSame('end', $flujo['start']['next_state']);
        $this->assertNotSame('', trim($flujo['start']['message']), 'con mensaje vacío el bot enviaba un mensaje vacío (QA H3)');
        $this->assertNotSame('', trim($flujo['end']['message']));
    }

    public function test_nombre_vacio_muestra_error_en_espanol(): void
    {
        $this->post('/flujos', ['nombre' => ''])
            ->assertSessionHasErrors(['nombre' => 'El campo nombre es obligatorio.']);

        $this->assertSame(0, Flujo::count());
    }

    public function test_nombre_demasiado_largo_se_rechaza(): void
    {
        $this->post('/flujos', ['nombre' => str_repeat('a', 101)])
            ->assertSessionHasErrors(['nombre' => 'El campo nombre no debe tener más de 100 caracteres.']);
    }

    public function test_la_lista_enlaza_al_editor(): void
    {
        $this->post('/flujos', ['nombre' => 'Poder Judicial']);

        $this->get('/flujos')->assertSee(route('flujos.edit', 'poder-judicial'));
    }

    public function test_el_editor_recibe_el_flujo_de_la_ultima_version(): void
    {
        $this->post('/flujos', ['nombre' => 'Poder Judicial']);
        $flujo = Flujo::sole();
        $flujo->versiones()->create([
            'numero' => 2,
            'contenido' => ['FLUJO' => ['start' => ['message' => 'Versión dos']]],
        ]);

        $this->get('/flujos/poder-judicial/editar')
            ->assertOk()
            ->assertSee('id="lienzo"', false)
            ->assertSee('Inactivo') // la cabecera dice si el bot está activo (ya no muestra el número de versión)
            ->assertSee('Versi\\u00f3n dos', false); // @json escapa las tildes dentro del <script>
    }

    public function test_editor_de_flujo_inexistente_da_404(): void
    {
        $this->get('/flujos/no-existe/editar')->assertNotFound();
    }

    public function test_nombres_distintos_con_el_mismo_slug_reciben_slugs_distintos(): void
    {
        // Nombres distintos (el mismo nombre ya no se permite) que dan el mismo slug.
        $this->post('/flujos', ['nombre' => 'ONPE']);
        $this->post('/flujos', ['nombre' => 'ONPE.']);
        $this->post('/flujos', ['nombre' => 'ONPE!']);

        $this->assertSame(['onpe', 'onpe-2', 'onpe-3'], Flujo::orderBy('id')->pluck('slug')->all());
    }

    // --- Guardar borrador (PUT /flujos/{slug}/borrador) ---

    private function flujoCreado(): Flujo
    {
        $this->post('/flujos', ['nombre' => 'Poder Judicial']);

        return Flujo::sole();
    }

    public function test_guardar_actualiza_el_borrador_con_contenido_y_layout(): void
    {
        $flujo = $this->flujoCreado();
        $contenido = ['FLUJO' => [
            'start' => ['message' => "*Hola*\nElige:\n", 'options' => [
                '1' => ['text' => 'Trámites', 'next_state' => 'end', 'keywords' => ['tramite']],
                'salir' => ['text' => 'Salir', 'next_state' => 'end'],
                '2' => ['text' => '', 'next_state' => null],
            ]],
            'end' => ['message' => 'Fin'],
        ]];

        $this->putJson('/flujos/poder-judicial/borrador', ['contenido' => $contenido, 'layout' => ['start' => ['x' => 40, 'y' => 40]]])
            ->assertOk()
            ->assertJson(['numero' => 1]);

        $version = $flujo->versiones()->sole(); // no se crea otra versión: se actualiza el borrador
        $this->assertSame($contenido, $version->contenido, 'se guarda tal cual: saltos de línea, "" y null, campos extra');
        $this->assertSame(['1', 'salir', '2'], array_map('strval', array_keys($version->contenido['FLUJO']['start']['options'])));
        $this->assertSame(['start' => ['x' => 40, 'y' => 40]], $version->layout);
        $this->assertStringContainsString('"Trámites"', DB::table('flujo_versiones')->value('contenido'));
    }

    public function test_guardar_rechaza_contenido_sin_flujo_o_mal_formado(): void
    {
        $this->flujoCreado();

        $this->putJson('/flujos/poder-judicial/borrador', ['contenido' => ['otra' => 1]])
            ->assertUnprocessable()->assertJsonValidationErrors(['contenido.FLUJO' => 'El contenido debe tener la clave FLUJO.']);
        $this->putJson('/flujos/poder-judicial/borrador', ['contenido' => ['FLUJO' => 'texto']])
            ->assertUnprocessable()->assertJsonValidationErrors(['contenido.FLUJO' => 'FLUJO debe ser un objeto con los estados.']);
        $this->putJson('/flujos/poder-judicial/borrador', ['contenido' => ['FLUJO' => [['message' => 'lista']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['contenido.FLUJO' => 'FLUJO debe ser un objeto con los estados.']);
        $this->putJson('/flujos/poder-judicial/borrador', ['contenido' => ['FLUJO' => ['start' => 'texto']]])
            ->assertUnprocessable()->assertJsonValidationErrors(['contenido.FLUJO.start']);
    }

    public function test_si_la_ultima_version_esta_publicada_se_crea_un_borrador_nuevo(): void
    {
        $flujo = $this->flujoCreado();
        $flujo->ultimaVersion->update(['estado' => 'publicada', 'publicada_en' => now()]);
        $publicada = $flujo->ultimaVersion->contenido;

        $this->putJson('/flujos/poder-judicial/borrador', ['contenido' => ['FLUJO' => ['start' => ['message' => 'v2']]]])
            ->assertOk()->assertJson(['numero' => 2]);

        $this->assertSame($publicada, $flujo->versiones()->where('numero', 1)->first()->contenido, 'la publicada no cambia');
        $this->assertSame('borrador', $flujo->fresh()->ultimaVersion->estado);
    }

    public function test_guardar_flujo_inexistente_da_404(): void
    {
        $this->putJson('/flujos/no-existe/borrador', ['contenido' => ['FLUJO' => ['start' => ['message' => 'x']]]])->assertNotFound();
    }

    // --- Eliminar flujo (DELETE /flujos/{slug}) ---

    public function test_eliminar_borra_el_flujo_y_sus_versiones(): void
    {
        $flujo = $this->flujoCreado();
        $flujo->versiones()->create(['numero' => 2, 'contenido' => ['FLUJO' => ['start' => ['message' => '']]]]);
        $this->post('/flujos', ['nombre' => 'Otro']);

        $this->delete('/flujos/poder-judicial')
            ->assertRedirect('/flujos')
            ->assertSessionHas('estado', 'Flujo «Poder Judicial» eliminado.');

        $this->assertSame(['otro'], Flujo::pluck('slug')->all(), 'el otro flujo no se toca');
        $this->assertSame(0, DB::table('flujo_versiones')->where('flujo_id', $flujo->id)->count(), 'versiones borradas en cascada');
    }

    public function test_la_lista_tiene_el_boton_eliminar_con_confirmacion(): void
    {
        $this->flujoCreado();

        $this->get('/flujos')
            ->assertSee('action="' . route('flujos.destroy', 'poder-judicial') . '"', false)
            ->assertSee('name="_method" value="DELETE"', false)
            ->assertSee('No se puede deshacer', false);
    }

    public function test_eliminar_flujo_inexistente_da_404(): void
    {
        $this->delete('/flujos/no-existe')->assertNotFound();
    }

    public function test_guardar_conserva_las_claves_fuera_de_flujo(): void
    {
        $flujo = $this->flujoCreado();
        $contenido = [
            'FLUJO' => ['start' => ['message' => 'Hola', 'next_state' => 'end'], 'end' => ['message' => '']],
            '_editor' => ['titulos' => ['start' => 'Bienvenida']],
            'otra_clave' => ['version_motor' => 2],
        ];

        $this->putJson('/flujos/poder-judicial/borrador', ['contenido' => $contenido])->assertOk();

        $this->assertSame($contenido, $flujo->fresh()->ultimaVersion->contenido);
    }

    public function test_guardar_sin_cambios_informa_la_hora_actual(): void
    {
        $this->flujoCreado();
        $contenido = ['FLUJO' => ['start' => ['message' => 'Hola']]];
        $this->putJson('/flujos/poder-judicial/borrador', ['contenido' => $contenido]);

        $this->travel(5)->minutes();
        $respuesta = $this->putJson('/flujos/poder-judicial/borrador', ['contenido' => $contenido])->assertOk();

        $this->assertSame(now()->format('Y-m-d H:i'), \Illuminate\Support\Carbon::parse($respuesta->json('guardado_en'))->format('Y-m-d H:i'));
    }

    public function test_no_se_pueden_crear_dos_flujos_con_el_mismo_nombre(): void
    {
        $this->post('/flujos', ['nombre' => 'Tienda Lima'])->assertRedirect('/flujos');

        $this->from('/flujos/crear')->post('/flujos', ['nombre' => 'Tienda Lima'])
            ->assertRedirect('/flujos/crear')
            ->assertSessionHasErrors(['nombre' => 'Ya existe un flujo con ese nombre.']);
        $this->assertSame(1, Flujo::count());
    }

    // --- Exportar e importar (etapa 3b / 3d) ---

    public function test_exportar_descarga_el_json_con_flujo_y_datos_del_editor(): void
    {
        $this->post('/flujos', ['nombre' => 'Tienda']);
        $flujo = ['start' => ['message' => "¡Hola! Ñandú\nElige:", 'options' => ['1' => ['text' => 'A', 'next_state' => 'end', 'keywords' => ['ventas']]]],
            'end' => ['message' => 'Chau']];
        $this->putJson('/flujos/tienda/borrador', [
            'contenido' => ['FLUJO' => $flujo, '_editor' => ['titulos' => ['start' => 'Inicio'], 'nuevos' => ['x']]],
            'layout' => ['start' => ['x' => 1, 'y' => 2]],
        ])->assertOk();

        $respuesta = $this->get('/flujos/tienda/exportar')->assertOk();
        $this->assertSame('attachment; filename="tienda.json"', $respuesta->headers->get('Content-Disposition'));
        $texto = $respuesta->getContent();
        $this->assertStringNotContainsString("\xEF\xBB\xBF", $texto, 'sin BOM');
        $this->assertStringContainsString('¡Hola! Ñandú', $texto, 'tildes sin escapar');
        $this->assertStringContainsString("\n    \"FLUJO\"", $texto, 'legible');

        $json = json_decode($texto, true);
        $this->assertSame($flujo, $json['FLUJO']);
        $this->assertSame(['titulos' => ['start' => 'Inicio'], 'layout' => ['start' => ['x' => 1, 'y' => 2]]], $json['_editor'], 'sin «nuevos»');
    }

    public function test_importar_crea_un_flujo_nuevo_con_todo_tal_cual(): void
    {
        $archivo = "\xEF\xBB\xBF" . json_encode([
            'FLUJO' => [
                'start' => ['_comentario' => 'no tocar', 'message' => 'Hola', 'options' => ['1' => ['text' => 'Lima', 'departamento' => 'lima', 'next_state' => 'end']]],
                'end' => ['message' => 'Chau'],
            ],
            '_editor' => ['titulos' => ['start' => 'Inicio'], 'nuevos' => ['start'], 'layout' => ['start' => ['x' => 5, 'y' => 6]]],
        ], JSON_UNESCAPED_UNICODE);

        $this->post('/flujos/importar', ['archivo' => UploadedFile::fake()->createWithContent('Mi bot.json', $archivo)])
            ->assertRedirect('/flujos')
            ->assertSessionHas('estado', '«Mi bot» importado (2 pasos).');

        $version = Flujo::where('nombre', 'Mi bot')->sole()->ultimaVersion;
        $this->assertSame('borrador', $version->estado);
        $this->assertSame('no tocar', $version->contenido['FLUJO']['start']['_comentario']);
        $this->assertSame('lima', $version->contenido['FLUJO']['start']['options']['1']['departamento']);
        $this->assertSame(['titulos' => ['start' => 'Inicio']], $version->contenido['_editor'], 'posiciones a su columna; «nuevos» no se importa');
        $this->assertSame(['start' => ['x' => 5, 'y' => 6]], $version->layout);
    }

    public function test_importar_rechaza_lo_que_no_es_un_flujo_y_no_crea_nada(): void
    {
        $casos = [
            'no es JSON' => ['{"FLUJO": ', 'No es un JSON válido'],
            'sin FLUJO' => ['{"pasos": {}}', 'Falta la clave «FLUJO»'],
            'FLUJO vacío' => ['{"FLUJO": {}}', 'no tiene pasos'],
            'paso que no es objeto' => ['{"FLUJO": {"start": "hola"}}', 'El paso «start» no tiene el formato correcto'],
        ];
        foreach ($casos as $caso => [$contenido, $mensaje]) {
            $errores = $this->post('/flujos/importar', ['archivo' => UploadedFile::fake()->createWithContent('x.json', $contenido)],
                ['Accept' => 'application/json'])->assertUnprocessable()->json('errors.archivo.0');
            $this->assertStringContainsString($mensaje, $errores, $caso);
        }
        $this->assertSame(0, Flujo::count());
    }

    public function test_importar_con_un_nombre_que_ya_existe_pide_otro(): void
    {
        $this->post('/flujos', ['nombre' => 'Bot ventas']);
        $archivo = UploadedFile::fake()->createWithContent('Bot ventas.json', '{"FLUJO": {"start": {"message": "Hola"}}}');

        $this->from('/flujos')->post('/flujos/importar', ['archivo' => $archivo])->assertSessionHasErrors(['nombre']);
        $this->post('/flujos/importar', ['archivo' => $archivo, 'nombre' => 'Bot ventas 2'])->assertRedirect('/flujos');
        $this->assertSame(['Bot ventas', 'Bot ventas 2'], Flujo::orderBy('id')->pluck('nombre')->all());
    }

    public function test_importar_y_exportar_devuelve_el_mismo_flujo(): void
    {
        // Con lo que suele perderse: {} vacío, [] vacío, campos extra, claves no numéricas y comentarios.
        $original = <<<'JSON'
        {
            "FLUJO": {
                "start": {"message": "*Hola*\nElige:", "options": {"1": {"text": "Uno", "next_state": "menu", "keywords": []}, "salir": {"text": "Salir", "next_state": "end"}}},
                "menu": {"_comentario": "x", "message": "Lista\n\n{{departamentos}}", "options": {}},
                "end": {"message": "Chau ¡gracias!"}
            },
            "otra_clave": {"a": 1}
        }
        JSON;
        $this->post('/flujos/importar', ['archivo' => UploadedFile::fake()->createWithContent('Ida y vuelta.json', $original)]);

        $exportado = $this->get('/flujos/ida-y-vuelta/exportar')->getContent();
        $this->assertEquals(json_decode($original), json_decode($exportado), 'mismo JSON (también {} y [])');
    }

    public function test_duplicar_crea_una_copia_con_todo_y_no_toca_el_original(): void
    {
        $this->post('/flujos', ['nombre' => 'Tienda']);
        $this->putJson('/flujos/tienda/borrador', [
            'contenido' => ['FLUJO' => ['start' => ['message' => 'Hola', 'options' => ['1' => ['text' => 'A', 'next_state' => 'end', 'keywords' => ['a']]]], 'end' => ['message' => 'Chau']],
                '_editor' => ['titulos' => ['start' => 'Inicio']]],
            'layout' => ['start' => ['x' => 1, 'y' => 2]],
        ]);

        $this->post('/flujos/tienda/duplicar')->assertRedirect('/flujos/copia-de-tienda/editar');
        $this->post('/flujos/tienda/duplicar')->assertRedirect('/flujos/copia-de-tienda-2/editar');

        $original = Flujo::where('slug', 'tienda')->sole()->ultimaVersion;
        $copia = Flujo::where('nombre', 'Copia de Tienda')->sole()->ultimaVersion;
        $this->assertSame($original->contenido, $copia->contenido);
        $this->assertSame($original->layout, $copia->layout);
        $this->assertSame('borrador', $copia->estado);
        $this->assertSame(['Tienda', 'Copia de Tienda', 'Copia de Tienda (2)'], Flujo::orderBy('id')->pluck('nombre')->all());
    }
}
