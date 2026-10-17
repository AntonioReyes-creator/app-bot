import Drawflow from 'drawflow';
import { Modal } from 'bootstrap';
import { calcularPosiciones, clasificar, flujoADrawflow, salidas } from './flujo/flujo-a-drawflow.js';
import { esEstadoSistema } from './flujo/estados-sistema.js';
import {
    agregarEstado, aplicarEdicion, crearConectado, eliminarEstado, fijarDestino, moverEstado, opcionesDe,
    plantilla, plantillaSistema, siguienteClave, sistemaDisponibles, sugerirNombre, validarNombre,
} from './flujo/modelo.js';

// Página del editor (flujos/edit.blade.php).
// El modelo { flujo, layout } es la fuente de verdad: cada acción lo modifica y se redibuja el lienzo.
const contenedor = document.getElementById('lienzo');

if (contenedor) {
    const { contenido, layout } = JSON.parse(document.getElementById('datos-flujo').textContent);

    // Se fijan desde el inicio las posiciones automáticas, para que las cajas no salten al añadir otras.
    const modelo = { flujo: contenido.FLUJO, layout: calcularPosiciones(contenido.FLUJO, layout ?? {}) };
    let nombrePorId = new Map();
    let hayCambios = false;

    const editor = new Drawflow(contenedor);
    editor.start();

    function dibujar() {
        cerrarMenuSalida();
        const resultado = flujoADrawflow(modelo.flujo, modelo.layout);
        editor.import(resultado.datos);
        nombrePorId = resultado.nombrePorId;
        alinearSalidas();

        const { total, alcanzables, sinConexion } = resultado.resumen;
        let texto = `${total} estados · ${alcanzables} alcanzables desde start`;
        if (sinConexion > 0) texto += ` · ${sinConexion} sin conexión`;
        document.getElementById('resumen').textContent = texto;

        llenarMenuSistema();
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
    }

    // Avisar antes de salir de la página si hay cambios (todavía no se pueden guardar).
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

    function agregar(nombre, estado) {
        agregarEstado(modelo, nombre, estado, centroVisible());
        marcarCambios();
        dibujar();
    }

    // --- Mover: Drawflow ya movió la caja; solo se anota la posición en el modelo.
    editor.on('nodeMoved', (id) => {
        const nodo = editor.getNodeFromId(id);
        moverEstado(modelo, nombrePorId.get(String(id)), nodo.pos_x, nodo.pos_y);
        marcarCambios();
    });

    // --- Borrar: Drawflow ya quitó la caja; se quita también del modelo. start no se borra:
    // se redibuja desde el modelo y la caja vuelve.
    editor.on('nodeRemoved', (id) => {
        const nombre = nombrePorId.get(String(id));
        lineasQuitadas = []; // las líneas de la caja borrada no se tratan como "desconectar" (ver connectionRemoved)

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

    contenedor.addEventListener('mousedown', (evento) => {
        const bolita = evento.target.closest('.output');
        if (!bolita) return;
        evento.stopPropagation();
        evento.preventDefault();

        const nodo = bolita.closest('.drawflow-node');
        const nombre = nombrePorId.get(nodo.id.replace('node-', ''));
        const indice = [...bolita.parentElement.children].indexOf(bolita);
        abrirMenuSalida(nombre, indice, bolita.getBoundingClientRect());
    }, true);

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
            titulo(salida.clave === null ? `${nombre} · sigue` : `${nombre} · opción ${salida.clave}${salida.texto ? ' · ' + salida.texto : ''}`),
            item('+ Nuevo menú', () => crearConectado(modelo, nombre, indice, { tipo: 'menu' })),
            item('+ Nuevo paso', () => crearConectado(modelo, nombre, indice, { tipo: 'paso' })),
            item('+ Nuevo final', () => crearConectado(modelo, nombre, indice, { tipo: 'final' })),
        ];

        const sistema = sistemaDisponibles(modelo.flujo);
        if (sistema.length) {
            partes.push(separador(), titulo('Nuevo estado del sistema'));
            sistema.forEach((s) => partes.push(item(s, () => crearConectado(modelo, nombre, indice, { sistema: s }), 'font-monospace')));
        }

        partes.push(separador(), titulo('Conectar con uno existente'));
        Object.keys(modelo.flujo).forEach((destino) => partes.push(
            item(destino === salida.destino ? `${destino} ✓` : destino, () => fijarDestino(modelo, nombre, indice, destino), 'font-monospace'),
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

    /** Mensaje breve junto a la barra de herramientas (no bloquea como alert). */
    let temporizadorAviso;
    function avisar(texto) {
        const aviso = document.getElementById('aviso');
        aviso.textContent = texto;
        aviso.classList.remove('d-none');
        clearTimeout(temporizadorAviso);
        temporizadorAviso = setTimeout(() => aviso.classList.add('d-none'), 4000);
    }

    // --- Añadir menú, paso o final: pide el nombre en el modal.
    const modal = new Modal(document.getElementById('modal-nombre'));
    const campo = document.getElementById('campo-nombre');
    let tipoPendiente = null;

    document.querySelectorAll('[data-agregar]').forEach((boton) => {
        boton.addEventListener('click', () => {
            tipoPendiente = boton.dataset.agregar;
            campo.value = sugerirNombre(modelo.flujo, tipoPendiente);
            campo.classList.remove('is-invalid');
            modal.show();
        });
    });

    document.getElementById('modal-nombre').addEventListener('shown.bs.modal', () => campo.select());

    document.getElementById('form-nombre').addEventListener('submit', (evento) => {
        evento.preventDefault();
        const nombre = campo.value.trim();
        const error = validarNombre(modelo.flujo, nombre);

        if (error) {
            document.getElementById('error-nombre').textContent = error;
            campo.classList.add('is-invalid');
            return;
        }

        modal.hide();
        agregar(nombre, plantilla(tipoPendiente));
    });

    // --- Añadir estado del sistema: nombre fijo, sin modal.
    function llenarMenuSistema() {
        const lista = document.getElementById('menu-sistema');
        const disponibles = sistemaDisponibles(modelo.flujo);

        lista.innerHTML = disponibles.length
            ? disponibles.map((nombre) => `<li><button type="button" class="dropdown-item font-monospace" data-sistema="${nombre}">${nombre}</button></li>`).join('')
            : '<li><span class="dropdown-item-text text-body-secondary">Ya están todos en el flujo</span></li>';
    }

    document.getElementById('menu-sistema').addEventListener('click', (evento) => {
        const nombre = evento.target.dataset.sistema;
        if (nombre) agregar(nombre, plantillaSistema(nombre));
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
        const inputTexto = Object.assign(document.createElement('input'), { className: 'form-control form-control-sm', value: text });
        const quitar = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn-sm btn-outline-danger', textContent: '×', title: 'Quitar opción' });
        quitar.addEventListener('click', () => fila.remove());

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
        campoNombre.value = nombre;
        campoNombre.disabled = sistema;
        document.getElementById('estado-nombre-ayuda').textContent = sistema
            ? 'Estado del sistema: el bot lo usa por su nombre, no se puede cambiar.'
            : 'Minúsculas, números y guion bajo. Las flechas que llegan aquí se actualizan solas.';
        document.getElementById('estado-mensaje').value = estado.message ?? '';
        document.getElementById('tipo-' + tipo).checked = true;

        // Las filas se cargan aunque el tipo no sea menú: si cambias a "menú" mientras el modal está abierto, aparecen.
        filasOpciones.replaceChildren();
        ocultoPorFila = new WeakMap();
        const filas = opcionesDe(estado);
        (filas.length ? filas : [{ clave: '1', text: 'Opción 1', next_state: null, extra: {} }]).forEach(agregarFila);

        mostrarSeccion(tipo);
        document.getElementById('estado-error').classList.add('d-none');
        modalEstado.show();
    }

    formEstado.addEventListener('change', (evento) => {
        if (evento.target.name === 'estado-tipo') mostrarSeccion(evento.target.value);
    });

    document.getElementById('agregar-opcion').addEventListener('click', () => {
        const claves = [...filasOpciones.querySelectorAll('tr')].map((fila) => fila.querySelector('input').value.trim());
        agregarFila({ clave: siguienteClave(claves), text: '', next_state: null, extra: {} });
        filasOpciones.lastElementChild.querySelectorAll('input')[1].focus();
    });

    formEstado.addEventListener('submit', (evento) => {
        evento.preventDefault();

        const error = aplicarEdicion(modelo, editando, {
            nombre: document.getElementById('estado-nombre').value,
            message: document.getElementById('estado-mensaje').value,
            tipo: formEstado.querySelector('[name="estado-tipo"]:checked').value,
            next_state: modelo.flujo[editando].next_state ?? null, // el destino de "sigue" no cambia aquí
            opciones: [...filasOpciones.querySelectorAll('tr')].map((fila) => {
                const [clave, texto] = fila.querySelectorAll('input');
                return { clave: clave.value, text: texto.value, ...ocultoPorFila.get(fila) };
            }),
        });

        if (error) {
            const caja = document.getElementById('estado-error');
            caja.textContent = error;
            caja.classList.remove('d-none');
            return;
        }

        modalEstado.hide();
        marcarCambios();
        dibujar();
    });

    dibujar();
}
