// Casa de Noah: pantallas. La lógica está en js/engine.js (window.Motor).
(function () {
  'use strict';
  const M = window.Motor;
  const CLAVE = 'casadenoah';
  const HABS_CASA = ['Cabaña', 'Roble', 'Raulí', 'Arrayán', 'Lingue', 'Ciprés'];
  const DIAS_SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const AUTO_MIN = 30;

  let S = M.nuevo();
  let enArchivo = false; // true cuando el programa local guarda en datos/datos.json
  let avisoGuardado = '';
  let demo = null; // datos de ejemplo en memoria, nunca se guardan
  let desde = M.addDays(M.hoyLocal(), -1);
  let errores = {}; // habId -> { fuente: mensaje }
  let ultima = null;
  let actualizando = false;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = () => demo || S;
  const uid = () => Math.random().toString(36).slice(2, 9);

  const CAB = { 'X-Casa-Noah': '1' };

  // Lee los datos: primero el archivo del computador; si no existe, lo que había en el navegador.
  async function cargar() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { /* sin datos en el navegador */ }
    try {
      const r = await fetch('/datos', { headers: CAB, cache: 'no-store' });
      enArchivo = true;
      if (r.ok) return revisarVersion(await r.json());
      if (r.status !== 404) throw new Error('Error ' + r.status);
      const s = revisarVersion(local);
      if (local) { S = s; guardar(); } // pasa lo del navegador al archivo
      return s;
    } catch (e) {
      enArchivo = false;
      avisoGuardado = 'Abre Casa de Noah con el archivo "Abrir Casa de Noah". Así se guarda en el computador y se leen los calendarios.';
      return revisarVersion(local);
    }
  }
  function revisarVersion(raw) {
    if (raw && raw.v > M.VERSION) alert('Estos datos son de una versión más nueva del programa. Descarga la versión nueva.');
    return M.migrate(raw);
  }

  let colaGuardar = Promise.resolve();
  function guardar() {
    if (demo) return;
    const txt = JSON.stringify(S);
    try { localStorage.setItem(CLAVE, txt); } catch (e) { /* el archivo es la copia principal */ }
    if (!enArchivo) return;
    colaGuardar = colaGuardar.then(async () => {
      try {
        const r = await fetch('/datos', { method: 'POST', headers: { ...CAB, 'Content-Type': 'application/json' }, body: txt });
        if (!r.ok) throw new Error();
        if (avisoGuardado) { avisoGuardado = ''; render(); }
      } catch (e) {
        avisoGuardado = 'No se pudo guardar en el computador. ¿Se cerró la ventana de Casa de Noah? Vuelve a abrirla.';
        render();
      }
    });
  }

  function fechaLarga(f) { const d = new Date(f + 'T12:00'); return `${DIAS_SEM[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; }
  function pill(fuente) { const f = M.FUENTES[fuente]; return `<span class="pill" style="background:${f.color}">${f.nombre}</span>`; }
  function nombreHab(id) { const h = D().habitaciones.find((x) => x.id === id); return h ? h.nombre : '(habitación borrada)'; }

  // ---------- Traer calendarios ----------
  async function actualizar() {
    if (demo || actualizando || !enArchivo) return;
    const tareas = [];
    for (const h of S.habitaciones) {
      for (const fuente of ['airbnb', 'booking', 'expedia']) {
        const url = (h.enlaces || {})[fuente];
        if (url) tareas.push({ h, fuente, url });
      }
    }
    if (!tareas.length) return;
    actualizando = true;
    const btn = $('#btnActualizar');
    btn.disabled = true; btn.textContent = 'Actualizando…';
    errores = {};
    await Promise.all(tareas.map(async ({ h, fuente, url }) => {
      try {
        let txt;
        if (M.esSimulado(url)) txt = M.icsSimulado(url, M.hoyLocal());
        else {
          const r = await fetch('/calendario?url=' + encodeURIComponent(url), { headers: CAB });
          txt = await r.text();
          if (!r.ok) throw new Error(txt || 'Error ' + r.status);
        }
        const eventos = M.parseICS(txt);
        S.cache[h.id] = S.cache[h.id] || {};
        S.cache[h.id][fuente] = { eventos, at: Date.now() };
      } catch (e) {
        (errores[h.id] = errores[h.id] || {})[fuente] = e.message && e.message.length < 140 ? e.message : 'No se pudo leer el calendario.';
      }
    }));
    // Borra lo guardado de enlaces que ya no existen.
    for (const h of S.habitaciones) {
      for (const f of Object.keys(S.cache[h.id] || {})) if (!(h.enlaces || {})[f]) delete S.cache[h.id][f];
    }
    ultima = new Date();
    guardar();
    actualizando = false;
    btn.disabled = false; btn.textContent = 'Actualizar ahora';
    render();
  }

  // ---------- Render ----------
  function render() {
    const d = D();
    const hayHabs = d.habitaciones.length > 0;
    $('#demoBanner').hidden = !demo;
    $('#vacio').hidden = hayHabs || tabActual() === 'config';
    $('#resumen').hidden = !hayHabs;
    $('#alertas').hidden = !hayHabs;
    document.querySelectorAll('.tab').forEach((t) => { t.hidden = !(hayHabs || tabActual() === 'config') || t.id !== 'tab-' + tabActual(); });
    const nErr = Object.values(errores).reduce((n, e) => n + Object.keys(e).length, 0);
    $('#actualizado').textContent = demo ? 'Datos de ejemplo'
      : ultima ? `Actualizado ${ultima.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}${nErr ? ` · ${nErr} enlace(s) con problema` : ''}`
      : hayHabs ? 'Sin actualizar todavía' : '';
    const haySim = !demo && S.habitaciones.some((h) => Object.values(h.enlaces || {}).some(M.esSimulado));
    $('#avisoSimulado').hidden = !haySim;
    $('#btnSimular').hidden = !!demo || !S.habitaciones.length;
    $('#btnQuitarSim').hidden = !haySim;
    $('#avisoGuardado').hidden = !avisoGuardado || !!demo;
    $('#avisoGuardado').textContent = avisoGuardado;
    renderResumen(); renderAlertas(); renderGrilla(); renderDirectas(); renderConfig(); renderLeyenda();
  }

  function renderLeyenda() {
    $('#leyenda').innerHTML = Object.values(M.FUENTES).map((f) => `<span><i style="background:${f.color}"></i>${f.nombre}</span>`).join('')
      + '<span><i style="background:var(--libre);border:1px solid #bfe3cc"></i>Libre</span>'
      + '<span><i class="rayado" style="--c:#888"></i>Rayado: cerrado, sin detalle</span>'
      + '<span><i style="background:var(--choque)"></i>¡Doble reserva!</span>';
  }

  function renderResumen() {
    const d = D(); const hoy = M.hoyLocal();
    const r = M.resumenDia(d.habitaciones, d.cache, d.directas, hoy);
    const r7 = Array.from({ length: 7 }, (_, i) => M.resumenDia(d.habitaciones, d.cache, d.directas, M.addDays(hoy, i)).libres);
    const lista = (xs) => xs.length ? xs.map((x) => esc(x.hab.nombre)).join(', ') : 'Ninguna';
    $('#resumen').innerHTML = `
      <div class="tarjeta"><div class="det">Libres esta noche</div><div class="num">${r.libres} <span class="det">de ${d.habitaciones.length}</span></div></div>
      <div class="tarjeta"><div class="det">Llegan hoy</div><div class="num">${r.llegadas.length}</div><div class="det">${lista(r.llegadas)}</div></div>
      <div class="tarjeta"><div class="det">Se van hoy</div><div class="num">${r.salidas.length}</div><div class="det">${lista(r.salidas)}</div></div>
      <div class="tarjeta"><div class="det">Noches libres próximos 7 días</div><div class="num">${r7.reduce((a, b) => a + b, 0)}</div><div class="det">${r7.join(' · ')}</div></div>`;
  }

  function renderAlertas() {
    const d = D();
    const c = M.choques(d.habitaciones, d.cache, d.directas, M.hoyLocal());
    let html = c.map((x) => `<div class="alerta"><b>Posible doble reserva:</b> ${esc(x.hab.nombre)} desde el ${fechaLarga(x.desde)} — ${x.fuentes.map(pill).join(' y ')}. Revisa y cancela una de las dos.</div>`).join('');
    for (const [hid, e] of Object.entries(errores)) {
      for (const [f, msg] of Object.entries(e)) html += `<div class="alerta">No se pudo leer ${M.FUENTES[f].nombre} de ${esc(nombreHab(hid))}: ${esc(msg)}</div>`;
    }
    $('#alertas').innerHTML = html;
  }

  function renderGrilla() {
    const d = D(); const dias = +$('#dias').value; const hoy = M.hoyLocal();
    const g = M.grilla(d.habitaciones, d.cache, d.directas, desde, dias);
    const fechas = g.length ? g[0].celdas.map((c) => c.fecha) : Array.from({ length: dias }, (_, i) => M.addDays(desde, i));
    let mesPrev = '';
    const cab = fechas.map((f) => {
      const dt = new Date(f + 'T12:00'); const dow = dt.getDay();
      const mes = MESES[dt.getMonth()]; const mostrarMes = mes !== mesPrev; mesPrev = mes;
      return `<th class="${f === hoy ? 'hoy' : ''} ${dow === 0 || dow === 6 ? 'finde' : ''}">${DIAS_SEM[dow]}<br><b>${dt.getDate()}</b>${mostrarMes ? '<br>' + mes : ''}</th>`;
    }).join('');
    const filas = g.map((fila) => {
      const tds = fila.celdas.map((c) => {
        const hoyc = c.fecha === hoy ? ' hoycol' : '';
        if (c.estado === 'libre') return `<td class="libre${hoyc}" data-h="${fila.hab.id}" data-f="${c.fecha}" title="Libre"></td>`;
        if (c.estado === 'choque') return `<td class="choque${hoyc}" data-h="${fila.hab.id}" data-f="${c.fecha}" title="Doble reserva">!</td>`;
        if (c.estado === 'bloqueado') return `<td class="bloqueado${hoyc}" style="--c:${M.FUENTES[c.fuente].color}" data-h="${fila.hab.id}" data-f="${c.fecha}" title="Cerrado en ${M.FUENTES[c.fuente].nombre} (sin detalle)">${M.FUENTES[c.fuente].nombre[0]}</td>`;
        const f = M.FUENTES[c.fuente];
        return `<td class="ocupado${hoyc}" style="background:${f.color}" data-h="${fila.hab.id}" data-f="${c.fecha}" title="${f.nombre}">${f.nombre[0]}</td>`;
      }).join('');
      return `<tr class="${errores[fila.hab.id] ? 'err' : ''}"><th class="hab">${esc(fila.hab.nombre)}</th>${tds}</tr>`;
    }).join('');
    $('#grilla').innerHTML = `<thead><tr><th class="hab"></th>${cab}</tr></thead><tbody>${filas}</tbody>`;
  }

  function detalleCelda(habId, fecha) {
    const d = D();
    const ev = M.eventosDe(habId, d.cache, d.directas);
    const est = M.estadoDia(ev, fecha);
    if (est.estado === 'libre') {
      irTab('directas');
      $('#dHab').value = habId; $('#dLlegada').value = fecha; $('#dSalida').value = M.addDays(fecha, 1);
      $('#dNombre').focus();
      return;
    }
    const filas = est.eventos.map((e) => `<li>${pill(e.fuente)} ${fechaLarga(e.start)} → ${fechaLarga(e.end)} (${M.diffDays(e.start, e.end)} noche${M.diffDays(e.start, e.end) === 1 ? '' : 's'})<br><span class="suave">${esc(e.summary)}${e.bloqueo ? ' · solo bloqueo' : ''}</span></li>`).join('');
    $('#dlgBody').innerHTML = `<h2>${esc(nombreHab(habId))} · ${fechaLarga(fecha)}</h2>
      ${est.estado === 'choque' ? '<p class="alerta">Dos plataformas vendieron esta noche. Cancela una de las reservas.</p>' : ''}
      <ul>${filas}</ul>`;
    $('#dlg').showModal();
  }

  // ---------- Reservas directas ----------
  function renderDirectas() {
    const d = D();
    $('#dHab').innerHTML = d.habitaciones.map((h) => `<option value="${h.id}">${esc(h.nombre)}</option>`).join('');
    const hoy = M.hoyLocal();
    const prox = d.directas.filter((x) => x.end >= hoy).sort((a, b) => (a.start < b.start ? -1 : 1));
    $('#listaDirectas').innerHTML = prox.length
      ? `<table class="lista"><tr><th>Habitación</th><th>Llegada</th><th>Salida</th><th>Nombre o nota</th><th></th></tr>${prox.map((x) => `<tr><td>${esc(nombreHab(x.hab))}</td><td>${fechaLarga(x.start)}</td><td>${fechaLarga(x.end)}</td><td>${esc(x.nombre)}</td><td><button class="peligro" data-borrar-directa="${x.id}">Borrar</button></td></tr>`).join('')}</table>`
      : '<p class="suave">No hay reservas directas próximas.</p>';
  }

  // ---------- Configuración ----------
  function renderConfig() {
    if (tabActual() !== 'config') return;
    const d = D();
    $('#listaHabs').innerHTML = (d.habitaciones.length ? '' : `<p>Aún no hay habitaciones. <button id="btnCargarCasa">Cargar las 6 de Casa de Noah</button></p>`)
      + d.habitaciones.map((h) => {
        const est = ['airbnb', 'booking', 'expedia'].map((f) => {
          if (!(h.enlaces || {})[f]) return null;
          const err = (errores[h.id] || {})[f];
          const c = ((d.cache[h.id] || {})[f]);
          return err ? `<span class="mal">${M.FUENTES[f].nombre}: ${esc(err)}</span>`
            : c ? `${M.FUENTES[f].nombre}: ${c.eventos.length} fechas leídas` : `${M.FUENTES[f].nombre}: pendiente`;
        }).filter(Boolean).join(' · ');
        return `<div class="hab-card" data-hab="${h.id}">
          <label>Nombre <input data-campo="nombre" value="${esc(h.nombre)}" maxlength="40"></label>
          ${['airbnb', 'booking', 'expedia'].map((f) => `<label>Enlace ${M.FUENTES[f].nombre} <input data-campo="${f}" value="${esc((h.enlaces || {})[f] || '')}" placeholder="https://…"></label>`).join('')}
          <button class="peligro" data-borrar-hab="${h.id}">Quitar</button>
          <div class="estado">${est || 'Sin enlaces todavía.'}</div>
        </div>`;
      }).join('');
  }

  function cambiarCampo(input) {
    if (demo) { alert('En el ejemplo no se guardan cambios. Sal del ejemplo primero.'); render(); return; }
    const card = input.closest('[data-hab]');
    const h = S.habitaciones.find((x) => x.id === card.dataset.hab);
    const campo = input.dataset.campo; const val = input.value.trim();
    if (campo === 'nombre') { h.nombre = val || 'Sin nombre'; }
    else {
      if (val && !M.enlaceValido(val) && !M.esSimulado(val)) { alert('Ese enlace no parece de ' + M.FUENTES[campo].nombre + '. Debe empezar con https:// y ser de la plataforma.'); input.value = (h.enlaces || {})[campo] || ''; return; }
      h.enlaces = h.enlaces || {}; h.enlaces[campo] = val;
    }
    guardar(); render();
    if (campo !== 'nombre' && val) actualizar();
  }

  // ---------- Navegación ----------
  function tabActual() { return ($('#tabs .on') || {}).dataset?.tab || 'calendario'; }
  function irTab(t) {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    render();
  }

  // ---------- Datos de ejemplo (inventados) ----------
  function crearDemo() {
    const hoy = M.hoyLocal();
    const habitaciones = HABS_CASA.map((n, i) => ({ id: 'e' + i, nombre: n, enlaces: {} }));
    const cache = {};
    const ev = (a, b, s) => ({ start: M.addDays(hoy, a), end: M.addDays(hoy, b), summary: s });
    const reservas = {
      e0: { airbnb: [ev(-2, 2, 'Reserved'), ev(6, 9, 'Reserved')], booking: [ev(-2, 2, 'CLOSED - Not available'), ev(12, 15, 'Reserva')] },
      e1: { booking: [ev(0, 3, 'Reserva'), ev(8, 11, 'Reserva')], expedia: [ev(4, 6, 'Reserva')] },
      e2: { airbnb: [ev(1, 4, 'Reserved')], booking: [ev(3, 5, 'Reserva')] },
      e3: { expedia: [ev(-1, 1, 'Reserva'), ev(9, 13, 'Reserva')] },
      e4: { booking: [ev(5, 7, 'Reserva')], airbnb: [ev(14, 16, 'Airbnb (Not available)')] },
      e5: { airbnb: [ev(2, 6, 'Reserved')] },
    };
    for (const [h, porF] of Object.entries(reservas)) {
      cache[h] = {};
      for (const [f, eventos] of Object.entries(porF)) cache[h][f] = { eventos };
    }
    const directas = [{ id: 'x1', hab: 'e3', start: M.addDays(hoy, 3), end: M.addDays(hoy, 5), nombre: 'Huésped de ejemplo' }];
    return { v: M.VERSION, habitaciones, cache, directas };
  }

  // ---------- Eventos ----------
  $('#tabs').addEventListener('click', (e) => { if (e.target.dataset.tab) irTab(e.target.dataset.tab); });
  $('#btnActualizar').addEventListener('click', actualizar);
  $('#prev').addEventListener('click', () => { desde = M.addDays(desde, -7); renderGrilla(); });
  $('#next').addEventListener('click', () => { desde = M.addDays(desde, 7); renderGrilla(); });
  $('#hoy').addEventListener('click', () => { desde = M.addDays(M.hoyLocal(), -1); renderGrilla(); });
  $('#dias').addEventListener('change', renderGrilla);
  $('#grilla').addEventListener('click', (e) => { const td = e.target.closest('td[data-h]'); if (td) detalleCelda(td.dataset.h, td.dataset.f); });
  $('#btnDemo').addEventListener('click', () => { demo = crearDemo(); irTab('calendario'); });
  $('#btnSalirDemo').addEventListener('click', () => { demo = null; render(); });
  $('#btnEmpezar').addEventListener('click', () => irTab('config'));

  $('#formBuscar').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = D(); const a = $('#bLlegada').value; const b = $('#bSalida').value;
    if (b <= a) { $('#resultadoBuscar').innerHTML = '<p class="aviso">La salida debe ser después de la llegada.</p>'; return; }
    const libres = M.libres(d.habitaciones, d.cache, d.directas, a, b);
    const n = M.diffDays(a, b);
    $('#resultadoBuscar').innerHTML = libres.length
      ? `<p>Para ${n} noche${n === 1 ? '' : 's'} (${fechaLarga(a)} → ${fechaLarga(b)}) están libres:</p><ul>${libres.map((h) => `<li class="libre-ok">${esc(h.nombre)}</li>`).join('')}</ul>`
      : `<p class="aviso">No hay ninguna habitación libre todas esas noches.</p>`;
  });

  $('#formDirecta').addEventListener('submit', (e) => {
    e.preventDefault();
    if (demo) { alert('En el ejemplo no se guardan cambios.'); return; }
    const r = { id: uid(), hab: $('#dHab').value, start: $('#dLlegada').value, end: $('#dSalida').value, nombre: $('#dNombre').value.trim() };
    if (r.end <= r.start) { alert('La salida debe ser después de la llegada.'); return; }
    const ocupada = !M.libres(S.habitaciones.filter((h) => h.id === r.hab), S.cache, S.directas, r.start, r.end).length;
    if (ocupada && !confirm('Esa habitación ya está ocupada alguna de esas noches. ¿Anotar igual?')) return;
    S.directas.push(r); guardar();
    $('#formDirecta').reset();
    $('#dAviso').hidden = false;
    $('#dAviso').textContent = `Anotada. Recuerda cerrar ${nombreHab(r.hab)} del ${fechaLarga(r.start)} al ${fechaLarga(r.end)} en Airbnb, Booking y Expedia.`;
    render();
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset.borrarDirecta && !demo && confirm('¿Borrar esta reserva directa?')) {
      S.directas = S.directas.filter((x) => x.id !== t.dataset.borrarDirecta); guardar(); render();
    }
    if (t.dataset.borrarHab && !demo) {
      const h = S.habitaciones.find((x) => x.id === t.dataset.borrarHab);
      if (confirm(`¿Quitar la habitación ${h.nombre}?`)) {
        S.habitaciones = S.habitaciones.filter((x) => x.id !== h.id); delete S.cache[h.id]; guardar(); render();
      }
    }
    if (t.id === 'btnCargarCasa' && !demo) {
      S.habitaciones = HABS_CASA.map((n) => ({ id: uid(), nombre: n, enlaces: {} })); guardar(); render();
    }
  });
  $('#listaHabs').addEventListener('change', (e) => { if (e.target.dataset.campo) cambiarCampo(e.target); });
  $('#btnAgregarHab').addEventListener('click', () => {
    if (demo) { alert('En el ejemplo no se guardan cambios.'); return; }
    S.habitaciones.push({ id: uid(), nombre: 'Habitación ' + (S.habitaciones.length + 1), enlaces: {} }); guardar(); render();
  });

  $('#btnSimular').addEventListener('click', () => {
    let n = 0;
    S.habitaciones.forEach((h, i) => {
      h.enlaces = h.enlaces || {};
      for (const f of ['airbnb', 'booking', 'expedia']) if (!h.enlaces[f]) { h.enlaces[f] = M.enlaceSimulado(f, i); n++; }
    });
    if (!n) { alert('Todas las habitaciones ya tienen sus 3 enlaces.'); return; }
    guardar(); render(); actualizar();
  });
  $('#btnQuitarSim').addEventListener('click', () => {
    if (!confirm('¿Quitar todos los enlaces simulados? Los enlaces reales se mantienen.')) return;
    for (const h of S.habitaciones) for (const f of Object.keys(h.enlaces || {})) if (M.esSimulado(h.enlaces[f])) { h.enlaces[f] = ''; if (S.cache[h.id]) delete S.cache[h.id][f]; }
    guardar(); render();
  });
  $('#btnRespaldo').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `casa-de-noah-respaldo-${M.hoyLocal()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#fileRespaldo').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const datos = M.migrate(JSON.parse(await f.text()));
      if (!confirm(`El respaldo tiene ${datos.habitaciones.length} habitaciones y ${datos.directas.length} reservas directas. ¿Reemplazar lo que hay ahora?`)) return;
      S = datos; demo = null; guardar(); render(); actualizar();
    } catch (err) { alert('Ese archivo no es un respaldo válido.'); }
    e.target.value = '';
  });

  // ---------- Inicio ----------
  cargar().then((datos) => { S = datos; render(); actualizar(); });
  setInterval(() => { if (!document.hidden) actualizar(); }, AUTO_MIN * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ultima && Date.now() - ultima > AUTO_MIN * 60 * 1000) actualizar(); });
})();
