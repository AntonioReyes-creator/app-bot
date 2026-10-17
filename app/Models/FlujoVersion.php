<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property array<string, mixed> $contenido
 * @property array<string, mixed>|null $layout
 */
// Laravel pluralizaría en inglés ("flujo_versions"); la tabla real es "flujo_versiones".
#[Table('flujo_versiones')]
#[Fillable(['numero', 'estado', 'contenido', 'layout', 'publicada_en'])]
class FlujoVersion extends Model
{
    /**
     * Contenido de un flujo recién creado: el mínimo que el bot entiende (start → end), con los mensajes
     * vacíos para que el usuario escriba los suyos (el editor muestra un ejemplo en gris).
     *
     * @return array{FLUJO: array<string, array<string, string>>}
     */
    public static function contenidoInicial(): array
    {
        return [
            'FLUJO' => [
                'start' => [
                    'message' => '',
                    'next_state' => 'end',
                ],
                'end' => [
                    'message' => '',
                ],
            ],
        ];
    }

    /**
     * @return BelongsTo<Flujo, $this>
     */
    public function flujo(): BelongsTo
    {
        return $this->belongsTo(Flujo::class);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            // Como 'array', pero guarda tildes, ñ y ¡ tal cual (no como á).
            'contenido' => 'json:unicode',
            'layout' => 'json:unicode',
            'publicada_en' => 'datetime',
        ];
    }
}
