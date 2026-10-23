# Especificación Técnica — `inventory-service`
**Issue #2: [Inventario] Control de stock y exclusión mutua distribuida con Redis Lock**  
**Responsable:** Bautista Navarro (@BautiNavarro) · **Rama:** `feature/inventory-concurrency-spec`  
**Referencia:** `docs/arquitectura.md` — Ficha N° 2 (sección 6.1), Matriz de datos (sección 7) y Caso de Uso B (sección 9).

---

## 1. Propósito del servicio

`inventory-service` es el microservicio encargado de **custodiar las existencias físicas** de cada obra literaria y garantizar la **consistencia estricta del stock** ante solicitudes simultáneas de compra. Confinando el mecanismo de exclusión mutua distribuida (Redis Distributed Lock) en su interior, asegura que bajo ninguna circunstancia ocurra sobreventa (*overselling*) ni condiciones de carrera (*race conditions*).

| Dato técnico | Valor |
|---|---|
| Puerto | `3002` |
| Base de datos | MongoDB `db_inventory` |
| Colecciones | `stock` (saldo disponible), `movimientos` (auditoría/idempotencia) |
| Coordinador de concurrencia | Redis / Memurai (puerto 6379) mediante Distributed Lock |
| Depende de | `catalog-service` (solo en validación durante alta inicial de stock) |
| Es invocado por | Clientes/Administrador e internamente por `orders-service` (orquestación) |

**Fuera de alcance:** 
* No almacena títulos, autores ni metadatos bibliográficos (solo manipula `libroId`).
* No gestiona datos de clientes, medios de pago ni emite comprobantes comerciales.
* No decide si una venta se confirma globalmente (solo aprueba o rechaza el descuento local de unidades).

---

## 2. Modelo de datos (`db_inventory`)

### 2.1 Colección `stock`

Almacena el balance actual de existencias por obra.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `_id` | ObjectId | Sí (auto) | Identificador único del registro de inventario. |
| `libroId` | String | Sí | Identificador foráneo de la obra en `catalog-service` (índice único). |
| `stockDisponible` | Number (entero ≥ 0) | Sí | Cantidad física disponible para venta inmediata. |
| `ultimaActualizacion` | Date | Sí (auto) | Marca temporal del último movimiento aplicado. |

### 2.2 Colección `movimientos` (Idempotencia y Auditoría)

Registra cada descuento o compensación asociada a un pedido para prevenir procesamientos duplicados.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `ordenId` | String | Sí | Identificador único de la orden emitida por `orders-service` (índice único). |
| `libroId` | String | Sí | Obra afectada. |
| `tipo` | String (enum) | Sí | `DESCUENTO` o `REVERSION`. |
| `cantidad` | Number (entero ≥ 1) | Sí | Unidades modificadas. |
| `fecha` | Date | Sí (auto) | Momento exacto del registro. |

### 2.3 Esquema Mongoose de Referencia

```javascript
const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  libroId: {
    type: String,
    required: [true, 'El libroId es obligatorio'],
    unique: true,
    trim: true
  },
  stockDisponible: {
    type: Number,
    required: true,
    min: [0, 'El stock no puede ser negativo'],
    validate: Number.isInteger
  }
}, {
  timestamps: { createdAt: false, updatedAt: 'ultimaActualizacion' },
  versionKey: false
});

stockSchema.index({ libroId: 1 }, { unique: true });

module.exports = mongoose.model('Stock', stockSchema);
```

---

## 3. Mecanismo de Exclusión Mutua Distribuida (Redis Lock)

### 3.1 Adquisición del Lock (SET NX PX)
Para evitar que dos hilos o procesos descuenten el mismo ejemplar simultáneamente, `inventory-service` implementa un candado atómico en Redis:

```javascript
const token = crypto.randomUUID(); // Identificador único del propietario del lock
const lockKey = `lock:libro:${libroId}`;
const TTL_MS = 5000; // 5 segundos para prevenir interbloqueos ante caídas

const acquired = await redis.set(lockKey, token, 'NX', 'PX', TTL_MS);
```

* **`NX`**: Establece la clave únicamente si no existe previamente.
* **`PX 5000`**: Expira automáticamente en 5000 ms garantizando que caídas imprevistas del nodo de inventario no dejen bloqueado el recurso indefinidamente.
* Si `acquired === null`, significa que otra solicitud está procesando compras sobre ese mismo libro. Tras 3 intentos breves de espera con backoff (50 ms), si no logra adquirirlo responde inmediatamente **`HTTP 409 Conflict`**.

### 3.2 Liberación Atómica con Script Lua
Solo el proceso que adquirió el lock tiene autorización para liberarlo. Se evalúa el token antes de eliminar la clave de forma atómica:

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

Esto impide que una operación lenta cuyo lock expiró libere accidentalmente el lock recién adquirido por otro proceso.

---

## 4. Endpoints expuestos y Contratos DTO

### 4.1 `POST /api/inventario/:libroId/descontar` — Sección Crítica

Punto neurálgico de la compra consumido por `orders-service`.

* **Método:** `POST`
* **Ruta:** `/api/inventario/:libroId/descontar`
* **Headers:** `x-request-id`

**DTO de entrada (Request Body):**
```json
{
  "cantidad": 2,
  "ordenId": "6712f0a1c3b2a9e4d1f00a11"
}
```

**Comportamiento y Códigos de Respuesta:**
1. **Verificación de Idempotencia:** Si ya existe un movimiento registrado para ese `ordenId`, devuelve `200 OK` sin descontar nuevamente.
2. **Adquisición de Lock:** Intenta tomar `lock:libro:{id}`. Si está ocupado → `409 Conflict`.
3. **Validación de Existencias:** Si `stockDisponible < cantidad` → libera lock y devuelve `400 Bad Request`.
4. **Descuento Atómico:** Resta las unidades, registra el movimiento y libera el lock. Devuelve `200 OK`.

**Ejemplo respuesta exitosa (`200 OK`):**
```json
{
  "libroId": "6712e8f0c3b2a9e4d1f00001",
  "stockPrevio": 5,
  "cantidadDescontada": 2,
  "stockRestante": 3,
  "ordenId": "6712f0a1c3b2a9e4d1f00a11"
}
```

**Ejemplo conflicto de concurrencia (`409 Conflict`):**
```json
{
  "error": "Recurso bloqueado",
  "mensaje": "El stock de este libro está siendo disputado por otra transacción concurrente. Reintente en breve."
}
```

**Ejemplo stock insuficiente (`400 Bad Request`):**
```json
{
  "error": "Stock insuficiente",
  "stockDisponible": 1,
  "cantidadSolicitada": 2
}
```

---

### 4.2 `POST /api/inventario/:libroId/revertir` — Compensación (Saga)

Permite anular un descuento si la orden no pudo completarse en `orders-service` (ej. caída de red).

* **Body:** `{ "ordenId": "6712f0a1c3b2a9e4d1f00a11" }`
* **Regla:** Solo devuelve las unidades al stock si verifica en la colección `movimientos` que ese `ordenId` fue efectivamente descontado antes.

---

### 4.3 `GET /api/inventario/:libroId` — Consulta de Stock Disponible

* **Método:** `GET`
* **Respuesta (`200 OK`):**
```json
{
  "libroId": "6712e8f0c3b2a9e4d1f00001",
  "stockDisponible": 3,
  "ultimaActualizacion": "2026-10-22T20:15:30.000Z"
}
```

---

### 4.4 `POST /api/inventario/:libroId/reponer` — Reabastecimiento

* **Body:** `{ "cantidad": 10 }`
* **Respuesta (`200 OK`):** Retorna el nuevo saldo actualizado.

---

### 4.5 `GET /api/inventario/:libroId/lock-status` — Diagnóstico

Inspecciona en Redis si existe un lock activo, su TTL restante en milisegundos y el titular.

---

## 5. Checklist de la Issue #2 cumplido

- [x] Especificación completa del endpoint `POST /api/inventario/:libroId/descontar` con soporte de idempotencia por `ordenId`.
- [x] Documentación exhaustiva del mecanismo de exclusión mutua distribuida (`SET NX PX 5000` y script Lua de liberación atómica).
- [x] Tratamiento explícito de `HTTP 409 Conflict` ante retención de lock y `HTTP 400 Bad Request` ante stock insuficiente.
- [x] Endpoints complementarios de consulta (`GET`), reposición (`POST /reponer`), reversión (`POST /revertir`) y diagnóstico (`GET /lock-status`).
