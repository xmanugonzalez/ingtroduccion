/**
 * Servidor HTTP de los cursos de ing-troduccion.
 * Publica las paginas y recursos registrados en el inventario. Los servicios
 * de ejecucion y cuentas permanecen deshabilitados hasta su implementacion.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const DIRECTORIO_CONTENIDO = fileURLToPath(new URL('./contenido/', import.meta.url));
const MENSAJE_PENDIENTE = 'Este servicio todavia no esta disponible.';
let rutasRegistradas;

async function obtenerRutasRegistradas() {
  if (!rutasRegistradas) {
    const inventario = JSON.parse(await readFile(path.join(DIRECTORIO_CONTENIDO, 'indice.json'), 'utf8'));
    rutasRegistradas = { ...inventario.paginas, ...inventario.recursos };
  }
  return rutasRegistradas;
}

/** Atiende una peticion tanto en el servidor local como en Vercel. */
export async function atenderSolicitud(solicitud, respuesta) {
  const rutas = await obtenerRutasRegistradas();
  respuesta.setHeader('X-Content-Type-Options', 'nosniff');
  respuesta.setHeader('Referrer-Policy', 'same-origin');

  let ruta;
  try {
    ruta = new URL(solicitud.url, 'http://127.0.0.1').pathname;
  } catch {
    respuesta.writeHead(400).end('Direccion no valida.');
    return;
  }

  if (!['GET', 'HEAD'].includes(solicitud.method)) {
    // Los servicios pendientes no deben conservar credenciales ni codigo.
    // Se descarta el cuerpo sin leerlo ni registrarlo hasta habilitar el
    // procesamiento correspondiente.
    solicitud.resume();
    if (ruta === '/login' || ruta === '/register' || /^\/modulos\/[^/]+\/api\//.test(ruta)) {
      const esApi = ruta.includes('/api/');
      respuesta.writeHead(501, {
        'Content-Type': esApi ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      respuesta.end(esApi
        ? JSON.stringify({ ok: false, mensaje: MENSAJE_PENDIENTE, error: MENSAJE_PENDIENTE })
        : MENSAJE_PENDIENTE);
      return;
    }
    respuesta.writeHead(405, { Allow: 'GET, HEAD' }).end('Metodo no permitido.');
    return;
  }

  const recurso = Object.hasOwn(rutas, ruta) ? rutas[ruta] : undefined;
  if (!recurso) {
    respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end(solicitud.method === 'HEAD' ? undefined : 'Pagina no encontrada.');
    return;
  }

  try {
    const bytes = await readFile(path.join(DIRECTORIO_CONTENIDO, recurso.archivo));
    respuesta.writeHead(200, {
      'Content-Type': recurso.tipo,
      'Content-Length': bytes.length,
      'Cache-Control': 'public, max-age=0, must-revalidate',
    });
    respuesta.end(solicitud.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    console.error(`No se pudo servir ${ruta}: ${error.code || error.message}`);
    respuesta.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('No se pudo leer el archivo.');
  }
}

/**
 * Construye el servidor sin abrir un puerto, para probarlo con un puerto temporal.
 * El inventario actua como lista permitida: nunca se publica todo el directorio
 * del proyecto ni se utiliza directamente una ruta recibida por HTTP.
 */
export async function crearServidor() {
  await obtenerRutasRegistradas();
  return createServer(atenderSolicitud);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const puerto = Number(process.env.PUERTO || 3000);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error('PUERTO debe ser un numero entero entre 1 y 65535.');
  }
  const servidor = await crearServidor();
  servidor.on('error', (error) => {
    console.error(`No se pudo iniciar el servidor: ${error.message}`);
    process.exitCode = 1;
  });
  servidor.listen(puerto, '127.0.0.1', () => {
    console.log(`ing-troduccion: http://127.0.0.1:${puerto}`);
    console.log('Los servicios de ejecucion y cuentas todavia no estan habilitados.');
  });
}
