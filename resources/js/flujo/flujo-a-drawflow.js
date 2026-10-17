import { esEstadoSistema } from './estados-sistema.js';

// Traductor FLUJO → formato de importación de Drawflow. Módulo puro (sin DOM) para poder probarlo.
//
// Cada estado es una caja. Cada opción es una salida (en el orden de las claves) y, si el estado
// tiene next_state, una salida más al final. Cada salida se conecta con la caja de su destino.

const ANCHO_COLUMNA = 340;
const ALTO_FILA = 220;
const MARGEN = 40;

const ETIQUETAS = { menu: 'Menú', paso: 'Paso', final: 'Final' };

/** menu (tiene opciones), paso (solo next_state) o final (ninguno de los dos). */
export function clasificar(estado) {
    if (estado.options && Object.keys(estado.options).length > 0) return 'menu';
    if (estado.next_state) return 'paso';
    return 'final';
}

/**
 * Salidas del estado, en orden. Ojo: en JavaScript las claves numéricas de un objeto se recorren
 * primero y en orden ascendente, así que {"1","salir","2"} se recorre como 1, 2, salir.
 */
export function salidas(estado) {
    const lista = Object.entries(estado.options ?? {}).map(([clave, opcion]) => ({
        clave,
        texto: opcion.text ?? '',
        destino: opcion.next_state ?? null,
        oculta: !/^\d+$/.test(clave), // el motor no muestra en el menú las claves no numéricas
    }));

    if (estado.next_state) {
        lista.push({ clave: null, texto: '', destino: estado.next_state, oculta: false });
    }

    return lista;
}

/** Recorrido en anchura desde start: distancia (columna) de cada estado alcanzable. */
export function distancias(flujo) {
    const distancia = new Map();
    if (!flujo.start) return distancia;

    const cola = ['start'];
    distancia.set('start', 0);

    while (cola.length > 0) {
        const actual = cola.shift();
        for (const { destino } of salidas(flujo[actual])) {
            if (destino in flujo && !distancia.has(destino)) {
                distancia.set(destino, distancia.get(actual) + 1);
                cola.push(destino);
            }
        }
    }

    return distancia;
}

/** Posición de cada caja: la guardada en layout o, si no hay, una columna por distancia desde start. */
export function calcularPosiciones(flujo, layout = {}) {
    const distancia = distancias(flujo);
    const columnaHuerfanos = Math.max(-1, ...distancia.values()) + 1;
    const filasOcupadas = new Map();
    const posiciones = {};

    for (const nombre of Object.keys(flujo)) {
        if (layout?.[nombre]) {
            posiciones[nombre] = { x: layout[nombre].x, y: layout[nombre].y };
            continue;
        }

        const columna = distancia.get(nombre) ?? columnaHuerfanos;
        const fila = filasOcupadas.get(columna) ?? 0;
        filasOcupadas.set(columna, fila + 1);

        posiciones[nombre] = { x: MARGEN + columna * ANCHO_COLUMNA, y: MARGEN + fila * ALTO_FILA };
    }

    return posiciones;
}

/**
 * Devuelve { datos, resumen }:
 *  - datos: lo que recibe editor.import() de Drawflow.
 *  - resumen: { total, alcanzables, sinConexion }.
 */
export function flujoADrawflow(flujo, layout = {}) {
    const nombres = Object.keys(flujo);
    const idDe = new Map(nombres.map((nombre, i) => [nombre, String(i + 1)]));
    const posiciones = calcularPosiciones(flujo, layout);
    const alcanzables = distancias(flujo);
    const nodos = {};

    // 1. Una caja por estado, con sus salidas todavía sin conectar.
    for (const nombre of nombres) {
        const estado = flujo[nombre];
        const tipo = clasificar(estado);
        const sistema = esEstadoSistema(nombre);
        const lista = salidas(estado);
        const id = idDe.get(nombre);

        nodos[id] = {
            id: Number(id),
            name: nombre,
            data: { nombre },
            class: ['tipo-' + tipo, sistema ? 'es-sistema' : '', alcanzables.has(nombre) ? '' : 'sin-conexion']
                .filter(Boolean)
                .join(' '),
            html: htmlCaja(nombre, estado, tipo, sistema, lista, flujo),
            typenode: false,
            inputs: { input_1: { connections: [] } },
            outputs: Object.fromEntries(lista.map((_, i) => ['output_' + (i + 1), { connections: [] }])),
            pos_x: posiciones[nombre].x,
            pos_y: posiciones[nombre].y,
        };
    }

    // 2. Una flecha por salida cuyo destino existe. Drawflow exige anotarla en los dos extremos.
    for (const nombre of nombres) {
        const origen = idDe.get(nombre);
        salidas(flujo[nombre]).forEach(({ destino }, i) => {
            if (!idDe.has(destino)) return; // destino inexistente: queda sin flecha (lo marcará el validador)
            const salida = 'output_' + (i + 1);
            const llegada = idDe.get(destino);
            nodos[origen].outputs[salida].connections.push({ node: llegada, output: 'input_1' });
            nodos[llegada].inputs.input_1.connections.push({ node: origen, input: salida });
        });
    }

    return {
        datos: { drawflow: { Home: { data: nodos } } },
        resumen: {
            total: nombres.length,
            alcanzables: alcanzables.size,
            sinConexion: nombres.length - alcanzables.size,
        },
    };
}

function htmlCaja(nombre, estado, tipo, sistema, lista, flujo) {
    const candado = sistema ? '<span class="caja-candado" title="Estado del sistema: el nombre no se puede cambiar">&#128274;</span>' : '';

    const filas = lista.map(({ clave, texto, destino, oculta }) => {
        const roto = !(destino in flujo);
        const etiqueta = clave === null ? '<span class="caja-clave">sigue</span>' : `<span class="caja-clave">${escapar(clave)}</span> ${escapar(texto)}`;
        return `<li class="${oculta ? 'opcion-oculta' : ''}${roto ? ' destino-roto' : ''}">`
            + `${etiqueta}${oculta ? ' <em>(oculta)</em>' : ''}`
            + `<span class="caja-destino">&rarr; ${escapar(destino ?? '?')}${roto ? ' &#9888; no existe' : ''}</span></li>`;
    });

    return `<div class="caja">`
        + `<div class="caja-cabecera"><span class="caja-nombre">${escapar(nombre)}</span>${candado}<span class="caja-tipo">${ETIQUETAS[tipo]}</span></div>`
        + `<div class="caja-mensaje">${escapar(estado.message ?? '')}</div>`
        + (filas.length ? `<ul class="caja-salidas">${filas.join('')}</ul>` : '')
        + `</div>`;
}

/** Los mensajes los escribe el usuario: nunca insertarlos en el HTML sin escapar. */
export function escapar(texto) {
    return String(texto)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
