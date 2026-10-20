// ¿La línea de una conexión pasaría por detrás de otras cajas? Si sí, se muestra como etiqueta (⇢) para no
// saturar el lienzo; si se ve limpia, se mantiene la línea aunque las cajas estén lejos. Módulo puro (sin DOM).

/** Curvatura que usa Drawflow para las líneas (this.curvature = .5 en drawflow.min.js). */
const CURVATURA = 0.5;

/**
 * Puntos a lo largo de la curva que dibuja Drawflow entre la bolita de salida p1 y la de entrada p2
 * (createCurvature: "M x1 y1 C x1+h y1, x2-h y2, x2 y2" con h = |x2-x1| · curvatura).
 */
export function puntosCurva(p1, p2, pasos = 24) {
    const h = Math.abs(p2.x - p1.x) * CURVATURA;
    const c1 = { x: p1.x + h, y: p1.y };
    const c2 = { x: p2.x - h, y: p2.y };
    const puntos = [];
    for (let i = 1; i < pasos; i++) {
        const t = i / pasos;
        const u = 1 - t;
        puntos.push({
            x: u ** 3 * p1.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * p2.x,
            y: u ** 3 * p1.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * p2.y,
        });
    }
    return puntos;
}

/** ¿Algún punto de la curva cae dentro de una caja (con un pequeño margen), sin contar las excluidas? */
export function cruzaCajas(p1, p2, cajas, excluidas = [], margen = 6) {
    const otras = Object.entries(cajas).filter(([nombre]) => !excluidas.includes(nombre)).map(([, c]) => c);
    return puntosCurva(p1, p2).some(({ x, y }) => otras.some((c) =>
        x > c.x - margen && x < c.x + c.ancho + margen && y > c.y - margen && y < c.y + c.alto + margen));
}

/**
 * conexiones: [{ clave, origen, destino, p1, p2 }]; cajas: { nombre: { x, y, ancho, alto } }.
 * Devuelve el Set de claves cuyas líneas pasarían por detrás de alguna otra caja.
 */
export function conexionesQueCruzan(conexiones, cajas) {
    return new Set(conexiones
        .filter(({ origen, destino, p1, p2 }) => cruzaCajas(p1, p2, cajas, [origen, destino]))
        .map(({ clave }) => clave));
}

/**
 * Baja lo justo las cajas que se pisarían (p. ej. al desplegar una en la vista comprimida o al extender): de arriba
 * abajo, si una caja se cruza con otra ya colocada, pasa a quedar `separacion` px debajo de ella (en cadena: la que
 * baja puede empujar a las siguientes). Solo hacia abajo; las que no se pisan no se mueven. No se guarda: es la vista.
 * cajas: { nombre: { x, y, ancho, alto } } → { nombre: { x, y } }
 */
export function separarCajas(cajas, separacion = 30) {
    const orden = Object.keys(cajas).sort((a, b) => cajas[a].y - cajas[b].y || cajas[a].x - cajas[b].x);
    const puestas = [];
    const resultado = {};
    for (const nombre of orden) {
        const { x, ancho, alto } = cajas[nombre];
        let y = cajas[nombre].y;
        let pisa = true;
        while (pisa) {
            pisa = false;
            for (const p of puestas) {
                if (x < p.x + p.ancho && x + ancho > p.x && y < p.y + p.alto && y + alto > p.y) {
                    y = p.y + p.alto + separacion;
                    pisa = true;
                }
            }
        }
        puestas.push({ x, y, ancho, alto });
        resultado[nombre] = { x, y };
    }
    return resultado;
}
