// Pruebas del programa local (servidor.js). Correr: node tests/servidor.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const M = require('../js/engine.js');

const PUERTO = 18642;
const datosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noah-'));
const BASE = `http://localhost:${PUERTO}`;
const CAB = { 'X-Casa-Noah': '1' };

let ok = 0;
async function t(nombre, fn) { try { await fn(); ok++; } catch (e) { console.error('FALLA:', nombre, '\n ', e.message); process.exitCode = 1; } }

(async () => {
  const raiz = path.join(__dirname, '..');
  const srv = spawn(process.execPath, [path.join(raiz, 'servidor.js')], { env: { ...process.env, PUERTO, CARPETA_DATOS: datosDir, SIN_NAVEGADOR: '1' } });
  await new Promise((res) => srv.stdout.once('data', res));
  try {
    await t('muestra la página', async () => {
      const r = await fetch(BASE + '/');
      assert.strictEqual(r.status, 200);
      assert.match(await r.text(), /Casa de Noah/);
      assert.strictEqual((await fetch(BASE + '/js/engine.js')).status, 200);
    });
    await t('no entrega archivos de fuera ni ocultos', async () => {
      for (const p of ['/../package.json', '/%2e%2e/%2e%2e/etc/passwd', '/.git/config', '/servidor.js', '/datos/datos.json', '/README.md']) {
        assert.strictEqual((await fetch(BASE + p)).status, 404, p);
      }
    });
    await t('rechaza pedidos sin el encabezado de la página', async () => {
      assert.strictEqual((await fetch(BASE + '/datos')).status, 403);
      assert.strictEqual((await fetch(BASE + '/calendario?url=x')).status, 403);
    });
    await t('guarda y lee datos en archivo', async () => {
      assert.strictEqual((await fetch(BASE + '/datos', { headers: CAB })).status, 404);
      const datos = { v: 1, habitaciones: [{ id: 'a', nombre: 'Raulí' }], directas: [], cache: {} };
      let r = await fetch(BASE + '/datos', { method: 'POST', headers: CAB, body: JSON.stringify(datos) });
      assert.strictEqual(r.status, 200);
      r = await fetch(BASE + '/datos', { headers: CAB });
      assert.deepStrictEqual(await r.json(), datos);
      await fetch(BASE + '/datos', { method: 'POST', headers: CAB, body: JSON.stringify({ ...datos, directas: [1] }) });
      assert.ok(fs.existsSync(path.join(datosDir, 'datos-anterior.json')));
    });
    await t('no guarda basura ni pisa los datos', async () => {
      const antes = fs.readFileSync(path.join(datosDir, 'datos.json'), 'utf8');
      const r = await fetch(BASE + '/datos', { method: 'POST', headers: CAB, body: 'no es json' });
      assert.strictEqual(r.status, 400);
      assert.strictEqual(fs.readFileSync(path.join(datosDir, 'datos.json'), 'utf8'), antes);
    });
    await t('solo trae calendarios de las plataformas', async () => {
      const r = await fetch(BASE + '/calendario?url=' + encodeURIComponent('https://ejemplo.com/a.ics'), { headers: CAB });
      assert.strictEqual(r.status, 400);
    });
  } finally { srv.kill(); }

  await t('servidor de Windows usa la misma lista de sitios', async () => {
    const ps = fs.readFileSync(path.join(raiz, 'servidor.ps1'), 'utf8');
    const lista = /\$Dominios = @\(([^)]*)\)/.exec(ps)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
    assert.deepStrictEqual(lista, M.DOMINIOS);
    assert.strictEqual(ps.charCodeAt(0), 0xfeff, 'servidor.ps1 debe empezar con BOM para que Windows lea las tildes');
  });
  console.log(`${ok} pruebas del programa local pasaron`);
})();
