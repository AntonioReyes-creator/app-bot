// Estados cuyo nombre está escrito a mano en WhatsAppController.php del proyecto existente
// (docs/PLAN.md §4). El editor no debe permitir renombrarlos.
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
 * Básicos: los que necesita cualquier bot. Nombre amigable para el panel; el nombre real no cambia
 * porque el motor lo busca así (WhatsAppController.php: 'start' 26 veces, 'end' 37, 'esperando_agente' 24).
 */
export const BASICOS = [
    { nombre: 'start', etiqueta: 'Inicio' },
    { nombre: 'end', etiqueta: 'Fin' },
    { nombre: 'esperando_agente', etiqueta: 'Pasar a un asesor' },
];

/** Avanzados: lógica propia del motor actual (pensada para el Poder Judicial). Ver docs/PLAN.md §4. */
export const AVANZADOS = ['end_or_menu', 'mas_informacion', 'seleccionar_departamento', 'encuesta_inicio', 'encuesta_fin', 'verificacion_numero'];

/** Para qué los usa el bot (verificado en WhatsAppController.php o en docs/PLAN.md §4). */
export const DESCRIPCIONES = {
    start: 'Primer mensaje del bot al iniciar la conversación.',
    end: 'Despedida: el bot cierra la conversación.',
    esperando_agente: 'El bot deja de responder y la conversación pasa a un asesor humano.',
    end_or_menu: 'Pregunta de cierre (ej. ¿necesitas algo más?).',
    mas_informacion: 'El motor pide los datos personales antes de pasar a un asesor.',
    seleccionar_departamento: 'El motor reemplaza sus opciones por la lista de cortes.',
    encuesta_inicio: 'Encuesta de satisfacción: la pregunta.',
    encuesta_fin: 'Cierre de la encuesta, antes de terminar.',
    verificacion_numero: 'El motor lo usa cuando el número no tiene un ticket previo.',
};

/** Nombre amigable de un básico, o null. */
export function etiquetaSistema(nombre) {
    return BASICOS.find((b) => b.nombre === nombre)?.etiqueta ?? null;
}

/**
 * Estados del sistema con parte variable (X = área o trámite, en snake_case).
 * antes + X + despues = nombre; el bot los reconoce por el prefijo o el sufijo.
 */
export const PATRONES_SISTEMA = [
    { antes: 'derivar_', despues: '', ejemplo: 'notificaciones',
      descripcion: 'Deriva a un asesor de un área. El bot también llega aquí desde X_pedir_corte sin flechas.' },
    { antes: '', despues: '_pedir_corte', ejemplo: 'deposito',
      descripcion: 'Pide la jurisdicción: el código del bot valida la corte y guarda el departamento.' },
    { antes: '', despues: '_confirmar', ejemplo: 'deposito',
      descripcion: 'Confirma la jurisdicción ingresada (Sí / No).' },
    { antes: 'esperando_agente_', despues: '', ejemplo: 'quejas',
      descripcion: 'Espera a un asesor de un área concreta.' },
];

// esperando_agente*, derivar_* (incluye el typo derivar_expedientes_cofirmar), *_pedir_corte, *_confirmar.
const PATRONES = [/^esperando_agente/, /^derivar_/, /_pedir_corte$/, /_confirmar$/];

export function esEstadoSistema(nombre) {
    return NOMBRES.includes(nombre) || PATRONES.some((patron) => patron.test(nombre));
}

/** Descripción de un estado del sistema (fijo o por patrón), o null si no lo es. */
export function describirSistema(nombre) {
    if (nombre in DESCRIPCIONES) return DESCRIPCIONES[nombre];
    if (nombre.startsWith('esperando_agente')) return PATRONES_SISTEMA[3].descripcion;
    const patron = PATRONES_SISTEMA.find(({ antes, despues }) =>
        (antes && nombre.startsWith(antes)) || (despues && nombre.endsWith(despues)));
    return patron?.descripcion ?? null;
}
