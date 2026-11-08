# Casa de Noah: reglas del proyecto

Programa local (no web) para el B&B Casa de Noah en Pucón: calendario único de Airbnb, Booking y Expedia. Lo usa la dueña en un computador con Windows, sin conocimientos técnicos. Ver README.md.

- Sin frameworks, sin compilación y sin instalar nada en Windows: `Abrir Casa de Noah.bat` → `servidor.ps1` (PowerShell que trae Windows).
- `servidor.ps1` y `servidor.js` deben comportarse igual; `tests/servidor.test.js` prueba `servidor.js` y revisa que la lista de sitios coincida. `servidor.ps1` se guarda en UTF-8 con BOM y fin de línea CRLF.
- Lógica en `js/engine.js` con pruebas; pantallas en `js/app.js`. Corre `node tests/engine.test.js && node tests/servidor.test.js` antes de terminar.
- Si cambia la forma de los datos, sube `VERSION` en `migrate()`. Nunca perder lo que está en `datos/datos.json`.
- Texto en español de Chile, con tildes. Nunca subir datos de huéspedes ni enlaces de calendario reales (son secretos).
- Al dueño del repositorio háblale en español simple, sin jerga.
