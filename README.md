# Casa de Noah · Disponibilidad

Programa para el computador que junta en un solo calendario las reservas de Airbnb, Booking y Expedia de las habitaciones de Casa de Noah (Pucón), más las reservas directas. Funciona sin instalar nada y sin publicar nada en internet.

## Cómo se usa (Windows)

1. En GitHub: **Code → Download ZIP**. En el computador, clic derecho al ZIP → **Extraer todo**.
2. Doble clic en **Abrir Casa de Noah**. Se abre en el navegador.
3. Deja abierta la ventanita minimizada "Casa de Noah (no cerrar)" mientras se usa.

Instrucciones para la dueña: `LEEME.txt`.

En Mac o Linux, con Node.js instalado: `node servidor.js`.

## Maqueta para mostrar

`python3 herramientas/maqueta.py` arma `maqueta.html`: todo en un solo archivo, con fotos y reservas inventadas, para mostrar el sistema con un enlace sin instalar nada.

## Probar sin enlaces reales

En "Habitaciones y enlaces", el botón "Usar enlaces simulados" llena los enlaces vacíos con calendarios inventados (con una doble reserva a propósito). "Quitar enlaces simulados" los borra y deja los reales.

## Qué hace

- Lee el calendario (iCal) que exporta cada plataforma, cada 30 minutos o con "Actualizar ahora".
- Avisa si dos plataformas vendieron la misma noche.
- Busca qué habitaciones están libres para unas fechas.
- Guarda todo en `datos/datos.json` dentro de la carpeta del programa (con copia en `datos-anterior.json` y una copia diaria en `datos/respaldos`, las últimas 30). Esa carpeta no se sube a GitHub.
- Nombre, valor, teléfono y notas de cada visitante; ganancias del mes por plataforma y por habitación, y planilla para Excel.

## Archivos

- `js/engine.js`: lógica, con pruebas en `tests/engine.test.js`.
- `js/app.js`: pantallas.
- `servidor.ps1` (Windows) y `servidor.js` (Mac/Linux y pruebas): el programa local. Muestran la página en `http://localhost:8642`, traen los calendarios (solo de las plataformas) y guardan los datos. Deben hacer lo mismo.

Pruebas: `node tests/engine.test.js && node tests/servidor.test.js`

## Ganancias

Los calendarios de las plataformas no traen nombre ni valor: se escriben a mano (en la reserva o en la pestaña Ganancias). La ganancia se calcula por mes de llegada, restando la comisión de cada plataforma (editable).
