import Drawflow from 'drawflow';
import { Modal, Offcanvas } from 'bootstrap';
import { calcularPosiciones, clasificar, escapar, flujoADrawflow, salidas, tiposDeDibujo, vaHaciaAtras } from './flujo/flujo-a-drawflow.js';
import { conexionesQueCruzan } from './flujo/geometria.js';
import { AVANZADOS, BASICOS, PATRONES_SISTEMA, describirSistema, esEstadoSistema, etiquetaSistema, iconoSistema } from './flujo/estados-sistema.js';
import { ordenarArbol } from './flujo/ordenar.js';
import { iniciar, normalizar as normalizarTexto, responder } from './flujo/simulador.js';
import { TIPOS, armarDocumento, documentoEnMarkdown, fichaDePaso, resumirDocumento, rutaHasta, titulosDelFlujo } from './flujo/documento.js';
import { COMANDOS_DEL_MOTOR, estadoDelDiseno, pareceQuePideDatos } from './flujo/revision.js';
import { EMOJIS, MAXIMO_CARACTERES, envolver, formatearWhatsApp, insertar, marcarLineas, mensajeDelBot } from './flujo/whatsapp.js';
import {
    agregarPasoEspecial, aplicarEdicion, copiarEstados, pegarEstados, conectarYNombrar, contenidoParaGuardar, crearConectado, eliminarEstado, enlazarPareja, fijarDestino,
    esNuevo, identificadorPara, moverEstado, nombrePatron, sincronizarHijos, tituloDe,
    ejemploMensaje, opcionesDe, siguienteClave, sistemaDisponibles,
} from './flujo/modelo.js';

// Página del editor (flujos/edit.blade.php).
// El modelo { flujo, layout } es la fuente de verdad: cada acción lo modifica y se redibuja el lienzo.
const contenedor = document.getElementById('lienzo');

if (contenedor) {
    const { contenido, layout } = JSON.parse(document.getElementById('datos-flujo').textContent);

    // Se fijan desde el inicio las posiciones automáticas, para que las cajas no salten al añadir otras.
    const modelo = {
        flujo: contenido.FLUJO,
        // posiciones de los estados y, aparte, las de sus copias de vista ("copia:origen#i", ver flujo-a-drawflow.js)
        layout: {
            ...Object.fromEntries(Object.entries(layout ?? {}).filter(([clave]) => clave.startsWith('copia:'))),
            ...calcularPosiciones(contenido.FLUJO, layout ?? {}),
        },
        titulos: { ...(contenido._editor?.titulos ?? {}) }, // nombres visibles (fuera de FLUJO)
        nuevos: [...(contenido._editor?.nuevos ?? [])],      // creados aquí y sin publicar: identificador sincronizado
    };
    let nombrePorId = new Map();
    let copiaPorId = new Map(); // cajitas "copia de vista": no son estados (no se editan, borran ni conectan como tales)

    // Interruptor ⧉ Copias (apagado por defecto). Es una preferencia de quien mira: se recuerda en este navegador.
    let mostrarCopias = false;
    try { mostrarCopias = localStorage.getItem('app-bot.copias') === '1'; } catch { /* sin almacenamiento: apagado */ }
    let hayCambios = false;

    const editor = new Drawflow(contenedor);
    editor.start();

    // Conexiones (claves "origen#i") cuya línea pasaría por detrás de otras cajas: se ven como etiqueta ⇢.
    let cruzan = new Set();

    function pintar() {
        const resultado = flujoADrawflow(modelo.flujo, modelo.layout, modelo.titulos, cruzan, { copias: mostrarCopias });
        editor.import(resultado.datos);
        nombrePorId = resultado.nombrePorId;
        copiaPorId = resultado.copiaPorId;
        alinearSalidas();
        return resultado;
    }

    /**
     * Dibuja el lienzo. Para saber qué líneas taparían otras cajas hace falta la página dibujada (posiciones
     * reales de cajas y bolitas): se pinta, se mide y, si cambió, se pinta otra vez (una sola, sin bucles).
     */
    function dibujar() {
        cerrarMenuSalida();
        let resultado = pintar();
        const medidos = medirCruces();
        if (!mismoConjunto(medidos, cruzan)) {
            cruzan = medidos;
            resultado = pintar();
        }

        const { total, alcanzables, sinConexion } = resultado.resumen;
        let texto = `${total} estados · ${alcanzables} alcanzables desde start`;
        if (sinConexion > 0) texto += ` · ${sinConexion} sin conexión`;
        document.getElementById('resumen').textContent = texto;
        pintarDiseno();
        marcarEstadoSimulado(); // al redibujar se crean cajas nuevas: se vuelve a marcar la del simulador
        if (documentoAbierto) pintarDocumento(); // el documento sigue al modelo
        pintarSeleccion(); // las cajas son nuevas: se vuelven a marcar las seleccionadas
    }

    /**
     * Drawflow apila las bolitas de salida en el centro de la caja. Se mueve cada una a la altura de su
     * fila (<li data-salida="i">) y se recalculan sus líneas.
     */
    function alinearSalidas() {
        contenedor.querySelectorAll('.drawflow-node').forEach((nodo) => {
            const bolitas = nodo.querySelectorAll('.outputs .output');
            nodo.querySelectorAll('[data-salida]').forEach((fila, i) => {
                if (bolitas[i]) bolitas[i].style.top = `${fila.offsetTop + fila.offsetHeight / 2 - 10}px`;
            });
            editor.updateConnectionNodes(nodo.id);
        });
    }

    function marcarCambios() {
        hayCambios = true;
        document.getElementById('sin-guardar').classList.remove('d-none');
        document.getElementById('guardado').classList.add('d-none');
    }

    // --- Guardar: envía el modelo tal cual (FLUJO + layout). El servidor actualiza el borrador.
    const botonGuardar = document.getElementById('guardar');

    async function guardar() {
        botonGuardar.disabled = true;
        botonGuardar.textContent = 'Guardando…';
        try {
            const respuesta = await fetch(botonGuardar.dataset.url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
                },
                body: JSON.stringify({ contenido: contenidoParaGuardar(contenido, modelo), layout: modelo.layout }),
            });
            const datos = await respuesta.json().catch(() => ({}));

            if (!respuesta.ok) {
                const detalle = datos.errors ? Object.values(datos.errors).flat()[0] : datos.message;
                avisar(`No se pudo guardar: ${detalle ?? 'error ' + respuesta.status}`);
                return;
            }

            hayCambios = false;
            document.getElementById('sin-guardar').classList.add('d-none');
            const guardado = document.getElementById('guardado');
            guardado.textContent = `✓ Guardado a las ${new Date(datos.guardado_en).toLocaleTimeString()}`;
            guardado.classList.remove('d-none');

            // QA H19: se guarda igual (se puede guardar un flujo a medias), pero se avisa si algo falla en la conversación.
            // La misma lista que los avisos ⚠ del panel 📄 (revisión + opciones sin conectar + pasos sueltos).
            const { avisos: problemas } = resumirDocumento(armarDocumento(modelo.flujo, modelo.titulos).secciones, modelo.flujo);
            if (problemas.length) {
                const uno = problemas.length === 1;
                const graves = problemas.filter((p) => p.gravedad === 'error').length;
                avisar(`Guardado · ${uno ? '1 cosa' : `${problemas.length} cosas`} por revisar${graves ? ' (⛔)' : ''}. Clic para ver.`,
                    'warning', { ms: 8000, alClic: verAvisos });
            }
        } catch {
            avisar('No se pudo guardar: sin conexión.');
        } finally {
            botonGuardar.disabled = false;
            botonGuardar.textContent = 'Guardar';
        }
    }

    botonGuardar.addEventListener('click', guardar);

    // --- ⬇ Exportar: descarga lo GUARDADO (el servidor arma el .json). Si hay cambios, se guarda antes; si no se
    // pudo guardar, no se exporta (el aviso de error ya lo dice). Se exporta aunque haya avisos, pero se dicen.
    const botonExportar = document.getElementById('exportar');
    botonExportar.addEventListener('click', async () => {
        if (hayCambios) {
            await guardar();
            if (hayCambios) return;
        }
        Object.assign(document.createElement('a'), { href: botonExportar.dataset.url, download: botonExportar.dataset.archivo }).click();

        const { avisos } = resumirDocumento(armarDocumento(modelo.flujo, modelo.titulos).secciones, modelo.flujo);
        if (avisos.length) {
            avisar(`Exportado · ${avisos.length === 1 ? '1 cosa' : `${avisos.length} cosas`} por revisar. Clic para ver.`, 'warning', { ms: 8000, alClic: verAvisos });
        } else {
            avisar('Exportado.', 'success');
        }
    });
    document.addEventListener('keydown', (evento) => {
        if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 's') {
            evento.preventDefault(); // que el navegador no abra "Guardar página como"
            if (!botonGuardar.disabled) guardar();
        }
    });

    // Avisar antes de salir de la página si hay cambios sin guardar.
    window.addEventListener('beforeunload', (evento) => {
        if (hayCambios) evento.preventDefault();
    });

    /** Centro de la parte visible del lienzo, en coordenadas de Drawflow (tiene en cuenta zoom y desplazamiento). */
    function centroVisible() {
        return {
            x: (contenedor.clientWidth / 2 - editor.canvas_x) / editor.zoom - 140,
            y: (contenedor.clientHeight / 2 - editor.canvas_y) / editor.zoom - 60,
        };
    }

    // --- Mover: Drawflow ya movió la caja; solo se anota la posición en el modelo.
    // Si al mover una caja alguna conexión pasa de "cerca" a "lejos" (o al revés), se redibuja para cambiar
    // línea ↔ etiqueta. Si no cambia nada, no se redibuja (así no se pierde la caja seleccionada).
    // Drawflow solo escucha "soltar el ratón" dentro del lienzo: si se suelta una caja fuera (sobre la barra,
    // el borde…), el arrastre quedaba pendiente y nodeMoved llegaba tarde y con otra posición. Se le reenvía.
    document.addEventListener('mouseup', (evento) => {
        if (!contenedor.contains(evento.target) && (editor.drag || editor.editor_selected || editor.connection)) editor.dragEnd(evento);
    });

    editor.on('nodeMoved', (id) => {
        const antes = JSON.stringify(tiposDeDibujo(modelo.flujo, modelo.layout, cruzan, { copias: mostrarCopias }));
        // Se lee la posición de la caja en pantalla: Drawflow guarda en sus datos (pos_x/pos_y) la posición
        // con un paso de más (resta el desplazamiento dos veces al mover), y la caja "saltaba" al reabrir.
        guardarGrupo(); // si se movía un grupo, las demás cajas también
        const caja = document.getElementById('node-' + id);
        const copia = copiaPorId.get(String(id));
        if (copia) {
            modelo.layout[copia.clave] = { x: Math.round(parseFloat(caja.style.left)), y: Math.round(parseFloat(caja.style.top)) };
        } else {
            moverEstado(modelo, nombrePorId.get(String(id)), parseFloat(caja.style.left), parseFloat(caja.style.top));
        }
        marcarCambios();
        // Se redibuja solo si alguna conexión pasa de línea a etiqueta o al revés (así no se pierde la selección).
        const medidos = medirCruces();
        if (JSON.stringify(tiposDeDibujo(modelo.flujo, modelo.layout, medidos, { copias: mostrarCopias })) !== antes) {
            cruzan = medidos;
            dibujar();
        }
    });

    /**
     * Mide en la página dibujada qué conexiones hacia adelante pasarían por detrás de otras cajas, usando la
     * misma curva que dibuja Drawflow (geometria.js). Las coordenadas se pasan al sistema del lienzo
     * (sin desplazamiento ni zoom) para que sirvan en cualquier vista.
     */
    function medirCruces() {
        const base = editor.precanvas.getBoundingClientRect();
        const aLienzo = (r) => ({ x: (r.x - base.x) / editor.zoom, y: (r.y - base.y) / editor.zoom,
            ancho: r.width / editor.zoom, alto: r.height / editor.zoom });
        const centro = (el) => { const r = aLienzo(el.getBoundingClientRect()); return { x: r.x + r.ancho / 2, y: r.y + r.alto / 2 }; };

        const nodoDe = new Map([...nombrePorId].map(([id, nombre]) => [nombre, document.getElementById('node-' + id)]));
        const cajas = Object.fromEntries([...nodoDe].map(([nombre, nodo]) => [nombre, aLienzo(nodo.getBoundingClientRect())]));
        for (const [id, { clave }] of copiaPorId) { // las copias también tapan líneas
            const nodo = document.getElementById('node-' + id);
            if (nodo) cajas[clave] = aLienzo(nodo.getBoundingClientRect());
        }

        // Se miden todas las que podrían ser línea (también hacia pasos compartidos): no las que vuelven atrás ni las
        // que van a una copia de vista (⧉ Copias), que ya tienen su propio dibujo.
        const tipos = tiposDeDibujo(modelo.flujo, modelo.layout, new Set(), { copias: mostrarCopias });
        const conexiones = [];
        for (const [nombre, nodo] of nodoDe) {
            const bolitas = nodo.querySelectorAll('.outputs .output');
            salidas(modelo.flujo[nombre]).forEach(({ destino }, i) => {
                if (!nodoDe.has(destino) || destino === nombre || !bolitas[i]) return;
                if (vaHaciaAtras(modelo.layout, nombre, destino) || tipos[nombre]?.[i] === 'copia') return; // ya son etiqueta o copia
                const entrada = nodoDe.get(destino).querySelector('.inputs .input');
                if (entrada) conexiones.push({ clave: `${nombre}#${i}`, origen: nombre, destino, p1: centro(bolitas[i]), p2: centro(entrada) });
            });
        }
        return conexionesQueCruzan(conexiones, cajas);
    }

    const mismoConjunto = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

    // --- Borrar: Drawflow ya quitó la caja; se quita también del modelo. start no se borra:
    // se redibuja desde el modelo y la caja vuelve.
    editor.on('nodeRemoved', (id) => {
        const nombre = nombrePorId.get(String(id));
        lineasQuitadas = []; // las líneas de la caja borrada no se tratan como "desconectar" (ver connectionRemoved)

        const copia = copiaPorId.get(String(id));
        if (copia) { // una copia no se borra: vuelve al redibujar
            avisar(`Es solo una copia de «${tituloDe(modelo, copia.destino)}»: para quitarla, borra su línea.`);
            dibujar();
            return;
        }

        if (eliminarEstado(modelo, nombre)) {
            marcarCambios();
        } else {
            avisar('La Bienvenida no se puede borrar.');
        }

        dibujar();
    });

    // --- Borrar una línea (seleccionarla + Supr): esa salida queda sin conectar en el modelo.
    // Al borrar una caja, Drawflow también emite connectionRemoved por cada línea suya, justo ANTES de nodeRemoved.
    // Por eso se anotan aquí y se procesan un instante después: si mientras tanto llegó nodeRemoved, se descartan.
    let lineasQuitadas = [];

    // Al hacer clic en una línea (SVG) el foco del teclado no llega al lienzo y Drawflow, que escucha Supr
    // solo dentro del lienzo, no la borraba. Se le da el foco al seleccionarla.
    editor.on('connectionSelected', () => contenedor.focus({ preventScroll: true }));

    editor.on('connectionRemoved', ({ output_id, output_class }) => {
        lineasQuitadas.push({ nombre: nombrePorId.get(String(output_id)), indice: Number(output_class.replace('output_', '')) - 1 });
        queueMicrotask(() => {
            if (lineasQuitadas.length === 0) return;
            lineasQuitadas.forEach(({ nombre, indice }) => fijarDestino(modelo, nombre, indice, null));
            lineasQuitadas = [];
            marcarCambios();
            dibujar();
        });
    });

    // --- Clic en una bolita de salida: menú para conectar o crear el siguiente estado.
    // Se escucha en fase de captura y se detiene el evento para que Drawflow no empiece a arrastrar una flecha.
    const menuSalida = document.getElementById('menu-salida');

    // Bolita de salida: clic izquierdo y arrastrar = Drawflow dibuja la línea (connectionCreated la lleva al modelo);
    // clic derecho = menú con las opciones (crear, conectar, quitar). Se escucha en captura para que Drawflow
    // no empiece una línea con el botón derecho ni muestre su propio menú.
    contenedor.addEventListener('mousedown', (evento) => {
        if (evento.button !== 0 && evento.target.closest('.output')) evento.stopPropagation();
    }, true);

    contenedor.addEventListener('contextmenu', (evento) => {
        const bolita = evento.target.closest('.output');
        if (!bolita) return;
        evento.stopPropagation();
        evento.preventDefault();

        const nodo = bolita.closest('.drawflow-node');
        const nombre = nombrePorId.get(nodo.id.replace('node-', ''));
        const indice = [...bolita.parentElement.children].indexOf(bolita);
        abrirMenuSalida(nombre, indice, bolita.getBoundingClientRect());
    }, true);

    /**
     * Conecta una salida con una caja existente (arrastrando o desde el menú). Si la caja es nueva y nadie más
     * llega a ella, toma el nombre de la opción (conectarYNombrar) y se avisa.
     */
    function conectar(origen, indice, destino) {
        const { destino: final, renombrado } = conectarYNombrar(modelo, origen, indice, destino);
        if (renombrado && final !== destino) avisar(`«${destino}» ahora es «${tituloDe(modelo, final)}» (${final})`, 'success');
    }

    // Soltar la línea en cualquier parte de una caja la conecta (no hace falta atinar a su bolita de entrada).
    editor.force_first_input = true;

    // Línea arrastrada y soltada sobre una caja: se anota en el modelo (una salida = un destino; si ya tenía
    // uno, lo reemplaza) y se redibuja cuando Drawflow termina de procesar el soltar (microtarea).
    editor.on('connectionCreated', ({ output_id, input_id, output_class }) => {
        const origen = nombrePorId.get(String(output_id));
        // soltar sobre una copia de vista = conectar con el estado real
        const destino = nombrePorId.get(String(input_id)) ?? copiaPorId.get(String(input_id))?.destino;
        const indice = Number(output_class.replace('output_', '')) - 1;
        queueMicrotask(() => {
            conectar(origen, indice, destino);
            marcarCambios();
            dibujar();
        });
    });

    /**
     * Nombre de un paso para elegirlo en una lista (QA H4/H11): el visible o el del paso especial (🏁 Despedida) y,
     * si es distinto, su código entre paréntesis («Catálogo (catalogo_2)»), para distinguir los de igual nombre.
     */
    function nombreParaElegir(nombre) {
        const legible = modelo.titulos?.[nombre] || (etiquetaSistema(nombre) ? `${iconoSistema(nombre)} ${etiquetaSistema(nombre)}` : '');
        return legible && legible !== nombre ? `${legible} (${nombre})` : nombre;
    }

    /** `despues` (opcional): se llama tras la acción y antes de redibujar (el panel 📄 lo usa para desplegar el paso nuevo). */
    function abrirMenuSalida(nombre, indice, rect, despues = null) {
        const salida = salidas(modelo.flujo[nombre])[indice]; // mismo orden que las bolitas
        const item = (texto, accion, clase = '') => {
            const boton = Object.assign(document.createElement('button'), { type: 'button', className: `dropdown-item ${clase}`, textContent: texto });
            boton.addEventListener('click', () => { accion(); despues?.(); marcarCambios(); dibujar(); });
            return boton;
        };
        const titulo = (texto) => Object.assign(document.createElement('h6'), { className: 'dropdown-header', textContent: texto });
        const separador = () => Object.assign(document.createElement('hr'), { className: 'dropdown-divider' });

        const partes = [
            titulo(salida.clave === null ? `${nombreParaElegir(nombre)} · sigue` : `${nombreParaElegir(nombre)} · opción ${salida.clave}${salida.texto ? ' · ' + salida.texto : ''}`),
            item('+ Nuevo menú', () => crearConectado(modelo, nombre, indice, { tipo: 'menu' })),
            item('+ Nuevo paso', () => crearConectado(modelo, nombre, indice, { tipo: 'paso' })),
            item('+ Nuevo final', () => crearConectado(modelo, nombre, indice, { tipo: 'final' })),
        ];

        const sistema = sistemaDisponibles(modelo.flujo); // solo los básicos que faltan (Fin, Pasar a un asesor)
        if (sistema.length) {
            partes.push(separador(), titulo('Pasos especiales'));
            sistema.forEach((s) => partes.push(item(`${iconoSistema(s)} ${etiquetaSistema(s) ?? s}`, () => crearConectado(modelo, nombre, indice, { sistema: s }))));
        }

        partes.push(separador(), titulo('Conectar con uno existente'));
        Object.keys(modelo.flujo).forEach((destino) => partes.push(
            item(`${nombreParaElegir(destino)}${destino === salida.destino ? ' ✓' : ''}`, () => conectar(nombre, indice, destino)),
        ));

        if (salida.destino != null) {
            partes.push(separador(), item('✕ Quitar conexión', () => fijarDestino(modelo, nombre, indice, null), 'text-danger'));
        }

        menuSalida.replaceChildren(...partes);
        menuSalida.style.left = `${rect.right + 8}px`;
        menuSalida.style.top = `${Math.max(8, Math.min(rect.top - 8, window.innerHeight - 320))}px`;
        menuSalida.classList.add('show');
    }

    function cerrarMenuSalida() {
        menuSalida.classList.remove('show');
    }

    document.addEventListener('mousedown', (evento) => {
        if (!menuSalida.contains(evento.target) && !evento.target.closest('.output')) cerrarMenuSalida();
    });
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape') cerrarMenuSalida();
    });

    // --- Mover la vista del lienzo (mismo formato que usa Drawflow internamente).
    function moverVista(x, y) {
        editor.canvas_x = x;
        editor.canvas_y = y;
        editor.precanvas.style.transform = `translate(${x}px, ${y}px) scale(${editor.zoom})`;
    }

    // --- Zoom. Drawflow amplía respecto a la esquina; aquí se amplía respecto al centro de la vista.
    editor.zoom_min = 0.05; // por defecto 0.5: muy poco para ver entero un flujo grande (PJ mide ~10.000 px de alto)
    const etiquetaZoom = document.getElementById('zoom-nivel');
    const mostrarZoom = () => { etiquetaZoom.textContent = `${Math.round(editor.zoom * 100)}%`; };
    editor.on('zoom', mostrarZoom); // también Ctrl+rueda

    function fijarZoom(zoom, cx = contenedor.clientWidth / 2, cy = contenedor.clientHeight / 2) {
        const nuevo = Math.min(editor.zoom_max, Math.max(editor.zoom_min, Math.round(zoom * 100) / 100));
        // Punto del flujo que está en (cx, cy): debe seguir ahí después de cambiar el zoom.
        const fx = (cx - editor.canvas_x) / editor.zoom;
        const fy = (cy - editor.canvas_y) / editor.zoom;
        editor.zoom = nuevo;
        editor.zoom_last_value = nuevo; // Drawflow lo usa al hacer zoom con la rueda
        moverVista(cx - fx * nuevo, cy - fy * nuevo);
        mostrarZoom();
    }

    /** Encuadra todo el flujo: zoom para que quepa (sin pasar del 100 %) y centrado en la vista. */
    function ajustarVista() {
        const cajas = [...contenedor.querySelectorAll('.drawflow-node')];
        if (!cajas.length) return;
        const izquierda = Math.min(...cajas.map((c) => c.offsetLeft));
        const arriba = Math.min(...cajas.map((c) => c.offsetTop));
        const ancho = Math.max(...cajas.map((c) => c.offsetLeft + c.offsetWidth)) - izquierda;
        const alto = Math.max(...cajas.map((c) => c.offsetTop + c.offsetHeight)) - arriba;
        const margen = 40;

        const zoom = Math.min(1, (contenedor.clientWidth - margen * 2) / ancho, (contenedor.clientHeight - margen * 2) / alto);
        editor.zoom = Math.max(editor.zoom_min, Math.round(zoom * 100) / 100);
        editor.zoom_last_value = editor.zoom;
        moverVista(
            contenedor.clientWidth / 2 - (izquierda + ancho / 2) * editor.zoom,
            contenedor.clientHeight / 2 - (arriba + alto / 2) * editor.zoom,
        );
        mostrarZoom();
    }

    document.getElementById('zoom-mas').addEventListener('click', () => fijarZoom(editor.zoom + 0.1));
    document.getElementById('zoom-menos').addEventListener('click', () => fijarZoom(editor.zoom - 0.1));
    document.getElementById('zoom-nivel').addEventListener('click', () => fijarZoom(1));
    document.getElementById('zoom-ajustar').addEventListener('click', ajustarVista);

    // --- Atajos: clic en la etiqueta ↩/⇥ de una fila → centrar la vista en ese estado y resaltarlo.
    contenedor.addEventListener('click', (evento) => {
        const atajo = evento.target.closest('[data-ir]');
        if (atajo) irA(atajo.dataset.ir);
    });

    function irA(nombre, resaltar = true) {
        const posicion = modelo.layout[nombre];
        const id = [...nombrePorId].find(([, n]) => n === nombre)?.[0];
        if (!posicion || !id) return;

        moverVista(
            contenedor.clientWidth / 2 - (posicion.x + 140) * editor.zoom,
            contenedor.clientHeight / 2 - (posicion.y + 60) * editor.zoom,
        );
        if (!resaltar) return;
        const caja = document.getElementById('node-' + id);
        caja.classList.add('resaltada');
        setTimeout(() => caja.classList.remove('resaltada'), 1500);
    }

    // --- Ordenar: recoloca todo como árbol con la altura real de cada caja (ya dibujada) y centra en start.
    function ordenar() {
        // alto de cada caja y altura de sus bolitas (centro), para alinear las líneas de las cadenas
        const alturas = {};
        const puntos = {};
        const centro = (bolita) => bolita.offsetTop + bolita.offsetHeight / 2;
        contenedor.querySelectorAll('.drawflow-node').forEach((nodo) => {
            const nombre = nombrePorId.get(nodo.id.replace('node-', ''));
            if (!nombre) return; // copias de vista: no son estados
            const entrada = nodo.querySelector('.inputs .input');
            alturas[nombre] = nodo.offsetHeight;
            puntos[nombre] = {
                entrada: entrada ? centro(entrada) : null,
                salidas: [...nodo.querySelectorAll('.outputs .output')].map(centro),
            };
        });

        modelo.layout = ordenarArbol(modelo.flujo, alturas, puntos);
        dibujar();
    }

    // --- ⧉ Copias: muestra u oculta las copias de vista de los estados compartidos (solo cambia el dibujo).
    const botonCopias = document.getElementById('copias');
    function pintarBotonCopias() {
        botonCopias.classList.toggle('active', mostrarCopias);
        botonCopias.setAttribute('aria-pressed', String(mostrarCopias));
    }
    botonCopias.addEventListener('click', () => {
        mostrarCopias = !mostrarCopias;
        try { localStorage.setItem('app-bot.copias', mostrarCopias ? '1' : '0'); } catch { /* sin almacenamiento */ }
        pintarBotonCopias();
        dibujar();
    });
    pintarBotonCopias();

    document.getElementById('ordenar').addEventListener('click', () => {
        ordenar();
        ajustarVista(); // todo el flujo encuadrado y centrado, no pegado a una esquina
        marcarCambios();
    });

    /** Mensaje breve junto a la barra de herramientas (no bloquea como alert). */
    let temporizadorAviso;
    /** Aviso en la barra. `alClic`: qué hacer si se pulsa (p. ej. abrir los avisos del flujo). */
    function avisar(texto, tipo = 'danger', { ms = 4000, alClic = null } = {}) {
        const aviso = document.getElementById('aviso');
        aviso.textContent = texto;
        aviso.className = `badge text-bg-${tipo}${alClic ? ' aviso-clic' : ''}`;
        aviso.onclick = alClic;
        clearTimeout(temporizadorAviso);
        temporizadorAviso = setTimeout(() => aviso.classList.add('d-none'), ms);
    }

    /** Semáforo del diseño: los mismos avisos que el panel 📄 (recorrido, revisión, sin conectar, sueltos). */
    function pintarDiseno() {
        const { avisos } = resumirDocumento(armarDocumento(modelo.flujo, modelo.titulos).secciones, modelo.flujo);
        const estado = estadoDelDiseno(avisos);
        const boton = document.getElementById('diseno');
        boton.textContent = `${estado.icono} ${estado.texto}`;
        boton.className = `badge diseno border-0 diseno-${estado.nivel}`;
        boton.title = estado.detalle + (avisos.length ? ' Clic para ver.' : '');
        boton.onclick = avisos.length ? verAvisos : null;
    }

    /** Abre el panel 📄 con la lista de avisos desplegada. */
    function verAvisos() {
        document.getElementById('aviso').classList.add('d-none');
        if (!documentoAbierto) panelDocumento.show();
        setTimeout(() => { const d = document.querySelector('.nav-avisos'); if (d && d.tagName === 'DETAILS') d.open = true; }, 350);
    }

    // --- Panel "Estados del sistema": los que hay en el flujo (ir, editar, quitar) y los que se pueden añadir.
    const modalSistema = new Modal(document.getElementById('modal-sistema'));
    const formPatron = document.getElementById('form-patron');
    const tipoPatron = document.getElementById('patron-tipo');
    const partePatron = document.getElementById('patron-parte');

    PATRONES_SISTEMA.forEach(({ etiqueta, icono }, i) => tipoPatron.append(new Option(`${icono} ${etiqueta}`, String(i))));

    const boton = (texto, clase, accion, desactivado = false) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: `btn btn-sm ${clase}`, textContent: texto, disabled: desactivado });
        b.addEventListener('click', accion);
        return b;
    };

    /** Fila del panel: icono + nombre amigable (y el código en pequeño), para qué sirve y qué se puede hacer. */
    function filaSistema(nombre) {
        const presente = nombre in modelo.flujo;
        const fila = document.createElement('tr');

        const celdaNombre = Object.assign(document.createElement('td'), { className: 'text-nowrap' });
        celdaNombre.append(
            Object.assign(document.createElement('span'), { className: 'me-1', textContent: iconoSistema(nombre) }),
            Object.assign(document.createElement('strong'), { textContent: etiquetaSistema(nombre) ?? nombre }),
            document.createElement('br'),
            Object.assign(document.createElement('small'), {
                className: 'text-body-secondary font-monospace', textContent: nombre,
                title: 'Código con el que el bot reconoce este paso (no cambia)',
            }),
        );

        const celdaDescripcion = Object.assign(document.createElement('td'), { className: 'small' });
        celdaDescripcion.textContent = describirSistema(nombre) ?? '';

        const celdaBotones = Object.assign(document.createElement('td'), { className: 'text-end text-nowrap' });
        celdaBotones.append(...(presente ? [
            Object.assign(document.createElement('span'), { className: 'badge text-bg-success me-2', textContent: '✓ En tu flujo' }),
            boton('Ver', 'btn-outline-secondary me-1', () => { modalSistema.hide(); irA(nombre); }),
            boton('Editar mensaje', 'btn-outline-primary me-1', () => { modalSistema.hide(); abrirEdicion(nombre); }),
            boton('Quitar', 'btn-outline-danger', () => {
                eliminarEstado(modelo, nombre);
                marcarCambios();
                dibujar();
                llenarPanelSistema();
            }, nombre === 'start'),
        ] : [boton('Añadir al flujo', 'btn-primary', () => agregarSistema(nombre))]));

        fila.append(celdaNombre, celdaDescripcion, celdaBotones);
        return fila;
    }

    /** Rellena el panel a partir del modelo (al abrirlo y tras cada cambio). */
    function llenarPanelSistema() {
        document.getElementById('sistema-basicos').replaceChildren(...BASICOS.map(({ nombre }) => filaSistema(nombre)));
        document.getElementById('sistema-avanzados').replaceChildren(...AVANZADOS.map(filaSistema));

        // Los de patrón (derivar_X, X_pedir_corte…) que ya están en el flujo.
        const fijos = new Set([...BASICOS.map((b) => b.nombre), ...AVANZADOS]);
        const porPatron = Object.keys(modelo.flujo).filter((nombre) => esEstadoSistema(nombre) && !fijos.has(nombre));
        document.getElementById('sistema-patron-presentes').replaceChildren(...porPatron.map(filaSistema));

        // Si el flujo ya usa estados avanzados, la sección se muestra abierta.
        if (AVANZADOS.some((n) => n in modelo.flujo) || porPatron.length) document.getElementById('sistema-avanzado').open = true;

        actualizarPatron();
    }

    /**
     * Añade el paso especial ARMADO (con los que necesita) y lo muestra: se cierra el panel, la vista va a la caja
     * nueva y la resalta, y el aviso queda a la vista (QA H8: antes todo pasaba detrás del panel).
     */
    function agregarSistema(nombre) {
        const creados = agregarPasoEspecial(modelo, nombre, centroVisible());
        enlazarPareja(modelo, nombre); // X_pedir_corte ↔ X_confirmar, si la pareja ya estaba
        marcarCambios();
        dibujar();
        modalSistema.hide();
        irA(nombre);
        const leer = (n) => `«${etiquetaSistema(n) ?? n}»`;
        const con = creados.length > 1 ? ` (con ${creados.slice(1).map(leer).join(', ')})` : '';
        avisar(`${leer(nombre)} añadido${con}. Conéctalo desde una opción.`, 'success');
    }

    // Por patrón: se ve el nombre final mientras se escribe y se valida antes de añadir.
    function actualizarPatron() {
        const patron = PATRONES_SISTEMA[tipoPatron.value];
        const { nombre, error } = nombrePatron(modelo.flujo, patron, partePatron.value);
        const muestra = partePatron.value.trim() ? nombre : `${patron.antes}${patron.ejemplo}${patron.despues}`;
        document.getElementById('patron-ayuda').textContent = `${patron.descripcion} Código: ${muestra}`;
        return { nombre, error };
    }

    tipoPatron.addEventListener('change', () => { partePatron.classList.remove('is-invalid'); actualizarPatron(); });
    partePatron.addEventListener('input', () => {
        const { error } = actualizarPatron();
        partePatron.classList.toggle('is-invalid', Boolean(error) && partePatron.value !== '');
        document.getElementById('patron-error').textContent = error ?? '';
    });

    formPatron.addEventListener('submit', (evento) => {
        evento.preventDefault();
        const { nombre, error } = actualizarPatron();
        if (error) {
            partePatron.classList.add('is-invalid');
            document.getElementById('patron-error').textContent = error;
            partePatron.focus();
            return;
        }
        partePatron.value = '';
        partePatron.classList.remove('is-invalid');
        agregarSistema(nombre);
    });

    document.getElementById('abrir-sistema').addEventListener('click', () => {
        llenarPanelSistema();
        modalSistema.show();
    });

    // --- Editar una caja: doble clic sobre ella o botón ✎ de su cabecera.
    const modalEstado = new Modal(document.getElementById('modal-estado'));
    const formEstado = document.getElementById('form-estado');
    const filasOpciones = document.getElementById('filas-opciones');
    let editando = null;   // nombre del estado abierto en el modal
    // fila <tr> → lo que no se edita en el modal: destino (se conecta con las bolitas) y campos extra (keywords…).
    let ocultoPorFila = new WeakMap();

    function nombreDeCaja(elemento) {
        const nodo = elemento.closest('.drawflow-node');
        return nodo ? nombrePorId.get(nodo.id.replace('node-', '')) : null;
    }

    contenedor.addEventListener('dblclick', (evento) => {
        const nodo = evento.target.closest('.drawflow-node');
        const copia = nodo && copiaPorId.get(nodo.id.replace('node-', ''));
        if (copia) return irA(copia.destino); // la copia no se edita: lleva a la caja real
        const nombre = nombreDeCaja(evento.target);
        if (nombre) abrirEdicion(nombre);
    });

    contenedor.addEventListener('click', (evento) => {
        if (evento.target.closest('[data-editar]')) abrirEdicion(nombreDeCaja(evento.target));
    });

    function agregarFila({ clave, text, next_state, extra }) {
        const fila = document.createElement('tr');
        const celda = (control) => { const td = document.createElement('td'); td.append(control); fila.append(td); };

        const inputClave = Object.assign(document.createElement('input'), { className: 'form-control form-control-sm font-monospace', value: clave });
        const inputTexto = Object.assign(document.createElement('input'), { className: 'form-control form-control-sm', value: text, placeholder: 'Texto de la opción (ej. Consultar mi trámite)' });
        // QA H5: palabras clave (el motor elige la opción si el mensaje contiene una de ellas). Separadas por comas.
        const inputPalabras = Object.assign(document.createElement('input'), {
            className: 'form-control form-control-sm', value: (extra?.keywords ?? []).join(', '),
            placeholder: 'ej. precio, cuánto cuesta', title: 'Separadas por comas',
        });
        const quitar = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn-sm btn-outline-danger', textContent: '×', title: 'Quitar opción' });
        quitar.addEventListener('click', () => { fila.remove(); actualizarVista(); });

        [inputClave, inputTexto, inputPalabras, quitar].forEach(celda);
        ocultoPorFila.set(fila, { next_state: next_state ?? null, extra: extra ?? {} });
        filasOpciones.append(fila);
    }

    function mostrarSeccion(tipo) {
        document.getElementById('seccion-paso').classList.toggle('d-none', tipo !== 'paso');
        document.getElementById('seccion-menu').classList.toggle('d-none', tipo !== 'menu');
    }
    const AYUDA_SECCION_PASO = document.getElementById('seccion-paso').textContent; // se restaura al abrir el modal

    function abrirEdicion(nombre) {
        editando = nombre;
        const estado = modelo.flujo[nombre];
        const tipo = clasificar(estado);
        const sistema = esEstadoSistema(nombre);

        const campoNombre = document.getElementById('estado-nombre');
        const campoTitulo = document.getElementById('estado-titulo');
        // El identificador nunca se escribe a mano. En un estado nuevo (creado aquí y sin publicar) sigue al
        // nombre visible; en los demás (importados, del sistema, ya publicados) queda fijo: el bot lo guarda en
        // cada conversación y cambiarlo dejaría conversaciones en curso apuntando a un estado que ya no existe.
        campoNombre.value = nombre;
        campoTitulo.value = modelo.titulos[nombre] ?? '';
        campoTitulo.placeholder = nombre;
        sincronizarIdentificador = esNuevo(modelo, nombre);
        document.getElementById('estado-nombre-ayuda').textContent = sistema
            ? 'Paso especial: no cambia.'
            : sincronizarIdentificador
                ? 'Se ajusta solo al nombre visible.'
                : 'Fijo: cambiarlo rompería chats en curso.';
        const campoMensaje = document.getElementById('estado-mensaje');
        campoMensaje.value = estado.message ?? '';
        campoMensaje.placeholder = ejemploMensaje(nombre, tipo);
        document.getElementById('mensaje-ayuda').textContent = /_pedir_corte$|^seleccionar_departamento$/.test(nombre)
            ? 'No borres {{departamentos}}: ahí va la lista.'
            : 'Selecciona texto y elige un formato.';
        document.getElementById('tipo-' + tipo).checked = true;
        // Para los avisos del modal: cómo era al abrirlo (menú con N opciones conectadas) y sin destino elegido aún.
        tipoOriginal = tipo;
        conectadasOriginal = salidas(estado).filter((s) => s.clave !== null && s.destino != null).length;
        siguienteElegido = null;
        document.getElementById('seccion-paso').textContent = AYUDA_SECCION_PASO;

        // Las filas se cargan aunque el tipo no sea menú: si cambias a "menú" mientras el modal está abierto, aparecen.
        filasOpciones.replaceChildren();
        ocultoPorFila = new WeakMap();
        const filas = opcionesDe(estado);
        (filas.length ? filas : [{ clave: '1', text: '', next_state: null, extra: {} }]).forEach(agregarFila);

        mostrarSeccion(tipo);
        limpiarErrores();
        actualizarVista();
        modalEstado.show();
    }

    // Estado nuevo: al escribir el nombre visible, el identificador se recalcula (slug, sin chocar con otros).
    let sincronizarIdentificador = false;
    let tipoOriginal = null;        // tipo del estado al abrir el modal
    let conectadasOriginal = 0;     // opciones conectadas al abrir el modal (para avisar si se quitarán)
    let siguienteElegido = null;    // «Cerrar con la Despedida»: destino de «sigue» elegido desde el aviso
    document.getElementById('estado-titulo').addEventListener('input', (evento) => {
        if (!sincronizarIdentificador) return;
        document.getElementById('estado-nombre').value = identificadorPara(modelo.flujo, evento.target.value, editando) || editando;
    });

    // --- Errores del modal: se marcan en rojo en el campo que está mal, con el mensaje debajo.
    function limpiarErrores() {
        formEstado.querySelectorAll('.is-invalid').forEach((campo) => campo.classList.remove('is-invalid'));
        document.getElementById('opciones-error').classList.add('d-none');
        document.getElementById('estado-error').classList.add('d-none');
    }

    function mostrarError({ campo, indice, mensaje }) {
        limpiarErrores();
        let foco = null;

        if (campo === 'nombre') {
            foco = document.getElementById('estado-nombre');
            document.getElementById('estado-nombre-error').textContent = mensaje;
        } else if (campo === 'opciones' || campo === 'clave' || campo === 'texto') {
            const aviso = document.getElementById('opciones-error');
            aviso.textContent = mensaje;
            aviso.classList.remove('d-none');
            const fila = filasOpciones.querySelectorAll('tr')[indice];
            foco = campo === 'clave' ? fila?.querySelector('input') : campo === 'texto' ? fila?.querySelectorAll('input')[1] : null;
        } else if (campo === 'mensaje') {
            const caja = document.getElementById('estado-error');
            caja.textContent = mensaje;
            caja.classList.remove('d-none');
            foco = document.getElementById('estado-mensaje');
        } else {
            const caja = document.getElementById('estado-error');
            caja.textContent = mensaje;
            caja.classList.remove('d-none');
        }

        if (foco) {
            foco.classList.add('is-invalid');
            foco.focus();
        }
    }


    // Al corregir una clave marcada en rojo, se quita la marca.
    filasOpciones.addEventListener('input', (evento) => {
        evento.target.classList.remove('is-invalid');
        document.getElementById('opciones-error').classList.add('d-none');
        actualizarVista();
    });

    formEstado.addEventListener('change', (evento) => {
        if (evento.target.name === 'estado-tipo') {
            mostrarSeccion(evento.target.value);
            actualizarVista();
        }
    });

    // --- Mensaje para WhatsApp: barra de formato, emojis, vista previa y contador.
    const campoMensaje = document.getElementById('estado-mensaje');

    /** Aplica un cambio ({ texto, inicio, fin }) al cuadro del mensaje, deja la selección y refresca la vista. */
    function aplicarAlMensaje({ texto, inicio, fin }) {
        campoMensaje.value = texto;
        campoMensaje.focus();
        campoMensaje.setSelectionRange(inicio, fin);
        actualizarVista();
    }

    formEstado.querySelectorAll('[data-formato]').forEach((b) => b.addEventListener('click', () => {
        aplicarAlMensaje(envolver(campoMensaje.value, campoMensaje.selectionStart, campoMensaje.selectionEnd, b.dataset.formato));
    }));
    formEstado.querySelectorAll('[data-lineas]').forEach((b) => b.addEventListener('click', () => {
        aplicarAlMensaje(marcarLineas(campoMensaje.value, campoMensaje.selectionStart, campoMensaje.selectionEnd, b.dataset.lineas));
    }));

    // Selector de emojis por grupos; el emoji se inserta donde estaba el cursor.
    const selectorEmojis = document.getElementById('selector-emojis');
    for (const [grupo, emojis] of Object.entries(EMOJIS)) {
        selectorEmojis.append(Object.assign(document.createElement('div'), { className: 'selector-emojis-grupo', textContent: grupo }));
        const fila = Object.assign(document.createElement('div'), { className: 'selector-emojis-fila' });
        emojis.forEach((emoji) => {
            const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn-light btn-sm', textContent: emoji, title: 'Insertar ' + emoji });
            b.addEventListener('click', () => aplicarAlMensaje(insertar(campoMensaje.value, campoMensaje.selectionStart, campoMensaje.selectionEnd, emoji)));
            fila.append(b);
        });
        selectorEmojis.append(fila);
    }

    /** Vista previa: el mensaje (y el menú, si es menú) tal como lo enviará el bot, con el formato de WhatsApp. */
    function actualizarVista() {
        const tipo = formEstado.querySelector('[name="estado-tipo"]:checked')?.value;
        const opciones = tipo === 'menu'
            ? [...filasOpciones.querySelectorAll('tr')].map((fila) => {
                const [clave, texto] = fila.querySelectorAll('input');
                return { clave: clave.value, text: texto.value };
            })
            : [];
        const texto = mensajeDelBot(campoMensaje.value, opciones);

        const vista = document.getElementById('vista-previa');
        if (texto.trim()) vista.innerHTML = formatearWhatsApp(texto);
        else vista.innerHTML = '<span class="caja-vacio">(El mensaje está vacío)</span>';

        const contador = document.getElementById('mensaje-contador');
        contador.textContent = `${texto.length} / ${MAXIMO_CARACTERES}`;
        contador.classList.toggle('text-danger', texto.length > MAXIMO_CARACTERES);
        pintarAvisosDelModal(tipo);
    }

    /**
     * Avisos del modal (no impiden aplicar): lo que hará que la conversación falle o que se pierda trabajo.
     * Las mismas reglas que la revisión del flujo (revision.js), dichas mientras se edita.
     */
    function pintarAvisosDelModal(tipo) {
        const caja = document.getElementById('estado-avisos');
        const avisos = [];
        const mensaje = campoMensaje.value;
        const siguiente = siguienteElegido ?? modelo.flujo[editando]?.next_state ?? null;

        if (!mensaje.trim()) avisos.push('El mensaje está vacío.');

        // H18: cambiar un menú a otro tipo quita sus opciones (y sus conexiones) al aplicar.
        if (tipoOriginal === 'menu' && tipo !== 'menu') {
            const n = filasOpciones.querySelectorAll('tr').length;
            const c = conectadasOriginal;
            avisos.push(`Al aplicar se quita${n === 1 ? ' la opción' : `n las ${n} opciones`}${c ? ` y ${c === 1 ? 'su conexión' : `sus ${c} conexiones`}` : ''} de este menú.`);
        }

        // H13: sin salida, el bot no responde nunca más (salvo la Despedida, el cierre de encuesta y la espera de asesor).
        const sinSalidaPermitida = editando === 'end' || editando === 'encuesta_fin' || editando.startsWith('esperando_agente');
        if (tipo === 'final' && !sinSalidaPermitida) {
            avisos.push('Aquí el bot deja de responder. '
                + '<button type="button" class="btn btn-sm btn-warning py-0" data-cerrar-despedida>Cerrar con la Despedida</button>');
        }

        // H1: un paso no espera respuesta (se envía junto con el siguiente).
        if (tipo === 'paso' && pareceQuePideDatos(mensaje) && siguiente !== 'mas_informacion' && !String(siguiente ?? '').endsWith('_pedir_corte')) {
            avisos.push('Pides que escriba algo, pero aquí el bot no espera respuesta: mejor usa un menú.');
        }

        // H12: palabras que el bot usa como comando (si llevan a otro sitio que la opción).
        if (tipo === 'menu') {
            for (const fila of filasOpciones.querySelectorAll('tr')) {
                const [clave, texto] = fila.querySelectorAll('input');
                const destino = ocultoPorFila.get(fila)?.next_state;
                for (const palabra of new Set([normalizarTexto(clave.value), normalizarTexto(texto.value)])) {
                    const va = COMANDOS_DEL_MOTOR[palabra];
                    if (va && destino !== va) {
                        avisos.push(`«${escapar(palabra)}» es un comando del bot: esta opción nunca se elegirá.`);
                    }
                }
            }
        }

        caja.innerHTML = avisos.map((a) => `<div>⚠ ${a}</div>`).join('');
        caja.classList.toggle('d-none', avisos.length === 0);
    }

    campoMensaje.addEventListener('input', actualizarVista);

    // «Cerrar con la Despedida» (aviso de un final que dejaría al bot mudo): pasa a «Continuar» y conecta con `end`.
    document.getElementById('estado-avisos').addEventListener('click', (evento) => {
        if (!evento.target.closest('[data-cerrar-despedida]')) return;
        siguienteElegido = 'end';
        document.getElementById('tipo-paso').checked = true;
        mostrarSeccion('paso');
        document.getElementById('seccion-paso').textContent = 'Al aplicar, quedará conectado a la Despedida.';
        actualizarVista();
    });

    document.getElementById('agregar-opcion').addEventListener('click', () => {
        const claves = [...filasOpciones.querySelectorAll('tr')].map((fila) => fila.querySelector('input').value.trim());
        agregarFila({ clave: siguienteClave(claves), text: '', next_state: null, extra: {} });
        filasOpciones.lastElementChild.querySelectorAll('input')[1].focus();
        actualizarVista();
    });

    formEstado.addEventListener('submit', (evento) => {
        evento.preventDefault();

        const antes = salidas(modelo.flujo[editando]); // para saber qué opciones cambiaron de texto
        const nombreFinal = document.getElementById('estado-nombre').value;
        // «Cerrar con la Despedida» (aviso del modal): si no hay Despedida, se añade armada.
        if (siguienteElegido === 'end' && !('end' in modelo.flujo)) {
            const lugar = modelo.layout[editando] ?? { x: 0, y: 0 };
            agregarPasoEspecial(modelo, 'end', { x: lugar.x + 340, y: lugar.y });
        }
        const error = aplicarEdicion(modelo, editando, {
            nombre: nombreFinal, // calculado: solo cambia en estados nuevos
            titulo: document.getElementById('estado-titulo').value,
            message: document.getElementById('estado-mensaje').value,
            tipo: formEstado.querySelector('[name="estado-tipo"]:checked').value,
            // el destino de "sigue" se conecta en el lienzo; aquí solo cambia con «Cerrar con la Despedida»
            next_state: siguienteElegido ?? modelo.flujo[editando].next_state ?? null,
            opciones: [...filasOpciones.querySelectorAll('tr')].map((fila) => {
                const [clave, texto, palabras] = fila.querySelectorAll('input');
                const { next_state, extra } = ocultoPorFila.get(fila);
                const otros = { ...extra };
                delete otros.keywords;
                const lista = palabras.value.split(',').map((p) => p.trim()).filter(Boolean);
                return { clave: clave.value, text: texto.value, next_state, extra: lista.length ? { ...otros, keywords: lista } : otros };
            }),
        });

        if (error) {
            mostrarError(error);
            return;
        }

        // Si cambió el texto de una opción, su caja hija (nueva, no renombrada a mano) toma el nombre nuevo.
        const renombrados = sincronizarHijos(modelo, nombreFinal, antes);
        if (renombrados.length) {
            avisar(renombrados.map(({ de, a }) => `«${de}» ahora es «${tituloDe(modelo, a)}» (${a})`).join(' · '), 'success');
        }

        modalEstado.hide();
        marcarCambios();
        dibujar();
    });

    // --- Probar: simulador de la conversación. Usa modelo.flujo tal como está (con cambios sin guardar).
    const panelSimulador = new Offcanvas(document.getElementById('simulador'));
    const chat = document.getElementById('simulador-chat');
    const botonEstado = document.getElementById('simulador-estado');
    const opcionesRapidas = document.getElementById('simulador-opciones');
    const campoTexto = document.getElementById('simulador-texto');
    let estadoSimulado = 'start';
    let simuladorAbierto = false;

    /** Marca fija (verde, con brillo) en la caja del estado actual mientras el panel está abierto. */
    function marcarEstadoSimulado() {
        contenedor.querySelectorAll('.drawflow-node.en-simulacion').forEach((caja) => caja.classList.remove('en-simulacion'));
        if (!simuladorAbierto) return;
        const id = [...nombrePorId].find(([, nombre]) => nombre === estadoSimulado)?.[0];
        if (id) document.getElementById('node-' + id)?.classList.add('en-simulacion');
    }

    function agregarAlChat(clase, html) {
        const div = document.createElement('div');
        div.className = clase;
        div.innerHTML = html;
        chat.append(div);
    }

    /** Muestra lo que respondió el bot, actualiza el estado actual y resalta su caja en el lienzo. */
    function mostrarRespuesta({ estado, mensajes }) {
        estadoSimulado = estado;
        for (const { texto, nota } of mensajes) {
            agregarAlChat('vista-whatsapp-burbuja', formatearWhatsApp(texto.trimEnd()));
            if (nota) agregarAlChat('sim-nota', `&#9432; ${formatearWhatsApp(nota)}`);
        }
        if (mensajes.length === 0) agregarAlChat('sim-aviso', 'El bot no responde en este estado.');

        const enFlujo = estado in modelo.flujo;
        botonEstado.textContent = enFlujo ? `${tituloDe(modelo, estado)} (${estado})` : `${estado} (del sistema)`;
        botonEstado.disabled = !enFlujo;
        opcionesRapidas.replaceChildren(...Object.entries(modelo.flujo[estado]?.options ?? {}).map(([clave, opcion]) => {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'btn btn-sm btn-outline-secondary text-truncate';
            boton.style.maxWidth = '100%';
            boton.textContent = `${clave}. ${opcion.text ?? ''}`;
            boton.addEventListener('click', () => enviarAlBot(clave));
            return boton;
        }));
        marcarEstadoSimulado();
        if (enFlujo) irA(estado, false);
        if (enFlujo && documentoAbierto) verEnDocumento(estado); // con el 📄 Documento abierto, también ahí
        chat.scrollTop = chat.scrollHeight;
    }

    function enviarAlBot(texto) {
        if (!String(texto).trim()) return;
        agregarAlChat('vista-whatsapp-burbuja sim-persona', formatearWhatsApp(String(texto)));
        mostrarRespuesta(responder(modelo.flujo, estadoSimulado, texto));
    }

    function reiniciarSimulador() {
        chat.replaceChildren();
        agregarAlChat('sim-aviso', 'La persona escribe por primera vez');
        mostrarRespuesta(iniciar(modelo.flujo));
    }

    document.getElementById('probar').addEventListener('click', () => {
        if (chat.childElementCount === 0) reiniciarSimulador();
        panelSimulador.show();
    });
    document.getElementById('simulador').addEventListener('show.bs.offcanvas', () => {
        simuladorAbierto = true;
        marcarEstadoSimulado();
    });
    document.getElementById('simulador').addEventListener('shown.bs.offcanvas', () => campoTexto.focus());
    document.getElementById('simulador').addEventListener('hidden.bs.offcanvas', () => {
        simuladorAbierto = false;
        marcarEstadoSimulado(); // al cerrar el panel se quita la marca
    });
    document.getElementById('simulador-reiniciar').addEventListener('click', reiniciarSimulador);
    botonEstado.addEventListener('click', () => irA(estadoSimulado));
    document.getElementById('simulador-form').addEventListener('submit', (evento) => {
        evento.preventDefault();
        enviarAlBot(campoTexto.value);
        campoTexto.value = '';
        campoTexto.focus();
    });

    // --- 📄 Documento: recorrer el flujo paso a paso (documento.js). Se abre start; cada opción se despliega debajo.
    // Se repinta en cada dibujar() si está abierto (el panel siempre coincide con el modelo).
    const panelDocumento = new Offcanvas(document.getElementById('documento'));
    const contenidoDocumento = document.getElementById('documento-contenido');
    const nombreDelFlujo = document.querySelector('h1')?.textContent.trim() || 'Flujo';
    let documentoAbierto = false;

    const barraDocumento = document.getElementById('documento-barra');
    // Navegación: `elegidas[k]` = índice de la opción abierta en el paso del nivel k (start = nivel 0).
    // Un solo camino abierto: abrir otra opción del mismo nivel cierra la anterior (y todo lo que tenía dentro).
    let elegidas = [];
    let recienAbierta = null; // { nivel, indice } de la opción que se acaba de abrir: su paso entra con animación

    /** Estados del camino abierto: ['start', destino de la opción abierta en start, …]. Se corta si algo cambió. */
    function caminoAbierto() {
        const camino = ['start'];
        for (let k = 0; k < elegidas.length; k++) {
            const salida = salidas(modelo.flujo[camino[k]] ?? {})[elegidas[k]];
            if (!salida || !(salida.destino in modelo.flujo) || camino.includes(salida.destino)) {
                elegidas.length = k;
                break;
            }
            camino.push(salida.destino);
        }
        return camino;
    }

    function pintarDocumento() {
        if (!('start' in modelo.flujo)) {
            barraDocumento.replaceChildren();
            contenidoDocumento.innerHTML = '<p class="text-body-secondary">Falta la Bienvenida (start).</p>';
            return;
        }
        const tituloDe = titulosDelFlujo(modelo.flujo, modelo.titulos);
        const titulo = (n) => tituloDe.get(n) || n;
        const camino = caminoAbierto();
        const { avisos } = resumirDocumento(armarDocumento(modelo.flujo, modelo.titulos).secciones, modelo.flujo);

        // Arriba: la ruta abierta (clic = cerrar hasta ahí) y los avisos.
        barraDocumento.innerHTML = '<nav class="nav-migas" aria-label="Camino abierto">'
            + camino.map((n, k) => `<button type="button" data-nav-nivel="${k}" title="Cerrar hasta aquí">${k === 0 ? '&#8962; ' : ''}${escapar(titulo(n))}</button>`).join('<span>&rsaquo;</span>')
            + '</nav>'
            + (avisos.length
                ? `<details class="nav-avisos"><summary>&#9888; ${avisos.length}</summary><ul>`
                    + avisos.map((a) => `<li class="${a.gravedad === 'error' ? 'text-danger' : ''}"><a href="#" data-doc-ver="${escapar(a.nombre)}">${escapar(a.texto)}</a></li>`).join('')
                    + '</ul></details>'
                : '<span class="nav-avisos text-success" title="Todo conectado">&#10003;</span>');

        // Una tarjeta por paso abierto; la de cada opción abierta va dentro de su fila (desplegable).
        const tarjeta = (nombre, nivel, entra = false) => {
            const ficha = fichaDePaso(modelo.flujo, nombre, modelo.titulos, camino.slice(0, nivel), tituloDe);
            let html = `<div class="nav-paso tipo-${ficha.tipo}${entra ? ' nav-entra' : ''}" data-nav-paso="${escapar(nombre)}">`
                + '<div class="nav-cabecera">'
                + `<button type="button" class="nav-titulo" data-doc-ver="${escapar(nombre)}" title="Ver su caja en el lienzo">${escapar(ficha.titulo)}</button>`
                + `<span class="nav-id">${escapar(nombre)}</span><span class="nav-tipo">${TIPOS[ficha.tipo]}</span>`
                + `<button type="button" class="nav-editar" data-nav-editar="${escapar(nombre)}" title="Editar este paso">&#9998;</button></div>`
                + (ficha.mensaje
                    ? `<div class="nav-burbuja" title="Clic: ver todo / recortar">${formatearWhatsApp(ficha.mensaje)}</div>`
                    : '<div class="nav-burbuja caja-vacio">(sin mensaje)</div>')
                + ficha.explicacion.map((e) => `<div class="nav-explicacion">&#8505; ${escapar(e)}</div>`).join('');

            if (ficha.opciones.length) html += '<ul class="nav-opciones">';
            for (const o of ficha.opciones) {
                const abierta = o.modo === 'abrir' && elegidas[nivel] === o.indice;
                const quien = o.clave === null
                    ? `<em>${ficha.combinadoCon === o.destino ? 'se envía junto con' : 'sigue'}</em>`
                    : `<span class="nav-clave">${escapar(o.clave)}</span> ${escapar(o.texto || '(sin texto)')}`;
                let detalle;
                if (o.modo === 'pendiente') detalle = '<span class="text-warning-emphasis">sin conectar · clic para crear</span>';
                else if (o.modo === 'roto') detalle = `<span class="text-danger">&#9888; «${escapar(o.destino)}» no existe · clic para conectar</span>`;
                else if (o.modo === 'vuelve') detalle = `vuelve a ${escapar(o.tituloDestino)}`;
                else if (o.tituloDestino === o.texto) detalle = escapar(o.resumenDestino); // el título es el texto de la opción: no repetirlo
                else detalle = `${escapar(o.tituloDestino)} · ${escapar(o.resumenDestino)}`;
                // Señales para quien no conoce el panel: viñeta (› que gira al abrir) y la acción escrita a la derecha.
                const vineta = { abrir: '&rsaquo;', vuelve: '&#8617;', roto: '!', pendiente: '+' }[o.modo];
                const accion = { abrir: abierta ? 'Ocultar' : 'Ver', vuelve: 'Ir &#8617;', roto: 'Conectar', pendiente: '+ Crear' }[o.modo];
                const ayuda = { abrir: abierta ? 'Ocultar' : 'Ver este paso', vuelve: 'Subir a ese paso', roto: 'Conectar', pendiente: 'Crear el siguiente paso' }[o.modo];
                const datos = `data-nav-nivel-opcion="${nivel}" data-nav-indice="${o.indice}" data-nav-modo="${o.modo}" data-nav-destino="${escapar(o.destino ?? '')}"`;
                const entra = abierta && recienAbierta?.nivel === nivel && recienAbierta?.indice === o.indice;

                html += `<li class="${abierta ? 'abierta' : ''}">`
                    + `<div class="nav-fila"><button type="button" class="nav-opcion modo-${o.modo}" ${datos} title="${ayuda}"`
                    + `${o.modo === 'abrir' ? ` aria-expanded="${abierta}"` : ''}>`
                    + `<span class="nav-vineta" aria-hidden="true">${vineta}</span>`
                    + `<span class="nav-texto"><span>${quien}</span><small>${detalle}</small></span>`
                    + `<span class="nav-accion">${accion}</span></button>`
                    // ⋯ = el menú de la bolita (crear el siguiente paso, conectar con otro, quitar la conexión)
                    + `<button type="button" class="nav-mas" ${datos.replace('data-nav-nivel-opcion', 'data-nav-menu data-nav-nivel-opcion')} `
                    + 'title="Más opciones">&#8943;</button></div>'
                    + (abierta ? tarjeta(o.destino, nivel + 1, entra) : '')
                    + '</li>';
            }
            if (ficha.opciones.length) html += '</ul>';
            return html + '</div>';
        };
        contenidoDocumento.innerHTML = tarjeta('start', 0);
        recienAbierta = null; // la animación de entrada solo la primera vez que se abre
    }

    /** Deja a la vista la tarjeta del paso (la más profunda abierta con ese nombre) y la resalta un momento. */
    function enfocarTarjeta(nombre) {
        const tarjetas = contenidoDocumento.querySelectorAll(`[data-nav-paso="${CSS.escape(nombre)}"]`);
        const tarjeta = tarjetas[tarjetas.length - 1];
        if (!tarjeta) return;
        tarjeta.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        tarjeta.classList.add('resaltada');
        setTimeout(() => tarjeta.classList.remove('resaltada'), 1200);
    }

    /** Abre el camino hasta ese paso (siguiendo el árbol) y lo enfoca. Lo usan los avisos y el simulador. */
    function verEnDocumento(nombre) {
        const ruta = rutaHasta(modelo.flujo, nombre);
        if (ruta) {
            elegidas = ruta;
            pintarDocumento();
            enfocarTarjeta(nombre);
        }
    }

    contenidoDocumento.addEventListener('click', (evento) => {
        const opcion = evento.target.closest('.nav-opcion'); // la fila de una opción (el ⋯ se mira aparte)
        const burbuja = evento.target.closest('.nav-burbuja');
        if (burbuja && !evento.target.closest('a')) return burbuja.classList.toggle('completo'); // mensaje largo: ver todo
        const editar = evento.target.closest('[data-nav-editar]');
        const ver = evento.target.closest('[data-doc-ver]');
        if (editar) return abrirEdicion(editar.dataset.navEditar);
        if (ver) {
            evento.preventDefault();
            enfocarTarjeta(ver.dataset.docVer);
            return irA(ver.dataset.docVer);
        }
        const masOpciones = evento.target.closest('[data-nav-menu]');
        if (!opcion && !masOpciones) return;

        const boton = opcion ?? masOpciones;
        const nivel = Number(boton.dataset.navNivelOpcion);
        const indice = Number(boton.dataset.navIndice);
        const destino = boton.dataset.navDestino;
        const camino = caminoAbierto();

        // Igual que la bolita del lienzo: ⋯ (o una opción sin conectar / rota) abre su menú para crear el siguiente
        // paso o conectarla. Al terminar, si la opción quedó conectada, se despliega su paso para seguir construyendo.
        if (masOpciones || boton.dataset.navModo === 'pendiente' || boton.dataset.navModo === 'roto') {
            const origen = camino[nivel];
            abrirMenuSalida(origen, indice, boton.getBoundingClientRect(), () => {
                const nuevo = salidas(modelo.flujo[origen])[indice]?.destino;
                if (nuevo in modelo.flujo) {
                    elegidas = [...elegidas.slice(0, nivel), indice];
                    recienAbierta = { nivel, indice };
                }
                else if (elegidas[nivel] === indice) elegidas.length = nivel;
            });
            return;
        }

        if (boton.dataset.navModo === 'vuelve') {
            elegidas.length = camino.indexOf(destino); // se achica hasta ese paso
        } else if (elegidas[nivel] === indice && elegidas.length > nivel) {
            elegidas.length = nivel; // clic en la opción abierta: se achica
            pintarDocumento();
            return irA(camino[nivel]);
        } else {
            elegidas = [...elegidas.slice(0, nivel), indice]; // se despliega (y se cierra la otra del mismo nivel)
            recienAbierta = { nivel, indice };
        }
        pintarDocumento();
        enfocarTarjeta(destino);
        irA(destino);
    });

    barraDocumento.addEventListener('click', (evento) => {
        const miga = evento.target.closest('[data-nav-nivel]');
        const ver = evento.target.closest('[data-doc-ver]');
        if (miga) {
            const k = Number(miga.dataset.navNivel);
            const camino = caminoAbierto();
            elegidas.length = k;
            pintarDocumento();
            enfocarTarjeta(camino[k]);
            irA(camino[k]);
        } else if (ver) {
            evento.preventDefault();
            verEnDocumento(ver.dataset.docVer);
            irA(ver.dataset.docVer);
        }
    });

    document.getElementById('documento-abrir').addEventListener('click', () => panelDocumento.toggle());
    document.getElementById('documento').addEventListener('show.bs.offcanvas', () => {
        documentoAbierto = true;
        pintarDocumento();
    });
    document.getElementById('documento').addEventListener('hidden.bs.offcanvas', () => { documentoAbierto = false; });

    const markdown = () => documentoEnMarkdown(modelo.flujo, modelo.titulos, nombreDelFlujo);
    document.getElementById('documento-copiar').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(markdown());
            avisar('Copiado.', 'success');
        } catch {
            avisar('No se pudo copiar: usa «Descargar».');
        }
    });
    document.getElementById('documento-descargar').addEventListener('click', () => {
        const archivo = new Blob([markdown()], { type: 'text/markdown;charset=utf-8' });
        const nombreArchivo = nombreDelFlujo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
        const enlace = Object.assign(document.createElement('a'), { href: URL.createObjectURL(archivo), download: `${nombreArchivo}.md` });
        enlace.click();
        URL.revokeObjectURL(enlace.href);
    });

    // --- Selección múltiple. Un botón elige qué hace arrastrar el fondo: «✋ Mover» (por defecto, lo hace Drawflow) o
    // «⬚ Seleccionar» (rectángulo azul). La rueda apretada mueve siempre. Las seleccionadas se mueven juntas, Supr las
    // borra y Ctrl+C / Ctrl+V las copia (también a otro flujo). Se escucha en captura para adelantarse a Drawflow.
    const marco = document.querySelector('.lienzo');
    const rectangulo = Object.assign(document.createElement('div'), { className: 'seleccion-rectangulo d-none' });
    marco.append(rectangulo);
    let seleccion = new Set();   // nombres de los estados seleccionados (las copias de vista no se seleccionan)
    let arrastreRect = null;     // { x0, y0 }: inicio del rectángulo, relativo al marco
    let paneo = null;            // arrastre con la rueda apretada: { x, y, cx, cy }
    let grupo = null;            // arrastre de una caja seleccionada: { nodo, x0, y0, otros: [{ caja, x, y }] }
    let modo = 'mover';          // qué hace arrastrar el fondo: 'mover' | 'seleccionar'

    function fijarModo(nuevo) {
        modo = nuevo;
        document.querySelectorAll('[data-modo]').forEach((b) => {
            b.classList.toggle('active', b.dataset.modo === modo);
            b.setAttribute('aria-pressed', String(b.dataset.modo === modo));
        });
        marco.classList.toggle('modo-seleccionar', modo === 'seleccionar');
    }
    document.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => fijarModo(b.dataset.modo)));

    const esFondo = (el) => el === contenedor || el === editor.precanvas;
    const cajaDe = (nombre) => {
        const id = [...nombrePorId].find(([, n]) => n === nombre)?.[0];
        return id ? document.getElementById('node-' + id) : null;
    };

    /** Marca en azul las seleccionadas (tras cada dibujo las cajas son nuevas). Quita las que ya no existen. */
    function pintarSeleccion() {
        contenedor.querySelectorAll('.drawflow-node.en-seleccion').forEach((c) => c.classList.remove('en-seleccion'));
        for (const nombre of [...seleccion]) {
            const caja = cajaDe(nombre);
            if (caja) caja.classList.add('en-seleccion');
            else seleccion.delete(nombre);
        }
    }

    function fijarSeleccion(nombres) {
        seleccion = new Set(nombres);
        pintarSeleccion();
    }

    /** Como hace Drawflow al pulsar el fondo: nada queda seleccionado. */
    function quitarSeleccionDeDrawflow() {
        if (editor.node_selected) {
            editor.node_selected.classList.remove('selected');
            editor.node_selected = null;
            editor.dispatch('nodeUnselected', true);
        }
        if (editor.connection_selected) {
            editor.connection_selected.classList.remove('selected');
            editor.connection_selected = null;
        }
    }

    contenedor.addEventListener('mousedown', (evento) => {
        // Rueda apretada: mover el lienzo.
        if (evento.button === 1) {
            evento.preventDefault();
            evento.stopImmediatePropagation();
            paneo = { x: evento.clientX, y: evento.clientY, cx: editor.canvas_x, cy: editor.canvas_y };
            return;
        }
        if (evento.button !== 0) return;

        // Clic en una caja: si no es de la selección, la selección se deshace; si lo es, se arrastra el grupo.
        const nodo = evento.target.closest('.drawflow-node');
        if (nodo) {
            const nombre = nombrePorId.get(nodo.id.slice(5));
            if (!seleccion.has(nombre)) fijarSeleccion([]);
            else if (seleccion.size > 1 && !evento.target.closest('.output, .input, button')) {
                const otros = [...seleccion].map(cajaDe).filter((c) => c && c !== nodo)
                    .map((caja) => ({ caja, x: parseFloat(caja.style.left), y: parseFloat(caja.style.top) }));
                grupo = { nodo, x0: parseFloat(nodo.style.left), y0: parseFloat(nodo.style.top), otros };
            }
            return;
        }
        if (!esFondo(evento.target) || modo === 'mover') return; // líneas, bolitas o mover el lienzo: lo hace Drawflow

        // Fondo: empieza el rectángulo (Drawflow no mueve el lienzo).
        evento.preventDefault();
        evento.stopImmediatePropagation();
        quitarSeleccionDeDrawflow();
        cerrarMenuSalida();
        contenedor.focus({ preventScroll: true }); // para Supr / Ctrl+C / Ctrl+V
        const r = marco.getBoundingClientRect();
        arrastreRect = { x0: evento.clientX - r.left, y0: evento.clientY - r.top };
        Object.assign(rectangulo.style, { left: `${arrastreRect.x0}px`, top: `${arrastreRect.y0}px`, width: '0px', height: '0px' });
        rectangulo.classList.remove('d-none');
    }, true);

    document.addEventListener('mousemove', (evento) => {
        if (paneo) {
            moverVista(paneo.cx + evento.clientX - paneo.x, paneo.cy + evento.clientY - paneo.y);
        } else if (arrastreRect) {
            const r = marco.getBoundingClientRect();
            const x = evento.clientX - r.left;
            const y = evento.clientY - r.top;
            Object.assign(rectangulo.style, {
                left: `${Math.min(x, arrastreRect.x0)}px`, top: `${Math.min(y, arrastreRect.y0)}px`,
                width: `${Math.abs(x - arrastreRect.x0)}px`, height: `${Math.abs(y - arrastreRect.y0)}px`,
            });
        } else if (grupo && editor.drag) {
            // Drawflow mueve la caja pulsada; las demás seleccionadas la siguen la misma distancia.
            const dx = parseFloat(grupo.nodo.style.left) - grupo.x0;
            const dy = parseFloat(grupo.nodo.style.top) - grupo.y0;
            for (const otro of grupo.otros) {
                otro.caja.style.left = `${otro.x + dx}px`;
                otro.caja.style.top = `${otro.y + dy}px`;
                editor.updateConnectionNodes(otro.caja.id);
            }
        }
    });

    /** Guarda en el modelo la posición de las demás cajas del grupo (antes de que nodeMoved redibuje). */
    function guardarGrupo() {
        for (const { caja } of grupo?.otros ?? []) {
            const nombre = nombrePorId.get(caja.id.slice(5));
            if (nombre) moverEstado(modelo, nombre, parseFloat(caja.style.left), parseFloat(caja.style.top));
        }
    }

    document.addEventListener('mouseup', () => {
        if (paneo) paneo = null;
        if (grupo) grupo = null; // su posición ya se guardó en nodeMoved
        if (!arrastreRect) return;
        const r = rectangulo.getBoundingClientRect();
        rectangulo.classList.add('d-none');
        arrastreRect = null;
        if (r.width < 4 && r.height < 4) return fijarSeleccion([]); // un clic en el fondo deshace la selección
        const tocadas = [...contenedor.querySelectorAll('.drawflow-node:not(.copia)')].filter((caja) => {
            const c = caja.getBoundingClientRect();
            return c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top;
        });
        fijarSeleccion(tocadas.map((caja) => nombrePorId.get(caja.id.slice(5))).filter(Boolean));
    });

    // Teclado con cajas seleccionadas: Supr borra, Ctrl+C copia, Ctrl+V pega, Esc deshace la selección.
    const PORTAPAPELES = 'app-bot.portapapeles';
    let portapapeles = null; // por si el navegador no deja guardar
    const leerPortapapeles = () => {
        try { return JSON.parse(localStorage.getItem(PORTAPAPELES)) ?? portapapeles; } catch { return portapapeles; }
    };

    document.addEventListener('keydown', (evento) => {
        if (evento.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('.modal.show')) return;
        const ctrl = evento.ctrlKey || evento.metaKey;
        const tecla = evento.key.toLowerCase();
        // Sin selección múltiple, Ctrl+C copia la caja que Drawflow tenga seleccionada.
        const elegidas = seleccion.size ? [...seleccion]
            : editor.node_selected ? [nombrePorId.get(editor.node_selected.id.slice(5))].filter(Boolean) : [];

        if (evento.key === 'Escape' && seleccion.size) {
            fijarSeleccion([]);
        } else if (evento.key === 'Delete' && seleccion.size) {
            evento.preventDefault();
            evento.stopImmediatePropagation(); // Drawflow no borra además su caja
            const borrables = [...seleccion].filter((n) => n !== 'start');
            borrables.forEach((n) => eliminarEstado(modelo, n));
            fijarSeleccion([]);
            marcarCambios();
            dibujar();
            avisar(`${borrables.length === 1 ? '1 paso borrado' : `${borrables.length} pasos borrados`}`
                + `${borrables.length < elegidas.length ? ' (la Bienvenida no se borra)' : ''}.`, 'success');
        } else if (ctrl && tecla === 'c' && elegidas.length) {
            evento.preventDefault();
            portapapeles = copiarEstados(modelo, elegidas);
            try { localStorage.setItem(PORTAPAPELES, JSON.stringify(portapapeles)); } catch { /* queda en memoria */ }
            avisar(`${elegidas.length === 1 ? '1 paso copiado' : `${elegidas.length} pasos copiados`}. Pégalos con Ctrl+V.`, 'success');
        } else if (ctrl && tecla === 'v') {
            const copia = leerPortapapeles();
            if (!copia?.estados || !Object.keys(copia.estados).length) return;
            evento.preventDefault();
            const centro = centroVisible();
            const creados = pegarEstados(modelo, copia, { x: centro.x - 140, y: centro.y - 60 });
            marcarCambios();
            dibujar();
            fijarSeleccion(creados);
            avisar(creados.length ? `${creados.length === 1 ? '1 paso pegado' : `${creados.length} pasos pegados`}.` : 'Esos pasos especiales ya están en el flujo.', 'success');
        }
    }, true);

    dibujar();

    // Sin posiciones guardadas (flujo nuevo o importado): se ordena como árbol al abrir. Hace falta
    // haber dibujado antes para medir la altura real de cada caja. No cuenta como "cambio sin guardar".
    const sinLayoutGuardado = !layout || Object.keys(layout).length === 0;
    if (sinLayoutGuardado) ordenar();
    irA('start', false); // al abrir, al 100 % y centrado en start (legible); "Ajustar" muestra todo
}
