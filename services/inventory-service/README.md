# inventory-service

Microservicio de **inventario** del TP6 (Grupo 1). Custodia cuántas unidades hay de cada libro y evita la **sobreventa** cuando varias compras llegan a la vez, usando un **lock distribuido en Redis/Memurai**.

- **Responsable:** Bautista Navarro ([@BautiNavarro](https://github.com/BautiNavarro)) · Issue #12
- **Base de datos propia:** MongoDB `db_inventory` (colecciones `stock` y `movimientos`)
- **Coordinación:** Redis/Memurai (`lock:libro:{libroId}`), confinado dentro de este servicio
- **No guarda** títulos, autores ni datos de clientes: trabaja solo con `libroId`, que es una **referencia lógica** al libro de `catalog-service` (nunca accede a `db_catalog`).

## Endpoints

| Método | Ruta | Qué hace | Respuestas |
|---|---|---|---|
| `POST` | `/api/inventario` | Crea el registro de stock de un libro. Body `{ libroId, stockInicial }` | `201` · `400` · `409 STOCK_YA_EXISTE` · `422 LIBRO_INEXISTENTE` · `503` |
| `GET` | `/api/inventario/:libroId` | Consulta la disponibilidad | `200` · `400` · `404 STOCK_NO_ENCONTRADO` · `503` |
| `POST` | `/api/inventario/:libroId/descontar` | Descuenta con lock. Body `{ cantidad, clienteId }` (+ `ordenId` opcional) | `200` · `400 STOCK_INSUFICIENTE` · `404` · `409 LOCK_OCUPADO` · `503 REDIS_NO_DISPONIBLE` |
| `POST` | `/api/inventario/:libroId/reponer` | Reposición (reemplaza al `reset-stock` del monolito). `{ cantidad }` suma; `{ stock }` fija el saldo | `200` · `400` · `404` · `409` · `503` |
| `POST` | `/api/inventario/:libroId/revertir` | Compensación: devuelve las unidades de un `ordenId` que sí descontó. Body `{ ordenId }` | `200` (`revertido: true/false`) · `400` · `404` · `503` |
| `GET` | `/api/inventario/:libroId/lock-status` | Diagnóstico: si hay lock activo y su TTL | `200` · `400` · `503` |
| `GET` | `/health` | Salud del servicio y estado de MongoDB y Redis | `200` |
| `GET` | `/api-docs` | Swagger UI | `200` |

Errores siempre con el formato acordado: `{ "error": "mensaje", "codigo": "CODIGO" }`.

### Ejemplo de descuento

```bash
curl -X POST http://localhost:3002/api/inventario/6712e8f0c3b2a9e4d1f00001/descontar \
  -H "Content-Type: application/json" -H "x-request-id: demo-1" \
  -d '{ "cantidad": 1, "clienteId": "cliente-123" }'
```

```json
{ "libroId": "6712e8f0c3b2a9e4d1f00001", "stockPrevio": 5, "cantidadDescontada": 1, "stockRestante": 4, "clienteId": "cliente-123" }
```

## Cómo funciona el lock

1. Antes de tocar el stock se ejecuta `SET lock:libro:{libroId} <token> NX PX <LOCK_TTL_MS>`: solo una petición por libro entra a la sección crítica.
2. Si el lock está ocupado, se reintenta `LOCK_REINTENTOS` veces con una espera breve; si sigue ocupado se responde **`409 LOCK_OCUPADO`**.
3. Dentro del lock: se lee el stock, se verifica `stock ≥ cantidad` y se descuenta (con un filtro `$gte` extra para que nunca quede negativo).
4. El lock se libera siempre con un **script Lua** que solo borra la clave si el token es del dueño. Si el proceso se cae, el TTL lo libera solo.
5. Si **Redis no está disponible**, las operaciones que modifican stock responden **`503 REDIS_NO_DISPONIBLE`** (nunca `500`). La consulta `GET /api/inventario/:libroId` sigue funcionando porque no necesita Redis.

**Idempotencia (opcional):** si `orders-service` manda `ordenId`, el descuento queda registrado en `movimientos`; repetir el mismo `ordenId` no descuenta dos veces, y `/revertir` solo devuelve unidades si ese descuento existió.

## Variables de entorno

Ver [`.env.example`](.env.example). Mismos nombres que el resto de los servicios (plan TP6, sección 0.4).

| Variable | Local | Docker Compose |
|---|---|---|
| `PORT` | `3002` | `3000` |
| `SERVICE_NAME` | `inventory-service` | `inventory-service` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/db_inventory` | `mongodb://inventory-db:27017/db_inventory` |
| `REDIS_URL` | `redis://127.0.0.1:6379` | `redis://redis:6379` |
| `LOCK_TTL_MS` | `5000` | `5000` |
| `LOG_LEVEL` | `info` | `info` |
| `CATALOG_SERVICE_URL` *(opcional)* | `http://localhost:3001` | `http://catalog-service:3000` |

`REDIS_URL` reemplaza a `REDIS_HOST` + `REDIS_PORT` del monolito. Si `CATALOG_SERVICE_URL` está definida, el alta de stock verifica por HTTP que el libro exista en el catálogo; si no, la verificación se omite.

## Ejecución local

Requiere Node.js 20+, MongoDB en `27017` y Redis o Memurai en `6379`.

```bash
cd services/inventory-service
cp .env.example .env
npm install
npm start
```

- Health: <http://localhost:3002/health>
- Swagger: <http://localhost:3002/api-docs>

Si MongoDB o Redis no están levantados, el servicio arranca igual, reintenta la conexión y responde `503` en las operaciones que los necesitan.

## Docker

```bash
# Desde la raíz del repositorio
docker build -t grupo1/inventory-service:tp6 ./services/inventory-service
```

En Docker Compose el servicio escucha en el puerto `3000` del contenedor (publicado como `3002`) y se conecta a `inventory-db` y `redis` por su nombre DNS, cambiando **solo** las variables de entorno.

## Prueba de concurrencia

Adaptación de `app-base/test-concurrencia.js` para el servicio nuevo. Con el servicio levantado:

```bash
npm run test:concurrencia
# o contra otra URL / con otros parámetros:
INVENTORY_SERVICE_URL=http://localhost:3002 COMPRADORES=20 STOCK_INICIAL=5 npm run test:concurrencia
```

Hace dos pruebas: (1) dos clientes compran el último ejemplar a la vez y (2) `COMPRADORES` compras simultáneas sobre `STOCK_INICIAL` unidades. Verifica que nunca se acepten más compras que unidades y que el stock final cuadre. Sale con código `1` si detecta sobreventa.

## Estructura

```
inventory-service/
├── src/
│   ├── routes/inventarioRoutes.js        # rutas + documentación Swagger
│   ├── controllers/inventarioController.js # validación HTTP y traducción de errores
│   ├── services/inventarioService.js     # reglas de negocio de stock
│   ├── services/lockService.js           # lock distribuido (SET NX PX + Lua)
│   ├── clients/catalogClient.js          # verificación opcional contra catalog-service
│   ├── models/Stock.js · Movimiento.js   # modelos propios de db_inventory
│   ├── config/                           # env, db, redis, logger, swagger
│   └── app.js
├── scripts/test-concurrencia.js
├── index.js · package.json · Dockerfile · .dockerignore · .env.example
```
