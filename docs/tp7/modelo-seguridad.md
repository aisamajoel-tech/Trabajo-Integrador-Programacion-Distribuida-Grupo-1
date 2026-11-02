# 🔐 Hito 1 — Modelo de Seguridad y Clasificación de Endpoints (TP N° 7)
**Universidad Champagnat — Programación Distribuida — Grupo N° 1**  
**Responsable:** Joel Aisama (`@aisamajoel-tech`) — **Issue #26**

---

## 1. Componente Responsable de Identidad y Autenticación (Sección 5)

En la arquitectura implementada en el TP6 existen tres microservicios de dominio:
* `catalog-service` (`db_catalog`): fichas bibliográficas de libros.
* `inventory-service` (`db_inventory` + Redis): stock disponible, movimientos y locks distribuidos.
* `orders-service` (`db_orders`): órdenes de compra e historial transaccional.

Ninguno de estos tres servicios gestiona identidades ni credenciales de usuarios. Por lo tanto, siguiendo los criterios de la **Sección 5 de la consigna**, el grupo adopta e implementa la segunda alternativa:

> **Decisión arquitectónica:** Crear el microservicio **`auth-service`** (`services/auth-service/`, puerto `3004 -> 3000`) con su propia base de datos independiente **`db_auth`** (contenedor MongoDB `auth-db` y volumen persistente `auth_db_data`).

### Justificación de límites y propiedad de datos:
1. **Responsabilidad única (SRP):** `auth-service` tiene como única responsabilidad registrar usuarios, almacenar de forma segura el hash de sus contraseñas (`bcrypt`), autenticar credenciales y emitir access tokens **JWT** firmados. No contiene ninguna regla de negocio de libros, stock ni órdenes.
2. **Propiedad exclusiva de credenciales (*Database per Service*):** `auth-service` es el único servicio que se conecta a `db_auth`. Ningún otro microservicio consulta `db_auth` ni conoce los hashes de contraseñas.
3. **Verificación distribuida sin acoplamiento:** Una vez emitido el JWT por `auth-service`, los microservicios de negocio (`catalog-service`, `inventory-service` y `orders-service`) verifican localmente la firma criptográfica, el emisor (`iss`) y el vencimiento (`exp`) del token mediante su middleware de autenticación, sin invocar a `auth-service` ni consultar `db_auth` en cada request.

---

## 2. Modelo de Usuario y Credenciales (Sección 6)

La colección `usuarios` en `db_auth` almacena la siguiente estructura:

| Campo | Tipo | Ejemplo | Regla de Negocio / Seguridad |
| :--- | :--- | :--- | :--- |
| `_id` (`id` / `sub`) | `ObjectId` (string hex 24) | `6720a1b2c3d4e5f600000001` | Identificador único e inmutable del usuario; se incluye como claim `sub` en el JWT y como `clienteId` en las órdenes. |
| `email` | `String` (único, lowercase) | `cliente@libreria.com` | Credencial única de identificación para `POST /api/auth/login`. Indexado con `unique: true`. |
| `nombre` | `String` | `Ana Pérez` | Nombre descriptivo del usuario. |
| `passwordHash` | `String` | `$2a$10$N9qo8uLOickgx2ZMRZoMye...` | Hash generado con **`bcryptjs`** (`BCRYPT_ROUNDS=10`, salt aleatorio integrado). Configurado con `select: false` en el esquema y eliminado en `toJSON` para que **jamás** se devuelva por HTTP ni se imprima en logs. |
| `role` | `String` (`enum`) | `USER` \| `ADMIN` | Perfil de autorización para control de acceso basado en roles (**RBAC**). El auto-registro público asigna siempre `USER`. |
| `activo` | `Boolean` | `true` | Permite deshabilitar una identidad (`activo: false`) sin borrar su historial de órdenes. Si `activo === false`, el login rechaza con `403 CUENTA_DESHABILITADA`. |

### Reglas estrictas sobre contraseñas y alta de roles (Secciones 6.1, 6.2 y 7):
* **Nunca** se almacena la contraseña en texto plano en `db_auth`, ni se imprime en logs de Winston, ni se devuelve en respuestas HTTP, ni se incluye dentro del JWT.
* **Prevención de escalación de privilegios en el registro:** El endpoint público `POST /api/auth/register` **no acepta libremente roles enviados por clientes no autenticados**. Todo auto-registro público crea el usuario con rol `USER`. Para asignar el rol `ADMIN` existen únicamente dos mecanismos controlados:
  1. **Bootstrap inicial por entorno:** Al iniciar `auth-service`, se asegura de forma idempotente la existencia del administrador inicial definido en variables de entorno (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
  2. **Alta administrada:** `POST /api/auth/register` solo permite crear otro usuario con `role: "ADMIN"` si la petición incluye un header `Authorization: Bearer <JWT>` válido perteneciente a un `ADMIN` existente (en caso contrario responde `403 ROL_NO_PERMITIDO`).

---

## 3. Diseño del Access Token JWT (Sección 8)

* **Algoritmo de firma:** `HS256` (HMAC con SHA-256) configurado explícitamente tanto en `jwt.sign(..., { algorithm: 'HS256' })` como en `jwt.verify(..., { algorithms: ['HS256'] })`.
* **Secreto y expiración externalizados:**
  * `JWT_SECRET`: clave simétrica configurada por variable de entorno.
  * `JWT_EXPIRES_IN`: duración de validez del token (por defecto `1h`; configurable a valores cortos como `3s` para pruebas de expiración).
  * `JWT_ISSUER`: `auth-service-grupo1`.

### Ejemplo de Payload (Claims del JWT):
```json
{
  "sub": "6720a1b2c3d4e5f600000001",
  "email": "cliente@libreria.com",
  "role": "USER",
  "iss": "auth-service-grupo1",
  "iat": 1793300000,
  "exp": 1793303600
}
```

---

## 4. Clasificación de Endpoints y Matriz RBAC (Secciones 4, 10 y 11)

### 4.1 Tabla Completa de Clasificación de Endpoints

| Servicio | Endpoint | Clasificación | Público | Rol `USER` | Rol `ADMIN` | Justificación Funcional |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **`auth-service`** (`3004`) | `POST /api/auth/register` | Público (alta `USER`) / Administrado (alta `ADMIN`) | ✅ | ✅ | ✅ | Permite registrarse como cliente (`USER`). Crear un `ADMIN` requiere token de `ADMIN`. |
| **`auth-service`** (`3004`) | `POST /api/auth/login` | Público | ✅ | ✅ | ✅ | Punto de entrada para intercambiar credenciales válidas por un JWT firmado. |
| **`auth-service`** (`3004`) | `GET /api/auth/me` | Autenticado | ❌ (`401`) | ✅ | ✅ | Devuelve la identidad y rol asociados al token enviado en `Authorization: Bearer`. |
| **`auth-service`** (`3004`) | `PATCH /api/auth/usuarios/:id/estado` | Restringido | ❌ (`401`) | ❌ (`403`) | ✅ | Habilitar/deshabilitar cuentas (`activo`) es una operación administrativa. |
| **`catalog-service`** (`3001`) | `GET /api/libros` | Público | ✅ | ✅ | ✅ | Cualquier visitante puede explorar el catálogo bibliográfico de la librería. |
| **`catalog-service`** (`3001`) | `GET /api/libros/:id` | Público | ✅ | ✅ | ✅ | Consulta pública de detalle bibliográfico (también usado por `orders-service`). |
| **`catalog-service`** (`3001`) | `POST /api/libros` | Restringido | ❌ (`401`) | ❌ (`403`) | ✅ | Solo un administrador puede dar de alta nuevas obras en el catálogo. |
| **`catalog-service`** (`3001`) | `PUT /api/libros/:id` | Restringido | ❌ (`401`) | ❌ (`403`) | ✅ | Solo un administrador puede modificar metadatos editoriales de un libro. |
| **`catalog-service`** (`3001`) | `DELETE /api/libros/:id` | Restringido | ❌ (`401`) | ❌ (`403`) | ✅ | Solo un administrador puede eliminar un libro del catálogo. |
| **`inventory-service`** (`3002`) | `GET /api/inventario/:libroId` | Público | ✅ | ✅ | ✅ | Permite consultar públicamente si hay ejemplares disponibles de un libro. |
| **`inventory-service`** (`3002`) | `GET /api/inventario/:libroId/lock-status` | Público | ✅ | ✅ | ✅ | Endpoint de diagnóstico de concurrencia (solo lectura). |
| **`inventory-service`** (`3002`) | `POST /api/inventario` | Restringido | ❌ (`401`) | ❌ (`403`) | ✅ | Inicializar el registro de stock de un libro es una tarea administrativa. |
| **`inventory-service`** (`3002`) | `POST /api/inventario/:libroId/reponer` | Restringido | ❌ (`401`) | ❌ (`403`) | ✅ | Reponer o fijar stock físico es exclusivo del rol `ADMIN`. |
| **`inventory-service`** (`3002`) | `POST /api/inventario/:libroId/descontar` | Autenticado | ❌ (`401`) | ✅ | ✅ | Invocado durante una compra con el JWT propagado desde `orders-service`. |
| **`inventory-service`** (`3002`) | `POST /api/inventario/:libroId/revertir` | Autenticado | ❌ (`401`) | ✅ | ✅ | Compensación de descuento asociada a una orden con JWT propagado. |
| **`orders-service`** (`3003`) | `POST /api/ordenes` | Autenticado + Propiedad | ❌ (`401`) | ✅ (propia) | ✅ | Un usuario autenticado compra para sí mismo (`clienteId === token.sub`). Si un `USER` envía otro `clienteId` recibe `403`. |
| **`orders-service`** (`3003`) | `GET /api/ordenes/:id` | Autenticado + Propiedad | ❌ (`401`) | ✅ (si es dueño) | ✅ (todas) | Un `USER` solo puede ver su propia orden (`orden.clienteId === token.sub`); si intenta ver la de otro cliente recibe `403`. |
| **`orders-service`** (`3003`) | `GET /api/ordenes/cliente/:clienteId` | Autenticado + Propiedad | ❌ (`401`) | ✅ (si `:clienteId === sub`) | ✅ (todas) | Un `USER` solo puede consultar su propio historial; si pide otro `:clienteId` recibe `403`. |
| **Todos** (`3001`–`3004`) | `GET /health` y `/api-docs` | Público | ✅ | ✅ | ✅ | Healthchecks de Docker Compose y documentación interactiva OpenAPI/Swagger. |

---

## 5. Diferenciación entre `401 Unauthorized` y `403 Forbidden` (Sección 11.1)

| Código HTTP | Significado Semántico | Casos en nuestra arquitectura | Código de error devuelto |
| :--- | :--- | :--- | :--- |
| **`401 Unauthorized`** | **Falla de Autenticación:** No se pudo demostrar quién es el usuario o la credencial no es válida. | 1. Falta el header `Authorization: Bearer <token>`.<br>2. El token está mal formado.<br>3. La firma del token fue adulterada o firmada con otra clave.<br>4. El token expiró (`exp` vencido).<br>5. Email inexistente o password incorrecta en `/api/auth/login`. | `TOKEN_NO_PROPORCIONADO`<br>`TOKEN_MAL_FORMADO`<br>`TOKEN_INVALIDO`<br>`TOKEN_VENCIDO`<br>`CREDENCIALES_INVALIDAS` |
| **`403 Forbidden`** | **Falla de Autorización:** El usuario está autenticado con un JWT válido, pero no tiene permiso para la operación o el recurso. | 1. Un usuario con rol `USER` intenta hacer `POST/PUT/DELETE /api/libros` o `POST /api/inventario/:id/reponer`.<br>2. Un `USER` intenta consultar o crear una orden con un `clienteId` distinto a su propio `sub`.<br>3. Login de una cuenta con `activo: false`. | `PERMISOS_INSUFICIENTES`<br>`ACCESO_DENEGADO_RECURSO_AJENO`<br>`CUENTA_DESHABILITADA` |

---

## 6. Autenticación en Microservicios y Propagación del Token (Secciones 12 y 13)

1. **¿Qué componente emite los tokens?**  
   Únicamente `auth-service` al validar credenciales en `POST /api/auth/login`.
2. **¿Qué servicios validan tokens?**  
   `auth-service` (en `/me` y endpoints administrativos), `catalog-service`, `inventory-service` y `orders-service` mediante su middleware local `authMiddleware.js`.
3. **¿Qué información del token utiliza cada servicio?**  
   * `catalog-service`: verifica `role === 'ADMIN'` en operaciones de escritura y registra `sub` en los logs de auditoría.
   * `orders-service`: utiliza `sub` como identificador del comprador (`clienteId`) y `role` para validar propiedad del recurso (`orden.clienteId === req.user.sub` o `req.user.role === 'ADMIN'`).
   * `inventory-service`: verifica que el token sea válido y que el `role` esté autorizado (`ADMIN` para `/inventario` y `/reponer`; `USER` o `ADMIN` para `/descontar` y `/revertir`).
4. **¿Cómo se comparte la configuración para verificar la firma?**  
   A través de las variables de entorno `JWT_SECRET` y `JWT_ISSUER` inyectadas por Docker Compose (o `.env` en local), sin acoplar bases de datos.
5. **¿Qué ocurre si `auth-service` cae después de que un token válido ya fue emitido?**  
   Como la validación del JWT es **autocontenida y sin estado (*stateless*)**, todos los clientes que ya posean un JWT vigente pueden seguir operando normalmente en `catalog-service`, `orders-service` e `inventory-service` mientras el token no expire. Solo se ven afectados los nuevos logins o registros hasta que `auth-service` se recupere.
6. **Propagación del token entre servicios (Sección 13):**
   ```text
   Cliente
     │  POST /api/ordenes
     │  Authorization: Bearer <JWT>
     ▼
   orders-service (valida JWT + verifica que clienteId === req.user.sub)
     │  POST /api/inventario/:libroId/descontar
     │  Authorization: Bearer <JWT>   (propagado por inventoryClient)
     │  x-request-id: <UUID>
     ▼
   inventory-service (valida JWT + ejecuta descuento con Redis Lock)
   ```
