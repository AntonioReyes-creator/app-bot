<?php

namespace Tests\Feature;

use App\Models\Flujo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Dos pestañas con el mismo flujo: guardar no pisa sin preguntar (huella → 409). */
class GuardarConflictoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withSession(['acceso' => ['id' => 1, 'nombre' => 'Admin de prueba']]);
        $this->post('/flujos', ['nombre' => 'Prueba']);
    }

    public function test_el_editor_recibe_la_huella_de_lo_guardado(): void
    {
        $huella = Flujo::sole()->ultimaVersion->huella();

        $this->get('/flujos/prueba/editar')->assertSee('"huella":"' . $huella . '"', false);
    }

    public function test_con_la_huella_al_dia_guarda_y_devuelve_la_nueva(): void
    {
        $huella = Flujo::sole()->ultimaVersion->huella();

        $respuesta = $this->guardar('Pestaña A', $huella)->assertOk();

        $nueva = Flujo::sole()->ultimaVersion->huella();
        $this->assertNotSame($huella, $nueva);
        $this->assertSame($nueva, $respuesta->json('huella'), 'la pestaña sigue al día para el siguiente guardado');
        $this->guardar('Pestaña A otra vez', $nueva)->assertOk();
    }

    public function test_si_otra_pestana_guardo_antes_responde_409_y_no_pisa(): void
    {
        $huellaAlAbrir = Flujo::sole()->ultimaVersion->huella(); // las dos pestañas abren con esta

        $this->guardar('Pestaña B', $huellaAlAbrir)->assertOk();

        $this->guardar('Pestaña A', $huellaAlAbrir)
            ->assertStatus(409)
            ->assertJson(['conflicto' => true, 'message' => 'Este flujo cambió en otra pestaña o ventana (se guardó o se activó).']);

        $this->assertSame('Pestaña B', $this->mensajeGuardado());
    }

    public function test_con_forzar_reemplaza_lo_de_la_otra_pestana(): void
    {
        $huellaAlAbrir = Flujo::sole()->ultimaVersion->huella();
        $this->guardar('Pestaña B', $huellaAlAbrir)->assertOk();

        $this->guardar('Pestaña A', $huellaAlAbrir, forzar: true)->assertOk();

        $this->assertSame('Pestaña A', $this->mensajeGuardado());
    }

    public function test_activar_cambia_la_huella(): void
    {
        $huellaAlAbrir = Flujo::sole()->ultimaVersion->huella();
        // Un paso nuevo (en _editor.nuevos): activar lo fija y eso cambia lo guardado.
        $this->guardar('Hola', $huellaAlAbrir, nuevos: ['paso_1'])->assertOk();
        $huella = Flujo::sole()->ultimaVersion->huella();

        $this->patch('/flujos/prueba/activo', ['activo' => 1])->assertSessionHas('estado');

        $this->guardar('Desde el editor abierto', $huella)->assertStatus(409);
    }

    public function test_sin_huella_guarda_como_antes(): void
    {
        $this->putJson('/flujos/prueba/borrador', ['contenido' => $this->contenido('Sin huella')])->assertOk();

        $this->assertSame('Sin huella', $this->mensajeGuardado());
    }

    private function guardar(string $mensaje, string $huella, bool $forzar = false, array $nuevos = [])
    {
        $contenido = $this->contenido($mensaje) + ($nuevos ? ['_editor' => ['nuevos' => $nuevos]] : []);

        return $this->putJson('/flujos/prueba/borrador', ['contenido' => $contenido, 'huella' => $huella, 'forzar' => $forzar]);
    }

    private function contenido(string $mensaje): array
    {
        return ['FLUJO' => ['start' => ['message' => $mensaje, 'next_state' => 'end'], 'end' => ['message' => 'Chau']]];
    }

    private function mensajeGuardado(): string
    {
        return Flujo::sole()->ultimaVersion()->first()->contenido['FLUJO']['start']['message'];
    }
}
