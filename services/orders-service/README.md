# orders-service

Microservicio de **órdenes de compra** del TP6 (Grupo 1). Orquesta la compra: recibe el pedido del cliente, le pregunta a `catalog-service` si el libro existe, le pide a `inventory-service` que descuente el stock y deja registrada cada orden con su resultado.

- **Issue:** #13 · Spec: [`docs/servicios/orders-service.md`](../../docs/servicios/orders-service.md)
- **Base de datos propia:** MongoDB `db_orders` (colección `ordenes`)
- **Depende de:** `catalog-service` (`GET /api/libros/:id`) e `inventory-service` (`POST /api/inventario/:libroId/descontar` y `/revertir`), siempre por HTTP
- **No** lee ni escribe stock, no usa Redis ni locks y no accede a `db_catalog` ni a `db_inventory`.

## Endpoints

| Método | Ruta | Qué hace | Respuestas |
|---|---|---|---|
| `POST` | `/api/ordenes` | Crea la orden y orquesta la compra. Body `{ clienteId, libroId, cantidad }` | `201` CONFIRMADA · `400` body inválido · `404` LIBRO_INEXISTENTE · `409` SIN_STOCK / CONCURRENCIA · `503` SERVICIO_NO_DISPONIBLE |
| `GET` | `/api/ordenes/:id` | Consulta una orden | `200` · `400` · `404` |
| `GET` | `/api/ordenes/cliente/:clienteId?estado=` | Historial del cliente, más reciente primero | `200` (`[]` si no tiene órdenes) · `400` |
| `GET` | `/health` | Salud del servicio | `200` |
| `GET` | `/api-docs` | Swagger UI | `200` |

En los rechazos también se devuelve el `ordenId`, como comprobante de que el intento existió:

```json
{ "error": "No hay stock suficiente para completar la compra.", "codigo": "SIN_STOCK",
  "ordenId": "6712f0a1c3b2a9e4d1f00a12", "estado": "RECHAZADA", "motivoRechazo": "SIN_STOCK", "mensaje": "..." }
```

## Flujo de la compra

1. Valida el body. Si es inválido responde `400` sin crear orden ni llamar a nadie.
2. Guarda la orden como **`PENDIENTE`**.
3. `GET /api/libros/:id` en catálogo → si no existe: `RECHAZADA / LIBRO_INEXISTENTE` (`404`) y **no** se toca el inventario. Si existe, guarda `libroSnapshot` `{ titulo, autor, isbn }` para el comprobante.
4. `POST /api/inventario/:libroId/descontar` con `{ cantidad, clienteId, ordenId }`:
   - `200` → **`CONFIRMADA`** (`201`)
   - `400` o `404` → `RECHAZADA / SIN_STOCK` (`409`)
   - `409` → `RECHAZADA / CONCURRENCIA` (`409`)
   - `503` o sin conexión → `RECHAZADA / SERVICIO_NO_DISPONIBLE` (`503`)
   - **timeout** → ver "Compensación" abajo
5. La orden se cierra con un update condicional `{ estado: 'PENDIENTE' }`: una orden en estado final (`CONFIRMADA` o `RECHAZADA`) nunca se modifica. No existen `PUT` ni `DELETE`.

## Clientes HTTP y manejo de fallos

`src/clients/` (`httpClient.js`, `catalogClient.js`, `inventoryClient.js`) usa `fetch` nativo con:

- **Timeout explícito:** `AbortSignal.timeout(HTTP_TIMEOUT_MS)`.
- **URL base por variable de entorno:** `CATALOG_SERVICE_URL` / `INVENTORY_SERVICE_URL`. No hay `localhost` en el código.
- **Propagación de `x-request-id`:** se usa el que manda el cliente o se genera uno; viaja a catálogo e inventario y vuelve en la respuesta.
- **Distinción de errores** (consigna, sección 15.2):

| Situación | Cómo se trata |
|---|---|
| `404` remoto | Error funcional (libro inexistente / sin registro de stock) |
| `409` remoto | Conflicto (lock ocupado) |
| Conexión rechazada o DNS | `503` controlado: el pedido nunca llegó |
| Timeout | `503` controlado + compensación (el pedido pudo haber llegado) |
| `5xx` remoto | Log con dependencia y causa + respuesta controlada `503` |

Cada fallo se loguea con `origen`, `dependencia`, `causa` y `requestId`. **orders-service nunca se cae** porque otro servicio no responda: su `/health` no depende de catálogo ni de inventario.

### Compensación (timeout del inventario)

Si el descuento da timeout, no se sabe si inventario llegó a aplicarlo. orders-service llama a `POST /api/inventario/:libroId/revertir` con el mismo `ordenId`; inventario solo devuelve unidades si ese descuento existió, así que es seguro repetirlo. Si el revertir tampoco responde, la orden queda con `compensacion: "PENDIENTE"` y se reintenta sola cada `COMPENSACION_INTERVALO_MS`. Resultado: **todo descuento termina con una orden CONFIRMADA o revertido**.

Limitación conocida: si el pedido de descuento llega a inventario *después* de que se procesó el revertir (una demora de red mayor al timeout), ese descuento no se compensaría. La ventana es muy chica y queda documentada como mejora futura.

## Variables de entorno

Ver [`.env.example`](.env.example).

| Variable | Local | Docker Compose |
|---|---|---|
| `PORT` | `3003` | `3000` |
| `SERVICE_NAME` | `orders-service` | `orders-service` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/db_orders` | `mongodb://orders-db:27017/db_orders` |
| `CATALOG_SERVICE_URL` | `http://localhost:3001` | `http://catalog-service:3000` |
| `INVENTORY_SERVICE_URL` | `http://localhost:3002` | `http://inventory-service:3000` |
| `HTTP_TIMEOUT_MS` | `3000` | `3000` |
| `COMPENSACION_INTERVALO_MS` | `30000` | `30000` |
| `LOG_LEVEL` | `info` | `info` |

## Ejecución local

Requiere Node.js 20+, MongoDB en `27017` y `catalog-service` (3001) e `inventory-service` (3002) levantados.

```bash
cd services/orders-service
cp .env.example .env
npm install
npm start
```

Health: <http://localhost:3003/health> · Swagger: <http://localhost:3003/api-docs>

## Docker

```bash
docker build -t grupo1/orders-service:tp6 ./services/orders-service
```

Con Docker Compose, desde la raíz: `docker compose up --build`.

## Prueba de punta a punta

Con los tres servicios levantados (local o Compose):

```bash
npm run test:compra
```

Verifica una compra simple, los rechazos (404 / 409 / 400) y compras simultáneas: nunca se confirman más órdenes que unidades y el stock final cuadra con las órdenes confirmadas.

## Estructura

```
orders-service/
├── src/
│   ├── routes/ordenesRoutes.js          # rutas + Swagger
│   ├── controllers/ordenesController.js # validación HTTP
│   ├── services/ordenesService.js       # orquestación de la compra y compensaciones
│   ├── clients/                         # httpClient, catalogClient, inventoryClient
│   ├── models/Orden.js                  # modelo propio de db_orders
│   ├── config/                          # env, db, logger, swagger
│   └── app.js
├── scripts/test-compra.js
├── index.js · package.json · Dockerfile · .dockerignore · .env.example
```
