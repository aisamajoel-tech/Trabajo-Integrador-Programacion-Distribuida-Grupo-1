# Evidencia de implementación y pruebas — `orders-service`

**Issue #13** · **Rama:** `feature/orders-service-implementation`

> Las secciones marcadas con ✍️ se completan con las ejecuciones propias antes de pedir el merge.

---

## 1. Build individual de la imagen

```bash
docker build -t grupo1/orders-service:tp6 ./services/orders-service
```

✍️ Salida / captura: `docker-build-orders.png`

---

## 2. Health y Swagger

```bash
curl http://localhost:3003/health
```

```json
{ "service": "orders-service", "status": "ok", "dependencias": { "mongodb": "up" } }
```

Swagger UI: `http://localhost:3003/api-docs`

---

## 3. Prueba de punta a punta

```bash
cd services/orders-service
npm run test:compra
```

✍️ Salida / captura: `test-compra-orders.png`

Resultado esperado: compra simple `201 CONFIRMADA`; libro inexistente `404`; sin stock `409`; body inválido `400`; y en las compras simultáneas nunca se confirman más órdenes que unidades, con el stock final cuadrando.

---

## 4. Prueba de indisponibilidad (consigna, sección 15.1)

Con todo levantado en Docker Compose:

```bash
# 1. Levantar todo y cargar datos de prueba
docker compose up --build -d
node scripts/seed/seed.js

# 2. Compra OK -> 201
curl -X POST http://localhost:3003/api/ordenes -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-1","libroId":"<libroId>","cantidad":1}'

# 3. Bajar inventario y volver a comprar -> 503, orders-service sigue vivo
docker compose stop inventory-service
curl -X POST http://localhost:3003/api/ordenes -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-1","libroId":"<libroId>","cantidad":1}'
curl http://localhost:3003/health
docker compose logs orders-service --tail 20

# 4. Levantar inventario y comprar otra vez -> 201
docker compose start inventory-service
curl -X POST http://localhost:3003/api/ordenes -H "Content-Type: application/json" \
  -d '{"clienteId":"cli-1","libroId":"<libroId>","cantidad":1}'
```

Resultado esperado:

| Paso | Resultado |
|---|---|
| Compra con todo arriba | `201` · orden `CONFIRMADA` |
| Compra con inventory-service detenido | `503` · orden `RECHAZADA / SERVICIO_NO_DISPONIBLE` · el stock no se modifica |
| `GET /health` de orders con inventario caído | `200` · orders **no** se cae |
| Log de orders | `inventory-service no disponible (SIN_CONEXION)` con `dependencia`, `causa` y `requestId` |
| Compra después de `docker compose start inventory-service` | `201` · la compra vuelve a funcionar |

✍️ Capturas de cada paso: `indisponibilidad-orders-1.png`, `indisponibilidad-orders-2.png`, …
