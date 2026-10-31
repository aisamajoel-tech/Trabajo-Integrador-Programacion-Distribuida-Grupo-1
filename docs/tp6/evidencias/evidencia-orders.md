# Evidencia de implementación y pruebas — `orders-service`

**Issue #13** · **Rama:** `feature/orders-service-implementation`
**Ejecutado por:** Bautista Navarro (`@BautiNavarro`) · **Entorno:** Windows + PowerShell, Docker Desktop, Docker Compose

---

## 1. Build individual de la imagen

```powershell
PS C:\GitHub\Trabajo-Integrador-Programacion-Distribuida-Grupo-1> docker build -t grupo1/orders-service:tp6 ./services/orders-service
[+] Building 15.9s (10/10) FINISHED
 => [1/5] FROM docker.io/library/node:20-alpine
 => CACHED [2/5] WORKDIR /app
 => [3/5] COPY package*.json ./
 => [4/5] RUN npm ci --omit=dev
 => [5/5] COPY . .
 => exporting to image
 => => naming to docker.io/grupo1/orders-service:tp6
```

Captura: [docker-build-orders.png](docker-build-orders.png)

---

## 2. Sistema completo con Docker Compose

```powershell
docker compose up --build -d
docker compose ps
```

Los 7 contenedores quedaron `Up (healthy)`: `catalog-service` (3001), `inventory-service` (3002), `orders-service` (3003), `catalog-db`, `inventory-db`, `orders-db` y `redis`. Solo se publican los puertos 3001, 3002 y 3003.

> Nota: en la primera ejecución `catalog-service` no pudo publicar el puerto 3001 porque estaba ocupado por un contenedor de otro proyecto local. Se detuvo ese contenedor y se recreó el servicio con `docker compose up -d --force-recreate catalog-service`.

---

## 3. Prueba de punta a punta (`npm run test:compra`)

Ejecutada contra los servicios levantados con Docker Compose.

```text
🧪 PRUEBA DE COMPRAS — orders-service
   orders: http://localhost:3003 · catalog: http://localhost:3001 · inventory: http://localhost:3002
   orders/health -> 200 {"service":"orders-service","status":"ok","dependencias":{"mongodb":"up"}}
   catalog/health -> 200 {"service":"catalog-service","status":"ok"}
   inventory/health -> 200 {"service":"inventory-service","status":"ok","dependencias":{"mongodb":"up","redis":"up"}}

🟢 PRUEBA 1: compra simple
   POST /api/ordenes -> 201 CONFIRMADA (ordenId 6ae6453b489fc80f80a73640)
   ✅ Orden CONFIRMADA con 201
   ✅ GET /api/ordenes/:id devuelve la orden con libroSnapshot

🟠 PRUEBA 2: rechazos
   Libro inexistente -> 404 LIBRO_INEXISTENTE
   ✅ 404 LIBRO_INEXISTENTE
   Pedir 50 unidades -> 409 SIN_STOCK
   ✅ 409 SIN_STOCK
   ✅ Body inválido -> 400 (no se crea orden)

🟢 PRUEBA 3: 15 compras simultáneas con 4 unidades
   Duración: 318 ms · resultados: {"CONFIRMADA":4,"SIN_STOCK":11}
   Stock inicial: 4 · órdenes CONFIRMADAS: 4 · stock final: 0
   ✅ Nunca se confirman más órdenes que unidades
   ✅ El stock final cuadra con las órdenes confirmadas
   ✅ Cada intento quedó registrado como orden (historial por cliente)

✅ RESULTADO: todas las verificaciones pasaron.
```

Captura: [test-compra-orders.png](test-compra-orders.png)

---

## 4. Prueba de indisponibilidad (consigna, sección 15.1)

Comandos ejecutados en PowerShell con todo levantado en Docker Compose. `Comprar` es una función auxiliar que hace `POST /api/ordenes` con `{ clienteId: "cli-demo", libroId, cantidad: 1 }` y muestra el status HTTP y el body.

### 4.1 Compra con todo arriba → 201

```text
PS> Comprar
HTTP 201 {"ordenId":"6ae646d9489fc80f80a73696","estado":"CONFIRMADA","clienteId":"cli-demo",
"libro":{"id":"6ae6453bdd069ac2254127d8","titulo":"Libro de prueba de órdenes","autor":"Grupo 1","isbn":"9783475899216"},"cantidad":1,...}
```

### 4.2 Se detiene inventory-service y se vuelve a comprar → 503

```text
PS> docker compose stop inventory-service
 ✔ Container inventory-service  Stopped

PS> Comprar
HTTP 503 {"error":"No se pudo completar la compra porque un servicio necesario no está disponible. Intentá más tarde.",
"codigo":"SERVICIO_NO_DISPONIBLE","ordenId":"6ae64873489fc80f80a736a8","estado":"RECHAZADA","motivoRechazo":"SERVICIO_NO_DISPONIBLE",...}
```

### 4.3 orders-service sigue vivo

```text
PS> Invoke-RestMethod http://localhost:3003/health
service        status dependencias
-------        ------ ------------
orders-service ok     @{mongodb=up}
```

Logs de orders-service (`docker compose logs orders-service --tail 15`). La misma operación se sigue por su `requestId`:

```text
info:  Orden registrada como PENDIENTE | {"ordenId":"6ae64873489fc80f80a736a8","clienteId":"cli-demo","requestId":"f1f209bf-..."}
error: inventory-service no disponible (SIN_CONEXION) | {"origen":"orders-service","dependencia":"inventory-service",
       "causa":"ENOTFOUND","url":"http://inventory-service:3000/api/inventario/6ae6453bdd069ac2254127d8/descontar","requestId":"f1f209bf-..."}
warn:  Orden RECHAZADA (SERVICIO_NO_DISPONIBLE) | {"ordenId":"6ae64873489fc80f80a736a8","requestId":"f1f209bf-..."}
error: POST /api/ordenes -> Status: 503 (2687ms)
info:  GET /health -> Status: 200
```

Capturas: [indisponibilidad-orders-1.png](indisponibilidad-orders-1.png) · [indisponibilidad-orders-2.png](indisponibilidad-orders-2.png)

### 4.4 Se levanta inventory-service y la compra vuelve a funcionar → 201

```text
PS> docker compose start inventory-service
 ✔ Container redis         Healthy
 ✔ Container inventory-db  Healthy

PS> Comprar
HTTP 201 {"ordenId":"6ae64957489fc80f80a736b8","estado":"CONFIRMADA","clienteId":"cli-demo",...}
```

Captura: [indisponibilidad-orders-3.png](indisponibilidad-orders-3.png)

### 4.5 Resultado

| Paso | Esperado | Obtenido |
|---|---|---|
| Compra con todo arriba | `201 CONFIRMADA` | ✅ `201 CONFIRMADA` |
| Compra con inventory-service detenido | `503 SERVICIO_NO_DISPONIBLE`, stock sin modificar | ✅ `503`, orden `RECHAZADA / SERVICIO_NO_DISPONIBLE` |
| `/health` de orders con inventario caído | `200`, orders no se cae | ✅ `200 ok` |
| Log de orders | dependencia, causa y requestId del fallo | ✅ `inventory-service no disponible (SIN_CONEXION)`, causa `ENOTFOUND` |
| Compra con inventory-service levantado otra vez | `201` | ✅ `201 CONFIRMADA` |

**Conclusión:** la caída de inventory-service no tumba a orders-service. La compra falla de forma controlada con `503`, queda registrada como `RECHAZADA` con su motivo, y cuando inventario vuelve el sistema se recupera solo, sin reiniciar orders ni modificar código.
