# Evidencia de implementación y pruebas — Seguridad en `inventory-service` y Docker Compose (TP7)

**Integrante:** Bautista Navarro (`@BautiNavarro`) — **Issue #27**
**Ramas / PRs:** `feature/inventory-jwt-rbac` (PR #30) · `feature/compose-tp7` (PR #31)
**Entorno:** Windows + PowerShell, Docker Desktop, Docker Compose

---

## 1. Qué se implementó

### 1.1 JWT + RBAC en `inventory-service` (Hito 3)

Se reutilizó el middleware de `catalog-service` (`src/middlewares/authMiddleware.js`), con las mismas variables `JWT_SECRET` y `JWT_ISSUER`:

- `autenticarJWT` valida el token de forma local (stateless, `HS256`, emisor `auth-service-grupo1`) sin consultar a `auth-service` ni a `db_auth`, y deja el usuario en `req.user` (`sub`, `email`, `role`).
- `requerirRol(...)` aplica el control de acceso por rol.

| Endpoint | Acceso | Sin token / token inválido o vencido | Rol no permitido |
|---|---|---|---|
| `GET /api/inventario/:libroId` | Público | — | — |
| `GET /api/inventario/:libroId/lock-status` | Público | — | — |
| `POST /api/inventario` (alta de stock) | Solo `ADMIN` | `401` | `403` |
| `POST /api/inventario/:libroId/reponer` | Solo `ADMIN` | `401` | `403` |
| `POST /api/inventario/:libroId/descontar` | `USER` o `ADMIN` | `401` | `403` |
| `POST /api/inventario/:libroId/revertir` | `USER` o `ADMIN` | `401` | `403` |
| `GET /health`, `GET /api-docs` | Público | — | — |

Códigos de error: `TOKEN_NO_PROPORCIONADO`, `TOKEN_MAL_FORMADO`, `TOKEN_INVALIDO`, `TOKEN_VENCIDO` (401) y `PERMISOS_INSUFICIENTES` (403).

Además:
- **Swagger** (`/api-docs`): esquema `bearerAuth` (botón *Authorize*) y respuestas 401/403 documentadas en las rutas protegidas.
- **`test-concurrencia.js`**: inicia sesión en `auth-service` como ADMIN (alta y reposición) y como USER (descontar), y verifica la seguridad antes de la prueba de concurrencia.

### 1.2 Integración en Docker Compose

- Nuevos servicios **`auth-db`** (MongoDB, volumen `auth_db_data`, no publicado) y **`auth-service`** (`grupo1/auth-service:tp7`, puerto `3004:3000`, healthcheck, depende de `auth-db` healthy).
- Bloque común **`x-jwt-env`** con `JWT_SECRET` y `JWT_ISSUER`, aplicado a los 4 servicios: auth-service firma los tokens y catalog, inventory y orders los validan con el mismo secreto. Ningún secreto está escrito en el código.
- **`.env.example`** de la raíz: `AUTH_HOST_PORT`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS` y el ADMIN inicial, con valores de ejemplo solo para desarrollo.

---

## 2. Sistema completo levantado (9 contenedores)

```powershell
docker compose up --build -d
docker compose ps
```

```text
NAME                IMAGE                            SERVICE             STATUS                  PORTS
auth-db             mongo:7.0                        auth-db             Up 2 minutes (healthy)  27017/tcp
auth-service        grupo1/auth-service:tp7          auth-service        Up 2 minutes (healthy)  0.0.0.0:3004->3000/tcp
catalog-db          mongo:7.0                        catalog-db          Up 2 minutes (healthy)  27017/tcp
catalog-service     grupo1/catalog-service:tp6       catalog-service     Up 2 minutes (healthy)  0.0.0.0:3001->3000/tcp
inventory-db        mongo:7.0                        inventory-db        Up 2 minutes (healthy)  27017/tcp
inventory-service   grupo1/inventory-service:tp6     inventory-service   Up About a minute (healthy)  0.0.0.0:3002->3000/tcp
orders-db           mongo:7.0                        orders-db           Up 2 minutes (healthy)  27017/tcp
orders-service      grupo1/orders-service:tp6        orders-service      Up About a minute (healthy)  0.0.0.0:3003->3000/tcp
redis               redis:7-alpine                   redis               Up 2 minutes (healthy)  6379/tcp
```

Los 9 contenedores están `healthy`. Solo se publican los puertos 3001 a 3004; las bases y Redis quedan accesibles únicamente dentro de la red interna `backend`.

Captura: [compose-ps-tp7-bautista.png](compose-ps-tp7-bautista.png)

---

## 3. Carga de datos con autenticación (`seed.js`)

El seed inicia sesión en `auth-service` como ADMIN y usa ese token para dar de alta y reponer el stock en `inventory-service`, que ahora exige rol `ADMIN` para esas operaciones.

```text
▶ Preparando identidades de prueba (ADMIN y USER)...
  [Auth] 200 Login ADMIN exitoso -> admin@libreria.com (rol: ADMIN)
  [Auth] 201 Usuario USER registrado -> cliente@libreria.com

▶ Procesando obra: "Cien años de soledad" (978-0307474728)
  [Catálogo]  409 Ya registrado -> "Cien años de soledad" (ID recuperado: 6ae64508dd069ac2254127ce)
  [Inventario] 200 Stock repuesto -> "Cien años de soledad" (Cantidad: 1)
  ...
✅ PROCESO FINALIZADO: 5/5 obras catalogadas.   (inventarioSincronizado: true en las 5)
```

> Los `409 Ya registrado` del catálogo se deben a que los libros ya existían de una ejecución anterior (los volúmenes se conservan). El seed recupera su ID y repone el stock con el token de ADMIN.

Captura: [seed-tp7-bautista.png](seed-tp7-bautista.png)

---

## 4. Prueba de seguridad y concurrencia (`npm run test:concurrencia`)

Ejecutada contra los servicios levantados con Docker Compose.

```text
🧪 PRUEBA DE SEGURIDAD Y CONCURRENCIA — inventory-service (JWT + Redis Lock)
   Servicio: http://localhost:3002
   /health -> 200 {"service":"inventory-service","status":"ok","dependencias":{"mongodb":"up","redis":"up"}}
   Login ADMIN en auth-service -> 200 (admin@libreria.com)
   Login USER en auth-service -> 200 (cliente@libreria.com)
   Libro de prueba: 80adca2ab96cb296f9b6adbd

🔐 PRUEBA 0: seguridad JWT / RBAC
   ✅ descontar sin token -> 401 TOKEN_NO_PROPORCIONADO (esperado 401)
   ✅ descontar con token inválido -> 401 TOKEN_INVALIDO (esperado 401)
   ✅ USER intenta reponer -> 403 PERMISOS_INSUFICIENTES (esperado 403)
   ✅ GET público sin token -> 200 (esperado 200)

🟢 PRUEBA 1: dos clientes compran el ÚLTIMO ejemplar al mismo tiempo
   Cliente 1: HTTP 200
   Cliente 2: HTTP 400 STOCK_INSUFICIENTE
   Stock inicial: 1 · stock final: 0
   ✅ SIN SOBREVENTA: el stock cuadra con las compras aceptadas.

🟢 PRUEBA 2: 20 compras simultáneas con 5 unidades
   Compras lanzadas a la vez: 20 · duración total: 453 ms
   200 aceptadas: 5 · 400 sin stock: 14 · 409 lock ocupado: 1
   Stock inicial: 5 · stock final: 0
   ✅ SIN SOBREVENTA: el stock cuadra con las compras aceptadas.
   lock-status al terminar: bloqueado=false (el lock se liberó)

✅ RESULTADO: seguridad correcta y sin sobreventa en ninguna prueba.
```

Capturas: [test-seguridad-inventory-1.png](test-seguridad-inventory-1.png) · [test-seguridad-inventory-2.png](test-seguridad-inventory-2.png)

---

## 5. Resultado

| Verificación | Esperado | Obtenido |
|---|---|---|
| auth-service y auth-db integrados en Compose | 9 contenedores `healthy`, puerto 3004 publicado | ✅ |
| Mismo `JWT_SECRET` en los 4 servicios | Los tokens de auth-service se aceptan en inventory | ✅ Login ADMIN/USER y operaciones con token |
| Operación protegida sin token | `401 TOKEN_NO_PROPORCIONADO` | ✅ |
| Token con firma inválida | `401 TOKEN_INVALIDO` | ✅ |
| `USER` intenta reponer stock (solo ADMIN) | `403 PERMISOS_INSUFICIENTES` | ✅ |
| Consulta pública sin token | `200` | ✅ |
| `ADMIN` da de alta y repone stock (seed y test) | `201` / `200` | ✅ |
| `USER` descuenta stock con token | `200`, sin sobreventa | ✅ 5 aceptadas sobre 5 unidades |

**Conclusión:** inventory-service valida el JWT emitido por auth-service sin depender de él en cada pedido. Aplica la matriz de roles del TP7 (escritura administrativa solo para `ADMIN`, descuentos para usuarios autenticados, consultas públicas) y mantiene la exclusión mutua con Redis: no hay sobreventa aunque las compras lleguen autenticadas y en simultáneo.

> **Nota de integración:** como `/descontar` y `/revertir` ahora requieren token, orders-service debe propagar el `Authorization: Bearer <JWT>` del cliente al llamar a inventario (issue #28).
