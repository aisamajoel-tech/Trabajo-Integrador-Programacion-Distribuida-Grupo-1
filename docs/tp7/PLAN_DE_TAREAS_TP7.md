# 📋 Plan de División de Tareas — Trabajo Práctico N° 7
**Autenticación, Autorización y Seguridad con JWT**
**Universidad Champagnat — Programación Distribuida — Grupo N° 1**

---

## 🎯 Resumen de Organización (3 Issues Totales)

Para el **TP7**, todo el alcance obligatorio de la consigna (Hitos 1, 2 y 3, integración con Docker Compose, OpenAPI/Swagger, propagación de JWT, propiedad del recurso y los 12 escenarios de prueba A–L) se divide exactamente en **3 Issues** asignadas a:

| Issue | Integrante Asignado | Ramas de Trabajo | Responsabilidad Principal |
| :--- | :--- | :--- | :--- |
| **Issue #26** | **Joel Aisama** (`@aisamajoel-tech`) | `feature/auth-service`<br>`feature/catalog-rbac-seed` | **Hito 1 y Hito 2:** Documento `docs/tp7/modelo-seguridad.md`, implementación completa de **`services/auth-service/`** (`bcrypt` + emisión de JWT + `/register` + `/login` + `/health` + Swagger + `Dockerfile`), protección JWT/RBAC en **`catalog-service`** (`POST/PUT/DELETE` solo `ADMIN`) y actualización de **`scripts/seed/seed.js`** con usuarios iniciales (`ADMIN` y `USER`). |
| **Issue #27** | **Bautista Navarro** (`@BautiNavarro`) | `feature/inventory-jwt-rbac`<br>`feature/compose-tp7` | **Hito 3 en Inventario y Docker Compose:** Middleware JWT + RBAC en **`services/inventory-service/`** (`POST /api/inventario` y `/reponer` solo `ADMIN`; `/descontar` y `/revertir` autenticados con `USER`/`ADMIN`; `GET` públicos), actualización de Swagger y `test-concurrencia.js`, e integración de `auth-service` y `auth-db` en **`docker-compose.yml`** y `.env.example`. |
| **Issue #28** | **Candela Aguilar** (`@candeaguilar`) | `feature/orders-jwt-propagation`<br>`docs/tp7-pruebas-readme` | **Hito 3 en Órdenes, Propagación y Pruebas A–L:** Middleware JWT + **propiedad del recurso** (Sección 11.2: un `USER` solo puede crear/consultar sus propias órdenes; `ADMIN` puede consultar todas) y **propagación de `Authorization: Bearer <JWT>`** hacia `inventory-service` (Sección 13) en **`services/orders-service/`**; script y documentación de los **12 escenarios obligatorios A–L** (`docs/tp7/pruebas-seguridad.md`) y actualización del **`README.md`** principal. |

---

## 🔐 Acuerdos Técnicos Comunes (Contratos de Seguridad TP7)

Para que las 3 Issues encajen sin conflictos, los 4 microservicios comparten las siguientes convenciones:

1. **Variables de Entorno de Seguridad (sin secretos hardcodeados en código):**
   * `JWT_SECRET`: clave simétrica compartida por variable de entorno (valor de ejemplo en `.env.example` y `docker-compose.yml`: `dev_jwt_secret_grupo1_cambiar_en_prod_2026`).
   * `JWT_EXPIRES_IN`: `1h` (configurable, ej. `5s` para la prueba de token vencido Escenario G).
   * `JWT_ISSUER`: `auth-service-grupo1`.
   * `BCRYPT_ROUNDS`: `10`.
   * `AUTH_SERVICE_URL`: `http://auth-service:3000` (en Docker Compose) / `http://localhost:3004` (en local).
   * `AUTH_HOST_PORT`: `3004` (`3004:3000`).

2. **Estructura de Claims del Access Token JWT (algoritmo `HS256`):**
   ```json
   {
     "sub": "6720a1b2c3d4e5f600000001",
     "email": "admin@libreria.com",
     "role": "ADMIN",
     "iss": "auth-service-grupo1",
     "iat": 1793300000,
     "exp": 1793303600
   }
   ```
   *(Nunca incluye contraseña, `passwordHash` ni secretos).*

3. **Perfiles / Roles de Autorización (RBAC):**
   * `USER`: cliente autenticado. Puede comprar libros (`POST /api/ordenes`) y consultar únicamente sus propias órdenes (`GET /api/ordenes/:id`, `GET /api/ordenes/cliente/:clienteId` cuando `:clienteId === sub`).
   * `ADMIN`: administrador del sistema. Puede crear, editar y eliminar libros en `catalog-service`, inicializar y reponer stock en `inventory-service`, y consultar cualquier orden.

4. **Matriz de Clasificación de Endpoints (Hito 1 y Hito 3):**

   | Servicio | Endpoint | Acceso | Rol / Condición | Respuestas de Seguridad |
   | :--- | :--- | :--- | :--- | :--- |
   | `auth-service` (`3004`) | `POST /api/auth/register` | Público | — (crea rol `USER` por defecto) | `201` creado · `400` inválido · `409` email duplicado |
   | `auth-service` (`3004`) | `POST /api/auth/login` | Público | — | `200` + JWT · `400` inválido · `401` credenciales inválidas · `403` cuenta inactiva |
   | `auth-service` (`3004`) | `GET /api/auth/me` | Autenticado | `USER`, `ADMIN` | `200` perfil del token · `401` sin token/inválido |
   | `catalog-service` (`3001`) | `GET /api/libros` y `GET /api/libros/:id` | Público | — | `200` / `404` |
   | `catalog-service` (`3001`) | `POST`, `PUT`, `DELETE /api/libros...` | Restringido | Solo `ADMIN` | `401` no autenticado · `403` si el rol es `USER` |
   | `inventory-service` (`3002`) | `GET /api/inventario/:libroId` y `/lock-status` | Público | — | `200` / `404` |
   | `inventory-service` (`3002`) | `POST /api/inventario` y `POST .../:libroId/reponer` | Restringido | Solo `ADMIN` | `401` no autenticado · `403` si el rol es `USER` |
   | `inventory-service` (`3002`) | `POST .../:libroId/descontar` y `/revertir` | Autenticado | `USER`, `ADMIN` (vía propagación Bearer) | `401` sin token válido · `403` rol no permitido |
   | `orders-service` (`3003`) | `POST /api/ordenes` | Autenticado | `USER`, `ADMIN` (propiedad: `clienteId` = `sub` para `USER`) | `401` sin token · `403` si `USER` intenta comprar por otro `clienteId` |
   | `orders-service` (`3003`) | `GET /api/ordenes/:id` y `/cliente/:clienteId` | Autenticado | `USER` (solo propias: `clienteId === sub`) o `ADMIN` (todas) | `401` sin token · `403` si `USER` consulta orden ajena |
   | Todos (`3001`–`3004`) | `GET /health` y `/api-docs` | Público | — | `200` |
