import { salidas, tiposDeConexion } from './flujo-a-drawflow.js';

// Botón "Ordenar": recoloca las cajas como un árbol de izquierda a derecha.
//
// - El árbol sale del recorrido en anchura desde start: cada estado cuelga del primero que lo alcanza
//   (las conexiones de regreso o a destinos muy usados se ven como atajo y no forman parte del árbol).
// - Columna = profundidad en el árbol. Cada caja se centra verticalmente frente a sus hijos, y cada
//   subárbol ocupa su propia franja de altura: así las líneas casi no se cruzan.
// - Los estados que no cuelgan de start se ordenan igual, debajo, como árboles aparte.

const ANCHO_COLUMNA = 360;
const SEPARACION = 30;
const MARGEN = 40;
const POR_FILA = 4;

/** Altura aproximada de una caja si no se pudo medir en la página. */
function altoEstimado(estado) {
    return 110 + 22 * salidas(estado).length;
}

/**
 * @param flujo   el FLUJO
 * @param alturas { nombre: alto en px } medido en la página (opcional)
 * @returns layout { nombre: { x, y } } para todos los estados
 */
export function ordenarArbol(flujo, alturas = {}) {
    const tipos = tiposDeConexion(flujo);
    const alto = (nombre) => (alturas[nombre] ?? altoEstimado(flujo[nombre])) + SEPARACION;
    const hijos = new Map();
    const colocado = new Set();
    const layout = {};

    /** Árbol en anchura desde raiz entre los estados aún no colocados (solo conexiones de tipo línea). */
    function armarArbol(raiz) {
        const cola = [raiz];
        colocado.add(raiz);
        while (cola.length) {
            const actual = cola.shift();
            const lista = [];
            salidas(flujo[actual]).forEach(({ destino }, i) => {
                if (tipos[actual][i] === 'linea' && !colocado.has(destino)) {
                    colocado.add(destino);
                    lista.push(destino);
                    cola.push(destino);
                }
            });
            hijos.set(actual, lista);
        }
    }

    /** Coloca el subárbol desde la altura y; devuelve la altura que ocupa. */
    function colocar(nombre, profundidad, y) {
        let ocupado = 0;
        for (const hijo of hijos.get(nombre)) {
            ocupado += colocar(hijo, profundidad + 1, y + ocupado);
        }

        const propio = alto(nombre);
        const total = Math.max(ocupado, propio);
        layout[nombre] = {
            x: MARGEN + profundidad * ANCHO_COLUMNA,
            y: Math.round(y + (total - propio) / 2), // centrada frente a sus hijos
        };
        return total;
    }

    let y = MARGEN;
    const raices = ['start', ...Object.keys(flujo)].filter((nombre, i, todas) => nombre in flujo && todas.indexOf(nombre) === i);
    const sueltas = []; // raíces sin hijos (ej. end, o estados que nadie conecta): van en cuadrícula

    for (const raiz of raices) {
        if (colocado.has(raiz)) continue;
        armarArbol(raiz);
        if (raiz !== 'start' && hijos.get(raiz).length === 0) {
            sueltas.push(raiz);
            continue;
        }
        y += colocar(raiz, 0, y) + SEPARACION * 2;
    }

    // Cuadrícula de POR_FILA columnas, debajo de todo; cada fila tan alta como su caja más alta.
    for (let i = 0; i < sueltas.length; i += POR_FILA) {
        const fila = sueltas.slice(i, i + POR_FILA);
        fila.forEach((nombre, j) => { layout[nombre] = { x: MARGEN + j * ANCHO_COLUMNA, y }; });
        y += Math.max(...fila.map(alto));
    }

    return layout;
}
