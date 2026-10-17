import { esEstadoSistema, etiquetaSistema } from './estados-sistema.js';

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

/** Un destino que recibe estas conexiones o más se considera "muy usado" al ordenar (ordenar.js). */
export const MINIMO_FRECUENTE = 3;

/** Más allá de esta distancia entre los centros de dos cajas (px del lienzo), la conexión va como etiqueta. */
export const DISTANCIA_ATAJO = 1000;

/** Si el destino empieza más de esto a la izquierda del origen, la conexión "vuelve atrás". */
const MARGEN_ATRAS = 100;

/**
 * Cómo se DIBUJA cada conexión, según dónde están las cajas en el lienzo. Devuelve
 * { nombre: ['linea' | 'lejos-atras' | 'lejos-adelante' | null, …] } en el orden de salidas()
 * (null = sin destino válido):
 *  - destino a la izquierda (volver atrás, ej. "volver al menú") → etiqueta ↩, aunque esté cerca:
 *    esa línea tendría que dar la vuelta por detrás de las cajas.
 *  - destino adelante y cerca → línea.
 *  - destino adelante y lejos (más de DISTANCIA_ATAJO entre centros) → etiqueta ⇢.
 * Es solo visual: el FLUJO no cambia.
 */
export function conexionesLejanas(flujo, posiciones) {
    return Object.fromEntries(Object.entries(flujo).map(([nombre, estado]) => [nombre, salidas(estado).map(({ destino }) => {
        if (destino == null || !(destino in flujo)) return null;
        const a = posiciones[nombre];
        const b = posiciones[destino];
        if (b.x < a.x - MARGEN_ATRAS) return 'lejos-atras';
        if (Math.hypot(b.x - a.x, b.y - a.y) > DISTANCIA_ATAJO) return 'lejos-adelante';
        return 'linea';
    })]));
}

/**
 * Estructura del flujo para el botón Ordenar (ordenar.js): qué conexiones forman el árbol. Devuelve
 * { nombre: ['linea' | 'regreso' | 'frecuente' | null, …] } en el orden de salidas().
 *  - regreso: el destino está a la misma distancia de start o menos (ej. "volver al menú"). Una conexión
 *    "hacia adelante" en el recorrido en anchura siempre va de la distancia d a la d+1.
 *  - frecuente: el destino recibe MINIMO_FRECUENTE conexiones o más (ej. end).
 * No decide qué se dibuja (eso es conexionesLejanas).
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
 * titulos: nombres visibles { identificador: "Nombre visible" } (contenido._editor.titulos).
 */
export function flujoADrawflow(flujo, layout = {}, titulos = {}) {
    const nombres = Object.keys(flujo);
    const idDe = new Map(nombres.map((nombre, i) => [nombre, String(i + 1)]));
    const posiciones = calcularPosiciones(flujo, layout);
    const alcanzables = distancias(flujo);
    const tipos = conexionesLejanas(flujo, posiciones);
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
            html: htmlCaja(nombre, estado, tipo, sistema, lista, flujo, tipos[nombre], titulos),
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

function htmlCaja(nombre, estado, tipo, sistema, lista, flujo, tiposSalida = [], titulos = {}) {
    const visible = (id) => titulos[id] || id; // nombre visible de un estado (o su identificador)
    const candado = sistema ? '<span class="caja-candado" title="Estado del sistema: el nombre no se puede cambiar">&#128274;</span>' : '';

    const filas = lista.map(({ clave, texto, destino, oculta }, i) => {
        const sinConectar = destino == null;
        const roto = !sinConectar && !(destino in flujo);
        const textoHtml = texto ? escapar(texto) : '<span class="caja-vacio">(sin texto)</span>';
        const etiqueta = clave === null ? '<span class="caja-clave">sigue</span>' : `<span class="caja-clave">${escapar(clave)}</span> ${textoHtml}`;
        let destinoHtml = sinConectar ? 'sin conectar' : `&rarr; ${escapar(visible(destino))}${roto ? ' &#9888; no existe' : ''}`;
        if (tiposSalida[i] === 'lejos-atras' || tiposSalida[i] === 'lejos-adelante') {
            // Caja lejana: etiqueta en vez de línea; clic = ir a ese estado. ↩ está a la izquierda, ⇢ a la derecha.
            const simbolo = tiposSalida[i] === 'lejos-atras' ? '&#8617;' : '&#8674;';
            destinoHtml = `<button type="button" class="caja-atajo" data-ir="${escapar(destino)}" title="Está lejos en el lienzo: clic para ir a «${escapar(visible(destino))}»">${simbolo} ${escapar(visible(destino))}</button>`;
        }
        // data-salida: editor.js coloca la bolita nº i a la altura de esta fila.
        return `<li data-salida="${i}" class="${oculta ? 'opcion-oculta' : ''}${roto ? ' destino-roto' : ''}${sinConectar ? ' destino-pendiente' : ''}">`
            + `${etiqueta}${oculta ? ' <em>(oculta)</em>' : ''}`
            + `<span class="caja-destino">${destinoHtml}</span></li>`;
    });

    return `<div class="caja">`
        // Nombre visible en grande y, debajo, el identificador (lo que usa el bot). Sin nombre visible: solo el identificador.
        + `<div class="caja-cabecera"><div class="caja-nombres${titulos[nombre] ? ' con-titulo' : ''}">`
        + (titulos[nombre] ? `<span class="caja-titulo">${escapar(titulos[nombre])}</span>` : '')
        + `<span class="caja-nombre">${escapar(nombre)}</span></div>${candado}`
        + (etiquetaSistema(nombre) ? `<span class="caja-etiqueta">${etiquetaSistema(nombre)}</span>` : '')
        + `<span class="caja-tipo">${ETIQUETAS[tipo]}</span>`
        + `<button type="button" class="caja-editar" data-editar title="Editar (o doble clic en la caja)">&#9998;</button></div>`
        + `<div class="caja-mensaje">${estado.message ? escapar(estado.message) : '<span class="caja-vacio">(sin mensaje)</span>'}</div>`
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
