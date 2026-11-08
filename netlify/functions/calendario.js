// Trae el calendario (iCal) de Airbnb, Booking o Expedia.
// El navegador no puede pedirlo directo (las plataformas lo bloquean), así que pasa por aquí.
// Solo acepta enlaces de esas plataformas y no guarda nada.
const { enlaceValido } = require('../../js/engine.js');

exports.handler = async (event) => {
  const url = (event.queryStringParameters || {}).url || '';
  if (!enlaceValido(url)) {
    return { statusCode: 400, body: 'Enlace no permitido: debe ser de Airbnb, Booking o Expedia.' };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'CasaDeNoah-Calendario/1.0' }, redirect: 'follow' });
    clearTimeout(t);
    if (!enlaceValido(r.url || url)) return { statusCode: 400, body: 'La plataforma redirigió a un sitio no permitido.' };
    const text = await r.text();
    if (!r.ok) return { statusCode: 502, body: `La plataforma respondió con error ${r.status}.` };
    if (text.length > 2_000_000) return { statusCode: 502, body: 'El calendario es demasiado grande.' };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
      body: text,
    };
  } catch (e) {
    return { statusCode: 504, body: 'No se pudo conectar con la plataforma.' };
  }
};
