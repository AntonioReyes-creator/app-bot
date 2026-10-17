import Drawflow from 'drawflow';
import { flujoADrawflow } from './flujo/flujo-a-drawflow.js';

// Página del editor (flujos/edit.blade.php): dibuja el FLUJO guardado en el lienzo.
const contenedor = document.getElementById('lienzo');

if (contenedor) {
    const { contenido, layout } = JSON.parse(document.getElementById('datos-flujo').textContent);
    const { datos, resumen } = flujoADrawflow(contenido.FLUJO, layout ?? {});

    const editor = new Drawflow(contenedor);
    // Solo lectura hasta la etapa 2 (guardar): se puede desplazar y hacer zoom, no mover ni conectar.
    editor.editor_mode = 'view';
    editor.start();
    editor.import(datos);

    let texto = `${resumen.total} estados · ${resumen.alcanzables} alcanzables desde start`;
    if (resumen.sinConexion > 0) texto += ` · ${resumen.sinConexion} sin conexión`;
    document.getElementById('resumen').textContent = texto;
}
