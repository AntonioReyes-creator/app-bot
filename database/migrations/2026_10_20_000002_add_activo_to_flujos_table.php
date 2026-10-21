<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Activo = el bot aparece en la lista que ven las aplicaciones del proyecto existente (GET /api/bots).
     */
    public function up(): void
    {
        Schema::table('flujos', function (Blueprint $table) {
            $table->boolean('activo')->default(false)->after('slug');
        });
    }

    public function down(): void
    {
        Schema::table('flujos', function (Blueprint $table) {
            $table->dropColumn('activo');
        });
    }
};
