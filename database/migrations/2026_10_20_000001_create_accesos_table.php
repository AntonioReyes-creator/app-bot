<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pases de un solo uso para entrar al editor desde el proyecto existente (POST /api/accesos → GET /entrar/{pase}).
     */
    public function up(): void
    {
        Schema::create('accesos', function (Blueprint $table) {
            $table->id();
            $table->string('pase_hash', 64)->unique();          // sha256 del pase: el pase en claro no se guarda
            $table->unsignedBigInteger('usuario_id');           // id del administrador en el proyecto existente
            $table->string('nombre', 150);                      // para mostrarlo y saber quién entró
            $table->unsignedBigInteger('aplicacion_id')->nullable(); // aplicación de WhatsApp desde la que entra
            $table->timestamp('vence_en');
            $table->timestamp('usado_en')->nullable();          // un solo uso
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accesos');
    }
};
