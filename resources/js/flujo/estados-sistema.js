// Estados cuyo nombre está escrito a mano en WhatsAppController.php del proyecto existente
// (docs/PLAN.md §4). El editor no debe permitir renombrarlos.
//
// En la interfaz se llaman "pasos especiales" y se describen con palabras sencillas (lo que hace el bot),
// no con términos técnicos: la persona que arma el flujo no necesita saber cómo funciona el motor.
export const NOMBRES = [
    'start',
    'end',
    'end_or_menu',
    'esperando_agente',
    'mas_informacion',
    'seleccionar_departamento',
    'encuesta_inicio',
    'encuesta_fin',
    'verificacion_numero',
];

/**
 * Básicos: los que necesita cualquier bot. El nombre real no cambia porque el motor lo busca así
 * (WhatsAppController.php: 'start' 26 veces, 'end' 37, 'esperando_agente' 24).
 */
export const BASICOS = [
    { nombre: 'start', etiqueta: 'Bienvenida', icono: '👋' },
    { nombre: 'end', etiqueta: 'Despedida', icono: '🏁' },
    { nombre: 'esperando_agente', etiqueta: 'Pasar con un asesor', icono: '🧑‍💼' },
];

/**
 * Avanzados: lógica propia del motor actual. Ver docs/PLAN.md §4. Sus códigos vienen del primer cliente (p. ej.
 * seleccionar_departamento, X_pedir_corte) y no se pueden cambiar, pero lo que ve la persona usa términos generales:
 * el editor sirve para cualquier bot, no para un flujo en particular.
 */
export const AVANZADOS = ['end_or_menu', 'mas_informacion', 'seleccionar_departamento', 'encuesta_inicio', 'encuesta_fin', 'verificacion_numero'];

/** Nombre amigable e icono de los avanzados. */
const ETIQUETAS_AVANZADOS = {
    end_or_menu: { etiqueta: '¿Algo más?', icono: '❓' },
    mas_informacion: { etiqueta: 'Escalar a un asesor', icono: '🙋' },
    seleccionar_departamento: { etiqueta: 'Elegir de una lista', icono: '📋' },
    encuesta_inicio: { etiqueta: 'Encuesta: pregunta', icono: '⭐' },
    encuesta_fin: { etiqueta: 'Encuesta: cierre', icono: '⭐' },
    verificacion_numero: { etiqueta: 'Verificar número', icono: '📱' },
};

/** Para qué sirve cada uno, en palabras sencillas (verificado en WhatsAppController.php o docs/PLAN.md §4). */
export const DESCRIPCIONES = {
    start: 'El primer mensaje que recibe la persona cuando escribe al bot.',
    end: 'El mensaje con el que el bot se despide y termina la conversación.',
    esperando_agente: 'El bot deja de responder y una persona de tu equipo continúa la conversación.',
    end_or_menu: 'Pregunta si la persona necesita algo más (volver al menú o terminar).',
    mas_informacion: 'Antes de pasar con un asesor, el bot pide los datos de la persona.',
    seleccionar_departamento: 'El bot muestra una lista que arma el sistema (por ejemplo, sedes o áreas) para que la persona elija una opción.',
    encuesta_inicio: 'Pregunta si la persona quedó satisfecha con la atención.',
    encuesta_fin: 'Agradece la respuesta de la encuesta antes de terminar.',
    verificacion_numero: 'Se usa cuando el número de la persona no tiene una atención anterior.',
};

/**
 * Pasos especiales con una parte variable (X = área o trámite, en minúsculas y guion bajo).
 * antes + X + despues = nombre; el bot los reconoce por el prefijo o el sufijo.
 */
export const PATRONES_SISTEMA = [
    { antes: 'derivar_', despues: '', ejemplo: 'notificaciones', etiqueta: 'Derivar a un área', icono: '↪️',
      descripcion: 'Avisa que la persona será atendida por un área concreta (ej. notificaciones).' },
    { antes: '', despues: '_pedir_corte', ejemplo: 'deposito', etiqueta: 'Pedir que elija de la lista', icono: '📋',
      descripcion: 'Pide a la persona que elija una opción de la lista que arma el sistema; el bot valida la respuesta y la guarda.' },
    { antes: '', despues: '_confirmar', ejemplo: 'deposito', etiqueta: 'Confirmar la elección', icono: '✅',
      descripcion: 'Pregunta si lo que eligió la persona es correcto (Sí / No).' },
    { antes: 'esperando_agente_', despues: '', ejemplo: 'quejas', etiqueta: 'Esperar asesor de un área', icono: '⏳',
      descripcion: 'La persona espera a un asesor de un área concreta.' },
];

// esperando_agente*, derivar_* (incluye el typo derivar_expedientes_cofirmar), *_pedir_corte, *_confirmar.
const PATRONES = [/^esperando_agente/, /^derivar_/, /_pedir_corte$/, /_confirmar$/];

export function esEstadoSistema(nombre) {
    return NOMBRES.includes(nombre) || PATRONES.some((patron) => patron.test(nombre));
}

/** Patrón (derivar_X, X_pedir_corte…) al que pertenece un nombre, o null. */
function patronDe(nombre) {
    if (nombre.startsWith('esperando_agente_')) return PATRONES_SISTEMA[3];
    return PATRONES_SISTEMA.find(({ antes, despues }) =>
        (antes && nombre.startsWith(antes)) || (despues && nombre.endsWith(despues))) ?? null;
}

/** Descripción sencilla de un paso especial (fijo o por patrón), o null si no lo es. */
export function describirSistema(nombre) {
    if (nombre in DESCRIPCIONES) return DESCRIPCIONES[nombre];
    return patronDe(nombre)?.descripcion ?? null;
}

/** Nombre amigable de un paso especial (ej. start → "Bienvenida"), o null si no lo es. */
export function etiquetaSistema(nombre) {
    return BASICOS.find((b) => b.nombre === nombre)?.etiqueta
        ?? ETIQUETAS_AVANZADOS[nombre]?.etiqueta
        ?? patronDe(nombre)?.etiqueta
        ?? null;
}

/** Icono de un paso especial, o "" si no lo es. */
export function iconoSistema(nombre) {
    return BASICOS.find((b) => b.nombre === nombre)?.icono
        ?? ETIQUETAS_AVANZADOS[nombre]?.icono
        ?? patronDe(nombre)?.icono
        ?? '';
}
