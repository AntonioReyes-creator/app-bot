import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flujoADrawflow, clasificar, salidas } from '../../resources/js/flujo/flujo-a-drawflow.js';
import { esEstadoSistema } from '../../resources/js/flujo/estados-sistema.js';

const nodoPorNombre = (datos, nombre) =>
    Object.values(datos.drawflow.Home.data).find((nodo) => nodo.name === nombre);

test('flujo inicial: start → end con la flecha anotada en los dos extremos', () => {
    const flujo = {
        start: { message: '¡Hola! Bienvenido.', next_state: 'end' },
        end: { message: 'Gracias por escribirnos.' },
    };
    const { datos, resumen } = flujoADrawflow(flujo);
    const start = nodoPorNombre(datos, 'start');
    const end = nodoPorNombre(datos, 'end');

    assert.deepEqual(resumen, { total: 2, alcanzables: 2, sinConexion: 0 });
    assert.deepEqual(start.outputs.output_1.connections, [{ node: String(end.id), output: 'input_1' }]);
    assert.deepEqual(end.inputs.input_1.connections, [{ node: String(start.id), input: 'output_1' }]);
    assert.deepEqual(Object.keys(end.outputs), []);
    assert.match(start.class, /tipo-paso/);
    assert.match(end.class, /tipo-final/);
    assert.ok(start.pos_x < end.pos_x, 'end queda en la columna siguiente');
});

test('menú: una salida por opción, la oculta marcada y el destino inexistente sin flecha', () => {
    const flujo = {
        start: {
            message: 'Elige',
            options: {
                1: { text: 'Uno', next_state: 'end' },
                salir: { text: 'Salir', next_state: 'end' },
                2: { text: 'Dos', next_state: 'no_existe' },
            },
        },
        end: { message: 'Fin' },
    };
    const { datos } = flujoADrawflow(flujo);
    const start = nodoPorNombre(datos, 'start');

    assert.equal(clasificar(flujo.start), 'menu');
    // Las claves numéricas van primero en JavaScript: 1, 2, salir.
    assert.deepEqual(salidas(flujo.start).map((s) => s.clave), ['1', '2', 'salir']);
    assert.equal(Object.keys(start.outputs).length, 3);
    assert.equal(start.outputs.output_1.connections.length, 1);
    assert.equal(start.outputs.output_2.connections.length, 0, 'no_existe no tiene caja');
    assert.equal(start.outputs.output_3.connections.length, 0, '"salir" también va a end, que ya cuelga de la opción 1');
    assert.match(start.html, /data-ir="end"/, 'por eso se muestra como etiqueta');
    assert.match(start.html, /opcion-oculta/);
    assert.match(start.html, /no existe/);
});

test('las posiciones guardadas en layout tienen prioridad', () => {
    const flujo = { start: { message: 'a', next_state: 'end' }, end: { message: 'b' } };
    const { datos } = flujoADrawflow(flujo, { end: { x: 999, y: 555 } });

    assert.equal(nodoPorNombre(datos, 'end').pos_x, 999);
    assert.equal(nodoPorNombre(datos, 'end').pos_y, 555);
});

test('estados sin conexión desde start: se cuentan y van en una columna aparte', () => {
    const flujo = {
        start: { message: 'a', next_state: 'end' },
        end: { message: 'b' },
        suelto: { message: 'c' },
    };
    const { datos, resumen } = flujoADrawflow(flujo);

    assert.deepEqual(resumen, { total: 3, alcanzables: 2, sinConexion: 1 });
    assert.match(nodoPorNombre(datos, 'suelto').class, /sin-conexion/);
    assert.ok(nodoPorNombre(datos, 'suelto').pos_x > nodoPorNombre(datos, 'end').pos_x);
});

test('sin start ningún estado es alcanzable', () => {
    const { resumen } = flujoADrawflow({ otro: { message: 'x' } });
    assert.deepEqual(resumen, { total: 1, alcanzables: 0, sinConexion: 1 });
});

test('el texto del usuario se escapa en el HTML de la caja', () => {
    const { datos } = flujoADrawflow({ start: { message: '<script>alert(1)</script>' } });
    const html = nodoPorNombre(datos, 'start').html;

    assert.ok(!html.includes('<script>'));
    assert.match(html, /&lt;script&gt;/);
});

test('estados del sistema según docs/PLAN.md §4', () => {
    for (const nombre of ['start', 'end', 'end_or_menu', 'esperando_agente_quejas', 'derivar_notificaciones',
        'derivar_expedientes_cofirmar', 'alimentos_pedir_corte', 'alimentos_confirmar']) {
        assert.ok(esEstadoSistema(nombre), nombre);
    }
    for (const nombre of ['cert_menu', 'menu_principal', 'confirmar_algo']) {
        assert.ok(!esEstadoSistema(nombre), nombre);
    }
});
