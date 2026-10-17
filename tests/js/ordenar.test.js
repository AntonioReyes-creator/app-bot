import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flujoADrawflow, tiposDeConexion } from '../../resources/js/flujo/flujo-a-drawflow.js';
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

test('tiposDeConexion: regreso, frecuente y línea', () => {
    const tipos = tiposDeConexion(flujo);

    assert.deepEqual(tipos.start, ['linea', 'linea', 'frecuente']); // end recibe 4 conexiones
    assert.deepEqual(tipos.menu_a, ['regreso', 'frecuente']);        // volver a start
    assert.deepEqual(tipos.menu_b, ['linea', 'frecuente']);
});

test('los atajos no dibujan línea y muestran una etiqueta que lleva al destino', () => {
    const { datos, conexiones } = flujoADrawflow(flujo);
    const caja = (n) => Object.values(datos.drawflow.Home.data).find((x) => x.name === n);

    assert.deepEqual(conexiones, { lineas: 3, atajos: 5 });
    assert.equal(caja('menu_a').outputs.output_1.connections.length, 0);
    assert.match(caja('menu_a').html, /data-ir="start"/);
    assert.match(caja('menu_a').html, /&#8617; start/);   // ↩ regreso
    assert.match(caja('start').html, /&#8677; end/);      // ⇥ frecuente
    assert.equal(caja('start').outputs.output_1.connections.length, 1, 'hacia adelante sí es línea');
});

test('con menos de 3 entradas el destino se sigue dibujando con línea', () => {
    const { conexiones } = flujoADrawflow({ start: { message: 'a', next_state: 'end' }, end: { message: 'b' } });
    assert.deepEqual(conexiones, { lineas: 1, atajos: 0 });
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
