# Análisis de fallo parcial — Caso de compra (consigna, sección 15.3)

**Responsable:** Carolina Fetta (`@gcfetta`) · **Issue:** #15
**Caso analizado:** `POST /api/ordenes` (orders-service → catalog-service → inventory-service → orders-service)
**Base:** `docs/servicios/orders-service.md` (sección 5.4) y `services/orders-service/src/services/ordenesService.js`.

---

## 1. Servicios que participan y orden de las llamadas

| # | Etapa | Servicio | Llamada | Base que escribe |
|---|---|---|---|---|
| 0 | Registrar la intención de compra | `orders-service` | (interna) `Orden.create` | `db_orders` |
| 1 | Verificar que el libro existe | `catalog-service` | `GET /api/libros/:id` | ninguna (solo lectura) |
| 2 | Descontar el stock | `inventory-service` | `POST /api/inventario/:libroId/descontar` con `{ cantidad, clienteId, ordenId }` | `db_inventory` |
| 3 | Cerrar la orden | `orders-service` | (interna) `findOneAndUpdate` | `db_orders` |

Cada servicio escribe únicamente en su propia base. **No existe una transacción distribuida** entre `db_orders` y `db_inventory`: no se pueden confirmar o deshacer de forma atómica. Por eso aparecen los casos de fallo parcial.

## 2. Cambio de estado que produce cada etapa

| Etapa | Cambio de estado |
|---|---|
| 0 | Nace la orden en estado `PENDIENTE` (con `requestId`). |
| 1 | Ningún cambio de datos. Orders guarda `libroSnapshot` en la orden. |
| 2 | `stockDisponible` baja en `db_inventory` y se registra un `Movimiento` de tipo `DESCUENTO` asociado al `ordenId`. |
| 3 | La orden pasa a `CONFIRMADA` (o `RECHAZADA` con `motivoRechazo`). Son estados finales e inmutables. |

## 3. ¿Qué pasa si falla cada etapa?

| Falla en… | Estado de los datos | Resultado al cliente | ¿Inconsistencia? |
|---|---|---|---|
| **Etapa 0** (orders-db caída) | No se creó nada. | Error controlado, no se tocó ningún otro servicio. | No. |
| **Etapa 1** (catalog caído / libro inexistente) | Stock intacto. Orden `RECHAZADA` (`SERVICIO_NO_DISPONIBLE` o `LIBRO_INEXISTENTE`). | `503` o `404`. | No: el catálogo es solo lectura y todavía no se descontó nada. |
| **Etapa 2, falla segura** (inventory caído, `ENOTFOUND`, conexión rechazada, sin stock, lock ocupado) | Stock intacto. Orden `RECHAZADA`. | `503` / `409`. | No: se sabe con certeza que no se descontó. Probado en `evidencia-orders.md` (sección 4). |
| **Etapa 2, resultado incierto** (timeout: inventory pudo descontar y no llegó la respuesta) | Puede haberse descontado sin que orders lo sepa. | `503`, orden `RECHAZADA`. | **Parcial, pero cubierto:** orders pide `POST /revertir` con el mismo `ordenId`. Si inventory no responde, la orden queda con `compensacion: PENDIENTE` y un temporizador (`COMPENSACION_INTERVALO_MS`, 30 s) reintenta hasta lograrlo. `revertir` es idempotente: solo devuelve unidades si ese `ordenId` descontó y no fue revertido antes. |
| **Etapa 3** (inventory **sí descontó** pero orders no puede guardar `CONFIRMADA`: orders-db cae, el proceso se reinicia o hay un error entre la etapa 2 y la 3) | `db_inventory`: stock descontado + `Movimiento DESCUENTO`. `db_orders`: la orden sigue `PENDIENTE`. | `500` o la conexión se corta. | **Sí, es el caso crítico.** El cliente no recibe una orden confirmada, pero el stock ya bajó. |

### 3.1 El caso crítico, en detalle

Secuencia: `descontar` responde `200` → orders intenta `resolver(ordenId, { estado: 'CONFIRMADA' })` → falla.

- **Estado resultante:** inventario con unidades menos y sin orden `CONFIRMADA` que las respalde. La orden queda `PENDIENTE`.
- **Comportamiento actual del código:** la rama de compensación automática solo se dispara cuando el resultado del descuento es `INCIERTO` (timeout), y el temporizador solo reintenta órdenes con `compensacion = 'PENDIENTE'`. Una orden `PENDIENTE` huérfana **no se detecta ni se revierte automáticamente**.
- **Impacto:** stock "perdido" (se muestra menos de lo real) hasta que se corrija a mano. No hay sobreventa, el error es hacia el lado seguro, pero sí hay inconsistencia entre las dos bases.

## 4. ¿Puede el sistema quedar parcialmente actualizado o inconsistente?

**Sí.** Al repartir los datos en bases distintas se renuncia a la atomicidad de una transacción local. El sistema es **eventualmente consistente** solo en los casos con compensación (timeout). En el caso crítico de la sección 3.1 la inconsistencia persiste hasta que alguien la repare.

## 5. Información disponible para detectarlo, recuperarlo y compensarlo

| Dato | Dónde está | Para qué sirve |
|---|---|---|
| `ordenId` | `db_orders` y `Movimiento.ordenId` en `db_inventory` | Une el descuento con la orden. Permite saber si inventario descontó por una orden dada y es la clave de idempotencia (el mismo `ordenId` nunca descuenta dos veces). |
| `requestId` | Header `x-request-id`, guardado en la orden y en los logs de los 3 servicios | Reconstruir una operación completa leyendo los logs de cada servicio. |
| `estado` + `fechaCreacion` de la orden | `db_orders` | Detectar órdenes `PENDIENTE` demasiado antiguas (más viejas que el timeout, p. ej. > 1 minuto). |
| `compensacion` (`NO_REQUERIDA` / `PENDIENTE` / `REALIZADA`) | `db_orders` | Saber si hay una reversión pendiente de reintento. |
| `Movimiento` (`DESCUENTO`, `REVERSION`) | `db_inventory` | Auditar cada cambio de stock y evitar revertir dos veces. |
| `POST /api/inventario/:libroId/revertir` | inventory-service | Operación de compensación ya implementada (reposición ligada al `ordenId`). |

## 6. Estrategia de detección y recuperación

**Detección:** listar órdenes `PENDIENTE` con antigüedad mayor a un umbral y comprobar en inventario si existe un `DESCUENTO` para su `ordenId`. Con los logs se sigue el recorrido por `requestId`.

**Recuperación (compensación tipo saga):** para cada orden `PENDIENTE` vencida con descuento registrado, hay dos opciones coherentes con el diseño:

1. **Revertir** el descuento (`POST /revertir` con el `ordenId`) y marcar la orden `RECHAZADA` con `compensacion: REALIZADA`. Es lo más simple y es seguro por la idempotencia.
2. **Completar** la orden pasándola a `CONFIRMADA`, si se pudiera consultar a inventario que el descuento existe y el cliente sigue esperando.

**Mejoras propuestas (no implementadas en esta entrega):**

- Ante un error al guardar `CONFIRMADA`, marcar `compensacion = 'PENDIENTE'` para que el reintento existente revierta el descuento.
- Un reconciliador periódico que procese órdenes `PENDIENTE` antiguas (misma idea que `procesarCompensacionesPendientes`).
- Un endpoint de consulta en inventory para saber si un `ordenId` descontó.

## 7. Conclusión

Con la arquitectura actual, **el orden de llamadas minimiza el daño**: se consulta al catálogo (solo lectura) antes de tocar el stock, y el descuento es idempotente y reversible gracias al `ordenId`. Los fallos antes del descuento y los timeouts quedan cubiertos. El único hueco real es la caída de orders entre el descuento y el cierre de la orden, que deja stock descontado con la orden `PENDIENTE`. Se detecta con `ordenId`/`requestId` y se corrige con la operación `revertir` ya existente.