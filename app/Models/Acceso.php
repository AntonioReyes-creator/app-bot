<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Pase de un solo uso: el proyecto existente lo pide por API y el navegador del administrador lo canjea
 * en /entrar/{pase} por una sesión. Se guarda solo el hash del pase.
 */
#[Fillable(['pase_hash', 'usuario_id', 'nombre', 'aplicacion_id', 'vence_en', 'usado_en'])]
class Acceso extends Model
{
    /** Minutos que vale un pase: lo justo para que el navegador siga la redirección. */
    public const MINUTOS = 2;

    public static function hashDe(string $pase): string
    {
        return hash('sha256', $pase);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'vence_en' => 'datetime',
            'usado_en' => 'datetime',
        ];
    }
}
