import { distancias, salidas } from './flujo-a-drawflow.js';
import { combinaCon, normalizar } from './simulador.js';
import { MAXIMO_CARACTERES } from './whatsapp.js';

// Revisión del flujo: problemas que rompen o confunden el recorrido del bot (hallazgos de QA, docs/QA-flujos.md).
// Solo avisa: no bloquea el guardado (se puede guardar un flujo a medias). Lo usan los avisos ⚠ del panel 📄 y el
// aviso al guardar. Las reglas del motor citadas están verificadas en WhatsAppController (ver simulador.js).

/** Palabras que el motor atiende como comando antes que las opciones (l.3505, l.1655) y a dónde llevan. */
export const COMANDOS_DEL_MOTOR = { menu: 'start', salir: 'end', exit: 'end', fin: 'end', terminar: 'end', bye: 'end' };

/** Estados sin salida en los que el motor sí sigue respondiendo: reinician (end, encuesta_fin) o esperan asesor. */
const SIN_SALIDA_PERMITIDA = (nombre) => nombre === 'end' || nombre === 'encuesta_fin' || nombre.startsWith('esperando_agente');

/** ¿El mensaje pide que la persona escriba algo? («escríbeme…», «indícanos…», «envíanos…», «dinos…»). */
export function pareceQuePideDatos(mensaje) {
    return /\b(escribe|escribenos|escribeme|escriba|escribir|indica|indicanos|indique|dinos|cuentanos|digita|digite|envianos|enviame|envie)\b/
        .test(normalizar(mensaje));
}

/** Estados que sí esperan un texto libre de la persona (datos, elegir de la lista de áreas). */
const ESPERA_TEXTO = (flujo, nombre) => nombre === 'mas_informacion' || nombre === 'derivar_expedientes'
    || nombre.endsWith('_pedir_corte') || String(flujo[nombre]?.message ?? '').includes('{{departamentos}}');

/** Estados donde la conversación termina bien: Despedida, cierre de encuesta o espera de un asesor. */
export const esCierre = (nombre) => nombre === 'end' || nombre === 'encuesta_fin' || nombre.startsWith('esperando_agente');

/**
 * Recorrido: pasos alcanzables desde start desde los que NO hay ningún camino hasta un cierre (trampas: la persona
 * da vueltas o se queda sin respuesta). Se marca hacia atrás desde los cierres: un paso llega si alguna de sus
 * salidas va a uno que llega. Las vueltas («Volver al inicio») están bien mientras exista alguna salida.
 */
export function pasosSinCierre(flujo) {
    if (!('start' in flujo)) return new Set();
    const llega = new Set(Object.keys(flujo).filter(esCierre));
    for (let cambio = true; cambio;) {
        cambio = false;
        for (const [nombre, estado] of Object.entries(flujo)) {
            if (!llega.has(nombre) && salidas(estado).some((s) => llega.has(s.destino))) {
                llega.add(nombre);
                cambio = true;
            }
        }
    }
    return new Set([...distancias(flujo).keys()].filter((n) => !llega.has(n)));
}

/**
 * Grupos de pasos que se alcanzan entre sí (componentes fuertemente conexas, algoritmo de Tarjan).
 * Devuelve Map paso → Set del grupo (el mismo Set para todos los del grupo).
 */
function gruposFuertes(pasos, destinos) {
    const indice = new Map();
    const bajo = new Map();
    const pila = [];
    const enPila = new Set();
    const grupoDe = new Map();
    let contador = 0;
    const visitar = (n) => {
        indice.set(n, contador);
        bajo.set(n, contador++);
        pila.push(n);
        enPila.add(n);
        for (const d of destinos(n)) {
            if (!indice.has(d)) {
                visitar(d);
                bajo.set(n, Math.min(bajo.get(n), bajo.get(d)));
            } else if (enPila.has(d)) {
                bajo.set(n, Math.min(bajo.get(n), indice.get(d)));
            }
        }
        if (bajo.get(n) === indice.get(n)) {
            const grupo = new Set();
            let m;
            do {
                m = pila.pop();
                enPila.delete(m);
                grupo.add(m);
                grupoDe.set(m, grupo);
            } while (m !== n);
        }
    };
    pasos.forEach((n) => { if (!indice.has(n)) visitar(n); });
    return grupoDe;
}

/** Pasos atrapados (fuera del grupo) que desembocan en el grupo: los que el problema arrastra. */
function pasosQueLlegan(grupo, trampas, flujo) {
    const llegan = new Set();
    const pendientes = [...grupo];
    while (pendientes.length) {
        const actual = pendientes.pop();
        for (const n of trampas) {
            if (grupo.has(n) || llegan.has(n)) continue;
            if (salidas(flujo[n]).some((s) => s.destino === actual)) {
                llegan.add(n);
                pendientes.push(n);
            }
        }
    }
    return llegan;
}

/**
 * Problemas del flujo: [{ gravedad: 'error' | 'aviso', codigo, nombre, texto }] (texto sin el nombre del paso delante).
 * `titulo(nombre)` da el nombre legible de otro paso para citarlo.
 */
export function revisarFlujo(flujo, titulo = (n) => n) {
    const problemas = [];
    const agregar = (gravedad, nombre, texto, codigo = '') => problemas.push({ gravedad, codigo, nombre, texto });

    for (const [nombre, estado] of Object.entries(flujo)) {
        const mensaje = String(estado.message ?? '');
        const tieneOpciones = 'options' in estado;

        // H3: el motor enviaría un mensaje vacío.
        if (!mensaje.trim()) agregar('error', nombre, 'no tiene mensaje.');

        // H15: límite de WhatsApp.
        if (mensaje.length > MAXIMO_CARACTERES) {
            agregar('error', nombre, `tiene ${mensaje.length} caracteres (máximo ${MAXIMO_CARACTERES}).`);
        }

        // H13: sin opciones ni siguiente, el motor descarta todo lo que escriba la persona (l.~6240).
        if (!tieneOpciones && estado.next_state == null && !SIN_SALIDA_PERMITIDA(nombre)) {
            agregar('error', nombre, 'aquí el bot deja de responder: conéctalo a la Despedida.', 'mudo');
        }

        // H1: un paso se envía junto con el siguiente; si pide que la persona escriba algo y el siguiente no espera
        // texto libre, la respuesta se pierde (el siguiente cierra) o se toma como una opción (el siguiente es un menú).
        const unidoCon = !tieneOpciones && estado.next_state != null ? combinaCon(flujo, nombre) : null;
        if (unidoCon && !ESPERA_TEXTO(flujo, unidoCon)) {
            const esMenu = 'options' in (flujo[unidoCon] ?? {});
            const pregunta = /\?\s*$/.test(mensaje.trim());
            if (pareceQuePideDatos(mensaje) || (pregunta && !esMenu)) {
                agregar('aviso', nombre, esMenu
                    ? `pide que escriban algo, pero llega junto al menú «${titulo(unidoCon)}»: mejor usa opciones.`
                    : 'pide que escriban algo, pero el chat termina enseguida: mejor usa opciones.');
            }
        }

        for (const { clave, texto, destino } of salidas(estado)) {
            if (clave === null) continue;
            // H10: la persona vería solo «1.».
            if (!String(texto ?? '').trim()) agregar('aviso', nombre, `la opción ${clave} no tiene texto.`);
            // H12: el motor atiende antes el comando (salvo que la opción lleve al mismo sitio).
            for (const palabra of new Set([normalizar(clave), normalizar(texto)])) {
                const va = COMANDOS_DEL_MOTOR[palabra];
                if (va && destino !== va) {
                    agregar('aviso', nombre, `«${palabra}» es un comando del bot (${va === 'start' ? 'vuelve al inicio' : 'termina el chat'}): esa opción nunca se elegirá.`);
                }
            }
        }
    }

    // Recorrido: se avisa en el ORIGEN del problema, no en cada paso afectado. Los pasos atrapados forman grupos
    // (pasos que se alcanzan entre sí, p. ej. un menú y su «Volver»); los grupos que no llevan a otro grupo atrapado
    // son el origen (un final mudo, un menú con las salidas sin conectar, vueltas sin salida); los demás solo
    // desembocan en ellos. Un final mudo ya está avisado arriba: se le añade a cuántos pasos arrastra.
    const trampas = pasosSinCierre(flujo);
    if (trampas.size) {
        const orden = new Map([...distancias(flujo).keys()].map((n, i) => [n, i])); // orden de lectura (desde start)
        const destinos = (n) => salidas(flujo[n]).map((s) => s.destino).filter((d) => trampas.has(d));
        const grupoDe = gruposFuertes([...trampas], destinos);
        const origenes = [...new Set(grupoDe.values())].filter((g) => [...g].every((n) => destinos(n).every((d) => grupoDe.get(d) === g)));

        for (const grupo of origenes) {
            const afectados = pasosQueLlegan(grupo, trampas, flujo).size;
            const primero = [...grupo].sort((a, b) => orden.get(a) - orden.get(b))[0];
            const yAdemas = afectados === 1 ? 'afecta a 1 paso más' : `afecta a ${afectados} pasos más`;
            const mudo = grupo.size === 1 && problemas.find((p) => p.codigo === 'mudo' && p.nombre === primero);
            if (mudo) {
                if (afectados) mudo.texto += ` (${yAdemas})`;
                continue;
            }
            const consejo = primero === 'end_or_menu'
                ? 'conecta sus opciones al inicio o a la Despedida.'
                : 'conéctalo a «¿Algo más?» o a la Despedida.';
            agregar('error', primero, `desde aquí no se puede terminar${afectados ? ` (${yAdemas})` : ''}: ${consejo}`, 'sin-cierre');
        }
        // Resumen: si ni desde la Bienvenida se puede terminar, se dice (además de los orígenes de arriba).
        if (trampas.has('start') && !problemas.some((p) => p.codigo === 'sin-cierre' && p.nombre === 'start')) {
            agregar('error', 'start', 'ningún camino termina el chat: revisa los avisos de abajo.', 'sin-cierre');
        }
    }
    return problemas;
}

/**
 * Semáforo del diseño a partir de los avisos (los del panel 📄: revisión + opciones sin conectar + pasos sueltos):
 * ✅ sin avisos · ⚠ solo avisos (no rompen la conversación) · ⛔ algún error (caminos sin salida, opciones sin
 * conectar, mensajes vacíos…).
 */
export function estadoDelDiseno(avisos) {
    const errores = avisos.filter((a) => a.gravedad === 'error').length;
    if (!avisos.length) return { nivel: 'ok', icono: '✅', texto: 'Bien cerrado', detalle: 'Todo bien: cada camino termina.' };
    if (errores) {
        return { nivel: 'falla', icono: '⛔', texto: errores === 1 ? '1 falla' : `${errores} fallas`,
            detalle: `${errores === 1 ? '1 cosa hace' : `${errores} cosas hacen`} fallar el chat${avisos.length > errores ? ` y ${avisos.length - errores} más por revisar` : ''}.` };
    }
    return { nivel: 'revisar', icono: '⚠️', texto: `${avisos.length} por revisar`, detalle: 'Funciona, pero hay detalles por revisar.' };
}
