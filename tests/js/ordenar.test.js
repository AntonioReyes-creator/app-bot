import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTANCIA_ATAJO, conexionesLejanas, flujoADrawflow, tiposDeConexion } from '../../resources/js/flujo/flujo-a-drawflow.js';
import { ordenarArbol } from '../../resources/js/flujo/ordenar.js';

// start → menu_a → (volver a start) ; start → menu_b ; tres estados van a end
const flujo = {
    start: { message: 'Hola', options: { 1: { text: 'A', next_state: 'menu_a' }, 2: { text: 'B', next_state: 'menu_b' }, 3: { text: 'Salir', next_state: 'end' } } },
    menu_a: { message: 'A', options: { 1: { text: 'Volver', next_state: 'start' }, 2: { text: 'Fin', next_state: 'end' } } },
    menu_b: { message: 'B', options: { 1: { text: 'Hoja', next_state: 'hoja' }, 2: { text: 'Fin', next_state: 'end' } } },
    hoja: { message: 'Hoja' },
    end: { message: 'Fin' },
    suelto: { message: 'Sin conexión', next_state: 'end' },
};

test('tiposDeConexion (solo para Ordenar): regreso, frecuente y línea', () => {
    const tipos = tiposDeConexion(flujo);

    assert.deepEqual(tipos.start, ['linea', 'linea', 'frecuente']); // end recibe 4 conexiones
    assert.deepEqual(tipos.menu_a, ['regreso', 'frecuente']);        // volver a start
    assert.deepEqual(tipos.menu_b, ['linea', 'frecuente']);
});

// --- Dibujo: línea si las cajas están cerca, etiqueta si están lejos (DISTANCIA_ATAJO) ---

const caja = (datos, n) => Object.values(datos.drawflow.Home.data).find((x) => x.name === n);

test('cajas cercanas: hacia adelante es línea (aunque el destino tenga muchas entradas); volver atrás es etiqueta ↩', () => {
    // todo junto en pantalla: end (a la derecha) recibe 4 conexiones; menu_a vuelve a start (a la izquierda)
    const cerca = { start: { x: 40, y: 40 }, menu_a: { x: 400, y: 40 }, menu_b: { x: 400, y: 260 }, hoja: { x: 760, y: 260 }, end: { x: 760, y: 40 }, suelto: { x: 760, y: 480 } };
    const { datos, conexiones } = flujoADrawflow(flujo, cerca);

    assert.deepEqual(conexiones, { lineas: 7, atajos: 1 });
    assert.equal(caja(datos, 'menu_a').outputs.output_2.connections.length, 1, 'menu_a → end (adelante, cerca) = línea');
    assert.equal(caja(datos, 'menu_a').outputs.output_1.connections.length, 0, 'volver a start = sin línea');
    assert.match(caja(datos, 'menu_a').html, /data-ir="start"[^>]*>&#8617; start/);
    assert.equal(caja(datos, 'suelto').outputs.output_1.connections.length, 1, 'misma columna (end arriba) no cuenta como "atrás"');
    assert.doesNotMatch(caja(datos, 'start').html, /caja-atajo/);
});

test('cajas lejanas: etiqueta ↩ si el destino está a la izquierda y ⇢ si está a la derecha, sin línea', () => {
    const lejos = { start: { x: 40, y: 40 }, menu_a: { x: 400, y: 3000 }, menu_b: { x: 400, y: 260 }, hoja: { x: 760, y: 260 }, end: { x: 2400, y: 40 }, suelto: { x: 760, y: 480 } };
    const { datos } = flujoADrawflow(flujo, lejos);

    assert.equal(caja(datos, 'start').outputs.output_1.connections.length, 0, 'menu_a está 3000 px abajo');
    assert.match(caja(datos, 'start').html, /data-ir="menu_a"[^>]*>&#8674; menu_a/);   // ⇢ a la derecha
    assert.match(caja(datos, 'menu_a').html, /data-ir="start"[^>]*>&#8617; start/);    // ↩ a la izquierda
    assert.equal(caja(datos, 'start').outputs.output_2.connections.length, 1, 'menu_b está cerca');
});

test('el límite es DISTANCIA_ATAJO entre centros de caja', () => {
    const f = { start: { message: 'a', next_state: 'end' }, end: { message: 'b' } };

    assert.deepEqual(conexionesLejanas(f, { start: { x: 0, y: 0 }, end: { x: 0, y: DISTANCIA_ATAJO } }).start, ['linea']);
    assert.deepEqual(conexionesLejanas(f, { start: { x: 0, y: 0 }, end: { x: 0, y: DISTANCIA_ATAJO + 1 } }).start, ['lejos-adelante']);
});

test('ordenarArbol: hijos a la derecha del padre y sin cajas encimadas en una misma columna', () => {
    const alturas = { start: 150, menu_a: 130, menu_b: 130, hoja: 80, end: 80, suelto: 100 };
    const layout = ordenarArbol(flujo, alturas);

    assert.deepEqual(Object.keys(layout).sort(), Object.keys(flujo).sort());
    assert.ok(layout.menu_a.x > layout.start.x && layout.hoja.x > layout.menu_b.x);
    assert.equal(layout.menu_a.x, layout.menu_b.x);

    const porColumna = new Map();
    for (const [nombre, { x, y }] of Object.entries(layout)) {
        porColumna.set(x, [...(porColumna.get(x) ?? []), { y, fin: y + alturas[nombre] }]);
    }
    for (const cajas of porColumna.values()) {
        cajas.sort((a, b) => a.y - b.y).slice(1).forEach((caja, i) => assert.ok(caja.y >= cajas[i].fin, 'se encima con la de arriba'));
    }
});

test('ordenarArbol: lo que no cuelga de start (suelto, y end que solo recibe atajos) va en cuadrícula debajo', () => {
    const layout = ordenarArbol(flujo);
    const masAbajoDelArbol = Math.max(...['start', 'menu_a', 'menu_b', 'hoja'].map((n) => layout[n].y));

    assert.ok(layout.suelto.y > masAbajoDelArbol);
    assert.equal(layout.end.y, layout.suelto.y, 'misma fila de la cuadrícula');
    assert.notEqual(layout.end.x, layout.suelto.x);
});
