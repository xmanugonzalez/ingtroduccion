import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crearServidor } from '../servidor.mjs';

let servidor;
let origen;
let inventario;

before(async () => {
  inventario = JSON.parse(await readFile(new URL('../contenido/indice.json', import.meta.url), 'utf8'));
  servidor = await crearServidor();
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  origen = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  if (servidor) await new Promise((resolver, rechazar) => servidor.close(error => error ? rechazar(error) : resolver()));
});

test('cada pagina y recurso coincide con su registro de integridad', async () => {
  const rutas = { ...inventario.paginas, ...inventario.recursos };
  assert.ok(Object.keys(inventario.paginas).length > 80, 'Debe incluir las lecciones y los ejercicios, no solo la portada.');
  for (const [ruta, recurso] of Object.entries(rutas)) {
    const respuesta = await fetch(origen + ruta);
    assert.equal(respuesta.status, 200, ruta);
    const bytes = Buffer.from(await respuesta.arrayBuffer());
    assert.equal(bytes.length, recurso.bytes, ruta);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), recurso.sha256, ruta);
    assert.equal(respuesta.headers.get('content-type'), recurso.tipo, ruta);
  }
});

test('las referencias locales de navegacion y recursos estan resueltas', async () => {
  const rutas = { ...inventario.paginas, ...inventario.recursos };
  for (const [ruta, pagina] of Object.entries(inventario.paginas)) {
    const html = await readFile(new URL(`../contenido/${pagina.archivo}`, import.meta.url), 'utf8');
    for (const etiqueta of html.matchAll(/<(?:a|link|script|img|source|iframe)\b[^>]*>/gi)) {
      for (const atributo of etiqueta[0].matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
        if (!atributo[1].startsWith('/')) continue;
        const destino = new URL(atributo[1].replaceAll('&amp;', '&'), origen);
        assert.ok(Object.hasOwn(rutas, destino.pathname), `${ruta} apunta a ${destino.pathname}`);
      }
    }
  }
});

test('los seis modulos, el registro y el ingreso tienen rutas registradas', async () => {
  for (const modulo of ['cpp', 'html-js', 'sql', 'python', 'docker', 'git']) {
    assert.ok(inventario.paginas[`/modulos/${modulo}/`]);
  }
  assert.ok(inventario.paginas['/login']);
  assert.ok(inventario.paginas['/register']);
});

test('HTML conserva el iframe srcdoc con scripts y sin acceso al origen padre', async () => {
  const respuesta = await fetch(origen + '/modulos/html-js/ejercicio/leccion1-ej1');
  const html = await respuesta.text();
  assert.match(html, /<iframe[^>]*sandbox="allow-scripts"/);
  assert.match(html, /preview\.srcdoc = codigo/);
  assert.doesNotMatch(html, /<iframe[^>]*sandbox="[^"]*allow-same-origin/);
});

test('HEAD devuelve metadatos sin cuerpo', async () => {
  const respuesta = await fetch(origen + '/', { method: 'HEAD' });
  assert.equal(respuesta.status, 200);
  assert.ok(Number(respuesta.headers.get('content-length')) > 0);
  assert.equal(await respuesta.text(), '');
});

test('los archivos privados del proyecto y rutas ajenas no son accesibles', async () => {
  for (const ruta of ['/README.md', '/package.json', '/.env', '/.git/config', '/__proto__', '/constructor', '/contenido/indice.json', '/%2e%2e/package.json', '/modulos/cpp/../../package.json']) {
    assert.equal((await fetch(origen + ruta)).status, 404, ruta);
  }
});

test('las APIs pendientes responden con error explicito sin fingir una ejecucion', async () => {
  for (const modulo of ['cpp', 'html-js', 'sql', 'python', 'docker', 'git']) {
    const respuesta = await fetch(`${origen}/modulos/${modulo}/api/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: 'codigo de prueba', ejercicio_id: 'leccion1-ej1' }),
    });
    assert.equal(respuesta.status, 501);
    const resultado = await respuesta.json();
    assert.equal(resultado.ok, false);
    assert.match(resultado.mensaje, /no esta disponible/);
  }
});

test('los formularios pendientes no crean cuentas ni sesiones falsas', async () => {
  for (const ruta of ['/login', '/register']) {
    const respuesta = await fetch(origen + ruta, { method: 'POST', body: 'username=prueba' });
    assert.equal(respuesta.status, 501);
    assert.equal(respuesta.headers.get('set-cookie'), null);
  }
});
