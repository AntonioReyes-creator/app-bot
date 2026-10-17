import { NOMBRES, esEstadoSistema } from './estados-sistema.js';

// Operaciones sobre el modelo del editor: { flujo, layout }.
// El modelo es la fuente de verdad; el lienzo se redibuja a partir de él (flujo-a-drawflow.js).

/** Formato de los nombres nuevos: snake_case (los nombres de flujos ya existentes no se tocan). */
export const PATRON_NOMBRE = /^[a-z][a-z0-9_]*$/;

/** Contenido con el que nace una caja nueva de cada tipo. */
export function plantilla(tipo) {
    switch (tipo) {
        case 'menu':
            return { message: 'Elige una opción:', options: { 1: { text: 'Opción 1', next_state: null } } };
        case 'paso':
            return { message: 'Escribe aquí el mensaje.', next_state: null };
        default:
            return { message: 'Escribe aquí el mensaje final.' };
    }
}

/**
 * Estados del sistema: misma estructura que en el flujo del Poder Judicial, con textos genéricos.
 * Los que no aparecen aquí nacen como caja final.
 */
const PLANTILLAS_SISTEMA = {
    start: () => ({ message: '¡Hola! Bienvenido.', next_state: null }),
    end: () => ({ message: 'Gracias por escribirnos.' }),
    end_or_menu: () => ({
        message: '¿Tienes alguna otra consulta?',
        options: {
            1: { text: 'Sí, volver al menú', next_state: 'start' },
            2: { text: 'No, gracias', next_state: 'end' },
        },
    }),
    esperando_agente: () => ({ message: 'En breves momentos, un asesor atenderá tu caso.' }),
    mas_informacion: () => ({ message: 'Un asesor te atenderá en breve.', next_state: 'esperando_agente' }),
    encuesta_inicio: () => ({
        message: '¿Estás satisfecho con la atención?',
        options: { 1: { text: 'Sí', next_state: null }, 2: { text: 'No', next_state: null } },
    }),
    encuesta_fin: () => ({ message: '¡Hasta pronto!', next_state: 'end' }),
};

export function plantillaSistema(nombre) {
    return PLANTILLAS_SISTEMA[nombre]?.() ?? plantilla('final');
}

/** Estados del sistema de nombre fijo que todavía no están en el flujo. */
export function sistemaDisponibles(flujo) {
    return NOMBRES.filter((nombre) => !(nombre in flujo));
}

/** Mensaje de error, o null si el nombre se puede usar. */
export function validarNombre(flujo, nombre) {
    if (!nombre) return 'Escribe un nombre.';
    if (!PATRON_NOMBRE.test(nombre)) {
        return 'Usa solo minúsculas, números y guion bajo, empezando por una letra (ej. menu_certificados).';
    }
    if (nombre in flujo) return `Ya existe un estado llamado «${nombre}».`;
    return null;
}

/** "menu" → "menu_1"; si existe, "menu_2"… */
export function sugerirNombre(flujo, base) {
    let n = 1;
    while (`${base}_${n}` in flujo) n++;
    return `${base}_${n}`;
}

export function agregarEstado(modelo, nombre, estado, posicion) {
    modelo.flujo[nombre] = estado;
    modelo.layout[nombre] = posicionLibre(modelo.layout, posicion);
}

// Tamaño aproximado de una caja (280 px de ancho en app.css) con un pequeño margen.
const ANCHO_CAJA = 300;
const ALTO_CAJA = 170;

/** Si la caja nueva se solaparía con otra, baja una fila (180 px) hasta encontrar hueco. */
function posicionLibre(layout, { x, y }) {
    const punto = { x: Math.round(x), y: Math.round(y) };
    const solapa = (p) => Math.abs(p.x - punto.x) < ANCHO_CAJA && Math.abs(p.y - punto.y) < ALTO_CAJA;

    while (Object.values(layout).some(solapa)) {
        punto.y += 180;
    }

    return punto;
}

export function moverEstado(modelo, nombre, x, y) {
    modelo.layout[nombre] = { x: Math.round(x), y: Math.round(y) };
}

/**
 * Opciones del estado como filas editables. Los campos que el editor no maneja (keywords,
 * departamento…) van en `extra` y se devuelven intactos al aplicar.
 */
export function opcionesDe(estado) {
    return Object.entries(estado.options ?? {}).map(([clave, { text = '', next_state = null, ...extra }]) => ({
        clave,
        text,
        next_state,
        extra,
    }));
}

/**
 * Aplica lo editado en el modal. cambios = { nombre, message, tipo, next_state, opciones: [{clave, text, next_state, extra}] }.
 * Valida todo antes de modificar nada. Devuelve un mensaje de error o null si se aplicó.
 *
 * Reglas del bot (WhatsAppController.php): un estado es final (solo message), paso (message + next_state)
 * o menú (message + options). Si hay options, el bot ignora el next_state del estado, y un "options" vacío
 * cuenta como presente: por eso se quita la clave que no corresponde al tipo.
 */
export function aplicarEdicion(modelo, nombre, cambios) {
    const nuevoNombre = cambios.nombre.trim();

    if (nuevoNombre !== nombre) {
        if (esEstadoSistema(nombre)) return `«${nombre}» es un estado del sistema: su nombre no se puede cambiar.`;
        const error = validarNombre(modelo.flujo, nuevoNombre);
        if (error) return error;
    }

    let opciones = null;
    if (cambios.tipo === 'menu') {
        if (cambios.opciones.length === 0) return 'Un menú necesita al menos una opción.';

        opciones = {};
        for (const { clave, text, next_state, extra } of cambios.opciones) {
            const c = String(clave).trim();
            if (!c) return 'Cada opción necesita un número o clave.';
            if (c in opciones) return `La opción «${c}» está repetida.`;
            opciones[c] = { ...extra, text, next_state: next_state || null };
        }
    }

    // Se parte del estado actual para no perder campos que el editor no conoce.
    const estado = { ...modelo.flujo[nombre], message: cambios.message };
    delete estado.options;
    delete estado.next_state;
    if (cambios.tipo === 'paso') estado.next_state = cambios.next_state || null;
    if (cambios.tipo === 'menu') estado.options = opciones;

    modelo.flujo[nombre] = estado;
    if (nuevoNombre !== nombre) renombrarEstado(modelo, nombre, nuevoNombre);

    return null;
}

/** Cambia el nombre conservando la posición de la clave y actualiza todas las flechas que llegaban. */
export function renombrarEstado(modelo, viejo, nuevo) {
    const cambiar = (destino) => (destino === viejo ? nuevo : destino);

    modelo.flujo = Object.fromEntries(Object.entries(modelo.flujo).map(([nombre, estado]) => {
        const copia = { ...estado };
        if ('next_state' in copia) copia.next_state = cambiar(copia.next_state);
        if (copia.options) {
            copia.options = Object.fromEntries(Object.entries(copia.options).map(
                ([clave, opcion]) => [clave, { ...opcion, next_state: cambiar(opcion.next_state ?? null) }],
            ));
        }
        return [nombre === viejo ? nuevo : nombre, copia];
    }));

    modelo.layout[nuevo] = modelo.layout[viejo];
    delete modelo.layout[viejo];
}

/** Siguiente número libre para una opción nueva de menú. */
export function siguienteClave(claves) {
    const numeros = claves.filter((c) => /^\d+$/.test(c)).map(Number);
    return String(numeros.length ? Math.max(...numeros) + 1 : 1);
}

/**
 * Borra el estado. Las flechas que llegaban a él quedan apuntando a un nombre que ya no existe
 * (el lienzo las marca y el validador las informará). start no se puede borrar: devuelve false.
 */
export function eliminarEstado(modelo, nombre) {
    if (nombre === 'start') return false;
    delete modelo.flujo[nombre];
    delete modelo.layout[nombre];
    return true;
}
