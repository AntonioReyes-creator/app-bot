import Drawflow from 'drawflow';

// Página del editor (flujos/edit.blade.php). Por ahora solo prepara el lienzo;
// dibujar las cajas a partir del FLUJO es el paso 1f.
const contenedor = document.getElementById('lienzo');

if (contenedor) {
    const datos = JSON.parse(document.getElementById('datos-flujo').textContent);
    const estados = Object.keys(datos.contenido.FLUJO);

    const editor = new Drawflow(contenedor);
    editor.start();

    document.getElementById('resumen').textContent = `${estados.length} estados`;
}
