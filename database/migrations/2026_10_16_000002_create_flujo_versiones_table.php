<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('flujo_versiones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('flujo_id')->constrained('flujos')->cascadeOnDelete();
            $table->unsignedInteger('numero');
            $table->string('estado')->default('borrador'); // borrador | publicada
            $table->json('contenido');                      // {"FLUJO": {...}} tal cual, fuente de verdad
            $table->json('layout')->nullable();             // posiciones de las cajas en el lienzo
            $table->timestamp('publicada_en')->nullable();
            $table->timestamps();

            $table->unique(['flujo_id', 'numero']); // no puede haber dos "versión 3" del mismo flujo
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('flujo_versiones');
    }
};
