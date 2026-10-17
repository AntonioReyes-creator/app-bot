import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveCopia, flujoADrawflow, tiposDeDibujo } from '../../resources/js/flujo/flujo-a-drawflow.js';
import { eliminarEstado, renombrarEstado } from '../../resources/js/flujo/modelo.js';

// start → tema_a → paso_a ─┐
//       → tema_b → paso_b ─┼→ algo_mas (menú compartido: 1 → start, 2 → end)
//       → algo_mas (la primera que llega: es del árbol, caja real)
const flujo = {
    start: { message: 'Hola', options: { 1: { text: 'A', next_state: 'tema_a' }, 2: { text: 'B', next_state: 'tema_b' }, 3: { text: 'Más', next_state: 'algo_mas' } } },
    tema_a: { message: 'A', options: { 1: { text: 'Paso', next_state: 'paso_a' }, 2: { text: 'Volver', next_state: 'start' } } },
    tema_b: { message: 'B', options: { 1: { text: 'Paso', next_state: 'paso_b' }, 2: { text: 'Volver', next_state: 'tema_b' } } },
    paso_a: { message: 'info A', next_state: 'algo_mas' },
    paso_b: { message: 'info B', next_state: 'algo_mas' },
    algo_mas: { message: '¿Algo más?', options: { 1: { text: 'Sí', next_state: 'start' }, 2: { text: 'No', next_state: 'end' } } },
    end: { message: 'Chau' },
};
const copias = (r) => Object.values(r.datos.drawflow.Home.data).filter((n) => n.class.startsWith('copia'));

test('copia de vista: cada caja que llega a un estado compartido CON opciones tiene su copia al lado, unida con línea', () => {
    const r = flujoADrawflow(flujo, { paso_a: { x: 1000, y: 100 } }, {}, new Set(), { copias: true });
    const lista = copias(r);

    assert.deepEqual(r.conexiones.copias, 2);
    assert.deepEqual(lista.map((n) => n.name).sort(), [claveCopia('paso_a', 0), claveCopia('paso_b', 0)].sort());
    const deA = lista.find((n) => n.name === 'copia:paso_a#0');
    assert.equal(deA.pos_x, 1420, 'a la derecha de su origen');
    assert.deepEqual(Object.keys(deA.outputs), [], 'de una copia no salen líneas');
    assert.match(deA.html, /data-ir="start"[^>]*>1 &#8674; start/, 'sus opciones son etiquetas para ir');
    assert.match(deA.html, /Copia de vista/);

    const pasoA = Object.values(r.datos.drawflow.Home.data).find((n) => n.name === 'paso_a');
    assert.deepEqual(pasoA.outputs.output_1.connections, [{ node: String(deA.id), output: 'input_1' }], 'la línea va a la copia');
    assert.equal(r.copiaPorId.get(String(deA.id)).destino, 'algo_mas');
    assert.ok(![...r.nombrePorId.values()].some((n) => n.startsWith('copia:')), 'las copias no son estados');
});

test('copia: no para la caja real (rama del árbol), ni volver a start / a un antepasado, ni destinos sin opciones', () => {
    const posiciones = Object.fromEntries(Object.keys(flujo).map((n, i) => [n, { x: 40 + i * 400, y: 40 }]));
    const tipos = tiposDeDibujo(flujo, posiciones, new Set(), { copias: true });

    assert.equal(tipos.start[2], 'linea', 'start → algo_mas es la del árbol: caja real');
    assert.equal(tipos.algo_mas[0], 'atajo-atras', 'volver a start: ↩, nunca copia');
    assert.notEqual(tipos.tema_b[1], 'copia', 'volver a sí mismo / antepasado: no es copia');
    assert.equal(tipos.paso_a[0], 'copia');
    assert.notEqual(tipos.algo_mas[1], 'copia', 'end no tiene opciones: sigue como antes');
});

test('copia: el JSON no cambia y la posición guardada de la copia se respeta', () => {
    const antes = JSON.stringify(flujo);
    const r = flujoADrawflow(flujo, { [claveCopia('paso_b', 0)]: { x: 7, y: 9 } }, {}, new Set(), { copias: true });

    assert.equal(JSON.stringify(flujo), antes);
    const deB = copias(r).find((n) => n.name === 'copia:paso_b#0');
    assert.deepEqual([deB.pos_x, deB.pos_y], [7, 9]);
});

test('copia: renombrar o borrar el origen mueve o quita la posición de sus copias', () => {
    const modelo = { flujo: structuredClone(flujo), layout: { paso_a: { x: 1, y: 1 }, 'copia:paso_a#0': { x: 5, y: 5 } }, titulos: {} };

    renombrarEstado(modelo, 'paso_a', 'info_a');
    assert.deepEqual(modelo.layout['copia:info_a#0'], { x: 5, y: 5 });
    assert.ok(!('copia:paso_a#0' in modelo.layout));

    eliminarEstado(modelo, 'info_a');
    assert.ok(!Object.keys(modelo.layout).some((c) => c.startsWith('copia:info_a#')));
});

test('copias apagadas (por defecto): sin copias, el estado compartido se ve como etiqueta ⇢ como antes', () => {
    const r = flujoADrawflow(flujo);
    const pasoA = Object.values(r.datos.drawflow.Home.data).find((n) => n.name === 'paso_a');

    assert.equal(copias(r).length, 0);
    assert.equal(r.conexiones.copias, 0);
    assert.equal(pasoA.outputs.output_1.connections.length, 0);
    assert.match(pasoA.html, /data-ir="algo_mas"/);
});
