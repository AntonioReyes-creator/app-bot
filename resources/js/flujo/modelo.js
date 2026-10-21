import { AVANZADOS, BASICOS, esEstadoSistema, etiquetaSistema } from './estados-sistema.js';
import { salidas } from './flujo-a-drawflow.js';
import { MAXIMO_CARACTERES } from './whatsapp.js';

// Operaciones sobre el modelo del editor: { flujo, layout }.
// El modelo es la fuente de verdad; el lienzo se redibuja a partir de él (flujo-a-drawflow.js).

/** Formato de los nombres nuevos: snake_case (los nombres de flujos ya existentes no se tocan). */
export const PATRON_NOMBRE = /^[a-z][a-z0-9_]*$/;

/**
 * Contenido con el que nace una caja nueva de cada tipo: solo la estructura, con el mensaje vacío.
 * El ejemplo de qué escribir se muestra en gris en el editor (ejemploMensaje) y no se guarda.
 */
export function plantilla(tipo) {
    switch (tipo) {
        case 'menu':
            return { message: '', options: { 1: { text: '', next_state: null } } };
        case 'paso':
            return { message: '', next_state: null };
        default:
            return { message: '' };
    }
}

/** Ejemplo en gris para el cuadro del mensaje (placeholder): orienta sin guardar texto inventado. */
export function ejemploMensaje(nombre, tipo) {
    const ejemplos = {
        start: 'Ej.: ¡Hola! 👋 Soy el asistente virtual de… ¿En qué te puedo ayudar?',
        end: 'Ej.: Gracias por escribirnos. ¡Hasta pronto!',
        esperando_agente: 'Ej.: Te comunicamos con un asesor. Por favor, espera un momento.',
    };
    if (ejemplos[nombre]) return ejemplos[nombre];
    if (tipo === 'menu') return 'Ej.: Elige una opción:';
    if (tipo === 'paso') return 'Ej.: Escribe tu número de documento.';
    return 'Ej.: Listo, registramos tu solicitud.';
}

/** "atencion_al_cliente" → "atención al cliente" no es posible sin diccionario: "atencion al cliente". */
const legible = (parte) => parte.replace(/_/g, ' ');

/**
 * Pasos especiales: vienen ARMADOS (decisión del usuario, QA H6): mensaje con texto general y opciones ya conectadas,
 * listos para funcionar. Los textos son generales (sirven para cualquier bot) y se pueden cambiar en el editor.
 * Cada plantilla nombra a sus destinos; agregarPasoEspecial() crea los que falten (companerosDe).
 */
const PLANTILLAS_SISTEMA = {
    start: () => ({ message: '¡Hola! 👋 Bienvenido. ¿En qué te podemos ayudar?', next_state: 'end' }),
    end: () => ({ message: '¡Gracias por escribirnos! Que tengas un buen día. 👋' }),
    esperando_agente: () => ({ message: 'En un momento una persona de nuestro equipo continuará la conversación. 🙌' }),
    end_or_menu: () => ({
        message: '¿Te puedo ayudar en algo más?',
        options: { 1: { text: 'Sí, volver al inicio', next_state: 'start' }, 2: { text: 'No, gracias', next_state: 'end' } },
    }),
    mas_informacion: () => ({
        message: 'Para continuar, envíanos en un solo mensaje:\n- Tu nombre completo\n- Tu número de documento\n- Tu correo electrónico\n- Tu consulta',
        next_state: 'esperando_agente',
    }),
    seleccionar_departamento: () => ({
        message: 'Elige una opción de la lista:',
        options: { 1: { text: 'Opción de ejemplo (el sistema arma la lista)', next_state: 'mas_informacion' } },
    }),
    encuesta_inicio: () => ({
        message: '¿Quedaste satisfecho con la atención? 🙂',
        options: { 1: { text: 'Sí', next_state: 'encuesta_fin' }, 2: { text: 'No', next_state: 'encuesta_fin' } },
    }),
    encuesta_fin: () => ({ message: '¡Gracias por tu respuesta! 💛', next_state: 'end' }),
    verificacion_numero: () => ({
        message: 'Para continuar tu atención, envíanos en un solo mensaje tu nombre completo y tu consulta.',
        next_state: 'esperando_agente',
    }),
};

/**
 * Plantilla armada de un estado del sistema. Los de patrón siguen la forma del flujo del Poder Judicial:
 * X_pedir_corte (lista) → X_confirmar (Sí → mas_informacion · No → X_pedir_corte); derivar_X → mas_informacion.
 */
export function plantillaSistema(nombre) {
    if (PLANTILLAS_SISTEMA[nombre]) return PLANTILLAS_SISTEMA[nombre]();

    if (nombre.endsWith('_pedir_corte')) {
        const base = nombre.slice(0, -'_pedir_corte'.length);
        // {{departamentos}}: el motor pone aquí la lista de áreas
        return { message: 'Elige una opción de la lista:\n\n{{departamentos}}', next_state: `${base}_confirmar` };
    }
    if (nombre.endsWith('_confirmar')) {
        const base = nombre.slice(0, -'_confirmar'.length);
        return {
            message: '¿Es correcta tu elección?',
            options: { 1: { text: 'Sí', next_state: 'mas_informacion' }, 2: { text: 'No, elegir otra', next_state: `${base}_pedir_corte` } },
        };
    }
    if (nombre.startsWith('derivar_')) {
        const area = legible(nombre.slice('derivar_'.length));
        return { message: `Te comunicaremos con el área de ${area}. Responde este mensaje para continuar.`, next_state: 'mas_informacion' };
    }
    if (nombre.startsWith('esperando_agente_')) {
        const area = legible(nombre.slice('esperando_agente_'.length));
        return { message: `En un momento una persona del área de ${area} continuará la conversación. 🙌` };
    }
    return { message: '' };
}

/** Estados que un paso especial necesita para funcionar (los destinos de su plantilla). */
export function companerosDe(nombre) {
    return salidas(plantillaSistema(nombre)).map((s) => s.destino).filter(Boolean);
}

/**
 * Añade un paso especial ARMADO y, si faltan, los estados que necesita (p. ej. «Encuesta: pregunta» trae su
 * «Encuesta: cierre»; «Escalar a un asesor» trae «Pasar con un asesor»), a la derecha y ya conectados.
 * No toca los que ya existen. Devuelve los nombres creados (el primero es `nombre`).
 */
export function agregarPasoEspecial(modelo, nombre, posicion) {
    const creados = [];
    const pendientes = [{ nombre, posicion }];
    while (pendientes.length) {
        const { nombre: actual, posicion: lugar } = pendientes.shift();
        if (actual in modelo.flujo) continue;
        agregarEstado(modelo, actual, plantillaSistema(actual), lugar);
        creados.push(actual);
        companerosDe(actual).forEach((companero, i) => pendientes.push({
            nombre: companero, posicion: { x: modelo.layout[actual].x + 340, y: modelo.layout[actual].y + i * 180 },
        }));
    }
    return creados;
}

/**
 * Completa la conexión de la pareja X_pedir_corte ↔ X_confirmar cuando se añade la segunda: si la primera
 * quedó "sin conectar" porque su pareja aún no existía, se conecta ahora. No pisa conexiones ya hechas.
 */
export function enlazarPareja(modelo, nombre) {
    const flujo = modelo.flujo;
    const pareja = nombre.endsWith('_confirmar') ? nombre.replace(/_confirmar$/, '_pedir_corte')
        : nombre.endsWith('_pedir_corte') ? nombre.replace(/_pedir_corte$/, '_confirmar') : null;
    if (!pareja || !(pareja in flujo)) return;

    if (pareja.endsWith('_pedir_corte') && flujo[pareja].next_state == null) {
        flujo[pareja].next_state = nombre;
    }
    if (pareja.endsWith('_confirmar') && flujo[pareja].options?.['2'] && flujo[pareja].options['2'].next_state == null) {
        flujo[pareja].options['2'].next_state = nombre;
    }
}

/**
 * Nombre de un estado del sistema por patrón: antes + parte + despues ("derivar_" + "quejas").
 * Devuelve { nombre, error }; error es null si se puede crear.
 */
export function nombrePatron(flujo, { antes, despues }, parte) {
    // Se escribe como se habla («Atención al Cliente») y se convierte solo (atencion_al_cliente), como el nombre
    // visible en el resto del editor (QA H9).
    const limpio = String(parte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/, '');
    const nombre = `${antes}${limpio}${despues}`;
    if (!limpio) return { nombre, error: 'Escribe el nombre del área.' };
    return { nombre, error: validarNombre(flujo, nombre) };
}

/** Estados del sistema de nombre fijo que todavía no están en el flujo. */
export function sistemaDisponibles(flujo, { avanzados = false } = {}) {
    const lista = avanzados ? AVANZADOS : BASICOS.map((b) => b.nombre);
    return lista.filter((nombre) => !(nombre in flujo));
}

/** Mensaje de error, o null si el nombre se puede usar. */
export function validarNombre(flujo, nombre) {
    if (!nombre) return 'Escribe un nombre.';
    if (!PATRON_NOMBRE.test(nombre)) {
        return 'Solo minúsculas, números y _ (ej. menu_pagos).';
    }
    if (nombre in flujo) return `Ya existe un estado llamado «${nombre}».`;
    return null;
}

/**
 * Texto de una opción → nombre de estado en snake_case: "Opción 1" → "opcion_1", "¿Trámites en línea?" →
 * "tramites_en_linea". Si empieza por número se antepone "op_" (un nombre debe empezar por letra).
 * Devuelve "" si no queda nada utilizable.
 */
export function nombreDesdeTexto(texto) {
    const base = String(texto ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes: "ó" → "o"
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40)
        .replace(/_+$/, '');

    if (!base) return '';
    return /^[a-z]/.test(base) ? base : `op_${base}`;
}

/** El nombre tal cual si está libre; si no, con sufijo: "opcion_1" → "opcion_1_2", "opcion_1_3"… */
export function nombreLibre(flujo, base) {
    if (!(base in flujo)) return base;
    let n = 2;
    while (`${base}_${n}` in flujo) n++;
    return `${base}_${n}`;
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
 * Los destinos no se eligen en el modal (se conectan desde las bolitas del lienzo): el editor envía los que ya tenían.
 * Valida todo antes de modificar nada. Devuelve null si se aplicó o, si hay un error, dónde está para
 * marcarlo en el formulario: { campo: 'nombre' | 'opciones' | 'clave', indice (solo 'clave'), mensaje }.
 *
 * Reglas del bot (WhatsAppController.php): un estado es final (solo message), paso (message + next_state)
 * o menú (message + options). Si hay options, el bot ignora el next_state del estado, y un "options" vacío
 * cuenta como presente: por eso se quita la clave que no corresponde al tipo.
 */
export function aplicarEdicion(modelo, nombre, cambios) {
    const nuevoNombre = cambios.nombre.trim();

    if (nuevoNombre !== nombre) {
        if (esEstadoSistema(nombre)) {
            return { campo: 'nombre', mensaje: `«${nombre}» es un paso especial: su nombre no cambia.` };
        }
        const error = validarNombre(modelo.flujo, nuevoNombre);
        if (error) return { campo: 'nombre', mensaje: error };
    }

    // QA H15: WhatsApp no envía más de MAXIMO_CARACTERES.
    if (String(cambios.message ?? '').length > MAXIMO_CARACTERES) {
        return { campo: 'mensaje', mensaje: `Tiene ${cambios.message.length} caracteres; el máximo es ${MAXIMO_CARACTERES}.` };
    }

    let opciones = null;
    if (cambios.tipo === 'menu') {
        if (cambios.opciones.length === 0) return { campo: 'opciones', mensaje: 'Un menú necesita al menos una opción.' };

        opciones = {};
        for (const [indice, { clave, text, next_state, extra }] of cambios.opciones.entries()) {
            const c = String(clave).trim();
            if (!c) return { campo: 'clave', indice, mensaje: 'Cada opción necesita un número o clave.' };
            if (c in opciones) return { campo: 'clave', indice, mensaje: `La opción «${c}» está repetida.` };
            // QA H10: sin texto, la persona vería solo «1.».
            if (!String(text ?? '').trim()) return { campo: 'texto', indice, mensaje: `Escribe el texto de la opción «${c}».` };
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
    if ('titulo' in cambios) fijarTitulo(modelo, nuevoNombre, cambios.titulo);

    return null;
}

// --- Nombre visible (título) de cada estado. Va en modelo.titulos y se guarda en contenido._editor.titulos,
// fuera de FLUJO: el motor del bot no lo lee. La clave del estado es el identificador que usa el bot.

const titulos = (modelo) => (modelo.titulos ??= {});

/** Nombre visible del estado; si no tiene, su identificador. */
export function tituloDe(modelo, nombre) {
    return modelo.titulos?.[nombre] || nombre;
}

/** Guarda el nombre visible (vacío o igual al identificador = sin título propio). */
export function fijarTitulo(modelo, nombre, titulo) {
    const limpio = String(titulo ?? '').trim();
    if (limpio && limpio !== nombre) titulos(modelo)[nombre] = limpio;
    else delete titulos(modelo)[nombre];
}

// --- Estados nuevos (creados en el editor y con el bot sin activar): su identificador sigue al nombre visible.
// Se guardan en contenido._editor.nuevos. Importados, anteriores y del sistema quedan fijos.
// Etapa 3: Publicar debe vaciar esta lista (desde ahí el identificador queda fijo para no romper conversaciones).

/** ¿El identificador de este estado se puede sincronizar con su nombre visible? */
export function esNuevo(modelo, nombre) {
    return (modelo.nuevos ?? []).includes(nombre);
}

/**
 * Identificador para un nombre visible: su slug, sin chocar con otros estados (el propio `actual` no cuenta).
 * "" si el texto no da un slug válido.
 */
export function identificadorPara(flujo, titulo, actual = null) {
    const base = nombreDesdeTexto(titulo);
    if (!base) return '';
    if (base === actual) return base;
    return nombreLibre(flujo, base);
}

/**
 * Contenido a guardar: el original con FLUJO del modelo y, si los hay, _editor.titulos y _editor.nuevos.
 * Sin ellos no se añade nada: un flujo importado que no se tocó queda idéntico.
 */
export function contenidoParaGuardar(original, modelo) {
    const { _editor, ...resto } = original ?? {};
    const contenido = { ...resto, FLUJO: modelo.flujo };
    const editor = { ...(_editor ?? {}) };
    delete editor.titulos;
    delete editor.nuevos;
    if (Object.keys(modelo.titulos ?? {}).length) editor.titulos = modelo.titulos;
    if ((modelo.nuevos ?? []).length) editor.nuevos = modelo.nuevos;
    if (Object.keys(editor).length) contenido._editor = editor;
    return contenido;
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
    // posiciones de sus copias de vista ("copia:viejo#i" → "copia:nuevo#i")
    for (const clave of Object.keys(modelo.layout).filter((c) => c.startsWith(`copia:${viejo}#`))) {
        modelo.layout[`copia:${nuevo}#${clave.slice(`copia:${viejo}#`.length)}`] = modelo.layout[clave];
        delete modelo.layout[clave];
    }

    if (modelo.titulos && viejo in modelo.titulos) {
        modelo.titulos[nuevo] = modelo.titulos[viejo];
        delete modelo.titulos[viejo];
    }
    if (modelo.nuevos) modelo.nuevos = modelo.nuevos.map((n) => (n === viejo ? nuevo : n));
}

/**
 * Conecta (o desconecta, con destino null) la salida nº `indice` del estado: el mismo orden que
 * salidas() y que las bolitas del lienzo (opciones primero, "sigue" al final).
 */
export function fijarDestino(modelo, nombre, indice, destino) {
    const estado = modelo.flujo[nombre];
    const salida = salidas(estado)[indice];
    if (!salida) return;

    if (salida.clave === null) {
        estado.next_state = destino;
    } else {
        estado.options[salida.clave] = { ...estado.options[salida.clave], next_state: destino };
    }
}

/**
 * Crea un estado nuevo a la derecha del origen y lo conecta a su salida nº `indice`.
 * nuevo = { tipo: 'menu'|'paso'|'final' } o { sistema: 'end_or_menu' }.
 * Nombre automático:
 *  - con texto de opción: nombre visible = el texto ("Ver precios"), identificador = su slug (ver_precios);
 *  - si el texto no da un slug (solo emojis 🌹) o la salida es «sigue»: identificador a partir del origen
 *    (start_opcion_1, departamento_siguiente) y nombre visible = el texto, o «Después de <origen>» (QA H16).
 * «Final» (QA H13): el motor no responde nunca más en un estado sin salida que no sea la Despedida, así que
 * «+ Nuevo final» crea el mensaje y lo deja conectado a la Despedida (`end`): se envían juntos y la conversación
 * se cierra bien. Si no hay Despedida, se añade armada.
 * Devuelve el identificador creado.
 */
export function crearConectado(modelo, origen, indice, nuevo) {
    const salida = salidas(modelo.flujo[origen])[indice];
    const textoOpcion = (salida?.texto ?? '').trim();
    const desde = modelo.layout[origen] ?? { x: 0, y: 0 };
    const lugar = { x: desde.x + 340, y: desde.y + indice * 60 };

    if (nuevo.sistema) {
        agregarPasoEspecial(modelo, nuevo.sistema, lugar);
        fijarDestino(modelo, origen, indice, nuevo.sistema);
        enlazarPareja(modelo, nuevo.sistema);
        return nuevo.sistema;
    }

    const slug = nombreDesdeTexto(textoOpcion);
    const clave = String(salida?.clave ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_') || String(indice + 1);
    const base = slug || (salida?.clave == null ? `${origen}_siguiente` : `${origen}_opcion_${clave}`);
    const nombre = nombreLibre(modelo.flujo, base);
    // Nombre visible: el texto de la opción (también si son solo emojis). «sigue» nunca tendrá texto: «Después de…».
    // Una opción todavía sin texto queda sin nombre visible para que lo tome al escribirlo (sincronizarHijos).
    if (textoOpcion) fijarTitulo(modelo, nombre, textoOpcion);
    else if (salida?.clave == null) fijarTitulo(modelo, nombre, `Después de ${modelo.titulos?.[origen] || etiquetaSistema(origen) || origen}`);
    (modelo.nuevos ??= []).push(nombre); // nuevo: su identificador sigue al nombre visible

    let estado = plantilla(nuevo.tipo);
    if (nuevo.tipo === 'final') {
        if (!('end' in modelo.flujo)) agregarPasoEspecial(modelo, 'end', { x: lugar.x + 340, y: lugar.y });
        estado = { message: '', next_state: 'end' };
    }
    agregarEstado(modelo, nombre, estado, lugar);
    fijarDestino(modelo, origen, indice, nombre);

    return nombre;
}

/** Ancho de una columna de Ordenar: lo que se corre a la derecha al insertar un paso. */
const COLUMNA = 420;

/**
 * Inserta un paso (o menú) nuevo EN MEDIO de una salida ya conectada: origen → nuevo → destino de antes.
 * La caja nueva ocupa el lugar del destino; el destino y lo que cuelga de él (lo que está a su derecha) se corren
 * una columna. Las demás salidas que llegaban al destino no cambian. El destino conserva su nombre visible
 * (si lo tomaba del texto de la opción, se le fija para no perderlo) y la caja nueva se llama «Antes de …».
 * Un menú nace con su opción 1 conectada al destino y con su nombre como texto.
 * Devuelve el identificador creado, o null si la salida no estaba conectada a un paso existente.
 */
export function insertarEntre(modelo, origen, indice, tipo) {
    const salida = salidas(modelo.flujo[origen])[indice];
    const destino = salida?.destino;
    if (destino == null || !(destino in modelo.flujo)) return null;

    const textoOpcion = (salida.texto ?? '').trim();
    const nombreDestino = modelo.titulos?.[destino] || etiquetaSistema(destino) || textoOpcion || destino;
    if (!modelo.titulos?.[destino] && !esEstadoSistema(destino) && textoOpcion) fijarTitulo(modelo, destino, textoOpcion);

    // El destino y lo que cuelga de él hacia la derecha dejan sitio (no se tocan el origen ni lo que vuelve atrás).
    const lugar = modelo.layout[destino] ?? { x: (modelo.layout[origen]?.x ?? 0) + COLUMNA, y: modelo.layout[origen]?.y ?? 0 };
    const correr = new Set();
    const cola = [destino];
    while (cola.length) {
        const n = cola.shift();
        const p = modelo.layout[n];
        if (correr.has(n) || n === origen || n === 'start' || !p || p.x < lugar.x) continue;
        correr.add(n);
        salidas(modelo.flujo[n] ?? {}).forEach((s) => s.destino != null && cola.push(s.destino));
    }
    for (const n of correr) modelo.layout[n] = { ...modelo.layout[n], x: modelo.layout[n].x + COLUMNA };

    const usados = new Set(Object.values(modelo.titulos ?? {}));
    let titulo = `Antes de ${nombreDestino}`;
    for (let n = 2; usados.has(titulo); n++) titulo = `Antes de ${nombreDestino} ${n}`;
    const nombre = identificadorPara(modelo.flujo, titulo) || nombreLibre(modelo.flujo, `${origen}_paso`);
    fijarTitulo(modelo, nombre, titulo);
    (modelo.nuevos ??= []).push(nombre);

    const estado = tipo === 'menu'
        ? { message: '', options: { 1: { text: nombreDestino, next_state: destino } } }
        : { message: '', next_state: destino };
    agregarEstado(modelo, nombre, estado, lugar);
    fijarDestino(modelo, origen, indice, nombre);
    return nombre;
}

/**
 * Conecta la salida nº `indice` de `origen` con `destino` (arrastrando o desde el menú) y, si corresponde,
 * la caja destino toma el nombre de la opción: nombre visible = texto de la opción, identificador = su slug.
 * Solo si el destino es nuevo (creado en el editor, con el bot sin activar), no es del sistema y esta es la única
 * salida que llega a él; si no, conserva su nombre (start, importados o estados compartidos no se tocan).
 * Devuelve { destino, renombrado } con el identificador final del destino.
 */
export function conectarYNombrar(modelo, origen, indice, destino) {
    fijarDestino(modelo, origen, indice, destino);

    const texto = salidas(modelo.flujo[origen])[indice]?.texto ?? '';
    const entradas = Object.values(modelo.flujo)
        .flatMap((estado) => salidas(estado))
        .filter((s) => s.destino === destino).length;
    if (!texto || !esNuevo(modelo, destino) || esEstadoSistema(destino) || entradas > 1) {
        return { destino, renombrado: false };
    }

    const id = identificadorPara(modelo.flujo, texto, destino);
    if (!id) return { destino, renombrado: false };
    if (id !== destino) renombrarEstado(modelo, destino, id); // también mueve el título y la marca de "nuevo"
    fijarTitulo(modelo, id, texto);
    return { destino: id, renombrado: true };
}

/**
 * Tras editar un estado: si cambió el texto de una opción, su caja destino toma el texto nuevo (nombre visible)
 * y su slug (identificador), siempre que siga llamándose como el texto viejo (o no tenga nombre visible: no se
 * pisa un nombre puesto a mano), sea nueva, no sea del sistema y esta sea la única salida que llega a ella.
 * `antes` = salidas(estado) antes de editar. Devuelve [{ de, a }] con los renombrados.
 */
export function sincronizarHijos(modelo, nombre, antes) {
    const renombrados = [];

    for (const { destino, texto } of salidas(modelo.flujo[nombre])) {
        if (destino == null || !(destino in modelo.flujo) || !texto) continue;
        const previa = antes.find((s) => s.destino === destino);
        if (!previa || previa.texto === texto) continue;                                  // el texto no cambió
        if ((modelo.titulos?.[destino] ?? '') !== (previa.texto ?? '')) continue;           // nombre puesto a mano
        if (!esNuevo(modelo, destino) || esEstadoSistema(destino)) continue;
        const entradas = Object.values(modelo.flujo).flatMap((e) => salidas(e)).filter((s) => s.destino === destino).length;
        if (entradas > 1) continue;                                                       // caja compartida

        const id = identificadorPara(modelo.flujo, texto, destino) || destino;
        if (id !== destino) renombrarEstado(modelo, destino, id);
        fijarTitulo(modelo, id, texto);
        renombrados.push({ de: destino, a: id });
    }

    return renombrados;
}

/** Siguiente número libre para una opción nueva de menú. */
export function siguienteClave(claves) {
    const numeros = claves.filter((c) => /^\d+$/.test(c)).map(Number);
    return String(numeros.length ? Math.max(...numeros) + 1 : 1);
}

// --- Copiar y pegar cajas (selección múltiple). El portapapeles es un objeto plano: sirve entre flujos.

/** Copia los estados (con sus nombres visibles y posiciones) para pegarlos después. */
export function copiarEstados(modelo, nombres) {
    const lista = nombres.filter((n) => n in modelo.flujo);
    return {
        estados: Object.fromEntries(lista.map((n) => [n, structuredClone(modelo.flujo[n])])),
        titulos: Object.fromEntries(lista.filter((n) => modelo.titulos?.[n]).map((n) => [n, modelo.titulos[n]])),
        layout: Object.fromEntries(lista.map((n) => [n, modelo.layout?.[n] ?? { x: 0, y: 0 }])),
    };
}

/**
 * Pega lo copiado con su misma forma, con la esquina de arriba a la izquierda en `posicion`.
 * - Cajas normales: nombre nuevo (`ver_precios_copia`) y nombre visible «… (copia)».
 * - Pasos especiales: son únicos; si ya están en el flujo se usa el que hay, si no, se crean.
 * - Conexiones: entre las copiadas van a las copias; hacia fuera se mantienen si ese paso existe aquí, si no, quedan
 *   sin conectar.
 * Devuelve los nombres creados.
 */
export function pegarEstados(modelo, copia, posicion) {
    const ocupados = { ...modelo.flujo };
    const nuevoDe = new Map();
    for (const n of Object.keys(copia.estados ?? {})) {
        if (esEstadoSistema(n)) {
            nuevoDe.set(n, n in modelo.flujo ? null : n); // null = usar el que ya existe
        } else {
            const nombre = nombreLibre(ocupados, nombreDesdeTexto(`${n}_copia`) || 'paso_copia');
            ocupados[nombre] = true;
            nuevoDe.set(n, nombre);
        }
    }
    const destino = (d) => (d == null ? null : nuevoDe.has(d) ? (nuevoDe.get(d) ?? d) : (d in modelo.flujo ? d : null));

    const puntos = Object.values(copia.layout ?? {});
    const minX = Math.min(...puntos.map((p) => p.x));
    const minY = Math.min(...puntos.map((p) => p.y));
    const creados = [];
    for (const [n, original] of Object.entries(copia.estados ?? {})) {
        const nombre = nuevoDe.get(n);
        if (!nombre) continue;
        const estado = structuredClone(original);
        if ('next_state' in estado) estado.next_state = destino(estado.next_state);
        for (const opcion of Object.values(estado.options ?? {})) {
            if (opcion && typeof opcion === 'object') opcion.next_state = destino(opcion.next_state ?? null);
        }
        modelo.flujo[nombre] = estado;
        const p = copia.layout?.[n] ?? { x: minX, y: minY };
        (modelo.layout ??= {})[nombre] = { x: Math.round(posicion.x + p.x - minX), y: Math.round(posicion.y + p.y - minY) };
        if (!esEstadoSistema(nombre)) {
            fijarTitulo(modelo, nombre, copia.titulos?.[n] ? `${copia.titulos[n]} (copia)` : '');
            (modelo.nuevos ??= []).push(nombre);
        }
        creados.push(nombre);
    }
    return creados;
}

/**
 * Borra el estado. Las flechas que llegaban a él quedan apuntando a un nombre que ya no existe
 * (el lienzo las marca y el validador las informará). start no se puede borrar: devuelve false.
 */
export function eliminarEstado(modelo, nombre) {
    if (nombre === 'start') return false;
    delete modelo.flujo[nombre];
    delete modelo.layout[nombre];
    for (const clave of Object.keys(modelo.layout).filter((c) => c.startsWith(`copia:${nombre}#`))) delete modelo.layout[clave];
    if (modelo.titulos) delete modelo.titulos[nombre];
    if (modelo.nuevos) modelo.nuevos = modelo.nuevos.filter((n) => n !== nombre);
    return true;
}
