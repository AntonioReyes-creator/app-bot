import { esEstadoSistema, etiquetaSistema, iconoSistema } from './estados-sistema.js';

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

/**
 * El árbol del flujo (la jerarquía): recorrido en anchura desde start y, después, desde cada estado que no
 * cuelga de start (en el orden del FLUJO). Cada estado cuelga de la PRIMERA salida que llega a él.
 * Devuelve { hijos: Map nombre → [hijos en el orden de las opciones], aristas: Set "origen#i" del árbol, raices }.
 * Lo usan Ordenar (dónde va cada caja) y el dibujo (solo las conexiones del árbol llevan línea).
 */
export function arbolDeEstados(flujo) {
    const hijos = new Map();
    const aristas = new Set();
    const visto = new Set();
    const raices = [];

    for (const raiz of ['start', ...Object.keys(flujo)]) {
        if (!(raiz in flujo) || visto.has(raiz)) continue;
        raices.push(raiz);
        visto.add(raiz);
        const cola = [raiz];
        while (cola.length) {
            const actual = cola.shift();
            const lista = [];
            salidas(flujo[actual]).forEach(({ destino }, i) => {
                if (destino != null && destino in flujo && !visto.has(destino)) {
                    visto.add(destino);
                    lista.push(destino);
                    aristas.add(`${actual}#${i}`);
                    cola.push(destino);
                }
            });
            hijos.set(actual, lista);
        }
    }

    return { hijos, aristas, raices };
}

/** Si el destino empieza más de esto a la izquierda del origen, la conexión "vuelve atrás". */
const MARGEN_ATRAS = 100;

/**
 * Cómo se DIBUJA cada conexión. Devuelve { nombre: ['linea' | 'copia' | 'atajo-atras' | 'atajo-cruce' | null, …] } en
 * el orden de salidas() (null = sin destino válido), en este orden:
 *  - no es del árbol, el destino tiene opciones y no es start ni un antepasado (ej. varias cajas → end_or_menu) →
 *    copia: línea a una cajita "copia de vista" del destino dibujada junto al origen (el FLUJO no se duplica).
 *    Solo si `copias` está activado (interruptor ⧉ Copias del editor); si no, se ve como etiqueta ⇢.
 *  - destino a la izquierda (volver atrás, ej. "volver al menú") → etiqueta ↩.
 *  - no es del árbol (el destino ya cuelga de otra opción, ej. varias "No, gracias" → end) → etiqueta ⇢:
 *    el mapa muestra solo la jerarquía, sin haces de líneas hacia los estados compartidos.
 *  - es del árbol pero pasaría por detrás de otras cajas (`cruzan`, medido con geometria.js) → etiqueta ⇢.
 *  - si no → línea.
 * Es solo visual: el FLUJO no cambia.
 */
export function tiposDeDibujo(flujo, posiciones, cruzan = new Set(), { arbol = arbolDeEstados(flujo), copias = false } = {}) {
    const { aristas, hijos } = arbol;
    const padre = new Map([...hijos].flatMap(([p, lista]) => lista.map((h) => [h, p])));
    const esAntepasado = (quien, de) => { // ¿`quien` es `de` o está por encima de él en el árbol?
        for (let n = de; n != null; n = padre.get(n)) if (n === quien) return true;
        return false;
    };

    return Object.fromEntries(Object.entries(flujo).map(([nombre, estado]) => [nombre, salidas(estado).map(({ destino }, i) => {
        if (destino == null || !(destino in flujo)) return null;
        if (copias && !aristas.has(`${nombre}#${i}`) && esCompartidoConOpciones(flujo, destino) && !esAntepasado(destino, nombre)) return 'copia';
        if (posiciones[destino].x < posiciones[nombre].x - MARGEN_ATRAS) return 'atajo-atras';
        if (!aristas.has(`${nombre}#${i}`)) return 'atajo-cruce';
        if (cruzan.has(`${nombre}#${i}`)) return 'atajo-cruce';
        return 'linea';
    })]));
}

/** Destino que se puede mostrar como copia de vista: tiene opciones y no es start (volver al inicio es ↩). */
function esCompartidoConOpciones(flujo, destino) {
    return destino !== 'start' && Object.keys(flujo[destino]?.options ?? {}).length > 0;
}

/** Clave de una copia de vista en el layout: "copia:origen#i" (origen y nº de salida que la usan). */
export const claveCopia = (origen, indice) => `copia:${origen}#${indice}`;

/** ¿La salida nº i de este estado va hacia atrás (destino a la izquierda)? */
export function vaHaciaAtras(posiciones, origen, destino) {
    return posiciones[destino].x < posiciones[origen].x - MARGEN_ATRAS;
}

/**
 * Devuelve { datos, resumen, nombrePorId, conexiones }:
 *  - datos: lo que recibe editor.import() de Drawflow.
 *  - resumen: { total, alcanzables, sinConexion }.
 *  - nombrePorId: Map id de Drawflow ("1") → nombre del estado; los ids cambian en cada dibujo.
 *  - copiaPorId: Map id de Drawflow → { clave, origen, indice, destino } de cada copia de vista (no son estados).
 *  - conexiones: { lineas, atajos, copias } (líneas a cajas reales, etiquetas y líneas a copias).
 * titulos: nombres visibles { identificador: "Nombre visible" } (contenido._editor.titulos).
 * cruzan: claves "origen#i" de las conexiones cuya línea pasaría por detrás de otras cajas (se ven como etiqueta).
 * copias: dibujar las copias de vista de los estados compartidos (interruptor ⧉ Copias).
 */
export function flujoADrawflow(flujo, layout = {}, titulos = {}, cruzan = new Set(), { copias = false } = {}) {
    const nombres = Object.keys(flujo);
    const idDe = new Map(nombres.map((nombre, i) => [nombre, String(i + 1)]));
    const posiciones = calcularPosiciones(flujo, layout);
    const alcanzables = distancias(flujo);
    const tipos = tiposDeDibujo(flujo, posiciones, cruzan, { copias });
    const conexiones = { lineas: 0, atajos: 0, copias: 0 };
    const copiaPorId = new Map();
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
    //    Si es copia: se crea la cajita "copia de vista" junto al origen y la flecha va a ella.
    for (const nombre of nombres) {
        const origen = idDe.get(nombre);
        salidas(flujo[nombre]).forEach(({ destino }, i) => {
            if (!idDe.has(destino)) return; // destino inexistente: queda sin flecha (lo marcará el validador)
            if (tipos[nombre][i] === 'copia') {
                conexiones.copias++;
                const id = String(nombres.length + copiaPorId.size + 1);
                const clave = claveCopia(nombre, i);
                const lugar = layout?.[clave] ?? { x: posiciones[nombre].x + 420, y: posiciones[nombre].y + 40 + 22 * i };
                copiaPorId.set(id, { clave, origen: nombre, indice: i, destino });
                nodos[id] = {
                    id: Number(id),
                    name: clave,
                    data: { copiaDe: destino },
                    class: `copia tipo-${clasificar(flujo[destino])}`,
                    html: htmlCopia(destino, flujo, titulos),
                    typenode: false,
                    inputs: { input_1: { connections: [{ node: origen, input: 'output_' + (i + 1) }] } },
                    outputs: {},
                    pos_x: lugar.x,
                    pos_y: lugar.y,
                };
                nodos[origen].outputs['output_' + (i + 1)].connections.push({ node: id, output: 'input_1' });
                return;
            }
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
        copiaPorId,
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
        if (tiposSalida[i] === 'atajo-atras' || tiposSalida[i] === 'atajo-cruce') {
            // Etiqueta en vez de línea; clic = ir a ese estado. ↩ vuelve atrás; ⇢ el estado está en otra rama del árbol.
            const simbolo = tiposSalida[i] === 'atajo-atras' ? '&#8617;' : '&#8674;';
            destinoHtml = `<button type="button" class="caja-atajo" data-ir="${escapar(destino)}" title="Está en otra parte del mapa: clic para ir a «${escapar(visible(destino))}»">${simbolo} ${escapar(visible(destino))}</button>`;
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
        + (etiquetaSistema(nombre) ? `<span class="caja-etiqueta" title="Paso especial: el bot ya sabe hacerlo">${iconoSistema(nombre)} ${etiquetaSistema(nombre)}</span>` : '')
        + `<span class="caja-tipo">${ETIQUETAS[tipo]}</span>`
        + `<button type="button" class="caja-editar" data-editar title="Editar (o doble clic en la caja)">&#9998;</button></div>`
        + `<div class="caja-mensaje">${estado.message ? escapar(estado.message) : '<span class="caja-vacio">(sin mensaje)</span>'}</div>`
        + (filas.length ? `<ul class="caja-salidas">${filas.join('')}</ul>` : '')
        + `</div>`;
}

/**
 * Copia de vista de un estado compartido, compacta (una "píldora"): su nombre y, debajo, sus opciones como
 * etiquetas para ir (1 ⇢ start · 2 ⇢ encuesta_inicio). Sin bolitas de salida: de la copia no salen líneas.
 * Es solo lectura: se edita la caja real (doble clic lleva a ella).
 */
function htmlCopia(nombre, flujo, titulos = {}) {
    const visible = (id) => titulos[id] || id;
    const opciones = Object.entries(flujo[nombre].options ?? {}).map(([clave, opcion]) => {
        const destino = opcion?.next_state;
        const texto = escapar(opcion?.text ?? '');
        return destino == null
            ? `<span class="copia-opcion" title="${texto}">${escapar(clave)} &middot; sin conectar</span>`
            : `<button type="button" class="caja-atajo copia-opcion" data-ir="${escapar(destino)}" title="${escapar(clave)}. ${texto} → ${escapar(visible(destino))}">`
                + `${escapar(clave)} &#8674; ${escapar(visible(destino))}</button>`;
    });
    const nombreHtml = etiquetaSistema(nombre) ? `${iconoSistema(nombre)} ${etiquetaSistema(nombre)}` : escapar(visible(nombre));

    return `<div class="copia-pildora" title="Copia de vista de «${escapar(visible(nombre))}» (${escapar(nombre)}) · doble clic: ir a la caja real">`
        + `<div class="copia-nombre">&#10697; ${nombreHtml}</div>`
        + `<div class="copia-opciones">${opciones.join('')}</div>`
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
