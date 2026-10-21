<?php

namespace Tests\Feature;

use Tests\TestCase;

class ApiKeyTest extends TestCase
{
    private const CLAVE = 'clave-de-prueba-123';

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.api_key' => self::CLAVE]);
    }

    public function test_con_la_clave_correcta_responde(): void
    {
        $this->withToken(self::CLAVE)->getJson('/api/estado')
            ->assertOk()
            ->assertExactJson(['ok' => true, 'servicio' => 'app-bot']);
    }

    public function test_sin_clave_responde_401_en_json(): void
    {
        // Aunque no pida JSON (Accept), una ruta /api/* responde en JSON (bootstrap/app.php).
        $this->get('/api/estado')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'API key inválida o ausente.']);
    }

    public function test_con_clave_incorrecta_responde_401(): void
    {
        $this->withToken('otra-clave')->getJson('/api/estado')->assertUnauthorized();
        $this->withToken(self::CLAVE . 'x')->getJson('/api/estado')->assertUnauthorized();
    }

    public function test_sin_api_key_configurada_rechaza_todo(): void
    {
        config(['app.api_key' => '']);

        // Ni siquiera una clave vacía coincide con una configuración vacía.
        $this->withToken('')->getJson('/api/estado')->assertUnauthorized();
        $this->getJson('/api/estado')->assertUnauthorized();
    }

    public function test_la_sesion_del_editor_no_sirve_para_la_api(): void
    {
        $this->withSession(['acceso' => ['id' => 1, 'nombre' => 'Admin']])
            ->getJson('/api/estado')
            ->assertUnauthorized();
    }
}
