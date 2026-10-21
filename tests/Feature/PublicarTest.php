<?php

namespace Tests\Feature;

use App\Models\Flujo;
use App\Services\ValidadorFlujo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Publicar (POST /flujos/{slug}/publicar) y lo que recibe el bot (GET /api/flujos/{slug}/publicado). */
class PublicarTest extends TestCase
{
    use RefreshDatabase;

    private const CLAVE = 'clave-de-prueba-123';

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.api_key' => self::CLAVE]);
        $this->withSession(['acceso' => ['id' => 1, 'nombre' => 'Admin de prueba']]);
    }

    public function test_publicar_marca_la_version_y_vacia_los_nuevos(): void
    {
        $flujo = $this->crearFlujo([
            'FLUJO' => [
                'start' => ['message' => 'Hola', 'options' => ['1' => ['text' => 'Ver', 'next_state' => 'ver'], 'salir' => ['text' => 'Salir', 'next_state' => 'end']]],
                'ver' => ['message' => 'Info', 'next_state' => 'end', 'options' => new \stdClass],
                'end' => ['message' => 'Chau'],
            ],
            '_editor' => ['titulos' => ['ver' => 'Ver información'], 'nuevos' => ['ver']],
        ]);

        $this->postJson("/flujos/{$flujo->slug}/publicar")
            ->assertOk()
            ->assertJson(['numero' => 1]);

        $version = $flujo->ultimaVersion()->first();
        $this->assertSame('publicada', $version->estado);
        $this->assertNotNull($version->publicada_en);
        $this->assertSame(['titulos' => ['ver' => 'Ver información']], $version->contenido['_editor'], 'nuevos se vacía; titulos se queda');

        $crudo = DB::table('flujo_versiones')->value('contenido');
        $this->assertStringContainsString('"options":{}', str_replace(' ', '', $crudo), '{} no se convierte en []');
    }

    public function test_con_fallas_no_se_publica_y_dice_cuales(): void
    {
        $flujo = $this->crearFlujo(['FLUJO' => [
            'start' => ['message' => 'Hola', 'options' => ['1' => ['text' => 'Ver', 'next_state' => 'no_existe'], '2' => ['text' => 'Otro']]],
            'mudo' => ['message' => '   '],
        ]]);

        $this->postJson("/flujos/{$flujo->slug}/publicar")
            ->assertUnprocessable()
            ->assertJson(['message' => 'No se puede publicar: 3 fallas.'])
            ->assertJsonPath('errores', [
                '«start»: la opción 1 va a «no_existe», que no existe.',
                '«start»: la opción 2 no está conectada.',
                '«mudo»: no tiene mensaje.',
            ]);

        $this->assertSame('borrador', $flujo->ultimaVersion()->first()->estado);
    }

    public function test_publicar_dos_veces_la_misma_version_no_se_puede(): void
    {
        $flujo = $this->crearFlujo($this->flujoMinimo());
        $this->postJson("/flujos/{$flujo->slug}/publicar")->assertOk();

        $this->postJson("/flujos/{$flujo->slug}/publicar")
            ->assertUnprocessable()
            ->assertJson(['message' => 'La versión 1 ya está publicada. Haz cambios y guarda para publicar otra.']);
    }

    public function test_tras_publicar_guardar_crea_el_borrador_siguiente_y_el_bot_sigue_con_la_publicada(): void
    {
        $flujo = $this->crearFlujo($this->flujoMinimo('Versión uno'));
        $this->postJson("/flujos/{$flujo->slug}/publicar")->assertOk();

        $this->putJson("/flujos/{$flujo->slug}/borrador", ['contenido' => $this->flujoMinimo('Versión dos')])
            ->assertOk()->assertJson(['numero' => 2]);

        $this->withToken(self::CLAVE)->getJson("/api/flujos/{$flujo->slug}/publicado")
            ->assertOk()
            ->assertJsonPath('FLUJO.start.message', 'Versión uno')
            ->assertJsonPath('_publicacion.version', 1);

        $this->postJson("/flujos/{$flujo->slug}/publicar")->assertOk()->assertJson(['numero' => 2]);
        $this->withToken(self::CLAVE)->getJson("/api/flujos/{$flujo->slug}/publicado")
            ->assertJsonPath('FLUJO.start.message', 'Versión dos')
            ->assertJsonPath('_publicacion.version', 2);
    }

    public function test_la_api_entrega_flujo_sin_datos_del_editor_y_conserva_objetos_vacios(): void
    {
        $flujo = $this->crearFlujo([
            'FLUJO' => [
                'start' => ['message' => '¡Hola! 👋', 'next_state' => 'end', 'options' => new \stdClass],
                'end' => ['message' => 'Chau'],
            ],
            '_editor' => ['titulos' => ['start' => 'Inicio']],
        ]);
        $this->postJson("/flujos/{$flujo->slug}/publicar")->assertOk();

        $respuesta = $this->withToken(self::CLAVE)->get("/api/flujos/{$flujo->slug}/publicado")->assertOk();

        $json = $respuesta->getContent();
        $this->assertStringContainsString('"options":{}', $json);
        $this->assertStringContainsString('¡Hola! 👋', $json, 'sin escapar tildes ni emojis');
        $this->assertSame(['FLUJO', '_publicacion'], array_keys($respuesta->json()));
        $this->assertSame(['flujo', 'slug', 'version', 'publicada_en'], array_keys($respuesta->json('_publicacion')));
    }

    public function test_la_api_sin_version_publicada_responde_404(): void
    {
        $flujo = $this->crearFlujo($this->flujoMinimo());

        $this->withToken(self::CLAVE)->getJson("/api/flujos/{$flujo->slug}/publicado")
            ->assertNotFound()
            ->assertJson(['message' => 'Este flujo todavía no tiene una versión publicada.']);

        $this->withToken(self::CLAVE)->getJson('/api/flujos/no-existe/publicado')->assertNotFound();
    }

    public function test_la_api_del_publicado_pide_la_api_key(): void
    {
        $flujo = $this->crearFlujo($this->flujoMinimo());
        $this->postJson("/flujos/{$flujo->slug}/publicar")->assertOk();

        $this->getJson("/api/flujos/{$flujo->slug}/publicado")->assertUnauthorized();
    }

    public function test_publicar_sin_sesion_no_se_puede(): void
    {
        $flujo = $this->crearFlujo($this->flujoMinimo());
        $this->flushSession();

        $this->postJson("/flujos/{$flujo->slug}/publicar")->assertUnauthorized();
        $this->assertSame('borrador', $flujo->ultimaVersion()->first()->estado);
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

    private function flujoMinimo(string $mensaje = 'Hola'): array
    {
        return ['FLUJO' => ['start' => ['message' => $mensaje, 'next_state' => 'end'], 'end' => ['message' => 'Chau']]];
    }

    private function crearFlujo(array $contenido): Flujo
    {
        $flujo = Flujo::create(['nombre' => 'Prueba', 'slug' => 'prueba']);
        $flujo->versiones()->create(['numero' => 1, 'estado' => 'borrador', 'contenido' => $contenido]);

        return $flujo;
    }
}
