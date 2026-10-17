import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envolver, formatearWhatsApp, insertar, marcarLineas, mensajeDelBot } from '../../resources/js/flujo/whatsapp.js';

test('envolver: con selección la rodea; sin selección deja el cursor entre las marcas', () => {
    assert.deepEqual(envolver('Hola mundo', 5, 10, 'negrita'), { texto: 'Hola *mundo*', inicio: 6, fin: 11 });
    assert.deepEqual(envolver('Hola ', 5, 5, 'cursiva'), { texto: 'Hola __', inicio: 6, fin: 6 });
    assert.equal(envolver('codigo', 0, 6, 'mono').texto, '```codigo```');
});

test('marcarLineas: viñetas y numerada sobre las líneas seleccionadas; repetir la quita', () => {
    const texto = 'Elige:\nuno\ndos';
    const v = marcarLineas(texto, 8, 13, 'vinetas');          // selección dentro de "uno" y "dos"
    assert.equal(v.texto, 'Elige:\n- uno\n- dos');
    assert.equal(marcarLineas(v.texto, v.inicio, v.fin, 'vinetas').texto, texto, 'segunda vez: alterna');
    assert.equal(marcarLineas(texto, 8, 13, 'numerada').texto, 'Elige:\n1. uno\n2. dos');
    assert.equal(marcarLineas('nota', 0, 0, 'cita').texto, '> nota');
});

test('insertar reemplaza la selección y deja el cursor detrás', () => {
    assert.deepEqual(insertar('Hola X', 5, 6, '👋'), { texto: 'Hola 👋', inicio: 7, fin: 7 });
});

test('mensajeDelBot: el mensaje + opciones numéricas como "\\n1. Texto"; omite claves no numéricas', () => {
    const opciones = [{ clave: '1', text: 'Trámites' }, { clave: 'salir', text: 'Salir' }, { clave: '2', text: 'Consultas' }];
    assert.equal(mensajeDelBot('Elige:', opciones), 'Elige:\n1. Trámites\n2. Consultas');
    assert.equal(mensajeDelBot('Solo texto'), 'Solo texto');
});

test('formatearWhatsApp: negrita, cursiva, tachado, mono, viñetas y cita, con el texto escapado', () => {
    assert.equal(formatearWhatsApp('*Hola* _tú_ ~no~'), '<strong>Hola</strong> <em>tú</em> <s>no</s>');
    assert.equal(formatearWhatsApp('- uno\n> cita'), '<span class="wa-vineta">•</span> uno<br><span class="wa-cita">cita</span>');
    assert.equal(formatearWhatsApp('```a *b*```'), '<code class="wa-bloque">a *b*</code>', 'dentro de ``` no se formatea');
    assert.equal(formatearWhatsApp('<script>'), '&lt;script&gt;');
    assert.equal(formatearWhatsApp('2 * 3 * 4'), '2 * 3 * 4', 'asteriscos sueltos no son negrita');
    assert.equal(formatearWhatsApp('correo_de_prueba'), 'correo_de_prueba', 'guiones bajos dentro de palabras no son cursiva');
});
