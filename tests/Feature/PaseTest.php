<?php

namespace Tests\Feature;

use App\Models\Acceso;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Entrada al editor con un pase de un solo uso: POST /api/accesos → GET /entrar/{pase}. */
class PaseTest extends TestCase
{
    use RefreshDatabase;

    private const CLAVE = 'clave-de-prueba-123';

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.api_key' => self::CLAVE]);
    }

    public function test_crear_un_pase_requiere_la_api_key(): void
    {
        $this->postJson('/api/accesos', ['usuario_id' => 7, 'nombre' => 'Ana'])->assertUnauthorized();
        $this->assertSame(0, Acceso::count());
    }

    public function test_crear_un_pase_devuelve_la_url_y_guarda_solo_el_hash(): void
    {
        $respuesta = $this->withToken(self::CLAVE)
            ->postJson('/api/accesos', ['usuario_id' => 7, 'nombre' => 'Ana Pérez', 'aplicacion_id' => 3])
            ->assertCreated()
            ->assertJsonStructure(['url', 'vence_en']);

        $pase = basename($respuesta->json('url'));
        $this->assertSame(64, strlen($pase));

        $acceso = Acceso::sole();
        $this->assertSame(hash('sha256', $pase), $acceso->pase_hash);
        $this->assertNotSame($pase, $acceso->pase_hash, 'el pase en claro no se guarda');
        $this->assertNull($acceso->usado_en);
    }

    public function test_crear_un_pase_valida_los_datos(): void
    {
        $this->withToken(self::CLAVE)->postJson('/api/accesos', ['nombre' => 'Ana'])
            ->assertUnprocessable()->assertJsonValidationErrors('usuario_id');

        $this->withToken(self::CLAVE)->postJson('/api/accesos', ['usuario_id' => 7])
            ->assertUnprocessable()->assertJsonValidationErrors('nombre');
    }

    public function test_entrar_con_el_pase_abre_la_sesion(): void
    {
        $pase = $this->pedirPase();

        $this->get("/entrar/{$pase}")
            ->assertRedirect('/flujos')
            ->assertSessionHas('acceso', ['id' => 7, 'nombre' => 'Ana Pérez', 'aplicacion_id' => 3]);

        $this->get('/flujos')->assertOk()->assertSee('Ana Pérez');
    }

    public function test_el_pase_sirve_una_sola_vez(): void
    {
        $pase = $this->pedirPase();
        $this->get("/entrar/{$pase}")->assertRedirect('/flujos');

        $this->flushSession();
        $this->get("/entrar/{$pase}")->assertUnauthorized()->assertSee('ya se usó');
        $this->get('/flujos')->assertUnauthorized();
    }

    public function test_el_pase_vence(): void
    {
        $pase = $this->pedirPase();

        $this->travel(Acceso::MINUTOS + 1)->minutes();

        $this->get("/entrar/{$pase}")->assertUnauthorized()->assertSee('venció');
        $this->assertNull(Acceso::sole()->usado_en, 'un pase vencido no se marca como usado');
    }

    public function test_un_pase_inventado_no_entra(): void
    {
        $this->get('/entrar/' . str_repeat('a', 64))->assertUnauthorized();
        $this->get('/flujos')->assertUnauthorized();
    }

    private function pedirPase(): string
    {
        $url = $this->withToken(self::CLAVE)
            ->postJson('/api/accesos', ['usuario_id' => 7, 'nombre' => 'Ana Pérez', 'aplicacion_id' => 3])
            ->json('url');

        return basename($url);
    }
}
