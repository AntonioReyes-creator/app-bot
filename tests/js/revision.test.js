import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDelDiseno, pareceQuePideDatos, pasosSinCierre, revisarFlujo } from '../../resources/js/flujo/revision.js';

const textos = (flujo) => revisarFlujo(flujo).map((p) => `${p.gravedad} ${p.nombre}: ${p.texto}`);

const bien = {
    start: { message: 'Hola', options: { 1: { text: 'Info', next_state: 'info' }, salir: { text: 'Salir', next_state: 'end' } } },
    info: { message: 'Ingrese a la siguiente dirección web: https://x.pe', next_state: 'end_or_menu' },
    end_or_menu: { message: '¿Algo más?', options: { 1: { text: 'Sí', next_state: 'start' }, 2: { text: 'No', next_state: 'end' } } },
    derivar_x: { message: 'Por favor, responda este mensaje para continuar', next_state: 'mas_informacion' },
    mas_informacion: { message: 'Envíanos tus datos', next_state: 'esperando_agente' },
    esperando_agente: { message: 'Espera' },
    end: { message: 'Chau' },
};

test('revisión: un flujo correcto no tiene avisos (sin falsos positivos: «ingrese a la web», «salir» → end, datos a mas_informacion)', () => {
    assert.deepEqual(textos(bien), []);
});

test('revisión H3 / H15: mensaje vacío y mensaje más largo que el límite de WhatsApp', () => {
    const r = textos({ ...bien, end: { message: '  ' }, info: { message: 'x'.repeat(4100), next_state: 'end_or_menu' } });
    assert.ok(r.some((t) => /^error end: no tiene mensaje/.test(t)));
    assert.ok(r.some((t) => /^error info: el mensaje tiene 4100 caracteres; WhatsApp admite hasta 4096/.test(t)));
});

test('revisión H13: un estado sin salida que no es la Despedida deja al bot mudo (encuesta_fin y esperando_agente sí sirven)', () => {
    const r = textos({ ...bien, precios: { message: 'S/ 10' }, encuesta_fin: { message: 'Gracias' }, esperando_agente_ventas: { message: 'x' } });
    assert.deepEqual(r.filter((t) => t.includes('ya no responde')).map((t) => t.split(':')[0]), ['error precios']);
});

test('revisión H1: un paso que pide escribir algo y se une con un estado que no espera texto', () => {
    const r = textos({ ...bien,
        pedido: { message: 'Escríbeme tu pedido', next_state: 'end' },
        nota: { message: 'Indícanos tu dirección', next_state: 'end_or_menu' },
        pregunta_final: { message: '¿Algo que agregar?', next_state: 'end' },
        datos: { message: 'Escribe tu DNI', next_state: 'mas_informacion' } });
    assert.match(r.find((t) => t.startsWith('aviso pedido')), /la conversación termina: la respuesta se pierde/);
    assert.match(r.find((t) => t.startsWith('aviso nota')), /se tomará como una opción/);
    assert.ok(r.some((t) => t.startsWith('aviso pregunta_final')), 'pregunta + cierre');
    assert.ok(!r.some((t) => t.startsWith('aviso datos')), 'mas_informacion sí espera los datos');
});

test('revisión H10 / H12: opción sin texto y palabra que el motor usa como comando (si lleva a otro sitio)', () => {
    const r = textos({ ...bien, start: { message: 'Hola', options: {
        1: { text: '', next_state: 'info' }, menu: { text: 'Ver menú', next_state: 'start' }, 2: { text: 'Fin', next_state: 'info' } } } });
    assert.ok(r.some((t) => /^aviso start: la opción 1 no tiene texto/.test(t)));
    assert.ok(!r.some((t) => t.includes('«menu»')), '«menu» → start hace lo mismo que el comando');
    assert.ok(r.some((t) => /la opción «fin» es un comando del bot \(termina el chat\)/.test(t)));
});

test('pareceQuePideDatos: verbos de pedir texto, sin confundir «ingrese a la web» ni «canal digital»', () => {
    for (const m of ['Escríbeme tu pedido', 'Indícanos tu distrito', 'Envíanos una foto', 'Dinos tu nombre']) assert.ok(pareceQuePideDatos(m), m);
    for (const m of ['Ingrese a la web', 'Gracias por usar nuestro canal digital', 'Elige una opción']) assert.ok(!pareceQuePideDatos(m), m);
});

// --- Recorrido: desde cada paso alcanzable debe haber un camino hasta un cierre ---

test('pasosSinCierre: las vueltas están bien si hay salida; sin salida son trampas', () => {
    assert.deepEqual([...pasosSinCierre(bien)], [], 'el flujo correcto no tiene trampas');

    const vueltas = { start: { message: 'Hola', options: { 1: { text: 'A', next_state: 'a' } } },
        a: { message: 'A', options: { 1: { text: 'B', next_state: 'b' }, 2: { text: 'Volver', next_state: 'start' } } },
        b: { message: 'B', options: { 1: { text: 'Volver', next_state: 'a' } } }, end: { message: 'Chau' } };
    assert.deepEqual([...pasosSinCierre(vueltas)].sort(), ['a', 'b', 'start'], 'solo vueltas, nunca se llega a la Despedida');

    vueltas.b.options[2] = { text: 'Terminar', next_state: 'end' };
    assert.deepEqual([...pasosSinCierre(vueltas)], [], 'con una sola salida, ya no hay trampa');
    assert.deepEqual([...pasosSinCierre({ ...bien, suelto: { message: 'x' } })], [], 'lo que no se alcanza no cuenta (tiene su propio aviso)');
});

test('revisión de recorrido: se avisa en el ORIGEN del problema y se dice cuántos pasos arrastra', () => {
    const f = { start: { message: 'Hola', options: { 1: { text: 'Viajes', next_state: 'viajes' }, 2: { text: 'Precios', next_state: 'precios' }, 3: { text: 'Salir', next_state: 'end' } } },
        viajes: { message: 'Elige', options: { 1: { text: 'Lima', next_state: 'lima' }, 2: { text: 'Volver', next_state: 'viajes' } } },
        lima: { message: 'Lima', options: { 1: { text: 'Volver', next_state: 'viajes' } } },
        precios: { message: 'S/ 10' },
        end: { message: 'Chau' } };
    const de = (flujo) => revisarFlujo(flujo).filter((p) => p.codigo === 'sin-cierre' || p.codigo === 'mudo');

    // viajes ↔ lima dan vueltas sin salida: un solo aviso, en viajes (el primero); precios: final mudo (ya avisado).
    assert.deepEqual(de(f).map((p) => `${p.codigo} ${p.nombre}`), ['mudo precios', 'sin-cierre viajes']);
    assert.match(de(f)[1].texto, /^desde aquí no hay forma de terminar la conversación: conecta/);

    delete f.start.options[3]; // sin «Salir», tampoco la Bienvenida puede terminar
    const r = de(f);
    assert.match(r.find((p) => p.nombre === 'viajes').texto, /y por eso tampoco desde el paso que lleva aquí/);
    assert.match(r.find((p) => p.nombre === 'precios').texto, /Por eso tampoco pueden terminar el paso que lleva aquí\./);
    assert.match(r.find((p) => p.nombre === 'start').texto, /^desde el inicio no hay ningún camino que termine la conversación/);
});

test('revisión de recorrido: un «¿Algo más?» sin salidas al que llegan 3 pasos da UN aviso de recorrido, en «¿Algo más?»', () => {
    const f = { start: { message: 'Hola', options: { 1: { text: 'A', next_state: 'a' }, 2: { text: 'B', next_state: 'b' }, 3: { text: 'C', next_state: 'c' }, 4: { text: 'Fin', next_state: 'end' } } },
        a: { message: 'a', next_state: 'end_or_menu' }, b: { message: 'b', next_state: 'end_or_menu' }, c: { message: 'c', next_state: 'end_or_menu' },
        end_or_menu: { message: '¿Algo más?', options: { 1: { text: 'Sí', next_state: null }, 2: { text: 'No', next_state: null } } },
        end: { message: 'Chau' } };
    const r = revisarFlujo(f).filter((p) => p.codigo === 'sin-cierre');

    assert.deepEqual(r.map((p) => p.nombre), ['end_or_menu']);
    assert.match(r[0].texto, /y por eso tampoco desde los 3 pasos que llevan aquí/);
});

test('estadoDelDiseno: ✅ sin avisos, ⚠ solo avisos, ⛔ si algo hace fallar la conversación', () => {
    assert.equal(estadoDelDiseno([]).nivel, 'ok');
    assert.deepEqual(estadoDelDiseno([{ gravedad: 'aviso' }, { gravedad: 'aviso' }]).texto, '2 por revisar');
    const falla = estadoDelDiseno([{ gravedad: 'error' }, { gravedad: 'aviso' }]);
    assert.equal(falla.nivel, 'falla');
    assert.equal(falla.texto, '1 falla');
    assert.match(falla.detalle, /y 1 más por revisar/);
});

