import { salidas } from './flujo-a-drawflow.js';
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

/**
 * Problemas del flujo: [{ gravedad: 'error' | 'aviso', nombre, texto }] (texto sin el nombre del paso delante).
 * `titulo(nombre)` da el nombre legible de otro paso para citarlo.
 */
export function revisarFlujo(flujo, titulo = (n) => n) {
    const problemas = [];
    const agregar = (gravedad, nombre, texto) => problemas.push({ gravedad, nombre, texto });

    for (const [nombre, estado] of Object.entries(flujo)) {
        const mensaje = String(estado.message ?? '');
        const tieneOpciones = 'options' in estado;

        // H3: el motor enviaría un mensaje vacío.
        if (!mensaje.trim()) agregar('error', nombre, 'no tiene mensaje: el bot enviaría un mensaje vacío.');

        // H15: límite de WhatsApp.
        if (mensaje.length > MAXIMO_CARACTERES) {
            agregar('error', nombre, `el mensaje tiene ${mensaje.length} caracteres; WhatsApp admite hasta ${MAXIMO_CARACTERES}.`);
        }

        // H13: sin opciones ni siguiente, el motor descarta todo lo que escriba la persona (l.~6240).
        if (!tieneOpciones && estado.next_state == null && !SIN_SALIDA_PERMITIDA(nombre)) {
            agregar('error', nombre, 'después de este mensaje el bot ya no responde. Conéctalo a la Despedida o a otro paso '
                + '(en el editor: «Continuar a otro estado»).');
        }

        // H1: un paso se envía junto con el siguiente; si pide que la persona escriba algo y el siguiente no espera
        // texto libre, la respuesta se pierde (el siguiente cierra) o se toma como una opción (el siguiente es un menú).
        const unidoCon = !tieneOpciones && estado.next_state != null ? combinaCon(flujo, nombre) : null;
        if (unidoCon && !ESPERA_TEXTO(flujo, unidoCon)) {
            const esMenu = 'options' in (flujo[unidoCon] ?? {});
            const pregunta = /\?\s*$/.test(mensaje.trim());
            if (pareceQuePideDatos(mensaje) || (pregunta && !esMenu)) {
                agregar('aviso', nombre, esMenu
                    ? `pide que la persona escriba algo, pero se envía junto con el menú «${titulo(unidoCon)}»: lo que escriba se tomará como una opción. Si necesitas que elija, ofrece opciones.`
                    : `pide que la persona escriba algo, pero se envía junto con «${titulo(unidoCon)}» y la conversación termina: la respuesta se pierde. Ofrece opciones (un menú) en su lugar.`);
            }
        }

        for (const { clave, texto, destino } of salidas(estado)) {
            if (clave === null) continue;
            // H10: la persona vería solo «1.».
            if (!String(texto ?? '').trim()) agregar('aviso', nombre, `la opción ${clave} no tiene texto: la persona vería solo «${clave}.».`);
            // H12: el motor atiende antes el comando (salvo que la opción lleve al mismo sitio).
            for (const palabra of new Set([normalizar(clave), normalizar(texto)])) {
                const va = COMANDOS_DEL_MOTOR[palabra];
                if (va && destino !== va) {
                    agregar('aviso', nombre, `la opción «${palabra}» es un comando del bot (${va === 'start' ? 'vuelve al inicio' : 'termina el chat'}): `
                        + 'al escribirla, la persona no llega a esta opción. Usa un número o un texto distinto.');
                }
            }
        }
    }
    return problemas;
}
