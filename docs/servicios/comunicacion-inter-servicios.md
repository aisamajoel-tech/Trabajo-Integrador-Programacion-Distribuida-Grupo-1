# Especificación Técnica — Comunicaciones HTTP/REST y Resiliencia
**Issue #5: [Comunicaciones] Matriz de comunicación HTTP/REST y resiliencia ante fallos**  
**Responsable:** Carolina Fetta (@gcfetta) · **Rama:** `feature/service-communication-spec`  
**Referencia:** `docs/arquitectura.md` — Secciones 8 y 9.

---

## 1. Principios de Comunicación Inter-Servicios

La arquitectura implementa un modelo de comunicación síncrona basado en **HTTP/REST con JSON**. Las decisiones fundamentales de diseño son:
1. **Dependencias Unidireccionales:** `orders-service` invoca a `catalog-service` e `inventory-service`. Ni catálogo ni inventario conocen la existencia de `orders-service`.
2. **Desacoplamiento Tecnológico:** Ningún contrato expone detalles de bases de datos o middlewares. El transporte utiliza exclusivamente códigos de estado HTTP estándar (200, 201, 400, 404, 409, 503).
3. **Trazabilidad Distribuida:** Toda solicitud propaga la cabecera `x-request-id` generada en el punto de entrada para correlacionar logs de Winston a través de los tres microservicios.

---

## 2. Matriz de Comunicaciones HTTP/REST

| # | Origen | Destino | Necesidad de Negocio | Método / Ruta | Carga Útil (Payload) | Respuesta Esperada |
|:---:|---|---|---|---|---|---|
| **1** | **Cliente** | `orders-service` | Iniciar una compra | `POST /api/ordenes` | `{ clienteId, libroId, cantidad }` | `201 Created` con detalle de orden |
| **2** | `orders-service` | `catalog-service` | Validar libro y obtener datos para comprobante | `GET /api/libros/:id` | Path `id` + header `x-request-id` | `200 OK` `{ titulo, autor, isbn }` o `404 Not Found` |
| **3** | `orders-service` | `inventory-service` | Descontar stock bajo exclusión mutua | `POST /api/inventario/:libroId/descontar` | `{ cantidad, ordenId }` + header `x-request-id` | `200 OK` (descontado), `400 Bad Request` (sin stock), `409 Conflict` (lock ocupado) |
| **4** | `orders-service` | `inventory-service` | Compensar descuento no confirmado (Saga) | `POST /api/inventario/:libroId/revertir` | `{ ordenId }` + header `x-request-id` | `200 OK` (unidades devueltas) |
| **5** | `inventory-service` | `catalog-service` | Validar que la obra existe al crear stock inicial | `GET /api/libros/:id` | Path `id` | `200 OK` (existe) o `404 Not Found` |
| **6** | **Cliente** | `catalog-service` | Exploración pública de catálogo | `GET /api/libros` | Query params opcionales | `200 OK` con array de libros sin stock |
| **7** | **Cliente** | `inventory-service` | Consultar disponibilidad | `GET /api/inventario/:libroId` | Path `libroId` | `200 OK` `{ libroId, stockDisponible }` |

---

## 3. Análisis Crítico de las Comunicaciones

1. **¿Es realmente necesario que un servicio conozca al otro?**  
   Sí, pero únicamente en sentido descendente. `orders-service` orquesta la compra; para saber si confirma, necesita consultar la verdad bibliográfica (catálogo) y la verdad de existencias (inventario).
2. **¿Se duplica una regla de negocio que debería tener un único propietario?**  
   No. `orders-service` no verifica stock ni valida ISBN; solo interpreta los códigos de retorno HTTP.
3. **¿La información solicitada podría pertenecer al servicio que la necesita?**  
   No. Si órdenes guardara el catálogo o el stock, se recrearía el monolito previo. Solo almacena una fotografía histórica inmutable (`libroSnapshot`).
4. **¿El contrato puede expresarse sin detalles internos?**  
   Sí. El contrato de inventario recibe `{ cantidad, ordenId }`; no menciona Redis, locks ni scripts Lua.
5. **¿Qué ocurre si el destino no está disponible?**  
   Se activa la estrategia de resiliencia con degradación elegante.

---

## 4. Estrategia de Resiliencia y Manejo de Fallas

### 4.1 Timeouts y Cancelación Rápida (*Fail-Fast*)
Cada llamada REST entre servicios utiliza un cliente HTTP con límite de tiempo estricto (`HTTP_TIMEOUT_MS = 3000`). Si el servicio destino no responde en 3 segundos, la promesa se rechaza y se cancela la espera para evitar agotar el pool de conexiones.

### 4.2 Código HTTP `503 Service Unavailable` y Transiciones
* Si `catalog-service` no responde: la orden se marca `RECHAZADA` con motivo `SERVICIO_NO_DISPONIBLE` y el cliente recibe `503`. El stock nunca se toca.
* Si `inventory-service` no responde:
  1. Si ocurrió antes de llamar: orden rechazada con `503`.
  2. Si ocurrió durante el descuento y la respuesta se perdió por timeout: `orders-service` invoca inmediatamente `POST /api/inventario/:libroId/revertir` con el `ordenId`. Gracias a la idempotencia, el stock queda protegido contra inconsistencias.

### 4.3 Configuración de Variables de Entorno
```env
ORDERS_PORT=3003
CATALOG_SERVICE_URL=http://localhost:3001
INVENTORY_SERVICE_URL=http://localhost:3002
HTTP_TIMEOUT_MS=3000
```

---

## 5. Checklist de la Issue #5 cumplido

- [x] Matriz integral de comunicaciones HTTP/REST completada con contratos DTO y status codes.
- [x] Respuestas analíticas exhaustivas a las 5 preguntas críticas de la Sección 10.
- [x] Definición detallada de la política de timeouts (3000ms), propagación de `x-request-id`, reversión por compensación y respuesta `503 Service Unavailable`.
