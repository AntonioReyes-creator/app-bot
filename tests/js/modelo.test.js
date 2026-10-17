import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    agregarEstado, aplicarEdicion, crearConectado, eliminarEstado, fijarDestino, moverEstado, opcionesDe,
    plantilla, plantillaSistema, siguienteClave, sistemaDisponibles, sugerirNombre, validarNombre,
} from '../../resources/js/flujo/modelo.js';
import { clasificar, flujoADrawflow } from '../../resources/js/flujo/flujo-a-drawflow.js';

const modeloInicial = () => ({
    flujo: { start: { message: 'Hola', next_state: 'end' }, end: { message: 'Fin' } },
    layout: { start: { x: 40, y: 40 }, end: { x: 380, y: 40 } },
});

test('validarNombre: vacío, formato snake_case y repetido', () => {
    const { flujo } = modeloInicial();

    assert.match(validarNombre(flujo, ''), /Escribe un nombre/);
    assert.match(validarNombre(flujo, 'Menu Principal'), /minúsculas/);
    assert.match(validarNombre(flujo, '1menu'), /minúsculas/);
    assert.match(validarNombre(flujo, 'menú'), /minúsculas/);
    assert.match(validarNombre(flujo, 'end'), /Ya existe/);
    assert.equal(validarNombre(flujo, 'menu_certificados'), null);
});

test('sugerirNombre no repite nombres', () => {
    assert.equal(sugerirNombre({}, 'menu'), 'menu_1');
    assert.equal(sugerirNombre({ menu_1: {}, menu_2: {} }, 'menu'), 'menu_3');
});

test('cada plantilla se clasifica como su tipo', () => {
    assert.equal(clasificar(plantilla('menu')), 'menu');
    assert.equal(clasificar(plantilla('paso')), 'paso');
    assert.equal(clasificar(plantilla('final')), 'final');
});

test('agregar un menú: queda en el modelo con su posición y su salida sin conectar', () => {
    const modelo = modeloInicial();
    agregarEstado(modelo, 'menu_1', plantilla('menu'), { x: 100.6, y: 400.2 });

    assert.ok('menu_1' in modelo.flujo);
    assert.deepEqual(modelo.layout.menu_1, { x: 101, y: 400 });

    const { datos, resumen } = flujoADrawflow(modelo.flujo, modelo.layout);
    const caja = Object.values(datos.drawflow.Home.data).find((n) => n.name === 'menu_1');
    assert.equal(caja.outputs.output_1.connections.length, 0);
    assert.match(caja.html, /sin conectar/);
    assert.deepEqual(resumen, { total: 3, alcanzables: 2, sinConexion: 1 });
});

test('dos cajas añadidas en el mismo punto no quedan una encima de otra', () => {
    const modelo = modeloInicial();
    agregarEstado(modelo, 'menu_1', plantilla('menu'), { x: 500, y: 300 });
    agregarEstado(modelo, 'menu_2', plantilla('menu'), { x: 500, y: 300 });
    agregarEstado(modelo, 'menu_3', plantilla('menu'), { x: 505, y: 295 });

    // Cada una baja una fila completa (180 px): ninguna tapa a otra.
    assert.deepEqual(modelo.layout.menu_1, { x: 500, y: 300 });
    assert.deepEqual(modelo.layout.menu_2, { x: 500, y: 480 });
    assert.deepEqual(modelo.layout.menu_3, { x: 505, y: 655 });
});

test('mover actualiza el layout', () => {
    const modelo = modeloInicial();
    moverEstado(modelo, 'end', 500.4, 90);
    assert.deepEqual(modelo.layout.end, { x: 500, y: 90 });
});

test('borrar: el estado desaparece y la flecha que llegaba queda marcada como destino inexistente', () => {
    const modelo = modeloInicial();

    assert.equal(eliminarEstado(modelo, 'end'), true);
    assert.ok(!('end' in modelo.flujo));
    assert.ok(!('end' in modelo.layout));

    const { datos } = flujoADrawflow(modelo.flujo, modelo.layout);
    assert.match(datos.drawflow.Home.data['1'].html, /no existe/);
});

test('start no se puede borrar', () => {
    const modelo = modeloInicial();
    assert.equal(eliminarEstado(modelo, 'start'), false);
    assert.ok('start' in modelo.flujo);
});

test('estados del sistema: solo se ofrecen los que faltan, con su estructura', () => {
    const disponibles = sistemaDisponibles(modeloInicial().flujo);

    assert.ok(!disponibles.includes('start'));
    assert.ok(!disponibles.includes('end'));
    assert.ok(disponibles.includes('end_or_menu'));
    assert.equal(clasificar(plantillaSistema('end_or_menu')), 'menu');
    assert.equal(plantillaSistema('mas_informacion').next_state, 'esperando_agente');
    assert.equal(clasificar(plantillaSistema('verificacion_numero')), 'final');
});

test('nombrePorId relaciona los ids de Drawflow con los nombres', () => {
    const { nombrePorId } = flujoADrawflow(modeloInicial().flujo);
    assert.equal(nombrePorId.get('1'), 'start');
    assert.equal(nombrePorId.get('2'), 'end');
});

// --- Edición (modal) ---

const conMenu = () => ({
    flujo: {
        start: {
            message: 'Elige',
            options: {
                1: { text: 'Trámites', next_state: 'tramites', keywords: ['tramite'], departamento: 'LIMA' },
                2: { text: 'Salir', next_state: 'end' },
            },
        },
        tramites: { message: 'Trámites', next_state: 'end' },
        end: { message: 'Fin' },
    },
    layout: { start: { x: 0, y: 0 }, tramites: { x: 340, y: 0 }, end: { x: 680, y: 0 } },
});

test('opcionesDe separa los campos extra y aplicar los conserva', () => {
    const modelo = conMenu();
    const filas = opcionesDe(modelo.flujo.start);

    assert.deepEqual(filas[0], { clave: '1', text: 'Trámites', next_state: 'tramites', extra: { keywords: ['tramite'], departamento: 'LIMA' } });

    filas[0].text = 'Mis trámites';
    assert.equal(aplicarEdicion(modelo, 'start', { nombre: 'start', message: 'Hola', tipo: 'menu', next_state: null, opciones: filas }), null);
    assert.deepEqual(modelo.flujo.start.options['1'], { keywords: ['tramite'], departamento: 'LIMA', text: 'Mis trámites', next_state: 'tramites' });
});

test('cambiar de menú a paso quita options (el bot trata un options vacío como presente)', () => {
    const modelo = conMenu();
    aplicarEdicion(modelo, 'start', { nombre: 'start', message: 'Hola', tipo: 'paso', next_state: 'end', opciones: opcionesDe(modelo.flujo.start) });

    assert.deepEqual(modelo.flujo.start, { message: 'Hola', next_state: 'end' });
});

test('cambiar a solo mensaje quita options y next_state', () => {
    const modelo = conMenu();
    aplicarEdicion(modelo, 'tramites', { nombre: 'tramites', message: 'Listo', tipo: 'final', next_state: 'end', opciones: [] });

    assert.deepEqual(modelo.flujo.tramites, { message: 'Listo' });
});

test('un menú sin opciones o con claves repetidas o vacías se rechaza sin cambiar nada', () => {
    const modelo = conMenu();
    const antes = structuredClone(modelo.flujo);
    const base = { nombre: 'start', message: 'x', tipo: 'menu', next_state: null };

    assert.match(aplicarEdicion(modelo, 'start', { ...base, opciones: [] }).mensaje, /al menos una opción/);
    assert.match(aplicarEdicion(modelo, 'start', { ...base, opciones: [{ clave: '1', text: 'a', extra: {} }, { clave: '1', text: 'b', extra: {} }] }).mensaje, /repetida/);
    assert.match(aplicarEdicion(modelo, 'start', { ...base, opciones: [{ clave: ' ', text: 'a', extra: {} }] }).mensaje, /número o clave/);
    assert.deepEqual(modelo.flujo, antes);
});

test('renombrar actualiza las flechas que llegaban, el layout y conserva el orden', () => {
    const modelo = conMenu();
    const error = aplicarEdicion(modelo, 'tramites', { nombre: 'menu_tramites', message: 'Trámites', tipo: 'paso', next_state: 'end', opciones: [] });

    assert.equal(error, null);
    assert.deepEqual(Object.keys(modelo.flujo), ['start', 'menu_tramites', 'end']);
    assert.equal(modelo.flujo.start.options['1'].next_state, 'menu_tramites');
    assert.deepEqual(modelo.layout.menu_tramites, { x: 340, y: 0 });
    assert.ok(!('tramites' in modelo.layout));
});

test('no se puede renombrar un estado del sistema ni usar un nombre inválido o repetido', () => {
    const modelo = conMenu();
    const editar = (nombre, nuevo) => aplicarEdicion(modelo, nombre, { nombre: nuevo, message: 'x', tipo: 'final', opciones: [] });

    assert.match(editar('end', 'fin').mensaje, /estado del sistema/);
    assert.match(editar('tramites', 'Mis Tramites').mensaje, /minúsculas/);
    assert.match(editar('tramites', 'start').mensaje, /Ya existe/);
});

test('destino vacío en el modal se guarda como null (sin conectar)', () => {
    const modelo = conMenu();
    aplicarEdicion(modelo, 'tramites', { nombre: 'tramites', message: 'x', tipo: 'paso', next_state: '', opciones: [] });

    assert.equal(modelo.flujo.tramites.next_state, null);
});

test('siguienteClave propone el siguiente número libre', () => {
    assert.equal(siguienteClave([]), '1');
    assert.equal(siguienteClave(['1', '2', 'salir']), '3');
    assert.equal(siguienteClave(['salir']), '1');
});

// --- Bolitas: conectar, desconectar y crear desde una salida ---

test('fijarDestino conecta y desconecta opciones y "sigue" según su posición', () => {
    const modelo = conMenu();

    fijarDestino(modelo, 'start', 1, null);              // opción 2 → sin conectar
    assert.equal(modelo.flujo.start.options['2'].next_state, null);
    assert.deepEqual(modelo.flujo.start.options['1'].keywords, ['tramite'], 'no pierde campos extra');

    fijarDestino(modelo, 'tramites', 0, 'start');        // la única salida de un paso es "sigue"
    assert.equal(modelo.flujo.tramites.next_state, 'start');
});

test('crearConectado: caja nueva con nombre automático, a la derecha y ya conectada', () => {
    const modelo = conMenu();
    const nombre = crearConectado(modelo, 'start', 1, { tipo: 'menu' });

    assert.equal(nombre, 'menu_1');
    assert.equal(modelo.flujo.start.options['2'].next_state, 'menu_1');
    assert.equal(clasificar(modelo.flujo.menu_1), 'menu');
    assert.ok(modelo.layout.menu_1.x > modelo.layout.start.x);

    assert.equal(crearConectado(modelo, 'start', 0, { tipo: 'menu' }), 'menu_2');
    assert.equal(crearConectado(modelo, 'tramites', 0, { sistema: 'end_or_menu' }), 'end_or_menu');
    assert.equal(modelo.flujo.tramites.next_state, 'end_or_menu');
});

test('el error de edición indica qué campo marcar en rojo', () => {
    const modelo = conMenu();
    const base = { message: 'x', next_state: null };

    assert.deepEqual(aplicarEdicion(modelo, 'tramites', { ...base, nombre: '', tipo: 'final', opciones: [] }),
        { campo: 'nombre', mensaje: 'Escribe un nombre.' });
    assert.equal(aplicarEdicion(modelo, 'start', { ...base, nombre: 'start', tipo: 'menu', opciones: [] }).campo, 'opciones');
    assert.deepEqual(
        aplicarEdicion(modelo, 'start', { ...base, nombre: 'start', tipo: 'menu',
            opciones: [{ clave: '1', text: 'a', extra: {} }, { clave: '2', text: 'b', extra: {} }, { clave: '1', text: 'c', extra: {} }] }),
        { campo: 'clave', indice: 2, mensaje: 'La opción «1» está repetida.' },
    );
});
