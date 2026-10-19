// Simulador de la conversación: imita lo que el motor del proyecto existente (WhatsAppController) responde a cada
// mensaje, usando solo el FLUJO. Las partes que en el motor dependen de la base de datos (lista de áreas, asesores,
// encuesta de salida) se simulan con textos de ejemplo y se marcan con una nota.
//
// Uso:  let r = iniciar(flujo);                     → { estado, mensajes }
//       r = responder(flujo, r.estado, '1');         → { estado, mensajes }
// Cada mensaje: { texto, nota? }. Un estado especial interno: 'calificacion_servicio' (encuesta de salida).

/** Áreas de ejemplo para {{departamentos}}: en el motor salen de la base de datos (las que tienen asesores). */
export const AREAS_EJEMPLO = ['Área de ejemplo 1', 'Área de ejemplo 2', 'Área de ejemplo 3'];
const LISTA_AREAS = AREAS_EJEMPLO.map((area, i) => `${i + 1}. ${area}`).join('\n');
const NOTA_AREAS = 'Lista de ejemplo: la real la arma el sistema.';

/** Texto por defecto de la encuesta de salida (en el motor puede cambiarse en la base de datos). */
export const ENCUESTA_SALIDA = 'Por favor, califica tu satisfacción con la atención recibida del 1 al 10.';

const COMANDOS_SALIDA = ['salir', 'exit', 'fin', 'terminar', 'bye'];
const FINALES = ['end', 'encuesta_fin', 'finalizado'];

/** Como normalizarComando / MenuMatcher::normalize: minúsculas, sin espacios a los lados, sin tildes ni ñ. */
export function normalizar(texto) {
    return String(texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const conAreas = (texto) => String(texto ?? '').replaceAll('{{departamentos}}', LISTA_AREAS);
const tieneAreas = (texto) => String(texto ?? '').includes('{{departamentos}}');
const opciones = (estado) => Object.entries(estado?.options ?? {});
const tieneOpciones = (estado) => estado != null && 'options' in estado;

/** Mensaje con la nota de las áreas si lo necesita. */
const mensaje = (texto, original = texto) => (tieneAreas(original) ? { texto, nota: NOTA_AREAS } : { texto });

/** Primer contacto (l.2163): mensaje de start + todas las opciones, también las no numéricas ("salir. …"). */
export function iniciar(flujo) {
    const start = flujo.start;
    if (!start) return { estado: 'start', mensajes: [{ texto: '⚠️ El flujo no tiene start.', nota: 'Sin start, el bot no puede empezar.' }] };

    let texto = `${start.message ?? ''}\n`;
    for (const [clave, opcion] of opciones(start)) texto += `${clave}. ${opcion.text}\n`;
    return { estado: 'start', mensajes: [mensaje(texto, start.message)] };
}

/** MenuMatcher::resolver: clave exacta, texto exacto de la opción o una de sus keywords contenida en el mensaje. */
export function elegirOpcion(estado, texto) {
    const t = normalizar(texto);
    const lista = opciones(estado);
    return lista.find(([clave]) => normalizar(clave) === t)
        ?? lista.find(([, o]) => normalizar(o.text) === t)
        ?? lista.find(([, o]) => (o.keywords ?? []).some((k) => normalizar(k) && t.includes(normalizar(k))))
        ?? null;
}

/** validarOpcionNumerica (l.1428): respuesta a una opción que no existe. */
export function opcionInvalida(estado, texto) {
    const claves = opciones(estado).map(([clave]) => clave);
    const conLetras = claves.some((c) => !/^\d+(\.\d+)?$/.test(c));
    let m;
    if (conLetras) {
        m = `❌ La opción '${String(texto).toUpperCase()}' no está disponible.\n\nPor favor, selecciona una opción válida de las siguientes:\n\n`;
    } else {
        const rango = `${Math.min(...claves)} - ${Math.max(...claves)}`;
        m = /^\s*-?\d+(\.\d+)?\s*$/.test(texto)
            ? `❌ La opción '${texto}' no está disponible *_*.\n\nPor favor, selecciona una opción válida entre: ${rango}\n\n`
            : `❌ Lo siento, no entendí lo que ingresaste.\n\nPor favor, ingresa solo la opción que deseas (entre ${rango}):\n\n`;
    }
    for (const [clave, opcion] of opciones(estado)) m += `🔹 ${clave}. ${opcion.text}\n`;
    m += conLetras ? '\n💡 Escribe la letra de tu elección (mayúscula o minúscula).' : '\n💡 Escribe únicamente el número de tu elección.';
    return m;
}

/** Opciones en formato "1.- texto" (envíos combinados y pasos), sin el último salto de línea. */
const opcionesGuion = (estado) => `\n\n${opciones(estado).map(([c, o]) => `${c}.- ${o.text}`).join('\n')}`;

/** Salida por comando o por una opción que lleva a end (l.451, l.4947): encuesta de salida. */
const salir = () => ({
    estado: 'calificacion_servicio',
    mensajes: [{ texto: ENCUESTA_SALIDA, nota: 'Encuesta del sistema (no es parte del flujo).' }],
});

/**
 * Al llegar a `destino` eligiendo una opción, ¿el motor lo envía en el mismo mensaje que el estado siguiente?
 * (l.5051-5074) Sí cuando `destino` es un paso (sin opciones, con next_state) y ni él ni el siguiente piden datos
 * ({{departamentos}} o mas_informacion). Devuelve el nombre del estado siguiente, o null si no se combina.
 */
export function combinaCon(flujo, destino) {
    const paso = flujo[destino];
    if (!paso || tieneOpciones(paso) || paso.next_state == null) return null;
    if (tieneAreas(paso.message) || destino === 'mas_informacion') return null;
    const final = flujo[paso.next_state];
    return final && !tieneAreas(final.message) ? paso.next_state : null;
}

/** Entra al estado `destino` tras elegir una opción (l.5051-5118): combina con el siguiente si es un paso informativo. */
function entrar(flujo, destino, desde) {
    // Opción sin conectar o que va a un paso borrado: el simulador lo dice y se queda donde estaba (QA H7/H14).
    if (destino == null) {
        return { estado: desde, mensajes: [{ texto: '⚠️ (Esta opción aún no lleva a ningún paso.)', nota: 'Conéctala en el editor.' }] };
    }
    if (destino === 'end') return salir();
    const siguiente = flujo[destino];
    if (!siguiente) {
        return { estado: desde, mensajes: [{ texto: '⚠️ (Esta opción lleva a un paso que ya no existe.)', nota: `El paso «${destino}» ya no existe: reconéctala.` }] };
    }

    let texto = conAreas(siguiente.message);
    const combinado = combinaCon(flujo, destino);

    // combinar: el siguiente es un paso informativo → un solo mensaje con el estado que le sigue
    if (combinado) {
        const final = flujo[combinado];
        texto += `\n\n${final.message ?? ''}`;
        if (tieneOpciones(final)) texto += opcionesGuion(final);
        return { estado: combinado, mensajes: [{ texto }] };
    }

    if (tieneOpciones(siguiente)) {
        texto += '\n';
        for (const [clave, opcion] of opciones(siguiente)) texto += `${clave}. ${opcion.text}\n`;
    }
    return { estado: destino, mensajes: [mensaje(texto, siguiente.message)] };
}

/**
 * Respuesta del bot cuando la persona escribe `texto` estando en `estadoActual`.
 * @returns { estado, mensajes: [{ texto, nota? }] }
 */
export function responder(flujo, estadoActual, texto) {
    const t = normalizar(texto);
    const estado = flujo[estadoActual];

    // Después de terminar, cualquier mensaje vuelve a empezar (l.2506).
    if (FINALES.includes(estadoActual)) return iniciar(flujo);

    // Encuesta de salida: cualquier respuesta cierra (l.2425).
    if (estadoActual === 'calificacion_servicio') {
        const cierre = ['Muchas gracias por su calificación.', flujo.encuesta_fin?.message, flujo.end?.message].filter(Boolean).join('\n\n');
        return { estado: 'finalizado', mensajes: [{ texto: cierre }] };
    }

    // Pedir que elija de la lista (*_pedir_corte, derivar_expedientes): número de área → *_confirmar (l.2658-3395).
    if (/_pedir_corte$/.test(estadoActual) || estadoActual === 'derivar_expedientes') {
        if (t === 'menu') return { estado: 'start', mensajes: [{ texto: mensajeConOpciones(flujo.start) }] };
        if (t === 'salir' || t === 'exit') return salir();
        const n = Number(t);
        if (Number.isInteger(n) && n >= 1 && n <= AREAS_EJEMPLO.length) {
            const confirmar = estadoActual === 'derivar_expedientes' ? 'derivar_expedientes_cofirmar' : estadoActual.replace(/_pedir_corte$/, '_confirmar');
            return {
                estado: confirmar,
                mensajes: [{ texto: `Usted ingresó: ${AREAS_EJEMPLO[n - 1]}\n¿Es correcto el valor mostrado?\n\n1. Sí\n2. No`, nota: NOTA_AREAS }],
            };
        }
        return { estado: estadoActual, mensajes: [{ texto: `❌ Opción inválida. Por favor ingrese un número válido entre 1 y ${AREAS_EJEMPLO.length}. También puedes escribir *menu* o *salir*.` }] };
    }

    // Comandos globales (l.3505): menu y salir.
    if (t === 'menu' && flujo.start) {
        return { estado: 'start', mensajes: [{ texto: `${flujo.start.message ?? ''}${tieneOpciones(flujo.start) ? opcionesGuion(flujo.start) : ''}` }] };
    }
    if (COMANDOS_SALIDA.includes(t)) return salir();

    if (!estado) return { estado: estadoActual, mensajes: [] };

    // Datos de la persona → espera de un asesor (l.5442, depende de la base de datos).
    if (estadoActual === 'mas_informacion') {
        const espera = flujo.esperando_agente ? 'esperando_agente' : estadoActual;
        return {
            estado: espera,
            mensajes: [{ texto: `${flujo[espera]?.message ?? ''}.`, nota: 'Aquí se guardan los datos para un asesor.' }],
        };
    }

    // Esperando a un asesor (l.2348): repite el aviso.
    if (/^esperando_agente/.test(estadoActual)) {
        return { estado: estadoActual, mensajes: [{ texto: `${estado.message ?? ''}.`, nota: 'Aquí sigue un asesor.' }] };
    }

    // Menú: elegir una opción.
    if (tieneOpciones(estado)) {
        const elegida = elegirOpcion(estado, texto);
        if (!elegida) return { estado: estadoActual, mensajes: [{ texto: opcionInvalida(estado, texto) }] };
        return entrar(flujo, elegida[1].next_state, estadoActual);
    }

    // Paso: lo que escriba la persona se ignora y se pasa al siguiente (l.6146).
    if (estado.next_state != null) {
        const siguiente = flujo[estado.next_state];
        if (!siguiente) return { estado: estadoActual, mensajes: [] };
        const textoSiguiente = `${conAreas(siguiente.message)}${tieneOpciones(siguiente) ? opcionesGuion(siguiente) : ''}`;
        return { estado: estado.next_state, mensajes: [mensaje(textoSiguiente, siguiente.message)] };
    }

    // Estado final sin salida: el motor no responde.
    return { estado: estadoActual, mensajes: [] };
}

/** renderEstado (l.1664): mensaje + solo las opciones numéricas como "\n1. texto". */
function mensajeConOpciones(estado) {
    let texto = conAreas(estado?.message);
    for (const [clave, opcion] of opciones(estado)) {
        if (/^\d+$/.test(clave)) texto += `\n${clave}. ${opcion.text}`;
    }
    return texto;
}
