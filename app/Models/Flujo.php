<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable(['nombre', 'slug'])]
class Flujo extends Model
{
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
