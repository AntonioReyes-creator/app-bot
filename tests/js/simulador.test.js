import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENCUESTA_SALIDA, elegirOpcion, iniciar, normalizar, responder } from '../../resources/js/flujo/simulador.js';

// Mismo recorrido que la conversación real de WhatsApp (capturas del usuario, flujo del Poder Judicial).
const flujo = {
    start: {
        message: '*Bienvenido*\n¿En qué puedo atenderte?\n',
        options: {
            1: { text: 'Demandas o escritos', next_state: 'dem_escritos_menu' },
            2: { text: 'Depósito judicial', next_state: 'deposito_intro' },
            11: { text: 'Terminar chat', next_state: 'end' },
            salir: { text: 'Cerrar el chat', next_state: 'end' },
        },
    },
    dem_escritos_menu: {
        message: '*1. Demandas o escritos*\n¿Qué modalidad de presentación desea utilizar?',
        options: { 1: { text: 'Presentación Física', next_state: 'dem_fisica' }, 2: { text: 'Presentación Virtual', next_state: 'end_or_menu' } },
    },
    dem_fisica: { message: '*Presentacion Fisica*\nhttps://gestionsij.pj.gob.pe/citasMP/', next_state: 'end_or_menu' },
    end_or_menu: {
        message: '¿Tendrá alguna otra consulta en la que pueda ayudarlo? 🙂',
        options: { 1: { text: 'Sí, volver a Lista de Servicios', next_state: 'start' }, 2: { text: 'No', next_state: 'encuesta_inicio' } },
    },
    encuesta_inicio: {
        message: 'Por favor, díganos como lo hicimos.\n¿Se encuentra satisfecho con la atención recibida?',
        options: { 1: { text: 'Sí, estoy satisfecho', next_state: 'encuesta_fin' }, 2: { text: 'No, pueden mejorar', next_state: 'encuesta_fin' } },
    },
    encuesta_fin: { message: '¡Hasta pronto! Gracias por utilizar nuestro canal digital.', next_state: 'end' },
    end: { message: 'Gracias por escribir.\n\nSi necesitas ayuda, vuelve a escribirnos.' },
    deposito_intro: { message: 'Escriba el número de su expediente:', next_state: 'deposito_pedir_corte' },
    deposito_pedir_corte: { message: 'Seleccione el área:\n\n{{departamentos}}', next_state: 'deposito_confirmar' },
    deposito_confirmar: { message: 'Usted ingresó una jurisdicción.', options: { 1: { text: 'Sí', next_state: 'end' }, 2: { text: 'No', next_state: 'deposito_pedir_corte' } } },
};

const textos = (r) => r.mensajes.map((m) => m.texto);

test('primer contacto: mensaje de start y TODAS las opciones, también "salir"', () => {
    const r = iniciar(flujo);

    assert.equal(r.estado, 'start');
    assert.deepEqual(textos(r), ['*Bienvenido*\n¿En qué puedo atenderte?\n\n1. Demandas o escritos\n2. Depósito judicial\n11. Terminar chat\nsalir. Cerrar el chat\n']);
});

test('conversación de las capturas: menú → paso combinado con end_or_menu → encuesta → despedida + end', () => {
    let r = responder(flujo, 'start', '1');
    assert.equal(r.estado, 'dem_escritos_menu');
    assert.deepEqual(textos(r), ['*1. Demandas o escritos*\n¿Qué modalidad de presentación desea utilizar?\n1. Presentación Física\n2. Presentación Virtual\n']);

    r = responder(flujo, r.estado, '1');
    assert.equal(r.estado, 'end_or_menu', 'el paso no se detiene: queda esperando la respuesta de end_or_menu');
    assert.deepEqual(textos(r), ['*Presentacion Fisica*\nhttps://gestionsij.pj.gob.pe/citasMP/\n\n¿Tendrá alguna otra consulta en la que pueda ayudarlo? 🙂\n\n1.- Sí, volver a Lista de Servicios\n2.- No']);

    r = responder(flujo, r.estado, '2');
    assert.equal(r.estado, 'encuesta_inicio');

    r = responder(flujo, r.estado, '1');
    assert.equal(r.estado, 'end');
    assert.deepEqual(textos(r), ['¡Hasta pronto! Gracias por utilizar nuestro canal digital.\n\nGracias por escribir.\n\nSi necesitas ayuda, vuelve a escribirnos.']);

    assert.equal(responder(flujo, 'end', 'hola').estado, 'start', 'después de terminar, vuelve a empezar');
});

test('sin next_state en encuesta_fin solo se envía su mensaje (no se une con end)', () => {
    const sinEnd = { ...flujo, encuesta_fin: { message: '¡Hasta pronto!' } };
    const r = responder(sinEnd, 'encuesta_inicio', '1');

    assert.equal(r.estado, 'encuesta_fin');
    assert.deepEqual(textos(r), ['¡Hasta pronto!']);
});

test('opción inválida: el motor repite las opciones y no cambia de estado', () => {
    const r = responder(flujo, 'end_or_menu', '7');

    assert.equal(r.estado, 'end_or_menu');
    assert.match(r.mensajes[0].texto, /^❌ La opción '7' no está disponible \*_\*\.\n\nPor favor, selecciona una opción válida entre: 1 - 2/);
    assert.match(r.mensajes[0].texto, /🔹 1\. Sí, volver a Lista de Servicios\n🔹 2\. No\n\n💡 Escribe únicamente el número/);
    assert.match(responder(flujo, 'end_or_menu', 'quizás').mensajes[0].texto, /Lo siento, no entendí/);
});

test('la opción se reconoce por su número, por su texto (sin tildes ni mayúsculas) o por sus keywords', () => {
    const conKeywords = { options: { 1: { text: 'Sí', next_state: 'a' }, 2: { text: 'Depósito', keywords: ['plata'], next_state: 'b' } } };

    assert.equal(elegirOpcion(conKeywords, ' 2 ')[0], '2');
    assert.equal(elegirOpcion(conKeywords, 'DEPOSITO')[0], '2');
    assert.equal(elegirOpcion(conKeywords, 'quiero mi plata')[0], '2');
    assert.equal(elegirOpcion(conKeywords, 'no sé'), null);
    assert.equal(normalizar('  Salír '), 'salir');
});

test('salir (comando u opción que lleva a end): encuesta de salida y luego el cierre', () => {
    let r = responder(flujo, 'dem_escritos_menu', 'Salír');
    assert.equal(r.estado, 'calificacion_servicio');
    assert.deepEqual(textos(r), [ENCUESTA_SALIDA]);
    assert.ok(r.mensajes[0].nota);

    assert.equal(responder(flujo, 'start', '11').estado, 'calificacion_servicio', 'la opción "Terminar chat" va a end');

    r = responder(flujo, 'calificacion_servicio', '10');
    assert.equal(r.estado, 'finalizado');
    assert.deepEqual(textos(r), ['Muchas gracias por su calificación.\n\n¡Hasta pronto! Gracias por utilizar nuestro canal digital.\n\nGracias por escribir.\n\nSi necesitas ayuda, vuelve a escribirnos.']);
});

test('pasos que piden datos no se combinan; la lista de áreas es de ejemplo y se marca con una nota', () => {
    let r = responder(flujo, 'start', '2');
    assert.equal(r.estado, 'deposito_intro', 'el siguiente pide elegir de la lista: no se combina');
    assert.deepEqual(textos(r), ['Escriba el número de su expediente:']);

    r = responder(flujo, r.estado, '00125-2021');
    assert.equal(r.estado, 'deposito_pedir_corte', 'en un paso, lo que escriba la persona se ignora y se avanza');
    assert.match(r.mensajes[0].texto, /Seleccione el área:\n\n1\. Área de ejemplo 1\n2\. /);
    assert.ok(r.mensajes[0].nota);

    r = responder(flujo, r.estado, '2');
    assert.equal(r.estado, 'deposito_confirmar');
    assert.equal(r.mensajes[0].texto, 'Usted ingresó: Área de ejemplo 2\n¿Es correcto el valor mostrado?\n\n1. Sí\n2. No');

    assert.match(responder(flujo, 'deposito_pedir_corte', '99').mensajes[0].texto, /^❌ Opción inválida/);
});

test('opción sin conectar o a un paso borrado (QA H7/H14): lo dice y se queda en el mismo paso', () => {
    const f = { start: { message: 'Hola', options: { 1: { text: 'A', next_state: null }, 2: { text: 'B', next_state: 'borrado' }, 3: { text: 'C', next_state: 'c' } } }, c: { message: 'Ce' } };

    let r = responder(f, 'start', '1');
    assert.equal(r.estado, 'start');
    assert.match(r.mensajes[0].texto, /todavía no lleva a ningún paso/);
    r = responder(f, 'start', '2');
    assert.equal(r.estado, 'start');
    assert.match(r.mensajes[0].nota, /«borrado» fue borrado/);
    assert.equal(responder(f, 'start', '3').estado, 'c', 'y se puede seguir probando');
});
