# Programación Distribuida - Trabajo Práctico Integrador
**Universidad Champagnat - Licenciatura en Sistemas de Información**
**Grupo N° 1**

Repositorio único y evolutivo para los Trabajos Prácticos de la cátedra de Programación Distribuida.

---

## 👥 Integrantes del Grupo 1
* **Joel Aisama** - [@aisamajoel-tech](https://github.com/aisamajoel-tech)
* **Bautista Navarro** - [@BautiNavarro](https://github.com/BautiNavarro)
* **Candela Aguilar** - [@candeaguilar](https://github.com/candeaguilar)
* **Delfina Ibáñez** - [@delfinaibanez](https://github.com/delfinaibanez)
* **Carolina Fetta** - [@gcfetta](https://github.com/gcfetta)

### Docentes Colaboradores
* Prof. Adriel Álvarez (`alvarezadriel@uch.edu.ar`)
* Prof. Edgardo Cortez (`cortezedgardo@uch.edu.ar`)

---

## 🏗️ Arquitectura (TP6)

El monolito `app-base` se migró a **3 microservicios** independientes, cada uno con su propia base de datos, orquestados con Docker Compose.

| Servicio | Responsabilidad | Base propia | Depende de |
|---|---|---|---|
| `catalog-service` | Catálogo de libros (CRUD) | `db_catalog` (`catalog-db`) | — |
| `inventory-service` | Stock y descuentos con lock distribuido | `db_inventory` (`inventory-db`) + Redis | — |
| `orders-service` | Órdenes de compra (orquesta la compra) | `db_orders` (`orders-db`) | catalog, inventory (HTTP) |

**Flujo de una compra** (`POST /api/ordenes`): `orders` registra la orden `PENDIENTE` → consulta a `catalog` si el libro existe → pide a `inventory` descontar el stock (con lock Redis, idempotente por `ordenId`) → cierra la orden como `CONFIRMADA` o `RECHAZADA`.

Principios: cada servicio escribe **solo en su propia base**; la comunicación es **HTTP** (sin acceso cruzado a bases); las referencias entre servicios son lógicas (`libroId`, `ordenId`).

Más detalle: [`docs/arquitectura.md`](docs/arquitectura.md) · [`docs/servicios/`](docs/servicios/) · [`docs/diagrama-arquitectura.mermaid`](docs/diagrama-arquitectura.mermaid)

---

## 📋 Requisitos
* **Docker Desktop** (incluye Docker Compose v2). Verificar: `docker --version` y `docker compose version`.
* **Node.js 20+** (solo para correr el seed y los scripts de prueba desde el host).
* Puertos libres en el host: **3001, 3002 y 3003**.

## 🐳 Puesta en marcha con Docker

```bash
# 1. (Opcional) variables de entorno de Compose; todas tienen valor por defecto
cp .env.example .env

# 2. Construir y levantar todo
docker compose up --build -d

# 3. Verificar que los 7 contenedores estén "healthy"
docker compose ps

# 4. Cargar datos de prueba
node scripts/seed/seed.js
```

### Comandos Compose útiles

| Acción | Comando |
|---|---|
| Levantar construyendo imágenes | `docker compose up --build -d` |
| Ver estado y salud | `docker compose ps` |
| Ver logs de un servicio | `docker compose logs -f orders-service` |
| Detener un servicio | `docker compose stop inventory-service` |
| Iniciar un servicio detenido | `docker compose start inventory-service` |
| Recrear un servicio | `docker compose up -d --force-recreate catalog-service` |
| Validar el archivo | `docker compose config` |
| Bajar todo **conservando** los datos | `docker compose down` |
| Bajar todo **borrando** los volúmenes | `docker compose down -v` |

## 🌐 Puertos, Swagger y Health

Solo se publican al host los puertos de los servicios. Las bases de datos y Redis **no** se publican.

| Servicio | Puerto host → contenedor | Swagger | Health |
|---|---|---|---|
| `catalog-service` | `3001 → 3000` | http://localhost:3001/api-docs | http://localhost:3001/health |
| `inventory-service` | `3002 → 3000` | http://localhost:3002/api-docs | http://localhost:3002/health |
| `orders-service` | `3003 → 3000` | http://localhost:3003/api-docs | http://localhost:3003/health |

## ⚙️ Variables de entorno

El código no tiene hosts ni puertos fijos: todo se configura por variables (mismo código en local y en Docker).

| Variable | Servicio | En Compose | Descripción |
|---|---|---|---|
| `PORT` | todos | `3000` | Puerto interno |
| `SERVICE_NAME` | todos | nombre del servicio | Aparece en logs y `/health` |
| `MONGODB_URI` | todos | `mongodb://<servicio>-db:27017/db_<nombre>` | Base propia de cada servicio |
| `REDIS_URL` | inventory | `redis://redis:6379` | Lock distribuido |
| `LOCK_TTL_MS` | inventory | `5000` | Duración del lock |
| `CATALOG_SERVICE_URL` | orders | `http://catalog-service:3000` | URL del catálogo |
| `INVENTORY_SERVICE_URL` | orders | `http://inventory-service:3000` | URL de inventario |
| `HTTP_TIMEOUT_MS` | orders | `3000` | Timeout de llamadas entre servicios |
| `COMPENSACION_INTERVALO_MS` | orders | `30000` | Reintento de compensaciones pendientes |
| `LOG_LEVEL` | todos | `info` | `error`, `warn`, `info`, `debug` |
| `CATALOG_HOST_PORT` / `INVENTORY_HOST_PORT` / `ORDERS_HOST_PORT` | Compose | `3001` / `3002` / `3003` | Puertos publicados en el host |

Cada servicio incluye su `.env.example` para correrlo en local sin Docker.

## 🔗 DNS interno y volúmenes

* **DNS interno:** los contenedores están en la red `backend`; Compose resuelve cada servicio por su nombre (`catalog-service`, `inventory-service`, `catalog-db`, `redis`, etc.). Por eso `orders-service` usa `http://catalog-service:3000` y no `localhost`.
* **Volúmenes nombrados:** `catalog_db_data`, `inventory_db_data` y `orders_db_data` (uno por MongoDB). Los datos **sobreviven** a `docker compose down` y se **pierden** solo con `docker compose down -v`.
* **Arranque ordenado:** `depends_on` con `condition: service_healthy`; cada servicio espera a que su base esté saludable.

## 🌱 Datos de prueba

```bash
node scripts/seed/seed.js
```

Carga 5 libros y su stock **a través de las APIs** (nunca toca las bases). Es idempotente. Detalle en [`scripts/seed/README.md`](scripts/seed/README.md).

## ✅ Instalación y verificación de Docker

En Windows se usa Docker Desktop con backend WSL 2. Verificación mínima:

```bash
wsl --status          # solo Windows
docker --version
docker compose version
docker info
docker run --rm hello-world
```

## 🔄 Cambios respecto del TP5

| Cambio | Justificación |
|---|---|
| `reset-stock` pasa a `POST /api/inventario/:libroId/reponer` | La reposición es una regla de negocio de inventario y se expresa con una operación explícita. |
| Se elimina `comprar-inseguro` | Era un endpoint de demostración de la condición de carrera del monolito; ya no tiene sentido. |
| La compra se orquesta en `orders-service` (`POST /api/ordenes`) | `orders` consulta a `catalog` y delega el descuento en `inventory`, sin acceder a sus bases. |
| Nuevo `POST /api/inventario/:libroId/revertir` y uso de `ordenId` | Permite descuentos idempotentes y compensar un descuento incierto (ver análisis de fallo parcial). |
| El lock distribuido (Redis) queda en `inventory-service` | Es el único servicio que modifica el stock. |

Detalle de la ratificación: `docs/tp6/ratificacion-arquitectura.md`.

## 🔀 Ejecución local vs. Docker Compose

El código es el mismo; solo cambian las variables de entorno.

| Variable | Local (`.env` de cada servicio) | Docker Compose |
|---|---|---|
| `PORT` | `3001` / `3002` / `3003` | `3000` (publicado `3001`/`3002`/`3003`) |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/db_<nombre>` | `mongodb://<servicio>-db:27017/db_<nombre>` |
| `REDIS_URL` (inventory) | `redis://127.0.0.1:6379` | `redis://redis:6379` |
| `CATALOG_SERVICE_URL` (orders) | `http://localhost:3001` | `http://catalog-service:3000` |
| `INVENTORY_SERVICE_URL` (orders) | `http://localhost:3002` | `http://inventory-service:3000` |

## 🚦 Inicio y disponibilidad de dependencias

* Cada MongoDB tiene healthcheck (`mongosh ping`), Redis (`redis-cli ping`) y cada servicio Node (`fetch /health`).
* `depends_on` con `condition: service_healthy`: los servicios esperan a su base y a Redis, y `orders-service` espera a `catalog-service` e `inventory-service`.
* Además, la aplicación no asume disponibilidad: `orders-service` reintenta la conexión a su base, `inventory-service` se reconecta solo a Redis (responde `503 REDIS_NO_DISPONIBLE` mientras tanto) y `orders-service` responde `503 SERVICIO_NO_DISPONIBLE` si catalog o inventory no responden.

## 🧪 Pruebas

| Prueba | Comando |
|---|---|
| Concurrencia sin sobreventa | `cd services/inventory-service && npm run test:concurrencia` |
| Compras de punta a punta | `cd services/orders-service && npm run test:compra` |

Tabla completa de pruebas con evidencias: [`docs/tp6/pruebas.md`](docs/tp6/pruebas.md).

## ⚠️ Manejo de indisponibilidad

Si un servicio del que depende `orders-service` no responde (conexión rechazada, DNS o timeout), la compra termina con **`503 SERVICIO_NO_DISPONIBLE`**, la orden queda `RECHAZADA` y `orders-service` **no se cae** (su `/health` sigue en `200`). Al restablecer el servicio, las compras vuelven a funcionar sin reiniciar nada.

```bash
docker compose stop inventory-service    # comprar -> 503
docker compose start inventory-service   # comprar -> 201
```

Evidencia: [`docs/tp6/evidencias/evidencia-orders.md`](docs/tp6/evidencias/evidencia-orders.md). Si Redis no está disponible, `inventory-service` responde `503 REDIS_NO_DISPONIBLE` (nunca `500`).

## 🧩 Fallo parcial

Como cada servicio tiene su propia base, no hay transacción distribuida: si `inventory-service` descuenta el stock pero `orders-service` no logra confirmar la orden, puede haber inconsistencia temporal. El diseño mitiga esto con `ordenId` (descuento idempotente), `requestId` (trazabilidad en logs) y la operación `revertir` (compensación; si el resultado del descuento es incierto por timeout, se reintenta automáticamente).

Análisis completo: [`docs/tp6/analisis-fallo-parcial.md`](docs/tp6/analisis-fallo-parcial.md).

---

## 📂 Estructura del Repositorio

* `services/catalog-service/`, `services/inventory-service/`, `services/orders-service/`: microservicios con su `Dockerfile`, `.env.example` y `README.md`.
* `docker-compose.yml`: orquestación de los 3 servicios, 3 MongoDB y Redis.
* `scripts/seed/`: datos de prueba reproducibles.
* `docs/`: arquitectura (TP5) y documentación y evidencias de TP6 (`docs/tp6/`).
* `app-base/`: aplicación monolítica de partida (TP5), conservada como referencia.

### Aplicación base (TP5)
```bash
cd app-base && npm install && cp .env.example .env && npm start
```
Requiere MongoDB en `27017` y Redis/Memurai en `6379`. Swagger en `http://localhost:3000/api-docs`.

---

## 🌿 Flujo de Trabajo con Git

1. `feature/*`: desarrollo de nuevas capacidades.
2. `docs/*`: documentación técnica y evidencias.
3. `main`: rama estable con las entregas validadas.

Cada cambio entra por Pull Request revisado por un compañero. Marcado de entrega:
```bash
git tag tp5-entrega && git push origin tp5-entrega
git tag tp6-entrega && git push origin tp6-entrega
```