// Casa de Noah: pantallas. La lógica está en js/engine.js (window.Motor).
(function () {
  'use strict';
  const M = window.Motor;
  const CLAVE = 'casadenoah';
  const HABS_CASA = ['Cabaña', 'Roble', 'Raulí', 'Arrayán', 'Lingue', 'Ciprés'];
  // Fotos de las habitaciones (carpeta img). La maqueta las reemplaza por fotos incrustadas.
  const FOTOS = window.FOTOS_CASA || { 'Cabaña': 'img/cabana.jpg', Roble: 'img/roble.jpg', 'Raulí': 'img/rauli.jpg', 'Arrayán': 'img/arrayan.jpg', Lingue: 'img/lingue.jpg', 'Ciprés': 'img/cipres.jpg' };
  const fotoDe = (h) => FOTOS[h.nombre] || '';
  const MAQUETA = !!window.MAQUETA;
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

  const PESOS = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const plata = (n) => PESOS.format(n || 0);
  function avisar(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
  }
  // Pregunta dentro de la página (las ventanas del navegador no funcionan en todas partes).
  function preguntar(msg, si = 'Sí') {
    return new Promise((ok) => {
      const dlg = $('#dlgPregunta');
      $('#pTexto').textContent = msg; $('#pSi').textContent = si;
      const fin = (v) => { dlg.close(); $('#pSi').onclick = $('#pNo').onclick = null; ok(v); };
      $('#pSi').onclick = () => fin(true); $('#pNo').onclick = () => fin(false);
      dlg.oncancel = () => fin(false);
      dlg.showModal();
    });
  }
  // "Camila Rojas Pérez" -> "Camila R." para que quepa en las barras cortas.
  const nombreCorto = (n) => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0] || ''; };
  const iniciales = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const leerMonto = (txt) => Number(String(txt || '').replace(/\D/g, '')) || 0;

  // ---------- Datos de ejemplo (inventados) ----------
  const NOMBRES_EJEMPLO = ['Camila Rojas', 'Matías González', 'Sofía Muñoz', 'Benjamín Díaz', 'Valentina Pérez', 'Tomás Soto', 'Isidora Contreras', 'Joaquín Silva', 'Florencia Morales', 'Martín Araya', 'Emma Schneider', 'Lucas Martin', 'Antonia Fuentes', 'Vicente Reyes', 'Julieta Torres', 'Agustín Castro'];
  const TARIFA_EJEMPLO = { 'Cabaña': 72000, Roble: 78000, 'Raulí': 62000, 'Arrayán': 66000, Lingue: 62000, 'Ciprés': 48000 };

  // Lee los calendarios simulados al instante y pone nombres y valores inventados a las reservas sin datos.
  function rellenarEjemplo(datos) {
    const hoy = M.hoyLocal();
    for (const h of datos.habitaciones) {
      for (const [f, url] of Object.entries(h.enlaces || {})) {
        if (!M.esSimulado(url)) continue;
        (datos.cache[h.id] = datos.cache[h.id] || {})[f] = { eventos: M.parseICS(M.icsSimulado(url, hoy)), at: Date.now() };
      }
    }
    const est = M.estadias(datos.habitaciones, datos.cache, [], M.addDays(hoy, -70), M.addDays(hoy, 90));
    est.forEach((e, i) => {
      if (datos.detalles[e.clave]) return;
      if (!M.esSimulado((e.hab.enlaces || {})[e.fuente])) return;
      const tarifa = TARIFA_EJEMPLO[e.hab.nombre] || 60000;
      // Algunas reservas futuras quedan sin valor, para mostrar el aviso de "falta el valor".
      const sinValor = e.start > M.addDays(hoy, 20) && i % 4 === 0;
      datos.detalles[e.clave] = { nombre: NOMBRES_EJEMPLO[(i * 7) % NOMBRES_EJEMPLO.length], monto: sinValor ? 0 : tarifa * e.noches };
    });
    return datos;
  }

  function ejemploCompleto() {
    const hoy = M.hoyLocal();
    const habitaciones = HABS_CASA.map((n, i) => ({ id: 'm' + i, nombre: n, enlaces: { airbnb: M.enlaceSimulado('airbnb', i), booking: M.enlaceSimulado('booking', i), expedia: M.enlaceSimulado('expedia', i) } }));
    const datos = rellenarEjemplo(M.migrate({ habitaciones }));
    // Una reserva directa de ejemplo, en las primeras dos noches libres de Lingue desde la próxima semana.
    let d = 7;
    while (d < 60 && !M.libres([habitaciones[4]], datos.cache, [], M.addDays(hoy, d), M.addDays(hoy, d + 2)).length) d++;
    datos.directas.push({ id: 'md1', hab: 'm4', start: M.addDays(hoy, d), end: M.addDays(hoy, d + 2), nombre: 'Paula Herrera (WhatsApp)', monto: 2 * 58000 });
    datos.ejemploDia = hoy;
    return datos;
  }

  async function cargar() {
    if (MAQUETA) {
      enArchivo = true;
      // Las reservas simuladas se mueven con los días: si el ejemplo guardado es de otro día, se arma de nuevo.
      try { const g = JSON.parse(localStorage.getItem(CLAVE + '-maqueta')); if (g && g.ejemploDia === M.hoyLocal() && g.v === M.VERSION) return M.migrate(g); } catch (e) { /* sin datos */ }
      return ejemploCompleto();
    }
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
    if (raw && raw.v > M.VERSION) avisar('Estos datos son de una versión más nueva del programa. Descarga la versión nueva.');
    return M.migrate(raw);
  }

  let colaGuardar = Promise.resolve();
  function guardar() {
    if (demo) return;
    const txt = JSON.stringify(S);
    if (MAQUETA) { try { localStorage.setItem(CLAVE + '-maqueta', txt); } catch (e) { /* solo en memoria */ } return; }
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
    if (S.habitaciones.some((h) => Object.values(h.enlaces || {}).some(M.esSimulado))) rellenarEjemplo(S);
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
    $('#avisoSimulado').hidden = !haySim || MAQUETA;
    $('#avisoMaqueta').hidden = !MAQUETA;
    $('#btnDemo').hidden = MAQUETA;
    $('#btnRespaldo').hidden = MAQUETA;
    $('#lblRestaurar').hidden = MAQUETA;
    $('#btnSimular').hidden = !!demo || !S.habitaciones.length;
    $('#btnQuitarSim').hidden = !haySim;
    $('#avisoGuardado').hidden = !avisoGuardado || !!demo;
    $('#avisoGuardado').textContent = avisoGuardado;
    renderResumen(); renderAlertas(); renderGrilla(); renderDirectas(); renderConfig(); renderLeyenda(); renderGanancias();
  }

  function renderLeyenda() {
    const esquina = (f) => `<span><i class="muestra" style="--c:${f.color}"></i>${f.nombre}</span>`;
    $('#leyenda').innerHTML = '<span><i style="background:var(--ocupado)"></i>Ocupado</span>'
      + '<span class="suave">esquina:</span>' + Object.values(M.FUENTES).map(esquina).join('')
      + '<span><i style="background:var(--libre);border:1px solid var(--linea)"></i>Libre</span>'
      + '<span><i class="cerrado"></i>Cerrado</span>'
      + '<span><i style="background:var(--choque)"></i>¡Doble reserva!</span>';
  }

  function renderResumen() {
    const d = D(); const hoy = M.hoyLocal();
    const r = M.resumenDia(d.habitaciones, d.cache, d.directas, hoy);
    const r7 = Array.from({ length: 7 }, (_, i) => M.resumenDia(d.habitaciones, d.cache, d.directas, M.addDays(hoy, i)).libres);
    const lista = (xs) => xs.length ? xs.map((x) => { const n = M.detalleDe(x, d.detalles, d.directas).nombre; return `${n ? esc(nombreCorto(n)) + ' · ' : ''}${esc(x.hab.nombre)}`; }).join('<br>') : 'Nadie';
    $('#resumen').innerHTML = `
      <div class="tarjeta"><div class="det">Libres esta noche</div><div class="num">${r.libres} <span class="det">de ${d.habitaciones.length}</span></div></div>
      <div class="tarjeta"><div class="det">Llegan hoy</div><div class="num">${r.llegadas.length}</div><div class="det">${lista(r.llegadas)}</div></div>
      <div class="tarjeta"><div class="det">Se van hoy</div><div class="num">${r.salidas.length}</div><div class="det">${lista(r.salidas)}</div></div>
      <div class="tarjeta"><div class="det">Noches libres próximos 7 días</div><div class="num">${r7.reduce((a, b) => a + b, 0)}</div><div class="det">${r7.join(' · ')}</div></div>
      ${(() => { const [a, b] = rangoMes(0); const g = M.ganancias(d.habitaciones, d.cache, d.directas, d.detalles, d.comisiones, a, b);
        return `<button class="tarjeta tarjeta-boton" data-ir="ganancias"><div class="det">Ganancia de ${MESES_LARGOS[+a.slice(5, 7) - 1]}</div><div class="num">${plata(g.neto)}</div><div class="det">${g.sinValor ? `${g.sinValor} reserva${g.sinValor === 1 ? '' : 's'} sin valor` : 'Ver detalle'}</div></button>`; })()}`;
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
      let tds = '';
      const cel = fila.celdas;
      for (let i = 0; i < cel.length; i++) {
        const c = cel[i];
        const hoyc = c.fecha === hoy ? ' hoycol' : '';
        const datos = `data-h="${fila.hab.id}" data-f="${c.fecha}"`;
        if (c.estado === 'libre') { tds += `<td class="libre${hoyc}" ${datos} title="Libre"></td>`; continue; }
        if (c.estado === 'choque') { tds += `<td class="choque${hoyc}" ${datos} title="Doble reserva">!</td>`; continue; }
        if (c.estado === 'bloqueado') { tds += `<td class="cerrado${hoyc}" ${datos} title="Cerrado en ${M.FUENTES[c.fuente].nombre}"></td>`; continue; }
        // Reserva: una barra que junta todas sus noches seguidas.
        let n = 1;
        while (i + n < cel.length && cel[i + n].estado === 'reservado' && cel[i + n].clave === c.clave) n++;
        const est = { clave: c.clave, fuente: c.fuente };
        const det = M.detalleDe(est, d.detalles, d.directas);
        const fu = M.FUENTES[c.fuente];
        const texto = det.nombre || 'Sin nombre';
        // 1 noche: iniciales; 2 noches: nombre y letra del apellido; más: nombre completo.
        const visible = !det.nombre ? texto : n === 1 ? iniciales(det.nombre) : n === 2 ? nombreCorto(det.nombre) : texto;
        tds += `<td class="ocupado" colspan="${n}" style="--c:${fu.color}" ${datos} title="${esc(texto)} · ${fu.nombre}${det.monto ? ' · ' + plata(det.monto) : ''}"><span class="${det.nombre ? '' : 'sin'}">${esc(visible)}</span></td>`;
        i += n - 1;
      }
      const f = fotoDe(fila.hab);
      return `<tr class="${errores[fila.hab.id] ? 'err' : ''}"><th class="hab"><button class="nombre-hab" data-ver-hab="${fila.hab.id}">${f ? `<img src="${f}" alt="">` : ''}<span>${esc(fila.hab.nombre)}</span></button></th>${tds}</tr>`;
    }).join('');
    $('#grilla').style.minWidth = (150 + dias * 34) + 'px';
    $('#grilla').innerHTML = `<colgroup><col class="col-hab">${fechas.map(() => '<col>').join('')}</colgroup><thead><tr><th class="hab"></th>${cab}</tr></thead><tbody>${filas}</tbody>`;
  }

  // Formulario para poner nombre y valor a una reserva.
  function formReserva(est) {
    const d = D();
    const det = M.detalleDe(est, d.detalles, d.directas);
    const fu = M.FUENTES[est.fuente];
    const com = Number(d.comisiones[est.fuente]) || 0;
    const noches = M.diffDays(est.start, est.end);
    return `<form class="form-reserva" data-clave="${esc(est.clave)}" data-fuente="${est.fuente}">
      <p>${pill(est.fuente)} ${fechaLarga(est.start)} → ${fechaLarga(est.end)} · ${noches} noche${noches === 1 ? '' : 's'}</p>
      <label>Nombre del visitante <input name="nombre" value="${esc(det.nombre)}" maxlength="60" placeholder="Ej.: María Pérez"></label>
      <label>Valor total que pagó <input name="monto" inputmode="numeric" value="${det.monto ? plata(det.monto) : ''}" placeholder="$0"></label>
      <label>Teléfono <input name="telefono" type="tel" value="${esc(det.telefono)}" maxlength="30" placeholder="Opcional"></label>
      <label>Notas <textarea name="notas" rows="2" maxlength="300" placeholder="Ej.: llega tarde, viene con mascota">${esc(det.notas)}</textarea></label>
      <p class="suave calculo">${det.monto ? `Comisión ${fu.nombre} ${com}%: ${plata(Math.round(det.monto * com / 100))} · Te queda: <b>${plata(det.monto - Math.round(det.monto * com / 100))}</b>` : `Comisión de ${fu.nombre}: ${com}%.`}</p>
      <button class="primario">Guardar</button>
    </form>`;
  }

  function guardarReserva(form) {
    const d = D();
    const clave = form.dataset.clave;
    const nombre = form.nombre.value.trim();
    const monto = leerMonto(form.monto.value);
    const telefono = form.telefono.value.trim();
    const notas = form.notas.value.trim();
    if (clave.startsWith('d:')) {
      const r = d.directas.find((x) => 'd:' + x.id === clave);
      if (r) Object.assign(r, { nombre, monto, telefono, notas });
    } else if (nombre || monto || telefono || notas) d.detalles[clave] = { nombre, monto, telefono, notas };
    else delete d.detalles[clave];
    guardar(); render();
    $('#dlg').close();
    avisar('Guardado.');
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
    let cuerpo;
    if (est.estado === 'bloqueado') {
      cuerpo = `<p>Esta noche está cerrada en ${M.FUENTES[est.fuente].nombre}, sin reserva.</p>`;
    } else {
      // En una doble reserva se muestran las dos; si no, solo la reserva principal.
      const reales = est.estado === 'choque' ? est.eventos.filter((e) => !e.bloqueo) : est.eventos.filter((e) => e.clave === est.clave);
      cuerpo = (est.estado === 'choque' ? '<p class="alerta">Dos plataformas vendieron esta noche. Cancela una de las reservas.</p>' : '') + reales.map(formReserva).join('');
    }
    $('#dlgBody').innerHTML = `<h2>${esc(nombreHab(habId))} · ${fechaLarga(fecha)}</h2>${cuerpo}`;
    $('#dlg').showModal();
  }

  function verHabitacion(habId) {
    const d = D(); const h = d.habitaciones.find((x) => x.id === habId); if (!h) return;
    const hoy = M.hoyLocal();
    const ev = M.eventosDe(h.id, d.cache, d.directas);
    const proximas = M.estadias([h], d.cache, d.directas, M.addDays(hoy, -60), M.addDays(hoy, 60)).filter((e) => e.end > hoy);
    const libresMes = Array.from({ length: 30 }, (_, i) => M.estadoDia(ev, M.addDays(hoy, i)).estado === 'libre').filter(Boolean).length;
    $('#dlgBody').innerHTML = `${fotoDe(h) ? `<img class="foto-grande" src="${fotoDe(h)}" alt="Foto de ${esc(h.nombre)}">` : ''}
      <h2>${esc(h.nombre)}</h2>
      <p>${libresMes} noches libres en los próximos 30 días.</p>
      <h3>Próximas reservas</h3>
      ${proximas.length ? `<ul class="tramos">${proximas.slice(0, 8).map((t) => { const det = M.detalleDe(t, d.detalles, d.directas); return `<li>${pill(t.fuente)} ${fechaLarga(t.start)} → ${fechaLarga(t.end)} · ${esc(det.nombre || 'Sin nombre')}${det.monto ? ' · ' + plata(det.monto) : ''}${det.telefono ? `<br><span class="suave">Tel.: ${esc(det.telefono)}</span>` : ''}${det.notas ? `<br><span class="suave">${esc(det.notas)}</span>` : ''}</li>`; }).join('')}</ul>` : '<p class="suave">Sin reservas en las próximas semanas.</p>'}`;
    $('#dlg').showModal();
  }

  // ---------- Ganancias ----------
  const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  let mesOffset = 0;
  let ultimoMes = null;
  function rangoMes(off) {
    const h = new Date(); const dt = new Date(h.getFullYear(), h.getMonth() + off, 1);
    const a = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`;
    const sig = new Date(dt.getFullYear(), dt.getMonth() + 1, 1);
    return [a, `${sig.getFullYear()}-${String(sig.getMonth() + 1).padStart(2, '0')}-01`];
  }

  function renderGanancias() {
    if (tabActual() !== 'ganancias') return;
    const d = D();
    const [a, b] = rangoMes(mesOffset);
    const g = M.ganancias(d.habitaciones, d.cache, d.directas, d.detalles, d.comisiones, a, b);
    $('#gMes').textContent = `${MESES_LARGOS[+a.slice(5, 7) - 1]} ${a.slice(0, 4)}`;
    const ocup = g.nochesTotales ? Math.round(100 * g.nochesOcupadas / g.nochesTotales) : 0;
    $('#gTarjetas').innerHTML = `
      <div class="tarjeta destacada"><div class="det">Lo que ganas (después de comisiones)</div><div class="num">${plata(g.neto)}</div><div class="det">${g.estadias.length} reserva${g.estadias.length === 1 ? '' : 's'} que llegan este mes</div></div>
      <div class="tarjeta"><div class="det">Total que pagaron</div><div class="num">${plata(g.bruto)}</div></div>
      <div class="tarjeta"><div class="det">Comisiones de plataformas</div><div class="num">${plata(g.comision)}</div></div>
      <div class="tarjeta"><div class="det">Ocupación del mes</div><div class="num">${ocup}%</div><div class="det">${g.nochesOcupadas} de ${g.nochesTotales} noches</div></div>`;
    $('#gAviso').hidden = !g.sinValor;
    $('#gAviso').textContent = `Hay ${g.sinValor} reserva${g.sinValor === 1 ? '' : 's'} sin valor. Escríbelo en la lista de abajo para que la ganancia sea exacta.`;
    const fuentes = Object.keys(M.FUENTES).filter((f) => g.porFuente[f]);
    $('#gFuentes').innerHTML = `<h3>Por plataforma</h3><div class="lista-wrap"><table class="lista"><tr><th>Origen</th><th class="num">Reservas</th><th class="num">Pagaron</th><th class="num">Te queda</th></tr>${fuentes.map((f) => `<tr><td>${pill(f)}</td><td class="num">${g.porFuente[f].reservas}</td><td class="num">${plata(g.porFuente[f].bruto)}</td><td class="num"><b>${plata(g.porFuente[f].neto)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="suave">Sin reservas con valor.</td></tr>'}</table></div>`;
    $('#gHabs').innerHTML = `<h3>Por habitación</h3><div class="lista-wrap"><table class="lista"><tr><th>Habitación</th><th class="num">Reservas</th><th class="num">Te queda</th></tr>${d.habitaciones.map((h) => { const x = g.porHab[h.id]; return `<tr><td>${esc(h.nombre)}</td><td class="num">${x ? x.reservas : 0}</td><td class="num"><b>${plata(x ? x.neto : 0)}</b></td></tr>`; }).join('')}</table></div>`;
    $('#gLista').innerHTML = g.estadias.length ? `<div class="lista-wrap"><table class="lista"><tr><th>Llegada</th><th>Habitación</th><th>Origen</th><th>Visitante</th><th class="num">Noches</th><th>Valor total</th><th class="num">Te queda</th></tr>${g.estadias.map((e) => `<tr data-clave="${esc(e.clave)}">
        <td>${fechaLarga(e.start)}</td><td>${esc(e.hab.nombre)}</td><td>${pill(e.fuente)}</td>
        <td><input class="en-linea" data-editar="nombre" value="${esc(e.nombre)}" placeholder="Nombre" maxlength="60"></td>
        <td class="num">${e.noches}</td>
        <td><input class="en-linea monto ${e.monto ? '' : 'vacio-monto'}" data-editar="monto" inputmode="numeric" value="${e.monto ? plata(e.monto) : ''}" placeholder="Falta el valor"></td>
        <td class="num">${e.monto ? plata(e.neto) : '—'}</td></tr>`).join('')}</table></div>` : '<p class="suave">No hay reservas que lleguen este mes.</p>';
    $('#gExcel').hidden = MAQUETA;
    ultimoMes = { g, a };
    $('#gComisiones').innerHTML = ['airbnb', 'booking', 'expedia'].map((f) => `<label>${M.FUENTES[f].nombre} <span class="con-sufijo"><input type="number" min="0" max="50" step="0.5" data-comision="${f}" value="${d.comisiones[f]}">%</span></label>`).join('');
  }

  function editarEnLinea(input) {
    const d = D();
    const clave = input.closest('tr').dataset.clave;
    const campo = input.dataset.editar;
    const valor = campo === 'monto' ? leerMonto(input.value) : input.value.trim();
    if (clave.startsWith('d:')) {
      const r = d.directas.find((x) => 'd:' + x.id === clave); if (r) r[campo] = valor;
    } else {
      const det = (d.detalles[clave] = d.detalles[clave] || { nombre: '', monto: 0 });
      det[campo] = valor;
    }
    guardar(); render();
  }

  // ---------- Reservas directas ----------
  function renderDirectas() {
    const d = D();
    $('#dHab').innerHTML = d.habitaciones.map((h) => `<option value="${h.id}">${esc(h.nombre)}</option>`).join('');
    const hoy = M.hoyLocal();
    const prox = d.directas.filter((x) => x.end >= hoy).sort((a, b) => (a.start < b.start ? -1 : 1));
    $('#listaDirectas').innerHTML = prox.length
      ? `<div class="lista-wrap"><table class="lista"><tr><th>Habitación</th><th>Llegada</th><th>Salida</th><th>Nombre o nota</th><th>Valor</th><th></th></tr>${prox.map((x) => `<tr><td>${esc(nombreHab(x.hab))}</td><td>${fechaLarga(x.start)}</td><td>${fechaLarga(x.end)}</td><td>${esc(x.nombre)}</td><td class="num">${x.monto ? plata(x.monto) : '<span class="falta">Falta</span>'}</td><td><button class="peligro" data-borrar-directa="${x.id}">Borrar</button></td></tr>`).join('')}</table></div>`
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
          <label>${fotoDe(h) ? `<img class="mini" src="${fotoDe(h)}" alt="">` : ''}Nombre <input data-campo="nombre" value="${esc(h.nombre)}" maxlength="40"></label>
          ${['airbnb', 'booking', 'expedia'].map((f) => `<label>Enlace ${M.FUENTES[f].nombre} <input data-campo="${f}" value="${esc((h.enlaces || {})[f] || '')}" placeholder="https://…"></label>`).join('')}
          <button class="peligro" data-borrar-hab="${h.id}">Quitar</button>
          <div class="estado">${est || 'Sin enlaces todavía.'}</div>
        </div>`;
      }).join('');
  }

  function cambiarCampo(input) {
    if (demo) { avisar('En el ejemplo no se guardan cambios. Sal del ejemplo primero.'); render(); return; }
    const card = input.closest('[data-hab]');
    const h = S.habitaciones.find((x) => x.id === card.dataset.hab);
    const campo = input.dataset.campo; const val = input.value.trim();
    if (campo === 'nombre') { h.nombre = val || 'Sin nombre'; }
    else {
      if (val && !M.enlaceValido(val) && !M.esSimulado(val)) { avisar('Ese enlace no parece de ' + M.FUENTES[campo].nombre + '. Debe empezar con https:// y ser de la plataforma.'); input.value = (h.enlaces || {})[campo] || ''; return; }
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

  // ---------- Eventos ----------
  $('#tabs').addEventListener('click', (e) => { if (e.target.dataset.tab) irTab(e.target.dataset.tab); });
  $('#btnActualizar').addEventListener('click', actualizar);
  $('#prev').addEventListener('click', () => { desde = M.addDays(desde, -7); renderGrilla(); });
  $('#next').addEventListener('click', () => { desde = M.addDays(desde, 7); renderGrilla(); });
  $('#hoy').addEventListener('click', () => { desde = M.addDays(M.hoyLocal(), -1); renderGrilla(); });
  $('#dias').addEventListener('change', renderGrilla);
  $('#grilla').addEventListener('click', (e) => { const td = e.target.closest('td[data-h]'); if (td) detalleCelda(td.dataset.h, td.dataset.f); });
  $('#btnDemo').addEventListener('click', () => { demo = ejemploCompleto(); irTab('calendario'); });
  $('#btnSalirDemo').addEventListener('click', () => { demo = null; render(); });
  $('#btnEmpezar').addEventListener('click', () => irTab('config'));

  $('#formBuscar').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = D(); const a = $('#bLlegada').value; const b = $('#bSalida').value;
    if (b <= a) { $('#resultadoBuscar').innerHTML = '<p class="aviso">La salida debe ser después de la llegada.</p>'; return; }
    const libres = M.libres(d.habitaciones, d.cache, d.directas, a, b);
    const n = M.diffDays(a, b);
    $('#resultadoBuscar').innerHTML = libres.length
      ? `<p>Para ${n} noche${n === 1 ? '' : 's'} (${fechaLarga(a)} → ${fechaLarga(b)}) están libres:</p><div class="fichas">${libres.map((h) => `<button class="ficha" data-ver-hab="${h.id}">${fotoDe(h) ? `<img src="${fotoDe(h)}" alt="">` : ''}<span class="libre-ok">${esc(h.nombre)}</span></button>`).join('')}</div>`
      : `<p class="aviso">No hay ninguna habitación libre todas esas noches.</p>`;
  });

  $('#formDirecta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const S0 = D();
    const r = { id: uid(), hab: $('#dHab').value, start: $('#dLlegada').value, end: $('#dSalida').value, nombre: $('#dNombre').value.trim(), monto: leerMonto($('#dMonto').value) };
    if (r.end <= r.start) { avisar('La salida debe ser después de la llegada.'); return; }
    const ocupada = !M.libres(S0.habitaciones.filter((h) => h.id === r.hab), S0.cache, S0.directas, r.start, r.end).length;
    if (ocupada && !(await preguntar('Esa habitación ya está ocupada alguna de esas noches. ¿Anotar igual?', 'Anotar igual'))) return;
    S0.directas.push(r); guardar();
    $('#formDirecta').reset();
    $('#dAviso').hidden = false;
    $('#dAviso').textContent = `Anotada. Recuerda cerrar ${nombreHab(r.hab)} del ${fechaLarga(r.start)} al ${fechaLarga(r.end)} en Airbnb, Booking y Expedia.`;
    render();
  });

  document.addEventListener('click', async (e) => {
    const t = e.target;
    const ir = t.closest && t.closest('[data-ir]');
    if (ir) { irTab(ir.dataset.ir); return; }
    const ver = t.closest && t.closest('[data-ver-hab]');
    if (ver) { verHabitacion(ver.dataset.verHab); return; }
    if (t.dataset.borrarDirecta && !demo && await preguntar('¿Borrar esta reserva directa?', 'Borrar')) {
      S.directas = S.directas.filter((x) => x.id !== t.dataset.borrarDirecta); guardar(); render();
    }
    if (t.dataset.borrarHab && !demo) {
      const h = S.habitaciones.find((x) => x.id === t.dataset.borrarHab);
      if (await preguntar(`¿Quitar la habitación ${h.nombre}? Se borran sus enlaces.`, 'Quitar')) {
        S.habitaciones = S.habitaciones.filter((x) => x.id !== h.id); delete S.cache[h.id]; guardar(); render();
      }
    }
    if (t.id === 'btnCargarCasa' && !demo) {
      S.habitaciones = HABS_CASA.map((n) => ({ id: uid(), nombre: n, enlaces: {} })); guardar(); render();
    }
  });
  $('#gPrev').addEventListener('click', () => { mesOffset--; renderGanancias(); });
  $('#gNext').addEventListener('click', () => { mesOffset++; renderGanancias(); });
  $('#gHoy').addEventListener('click', () => { mesOffset = 0; renderGanancias(); });
  $('#gExcel').addEventListener('click', () => {
    if (!ultimoMes) return;
    const blob = new Blob(['\ufeff' + M.csvGanancias(ultimoMes.g)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `casa-de-noah-ganancias-${ultimoMes.a.slice(0, 7)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    avisar('Planilla descargada. Ábrela con Excel.');
  });
  $('#tab-ganancias').addEventListener('change', (e) => {
    if (e.target.dataset.editar) editarEnLinea(e.target);
    if (e.target.dataset.comision) { const v = Math.min(50, Math.max(0, Number(e.target.value) || 0)); D().comisiones[e.target.dataset.comision] = v; guardar(); render(); }
  });
  document.addEventListener('submit', (e) => { if (e.target.classList.contains('form-reserva')) { e.preventDefault(); guardarReserva(e.target); } });
  $('#listaHabs').addEventListener('change', (e) => { if (e.target.dataset.campo) cambiarCampo(e.target); });
  $('#btnAgregarHab').addEventListener('click', () => {
    if (demo) { avisar('En el ejemplo no se guardan cambios.'); return; }
    S.habitaciones.push({ id: uid(), nombre: 'Habitación ' + (S.habitaciones.length + 1), enlaces: {} }); guardar(); render();
  });

  $('#btnReiniciar').addEventListener('click', async () => {
    if (!(await preguntar('¿Volver al ejemplo inicial? Se borra lo que anotaste en la maqueta.', 'Volver a empezar'))) return;
    S = ejemploCompleto(); errores = {}; guardar(); irTab('calendario');
  });
  $('#btnSimular').addEventListener('click', () => {
    let n = 0;
    S.habitaciones.forEach((h, i) => {
      h.enlaces = h.enlaces || {};
      for (const f of ['airbnb', 'booking', 'expedia']) if (!h.enlaces[f]) { h.enlaces[f] = M.enlaceSimulado(f, i); n++; }
    });
    if (!n) { avisar('Todas las habitaciones ya tienen sus 3 enlaces.'); return; }
    rellenarEjemplo(S); guardar(); render();
  });
  $('#btnQuitarSim').addEventListener('click', async () => {
    if (!(await preguntar('¿Quitar todos los enlaces simulados? Los enlaces reales se mantienen.', 'Quitar'))) return;
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
      if (!(await preguntar(`El respaldo tiene ${datos.habitaciones.length} habitaciones y ${datos.directas.length} reservas directas. ¿Reemplazar lo que hay ahora?`, 'Reemplazar'))) return;
      S = datos; demo = null; guardar(); render(); actualizar();
    } catch (err) { avisar('Ese archivo no es un respaldo válido.'); }
    e.target.value = '';
  });

  // ---------- Inicio ----------
  cargar().then((datos) => { S = datos; render(); actualizar(); });
  setInterval(() => { if (!document.hidden) actualizar(); }, AUTO_MIN * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ultima && Date.now() - ultima > AUTO_MIN * 60 * 1000) actualizar(); });
})();
