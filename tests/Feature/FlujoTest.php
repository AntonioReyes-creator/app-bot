<?php

namespace Tests\Feature;

use App\Models\Flujo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FlujoTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_el_flujo_nuevo_nace_con_los_mensajes_vacios(): void
    {
        $this->post('/flujos', ['nombre' => 'Nuevo']);

        $this->assertSame(
            ['start' => ['message' => '', 'next_state' => 'end'], 'end' => ['message' => '']],
            Flujo::sole()->ultimaVersion->contenido['FLUJO'],
        );
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
            ->assertSee('versión 2')
            ->assertSee('Versi\\u00f3n dos', false); // @json escapa las tildes dentro del <script>
    }

    public function test_editor_de_flujo_inexistente_da_404(): void
    {
        $this->get('/flujos/no-existe/editar')->assertNotFound();
    }

    public function test_nombre_repetido_genera_slug_distinto(): void
    {
        $this->post('/flujos', ['nombre' => 'ONPE']);
        $this->post('/flujos', ['nombre' => 'ONPE']);
        $this->post('/flujos', ['nombre' => 'onpe']);

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
            ->assertSee('Eliminar el flujo', false);
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
}
