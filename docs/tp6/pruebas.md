# Pruebas de integración — TP6 (consigna, sección 18)

Todas las pruebas se ejecutaron con el sistema levantado con Docker Compose:

```powershell
docker compose up --build -d
docker compose ps
node scripts/seed/seed.js
```

> Entorno: Windows + PowerShell + Docker Desktop. Las capturas están en [`docs/tp6/evidencias/`](evidencias/).

## Tabla consolidada

| # | Prueba | Comando | Resultado esperado | Responsable | Evidencia |
|---|---|---|---|---|---|
| 1 | Docker instalado | `docker --version` · `docker compose version` · `docker run hello-world` | Versiones visibles y `hello-world` corre | Todos | [Joel](evidencias/evidencia-catalog-joel.md) · [Bautista](evidencias/evidencia-inventory-bautista.md) · [Carolina](evidencias/docker-carolina.png) · [Delfina](evidencias/docker-delfina1.png) |
| 2 | Build de cada imagen | `docker build -t grupo1/<servicio>:tp6 ./services/<servicio>` | `FINISHED`, imagen creada | Joel / Bautista / Candela | [catalog](evidencias/evidencia-catalog-joel.md) · [inventory](evidencias/evidencia-inventory-bautista.md) · [orders](evidencias/evidencia-orders.md) |
| 3 | Arranque con Compose y healthchecks | `docker compose up --build -d` · `docker compose ps` | 7 contenedores `Up (healthy)`; solo 3001, 3002 y 3003 publicados | Delfina | [docker-delfina1](evidencias/docker-delfina1.png) · [docker-delfina2](evidencias/docker-delfina2.png) · [docker-delfina3](evidencias/docker-delfina3.png) |
| 4 | Health de cada servicio | `curl.exe http://localhost:300X/health` | `200 {"service":"...","status":"ok"}` | Joel / Bautista / Candela | Ver evidencias de la fila 2 |
| 5 | Datos de prueba reproducibles | `node scripts/seed/seed.js` | 5 libros y su stock creados vía API; repetirlo no duplica | Joel | [evidencia-catalog-joel](evidencias/evidencia-catalog-joel.md) |
| 6 | **CRUD / negocio** | Ver sección 1 | Alta, listado, consulta, edición y stock funcionan tras la migración | Carolina | [crud-carolina.png](evidencias/crud-carolina.png) |
| 7 | **Comunicación entre servicios** | Ver sección 2 | `201 CONFIRMADA`; el mismo `requestId` aparece en los logs de orders, catalog e inventory | Carolina | [comunicacion-carolina.png](evidencias/comunicacion-carolina.png) · [test-compra-orders.png](evidencias/test-compra-orders.png) |
| 8 | **Propiedad de datos** | Ver sección 3 | Cada servicio ve solo su base (`db_catalog`, `db_inventory`, `db_orders`) | Carolina | [propiedad-datos-carolina.png](evidencias/propiedad-datos-carolina.png) |
| 9 | Concurrencia sin sobreventa | `cd services/inventory-service && npm run test:concurrencia` | Nunca se descuenta más stock del disponible | Bautista | [evidencia-inventory-bautista](evidencias/evidencia-inventory-bautista.md) · [captura](evidencias/test-concurrencia-bautista.png) |
| 10 | Compras simultáneas vía orders | `cd services/orders-service && npm run test:compra` | Órdenes `CONFIRMADAS` = unidades de stock; stock final coherente | Candela / Bautista | [evidencia-orders](evidencias/evidencia-orders.md) · [captura](evidencias/test-compra-orders.png) |
| 11 | Indisponibilidad de un servicio | `docker compose stop inventory-service` → comprar → `docker compose start inventory-service` | Compra `503`, orders sigue vivo (`/health` 200); al volver, compra `201` | Candela | [evidencia-orders (sec. 4)](evidencias/evidencia-orders.md) · [1](evidencias/indisponibilidad-orders-1.png) · [2](evidencias/indisponibilidad-orders-2.png) · [3](evidencias/indisponibilidad-orders-3.png) |
| 12 | Configuración por entorno (local vs Docker) | Mismo código con `.env` local y con Compose | Solo cambian variables de entorno | Bautista | [evidencia-inventory-bautista (sec. 6)](evidencias/evidencia-inventory-bautista.md) |
| 13 | Persistencia de datos | crear dato → `docker compose down` → `docker compose up -d` → consultar | El dato sigue; con `down -v` se pierde | Delfina | [evidencias de Delfina](evidencias/) |
| 14 | Logs | `docker compose logs <servicio>` | Muestran servicio, nivel, endpoint y errores | Delfina | [evidencias de Delfina](evidencias/) |
| 15 | Fallo parcial (análisis) | — (documental) | Análisis del caso de compra | Carolina | [analisis-fallo-parcial.md](analisis-fallo-parcial.md) |

> Revisar que esta tabla cubra todas las pruebas obligatorias de la sección 18 de la consigna y agregar las filas que falten.

---

## 1. CRUD / negocio

Operaciones principales sobre `catalog-service` e `inventory-service` tras la migración, ejecutadas contra Docker Compose (con los datos del seed ya cargados):

```powershell
$h = @{ "Content-Type" = "application/json; charset=utf-8" }
$json = '{"titulo":"Libro Prueba Caro","autor":"Carolina Fetta","año":2024,"genero":"Novela","isbn":"978-3-16-148410-0"}'
$libro = Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/libros -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($json))
Invoke-RestMethod http://localhost:3001/api/libros
Invoke-RestMethod http://localhost:3001/api/libros/$($libro.id)
$upd = '{"titulo":"Libro Prueba Caro (editado)","autor":"Carolina Fetta","año":2024,"genero":"Novela","isbn":"978-3-16-148410-0"}'
Invoke-RestMethod -Method Put -Uri http://localhost:3001/api/libros/$($libro.id) -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($upd))
Invoke-RestMethod -Method Post -Uri http://localhost:3002/api/inventario -Headers $h -Body (@{ libroId = $libro.id; stockDisponible = 3 } | ConvertTo-Json)
Invoke-RestMethod http://localhost:3002/api/inventario/$($libro.id)
```

| Operación | Esperado | Obtenido |
|---|---|---|
| `POST /api/libros` | Libro creado con `id` | ✅ Creado `6ae7cb4b4742ffe3739f76dd` ("Libro Prueba Caro") |
| `GET /api/libros` | Lista con los 5 libros del seed + el nuevo | ✅ Devolvió los 6 libros |
| `GET /api/libros/:id` | El libro pedido | ✅ Devolvió el libro creado |
| `PUT /api/libros/:id` | Libro actualizado | ✅ Título cambió a "Libro Prueba Caro (editado)" y `updatedAt` se actualizó |
| `POST /api/inventario` | Stock creado para el `libroId` | ✅ `stockDisponible: 3` (`verificacionCatalogo: OMITIDA`) |
| `GET /api/inventario/:libroId` | Stock del libro | ✅ `stockDisponible: 3` |

Las operaciones principales siguen funcionando tras separar el monolito en servicios. Captura: [crud-carolina.png](evidencias/crud-carolina.png)

## 2. Comunicación entre servicios

`orders-service` consulta a `catalog-service` (existencia del libro) y a `inventory-service` (descuento de stock) por HTTP usando el DNS interno de Compose (`http://catalog-service:3000`, `http://inventory-service:3000`). Se envía un `x-request-id` propio (`prueba-caro-001`) para seguir la operación en los logs.

```powershell
$h = @{ "Content-Type" = "application/json; charset=utf-8"; "x-request-id" = "prueba-caro-001" }
$libroId = "6ae7cb4b4742ffe3739f76dd"
Invoke-RestMethod http://localhost:3002/api/inventario/$libroId
$compra = '{"clienteId":"cli-caro","libroId":"' + $libroId + '","cantidad":1}'
$orden = Invoke-RestMethod -Method Post -Uri http://localhost:3003/api/ordenes -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($compra))
$orden
Invoke-RestMethod http://localhost:3002/api/inventario/$libroId
Invoke-RestMethod http://localhost:3003/api/ordenes/$($orden.ordenId)
docker compose logs --tail 300 | Select-String "prueba-caro-001"
```

| Verificación | Esperado | Obtenido |
|---|---|---|
| Stock antes de la compra | `3` | ✅ `3` |
| `POST /api/ordenes` | `201`, estado `CONFIRMADA` | ✅ `CONFIRMADA` (`ordenId` `6ae7d1737ce23c8e76091448`) |
| Stock después de la compra | `2` (inventory fue invocado por orders) | ✅ `2` |
| `GET /api/ordenes/:id` | Orden con `libroSnapshot`, `requestId` y `compensacion: NO_REQUERIDA` | ✅ Coincide |
| Logs filtrados por `prueba-caro-001` | La misma operación aparece en los 3 servicios | ✅ Ver detalle abajo |

Recorrido de la operación (`requestId: prueba-caro-001`) según los logs:

1. `orders-service`: *Orden registrada como PENDIENTE*.
2. `catalog-service`: *Libro consultado* → `GET /api/libros/:id` `200`.
3. `inventory-service`: *Lock adquirido* → *Descuento aplicado. Stock restante: 2* → *Lock liberado* → `POST /api/inventario/:libroId/descontar` `200`.
4. `orders-service`: *Orden CONFIRMADA* → `POST /api/ordenes` `201`.

Captura: [comunicacion-carolina.png](evidencias/comunicacion-carolina-1.png)

> Nota: la primera compra intentada falló con `400 VALIDACION_FALLIDA` porque se envió sin el header `Content-Type: application/json`. Es el comportamiento esperado de la validación de orders (rechaza el body vacío sin crear la orden) y se corrigió enviando el header.

## 3. Propiedad de datos

Cada servicio tiene su propio contenedor MongoDB y su propia base. Ningún servicio accede a la base de otro.

```powershell
docker compose exec catalog-db   mongosh --quiet --eval "db.adminCommand({listDatabases:1}).databases.map(d=>d.name)"
docker compose exec inventory-db mongosh --quiet --eval "db.adminCommand({listDatabases:1}).databases.map(d=>d.name)"
docker compose exec orders-db    mongosh --quiet --eval "db.adminCommand({listDatabases:1}).databases.map(d=>d.name)"
docker compose exec catalog-db   mongosh --quiet db_catalog   --eval "db.getCollectionNames()"
docker compose exec inventory-db mongosh --quiet db_inventory --eval "db.getCollectionNames()"
docker compose exec orders-db    mongosh --quiet db_orders    --eval "db.getCollectionNames()"
docker compose ps
```

| Contenedor | Bases de datos (listDatabases) | Base del servicio | Colecciones | Escribe |
|---|---|---|---|---|
| `catalog-db` | `admin`, `config`, `db_catalog`, `local` | `db_catalog` | `libros` | solo `catalog-service` |
| `inventory-db` | `admin`, `config`, `db_inventory`, `local` | `db_inventory` | `stock`, `movimientos` | solo `inventory-service` |
| `orders-db` | `admin`, `config`, `db_orders`, `local` | `db_orders` | `ordenes` | solo `orders-service` |

Cada contenedor Mongo contiene **únicamente** la base de su servicio (`admin`, `config` y `local` son bases internas de MongoDB). Ninguna base contiene datos de otro servicio.

Las referencias entre servicios son **lógicas** (`libroId`, `ordenId`), no accesos directos a la base ajena. En `docker compose ps` solo se publican los puertos `3001`, `3002` y `3003`; las bases muestran únicamente `27017/tcp` interno.

Captura: [propiedad-datos-carolina.png](evidencias/propiedad-datos-carolina.png)