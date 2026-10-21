<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable(['nombre', 'slug', 'activo'])]
class Flujo extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'activo' => 'boolean', // aparece en la lista de bots que ven las aplicaciones (GET /api/bots)
        ];
    }

    /**
     * Versiones del flujo (borradores y publicadas), de la más antigua a la más nueva.
     *
     * @return HasMany<FlujoVersion, $this>
     */
    public function versiones(): HasMany
    {
        return $this->hasMany(FlujoVersion::class)->orderBy('numero');
    }

    /**
     * La versión con el número más alto: la que se abre en el editor.
     *
     * @return HasOne<FlujoVersion, $this>
     */
    public function ultimaVersion(): HasOne
    {
        return $this->hasOne(FlujoVersion::class)->latestOfMany('numero');
    }
}
