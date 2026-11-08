// Programa local de Casa de Noah para Mac o Linux (en Windows se usa servidor.ps1, que hace lo mismo).
// Uso: node servidor.js   → abre http://localhost:8642
// - Muestra la página.
// - /calendario?url=…  trae el calendario de Airbnb, Booking o Expedia (solo esos sitios).
// - /datos             lee y guarda datos/datos.json (y deja una copia en datos/datos-anterior.json).
// Solo atiende a este mismo computador, y solo a la página de Casa de Noah (encabezado X-Casa-Noah).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { enlaceValido } = require('./js/engine.js');

const PUERTO = Number(process.env.PUERTO) || 8642;
const RAIZ = __dirname;
const CARPETA_DATOS = process.env.CARPETA_DATOS || path.join(RAIZ, 'datos');
const ARCHIVO = path.join(CARPETA_DATOS, 'datos.json');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const MAX = 5 * 1024 * 1024;

function responder(res, code, tipo, cuerpo) {
  res.writeHead(code, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(cuerpo);
}

async function traerCalendario(url) {
  if (!enlaceValido(url)) return [400, 'Enlace no permitido: debe ser de Airbnb, Booking o Expedia.'];
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'CasaDeNoah-Calendario/1.0' } });
    if (!enlaceValido(r.url || url)) return [400, 'La plataforma redirigió a un sitio no permitido.'];
    const txt = await r.text();
    if (!r.ok) return [502, `La plataforma respondió con error ${r.status}.`];
    if (txt.length > MAX) return [502, 'El calendario es demasiado grande.'];
    return [200, txt];
  } catch (e) {
    return [504, 'No se pudo conectar con la plataforma. Revisa el internet.'];
  }
}

function guardarDatos(txt) {
  JSON.parse(txt); // si no es JSON válido, lanza y no se toca nada
  fs.mkdirSync(CARPETA_DATOS, { recursive: true });
  const tmp = ARCHIVO + '.tmp';
  fs.writeFileSync(tmp, txt, 'utf8');
  if (fs.existsSync(ARCHIVO)) fs.copyFileSync(ARCHIVO, path.join(CARPETA_DATOS, 'datos-anterior.json'));
  fs.renameSync(tmp, ARCHIVO);
  respaldoDelDia();
}

// Una copia por día en datos/respaldos (se guardan las últimas 30).
const DIAS_RESPALDO = 30;
function respaldoDelDia() {
  const dir = path.join(CARPETA_DATOS, 'respaldos');
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date();
  const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const destino = path.join(dir, `datos-${hoy}.json`);
  if (!fs.existsSync(destino)) fs.copyFileSync(ARCHIVO, destino);
  const viejos = fs.readdirSync(dir).filter((f) => /^datos-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse().slice(DIAS_RESPALDO);
  for (const f of viejos) fs.unlinkSync(path.join(dir, f));
}

const servidor = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `localhost:${PUERTO}` && req.headers.host !== `127.0.0.1:${PUERTO}`) return responder(res, 403, 'text/plain', 'No permitido.');
    const u = new URL(req.url, `http://localhost:${PUERTO}`);
    const dePagina = req.headers['x-casa-noah'] === '1';

    if (u.pathname === '/calendario') {
      if (!dePagina) return responder(res, 403, 'text/plain', 'No permitido.');
      const [code, txt] = await traerCalendario(u.searchParams.get('url') || '');
      return responder(res, code, code === 200 ? 'text/calendar; charset=utf-8' : 'text/plain; charset=utf-8', txt);
    }

    if (u.pathname === '/datos') {
      if (!dePagina) return responder(res, 403, 'text/plain', 'No permitido.');
      if (req.method === 'GET') {
        if (!fs.existsSync(ARCHIVO)) return responder(res, 404, 'text/plain', 'Sin datos todavía.');
        return responder(res, 200, 'application/json; charset=utf-8', fs.readFileSync(ARCHIVO));
      }
      if (req.method === 'POST') {
        let txt = '';
        for await (const parte of req) { txt += parte; if (txt.length > MAX) return responder(res, 413, 'text/plain', 'Demasiado grande.'); }
        try { guardarDatos(txt); } catch (e) { return responder(res, 400, 'text/plain', 'Datos no válidos.'); }
        return responder(res, 200, 'text/plain', 'ok');
      }
      return responder(res, 405, 'text/plain', 'No permitido.');
    }

    if (req.method !== 'GET') return responder(res, 405, 'text/plain', 'No permitido.');
    const rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
    const archivo = path.resolve(RAIZ, '.' + rel);
    const tipo = TIPOS[path.extname(archivo).toLowerCase()];
    const dentro = archivo.startsWith(RAIZ + path.sep) && !archivo.startsWith(CARPETA_DATOS + path.sep) && !rel.includes('/.');
    if (!tipo || !dentro || !fs.existsSync(archivo) || archivo === __filename) return responder(res, 404, 'text/plain', 'No encontrado.');
    return responder(res, 200, tipo, fs.readFileSync(archivo));
  } catch (e) {
    return responder(res, 500, 'text/plain', 'Error interno.');
  }
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.log('Casa de Noah ya está abierta. Ve al navegador: http://localhost:' + PUERTO);
  else console.log('No se pudo abrir Casa de Noah:', e.message);
  process.exit(1);
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  const dir = `http://localhost:${PUERTO}`;
  console.log(`Casa de Noah está abierta en ${dir}\nNo cierres esta ventana mientras la uses.`);
  if (!process.env.SIN_NAVEGADOR) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
    require('child_process').exec(`${cmd} ${dir}`);
  }
});
