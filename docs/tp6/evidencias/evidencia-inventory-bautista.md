# Evidencia de implementación y pruebas — `inventory-service`

**Integrante:** Bautista Navarro (`@BautiNavarro`) — **Issue \#12** **Rama:** `feature/inventory-service-implementation` · **PR:** \#18 **Entorno:** Windows \+ PowerShell, Docker Desktop

---

## 1\. Verificación de Docker

PS\> docker \--version

Docker version 29.5.3, build d1c06ef

PS\> docker compose version

Docker Compose version v5.1.4

PS\> docker run \--rm hello-world

Hello from Docker\!

This message shows that your installation appears to be working correctly.

Captura: [`docker-bautista.png`](http://docker-bautista.png)

---

## 2\. Build individual de la imagen

PS C:\\GitHub\\Trabajo-Integrador-Programacion-Distribuida-Grupo-1\> docker build \-t grupo1/inventory-service:tp6 ./services/inventory-service

\[+\] Building 12.9s (10/10) FINISHED

 \=\> \[internal\] load build definition from Dockerfile

 \=\> \[internal\] load metadata for docker.io/library/node:20-alpine

 \=\> \[internal\] load .dockerignore

 \=\> \[1/5\] FROM docker.io/library/node:20-alpine

 \=\> \[internal\] load build context

 \=\> CACHED \[2/5\] WORKDIR /app

 \=\> \[3/5\] COPY package\*.json ./

 \=\> \[4/5\] RUN npm ci \--omit=dev

 \=\> \[5/5\] COPY . .

 \=\> exporting to image

 \=\> \=\> naming to docker.io/grupo1/inventory-service:tp6

Captura: [`docker-build-inventory-bautista.png`](http://docker-build-inventory-bautista.png)

---

## 3\. Ejecución local y health

MongoDB y Redis levantados como contenedores, y el servicio corriendo en local con `npm start` y su `.env`:

docker run \-d \--name inv-mongo \-p 27017:27017 mongo:7

docker run \-d \--name inv-redis \-p 6379:6379 redis:7-alpine

cd services\\inventory-service

copy .env.example .env

npm install

npm start

GET http\://localhost:3002/health

{"service":"inventory-service","status":"ok","dependencias":{"mongodb":"up","redis":"up"}}

Swagger UI disponible en `http://localhost:3002/api-docs`.

---

## 4\. Prueba de concurrencia (sin sobreventa)

Script: `services/inventory-service/scripts/test-concurrencia.js`, adaptado de `app-base/test-concurrencia.js` para llamar a `POST /api/inventario/:libroId/descontar`.

PS ...\\services\\inventory-service\> npm run test:concurrencia

🧪 PRUEBA DE CONCURRENCIA — inventory-service (Redis Distributed Lock)

   Servicio: http\://localhost:3002

   /health \-\> 200 {"service":"inventory-service","status":"ok","dependencias":{"mongodb":"up","redis":"up"}}

   Libro de prueba: 8e8d56f6f8e13f8361ddf265

🟢 PRUEBA 1: dos clientes compran el ÚLTIMO ejemplar al mismo tiempo

   Cliente 1: HTTP 200

   Cliente 2: HTTP 400 STOCK\_INSUFICIENTE

   Compras lanzadas a la vez: 2 · duración total: 81 ms

   200 aceptadas: 1 · 400 sin stock: 1 · 409 lock ocupado: 0

   Stock inicial: 1 · stock final: 0

   ✅ SIN SOBREVENTA: el stock cuadra con las compras aceptadas.

🟢 PRUEBA 2: 20 compras simultáneas con 5 unidades

   Compras lanzadas a la vez: 20 · duración total: 396 ms

   200 aceptadas: 5 · 400 sin stock: 6 · 409 lock ocupado: 9

   Stock inicial: 5 · stock final: 0

   ✅ SIN SOBREVENTA: el stock cuadra con las compras aceptadas.

   lock-status al terminar: bloqueado=false (el lock se liberó)

✅ RESULTADO: no hubo sobreventa en ninguna prueba.

Captura: [`test-concurrencia-bautista.png`](http://test-concurrencia-bautista.png)

**Conclusión:** con 20 compras simultáneas y 5 unidades solo se aceptaron 5\. El resto recibió `400 STOCK_INSUFICIENTE` (el lock lo dejó pasar, pero ya no quedaba stock) o `409 LOCK_OCUPADO` (no consiguió el lock tras los reintentos). El stock final fue 0, nunca negativo, y el lock quedó liberado.

---

## 5\. Redis no disponible → 503 controlado (nunca 500\)

Comportamiento implementado (ver `services/inventory-service/README.md`):

- Si Redis/Memurai no responde, las operaciones que modifican stock (`descontar`, `reponer`, `revertir`) y `lock-status` responden **503** `{ "error": "...", "codigo": "REDIS_NO_DISPONIBLE" }` en lugar de 500\.  
- `GET /health` informa `"redis": "down"` y el proceso no se cae.  
- `GET /api/inventario/:libroId` sigue respondiendo, porque la consulta no necesita Redis.  
- Cuando Redis vuelve, el cliente se reconecta solo.

La verificación con contenedores se realizará junto con la prueba de indisponibilidad en Docker Compose.

---

## 6\. Mismo código en local y en Docker Compose (solo cambian variables)

| Variable | Local (`.env`) | Docker Compose |
| :---- | :---- | :---- |
| `PORT` | `3002` | `3000` (publicado `3002:3000`) |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/db_inventory` | `mongodb://inventory-db:27017/db_inventory` |
| `REDIS_URL` | `redis://127.0.0.1:6379` | `redis://redis:6379` |

**Local:** ✅ verificado (secciones 3 y 4).

**Docker Compose:** pendiente hasta que se integre el `docker-compose.yml` (issue de integración). Se correrá `docker compose up --build` y luego `INVENTORY_SERVICE_URL=http://localhost:3002 npm run test:concurrencia`, sin modificar ningún archivo de código.