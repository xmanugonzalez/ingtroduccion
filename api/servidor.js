import { atenderSolicitud } from '../servidor.mjs';

/**
 * Adapta la ruta capturada por la reescritura de Vercel al servidor común.
 * Así las direcciones públicas son iguales en desarrollo y producción.
 */
export default async function servidorVercel(solicitud, respuesta) {
  const rutaCapturada = Array.isArray(solicitud.query?.ruta)
    ? solicitud.query.ruta.join('/')
    : solicitud.query?.ruta || '';

  solicitud.url = '/' + rutaCapturada.replace(/^\/+/, '');
  return atenderSolicitud(solicitud, respuesta);
}
