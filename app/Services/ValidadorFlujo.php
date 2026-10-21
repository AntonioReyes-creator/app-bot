<?php

namespace App\Services;

/**
 * Revisión del servidor antes de publicar: solo lo que ROMPERÍA el bot (sin inicio, paso sin mensaje o demasiado
 * largo, salida sin conectar o hacia un paso que no existe). El análisis completo (caminos sin cierre, finales
 * mudos, comandos…) lo hace el editor (resources/js/flujo/revision.js) y no se duplica aquí.
 */
class ValidadorFlujo
{
    /** Máximo de caracteres de un mensaje de WhatsApp (el mismo que MAXIMO_CARACTERES en revision.js). */
    public const MAXIMO_CARACTERES = 4096;

    /**
     * @param  array<string, mixed>  $flujo  el objeto FLUJO (estado => {message, next_state?, options?})
     * @return list<string> errores en lenguaje sencillo; vacío = se puede publicar
     */
    public function errores(array $flujo): array
    {
        $errores = [];

        if (! array_key_exists('start', $flujo)) {
            $errores[] = 'Falta el paso de inicio («start»).';
        }

        foreach ($flujo as $nombre => $estado) {
            if (! is_array($estado)) {
                $errores[] = "«{$nombre}»: no tiene el formato correcto.";

                continue;
            }

            $mensaje = $estado['message'] ?? '';
            if (! is_string($mensaje) || trim($mensaje) === '') {
                $errores[] = "«{$nombre}»: no tiene mensaje.";
            } elseif (mb_strlen($mensaje) > self::MAXIMO_CARACTERES) {
                $errores[] = "«{$nombre}»: el mensaje tiene " . mb_strlen($mensaje) . ' caracteres (máximo ' . self::MAXIMO_CARACTERES . ').';
            }

            // Paso directo: next_state (como salidas() en flujo-a-drawflow.js, se revisa aunque también haya opciones).
            if (array_key_exists('next_state', $estado)) {
                $this->revisarDestino($errores, $flujo, $nombre, 'su salida', $estado['next_state']);
            }

            foreach (is_array($estado['options'] ?? null) ? $estado['options'] : [] as $clave => $opcion) {
                $this->revisarDestino($errores, $flujo, $nombre, "la opción {$clave}",
                    is_array($opcion) ? ($opcion['next_state'] ?? null) : null);
            }
        }

        return $errores;
    }

    /**
     * @param  list<string>  $errores
     * @param  array<string, mixed>  $flujo
     */
    private function revisarDestino(array &$errores, array $flujo, string $nombre, string $salida, mixed $destino): void
    {
        if ($destino === null || $destino === '') {
            $errores[] = "«{$nombre}»: {$salida} no está conectada.";
        } elseif (! is_string($destino) || ! array_key_exists($destino, $flujo)) {
            $errores[] = "«{$nombre}»: {$salida} va a «" . (is_string($destino) ? $destino : '?') . '», que no existe.';
        }
    }
}
