# Mejoras al Proyecto DollarCity

Todas las mejoras funcionan con **tu misma base de datos** — no hay que tocar el schema ni migrar nada. El estado `ANULADA` y el Kardex ya existían en tus tablas, solo que no se usaban.

## 🐛 Bugs corregidos (backend)

### 1. Sobreventa por condición de carrera (crítico)
**Archivo:** `backend/src/controllers/ventas.controller.js`
Antes se leía el stock, se calculaba el nuevo valor y se escribía. Si dos ventas del mismo producto ocurrían al mismo tiempo, ambas pasaban la validación y el sistema vendía más de lo que había.
**Ahora:** el descuento es atómico (`UPDATE ... SET stock = stock - X WHERE stock >= X`). Si el stock cambió entre la validación y el cobro, la venta se revierte con error 409.

### 2. Comprobantes duplicados (crítico)
**Archivo:** `backend/src/utils/comprobante.js`
Dos ventas simultáneas podían leer el mismo "último número" y generar dos boletas B001-000005.
**Ahora:** se usa `pg_advisory_xact_lock` para serializar la numeración dentro de la transacción.

### 3. Items duplicados en el carrito
Si el mismo producto llegaba dos veces en el array de items, se validaba el stock por separado. Ahora se consolidan antes de validar.

## ✨ Funcionalidades nuevas

### Anulación de ventas — `POST /api/ventas/:id/anular` (solo admin)
- Cambia el estado a `ANULADA`, repone el stock y registra el movimiento en Kardex como devolución.
- Protegida contra doble anulación con `FOR UPDATE`.

### Anulación de compras — `POST /api/compras/:id/anular` (solo admin)
- Revierte el ingreso de stock y registra en Kardex.
- Valida que el stock actual alcance (si ya vendiste esa mercadería, no deja anular).

### Filtros y paginación en `GET /api/ventas`
`?desde=2026-06-01&hasta=2026-06-30&estado=COMPLETADA&page=1&limit=20`
Devuelve además el monto total de las ventas completadas del filtro.

### 3 reportes nuevos (solo admin)
- `GET /api/reportes/ventas-por-dia?dias=30` — serie diaria para gráficos (incluye días en cero).
- `GET /api/reportes/ventas-por-categoria` — ingresos por categoría.
- `GET /api/reportes/inventario-valorizado` — valor del inventario actual (stock × precio).

## 🔒 Seguridad

- **Rate limit en login** (`backend/src/middlewares/rateLimit.middleware.js`): máx. 10 intentos por IP cada 15 min. Sin dependencias nuevas.
- **Cabeceras de seguridad** en `server.js` (nosniff, X-Frame-Options, etc.).
- **Health check real**: `GET /api/health` ahora hace ping a PostgreSQL y devuelve 503 si la BD está caída.
- El reporte de dashboard ahora es accesible para todos los roles autenticados (antes un vendedor no podía cargar su propia pantalla de inicio).

## 🖥️ Frontend

### Nueva página: Historial de Ventas (`/historial`)
Le faltaba al sistema una forma de ver las ventas pasadas. La nueva página tiene:
- Tabla con filtros por fecha y estado, paginada desde el backend
- Detalle expandible de cada venta (productos, IGV, total)
- Botón **Anular** para admin (pide motivo, repone stock)
- Visible para admin y vendedor en la barra lateral

### Reportes ampliados
- Tarjetas de inventario valorizado (valor total, unidades, productos activos)
- Gráfico de barras de ventas de los últimos 30 días (CSS puro, sin librerías nuevas)

## 🚀 Cómo usarlo

Igual que antes:
```bash
cd backend && npm install && npm start
cd frontend && npm install && npm run dev
```
Tu `.env` y tu base de datos actual funcionan sin cambios. No se agregó ninguna dependencia nueva.
