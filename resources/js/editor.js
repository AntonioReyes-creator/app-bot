import Drawflow from 'drawflow';
import { Modal, Offcanvas } from 'bootstrap';
import { arbolDeEstados, calcularPosiciones, clasificar, flujoADrawflow, salidas, tiposDeDibujo, vaHaciaAtras } from './flujo/flujo-a-drawflow.js';
import { conexionesQueCruzan } from './flujo/geometria.js';
import { AVANZADOS, BASICOS, PATRONES_SISTEMA, describirSistema, esEstadoSistema, etiquetaSistema, iconoSistema } from './flujo/estados-sistema.js';
import { ordenarArbol } from './flujo/ordenar.js';
import { iniciar, responder } from './flujo/simulador.js';
import { EMOJIS, MAXIMO_CARACTERES, envolver, formatearWhatsApp, insertar, marcarLineas, mensajeDelBot } from './flujo/whatsapp.js';
import {
    agregarEstado, aplicarEdicion, conectarYNombrar, contenidoParaGuardar, crearConectado, eliminarEstado, enlazarPareja, fijarDestino,
    esNuevo, identificadorPara, moverEstado, nombrePatron, sincronizarHijos, tituloDe,
    ejemploMensaje, opcionesDe, plantillaSistema, siguienteClave, sistemaDisponibles,
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
        marcarEstadoSimulado(); // al redibujar se crean cajas nuevas: se vuelve a marcar la del simulador
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
        } catch {
            avisar('No se pudo guardar: sin conexión con el servidor.');
        } finally {
            botonGuardar.disabled = false;
            botonGuardar.textContent = 'Guardar';
        }
    }

    botonGuardar.addEventListener('click', guardar);
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

        const { aristas } = arbolDeEstados(modelo.flujo); // solo las del árbol llevan línea
        const conexiones = [];
        for (const [nombre, nodo] of nodoDe) {
            const bolitas = nodo.querySelectorAll('.outputs .output');
            salidas(modelo.flujo[nombre]).forEach(({ destino }, i) => {
                if (!nodoDe.has(destino) || destino === nombre || !bolitas[i]) return;
                if (vaHaciaAtras(modelo.layout, nombre, destino) || !aristas.has(`${nombre}#${i}`)) return; // ya son etiqueta
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
            avisar(`Es una copia de vista de «${tituloDe(modelo, copia.destino)}». Para quitarla, borra su línea (desconecta esa opción).`);
            dibujar();
            return;
        }

        if (eliminarEstado(modelo, nombre)) {
            marcarCambios();
        } else {
            avisar('«start» es el inicio del bot y no se puede borrar.');
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

    function abrirMenuSalida(nombre, indice, rect) {
        const salida = salidas(modelo.flujo[nombre])[indice]; // mismo orden que las bolitas
        const item = (texto, accion, clase = '') => {
            const boton = Object.assign(document.createElement('button'), { type: 'button', className: `dropdown-item ${clase}`, textContent: texto });
            boton.addEventListener('click', () => { accion(); marcarCambios(); dibujar(); });
            return boton;
        };
        const titulo = (texto) => Object.assign(document.createElement('h6'), { className: 'dropdown-header', textContent: texto });
        const separador = () => Object.assign(document.createElement('hr'), { className: 'dropdown-divider' });

        const partes = [
            titulo(salida.clave === null ? `${tituloDe(modelo, nombre)} · sigue` : `${tituloDe(modelo, nombre)} · opción ${salida.clave}${salida.texto ? ' · ' + salida.texto : ''}`),
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
            item(`${tituloDe(modelo, destino)}${destino === salida.destino ? ' ✓' : ''}`, () => conectar(nombre, indice, destino)),
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
    function avisar(texto, tipo = 'danger') {
        const aviso = document.getElementById('aviso');
        aviso.textContent = texto;
        aviso.className = `badge text-bg-${tipo}`;
        clearTimeout(temporizadorAviso);
        temporizadorAviso = setTimeout(() => aviso.classList.add('d-none'), 4000);
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

    function agregarSistema(nombre) {
        agregarEstado(modelo, nombre, plantillaSistema(nombre, modelo.flujo), centroVisible());
        enlazarPareja(modelo, nombre); // X_pedir_corte ↔ X_confirmar
        marcarCambios();
        dibujar();
        llenarPanelSistema();
        avisar(`«${etiquetaSistema(nombre) ?? nombre}» añadido al centro de la vista. Conéctalo desde una opción.`, 'success');
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
        const quitar = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn-sm btn-outline-danger', textContent: '×', title: 'Quitar opción' });
        quitar.addEventListener('click', () => { fila.remove(); actualizarVista(); });

        [inputClave, inputTexto, quitar].forEach(celda);
        ocultoPorFila.set(fila, { next_state: next_state ?? null, extra: extra ?? {} });
        filasOpciones.append(fila);
    }

    function mostrarSeccion(tipo) {
        document.getElementById('seccion-paso').classList.toggle('d-none', tipo !== 'paso');
        document.getElementById('seccion-menu').classList.toggle('d-none', tipo !== 'menu');
    }

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
            ? 'Estado del sistema: el motor lo reconoce por este identificador; no cambia.'
            : sincronizarIdentificador
                ? 'Estado nuevo: se actualiza con el nombre visible hasta que el flujo se publique.'
                : 'Fijo: ya existía (o ya se publicó). Cambiarlo rompería las conversaciones en curso.';
        const campoMensaje = document.getElementById('estado-mensaje');
        campoMensaje.value = estado.message ?? '';
        campoMensaje.placeholder = ejemploMensaje(nombre, tipo);
        document.getElementById('mensaje-ayuda').textContent = /_pedir_corte$|^seleccionar_departamento$/.test(nombre)
            ? 'El sistema reemplaza {{departamentos}} por la lista de opciones: no lo borres.'
            : 'Selecciona texto y pulsa un botón para darle formato.';
        document.getElementById('tipo-' + tipo).checked = true;

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
        } else if (campo === 'opciones' || campo === 'clave') {
            const aviso = document.getElementById('opciones-error');
            aviso.textContent = mensaje;
            aviso.classList.remove('d-none');
            foco = campo === 'clave' ? filasOpciones.querySelectorAll('tr')[indice]?.querySelector('input') : null;
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
    }

    campoMensaje.addEventListener('input', actualizarVista);

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
        const error = aplicarEdicion(modelo, editando, {
            nombre: nombreFinal, // calculado: solo cambia en estados nuevos
            titulo: document.getElementById('estado-titulo').value,
            message: document.getElementById('estado-mensaje').value,
            tipo: formEstado.querySelector('[name="estado-tipo"]:checked').value,
            next_state: modelo.flujo[editando].next_state ?? null, // el destino de "sigue" no cambia aquí
            opciones: [...filasOpciones.querySelectorAll('tr')].map((fila) => {
                const [clave, texto] = fila.querySelectorAll('input');
                return { clave: clave.value, text: texto.value, ...ocultoPorFila.get(fila) };
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

    dibujar();

    // Sin posiciones guardadas (flujo nuevo o importado): se ordena como árbol al abrir. Hace falta
    // haber dibujado antes para medir la altura real de cada caja. No cuenta como "cambio sin guardar".
    const sinLayoutGuardado = !layout || Object.keys(layout).length === 0;
    if (sinLayoutGuardado) ordenar();
    irA('start', false); // al abrir, al 100 % y centrado en start (legible); "Ajustar" muestra todo
}
