<?php

namespace Tests\Feature;

use App\Models\Flujo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccesoTest extends TestCase
{
    use RefreshDatabase;

    public function test_sin_sesion_no_se_ve_la_lista(): void
    {
        $this->get('/flujos')
            ->assertUnauthorized()
            ->assertSee('Entra desde el sistema principal')
            ->assertDontSee('Todavía no hay flujos');
    }

    public function test_sin_sesion_guardar_responde_json_401_y_no_cambia_nada(): void
    {
        $flujo = $this->crearFlujo();

        $this->putJson("/flujos/{$flujo->slug}/borrador", ['contenido' => ['FLUJO' => ['start' => ['message' => 'pirata']]]])
            ->assertUnauthorized()
            ->assertJson(['message' => 'Tu sesión venció o no iniciaste sesión. Entra desde el sistema principal.']);

        $this->assertSame('Hola', $flujo->ultimaVersion()->first()->contenido['FLUJO']['start']['message']);
    }

    public function test_sin_sesion_no_se_puede_borrar_ni_crear(): void
    {
        $flujo = $this->crearFlujo();

        $this->delete("/flujos/{$flujo->slug}")->assertUnauthorized();
        $this->post('/flujos', ['nombre' => 'Otro'])->assertUnauthorized();

        $this->assertSame(['Prueba'], Flujo::pluck('nombre')->all());
    }

    public function test_con_sesion_se_entra(): void
    {
        $this->withSession(['acceso' => ['id' => 1, 'nombre' => 'Admin']])
            ->get('/flujos')
            ->assertOk();
    }

    public function test_la_ruta_de_salud_sigue_publica(): void
    {
        $this->get('/up')->assertOk();
    }

    public function test_acceso_local_abre_sesion_solo_en_entorno_local(): void
    {
        config(['app.acceso_local' => true]);

        // En "testing" (o producción) el flag no abre nada.
        $this->get('/flujos')->assertUnauthorized();

        $this->app['env'] = 'local';
        $this->get('/flujos')->assertOk()->assertSessionHas('acceso.nombre', 'Desarrollo local');
    }

    public function test_con_sesion_la_barra_muestra_salir(): void
    {
        $this->withSession(['acceso' => ['id' => 1, 'nombre' => 'Ana']])
            ->get('/flujos')
            ->assertSee('👤 Ana')
            ->assertSee('action="' . route('acceso.salir') . '"', false);
    }

    public function test_salir_cierra_la_sesion(): void
    {
        $this->withSession(['acceso' => ['id' => 1, 'nombre' => 'Ana']])
            ->post('/salir')
            ->assertOk()
            ->assertSee('Sesión cerrada')
            ->assertSee('Para volver, entra desde el sistema principal.')
            ->assertDontSee('👤 Ana')
            ->assertSessionMissing('acceso');

        $this->get('/flujos')->assertUnauthorized();
    }

    public function test_salir_sin_sesion_no_falla(): void
    {
        $this->post('/salir')->assertOk()->assertSee('Sesión cerrada');
    }

    public function test_sin_sesion_la_barra_no_muestra_salir(): void
    {
        $this->get('/flujos')->assertUnauthorized()->assertDontSee(route('acceso.salir'));
    }

    private function crearFlujo(): Flujo
    {
        $flujo = Flujo::create(['nombre' => 'Prueba', 'slug' => 'prueba']);
        $flujo->versiones()->create(['numero' => 1, 'estado' => 'borrador', 'contenido' => ['FLUJO' => ['start' => ['message' => 'Hola']]]]);

        return $flujo;
    }
}
