// Pruebas de la lógica. Correr: node tests/engine.test.js  (datos inventados)
const assert = require('assert');
const M = require('../js/engine.js');

let ok = 0;
function t(nombre, fn) { try { fn(); ok++; } catch (e) { console.error('FALLA:', nombre, '\n ', e.message); process.exitCode = 1; } }

const ICS_AIRBNB = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Airbnb Inc//Hosting Calendar//EN',
  'BEGIN:VEVENT', 'DTEND;VALUE=DATE:20261113', 'DTSTART;VALUE=DATE:20261110', 'UID:a1@airbnb.com', 'SUMMARY:Reserved', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTEND;VALUE=DATE:20261122', 'DTSTART;VALUE=DATE:20261120', 'UID:a2@airbnb.com', 'SUMMARY:Airbnb (Not available)', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const ICS_BOOKING = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261122', 'UID:b1', 'SUMMARY:Reserva Booking', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261112T150000Z', 'DTEND:20261114T110000Z', 'UID:b2', 'SUMMARY:Reserva', 'END:VEVENT',
  'END:VCALENDAR',
].join('\n');

t('lee eventos de Airbnb', () => {
  const ev = M.parseICS(ICS_AIRBNB);
  assert.strictEqual(ev.length, 2);
  assert.deepStrictEqual([ev[0].start, ev[0].end, ev[0].summary], ['2026-11-10', '2026-11-13', 'Reserved']);
});

t('lee fechas con hora y líneas dobladas', () => {
  const ev = M.parseICS(ICS_BOOKING.replace('SUMMARY:Reserva Booking', 'SUMMARY:Reserva\n  Booking'));
  assert.strictEqual(ev[0].summary, 'Reserva Booking');
  assert.deepStrictEqual([ev[1].start, ev[1].end], ['2026-11-12', '2026-11-14']);
});

t('rechaza algo que no es calendario', () => {
  assert.throws(() => M.parseICS('<html>login</html>'));
});

t('evento sin salida dura una noche', () => {
  const ev = M.parseICS('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261201\nEND:VEVENT\nEND:VCALENDAR');
  assert.strictEqual(ev[0].end, '2026-12-02');
});

t('distingue bloqueos de reservas', () => {
  assert.ok(M.esBloqueo('Airbnb (Not available)'));
  assert.ok(M.esBloqueo('CLOSED - Not available'));
  assert.ok(!M.esBloqueo('Reserved'));
});

const habs = [{ id: 'h1', nombre: 'Pieza 1' }, { id: 'h2', nombre: 'Pieza 2' }];
const cache = {
  h1: { airbnb: { eventos: M.parseICS(ICS_AIRBNB) }, booking: { eventos: M.parseICS(ICS_BOOKING) } },
};
const directas = [{ id: 'd1', hab: 'h2', start: '2026-11-11', end: '2026-11-12', nombre: 'Huésped Prueba' }];

t('estado por día: la salida queda libre', () => {
  const ev = M.eventosDe('h1', {}, [{ hab: 'h1', start: '2026-11-10', end: '2026-11-12' }]);
  assert.strictEqual(M.estadoDia(ev, '2026-11-11').estado, 'reservado');
  assert.strictEqual(M.estadoDia(ev, '2026-11-12').estado, 'libre');
});

t('un bloqueo que es eco de otra reserva no es choque', () => {
  const ev = M.eventosDe('h1', cache, []);
  const e = M.estadoDia(ev, '2026-11-20');
  assert.strictEqual(e.estado, 'reservado');
  assert.strictEqual(e.fuente, 'booking');
});

t('dos plataformas con reserva la misma noche es choque', () => {
  const ev = M.eventosDe('h1', cache, []);
  assert.strictEqual(M.estadoDia(ev, '2026-11-12').estado, 'choque');
  const c = M.choques(habs, cache, directas, '2026-11-01');
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].desde, '2026-11-12');
});

t('choques pasados no se muestran', () => {
  assert.strictEqual(M.choques(habs, cache, directas, '2026-11-15').length, 0);
});

t('busca habitaciones libres para un rango', () => {
  assert.deepStrictEqual(M.libres(habs, cache, directas, '2026-11-11', '2026-11-12').map((h) => h.id), []);
  assert.deepStrictEqual(M.libres(habs, cache, directas, '2026-11-12', '2026-11-14').map((h) => h.id), ['h2']);
  assert.deepStrictEqual(M.libres(habs, cache, directas, '2026-11-14', '2026-11-20').map((h) => h.id), ['h1', 'h2']);
  assert.deepStrictEqual(M.libres(habs, cache, directas, '2026-11-14', '2026-11-14'), []);
});

t('grilla tiene una fila por habitación y una celda por día', () => {
  const g = M.grilla(habs, cache, directas, '2026-11-09', 7);
  assert.strictEqual(g.length, 2);
  assert.strictEqual(g[0].celdas.length, 7);
  assert.strictEqual(g[0].celdas[0].estado, 'libre');
  assert.strictEqual(g[1].celdas[2].estado, 'reservado');
  assert.strictEqual(g[1].celdas[2].fuente, 'directa');
});

t('resumen del día', () => {
  const r = M.resumenDia(habs, cache, directas, '2026-11-10');
  assert.strictEqual(r.ocupadas, 1);
  assert.strictEqual(r.libres, 1);
  assert.strictEqual(r.llegadas.length, 1);
  const r2 = M.resumenDia(habs, cache, directas, '2026-11-13');
  assert.deepStrictEqual(r2.salidas.map((s) => s.fuente), ['airbnb']);
});

t('fechas cruzan meses y años', () => {
  assert.strictEqual(M.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(M.diffDays('2026-02-27', '2026-03-01'), 2);
});

t('migrate nunca pierde datos y arregla lo dañado', () => {
  assert.deepStrictEqual(M.migrate(null), M.nuevo());
  const s = M.migrate({ habitaciones: [{ id: 'x' }], directas: 'roto' });
  assert.strictEqual(s.habitaciones.length, 1);
  assert.deepStrictEqual(s.directas, []);
  assert.strictEqual(s.v, M.VERSION);
});

t('solo acepta enlaces de las plataformas', () => {
  assert.ok(M.enlaceValido('https://www.airbnb.com/calendar/ical/123.ics?s=abc'));
  assert.ok(M.enlaceValido('https://ical.booking.com/v1/export?t=abc'));
  assert.ok(M.enlaceValido('https://apps.expediapartnercentral.com/x.ics'));
  assert.ok(!M.enlaceValido('http://www.airbnb.com/x.ics'));
  assert.ok(!M.enlaceValido('https://airbnb.com.malo.cl/x.ics'));
  assert.ok(!M.enlaceValido('https://169.254.169.254/'));
  assert.ok(!M.enlaceValido('no es enlace'));
});

console.log(`${ok} pruebas pasaron`);
