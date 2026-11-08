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
        out.push({ start: e.start, end: e.end, fuente, summary: e.summary, bloqueo: esBloqueo(e.summary) });
      }
    }
    for (const d of directas || []) {
      if (d.hab === habId) out.push({ start: d.start, end: d.end, fuente: 'directa', summary: d.nombre || 'Reserva directa', bloqueo: false, id: d.id });
    }
    return out;
  }

  function ocupaNoche(e, dia) { return e.start <= dia && dia < e.end; }

  // Estado de una habitación en un día: { estado: 'libre'|'reservado'|'bloqueado'|'choque', fuente, eventos }
  function estadoDia(eventos, dia) {
    const ahi = eventos.filter((e) => ocupaNoche(e, dia));
    if (!ahi.length) return { estado: 'libre', eventos: [] };
    const reservas = ahi.filter((e) => !e.bloqueo);
    const fuentesReserva = new Set(reservas.map((e) => e.fuente));
    if (fuentesReserva.size > 1) return { estado: 'choque', eventos: ahi };
    if (reservas.length) return { estado: 'reservado', fuente: reservas[0].fuente, eventos: ahi };
    return { estado: 'bloqueado', fuente: ahi[0].fuente, eventos: ahi };
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
    for (const h of habitaciones) {
      const ev = eventosDe(h.id, cache, directas);
      if (estadoDia(ev, dia).estado === 'libre') r.libres++; else r.ocupadas++;
      for (const e of ev) {
        if (e.bloqueo) continue;
        if (e.start === dia) r.llegadas.push({ hab: h, fuente: e.fuente });
        if (e.end === dia) r.salidas.push({ hab: h, fuente: e.fuente });
      }
    }
    return r;
  }

  // ---------- Datos guardados ----------
  const VERSION = 1;
  function nuevo() { return { v: VERSION, habitaciones: [], directas: [], cache: {} }; }
  function migrate(s) {
    if (!s || typeof s !== 'object') return nuevo();
    const out = { ...nuevo(), ...s };
    out.habitaciones = Array.isArray(out.habitaciones) ? out.habitaciones : [];
    out.directas = Array.isArray(out.directas) ? out.directas : [];
    out.cache = out.cache && typeof out.cache === 'object' ? out.cache : {};
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

  const api = { FUENTES, DOMINIOS, addDays, diffDays, hoyLocal, parseICS, esBloqueo, eventosDe, estadoDia, grilla, libres, choques, resumenDia, migrate, nuevo, VERSION, enlaceValido };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Motor = api;
})(typeof self !== 'undefined' ? self : this);
