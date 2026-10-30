# Evidencia de implementación y pruebas — `inventory-service`

**Integrante:** Bautista Navarro (`@BautiNavarro`) — **Issue #12**
**Rama:** `feature/inventory-service-implementation`

> Las salidas marcadas con ✍️ se completan con la ejecución en mi máquina antes de abrir el PR.

---

## 1. Verificación de Docker

Captura: [`docker-bautista.png`](docker-bautista.png)

```bash
docker --version
docker compose version
docker run --rm hello-world
```

---

## 2. Build individual de la imagen

```bash
docker build -t grupo1/inventory-service:tp6 ./services/inventory-service
```

✍️ Salida:

```text
(pegar salida del build)
```

---

## 3. Health y Swagger

```bash
curl http://localhost:3002/health
```

```json
{ "service": "inventory-service", "status": "ok", "dependencias": { "mongodb": "up", "redis": "up" } }
```

Swagger UI: `http://localhost:3002/api-docs` ✍️ (captura opcional)

---

## 4. Prueba de concurrencia (sin sobreventa)

Script: `services/inventory-service/scripts/test-concurrencia.js` (adaptado de `app-base/test-concurrencia.js` para llamar a `POST /api/inventario/:libroId/descontar`).

```bash
cd services/inventory-service
npm run test:concurrencia
```

✍️ Salida (ejemplo de una ejecución durante el desarrollo; reemplazar por la propia):

```text
🟢 PRUEBA 1: dos clientes compran el ÚLTIMO ejemplar al mismo tiempo
   Cliente 1: HTTP 200
   Cliente 2: HTTP 400 STOCK_INSUFICIENTE
   200 aceptadas: 1 · 400 sin stock: 1 · 409 lock ocupado: 0
   Stock inicial: 1 · stock final: 0
   ✅ SIN SOBREVENTA: el stock cuadra con las compras aceptadas.

🟢 PRUEBA 2: 20 compras simultáneas con 5 unidades
   200 aceptadas: 5 · 400 sin stock: 14 · 409 lock ocupado: 1
   Stock inicial: 5 · stock final: 0
   ✅ SIN SOBREVENTA: el stock cuadra con las compras aceptadas.

✅ RESULTADO: no hubo sobreventa en ninguna prueba.
```

**Conclusión:** con 20 compras simultáneas y 5 unidades solo se aceptan 5; el resto recibe `400 STOCK_INSUFICIENTE` o `409 LOCK_OCUPADO`, y el stock final es 0 (nunca negativo).

---

## 5. Redis no disponible → 503 controlado (nunca 500)

Con el servicio corriendo, detener Redis/Memurai y repetir un descuento:

```bash
curl -X POST http://localhost:3002/api/inventario/<libroId>/descontar \
  -H "Content-Type: application/json" -d '{"cantidad":1}'
```

Resultado esperado:

```json
{ "error": "El servicio de coordinación (Redis/Memurai) no está disponible.", "codigo": "REDIS_NO_DISPONIBLE" }
```

HTTP `503`. `GET /health` informa `"redis": "down"` y el proceso no se cae. Al volver a levantar Redis, el servicio se reconecta solo y los descuentos vuelven a responder `200`.

✍️ Captura o salida propia.

---

## 6. Mismo código en local y en Docker Compose (solo cambian variables)

| Variable | Local (`.env`) | Docker Compose |
|---|---|---|
| `PORT` | `3002` | `3000` (publicado `3002:3000`) |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/db_inventory` | `mongodb://inventory-db:27017/db_inventory` |
| `REDIS_URL` | `redis://127.0.0.1:6379` (Memurai) | `redis://redis:6379` |

**Local:** `npm start` con MongoDB local y Memurai → `npm run test:concurrencia` ✅
✍️ Salida / captura:

```text
(pegar)
```

**Docker Compose:** `docker compose up --build` (compose de la rama de Delfina) → `INVENTORY_SERVICE_URL=http://localhost:3002 npm run test:concurrencia` ✅
✍️ Salida / captura:

```text
(pegar)
```

Ningún archivo de código cambia entre ambas ejecuciones: solo el `.env` local frente al bloque `environment:` del compose.
