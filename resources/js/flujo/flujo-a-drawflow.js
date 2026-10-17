import { esEstadoSistema } from './estados-sistema.js';

// Traductor FLUJO → formato de importación de Drawflow. Módulo puro (sin DOM) para poder probarlo.
//
// Cada estado es una caja. Cada opción es una salida (en el orden de las claves) y, si el estado
// tiene next_state, una salida más al final. Cada salida se conecta con la caja de su destino.

const ANCHO_COLUMNA = 340;
const ALTO_FILA = 220;
const MARGEN = 40;

const ETIQUETAS = { menu: 'Menú', paso: 'Paso', final: 'Final' };

/**
 * menu (tiene opciones), paso (tiene next_state, aunque esté sin conectar: null) o final.
 */
export function clasificar(estado) {
    if (estado.options && Object.keys(estado.options).length > 0) return 'menu';
    if ('next_state' in estado) return 'paso';
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

    if ('next_state' in estado) {
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
            if (destino != null && destino in flujo && !distancia.has(destino)) {
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

/** Un destino que recibe estas conexiones o más se muestra como atajo en vez de con líneas. */
export const MINIMO_FRECUENTE = 3;

/**
 * Cómo se dibuja cada conexión, para no llenar el lienzo de líneas largas. Devuelve
 * { nombre: ['linea' | 'regreso' | 'frecuente' | null, …] } en el orden de salidas() (null = sin destino válido).
 *  - regreso: el destino está a la misma distancia de start o menos (ej. "volver al menú"). Una conexión
 *    "hacia adelante" en el recorrido en anchura siempre va de la distancia d a la d+1.
 *  - frecuente: el destino recibe MINIMO_FRECUENTE conexiones o más (ej. end).
 * Es solo visual: el FLUJO no cambia.
 */
export function tiposDeConexion(flujo) {
    const distancia = distancias(flujo);
    const entradas = new Map();
    for (const estado of Object.values(flujo)) {
        for (const { destino } of salidas(estado)) {
            if (destino != null && destino in flujo) entradas.set(destino, (entradas.get(destino) ?? 0) + 1);
        }
    }

    return Object.fromEntries(Object.entries(flujo).map(([nombre, estado]) => [nombre, salidas(estado).map(({ destino }) => {
        if (destino == null || !(destino in flujo)) return null;
        if (entradas.get(destino) >= MINIMO_FRECUENTE) return 'frecuente';
        if (distancia.has(nombre) && distancia.has(destino) && distancia.get(destino) <= distancia.get(nombre)) return 'regreso';
        return 'linea';
    })]));
}

/**
 * Devuelve { datos, resumen, nombrePorId, conexiones }:
 *  - datos: lo que recibe editor.import() de Drawflow.
 *  - resumen: { total, alcanzables, sinConexion }.
 *  - nombrePorId: Map id de Drawflow ("1") → nombre del estado; los ids cambian en cada dibujo.
 *  - conexiones: { lineas, atajos } (cuántas se dibujan y cuántas van como etiqueta).
 */
export function flujoADrawflow(flujo, layout = {}) {
    const nombres = Object.keys(flujo);
    const idDe = new Map(nombres.map((nombre, i) => [nombre, String(i + 1)]));
    const posiciones = calcularPosiciones(flujo, layout);
    const alcanzables = distancias(flujo);
    const tipos = tiposDeConexion(flujo);
    const conexiones = { lineas: 0, atajos: 0 };
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
            html: htmlCaja(nombre, estado, tipo, sistema, lista, flujo, tipos[nombre]),
            typenode: false,
            inputs: { input_1: { connections: [] } },
            outputs: Object.fromEntries(lista.map((_, i) => ['output_' + (i + 1), { connections: [] }])),
            pos_x: posiciones[nombre].x,
            pos_y: posiciones[nombre].y,
        };
    }

    // 2. Una flecha por salida cuyo destino existe y no es atajo. Drawflow exige anotarla en los dos extremos.
    for (const nombre of nombres) {
        const origen = idDe.get(nombre);
        salidas(flujo[nombre]).forEach(({ destino }, i) => {
            if (!idDe.has(destino)) return; // destino inexistente: queda sin flecha (lo marcará el validador)
            if (tipos[nombre][i] !== 'linea') {
                conexiones.atajos++; // se muestra como etiqueta en la fila (htmlCaja)
                return;
            }
            conexiones.lineas++;
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
        nombrePorId: new Map([...idDe].map(([nombre, id]) => [id, nombre])),
        conexiones,
    };
}

function htmlCaja(nombre, estado, tipo, sistema, lista, flujo, tiposSalida = []) {
    const candado = sistema ? '<span class="caja-candado" title="Estado del sistema: el nombre no se puede cambiar">&#128274;</span>' : '';

    const filas = lista.map(({ clave, texto, destino, oculta }, i) => {
        const sinConectar = destino == null;
        const roto = !sinConectar && !(destino in flujo);
        const etiqueta = clave === null ? '<span class="caja-clave">sigue</span>' : `<span class="caja-clave">${escapar(clave)}</span> ${escapar(texto)}`;
        const atajo = tiposSalida[i] === 'regreso' || tiposSalida[i] === 'frecuente';
        let destinoHtml = sinConectar ? 'sin conectar' : `&rarr; ${escapar(destino)}${roto ? ' &#9888; no existe' : ''}`;
        if (atajo) {
            // Etiqueta en vez de línea; clic = ir a ese estado. ↩ vuelve atrás, ⇥ destino muy usado.
            const [simbolo, ayuda] = tiposSalida[i] === 'regreso'
                ? ['&#8617;', 'Vuelve a un estado anterior']
                : ['&#8677;', 'Destino muy usado'];
            destinoHtml = `<button type="button" class="caja-atajo" data-ir="${escapar(destino)}" title="${ayuda}: clic para ir a «${escapar(destino)}»">${simbolo} ${escapar(destino)}</button>`;
        }
        // data-salida: editor.js coloca la bolita nº i a la altura de esta fila.
        return `<li data-salida="${i}" class="${oculta ? 'opcion-oculta' : ''}${roto ? ' destino-roto' : ''}${sinConectar ? ' destino-pendiente' : ''}">`
            + `${etiqueta}${oculta ? ' <em>(oculta)</em>' : ''}`
            + `<span class="caja-destino">${destinoHtml}</span></li>`;
    });

    return `<div class="caja">`
        + `<div class="caja-cabecera"><span class="caja-nombre">${escapar(nombre)}</span>${candado}<span class="caja-tipo">${ETIQUETAS[tipo]}</span>`
        + `<button type="button" class="caja-editar" data-editar title="Editar (o doble clic en la caja)">&#9998;</button></div>`
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
