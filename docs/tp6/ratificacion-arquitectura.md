# Ratificación de Arquitectura — Hito 1 (TP N° 6)
**Programación Distribuida · Grupo N° 1 · Responsable: Delfina Ibáñez (@delfinaibanez)**
**Rama:** `docs/tp6-ratificacion`

Este documento ratifica la arquitectura de 3 microservicios definida en el TP5 (`docs/arquitectura.md`) antes de implementarla en el TP6, y deja explícitos los cambios introducidos.

---

## 1. Matriz de microservicios

| Microservicio | Responsabilidad | Endpoints a implementar | Datos propios | Dependencias |
|---|---|---|---|---|
| `catalog-service` (3001) | Datos bibliográficos de los libros. | `GET /api/libros` · `GET /api/libros/:id` · `POST /api/libros` · `PUT /api/libros/:id` · `DELETE /api/libros/:id` · `GET /health` · `/api-docs` | MongoDB `db_catalog`, colección `libros` (titulo, autor, año, genero, isbn; **sin `stock`**) | Ninguna (solo su MongoDB) |
| `inventory-service` (3002) | Stock por libro y control de concurrencia con lock distribuido. | `POST /api/inventario` · `GET /api/inventario/:libroId` · `POST /api/inventario/:libroId/descontar` · `POST /api/inventario/:libroId/reponer` · `GET /api/inventario/:libroId/lock-status` · `GET /health` · `/api-docs` | MongoDB `db_inventory`, colección `stock` (`libroId`, `stockDisponible`); lock `lock:libro:{id}` en Redis | Redis (lock). `libroId` es referencia lógica: nunca accede a `db_catalog` |
| `orders-service` (3003) | Orquestar la compra y registrar la orden de forma inmutable. | `POST /api/ordenes` · `GET /api/ordenes/:id` · `GET /api/ordenes/cliente/:clienteId` · `GET /health` · `/api-docs` | MongoDB `db_orders`, colección `ordenes` (estado, motivoRechazo, libroSnapshot, requestId) | HTTP a `catalog-service` y `inventory-service` |

Regla común: cada servicio escribe **solo** en su propia base; la información de otro servicio se obtiene únicamente por su API REST.

---

## 2. Destino de cada endpoint del monolito (`app-base`)

| Endpoint del monolito | Servicio que se queda con él | Observación |
|---|---|---|
| `GET /api/libros` | `catalog-service` | Se migra igual. |
| `GET /api/libros/:id` | `catalog-service` | Se migra igual. |
| `POST /api/libros` | `catalog-service` | Sin campo `stock`. |
| `PUT /api/libros/:id` | `catalog-service` | Sin campo `stock`. |
| `DELETE /api/libros/:id` | `catalog-service` | Se migra igual. |
| `POST /api/libros/:id/comprar` | `orders-service` (`POST /api/ordenes`) | Orders valida el libro en catálogo y descuenta en inventory (`POST /api/inventario/:libroId/descontar`). |
| `POST /api/libros/:id/reset-stock` | `inventory-service` (`POST /api/inventario/:libroId/reponer`) | Renombrado y con semántica de reposición. |
| `GET /api/libros/:id/lock-status` | `inventory-service` (`GET /api/inventario/:libroId/lock-status`) | Endpoint de diagnóstico. |
| `POST /api/libros/:id/comprar-inseguro` | **Se elimina** | Era solo demostrativo (compra sin lock). |

---

## 3. Casos de uso

| Caso | Entrada | Servicio responsable | Servicios consultados | Resultado |
|---|---|---|---|---|
| Explorar catálogo | `GET /api/libros` | `catalog-service` | Ninguno | `200` con la lista de libros. |
| Ver detalle de un libro | `GET /api/libros/:id` | `catalog-service` | Ninguno | `200` libro · `404` si no existe. |
| Alta de un libro con stock inicial | `POST /api/libros` y luego `POST /api/inventario` | `catalog-service` y `inventory-service` (llamadas separadas del cliente o del seed) | Ninguno entre sí | `201` libro creado y `201` registro de stock. |
| Compra exitosa | `POST /api/ordenes` `{ clienteId, libroId, cantidad }` | `orders-service` | `catalog-service` (existe el libro) → `inventory-service` (descuenta con lock) | `201`, orden `CONFIRMADA`. |
| Compra de libro inexistente | `POST /api/ordenes` con `libroId` inválido | `orders-service` | `catalog-service` | `404`, orden `RECHAZADA` (`LIBRO_INEXISTENTE`). No se llama a inventory. |
| Compra sin stock suficiente | `POST /api/ordenes` con cantidad mayor al stock | `orders-service` | `catalog-service` → `inventory-service` (responde `400`) | `409`, orden `RECHAZADA` (`SIN_STOCK`). |
| Compras concurrentes del mismo libro | Dos `POST /api/ordenes` simultáneos | `orders-service` | `inventory-service` + Redis | Una se confirma; la otra recibe `409` del lock, orden `RECHAZADA` (`CONCURRENCIA`). Sin sobreventa. |
| Reponer stock | `POST /api/inventario/:libroId/reponer` | `inventory-service` | Ninguno | `200` con el stock actualizado. |
| Inventario no disponible | `POST /api/ordenes` con `inventory-service` caído | `orders-service` | `inventory-service` (timeout o conexión rechazada) | `503`, orden `RECHAZADA` (`SERVICIO_NO_DISPONIBLE`); orders sigue funcionando. |

---

## 4. Cambios respecto del TP5 y justificación

| Cambio | TP5 | TP6 | Justificación |
|---|---|---|---|
| `reset-stock` → `reponer` | `POST /api/libros/:id/reset-stock` (en el recurso libro) | `POST /api/inventario/:libroId/reponer` | El stock ya no pertenece al libro: lo gestiona `inventory-service`. "Reponer" describe la operación de negocio real. |
| `comprar-inseguro` eliminado | Existía como demostración sin lock | No se migra | Solo servía para mostrar la sobreventa del monolito; la prueba de concurrencia ahora se hace contra `descontar` (con lock). |
| `comprar` → `POST /api/ordenes` | Mutación directa del stock dentro de `/libros/:id/comprar` | La compra es una entidad (Orden) orquestada por `orders-service` | Trazabilidad y separación de responsabilidades. |
| Estados de orden unificados | Variantes `RECHAZADA_SIN_STOCK`, `RECHAZADA_POR_CONCURRENCIA`, `FALLIDA` | `RECHAZADA` + campo `motivoRechazo` | Más simple de consultar y de extender sin cambiar la máquina de estados. |
| Variables de entorno | `PORT_HTTP`, `REDIS_HOST` + `REDIS_PORT` | `PORT`, `MONGODB_URI`, `REDIS_URL`, `*_SERVICE_URL`, etc. | Mismos nombres en todos los servicios; la misma imagen corre en local y en Docker Compose cambiando solo variables. |
| Despliegue | Un único proceso | 3 servicios + 3 Mongo + Redis con Docker Compose | Requisito del TP6: cada servicio con su propia base y contenedor. |
