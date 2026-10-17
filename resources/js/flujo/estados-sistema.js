// Estados cuyo nombre está escrito a mano en WhatsAppController.php del proyecto existente
// (docs/PLAN.md §4). El editor no debe permitir renombrarlos.
const NOMBRES = [
    'start',
    'end',
    'end_or_menu',
    'mas_informacion',
    'seleccionar_departamento',
    'encuesta_inicio',
    'encuesta_fin',
    'verificacion_numero',
];

// esperando_agente*, derivar_* (incluye el typo derivar_expedientes_cofirmar), *_pedir_corte, *_confirmar.
const PATRONES = [/^esperando_agente/, /^derivar_/, /_pedir_corte$/, /_confirmar$/];

export function esEstadoSistema(nombre) {
    return NOMBRES.includes(nombre) || PATRONES.some((patron) => patron.test(nombre));
}
