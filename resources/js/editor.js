import Drawflow from 'drawflow';
import { Modal } from 'bootstrap';
import { calcularPosiciones, clasificar, flujoADrawflow } from './flujo/flujo-a-drawflow.js';
import { esEstadoSistema } from './flujo/estados-sistema.js';
import {
    agregarEstado, aplicarEdicion, eliminarEstado, moverEstado, opcionesDe, plantilla, plantillaSistema,
    siguienteClave, sistemaDisponibles, sugerirNombre, validarNombre,
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
        const resultado = flujoADrawflow(modelo.flujo, modelo.layout);
        editor.import(resultado.datos);
        nombrePorId = resultado.nombrePorId;

        const { total, alcanzables, sinConexion } = resultado.resumen;
        let texto = `${total} estados · ${alcanzables} alcanzables desde start`;
        if (sinConexion > 0) texto += ` · ${sinConexion} sin conexión`;
        document.getElementById('resumen').textContent = texto;

        llenarMenuSistema();
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

        if (eliminarEstado(modelo, nombre)) {
            marcarCambios();
        } else {
            avisar('«start» es el inicio del bot y no se puede borrar.');
        }

        dibujar();
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
    let extrasPorFila = new WeakMap(); // fila <tr> → campos extra de la opción (keywords, departamento…)

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

    /** <select> con todos los estados; si el destino actual no existe, se muestra marcado para no perderlo. */
    function selectorDestino(select, actual) {
        select.replaceChildren();
        const opcion = (valor, texto) => select.append(new Option(texto, valor, false, valor === (actual ?? '')));

        opcion('', '— sin conectar —');
        if (actual && !(actual in modelo.flujo)) opcion(actual, `⚠ ${actual} (no existe)`);
        Object.keys(modelo.flujo).forEach((nombre) => opcion(nombre, nombre));
    }

    function agregarFila({ clave, text, next_state, extra }) {
        const fila = document.createElement('tr');
        const celda = (control) => { const td = document.createElement('td'); td.append(control); fila.append(td); };

        const inputClave = Object.assign(document.createElement('input'), { className: 'form-control form-control-sm font-monospace', value: clave });
        const inputTexto = Object.assign(document.createElement('input'), { className: 'form-control form-control-sm', value: text });
        const select = Object.assign(document.createElement('select'), { className: 'form-select form-select-sm font-monospace' });
        selectorDestino(select, next_state);
        const quitar = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn-sm btn-outline-danger', textContent: '×', title: 'Quitar opción' });
        quitar.addEventListener('click', () => fila.remove());

        [inputClave, inputTexto, select, quitar].forEach(celda);
        extrasPorFila.set(fila, extra ?? {});
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
        selectorDestino(document.getElementById('estado-siguiente'), estado.next_state ?? null);

        // Las filas se cargan aunque el tipo no sea menú: si cambias a "menú" mientras el modal está abierto, aparecen.
        filasOpciones.replaceChildren();
        extrasPorFila = new WeakMap();
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
            next_state: document.getElementById('estado-siguiente').value,
            opciones: [...filasOpciones.querySelectorAll('tr')].map((fila) => {
                const [clave, texto] = fila.querySelectorAll('input');
                return { clave: clave.value, text: texto.value, next_state: fila.querySelector('select').value, extra: extrasPorFila.get(fila) };
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
