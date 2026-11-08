// Casa de Noah: lógica sin pantalla (calendarios, disponibilidad, choques).
// Fechas como texto 'AAAA-MM-DD'. La salida (end) no se cuenta como noche ocupada.
(function (root) {
  'use strict';

  const FUENTES = {
    airbnb: { nombre: 'Airbnb', color: '#e0565b' },
    booking: { nombre: 'Booking', color: '#2b6cd8' },
    expedia: { nombre: 'Expedia', color: '#d9a400' },
    directa: { nombre: 'Directa', color: '#2e9e6a' },
  };

  // ---------- Fechas ----------
  function toDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function fmt(dt) { return dt.toISOString().slice(0, 10); }
  function addDays(s, n) { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
  function diffDays(a, b) { return Math.round((toDate(b) - toDate(a)) / 864e5); }
  function hoyLocal(now) {
    const d = now || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ---------- Lectura de iCal ----------
  function icalDate(v) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(v.trim());
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }

  function parseICS(text) {
    if (!text || !/BEGIN:VCALENDAR/i.test(text)) throw new Error('El enlace no devolvió un calendario válido.');
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const out = [];
    let ev = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (/^BEGIN:VEVENT$/i.test(line)) { ev = {}; continue; }
      if (/^END:VEVENT$/i.test(line)) {
        if (ev && ev.start) {
          if (!ev.end || ev.end <= ev.start) ev.end = addDays(ev.start, 1);
          out.push({ start: ev.start, end: ev.end, summary: ev.summary || '', uid: ev.uid || '' });
        }
        ev = null; continue;
      }
      if (!ev) continue;
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0].toUpperCase();
      const val = line.slice(i + 1);
      if (key === 'DTSTART') ev.start = icalDate(val);
      else if (key === 'DTEND') ev.end = icalDate(val);
      else if (key === 'SUMMARY') ev.summary = val.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ');
      else if (key === 'UID') ev.uid = val;
    }
    return out;
  }

  // "Bloqueo" = la plataforma solo marca la fecha como no disponible
  // (muchas veces es el eco de una reserva de otra plataforma).
  function esBloqueo(summary) {
    return /not available|no disponible|blocked|bloque|closed/i.test(summary || '');
  }

  // ---------- Armar eventos por habitación ----------
  // cache: { [habId]: { [fuente]: { eventos: [...] } } }, directas: [{id, hab, start, end, nombre}]
  function eventosDe(habId, cache, directas) {
    const out = [];
    const porFuente = (cache && cache[habId]) || {};
    for (const fuente of Object.keys(porFuente)) {
      for (const e of porFuente[fuente].eventos || []) {
        out.push({ start: e.start, end: e.end, fuente, summary: e.summary, bloqueo: esBloqueo(e.summary), clave: `${habId}|${fuente}|${e.start}|${e.end}` });
      }
    }
    for (const d of directas || []) {
      if (d.hab === habId) out.push({ start: d.start, end: d.end, fuente: 'directa', summary: d.nombre || 'Reserva directa', bloqueo: false, id: d.id, clave: 'd:' + d.id });
    }
    return out;
  }

  function ocupaNoche(e, dia) { return e.start <= dia && dia < e.end; }

  // Estado de una habitación en un día:
  // { estado: 'libre'|'reservado'|'bloqueado'|'choque', fuente, clave (de la reserva), eventos }
  // 'bloqueado' = cerrado a mano en Airbnb o Expedia, sin reserva.
  function estadoDia(eventos, dia) {
    const ahi = eventos.filter((e) => ocupaNoche(e, dia));
    if (!ahi.length) return { estado: 'libre', eventos: [] };
    const reservas = ahi.filter((e) => !e.bloqueo);
    const fuentesReserva = new Set(reservas.map((e) => e.fuente));
    if (fuentesReserva.size > 1) return { estado: 'choque', eventos: ahi };
    if (reservas.length) return { estado: 'reservado', fuente: reservas[0].fuente, clave: reservas[0].clave, eventos: ahi };
    // Todo es "no disponible". Booking marca así incluso sus propias reservas, y los ecos de
    // otras plataformas ya habrían aparecido como reserva; si está Booking, es reserva de Booking.
    const deBooking = ahi.find((e) => e.fuente === 'booking');
    if (deBooking) return { estado: 'reservado', fuente: 'booking', clave: deBooking.clave, eventos: ahi };
    return { estado: 'bloqueado', fuente: ahi[0].fuente, eventos: ahi };
  }

  function seCruzan(a, b) { return a.start < b.end && b.start < a.end; }

  // Reservas (no ecos ni cierres) que llegan entre 'desde' (incluido) y 'hasta' (excluido).
  function estadias(habitaciones, cache, directas, desde, hasta) {
    const out = [];
    for (const h of habitaciones) {
      const ev = eventosDe(h.id, cache, directas);
      const vistas = new Set();
      for (const e of ev) {
        if (e.start < desde || e.start >= hasta || vistas.has(e.clave)) continue;
        const esReserva = !e.bloqueo || (e.fuente === 'booking' && !ev.some((o) => o.fuente !== 'booking' && !o.bloqueo && seCruzan(o, e)));
        if (!esReserva) continue;
        vistas.add(e.clave);
        out.push({ clave: e.clave, hab: h, fuente: e.fuente, start: e.start, end: e.end, noches: diffDays(e.start, e.end), id: e.id });
      }
    }
    return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }

  const COMISIONES = { airbnb: 15, booking: 15, expedia: 18, directa: 0 };

  // Nombre y valor de una reserva: las directas los guardan en sí mismas; las de plataformas, en 'detalles'.
  function detalleDe(est, detalles, directas) {
    if (est.fuente === 'directa') {
      const d = (directas || []).find((x) => 'd:' + x.id === est.clave) || {};
      return { nombre: d.nombre || '', monto: Number(d.monto) || 0 };
    }
    const d = (detalles || {})[est.clave] || {};
    return { nombre: d.nombre || '', monto: Number(d.monto) || 0 };
  }

  // Ganancias de las reservas que llegan en el período. Comisiones en %.
  function ganancias(habitaciones, cache, directas, detalles, comisiones, desde, hasta) {
    const com = { ...COMISIONES, ...(comisiones || {}) };
    const r = { estadias: [], bruto: 0, comision: 0, neto: 0, sinValor: 0, porFuente: {}, porHab: {}, nochesOcupadas: 0, nochesTotales: 0 };
    for (const e of estadias(habitaciones, cache, directas, desde, hasta)) {
      const det = detalleDe(e, detalles, directas);
      const comision = Math.round(det.monto * (Number(com[e.fuente]) || 0) / 100);
      const fila = { ...e, ...det, comision, neto: det.monto - comision };
      r.estadias.push(fila);
      if (!det.monto) { r.sinValor++; continue; }
      r.bruto += det.monto; r.comision += comision; r.neto += fila.neto;
      const pf = (r.porFuente[e.fuente] = r.porFuente[e.fuente] || { reservas: 0, bruto: 0, neto: 0 });
      pf.reservas++; pf.bruto += det.monto; pf.neto += fila.neto;
      const ph = (r.porHab[e.hab.id] = r.porHab[e.hab.id] || { hab: e.hab, reservas: 0, neto: 0 });
      ph.reservas++; ph.neto += fila.neto;
    }
    const dias = diffDays(desde, hasta);
    for (const h of habitaciones) {
      const ev = eventosDe(h.id, cache, directas);
      for (let i = 0; i < dias; i++) {
        const st = estadoDia(ev, addDays(desde, i)).estado;
        r.nochesTotales++;
        if (st === 'reservado' || st === 'choque') r.nochesOcupadas++;
      }
    }
    return r;
  }

  function grilla(habitaciones, cache, directas, desde, dias) {
    const fechas = Array.from({ length: dias }, (_, i) => addDays(desde, i));
    return habitaciones.map((h) => {
      const ev = eventosDe(h.id, cache, directas);
      return { hab: h, celdas: fechas.map((f) => ({ fecha: f, ...estadoDia(ev, f) })) };
    });
  }

  // Habitaciones libres todas las noches entre llegada (incluida) y salida (excluida).
  function libres(habitaciones, cache, directas, llegada, salida) {
    if (!llegada || !salida || salida <= llegada) return [];
    return habitaciones.filter((h) => {
      const ev = eventosDe(h.id, cache, directas);
      return !ev.some((e) => e.start < salida && llegada < e.end);
    });
  }

  // Posibles dobles reservas desde 'desde' en adelante: noches donde dos plataformas tienen reserva.
  function choques(habitaciones, cache, directas, desde) {
    const out = [];
    for (const h of habitaciones) {
      const ev = eventosDe(h.id, cache, directas).filter((e) => !e.bloqueo && e.end > desde);
      for (let i = 0; i < ev.length; i++) {
        for (let j = i + 1; j < ev.length; j++) {
          const a = ev[i], b = ev[j];
          if (a.fuente !== b.fuente && a.start < b.end && b.start < a.end) {
            out.push({ hab: h, desde: a.start > b.start ? a.start : b.start, fuentes: [a.fuente, b.fuente] });
          }
        }
      }
    }
    return out.sort((x, y) => (x.desde < y.desde ? -1 : 1));
  }

  // Resumen del día: libres esta noche, llegadas y salidas.
  function resumenDia(habitaciones, cache, directas, dia) {
    const r = { libres: 0, ocupadas: 0, llegadas: [], salidas: [] };
    const ayer = addDays(dia, -1);
    for (const h of habitaciones) {
      const ev = eventosDe(h.id, cache, directas);
      const hoyE = estadoDia(ev, dia), ayerE = estadoDia(ev, ayer);
      if (hoyE.estado === 'libre') r.libres++; else r.ocupadas++;
      // Llega: una reserva empieza hoy, o la pieza pasa de libre a ocupada (Booking solo dice "cerrado").
      const empieza = ev.find((e) => !e.bloqueo && e.start === dia);
      if (empieza) r.llegadas.push({ hab: h, fuente: empieza.fuente });
      else if (hoyE.estado !== 'libre' && ayerE.estado === 'libre') r.llegadas.push({ hab: h, fuente: hoyE.fuente });
      const termina = ev.find((e) => !e.bloqueo && e.end === dia);
      if (termina) r.salidas.push({ hab: h, fuente: termina.fuente });
      else if (ayerE.estado !== 'libre' && hoyE.estado === 'libre') r.salidas.push({ hab: h, fuente: ayerE.fuente });
    }
    return r;
  }

  // ---------- Datos guardados ----------
  // v2: se agregan 'detalles' (nombre y valor por reserva) y 'comisiones'.
  const VERSION = 2;
  function nuevo() { return { v: VERSION, habitaciones: [], directas: [], cache: {}, detalles: {}, comisiones: { ...COMISIONES } }; }
  function migrate(s) {
    if (!s || typeof s !== 'object') return nuevo();
    const out = { ...nuevo(), ...s };
    out.habitaciones = Array.isArray(out.habitaciones) ? out.habitaciones : [];
    out.directas = Array.isArray(out.directas) ? out.directas : [];
    out.cache = out.cache && typeof out.cache === 'object' ? out.cache : {};
    out.detalles = out.detalles && typeof out.detalles === 'object' ? out.detalles : {};
    out.comisiones = { ...COMISIONES, ...(out.comisiones && typeof out.comisiones === 'object' ? out.comisiones : {}) };
    out.v = VERSION;
    return out;
  }

  // Solo se aceptan enlaces de las plataformas conocidas (lo mismo revisa el servidor).
  const DOMINIOS = ['airbnb.com', 'airbnb.cl', 'booking.com', 'expedia.com', 'expediapartnercentral.com', 'vrbo.com', 'hotels.com'];
  function enlaceValido(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return false;
      return DOMINIOS.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
    } catch (e) { return false; }
  }


  // ---------- Enlaces simulados (para probar sin los enlaces reales) ----------
  // Formato: "simulado:<fuente>:<n° de habitación>". Genera reservas inventadas, estables
  // durante el día, con el texto que usa cada plataforma. Incluye una doble reserva a propósito.
  function esSimulado(url) { return /^simulado:(airbnb|booking|expedia):\d+$/.test(url || ''); }
  function enlaceSimulado(fuente, n) { return `simulado:${fuente}:${n}`; }

  function azar(semilla) {
    let x = semilla >>> 0 || 1;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  }

  function estadiasSimuladas(n, hoy) {
    const r = azar(1000 + n * 7919);
    const fuentes = ['airbnb', 'booking', 'expedia'];
    const out = [];
    let d = -3 - Math.floor(r() * 3);
    while (d < 60) {
      d += Math.floor(r() * 4); // días libres
      const noches = 1 + Math.floor(r() * 4);
      out.push({ start: addDays(hoy, d), end: addDays(hoy, d + noches), fuente: fuentes[Math.floor(r() * 3)] });
      d += noches;
    }
    return out.filter((e) => e.start !== e.end);
  }

  const TEXTO_SIM = {
    airbnb: { propia: 'Reserved', eco: 'Airbnb (Not available)' },
    booking: { propia: 'CLOSED - Not available', eco: 'CLOSED - Not available' },
    expedia: { propia: 'Reservado', eco: 'Bloqueado' },
  };

  function icsSimulado(url, hoy) {
    const [, fuente, nTxt] = url.split(':');
    const n = Number(nTxt);
    const est = estadiasSimuladas(n, hoy);
    const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Casa de Noah//Simulado//ES'];
    const ev = (a, b, txt, id) => lineas.push('BEGIN:VEVENT', `DTSTART;VALUE=DATE:${a.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${b.replace(/-/g, '')}`, `UID:${id}@simulado`, `SUMMARY:${txt}`, 'END:VEVENT');
    est.forEach((e, i) => ev(e.start, e.end, e.fuente === fuente ? TEXTO_SIM[fuente].propia : TEXTO_SIM[fuente].eco, `${fuente}-${n}-${i}`));
    // Doble reserva a propósito en la tercera habitación: Airbnb y Expedia venden la misma noche.
    if (n === 2 && (fuente === 'airbnb' || fuente === 'expedia')) {
      ev(addDays(hoy, 4), addDays(hoy, 6), TEXTO_SIM[fuente].propia, `choque-${fuente}`);
    }
    lineas.push('END:VCALENDAR');
    return lineas.join('\r\n');
  }

  const api = { FUENTES, DOMINIOS, addDays, diffDays, hoyLocal, parseICS, esBloqueo, eventosDe, estadoDia, grilla, libres, choques, resumenDia, estadias, ganancias, detalleDe, COMISIONES, migrate, nuevo, VERSION, enlaceValido, esSimulado, enlaceSimulado, icsSimulado };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Motor = api;
})(typeof self !== 'undefined' ? self : this);
