import { arbolDeEstados, clasificar, salidas } from './flujo-a-drawflow.js';
import { NOMBRES, esEstadoSistema, etiquetaSistema, iconoSistema } from './estados-sistema.js';
import { combinaCon } from './simulador.js';
import { revisarFlujo } from './revision.js';

// Vista de texto (📄 Documento): todo el flujo como un documento numerado, en el orden del árbol (el mismo que usa
// Ordenar). Cada estado se describe UNA vez, en el sitio donde cuelga en el árbol (§1.2.1); las demás conexiones
// hacia él son referencias (⇢ §1.2.1). Explica en palabras lo que hace el bot en cada paso (con las reglas del
// motor, las mismas que usa el simulador) y avisa de problemas. Solo lee el FLUJO: no lo modifica.

const TIPOS = { menu: 'Menú', paso: 'Paso', final: 'Final' };
const LARGO_TITULO = 50;

/** Primera línea con texto del mensaje, sin marcas de WhatsApp (*, _, ~) ni {{…}}, recortada. */
function primeraLinea(mensaje) {
    const linea = String(mensaje ?? '').split('\n')
        .map((l) => l.replace(/[*_~`]|\{\{[^}]*\}\}/g, '').trim().replace(/[.:,;]+$/, '')) // sin marcas ni punto final
        .find(Boolean) ?? '';
    return linea.length > LARGO_TITULO ? `${linea.slice(0, LARGO_TITULO - 1).trimEnd()}…` : linea;
}

/**
 * Título legible de cada estado, en este orden: nombre visible (lo escribió quien arma el flujo) → paso especial de
 * nombre fijo (👋 Bienvenida) → texto de la opción que lleva a él en el árbol ("Demandas o escritos") → etiqueta
 * del patrón (✅ Confirmar la elección) → primera línea del mensaje → '' (se usa el identificador).
 */
function titulosLegibles(flujo, titulos, aristas) {
    const textoOpcion = new Map();
    for (const [nombre, estado] of Object.entries(flujo)) {
        salidas(estado).forEach(({ texto, destino }, i) => {
            if (texto && aristas.has(`${nombre}#${i}`)) textoOpcion.set(destino, texto);
        });
    }
    const especial = (n) => (etiquetaSistema(n) ? `${iconoSistema(n)} ${etiquetaSistema(n)}` : '');

    return new Map(Object.keys(flujo).map((n) => [n, titulos[n]
        || (NOMBRES.includes(n) && especial(n))
        || textoOpcion.get(n)
        || especial(n)
        || primeraLinea(flujo[n].message)]));
}

/**
 * @returns { secciones, numeroDe } donde
 *  - secciones: [{ nombre, numero, nivel, tipo, titulo, mensaje, sinConexion, entradas, explicacion: [texto],
 *    salidas: [{ clave, texto, destino, modo: 'hijo' | 'referencia' | 'atras' | 'roto' | 'pendiente', numeroDestino }] }]
 *    en orden de lectura.
 *  - numeroDe: Map nombre → número de sección ("1.2.1").
 */
export function armarDocumento(flujo, titulos = {}) {
    const { hijos, aristas, raices } = arbolDeEstados(flujo);
    const numeroDe = new Map();
    const orden = [];

    // 1. Números de sección: start = 1, sus hijos 1.1, 1.2… (en el orden de las opciones); lo no conectado, 2, 3…
    const numerar = (nombre, numero) => {
        numeroDe.set(nombre, numero);
        orden.push(nombre);
        hijos.get(nombre).forEach((hijo, i) => numerar(hijo, `${numero}.${i + 1}`));
    };
    const ordenRaices = ['start', ...raices.filter((r) => r !== 'start')].filter((r) => r in flujo);
    ordenRaices.forEach((raiz, i) => numerar(raiz, String(i + 1)));

    // Cuántas conexiones llegan a cada estado (para avisar "lo usan N pasos").
    const entradas = new Map();
    for (const estado of Object.values(flujo)) {
        for (const { destino } of salidas(estado)) if (destino in flujo) entradas.set(destino, (entradas.get(destino) ?? 0) + 1);
    }

    const tituloDe = titulosLegibles(flujo, titulos, aristas);
    const referencia = (n) => (numeroDe.has(n) ? `§${numeroDe.get(n)} ${tituloDe.get(n) || n}` : `«${n}»`);

    // ¿El destino es el mismo estado o uno anterior en su camino? (su número es prefijo del número del origen)
    const esAnterior = (numeroDestino, numero) => numero === numeroDestino || numero.startsWith(`${numeroDestino}.`);

    const secciones = orden.map((nombre) => {
        const estado = flujo[nombre];
        const numero = numeroDe.get(nombre);
        return {
            nombre,
            numero,
            nivel: numero.split('.').length - 1,
            tipo: clasificar(estado),
            titulo: tituloDe.get(nombre) || '',
            mensaje: estado.message ?? '',
            sinConexion: !('start' in flujo) || !(numero === '1' || numero.startsWith('1.')), // fuera de la rama de start
            entradas: entradas.get(nombre) ?? 0,
            explicacion: explicar(flujo, nombre, referencia),
            salidas: salidas(estado).map(({ clave, texto, destino }, i) => {
                const numeroDestino = numeroDe.get(destino) ?? null;
                let modo;
                if (destino == null) modo = 'pendiente';
                else if (!(destino in flujo)) modo = 'roto';
                else if (aristas.has(`${nombre}#${i}`)) modo = 'hijo';
                else if (destino === 'start' || esAnterior(numeroDestino, numero)) modo = 'atras';
                else modo = 'referencia';
                return { clave, texto, destino, modo, numeroDestino };
            }),
        };
    });

    return { secciones, numeroDe };
}

/**
 * Qué hace el bot en este paso, en palabras (reglas del motor verificadas en WhatsAppController; ver simulador.js).
 * `referencia(nombre)` devuelve "§1.2 Título" para citar otros pasos.
 */
export function explicar(flujo, nombre, referencia = (n) => n) {
    const estado = flujo[nombre];
    const lineas = [];
    const opciones = Object.entries(estado.options ?? {});
    const conAreas = String(estado.message ?? '').includes('{{departamentos}}');

    if (nombre === 'start') {
        lineas.push('Primer mensaje: el bot lo envía cuando la persona escribe por primera vez, con todas sus opciones.');
    }

    if ('options' in estado) {
        lineas.push('Espera que la persona elija una opción (por su número, su texto o una palabra clave); si no coincide, le repite las opciones.');
        const sinNumero = opciones.filter(([clave]) => !/^\d+$/.test(clave)).map(([clave]) => `«${clave}»`);
        if (sinNumero.length) lineas.push(`La opción ${sinNumero.join(', ')} no lleva número: no siempre se muestra en el menú, pero la persona puede escribirla.`);
        if (opciones.some(([, o]) => o?.next_state === 'end')) {
            lineas.push(`Las opciones que van a ${referencia('end')} cierran la conversación; normalmente el sistema hace antes su encuesta de salida.`);
        }
    } else if (estado.next_state != null) {
        const siguiente = referencia(estado.next_state);
        const combinado = combinaCon(flujo, nombre);
        if (nombre === 'mas_informacion') {
            lineas.push(`Pide los datos de la persona (nombre, documento, correo y su consulta); con ellos el sistema crea el ticket y pasa a ${siguiente}.`);
        } else if (/_pedir_corte$/.test(nombre) || nombre === 'derivar_expedientes') {
            lineas.push(`Muestra la lista de áreas y espera que la persona elija un número; luego pasa a ${siguiente} para confirmarlo.`);
        } else if (combinado) {
            const conOpciones = 'options' in (flujo[combinado] ?? {});
            lineas.push(`Al llegar aquí eligiendo una opción, se envía en el mismo mensaje que ${referencia(combinado)}`
                + (conOpciones ? ' y sus opciones: la persona responde ahí.' : '.'));
        } else {
            lineas.push(`Espera que la persona escriba algo (lo que sea) y continúa con ${siguiente}.`);
        }
    } else if (nombre === 'end' || nombre === 'encuesta_fin') {
        lineas.push(`Cierra la conversación. Si la persona vuelve a escribir, empieza de nuevo en ${referencia('start')}.`);
    } else if (/^esperando_agente/.test(nombre)) {
        lineas.push('La conversación queda en manos de un asesor; mientras espera, el bot solo repite este aviso.');
    } else {
        lineas.push('Último mensaje de este camino: si la persona escribe, el bot no responde.');
    }

    if (conAreas && !/_pedir_corte$/.test(nombre) && nombre !== 'derivar_expedientes') {
        lineas.push('Incluye la lista de áreas ({{departamentos}}), que arma el sistema con las que tienen asesores.');
    }
    return lineas;
}

/**
 * Resumen para la cabecera: cuántos pasos de cada tipo y la lista de avisos (con el estado al que llevan).
 * avisos: [{ gravedad: 'error' | 'aviso', nombre, texto }]
 */
export function resumirDocumento(secciones, flujo = null) {
    const cuenta = (tipo) => secciones.filter((s) => s.tipo === tipo).length;
    const avisos = [];
    // Con el FLUJO, además, la revisión completa (mensajes vacíos, finales mudos, comandos… ver revision.js).
    const porNombre = new Map(secciones.map((s) => [s.nombre, s]));
    const revision = flujo ? revisarFlujo(flujo, (n) => porNombre.get(n)?.titulo || n) : [];
    for (const s of secciones) {
        const quien = `§${s.numero} ${s.titulo || s.nombre}`;
        for (const p of revision.filter((x) => x.nombre === s.nombre)) avisos.push({ ...p, texto: `${quien}: ${p.texto}` });
        for (const salida of s.salidas) {
            const opcion = salida.clave === null ? 'su salida' : `la opción ${salida.clave}`;
            if (salida.modo === 'roto') avisos.push({ gravedad: 'error', nombre: s.nombre, texto: `${quien}: ${opcion} va a «${salida.destino}», que no existe.` });
            if (salida.modo === 'pendiente') avisos.push({ gravedad: 'aviso', nombre: s.nombre, texto: `${quien}: ${opcion} no está conectada.` });
        }
        if (s.sinConexion && s.nivel === 0) { // un aviso por rama suelta (lo que cuelga de ella tampoco se alcanza)
            const debajo = secciones.filter((x) => x.numero.startsWith(`${s.numero}.`)).length;
            const extra = debajo === 1 ? ' (ni al paso que sigue)' : debajo > 1 ? ` (ni a los ${debajo} pasos que siguen)` : '';
            avisos.push({ gravedad: 'aviso', nombre: s.nombre, texto: `${quien}: ningún camino desde el inicio llega aquí${extra}.` });
        }
    }
    return {
        total: secciones.length,
        menus: cuenta('menu'),
        pasos: cuenta('paso'),
        finales: cuenta('final'),
        especiales: secciones.filter((s) => esEstadoSistema(s.nombre)).length,
        compartidos: secciones.filter((s) => s.entradas > 1).length,
        avisos,
    };
}

// --- Navegación paso a paso (panel 📄 Documento): se abre start y, al elegir una opción, se despliega ese paso
// debajo; así se recorre el flujo como una conversación. `camino` = estados ya abiertos por encima (start, …).

/** Títulos legibles de todos los estados (ver titulosLegibles). */
export function titulosDelFlujo(flujo, titulos = {}) {
    return titulosLegibles(flujo, titulos, arbolDeEstados(flujo).aristas);
}

/**
 * Lo que se muestra de un paso al desplegarlo:
 * { nombre, titulo, tipo, mensaje, explicacion, combinadoCon, opciones: [{ indice, clave, texto, destino,
 *   modo: 'abrir' | 'vuelve' | 'roto' | 'pendiente', tituloDestino, resumenDestino }] }
 *  - 'vuelve': el destino ya está abierto más arriba en el camino (volver al menú, bucles): no se despliega otra vez.
 *  - combinadoCon: si al llegar eligiendo una opción se envía en el mismo mensaje que otro estado (combinaCon).
 */
export function fichaDePaso(flujo, nombre, titulos = {}, camino = [], tituloDe = titulosDelFlujo(flujo, titulos)) {
    const estado = flujo[nombre];
    const titulo = (n) => tituloDe.get(n) || n;
    const resumen = (n) => {
        const destino = flujo[n];
        const tipo = TIPOS[clasificar(destino)];
        const cuantas = Object.keys(destino.options ?? {}).length;
        if (cuantas) return `${tipo} · ${cuantas} opci${cuantas === 1 ? 'ón' : 'ones'}`;
        if (destino.next_state != null) return `${tipo} · luego ${destino.next_state in flujo ? titulo(destino.next_state) : destino.next_state}`;
        return `${tipo} · fin`;
    };

    return {
        nombre,
        titulo: titulo(nombre),
        tipo: clasificar(estado),
        mensaje: estado.message ?? '',
        // sin la frase de todos los menús ("Espera que la persona elija una opción…"): al recorrer no aporta
        explicacion: explicar(flujo, nombre, (n) => titulo(n)).filter((linea) => !linea.startsWith('Espera que la persona elija una opción')),
        combinadoCon: combinaCon(flujo, nombre),
        opciones: salidas(estado).map(({ clave, texto, destino }, indice) => {
            let modo = 'abrir';
            if (destino == null) modo = 'pendiente';
            else if (!(destino in flujo)) modo = 'roto';
            else if (destino === nombre || camino.includes(destino)) modo = 'vuelve';
            return {
                indice, clave, texto, destino, modo,
                tituloDestino: destino in flujo ? titulo(destino) : destino,
                resumenDestino: modo === 'abrir' || modo === 'vuelve' ? resumen(destino) : '',
            };
        }),
    };
}

/**
 * Camino de opciones desde start hasta `nombre` siguiendo el árbol (cada estado cuelga de la primera opción que
 * llega a él): lista de índices de salida, p. ej. [0, 1] = opción 1 de start y luego opción 2. null si no se llega.
 */
export function rutaHasta(flujo, nombre) {
    if (!('start' in flujo) || !(nombre in flujo)) return null;
    const { hijos, aristas } = arbolDeEstados(flujo);
    const padre = new Map([...hijos].flatMap(([p, lista]) => lista.map((h) => [h, p])));
    const ruta = [];
    for (let n = nombre; n !== 'start'; n = padre.get(n)) {
        const p = padre.get(n);
        if (p == null) return null; // no cuelga de start
        ruta.unshift(salidas(flujo[p]).findIndex(({ destino }, i) => destino === n && aristas.has(`${p}#${i}`)));
    }
    return ruta;
}

/** Nombre para leer: el título legible y, entre paréntesis, el identificador (o solo el identificador). */
export function nombreLegible(seccion) {
    return seccion.titulo ? `${seccion.titulo} (${seccion.nombre})` : seccion.nombre;
}

/** Texto de una salida: "1. Sí → §1.2 algo" / "sigue ⇢ §1.3 …" / "↩ §1" … (sin formato). */
export function textoSalida(salida, nombreDe = (n) => n) {
    const quien = salida.clave === null ? 'sigue' : `${salida.clave}. ${salida.texto || '(sin texto)'}`;
    const destino = salida.numeroDestino ? `§${salida.numeroDestino} ${nombreDe(salida.destino)}` : salida.destino;
    switch (salida.modo) {
    case 'pendiente': return `${quien} → (sin conectar)`;
    case 'roto': return `${quien} → ${salida.destino} ⚠ no existe`;
    case 'atras': return `${quien} ↩ ${destino}`;
    case 'referencia': return `${quien} ⇢ ${destino}`;
    default: return `${quien} → ${destino}`;
    }
}

/** El documento en Markdown (para copiar o descargar): resumen, avisos y cada paso con su explicación. */
export function documentoEnMarkdown(flujo, titulos = {}, nombreFlujo = 'Flujo') {
    const { secciones } = armarDocumento(flujo, titulos);
    const resumen = resumirDocumento(secciones, flujo);
    const porNombre = new Map(secciones.map((s) => [s.nombre, s]));
    const nombreDe = (n) => (porNombre.has(n) ? nombreLegible(porNombre.get(n)) : n);
    const lineas = [
        `# ${nombreFlujo}`,
        '',
        `${resumen.total} pasos: ${resumen.menus} menús, ${resumen.pasos} pasos, ${resumen.finales} finales `
            + `(${resumen.especiales} especiales, ${resumen.compartidos} compartidos). `
            + 'Cada paso se describe una vez; ⇢ remite a otra sección y ↩ vuelve atrás.',
    ];
    if (resumen.avisos.length) {
        lineas.push('', `## Avisos (${resumen.avisos.length})`, '', ...resumen.avisos.map((a) => `- ${a.gravedad === 'error' ? '⚠' : '•'} ${a.texto}`));
    }
    let enSinConexion = false;

    lineas.push('', '## Pasos');
    for (const s of secciones) {
        if (s.sinConexion && !enSinConexion) {
            enSinConexion = true;
            lineas.push('', '---', '', '## Sin conexión desde el inicio');
        }
        const sangria = '  '.repeat(s.nivel);
        const usado = s.entradas > 1 ? ` · lo usan ${s.entradas} pasos` : '';
        lineas.push('', `${sangria}- **§${s.numero} ${nombreLegible(s)}** · ${TIPOS[s.tipo]}${usado}`);
        if (s.mensaje) lineas.push(...s.mensaje.split('\n').map((l) => `${sangria}  > ${l}`));
        lineas.push(...s.explicacion.map((e) => `${sangria}  *ℹ ${e}*`));
        for (const salida of s.salidas) lineas.push(`${sangria}  - ${textoSalida(salida, nombreDe)}`);
    }

    return lineas.join('\n') + '\n';
}

export { TIPOS };
