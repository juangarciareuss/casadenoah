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
  assert.deepStrictEqual(s.detalles, {});
  assert.strictEqual(s.comisiones.booking, 15);
  const v1 = M.migrate({ v: 1, habitaciones: [{ id: 'h' }], directas: [{ id: 'd', hab: 'h', start: '2026-01-01', end: '2026-01-02', nombre: 'X' }], cache: { h: {} } });
  assert.strictEqual(v1.directas[0].nombre, 'X', 'los datos de la versión 1 se mantienen');
  assert.strictEqual(M.migrate({ comisiones: { airbnb: 3 } }).comisiones.airbnb, 3);
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

t('noche solo "cerrada" con Booking presente es reserva de Booking', () => {
  const ev = [
    { start: '2026-12-01', end: '2026-12-03', fuente: 'airbnb', bloqueo: true },
    { start: '2026-12-01', end: '2026-12-03', fuente: 'booking', bloqueo: true },
  ];
  const e = M.estadoDia(ev, '2026-12-02');
  assert.deepStrictEqual([e.estado, e.fuente], ['reservado', 'booking']);
  const solo = M.estadoDia([{ start: '2026-12-01', end: '2026-12-03', fuente: 'airbnb', bloqueo: true }], '2026-12-01');
  assert.strictEqual(solo.estado, 'bloqueado', 'cerrado a mano en Airbnb no es reserva');
});

t('enlaces simulados: válidos, estables y con una doble reserva visible', () => {
  const hoy = '2026-11-08';
  assert.ok(M.esSimulado(M.enlaceSimulado('airbnb', 3)));
  assert.ok(!M.esSimulado('simulado:otra:1'));
  assert.ok(!M.enlaceValido('simulado:airbnb:1'), 'el servidor nunca debe recibir simulados');
  assert.strictEqual(M.icsSimulado('simulado:booking:1', hoy), M.icsSimulado('simulado:booking:1', hoy));
  const habs = [0, 1, 2, 3].map((i) => ({ id: 'h' + i, nombre: 'H' + i }));
  const cache = {};
  habs.forEach((h, i) => { cache[h.id] = {}; for (const f of ['airbnb', 'booking', 'expedia']) cache[h.id][f] = { eventos: M.parseICS(M.icsSimulado(M.enlaceSimulado(f, i), hoy)) }; });
  const c = M.choques(habs, cache, [], hoy);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].hab.id, 'h2');
  assert.ok(M.diffDays(hoy, c[0].desde) <= 6);
  // Cada estadía se ve como reservada en su plataforma, no como choque falso.
  const g = M.grilla(habs.slice(0, 2), cache, [], hoy, 30);
  assert.ok(g.every((f) => f.celdas.every((x) => x.estado !== 'choque')));
  const fuentes = new Set(g.flatMap((f) => f.celdas.filter((x) => x.estado !== 'libre').map((x) => x.fuente)));
  assert.deepStrictEqual([...fuentes].sort(), ['airbnb', 'booking', 'expedia']);
});

t('llegadas y salidas de Booking aunque diga "cerrado"', () => {
  const c = { h1: { booking: { eventos: [{ start: '2026-12-01', end: '2026-12-03', summary: 'CLOSED - Not available' }] } } };
  const h = [{ id: 'h1', nombre: 'P1' }];
  assert.deepStrictEqual(M.resumenDia(h, c, [], '2026-12-01').llegadas.map((x) => x.fuente), ['booking']);
  assert.deepStrictEqual(M.resumenDia(h, c, [], '2026-12-03').salidas.map((x) => x.fuente), ['booking']);
  assert.strictEqual(M.resumenDia(h, c, [], '2026-12-02').llegadas.length, 0);
});

t('estadías: sin ecos y con Booking aunque diga cerrado', () => {
  const c = { h1: {
    airbnb: { eventos: [{ start: '2026-12-01', end: '2026-12-03', summary: 'Reserved' }, { start: '2026-12-05', end: '2026-12-07', summary: 'Airbnb (Not available)' }] },
    booking: { eventos: [{ start: '2026-12-01', end: '2026-12-03', summary: 'CLOSED - Not available' }, { start: '2026-12-05', end: '2026-12-07', summary: 'CLOSED - Not available' }] },
  } };
  const d = [{ id: 'x', hab: 'h1', start: '2026-12-10', end: '2026-12-11', nombre: 'Ana Prueba', monto: 50000 }];
  const est = M.estadias([{ id: 'h1', nombre: 'P' }], c, d, '2026-12-01', '2027-01-01');
  assert.deepStrictEqual(est.map((e) => [e.fuente, e.start, e.noches]), [['airbnb', '2026-12-01', 2], ['booking', '2026-12-05', 2], ['directa', '2026-12-10', 1]]);
});

t('ganancias: bruto, comisión, neto y ocupación', () => {
  const habs = [{ id: 'h1', nombre: 'P1' }, { id: 'h2', nombre: 'P2' }];
  const c = { h1: { airbnb: { eventos: [{ start: '2026-12-01', end: '2026-12-03', summary: 'Reserved' }] }, booking: { eventos: [{ start: '2026-12-20', end: '2026-12-22', summary: 'CLOSED - Not available' }] } } };
  const d = [{ id: 'x', hab: 'h2', start: '2026-12-10', end: '2026-12-11', nombre: 'Ana Prueba', monto: 50000 }];
  const det = { 'h1|airbnb|2026-12-01|2026-12-03': { nombre: 'Luis Prueba', monto: 100000 } };
  const g = M.ganancias(habs, c, d, det, { airbnb: 10 }, '2026-12-01', '2027-01-01');
  assert.strictEqual(g.bruto, 150000);
  assert.strictEqual(g.comision, 10000);
  assert.strictEqual(g.neto, 140000);
  assert.strictEqual(g.sinValor, 1, 'la de Booking no tiene valor');
  assert.strictEqual(g.porFuente.airbnb.neto, 90000);
  assert.strictEqual(g.porHab.h2.neto, 50000);
  assert.deepStrictEqual([g.nochesOcupadas, g.nochesTotales], [5, 62]);
  assert.strictEqual(g.estadias.find((e) => e.fuente === 'airbnb').nombre, 'Luis Prueba');
});

t('llegadas traen la clave de la reserva para mostrar el nombre', () => {
  const c = { h1: { airbnb: { eventos: [{ start: '2026-12-01', end: '2026-12-03', summary: 'Reserved' }] } } };
  const r = M.resumenDia([{ id: 'h1', nombre: 'P' }], c, [], '2026-12-01');
  assert.strictEqual(r.llegadas[0].clave, 'h1|airbnb|2026-12-01|2026-12-03');
  const det = M.detalleDe(r.llegadas[0], { [r.llegadas[0].clave]: { nombre: 'Ana Prueba', telefono: '+56 9 0000 0000' } }, []);
  assert.deepStrictEqual([det.nombre, det.telefono, det.notas], ['Ana Prueba', '+56 9 0000 0000', '']);
});

t('planilla para Excel', () => {
  const habs = [{ id: 'h1', nombre: 'Raulí' }];
  const d = [{ id: 'x', hab: 'h1', start: '2026-12-10', end: '2026-12-12', nombre: 'Ana; "Prueba"', monto: 100000, notas: 'Llega tarde' }];
  const csv = M.csvGanancias(M.ganancias(habs, {}, d, {}, {}, '2026-12-01', '2027-01-01'));
  const lineas = csv.split('\r\n');
  assert.strictEqual(lineas[0].split(';')[2], 'Habitación');
  assert.ok(lineas[1].includes('"Ana; ""Prueba""' + '"'));
  assert.ok(lineas[1].endsWith(';2;100000;0;100000;Llega tarde'));
  assert.ok(lineas[lineas.length - 1].startsWith('Total;'));
});

console.log(`${ok} pruebas pasaron`);
