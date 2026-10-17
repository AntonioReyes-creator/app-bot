import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conexionesQueCruzan, cruzaCajas, puntosCurva } from '../../resources/js/flujo/geometria.js';

// Tres cajas en fila: a (izquierda), b (en medio), c (derecha). Cada una 280 × 100.
const cajas = {
    a: { x: 0, y: 0, ancho: 280, alto: 100 },
    b: { x: 400, y: 0, ancho: 280, alto: 100 },
    c: { x: 800, y: 0, ancho: 280, alto: 100 },
};
const salidaDe = (n) => ({ x: cajas[n].x + cajas[n].ancho, y: cajas[n].y + 50 });
const entradaDe = (n) => ({ x: cajas[n].x, y: cajas[n].y + 50 });

test('puntosCurva sigue la curva de Drawflow: empieza y termina en las bolitas, sale horizontal', () => {
    const puntos = puntosCurva({ x: 0, y: 0 }, { x: 100, y: 100 }, 4);
    assert.equal(puntos.length, 3);
    assert.ok(puntos.every((p) => p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100));
    assert.deepEqual(puntos[1], { x: 50, y: 50 }, 'simétrica: el punto medio está en el centro');
});

test('una línea que atraviesa otra caja la cruza; las cajas que une no cuentan', () => {
    assert.ok(cruzaCajas(salidaDe('a'), entradaDe('c'), cajas, ['a', 'c']), 'de a a c pasa por b');
    assert.ok(!cruzaCajas(salidaDe('a'), entradaDe('b'), cajas, ['a', 'b']), 'de a a b no pasa por nadie');
});

test('cajas lejos pero con el camino libre: la línea se mantiene', () => {
    const lejos = { a: cajas.a, z: { x: 2500, y: 1500, ancho: 280, alto: 100 } };
    assert.ok(!cruzaCajas({ x: 280, y: 50 }, { x: 2500, y: 1550 }, lejos, ['a', 'z']));
});

test('una caja por encima del camino no lo cruza', () => {
    const conEncima = { ...cajas, b: { x: 400, y: -400, ancho: 280, alto: 100 } };
    assert.ok(!cruzaCajas(salidaDe('a'), entradaDe('c'), conEncima, ['a', 'c']));
});

test('conexionesQueCruzan devuelve solo las claves que cruzan otras cajas', () => {
    const conexiones = [
        { clave: 'a#0', origen: 'a', destino: 'b', p1: salidaDe('a'), p2: entradaDe('b') },
        { clave: 'a#1', origen: 'a', destino: 'c', p1: salidaDe('a'), p2: entradaDe('c') },
    ];
    assert.deepEqual([...conexionesQueCruzan(conexiones, cajas)], ['a#1']);
});
