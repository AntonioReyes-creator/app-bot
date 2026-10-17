import { arbolDeEstados, salidas } from './flujo-a-drawflow.js';

// Botón "Ordenar": recoloca las cajas como un mapa mental (árbol clásico) de izquierda a derecha.
//
//                 ┌─▶ Tema 1 ─▶ Paso ─▶ Paso          ← un solo hijo: en línea recta
//   start ────────┼─▶ Tema 2 ─┬─▶ 2.1
//                 │           └─▶ 2.2                  ← hermanos: apilados en la columna siguiente
//                 └─▶ Tema 3
//
// - Profundidad = hacia la derecha: cada nivel, una columna más a la derecha de su padre.
// - Hermanos = hacia abajo: las opciones de una caja van una debajo de otra, en el orden de las opciones.
// - Cada caja se centra frente al bloque de sus hijos. Si tiene un solo hijo, se alinean las bolitas: la entrada del
//   hijo queda a la altura de la salida del padre y la línea sale recta (cadena).
// - Cada rama ocupa solo el alto que necesita, así las ramas no se enciman.
// - El árbol es el de arbolDeEstados(): cada estado cuelga de la primera opción que llega a él.
// - Lo que no está conectado con start va aparte, a la derecha, tras un hueco.

const ANCHO_COLUMNA = 420;       // caja (~280 px) + hueco para que se vean las líneas
const SEPARACION = 30;
const MARGEN = 40;
const POR_FILA = 4;              // cuadrícula de los estados sin conexión
const HUECO_COLUMNAS = 2;        // separación entre el mapa y los estados sin conexión

/** Altura aproximada de una caja si no se pudo medir en la página. */
function altoEstimado(estado) {
    return 110 + 22 * salidas(estado).length;
}

/**
 * @param flujo   el FLUJO
 * @param alturas { nombre: alto en px } medido en la página (opcional)
 * @param puntos  { nombre: { entrada: y, salidas: [y, …] } } altura de las bolitas dentro de la caja, medida en la
 *                página (opcional). Sin medir, un hijo único queda a la misma altura que su padre.
 * @returns layout { nombre: { x, y } } para todos los estados
 */
export function ordenarArbol(flujo, alturas = {}, puntos = {}) {
    const alto = (nombre) => (alturas[nombre] ?? altoEstimado(flujo[nombre])) + SEPARACION;
    const { hijos, raices } = arbolDeEstados(flujo);
    const layout = {};
    let xMaxima = MARGEN;

    const poner = (nombre, x, y) => {
        layout[nombre] = { x: Math.round(x), y: Math.round(y) };
        xMaxima = Math.max(xMaxima, x + ANCHO_COLUMNA);
    };

    /** Baja `nombre` y toda su rama dy px. */
    function bajar(nombre, dy) {
        layout[nombre].y += dy;
        for (const hijo of hijos.get(nombre)) bajar(hijo, dy);
    }

    /** Cuánto más abajo que el padre va el hijo para que su bolita de entrada quede frente a la salida del padre. */
    function desfase(padre, hijo) {
        const i = salidas(flujo[padre]).findIndex((s) => s.destino === hijo);
        const salida = puntos[padre]?.salidas?.[i];
        const entrada = puntos[hijo]?.entrada;
        return salida == null || entrada == null ? 0 : salida - entrada;
    }

    /**
     * Coloca `nombre` en x y su rama desde y0 hacia abajo: los hijos apilados en la columna siguiente
     * (cada uno con su propia rama) y `nombre` centrado frente a ellos. Devuelve el alto que ocupa la rama.
     */
    function rama(nombre, x, y0) {
        const deEste = hijos.get(nombre);
        let y = y0;
        for (const hijo of deEste) y += rama(hijo, x + ANCHO_COLUMNA, y);

        if (deEste.length === 1) {
            // un solo hijo: la caja se pone donde su salida queda frente a la entrada del hijo; si eso la saca por
            // arriba de su rama, se baja la rama del hijo
            const [hijo] = deEste;
            const arriba = layout[hijo].y - desfase(nombre, hijo);
            if (arriba < y0) {
                bajar(hijo, y0 - arriba);
                y += y0 - arriba;
            }
            poner(nombre, x, Math.max(arriba, y0));
            return Math.max(y - y0, layout[nombre].y - y0 + alto(nombre));
        }

        // varios hijos: centrada entre el primero y el último, sin salirse de su rama
        const total = Math.max(y - y0, alto(nombre));
        const centro = deEste.length ? (layout[deEste[0]].y + layout[deEste.at(-1)].y) / 2 : y0;
        poner(nombre, x, Math.min(Math.max(centro, y0), y0 + total - alto(nombre)));
        return total;
    }

    // 1. El mapa de start (todo lo conectado), a la izquierda.
    if ('start' in flujo) rama('start', MARGEN, MARGEN);

    // 2. Lo que no está conectado con start: aparte, a la derecha, tras un hueco. Primero los que tienen
    //    opciones (con el mismo formato); los sueltos, en cuadrícula debajo de ellos.
    const x0 = 'start' in flujo ? xMaxima + HUECO_COLUMNAS * ANCHO_COLUMNA : MARGEN;
    let y = MARGEN;
    const sueltas = [];
    for (const raiz of raices.filter((r) => r !== 'start')) {
        if (hijos.get(raiz).length === 0) {
            sueltas.push(raiz);
            continue;
        }
        y += rama(raiz, x0, y) + SEPARACION * 2;
    }
    for (let i = 0; i < sueltas.length; i += POR_FILA) {
        const linea = sueltas.slice(i, i + POR_FILA);
        linea.forEach((nombre, j) => poner(nombre, x0 + j * ANCHO_COLUMNA, y));
        y += Math.max(...linea.map(alto));
    }

    return layout;
}
