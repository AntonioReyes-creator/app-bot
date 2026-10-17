import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbolDeEstados, distancias, flujoADrawflow, tiposDeDibujo } from '../../resources/js/flujo/flujo-a-drawflow.js';
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

// --- Dibujo: línea salvo que vuelva atrás o pase por detrás de otras cajas (cruzan) ---

const caja = (datos, n) => Object.values(datos.drawflow.Home.data).find((x) => x.name === n);

test('cajas cercanas: solo las conexiones del árbol llevan línea; volver atrás es ↩ y a un estado compartido es ⇢', () => {
    // todo junto en pantalla: end (a la derecha) recibe 4 conexiones; menu_a vuelve a start (a la izquierda)
    const cerca = { start: { x: 40, y: 40 }, menu_a: { x: 400, y: 40 }, menu_b: { x: 400, y: 260 }, hoja: { x: 760, y: 260 }, end: { x: 760, y: 40 }, suelto: { x: 760, y: 480 } };
    const { datos, conexiones } = flujoADrawflow(flujo, cerca);

    // árbol: start → menu_a, start → menu_b, start → end (la primera que llega a end), menu_b → hoja
    assert.deepEqual(conexiones, { lineas: 4, atajos: 4, copias: 0 }, 'end no tiene opciones y start es antepasado: sin copias');
    assert.equal(caja(datos, 'start').outputs.output_3.connections.length, 1, 'start → end es la del árbol: línea');
    assert.equal(caja(datos, 'menu_a').outputs.output_2.connections.length, 0, 'menu_a → end: end ya cuelga de start');
    assert.match(caja(datos, 'menu_a').html, /data-ir="end"[^>]*>&#8674; end/);
    assert.equal(caja(datos, 'menu_a').outputs.output_1.connections.length, 0, 'volver a start = sin línea');
    assert.match(caja(datos, 'menu_a').html, /data-ir="start"[^>]*>&#8617; start/);
    assert.doesNotMatch(caja(datos, 'start').html, /caja-atajo/);
});

test('cajas lejos pero con el camino libre: se mantiene la línea (la distancia ya no importa)', () => {
    const lejos = { start: { x: 40, y: 40 }, menu_a: { x: 400, y: 3000 }, menu_b: { x: 400, y: 260 }, hoja: { x: 760, y: 260 }, end: { x: 2400, y: 40 }, suelto: { x: 760, y: 480 } };
    const { datos } = flujoADrawflow(flujo, lejos);

    assert.equal(caja(datos, 'start').outputs.output_1.connections.length, 1, 'menu_a está 3000 px abajo, pero nada se interpone');
    assert.match(caja(datos, 'menu_a').html, /data-ir="start"[^>]*>&#8617; start/, 'volver atrás sigue siendo etiqueta');
});

test('si la línea pasaría por detrás de otras cajas (cruzan), se muestra como etiqueta ⇢', () => {
    const cerca = { start: { x: 40, y: 40 }, menu_a: { x: 400, y: 40 }, menu_b: { x: 400, y: 260 }, hoja: { x: 760, y: 260 }, end: { x: 760, y: 40 }, suelto: { x: 760, y: 480 } };
    const { datos } = flujoADrawflow(flujo, cerca, {}, new Set(['start#2']));      // start → end cruzaría otra caja

    assert.equal(caja(datos, 'start').outputs.output_3.connections.length, 0);
    assert.match(caja(datos, 'start').html, /data-ir="end"[^>]*>&#8674; end/);
    assert.deepEqual(tiposDeDibujo(flujo, cerca, new Set(['start#2'])).start, ['linea', 'linea', 'atajo-cruce']);
});

test('con nombres visibles: la caja muestra el nombre visible y su identificador; flechas y etiquetas usan el nombre visible', () => {
    const f = { start: { message: 'a', options: { 1: { text: 'Ir', next_state: 'mis_tramites' } } }, mis_tramites: { message: 'b', options: { 1: { text: 'Volver', next_state: 'start' } } } };
    const { datos } = flujoADrawflow(f, { start: { x: 40, y: 40 }, mis_tramites: { x: 400, y: 40 } }, { mis_tramites: 'Mis trámites', start: 'Bienvenida' });

    assert.match(caja(datos, 'mis_tramites').html, /class="caja-titulo">Mis trámites<\/span><span class="caja-nombre">mis_tramites</);
    assert.match(caja(datos, 'start').html, /&rarr; Mis trámites/);
    assert.match(caja(datos, 'mis_tramites').html, /data-ir="start"[^>]*>&#8617; Bienvenida/, 'la etiqueta lleva el identificador en data-ir y muestra el nombre visible');
    assert.doesNotMatch(flujoADrawflow(f).datos.drawflow.Home.data['1'].html, /caja-titulo/, 'sin títulos: como antes');
});

test('ordenarArbol: todo lo conectado queda amarrado; lo que no conecta con start va aparte, a la derecha', () => {
    const layout = ordenarArbol(flujo);
    const conectados = ['start', 'menu_a', 'menu_b', 'hoja', 'end'];
    const derechaDelArbol = Math.max(...conectados.map((n) => layout[n].x));

    assert.ok(layout.suelto.x >= derechaDelArbol + 3 * 420, 'a la derecha, tras un hueco de dos columnas');
});

test('arbolDeEstados: cada estado cuelga de la primera opción que llega a él; las demás no son del árbol', () => {
    const { hijos, aristas, raices } = arbolDeEstados(flujo);

    assert.deepEqual(hijos.get('start'), ['menu_a', 'menu_b', 'end']);
    assert.deepEqual(hijos.get('menu_b'), ['hoja']);
    assert.ok(aristas.has('start#2'), 'start → end');
    assert.ok(!aristas.has('menu_a#1') && !aristas.has('menu_b#1'), 'las otras que van a end no');
    assert.ok(!aristas.has('menu_a#0'), 'volver a start tampoco');
    assert.deepEqual(raices, ['start', 'suelto']);
});

// --- Ordenar como mapa mental: profundidad hacia la derecha, hermanos apilados hacia abajo ---

/** start → tema_a (con opciones x, y, z; y tiene y1, y2) y tema_b (con w). Altura fija para medir exacto. */
const conFilas = {
    start: { message: '', options: { 1: { text: 'A', next_state: 'tema_a' }, 2: { text: 'B', next_state: 'tema_b' } } },
    tema_a: { message: '', options: { 1: { text: 'x', next_state: 'x' }, 2: { text: 'y', next_state: 'y' }, 3: { text: 'z', next_state: 'z' } } },
    tema_b: { message: '', options: { 1: { text: 'w', next_state: 'w' } } },
    x: { message: '' }, z: { message: '' }, w: { message: '' },
    y: { message: '', options: { 1: { text: 'y1', next_state: 'y1' }, 2: { text: 'y2', next_state: 'y2' } } },
    y1: { message: '' }, y2: { message: '' },
};
const alturasFijas = (f) => Object.fromEntries(Object.keys(f).map((n) => [n, 100]));
const sinEncimarse = (layout, alturas) => {
    const cajas = Object.entries(layout).map(([n, p]) => ({ ...p, h: alturas[n] }));
    for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) {
        const a = cajas[i], b = cajas[j];
        assert.ok(!(Math.abs(a.x - b.x) < 280 && a.y < b.y + b.h && b.y < a.y + a.h), 'cajas encimadas');
    }
};

test('ordenar: start a la izquierda y sus opciones (nivel 2) apiladas en la columna siguiente, en orden', () => {
    const layout = ordenarArbol(conFilas, alturasFijas(conFilas));

    assert.equal(layout.tema_a.x, layout.tema_b.x, 'una sola columna');
    assert.equal(layout.tema_a.x, layout.start.x + 420);
    assert.ok(layout.tema_a.y < layout.tema_b.y, 'opción 1 arriba');
    assert.ok(layout.start.y > layout.tema_a.y && layout.start.y < layout.tema_b.y, 'start centrado frente a sus opciones');
});

test('ordenar: las opciones de una caja van apiladas en la columna siguiente y la caja queda centrada', () => {
    const layout = ordenarArbol(conFilas, alturasFijas(conFilas));

    assert.ok(layout.x.x === layout.y.x && layout.y.x === layout.z.x && layout.x.x === layout.tema_a.x + 420, 'misma columna, a la derecha');
    assert.ok(layout.x.y < layout.y.y && layout.y.y < layout.z.y, 'en el orden de las opciones, hacia abajo');
    assert.equal(layout.tema_a.y, (layout.x.y + layout.z.y) / 2, 'tema_a centrado entre su primera y última opción');
    assert.equal(layout.y1.x, layout.y.x + 420, 'nivel 4: otra columna más a la derecha');
    assert.ok(layout.z.y >= layout.y2.y + 100, 'la rama de y (y1, y2) no se encima con z');
    sinEncimarse(layout, alturasFijas(conFilas));
});

test('ordenar: un solo hijo queda a la misma altura (cadena en línea recta)', () => {
    const layout = ordenarArbol(conFilas, alturasFijas(conFilas));

    assert.equal(layout.w.y, layout.tema_b.y);
    assert.equal(layout.w.x, layout.tema_b.x + 420);
});

test('ordenar: muchas opciones van todas apiladas, en orden y sin encimarse', () => {
    const opciones = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [String(i + 1), { text: `s${i}`, next_state: `sede_${i}` }]));
    const f = { start: { message: '', options: { 1: { text: 'Sedes', next_state: 'sedes' } } }, sedes: { message: '', options: opciones },
        ...Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`sede_${i}`, { message: '' }])) };
    const alturas = alturasFijas(f);
    const layout = ordenarArbol(f, alturas);
    const sedes = Array.from({ length: 14 }, (_, i) => layout[`sede_${i}`]);

    assert.equal(new Set(sedes.map((p) => p.x)).size, 1, 'una sola columna');
    assert.ok(sedes.every((p, i) => i === 0 || p.y > sedes[i - 1].y), 'en orden, hacia abajo');
    sinEncimarse(layout, alturas);
});

test('ordenar: en una cadena se alinean las bolitas (entrada del hijo frente a la salida del padre) y la línea sale recta', () => {
    const alturas = alturasFijas(conFilas);
    // tema_b: su única salida está 40 px más abajo que la entrada de w
    const layout = ordenarArbol(conFilas, alturas, { tema_b: { entrada: 50, salidas: [90] }, w: { entrada: 50, salidas: [] } });

    assert.equal(layout.w.y + 50, layout.tema_b.y + 90, 'entrada de w a la altura de la salida de tema_b');
    sinEncimarse(layout, alturas);

    // al revés (la salida más arriba que la entrada): se baja la rama del hijo, sin subir el padre fuera de su sitio
    const alReves = ordenarArbol(conFilas, alturas, { tema_b: { entrada: 50, salidas: [20] }, w: { entrada: 80, salidas: [] } });
    assert.equal(alReves.w.y + 80, alReves.tema_b.y + 20);
    assert.ok(alReves.tema_b.y >= alReves.z.y + 100, 'tema_b sigue debajo de la rama de tema_a');
    sinEncimarse(alReves, alturas);
});
