import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    agregarEstado, agregarPasoEspecial, aplicarEdicion, conectarYNombrar, contenidoParaGuardar, crearConectado, eliminarEstado, enlazarPareja, fijarDestino, fijarTitulo,
    esNuevo, identificadorPara, moverEstado, opcionesDe, sincronizarHijos, tituloDe,
    nombreDesdeTexto, nombrePatron, plantilla, plantillaSistema, siguienteClave, sistemaDisponibles, sugerirNombre, validarNombre,
} from '../../resources/js/flujo/modelo.js';
import { clasificar, flujoADrawflow, salidas } from '../../resources/js/flujo/flujo-a-drawflow.js';
import { NOMBRES, describirSistema, etiquetaSistema, iconoSistema } from '../../resources/js/flujo/estados-sistema.js';

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

test('estados del sistema: básicos por defecto, avanzados aparte; solo los que faltan', () => {
    const flujo = modeloInicial().flujo; // start y end

    assert.deepEqual(sistemaDisponibles(flujo), ['esperando_agente']);
    assert.ok(sistemaDisponibles(flujo, { avanzados: true }).includes('end_or_menu'));
    assert.ok(!sistemaDisponibles(flujo, { avanzados: true }).includes('esperando_agente'));
});

test('pasos especiales ARMADOS (QA H6): mensaje con texto y opciones con texto y destino', () => {
    assert.equal(clasificar(plantillaSistema('end_or_menu')), 'menu');
    assert.deepEqual(plantillaSistema('end_or_menu').options, {
        1: { text: 'Sí, volver al inicio', next_state: 'start' }, 2: { text: 'No, gracias', next_state: 'end' } });
    assert.equal(plantillaSistema('mas_informacion').next_state, 'esperando_agente');
    assert.deepEqual(Object.values(plantillaSistema('encuesta_inicio').options).map((o) => o.next_state), ['encuesta_fin', 'encuesta_fin']);
    assert.equal(plantillaSistema('encuesta_fin').next_state, 'end');

    for (const nombre of ['start', 'end', 'esperando_agente', 'end_or_menu', 'mas_informacion', 'seleccionar_departamento',
        'encuesta_inicio', 'encuesta_fin', 'verificacion_numero', 'derivar_x', 'x_pedir_corte', 'x_confirmar', 'esperando_agente_x']) {
        const estado = plantillaSistema(nombre);
        assert.ok(estado.message.trim(), `${nombre}: con mensaje`);
        for (const opcion of Object.values(estado.options ?? {})) {
            assert.ok(opcion.text.trim(), `${nombre}: opción con texto`);
            assert.ok(opcion.next_state, `${nombre}: opción conectada`);
        }
    }
    assert.match(plantillaSistema('x_pedir_corte').message, /\{\{departamentos\}\}/, 'la lista la pone el motor');
    for (const tipo of ['menu', 'paso', 'final']) assert.equal(plantilla(tipo).message, '', 'las cajas normales nacen vacías');
});

test('agregarPasoEspecial: añade el paso armado y los que necesita, sin tocar los que ya existen', () => {
    const modelo = { flujo: { start: { message: 'x', next_state: 'end' }, end: { message: 'Chau' } }, layout: { start: { x: 0, y: 0 } } };

    assert.deepEqual(agregarPasoEspecial(modelo, 'encuesta_inicio', { x: 500, y: 0 }), ['encuesta_inicio', 'encuesta_fin']);
    assert.equal(modelo.flujo.end.message, 'Chau', 'la Despedida que ya estaba no se toca');
    assert.ok(modelo.layout.encuesta_fin.x > modelo.layout.encuesta_inicio.x, 'el compañero va a la derecha');

    assert.deepEqual(agregarPasoEspecial(modelo, 'mas_informacion', { x: 0, y: 900 }), ['mas_informacion', 'esperando_agente']);
    assert.deepEqual(agregarPasoEspecial(modelo, 'derivar_ventas', { x: 0, y: 1300 }), ['derivar_ventas'], 'mas_informacion ya estaba');
    assert.match(modelo.flujo.derivar_ventas.message, /área de ventas/);
    assert.deepEqual(agregarPasoEspecial(modelo, 'x_pedir_corte', { x: 0, y: 1700 }), ['x_pedir_corte', 'x_confirmar']);
    assert.deepEqual(agregarPasoEspecial(modelo, 'encuesta_inicio', { x: 0, y: 0 }), [], 'ya existe: no hace nada');
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

    assert.match(editar('end', 'fin').mensaje, /paso especial/);
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

test('crearConectado: la caja nueva se llama como el texto de la opción, a la derecha y ya conectada', () => {
    const modelo = conMenu();                                           // start: 1 "Trámites", 2 "Salir"
    const nombre = crearConectado(modelo, 'start', 1, { tipo: 'menu' });

    assert.equal(nombre, 'salir');
    assert.equal(modelo.flujo.start.options['2'].next_state, 'salir');
    assert.equal(clasificar(modelo.flujo.salir), 'menu');
    assert.ok(modelo.layout.salir.x > modelo.layout.start.x);

    assert.equal(crearConectado(modelo, 'start', 0, { tipo: 'paso' }), 'tramites_2', '"tramites" ya existe');
    assert.equal(crearConectado(modelo, 'tramites', 0, { sistema: 'end_or_menu' }), 'end_or_menu');
    assert.equal(modelo.flujo.tramites.next_state, 'end_or_menu');
});

test('crearConectado sin texto útil (QA H16): nombre a partir del origen; «sigue» se llama «Después de …»', () => {
    const modelo = { flujo: { start: { message: 'x', options: { 1: { text: '', next_state: null }, 2: { text: '🌹', next_state: null } } },
        paso: { message: 'y', next_state: null }, end: { message: 'Chau' } }, layout: {}, titulos: { paso: 'Departamento' } };

    assert.equal(crearConectado(modelo, 'start', 0, { tipo: 'menu' }), 'start_opcion_1');
    assert.equal(tituloDe(modelo, 'start_opcion_1'), 'start_opcion_1', 'opción aún sin texto: sin nombre visible (lo toma al escribirlo)');
    assert.equal(crearConectado(modelo, 'start', 1, { tipo: 'paso' }), 'start_opcion_2');
    assert.equal(tituloDe(modelo, 'start_opcion_2'), '🌹', 'solo emoji: nombre visible = el emoji');
    assert.equal(crearConectado(modelo, 'paso', 0, { tipo: 'menu' }), 'paso_siguiente');
    assert.equal(tituloDe(modelo, 'paso_siguiente'), 'Después de Departamento');
});

test('«+ Nuevo final» (QA H13): el mensaje queda conectado a la Despedida para que el bot no se quede mudo', () => {
    const modelo = { flujo: { start: { message: 'x', options: { 1: { text: 'Ver precios', next_state: null } } } }, layout: {} };

    assert.equal(crearConectado(modelo, 'start', 0, { tipo: 'final' }), 'ver_precios');
    assert.equal(modelo.flujo.ver_precios.next_state, 'end');
    assert.ok(modelo.flujo.end?.message, 'sin Despedida: se añade armada');
});

test('nombreDesdeTexto: snake_case sin tildes ni signos, empezando por letra', () => {
    assert.equal(nombreDesdeTexto('Opción 1'), 'opcion_1');
    assert.equal(nombreDesdeTexto('¿Trámites en línea?'), 'tramites_en_linea');
    assert.equal(nombreDesdeTexto('Ñandú  -  Señal'), 'nandu_senal');
    assert.equal(nombreDesdeTexto('1. Demandas o escritos'), 'op_1_demandas_o_escritos');
    assert.equal(nombreDesdeTexto('  ¿?  '), '');
    assert.ok(nombreDesdeTexto('a'.repeat(60)).length <= 40);
    assert.equal(validarNombre({}, nombreDesdeTexto('Opción 1')), null, 'cumple el formato de nombres');
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

// --- Estados del sistema por patrón ---

test('plantillaSistema por patrón: forma del flujo PJ, armada y con sus destinos', () => {
    assert.equal(clasificar(plantillaSistema('deposito_pedir_corte')), 'paso');
    assert.equal(plantillaSistema('deposito_pedir_corte').next_state, 'deposito_confirmar');
    assert.match(plantillaSistema('deposito_pedir_corte').message, /\{\{departamentos\}\}/);
    assert.equal(plantillaSistema('deposito_confirmar').options['1'].next_state, 'mas_informacion');
    assert.equal(plantillaSistema('deposito_confirmar').options['2'].next_state, 'deposito_pedir_corte');
    assert.equal(plantillaSistema('derivar_quejas').next_state, 'mas_informacion');
    assert.equal(clasificar(plantillaSistema('esperando_agente_quejas')), 'final');
    assert.match(plantillaSistema('esperando_agente_atencion_al_cliente').message, /área de atencion al cliente/);
});

test('nombrePatron arma el nombre y convierte solo lo que se escribe (QA H9)', () => {
    const derivar = { antes: 'derivar_', despues: '' };
    const pedir = { antes: '', despues: '_pedir_corte' };

    assert.deepEqual(nombrePatron({}, derivar, 'quejas'), { nombre: 'derivar_quejas', error: null });
    assert.deepEqual(nombrePatron({}, pedir, 'deposito'), { nombre: 'deposito_pedir_corte', error: null });
    assert.deepEqual(nombrePatron({}, derivar, 'Atención al Cliente'), { nombre: 'derivar_atencion_al_cliente', error: null });
    assert.match(nombrePatron({}, derivar, '').error, /nombre del área/);
    assert.match(nombrePatron({}, derivar, '¿?').error, /nombre del área/);
    assert.match(nombrePatron({ derivar_quejas: {} }, derivar, 'quejas').error, /Ya existe/);
});

test('describirSistema: fijos y por patrón; null si no es del sistema', () => {
    assert.match(describirSistema('end_or_menu'), /algo más/);
    assert.match(describirSistema('derivar_notificaciones'), /área/);
    assert.match(describirSistema('deposito_pedir_corte'), /lista/);
    assert.match(describirSistema('esperando_agente_quejas'), /asesor/);
    assert.equal(describirSistema('menu_tramites'), null);
    for (const nombre of NOMBRES) assert.ok(describirSistema(nombre), `falta la descripción de ${nombre}`);
});

test('enlazarPareja: al añadir la segunda de la pareja se completa la primera (sin pisar conexiones)', () => {
    const modelo = { flujo: {}, layout: {} };
    agregarEstado(modelo, 'deposito_pedir_corte', plantillaSistema('deposito_pedir_corte', modelo.flujo), { x: 0, y: 0 });
    agregarEstado(modelo, 'deposito_confirmar', plantillaSistema('deposito_confirmar', modelo.flujo), { x: 400, y: 0 });
    enlazarPareja(modelo, 'deposito_confirmar');

    assert.equal(modelo.flujo.deposito_pedir_corte.next_state, 'deposito_confirmar');
    assert.equal(modelo.flujo.deposito_confirmar.options['2'].next_state, 'deposito_pedir_corte');

    const otro = { flujo: { a_confirmar: plantillaSistema('a_confirmar', {}) }, layout: {} };
    otro.flujo.a_confirmar.options['2'].next_state = 'start';            // ya conectado a mano
    otro.flujo.a_pedir_corte = plantillaSistema('a_pedir_corte', otro.flujo);
    enlazarPareja(otro, 'a_pedir_corte');
    assert.equal(otro.flujo.a_confirmar.options['2'].next_state, 'start', 'no pisa lo que ya estaba conectado');
    assert.equal(otro.flujo.a_pedir_corte.next_state, 'a_confirmar');
});

// --- Identificador + nombre visible (paso 2d) ---

test('crearConectado: identificador en slug y nombre visible = texto de la opción', () => {
    const modelo = conMenu();                                          // start: 1 "Trámites", 2 "Salir"
    const id = crearConectado(modelo, 'start', 1, { tipo: 'menu' });

    assert.equal(id, 'salir');
    assert.equal(tituloDe(modelo, 'salir'), 'Salir');
    assert.equal(tituloDe(modelo, 'tramites'), 'tramites', 'sin título: se muestra el identificador');
});

test('aplicarEdicion con título: lo guarda; renombrar lo mueve; eliminar lo borra', () => {
    const modelo = conMenu();
    const base = { message: 'x', tipo: 'paso', next_state: 'end', opciones: [] };

    aplicarEdicion(modelo, 'tramites', { ...base, nombre: 'tramites', titulo: 'Mis trámites en línea' });
    assert.deepEqual(modelo.titulos, { tramites: 'Mis trámites en línea' });

    aplicarEdicion(modelo, 'tramites', { ...base, nombre: 'mis_tramites', titulo: 'Mis trámites en línea' });
    assert.deepEqual(modelo.titulos, { mis_tramites: 'Mis trámites en línea' });
    assert.equal(modelo.flujo.start.options['1'].next_state, 'mis_tramites');

    aplicarEdicion(modelo, 'mis_tramites', { ...base, nombre: 'mis_tramites', titulo: '' });
    assert.deepEqual(modelo.titulos, {}, 'título vacío = sin título propio');

    fijarTitulo(modelo, 'end', 'Despedida');
    eliminarEstado(modelo, 'end');
    assert.ok(!('end' in modelo.titulos));
});

test('contenidoParaGuardar: sin títulos no añade _editor (importado intacto); con títulos sí, fuera de FLUJO', () => {
    const original = { FLUJO: { start: { message: 'a' } }, otra: 1 };
    const modelo = { flujo: { start: { message: 'a' } }, layout: {}, titulos: {} };

    assert.deepEqual(contenidoParaGuardar(original, modelo), { FLUJO: { start: { message: 'a' } }, otra: 1 });

    modelo.titulos.start = 'Bienvenida';
    const conTitulos = contenidoParaGuardar(original, modelo);
    assert.deepEqual(conTitulos._editor, { titulos: { start: 'Bienvenida' } });
    assert.deepEqual(conTitulos.FLUJO, { start: { message: 'a' } }, 'FLUJO no lleva títulos');

    modelo.titulos = {};
    assert.ok(!('_editor' in contenidoParaGuardar({ ...original, _editor: { titulos: { start: 'x' } } }, modelo)),
        'quitar todos los títulos limpia _editor');
});

// --- Estados nuevos: el identificador sigue al nombre visible hasta publicar ---

test('crearConectado marca el estado como nuevo; importados y sistema no', () => {
    const modelo = conMenu();                                          // start: 1 "Trámites", 2 "Salir"
    const id = crearConectado(modelo, 'start', 1, { tipo: 'menu' });

    assert.ok(esNuevo(modelo, id));
    assert.ok(!esNuevo(modelo, 'tramites'), 'ya existía (importado)');
    crearConectado(modelo, 'tramites', 0, { sistema: 'end_or_menu' });
    assert.ok(!esNuevo(modelo, 'end_or_menu'), 'los del sistema nunca');
});

test('un estado nuevo puede cambiar de identificador con su nombre visible; las flechas lo siguen', () => {
    const modelo = conMenu();
    const id = crearConectado(modelo, 'start', 1, { tipo: 'paso' });      // "salir"
    const nuevoId = identificadorPara(modelo.flujo, 'Opción número 1000', id);

    assert.equal(nuevoId, 'opcion_numero_1000');
    aplicarEdicion(modelo, id, { nombre: nuevoId, titulo: 'Opción número 1000', message: '', tipo: 'paso', next_state: null, opciones: [] });

    assert.equal(modelo.flujo.start.options['2'].next_state, 'opcion_numero_1000');
    assert.ok(esNuevo(modelo, 'opcion_numero_1000') && !esNuevo(modelo, 'salir'), 'la marca sigue al estado');
    assert.equal(tituloDe(modelo, 'opcion_numero_1000'), 'Opción número 1000');

    eliminarEstado(modelo, 'opcion_numero_1000');
    assert.deepEqual(modelo.nuevos, []);
});

test('identificadorPara: slug del nombre visible, sin chocar con otros (el propio no cuenta)', () => {
    const flujo = { start: {}, mis_tramites: {} };

    assert.equal(identificadorPara(flujo, 'Consulta de Expedientes'), 'consulta_de_expedientes');
    assert.equal(identificadorPara(flujo, 'Mis trámites'), 'mis_tramites_2');
    assert.equal(identificadorPara(flujo, 'Mis trámites', 'mis_tramites'), 'mis_tramites');
    assert.equal(identificadorPara(flujo, '¿?'), '');
});

test('contenidoParaGuardar guarda la lista de nuevos en _editor (fuera de FLUJO) solo si hay', () => {
    const original = { FLUJO: { start: { message: 'a' } } };
    const modelo = { flujo: { start: { message: 'a' } }, layout: {}, titulos: {}, nuevos: ['paso_1'] };

    assert.deepEqual(contenidoParaGuardar(original, modelo)._editor, { nuevos: ['paso_1'] });
    modelo.nuevos = [];
    assert.ok(!('_editor' in contenidoParaGuardar(original, modelo)));
});

// --- Conectar con una caja existente: toma el nombre de la opción solo si es nueva y nadie más llega ---

/** start con opciones "Consultar trámite" (sin conectar) y "Salir" (→ end); una caja nueva suelta "paso_1". */
const conCajaNueva = () => ({
    flujo: {
        start: { message: '', options: { 1: { text: 'Consultar trámite', next_state: null }, 2: { text: 'Salir', next_state: 'end' } } },
        paso_1: { message: '', next_state: null },
        end: { message: '' },
    },
    layout: {},
    titulos: {},
    nuevos: ['paso_1'],
});

test('caja nueva y sin otras entradas: toma el nombre visible y el identificador de la opción', () => {
    const modelo = conCajaNueva();
    const r = conectarYNombrar(modelo, 'start', 0, 'paso_1');

    assert.deepEqual(r, { destino: 'consultar_tramite', renombrado: true });
    assert.equal(modelo.flujo.start.options['1'].next_state, 'consultar_tramite');
    assert.ok(!('paso_1' in modelo.flujo));
    assert.equal(tituloDe(modelo, 'consultar_tramite'), 'Consultar trámite');
    assert.ok(esNuevo(modelo, 'consultar_tramite'), 'sigue siendo nueva');
});

test('si otra opción ya llega a la caja, conserva su nombre', () => {
    const modelo = conCajaNueva();
    modelo.flujo.start.options['2'].next_state = 'paso_1';            // "Salir" ya llega a paso_1
    const r = conectarYNombrar(modelo, 'start', 0, 'paso_1');

    assert.deepEqual(r, { destino: 'paso_1', renombrado: false });
    assert.equal(modelo.flujo.start.options['1'].next_state, 'paso_1', 'pero sí se conecta');
});

test('estados del sistema e importados (no nuevos) nunca se renombran', () => {
    const modelo = conCajaNueva();
    modelo.flujo.start.options['2'].next_state = null;
    assert.deepEqual(conectarYNombrar(modelo, 'start', 1, 'end'), { destino: 'end', renombrado: false }, 'end es del sistema');

    modelo.nuevos = [];                                                 // paso_1 como si fuera importado
    assert.deepEqual(conectarYNombrar(modelo, 'start', 0, 'paso_1'), { destino: 'paso_1', renombrado: false });
});

test('una salida sin texto (opción vacía o «sigue») no renombra', () => {
    const modelo = conCajaNueva();
    modelo.flujo.otro = { message: '', next_state: null };
    assert.deepEqual(conectarYNombrar(modelo, 'otro', 0, 'paso_1'), { destino: 'paso_1', renombrado: false });
});

// --- Cambiar el texto de una opción actualiza el nombre de su caja hija ---

/** start con "Opción 1" y "Opción 2" sin conectar; desde cada una se crea su caja (nombre = texto de la opción). */
const conHijos = () => {
    const modelo = {
        flujo: { start: { message: '', options: { 1: { text: 'Opción 1', next_state: null }, 2: { text: 'Opción 2', next_state: null } } } },
        layout: { start: { x: 0, y: 0 } },
        titulos: {},
        nuevos: [],
    };
    crearConectado(modelo, 'start', 0, { tipo: 'paso' });   // opcion_1
    crearConectado(modelo, 'start', 1, { tipo: 'paso' });   // opcion_2
    return modelo;
};

/** Edita los textos de las opciones de start como lo hace el modal y sincroniza los hijos. */
const editarOpciones = (modelo, textos) => {
    const antes = salidas(modelo.flujo.start);
    const filas = opcionesDe(modelo.flujo.start).map((fila, i) => ({ ...fila, text: textos[i] ?? fila.text }));
    aplicarEdicion(modelo, 'start', { nombre: 'start', message: '', tipo: 'menu', next_state: null, opciones: filas });
    return sincronizarHijos(modelo, 'start', antes);
};

test('al cambiar el texto de la opción, la caja hija toma el nombre visible y el identificador nuevos', () => {
    const modelo = conHijos();
    const r = editarOpciones(modelo, ['Consultas', 'Opción 2']);

    assert.deepEqual(r, [{ de: 'opcion_1', a: 'consultas' }], 'solo la que cambió');
    assert.equal(modelo.flujo.start.options['1'].next_state, 'consultas');
    assert.equal(tituloDe(modelo, 'consultas'), 'Consultas');
    assert.equal(tituloDe(modelo, 'opcion_2'), 'Opción 2');
});

test('no pisa un nombre visible puesto a mano', () => {
    const modelo = conHijos();
    fijarTitulo(modelo, 'opcion_1', 'Pagos en línea');
    assert.deepEqual(editarOpciones(modelo, ['Consultas']), []);
    assert.equal(tituloDe(modelo, 'opcion_1'), 'Pagos en línea');
});

test('no toca cajas compartidas, importadas ni del sistema', () => {
    const compartida = conHijos();
    compartida.flujo.start.options['2'].next_state = 'opcion_1';      // las dos opciones llevan a opcion_1
    assert.deepEqual(editarOpciones(compartida, ['Consultas']), []);

    const importada = conHijos();
    importada.nuevos = [];
    assert.deepEqual(editarOpciones(importada, ['Consultas']), []);

    const sistema = conHijos();
    sistema.flujo.end = { message: '' };
    sistema.flujo.start.options['1'].next_state = 'end';
    sistema.titulos = {};
    assert.deepEqual(editarOpciones(sistema, ['Fin']), []);
});

test('una caja creada desde una opción sin texto toma el texto cuando se escribe', () => {
    const modelo = { flujo: { start: { message: '', options: { 1: { text: '', next_state: null } } } }, layout: {}, titulos: {}, nuevos: [] };
    crearConectado(modelo, 'start', 0, { tipo: 'menu' });               // sin texto → start_opcion_1, sin nombre visible
    assert.deepEqual(editarOpciones(modelo, ['Pagos']), [{ de: 'start_opcion_1', a: 'pagos' }]);
    assert.equal(tituloDe(modelo, 'pagos'), 'Pagos');
});

test('pasos especiales: nombre amigable e icono para todos (fijos y por patrón); null si no lo es', () => {
    assert.equal(etiquetaSistema('start'), 'Bienvenida');
    assert.equal(etiquetaSistema('end'), 'Despedida');
    assert.equal(etiquetaSistema('esperando_agente'), 'Pasar con un asesor');
    assert.equal(etiquetaSistema('derivar_quejas'), 'Derivar a un área');
    assert.equal(etiquetaSistema('deposito_pedir_corte'), 'Pedir que elija de la lista');
    assert.equal(etiquetaSistema('esperando_agente_quejas'), 'Esperar asesor de un área');
    assert.equal(etiquetaSistema('menu_tramites'), null);
    for (const nombre of NOMBRES) {
        assert.ok(etiquetaSistema(nombre), `falta el nombre amigable de ${nombre}`);
        assert.ok(iconoSistema(nombre), `falta el icono de ${nombre}`);
    }
});

test('los textos que ve la persona usan términos generales (nada de un cliente en particular)', () => {
    const textos = [...NOMBRES, 'derivar_x', 'x_pedir_corte', 'x_confirmar', 'esperando_agente_x']
        .flatMap((n) => [etiquetaSistema(n), describirSistema(n)]).join(' ');
    assert.doesNotMatch(textos, /corte|jurisdicci|judicial|ONPE|elecci[oó]n electoral/i);
});

test('aplicarEdicion (QA H10, H15): opción sin texto y mensaje más largo que el límite de WhatsApp no se aplican', () => {
    const modelo = { flujo: { start: { message: 'Hola', options: { 1: { text: 'A', next_state: null } } } }, layout: {} };
    const menu = (opciones, message = 'Hola') => ({ nombre: 'start', message, tipo: 'menu', opciones });

    assert.deepEqual(aplicarEdicion(modelo, 'start', menu([{ clave: '1', text: 'A' }, { clave: '2', text: '  ' }])),
        { campo: 'texto', indice: 1, mensaje: 'Escribe el texto de la opción «2».' });
    assert.equal(aplicarEdicion(modelo, 'start', menu([{ clave: '1', text: 'A' }], 'x'.repeat(4097))).campo, 'mensaje');
    assert.equal(modelo.flujo.start.message, 'Hola', 'nada cambió');
    assert.equal(aplicarEdicion(modelo, 'start', menu([{ clave: '1', text: 'A' }], 'x'.repeat(4096))), null, '4096 justo sí');
});

test('aplicarEdicion (QA H5): las palabras clave viajan en `extra` y se guardan en la opción', () => {
    const modelo = { flujo: { start: { message: 'Hola', options: { 1: { text: 'Precios', next_state: 'p', keywords: ['viejo'] } } }, p: { message: 'x' } }, layout: {} };

    aplicarEdicion(modelo, 'start', { nombre: 'start', message: 'Hola', tipo: 'menu',
        opciones: [{ clave: '1', text: 'Precios', next_state: 'p', extra: { keywords: ['precio', 'cuánto cuesta'] } }] });
    assert.deepEqual(modelo.flujo.start.options['1'], { keywords: ['precio', 'cuánto cuesta'], text: 'Precios', next_state: 'p' });
});
