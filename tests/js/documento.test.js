import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarDocumento, documentoEnMarkdown, explicar, fichaDePaso, resumirDocumento, rutaHasta, textoSalida } from '../../resources/js/flujo/documento.js';

// start → tema_a → paso_a ─┐
//       → tema_b ──────────┼→ end_or_menu (compartido; cuelga de start: es la 3.ª opción)
//       → end_or_menu      │
// suelto (sin conexión) → end
const flujo = {
    start: { message: 'Hola', options: { 1: { text: 'A', next_state: 'tema_a' }, 2: { text: 'B', next_state: 'tema_b' }, 3: { text: 'Más', next_state: 'end_or_menu' } } },
    tema_a: { message: 'Tema A', options: { 1: { text: 'Info', next_state: 'paso_a' }, 2: { text: 'Volver', next_state: 'start' }, 3: { text: 'Roto', next_state: 'no_existe' } } },
    paso_a: { message: 'Info A', next_state: 'end_or_menu' },
    tema_b: { message: 'Tema B', next_state: 'end_or_menu' },
    end_or_menu: { message: '¿Algo más?', options: { 1: { text: 'Sí', next_state: 'start' }, 2: { text: 'No', next_state: 'end' }, 3: { text: 'Pendiente', next_state: null } } },
    end: { message: 'Chau' },
    suelto: { message: 'Nadie llega', next_state: 'end' },
};

test('documento: secciones numeradas en el orden del árbol; cada estado aparece una sola vez', () => {
    const { secciones, numeroDe } = armarDocumento(flujo, { tema_a: 'Tema A' });

    assert.deepEqual(secciones.map((s) => `${s.numero} ${s.nombre}`),
        ['1 start', '1.1 tema_a', '1.1.1 paso_a', '1.2 tema_b', '1.3 end_or_menu', '1.3.1 end', '2 suelto']);
    assert.equal(new Set(secciones.map((s) => s.nombre)).size, Object.keys(flujo).length, 'todos, sin repetir');
    assert.equal(numeroDe.get('paso_a'), '1.1.1');
    assert.equal(secciones[1].titulo, 'Tema A', 'usa el nombre visible');
    assert.match(secciones.find((s) => s.nombre === 'end_or_menu').titulo, /¿Algo más\?/, 'paso especial: su etiqueta');
    assert.deepEqual(secciones.map((s) => s.nivel), [0, 1, 2, 1, 1, 2, 0]);
});

test('documento: cada salida dice si es hija, referencia (⇢), vuelve atrás (↩), está rota o sin conectar', () => {
    const { secciones } = armarDocumento(flujo);
    const de = (n) => secciones.find((s) => s.nombre === n).salidas.map((s) => s.modo);

    assert.deepEqual(de('start'), ['hijo', 'hijo', 'hijo']);
    assert.deepEqual(de('tema_a'), ['hijo', 'atras', 'roto']);
    assert.deepEqual(de('paso_a'), ['referencia'], 'end_or_menu se describe en §1.3');
    assert.deepEqual(de('end_or_menu'), ['atras', 'hijo', 'pendiente']);
    assert.equal(secciones.find((s) => s.nombre === 'end_or_menu').entradas, 3, 'lo usan 3 pasos');
});

test('documento: lo que no conecta con start va aparte, marcado "sin conexión"', () => {
    const { secciones } = armarDocumento(flujo);

    assert.deepEqual(secciones.filter((s) => s.sinConexion).map((s) => s.nombre), ['suelto']);
});

test('documento: texto de cada salida', () => {
    const { secciones } = armarDocumento(flujo);
    const paso = secciones.find((s) => s.nombre === 'paso_a').salidas[0];

    assert.equal(textoSalida(paso), 'sigue ⇢ §1.3 end_or_menu');
    assert.equal(textoSalida(secciones[1].salidas[1]), '2. Volver ↩ §1 start');
    assert.equal(textoSalida(secciones[1].salidas[2]), '3. Roto → no_existe ⚠ no existe');
});

test('documento en Markdown: resumen, avisos, títulos legibles, mensajes citados y explicación', () => {
    const md = documentoEnMarkdown(flujo, {}, 'Mi bot');

    assert.match(md, /^# Mi bot\n\n7 pasos: 3 menús, 3 pasos, 1 finales \(3 especiales, 3 compartidos\)\./);
    assert.match(md, /## Avisos \(3\)\n\n- ⚠ §1\.1 A: la opción 3 va a «no_existe», que no existe\.\n- • §1\.3 ❓ ¿Algo más\?: la opción 3 no está conectada\.\n- • §2 Nadie llega: ningún camino desde el inicio llega aquí\./);
    assert.match(md, /\n- \*\*§1 👋 Bienvenida \(start\)\*\* · Menú · lo usan 2 pasos\n  > Hola\n  \*ℹ Primer mensaje/);
    assert.match(md, /\n  - 1\. A → §1\.1 A \(tema_a\)\n/);
    assert.match(md, /- \*\*§1\.1\.1 Info \(paso_a\)\*\* · Paso\n      > Info A\n      \*ℹ Al llegar aquí eligiendo una opción, se envía en el mismo mensaje que §1\.3 ❓ ¿Algo más\? y sus opciones/);
    assert.match(md, /## Sin conexión desde el inicio\n\n- \*\*§2 Nadie llega \(suelto\)\*\*/);
    assert.match(md, /mismo mensaje que §1\.3\.1 🏁 Despedida\.\*/, 'sin opciones: no dice "la persona responde ahí"');
});

test('títulos legibles: nombre visible > paso especial > texto de la opción > etiqueta del patrón > 1.ª línea del mensaje', () => {
    const f = {
        start: { message: 'Hola', options: { 1: { text: 'Mis trámites', next_state: 'tramites' }, 2: { text: 'Otro', next_state: 'con_titulo' } } },
        tramites: { message: '*Trámites*', next_state: 'tramites_pedir_corte' },
        tramites_pedir_corte: { message: 'Elige:\n{{departamentos}}', next_state: 'tramites_confirmar' },
        tramites_confirmar: { message: 'Usted ingresó una jurisdicción.', options: { 1: { text: 'Sí', next_state: 'end' } } },
        con_titulo: { message: 'x' },
        end: { message: 'Chau' },
        suelto: { message: '*Una línea muy larga que sirve para comprobar que el título se recorta bien al final*' },
    };
    const { secciones } = armarDocumento(f, { con_titulo: 'Mi título' });
    const titulo = (n) => secciones.find((s) => s.nombre === n).titulo;

    assert.equal(titulo('start'), '👋 Bienvenida');
    assert.equal(titulo('tramites'), 'Mis trámites', 'texto de la opción que lleva a él');
    assert.equal(titulo('con_titulo'), 'Mi título', 'el nombre visible manda');
    assert.match(titulo('tramites_pedir_corte'), /Pedir que elija de la lista/, 'patrón del sistema');
    assert.ok(titulo('suelto').length <= 50, 'recortado a 50 como mucho');
    assert.match(titulo('suelto'), /^Una línea muy larga.*…$/, 'sin * y recortado');
});

test('explicar: lo que hace el bot en cada tipo de paso (reglas del motor)', () => {
    const f = {
        start: { message: 'Hola', options: { 1: { text: 'Info', next_state: 'info' }, salir: { text: 'Salir', next_state: 'end' } } },
        info: { message: 'Datos', next_state: 'end_or_menu' },
        pide: { message: 'Su expediente:', next_state: 'x_pedir_corte' },
        x_pedir_corte: { message: '{{departamentos}}', next_state: 'x_confirmar' },
        x_confirmar: { message: '¿Ok?', options: { 1: { text: 'Sí', next_state: 'mas_informacion' } } },
        mas_informacion: { message: 'Sus datos', next_state: 'esperando_agente' },
        esperando_agente: { message: 'Espere' },
        end_or_menu: { message: '¿Algo más?', options: { 1: { text: 'No', next_state: 'end' } } },
        end: { message: 'Chau' },
        nada: { message: 'Fin de este camino' },
    };
    const e = (n) => explicar(f, n).join(' ');

    assert.match(e('start'), /^Primer mensaje.*Espera que la persona elija una opción.*«salir» no lleva número.*cierran la conversación/);
    assert.match(e('info'), /se envía en el mismo mensaje que end_or_menu y sus opciones/);
    assert.match(e('pide'), /Espera que la persona escriba algo \(lo que sea\) y continúa con x_pedir_corte/, 'el siguiente pide datos: no se combina');
    assert.match(e('x_pedir_corte'), /Muestra la lista de áreas.*x_confirmar/);
    assert.match(e('mas_informacion'), /Pide los datos.*crea el ticket.*esperando_agente/);
    assert.match(e('esperando_agente'), /en manos de un asesor/);
    assert.match(e('end'), /Cierra la conversación.*empieza de nuevo en start/);
    assert.match(e('nada'), /si la persona escribe, el bot no responde/);
});

test('resumen: cuenta pasos por tipo y lista avisos (rotos, sin conectar, sin conexión)', () => {
    const r = resumirDocumento(armarDocumento(flujo).secciones);

    assert.deepEqual({ ...r, avisos: r.avisos.map((a) => [a.gravedad, a.nombre]) }, {
        total: 7, menus: 3, pasos: 3, finales: 1, especiales: 3, compartidos: 3,
        avisos: [['error', 'tema_a'], ['aviso', 'end_or_menu'], ['aviso', 'suelto']],
    });
});

test('documento: no modifica el FLUJO', () => {
    const antes = JSON.stringify(flujo);
    documentoEnMarkdown(flujo);
    assert.equal(JSON.stringify(flujo), antes);
});

// --- Navegación paso a paso ---

test('fichaDePaso: mensaje, explicación y opciones con título y resumen del destino', () => {
    const f = fichaDePaso(flujo, 'tema_a', {}, ['start']);

    assert.equal(f.titulo, 'A');
    assert.equal(f.tipo, 'menu');
    assert.equal(f.mensaje, 'Tema A');
    assert.deepEqual(f.opciones.map((o) => [o.clave, o.modo, o.tituloDestino, o.resumenDestino]), [
        ['1', 'abrir', 'Info', 'Paso · luego ❓ ¿Algo más?'],
        ['2', 'vuelve', '👋 Bienvenida', 'Menú · 3 opciones'],
        ['3', 'roto', 'no_existe', ''],
    ]);
});

test('fichaDePaso: un paso que se une con el siguiente lo indica (combinadoCon); un destino ya abierto arriba no se vuelve a desplegar', () => {
    assert.equal(fichaDePaso(flujo, 'paso_a').combinadoCon, 'end_or_menu');
    const algoMas = fichaDePaso(flujo, 'end_or_menu', {}, ['start', 'tema_a', 'paso_a']);
    assert.deepEqual(algoMas.opciones.map((o) => o.modo), ['vuelve', 'abrir', 'pendiente']);
});

test('rutaHasta: índices de opción desde start siguiendo el árbol; null si no se llega', () => {
    assert.deepEqual(rutaHasta(flujo, 'start'), []);
    assert.deepEqual(rutaHasta(flujo, 'paso_a'), [0, 0]);
    assert.deepEqual(rutaHasta(flujo, 'end_or_menu'), [2], 'cuelga de la 3.ª opción de start');
    assert.deepEqual(rutaHasta(flujo, 'end'), [2, 1]);
    assert.equal(rutaHasta(flujo, 'suelto'), null);
});
