<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// Laravel pluralizaría en inglés ("flujo_versions"); la tabla real es "flujo_versiones".
#[Table('flujo_versiones')]
#[Fillable(['numero', 'estado', 'contenido', 'layout', 'publicada_en'])]
class FlujoVersion extends Model
{
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
            'contenido' => 'array',
            'layout' => 'array',
            'publicada_en' => 'datetime',
        ];
    }
}
