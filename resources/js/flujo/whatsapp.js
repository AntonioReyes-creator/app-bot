import { escapar } from './flujo-a-drawflow.js';

// Formato de texto de WhatsApp: lo que escribe el usuario y cómo lo verá en el teléfono.
// Módulo puro (sin DOM) para poder probarlo.

/** Largo máximo de un mensaje de texto en WhatsApp. */
export const MAXIMO_CARACTERES = 4096;

/** Marcas de formato que entiende WhatsApp. */
export const FORMATOS = {
    negrita: { marca: '*' },
    cursiva: { marca: '_' },
    tachado: { marca: '~' },
    mono: { marca: '```' },
};

/**
 * Envuelve la selección [inicio, fin) con la marca del formato. Sin selección, inserta las dos marcas
 * y deja el cursor en medio. Devuelve { texto, inicio, fin } (la nueva selección).
 */
export function envolver(texto, inicio, fin, formato) {
    const { marca } = FORMATOS[formato];
    const elegido = texto.slice(inicio, fin);
    const nuevo = texto.slice(0, inicio) + marca + elegido + marca + texto.slice(fin);
    return { texto: nuevo, inicio: inicio + marca.length, fin: fin + marca.length };
}

/**
 * Convierte en lista las líneas que toca la selección: 'vinetas' ("- "), 'numerada' ("1. ", "2. "…) o 'cita' ("> ").
 * Si ya lo eran, quita la marca (alternar). Devuelve { texto, inicio, fin } con la selección sobre esas líneas.
 */
export function marcarLineas(texto, inicio, fin, tipo) {
    const desde = texto.lastIndexOf('\n', inicio - 1) + 1;
    const hastaSalto = texto.indexOf('\n', fin);
    const hasta = hastaSalto === -1 ? texto.length : hastaSalto;
    const lineas = texto.slice(desde, hasta).split('\n');

    const patron = { vinetas: /^- /, numerada: /^\d+\. /, cita: /^> / }[tipo];
    const yaMarcadas = lineas.every((linea) => patron.test(linea));
    const nuevas = lineas.map((linea, i) => {
        if (yaMarcadas) return linea.replace(patron, '');
        const limpia = linea.replace(/^(- |\d+\. |> )/, '');
        return (tipo === 'vinetas' ? '- ' : tipo === 'numerada' ? `${i + 1}. ` : '> ') + limpia;
    }).join('\n');

    return { texto: texto.slice(0, desde) + nuevas + texto.slice(hasta), inicio: desde, fin: desde + nuevas.length };
}

/** Inserta un texto (ej. un emoji) en la posición del cursor, reemplazando la selección. */
export function insertar(texto, inicio, fin, nuevo) {
    return { texto: texto.slice(0, inicio) + nuevo + texto.slice(fin), inicio: inicio + nuevo.length, fin: inicio + nuevo.length };
}

/**
 * Texto que envía el bot para un estado: el mensaje y, si es menú, "\n{clave}. {texto}" por cada opción
 * numérica (igual que renderEstado() en WhatsAppController.php, que omite las claves no numéricas).
 */
export function mensajeDelBot(message, opciones = []) {
    const lineas = opciones
        .filter(({ clave }) => /^\d+$/.test(String(clave).trim()))
        .map(({ clave, text }) => `\n${String(clave).trim()}. ${text}`);
    return (message ?? '') + lineas.join('');
}

/** HTML de la vista previa: escapa el texto y aplica el formato de WhatsApp. */
export function formatearWhatsApp(texto) {
    // Bloques ```mono``` primero (pueden ocupar varias líneas y su contenido no se formatea).
    const bloques = [];
    let html = escapar(texto).replace(/```([\s\S]+?)```/g, (_, contenido) => {
        bloques.push(contenido);
        return `\u0000${bloques.length - 1}\u0000`;
    });

    html = html.split('\n').map((linea) => {
        let l = linea
            .replace(/(^|[\s(])\*(\S(?:[^*\n]*?\S)?)\*(?=$|[\s.,;:!?)])/g, '$1<strong>$2</strong>')
            .replace(/(^|[\s(])_(\S(?:[^_\n]*?\S)?)_(?=$|[\s.,;:!?)])/g, '$1<em>$2</em>')
            .replace(/(^|[\s(])~(\S(?:[^~\n]*?\S)?)~(?=$|[\s.,;:!?)])/g, '$1<s>$2</s>')
            .replace(/`([^`\n]+)`/g, '<code>$1</code>');
        if (/^- |^\* /.test(l)) l = `<span class="wa-vineta">•</span> ${l.slice(2)}`;
        if (/^&gt; /.test(l)) l = `<span class="wa-cita">${l.slice(5)}</span>`;
        return l;
    }).join('<br>');

    return html.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code class="wa-bloque">${bloques[i]}</code>`);
}

/** Emojis útiles para mensajes de un bot, por grupos (para el selector del editor). */
export const EMOJIS = {
    'Caras y manos': ['👋', '😊', '🙂', '😉', '🙏', '👍', '👌', '👉', '👇', '🤝', '💪', '🙌'],
    'Avisos': ['✅', '❌', '⚠️', 'ℹ️', '❗', '❓', '🔔', '📢', '🚫', '⏳', '✔️', '💡'],
    'Contacto y datos': ['📞', '📱', '✉️', '📧', '💬', '📍', '🏢', '🌐', '🔗', '📅', '⏰', '🕒'],
    'Documentos': ['📄', '📝', '📋', '📎', '📌', '🗂️', '📂', '🔍', '🧾', '💳', '💰', '🏛️'],
    'Números y flechas': ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '➡️', '⬅️', '🔙', '🔝'],
};
