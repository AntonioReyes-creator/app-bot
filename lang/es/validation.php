<?php

// Solo las reglas que usa el proyecto; las demás caen al inglés (APP_FALLBACK_LOCALE).
return [
    'required' => 'El campo :attribute es obligatorio.',
    'string' => 'El campo :attribute debe ser texto.',
    'max' => [
        'string' => 'El campo :attribute no debe tener más de :max caracteres.',
    ],

    'attributes' => [
        'nombre' => 'nombre',
    ],
];
