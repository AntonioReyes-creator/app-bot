import { armarDocumento, resumirDocumento } from './flujo/documento.js';
import { estadoDelDiseno } from './flujo/revision.js';

// Lista de flujos: columna «Diseño» con el mismo semáforo que el editor (✅ bien cerrado · ⚠ por revisar · ⛔ falla),
// calculado con la misma revisión (revision.js) sobre la última versión guardada de cada flujo.

const datos = JSON.parse(document.getElementById('flujos-datos')?.textContent ?? '{}');

for (const celda of document.querySelectorAll('[data-diseno]')) {
    const { FLUJO: flujo = {}, titulos = {} } = datos[celda.dataset.diseno] ?? {};
    // Los arreglos vacíos que vienen de PHP (p. ej. titulos []) se tratan como objetos vacíos.
    const titulosObjeto = Array.isArray(titulos) ? {} : titulos;
    const { avisos } = resumirDocumento(armarDocumento(flujo, titulosObjeto).secciones, flujo);
    const estado = estadoDelDiseno(avisos);

    const enlace = Object.assign(document.createElement('a'), {
        href: celda.dataset.url,
        className: `badge diseno text-decoration-none diseno-${estado.nivel}`,
        textContent: `${estado.icono} ${estado.texto}`,
        title: [estado.detalle, ...avisos.slice(0, 3).map((a) => '• ' + a.texto), avisos.length > 3 ? `… y ${avisos.length - 3} más` : '']
            .filter(Boolean).join('\n'),
    });
    celda.replaceChildren(enlace);
}
