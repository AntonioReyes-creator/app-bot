<?php

namespace Tests\Feature;

use App\Models\Flujo;
use App\Services\ValidadorFlujo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Interruptor «Activo» (PATCH /flujos/{slug}/activo) y lo que ven las aplicaciones (GET /api/bots, /api/bots/{slug}). */
class BotsTest extends TestCase
{
    use RefreshDatabase;

    private const CLAVE = 'clave-de-prueba-123';

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.api_key' => self::CLAVE]);
        $this->withSession(['acceso' => ['id' => 1, 'nombre' => 'Admin de prueba']]);
    }

    public function test_un_flujo_nace_inactivo_y_no_aparece_en_la_api(): void
    {
        $this->post('/flujos', ['nombre' => 'Atención']);

        $this->assertFalse(Flujo::sole()->activo);
        $this->api('/api/bots')->assertOk()->assertExactJson(['bots' => []]);
        $this->api('/api/bots/atencion')->assertNotFound()->assertJson(['message' => 'Este bot no existe o está inactivo.']);
    }

    public function test_activar_lo_muestra_en_la_lista_y_fija_los_identificadores(): void
    {
        $flujo = $this->crearFlujo([
            'FLUJO' => [
                'start' => ['message' => 'Hola', 'options' => ['1' => ['text' => 'Ver', 'next_state' => 'ver']]],
                'ver' => ['message' => 'Info', 'next_state' => 'end', 'options' => new \stdClass],
                'end' => ['message' => 'Chau'],
            ],
            '_editor' => ['titulos' => ['ver' => 'Ver información'], 'nuevos' => ['ver']],
        ]);

        $this->patch("/flujos/{$flujo->slug}/activo", ['activo' => 1])
            ->assertRedirect('/flujos')
            ->assertSessionHas('estado', '«Prueba» activado: ya se puede elegir en las aplicaciones.');

        $this->assertTrue($flujo->fresh()->activo);
        $version = $flujo->ultimaVersion()->first();
        $this->assertSame(['titulos' => ['ver' => 'Ver información']], $version->contenido['_editor'], 'nuevos se vacía; titulos se queda');
        $this->assertStringContainsString('"options":{}', str_replace(' ', '', DB::table('flujo_versiones')->value('contenido')));

        $this->api('/api/bots')->assertOk()
            ->assertJsonPath('bots.0.slug', 'prueba')
            ->assertJsonPath('bots.0.nombre', 'Prueba')
            ->assertJsonStructure(['bots' => [['slug', 'nombre', 'actualizado_en']]]);
    }

    public function test_con_fallas_no_se_activa_y_dice_cuales(): void
    {
        $flujo = $this->crearFlujo(['FLUJO' => [
            'start' => ['message' => 'Hola', 'options' => ['1' => ['text' => 'Ver', 'next_state' => 'no_existe'], '2' => ['text' => 'Otro']]],
        ]]);

        $this->patch("/flujos/{$flujo->slug}/activo", ['activo' => 1])
            ->assertRedirect('/flujos')
            ->assertSessionHas('error', 'No se puede activar «Prueba»: 2 fallas. Ábrelo y corrígelo.')
            ->assertSessionHas('errores', [
                '«start»: la opción 1 va a «no_existe», que no existe.',
                '«start»: la opción 2 no está conectada.',
            ]);

        $this->assertFalse($flujo->fresh()->activo);
    }

    public function test_desactivar_lo_quita_de_la_lista(): void
    {
        $flujo = $this->crearFlujo($this->flujoMinimo(), activo: true);

        $this->patch("/flujos/{$flujo->slug}/activo", ['activo' => 0])
            ->assertSessionHas('estado', '«Prueba» desactivado: ya no se puede elegir (las aplicaciones que lo usan siguen igual).');

        $this->assertFalse($flujo->fresh()->activo);
        $this->api('/api/bots')->assertExactJson(['bots' => []]);
    }

    public function test_la_api_entrega_lo_ultimo_guardado_sin_datos_del_editor(): void
    {
        $flujo = $this->crearFlujo([
            'FLUJO' => [
                'start' => ['message' => '¡Hola! 👋', 'next_state' => 'end', 'options' => new \stdClass],
                'end' => ['message' => 'Chau'],
            ],
            '_editor' => ['titulos' => ['start' => 'Inicio']],
        ], activo: true);

        $respuesta = $this->api("/api/bots/{$flujo->slug}")->assertOk();

        $json = $respuesta->getContent();
        $this->assertStringContainsString('"options":{}', $json);
        $this->assertStringContainsString('¡Hola! 👋', $json, 'sin escapar tildes ni emojis');
        $this->assertSame(['FLUJO', '_bot'], array_keys($respuesta->json()));
        $this->assertSame(['slug', 'nombre', 'actualizado_en'], array_keys($respuesta->json('_bot')));

        // Lo que se guarde después es lo que reciben (la aplicación lo copia cuando vuelve a aplicarlo).
        $this->putJson("/flujos/{$flujo->slug}/borrador", ['contenido' => $this->flujoMinimo('Cambiado')])->assertOk();
        $this->api("/api/bots/{$flujo->slug}")->assertJsonPath('FLUJO.start.message', 'Cambiado');
    }

    public function test_un_bot_activo_guardado_con_fallas_no_se_entrega(): void
    {
        $flujo = $this->crearFlujo($this->flujoMinimo(), activo: true);

        $this->putJson("/flujos/{$flujo->slug}/borrador", ['contenido' => ['FLUJO' => ['start' => ['message' => '']]]])->assertOk();

        $this->api("/api/bots/{$flujo->slug}")
            ->assertUnprocessable()
            ->assertJson(['message' => 'Este bot tiene fallas: corrígelo en el editor antes de usarlo.'])
            ->assertJsonPath('errores', ['«start»: no tiene mensaje.']);
    }

    public function test_guardar_un_bot_activo_no_deja_identificadores_sueltos(): void
    {
        $flujo = $this->crearFlujo($this->flujoMinimo(), activo: true);

        $this->putJson("/flujos/{$flujo->slug}/borrador", ['contenido' => $this->flujoMinimo() + ['_editor' => ['nuevos' => ['paso_1']]]])->assertOk();

        $this->assertArrayNotHasKey('_editor', $flujo->ultimaVersion()->first()->contenido);
    }

    public function test_la_api_de_bots_pide_la_api_key(): void
    {
        $this->crearFlujo($this->flujoMinimo(), activo: true);

        $this->getJson('/api/bots')->assertUnauthorized();
        $this->getJson('/api/bots/prueba')->assertUnauthorized();
    }

    public function test_activar_sin_sesion_no_se_puede(): void
    {
        $flujo = $this->crearFlujo($this->flujoMinimo());
        $this->flushSession();

        $this->patch("/flujos/{$flujo->slug}/activo", ['activo' => 1])->assertUnauthorized();
        $this->assertFalse($flujo->fresh()->activo);
    }

    public function test_la_lista_muestra_el_interruptor(): void
    {
        $this->crearFlujo($this->flujoMinimo(), activo: true);

        $this->get('/flujos')->assertOk()->assertSee('role="switch"', false)->assertSee('Activo');
    }

    public function test_el_validador_pide_start_y_limita_el_largo(): void
    {
        $errores = (new ValidadorFlujo)->errores([
            'paso' => ['message' => str_repeat('a', ValidadorFlujo::MAXIMO_CARACTERES + 1)],
        ]);

        $this->assertSame([
            'Falta el paso de inicio («start»).',
            '«paso»: el mensaje tiene 4097 caracteres (máximo 4096).',
        ], $errores);
    }

    private function api(string $url)
    {
        return $this->withToken(self::CLAVE)->getJson($url);
    }

    private function flujoMinimo(string $mensaje = 'Hola'): array
    {
        return ['FLUJO' => ['start' => ['message' => $mensaje, 'next_state' => 'end'], 'end' => ['message' => 'Chau']]];
    }

    private function crearFlujo(array $contenido, bool $activo = false): Flujo
    {
        $flujo = Flujo::create(['nombre' => 'Prueba', 'slug' => 'prueba', 'activo' => $activo]);
        $flujo->versiones()->create(['numero' => 1, 'estado' => 'borrador', 'contenido' => $contenido]);

        return $flujo;
    }
}
