# Especificación Técnica — `orders-service`
**Issue #3: [Ventas] Servicio de Órdenes y trazado del flujo de compras**
**Responsable:** Candela Aguilar (@candeaguilar) · **Rama:** `feature/orders-service-spec`
**Referencia:** `docs/arquitectura.md` — Ficha N° 3 (sección 6.1), Matriz de comunicaciones (sección 8.1) y Caso de Uso B (sección 9).

---

## 1. Propósito del servicio

`orders-service` convierte la acción de compra —que en el monolito era una mutación directa del stock dentro de `POST /api/libros/:id/comprar`— en una entidad de primer orden: la **Orden de Compra**. Su única responsabilidad es **orquestar** la venta: recibe el pedido del cliente, consulta a los servicios dueños de cada dato y deja un registro trazable e inmutable del resultado.

| Dato técnico | Valor |
|---|---|
| Puerto | `3003` |
| Base de datos | MongoDB `db_orders` |
| Colección | `ordenes` |
| Rol en la arquitectura | Orquestador (Saga orquestada simple, sin compensaciones) |
| Depende de | `catalog-service` (3001) y `inventory-service` (3002) |
| Es invocado por | Cliente / aplicación compradora |

**Fuera de alcance:** no lee ni escribe stock, no accede a `db_catalog` ni a `db_inventory`, no implementa locks y no valida reglas bibliográficas (ISBN, género, etc.). Solo interpreta los códigos HTTP que devuelven los otros servicios.

---

## 2. Modelo de datos — colección `ordenes` (`db_orders`)

### 2.1 Estructura del documento

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `_id` | ObjectId | Sí (auto) | Identificador único de la orden (`ordenId`). |
| `clienteId` | String | Sí | Identificador del cliente emisor. |
| `libroId` | String | Sí | Identificador del libro en `catalog-service`. |
| `cantidad` | Number (entero ≥ 1) | Sí | Unidades solicitadas. |
| `estado` | String (enum) | Sí | `PENDIENTE`, `CONFIRMADA` o `RECHAZADA`. |
| `motivoRechazo` | String (enum) \| null | Solo si `RECHAZADA` | `LIBRO_INEXISTENTE`, `SIN_STOCK`, `CONCURRENCIA`, `SERVICIO_NO_DISPONIBLE`. |
| `libroSnapshot` | Object | Solo si el libro existe | Copia de `{ titulo, autor, isbn }` al momento de la compra, para el comprobante. |
| `requestId` | String | Sí | Valor del header `x-request-id`, propagado a los otros servicios para trazar la operación. |
| `fechaCreacion` | Date | Sí (auto) | Momento en que se registró la orden. |
| `fechaResolucion` | Date \| null | No | Momento en que pasó a `CONFIRMADA` o `RECHAZADA`. |

> **Sobre `libroSnapshot`:** no es duplicación de datos del catálogo. Es una *fotografía histórica* que el comprobante necesita aunque el libro cambie de título o se dé de baja en el futuro. `orders-service` nunca la usa para tomar decisiones ni la sincroniza.

### 2.2 Ejemplo de documento

```json
{
  "_id": "6712f0a1c3b2a9e4d1f00a11",
  "clienteId": "cli-0042",
  "libroId": "6712e8f0c3b2a9e4d1f00001",
  "cantidad": 2,
  "estado": "CONFIRMADA",
  "motivoRechazo": null,
  "libroSnapshot": {
    "titulo": "Cien años de soledad",
    "autor": "Gabriel García Márquez",
    "isbn": "978-0307474728"
  },
  "requestId": "b7e2c1d4-9a3f-4e1b-8c55-1f0d2a7e9b30",
  "fechaCreacion": "2026-10-17T19:40:12.381Z",
  "fechaResolucion": "2026-10-17T19:40:12.512Z"
}
```

### 2.3 Esquema de referencia (Mongoose)

```js
const ordenSchema = new mongoose.Schema({
  clienteId: { type: String, required: true, trim: true },
  libroId:   { type: String, required: true, trim: true },
  cantidad:  { type: Number, required: true, min: 1, validate: Number.isInteger },
  estado:    { type: String, enum: ['PENDIENTE', 'CONFIRMADA', 'RECHAZADA'], default: 'PENDIENTE' },
  motivoRechazo: {
    type: String,
    enum: ['LIBRO_INEXISTENTE', 'SIN_STOCK', 'CONCURRENCIA', 'SERVICIO_NO_DISPONIBLE', null],
    default: null
  },
  libroSnapshot: { titulo: String, autor: String, isbn: String },
  requestId: { type: String, required: true },
  fechaResolucion: { type: Date, default: null }
}, { timestamps: { createdAt: 'fechaCreacion', updatedAt: false } });

ordenSchema.index({ clienteId: 1, fechaCreacion: -1 }); // historial por cliente
```

### 2.4 Máquina de estados

```
                 ┌──────────────┐
  POST /ordenes  │  PENDIENTE   │
 ───────────────>│ (se persiste │
                 │  al recibir) │
                 └──────┬───────┘
          200 de        │        404 / 400 / 409 / 503
       inventario ┌─────┴─────┐  (o timeout)
                  ▼           ▼
          ┌────────────┐ ┌────────────┐
          │ CONFIRMADA │ │ RECHAZADA  │
          │  (final)   │ │ + motivo   │
          └────────────┘ │  (final)   │
                         └────────────┘
```

- La orden se guarda como `PENDIENTE` **antes** de llamar a otros servicios: así queda registro aunque el proceso se corte a mitad de camino.
- `PENDIENTE → CONFIRMADA` y `PENDIENTE → RECHAZADA` son las **únicas transiciones válidas**.
- `CONFIRMADA` y `RECHAZADA` son **estados finales**.

> **Unificación de estados:** en `arquitectura.md` aparecen las variantes `RECHAZADA_SIN_STOCK`, `RECHAZADA_POR_CONCURRENCIA` y `FALLIDA`. Esta especificación las unifica en un único estado `RECHAZADA` + el campo `motivoRechazo`, que es más simple de consultar y extender (agregar un motivo nuevo no cambia la máquina de estados).

### 2.5 Regla de inmutabilidad

Una vez que la orden alcanza un estado final:
- No existe endpoint `PUT`, `PATCH` ni `DELETE` sobre `/api/ordenes`.
- Internamente, la actualización de estado se hace con un filtro condicional, de modo que solo puede modificar órdenes que sigan `PENDIENTE`:

```js
await Orden.updateOne(
  { _id: ordenId, estado: 'PENDIENTE' },
  { $set: { estado: 'CONFIRMADA', fechaResolucion: new Date() } }
);
```

- Si en el futuro se necesitara anular una venta, se registra una **nueva** orden de devolución; nunca se edita la original. Esto garantiza la auditoría comercial.

---

## 3. Endpoints expuestos

### 3.1 `POST /api/ordenes` — Crear orden de compra (punto de entrada principal)

**Request**
```http
POST /api/ordenes
Content-Type: application/json
x-request-id: b7e2c1d4-9a3f-4e1b-8c55-1f0d2a7e9b30   (opcional; si no viene, el servicio genera uno)

{ "clienteId": "cli-0042", "libroId": "6712e8f0c3b2a9e4d1f00001", "cantidad": 2 }
```

**Validaciones de entrada (propias del servicio):**
- `clienteId` y `libroId`: strings no vacíos.
- `cantidad`: entero ≥ 1.
- Si falla alguna → `400 Bad Request` **sin** crear orden ni llamar a otros servicios.

**Respuestas**

| Código | Situación | `estado` / `motivoRechazo` |
|---|---|---|
| `201 Created` | Libro existe y el stock se descontó. | `CONFIRMADA` |
| `400 Bad Request` | Body inválido (no se crea orden). | — |
| `404 Not Found` | `catalog-service` indicó que el libro no existe. | `RECHAZADA` / `LIBRO_INEXISTENTE` |
| `409 Conflict` | Stock insuficiente (inventario respondió 400). | `RECHAZADA` / `SIN_STOCK` |
| `409 Conflict` | Recurso bloqueado por otra compra simultánea (inventario respondió 409). | `RECHAZADA` / `CONCURRENCIA` |
| `503 Service Unavailable` | Catálogo o inventario caído / timeout. | `RECHAZADA` / `SERVICIO_NO_DISPONIBLE` |

> Se responde `409` (y no `400`) ante falta de stock porque el pedido del cliente **está bien formado**: lo que falla es el estado actual del recurso. `400` queda reservado para errores del body. El detalle de la estrategia de timeouts y `503` está en la especificación de comunicaciones (Issue #5).

**Ejemplo `201 Created`**
```json
{
  "ordenId": "6712f0a1c3b2a9e4d1f00a11",
  "estado": "CONFIRMADA",
  "clienteId": "cli-0042",
  "libro": { "id": "6712e8f0c3b2a9e4d1f00001", "titulo": "Cien años de soledad", "autor": "Gabriel García Márquez", "isbn": "978-0307474728" },
  "cantidad": 2,
  "fechaCreacion": "2026-10-17T19:40:12.381Z"
}
```

**Ejemplo `409 Conflict` (concurrencia)**
```json
{
  "ordenId": "6712f0a1c3b2a9e4d1f00a12",
  "estado": "RECHAZADA",
  "motivoRechazo": "CONCURRENCIA",
  "mensaje": "El libro está siendo comprado por otro cliente en este momento. Intentá nuevamente en unos segundos."
}
```

> En los rechazos se devuelve igual el `ordenId`: el cliente queda con un comprobante de que el intento existió y por qué no se concretó.

### 3.2 `GET /api/ordenes/:id` — Consultar una orden

| Código | Situación |
|---|---|
| `200 OK` | Devuelve el documento completo de la orden. |
| `400 Bad Request` | `id` con formato inválido (no es ObjectId). |
| `404 Not Found` | No existe una orden con ese `id`. |

No llama a ningún otro servicio: toda la información necesaria está en `db_orders` (incluido el `libroSnapshot`).

### 3.3 `GET /api/ordenes/cliente/:clienteId` — Historial de un cliente

- Devuelve `200 OK` con un array de órdenes ordenado por `fechaCreacion` descendente (usa el índice `{ clienteId: 1, fechaCreacion: -1 }`).
- Filtro opcional por query: `?estado=CONFIRMADA`.
- Si el cliente no tiene órdenes devuelve `200 OK` con `[]` (no es un error).

---

## 4. Llamadas REST salientes

`orders-service` solo conoce las **interfaces públicas** de los otros servicios. No sabe que inventario usa Redis ni cómo valida el catálogo.

| # | Destino | Método y ruta | Envía | Interpreta |
|---|---|---|---|---|
| 1 | `catalog-service` | `GET /api/libros/:id` | Path `id` + header `x-request-id` | `200` → continúa y guarda snapshot · `404` → rechaza `LIBRO_INEXISTENTE` · error/timeout → rechaza `SERVICIO_NO_DISPONIBLE` |
| 2 | `inventory-service` | `POST /api/inventario/:libroId/descontar` | Body `{ cantidad, clienteId }` + header `x-request-id` | `200` → confirma · `400` → rechaza `SIN_STOCK` · `409` → rechaza `CONCURRENCIA` · error/timeout → rechaza `SERVICIO_NO_DISPONIBLE` |

**Orden de las llamadas:** siempre **primero catálogo, después inventario**. Si el libro no existe no tiene sentido intentar tocar el stock, y así se evita tomar un lock en Redis innecesariamente.

**Configuración por variables de entorno** (sin URLs hardcodeadas):
```env
ORDERS_PORT=3003
MONGO_URI_ORDERS=mongodb://localhost:27017/db_orders
CATALOG_SERVICE_URL=http://localhost:3001
INVENTORY_SERVICE_URL=http://localhost:3002
HTTP_TIMEOUT_MS=3000
```

---

## 5. Caso de Uso B — Compra concurrente con exclusión mutua

**Actor:** Cliente / aplicación compradora.
**Objetivo:** Comprar un libro garantizando que nunca se venda más stock del disponible, incluso con pedidos simultáneos.
**Precondición:** Los tres servicios, MongoDB y Redis/Memurai están levantados. El libro existe con stock disponible.

### 5.1 Flujo principal (compra exitosa)

| Paso | Quién | Acción |
|---|---|---|
| 1 | Cliente | Envía `POST /api/ordenes` con `{ clienteId, libroId, cantidad }`. |
| 2 | orders-service | Valida el body. Si es inválido responde `400` y termina. |
| 3 | orders-service | Genera/propaga `x-request-id` y persiste la orden como `PENDIENTE`. |
| 4 | orders-service → catalog-service | `GET /api/libros/:id` para verificar existencia. |
| 5 | catalog-service | Responde `200 OK` con `{ titulo, autor, isbn, ... }`. |
| 6 | orders-service | Guarda `libroSnapshot` en la orden. |
| 7 | orders-service → inventory-service | `POST /api/inventario/:libroId/descontar` con `{ cantidad, clienteId }`. |
| 8 | inventory-service → Redis | `SET lock:libro:{id} <token> NX PX 5000` → lock adquirido. |
| 9 | inventory-service | Verifica stock suficiente y lo descuenta en `db_inventory`. |
| 10 | inventory-service → Redis | Libera el lock con script Lua (solo si el token coincide). |
| 11 | inventory-service | Responde `200 OK` a orders-service. |
| 12 | orders-service | Actualiza la orden `PENDIENTE → CONFIRMADA` (con `fechaResolucion`). |
| 13 | orders-service | Responde `201 Created` al cliente con el comprobante. |

> Los pasos 8 a 10 son responsabilidad exclusiva de `inventory-service` (Issue #2). Para `orders-service` son una caja negra: solo ve el código HTTP del paso 11.

### 5.2 Flujos alternativos

**A1 — El libro no existe (paso 5 devuelve `404`)**
orders-service marca la orden `RECHAZADA / LIBRO_INEXISTENTE`, **no llama a inventario** y responde `404` al cliente.

**A2 — Stock insuficiente (paso 11 devuelve `400`)**
inventory-service tomó el lock, vio que no alcanza, liberó el lock y respondió `400`. orders-service marca `RECHAZADA / SIN_STOCK` y responde `409` al cliente.

**A3 — Compra simultánea sobre el mismo libro (paso 8 falla)**

| t | Cliente A | Cliente B |
|---|---|---|
| t0 | `POST /api/ordenes` → orden A `PENDIENTE` | `POST /api/ordenes` → orden B `PENDIENTE` |
| t1 | Catálogo `200` | Catálogo `200` |
| t2 | Inventario adquiere `lock:libro:{id}` | — |
| t3 | Inventario descontando stock… | Inventario intenta `SET NX` → Redis devuelve `null` (lock ocupado) |
| t4 | — | Inventario responde `409 Conflict` de inmediato |
| t5 | — | Orden B → `RECHAZADA / CONCURRENCIA`; cliente B recibe `409` con mensaje de reintento |
| t6 | Lock liberado, inventario `200` | — |
| t7 | Orden A → `CONFIRMADA`; cliente A recibe `201` | — |

Resultado: **una sola** de las dos compras descuenta stock. No hay sobreventa y ambas órdenes quedan registradas con su resultado real.

**A4 — Un servicio no responde (caída o timeout de `HTTP_TIMEOUT_MS`)**
orders-service marca `RECHAZADA / SERVICIO_NO_DISPONIBLE` y responde `503`. Como la orden ya estaba persistida como `PENDIENTE`, nunca queda una orden "a medio escribir": siempre termina en un estado final explicable.

### 5.3 Postcondiciones

- Toda solicitud válida deja **exactamente una** orden en `db_orders`, en estado `CONFIRMADA` o `RECHAZADA`.
- Una orden `CONFIRMADA` implica que el stock fue descontado por `inventory-service`.
- Una orden `RECHAZADA` implica que el stock **no** fue modificado.

### 5.4 Limitación conocida (fuera del alcance del TP5)

Si inventario descuenta el stock pero su respuesta `200` se pierde por timeout, orders-service marcaría la orden como `RECHAZADA / SERVICIO_NO_DISPONIBLE` aunque el stock sí bajó. Se deja documentado como mejora futura: resolverlo con una operación de compensación (reponer stock) o haciendo idempotente el descuento usando el `ordenId` como clave. Para el alcance de este TP se acepta este riesgo de forma explícita.

---

## 6. Checklist de la Issue #3

- [x] Modelo de datos de la colección `ordenes` en `db_orders`.
- [x] Estados `PENDIENTE`, `CONFIRMADA`, `RECHAZADA` (+ `motivoRechazo`) y sus transiciones.
- [x] Regla de inmutabilidad de órdenes finalizadas.
- [x] Contrato de `POST /api/ordenes` y endpoints de consulta.
- [x] Llamadas REST salientes a `catalog-service` e `inventory-service`.
- [x] Trazado paso a paso del Caso de Uso B, incluyendo flujo concurrente y alternativos.
