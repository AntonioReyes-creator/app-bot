import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiarEstados, pegarEstados } from '../../resources/js/flujo/modelo.js';

const origen = () => ({
    flujo: {
        start: { message: 'Hola', options: { 1: { text: 'Precios', next_state: 'precios' } } },
        precios: { message: 'Lista', options: { 1: { text: 'Detalle', next_state: 'detalle', keywords: ['más'] }, 2: { text: 'Volver', next_state: 'start' } } },
        detalle: { message: 'Detalle', next_state: 'end_or_menu' },
        end_or_menu: { message: '¿Algo más?', options: { 1: { text: 'No', next_state: 'end' } } },
        end: { message: 'Chau' },
    },
    layout: { start: { x: 0, y: 0 }, precios: { x: 400, y: 100 }, detalle: { x: 800, y: 100 }, end_or_menu: { x: 1200, y: 0 }, end: { x: 1600, y: 0 } },
    titulos: { precios: 'Precios' },
});

test('pegar en el mismo flujo: nombres nuevos, conexiones internas a las copias, externas se mantienen', () => {
    const m = origen();
    const copia = copiarEstados(m, ['precios', 'detalle']);
    const creados = pegarEstados(m, copia, { x: 100, y: 900 });

    assert.deepEqual(creados, ['precios_copia', 'detalle_copia']);
    assert.equal(m.flujo.precios_copia.options['1'].next_state, 'detalle_copia', 'interna → a la copia');
    assert.deepEqual(m.flujo.precios_copia.options['1'].keywords, ['más'], 'campos extra se conservan');
    assert.equal(m.flujo.precios_copia.options['2'].next_state, 'start', 'externa que existe → se mantiene');
    assert.equal(m.flujo.detalle_copia.next_state, 'end_or_menu');
    assert.deepEqual([m.layout.precios_copia, m.layout.detalle_copia], [{ x: 100, y: 900 }, { x: 500, y: 900 }], 'misma forma');
    assert.equal(m.titulos.precios_copia, 'Precios (copia)');
    assert.ok(m.nuevos.includes('precios_copia'));
    assert.equal(m.flujo.precios.options['1'].next_state, 'detalle', 'el original no cambia');

    assert.deepEqual(pegarEstados(m, copia, { x: 0, y: 0 }), ['precios_copia_2', 'detalle_copia_2'], 'pegar otra vez no choca');
});

test('pegar en otro flujo: lo que no existe allí queda sin conectar; los pasos especiales no se duplican', () => {
    const copia = copiarEstados(origen(), ['precios', 'detalle', 'end_or_menu']);
    const otro = { flujo: { start: { message: 'x', next_state: 'end' }, end: { message: 'y' }, end_or_menu: { message: 'mío', options: {} } }, layout: {} };
    const creados = pegarEstados(otro, copia, { x: 0, y: 0 });

    assert.deepEqual(creados, ['precios_copia', 'detalle_copia'], '«¿Algo más?» ya estaba: no se pega');
    assert.equal(otro.flujo.end_or_menu.message, 'mío', 'el existente no se pisa');
    assert.equal(otro.flujo.detalle_copia.next_state, 'end_or_menu', 'usa el que ya existe');
    assert.equal(otro.flujo.precios_copia.options['2'].next_state, 'start');

    const vacio = { flujo: { start: { message: 'x' } }, layout: {} };
    pegarEstados(vacio, copiarEstados(origen(), ['detalle', 'end_or_menu']), { x: 0, y: 0 });
    assert.ok('end_or_menu' in vacio.flujo, 'si el paso especial no estaba, se crea con su nombre');
    assert.equal(vacio.flujo.end_or_menu.options['1'].next_state, null, '«end» no existe en este flujo: sin conectar');
});
