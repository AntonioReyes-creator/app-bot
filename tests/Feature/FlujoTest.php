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

        $crudo = DB::table('flujo_versiones')->value('contenido');
        $this->assertStringContainsString('¡Hola! Bienvenido.', $crudo);
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

    public function test_nombre_repetido_genera_slug_distinto(): void
    {
        $this->post('/flujos', ['nombre' => 'ONPE']);
        $this->post('/flujos', ['nombre' => 'ONPE']);
        $this->post('/flujos', ['nombre' => 'onpe']);

        $this->assertSame(['onpe', 'onpe-2', 'onpe-3'], Flujo::orderBy('id')->pluck('slug')->all());
    }
}
