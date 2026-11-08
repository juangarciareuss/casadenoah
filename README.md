# Casa de Noah · Disponibilidad

Página para el computador que junta en un solo calendario las reservas de Airbnb, Booking y Expedia de las habitaciones de Casa de Noah, más las reservas directas.

- Lee el calendario (iCal) que exporta cada plataforma, cada 30 minutos o con "Actualizar ahora".
- Avisa si dos plataformas vendieron la misma noche.
- Busca qué habitaciones están libres para unas fechas.
- Los datos quedan guardados solo en el navegador de ese computador (hay botón de respaldo).

Archivos: `js/engine.js` (lógica, con pruebas en `tests/engine.test.js`), `js/app.js` (pantallas), `netlify/functions/calendario.js` (trae los calendarios; solo acepta enlaces de las plataformas).

Pruebas: `node tests/engine.test.js`
