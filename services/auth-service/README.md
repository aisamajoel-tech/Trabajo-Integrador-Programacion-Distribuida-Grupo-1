# 🔐 `auth-service` — Microservicio de Identidad y Autenticación JWT (TP7)

Microservicio responsable exclusivo del registro de usuarios, resguardo seguro de contraseñas mediante hash **`bcrypt`** (`bcryptjs`) y emisión de access tokens **JWT** firmados (`HS256`).

* **Responsable:** Joel Aisama (`@aisamajoel-tech`) — **Issue #26**
* **Base de datos propia:** MongoDB `db_auth` (colección `usuarios`)
* **Puerto local:** `3004` (`3004:3000` en Docker Compose)
* **Swagger UI:** `http://localhost:3004/api-docs`
* **Healthcheck:** `http://localhost:3004/health`

---

## 🚀 Endpoints Expuestos

| Método | Ruta (y alias) | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` (`/auth/register`) | Público (`USER`) / `ADMIN` | Registra un usuario hasheando su password con `bcrypt`. Nunca devuelve el password ni `passwordHash`. |
| `POST` | `/api/auth/login` (`/auth/login`) | Público | Valida credenciales contra el hash y emite un JWT firmado (`sub`, `email`, `role`, `iss`, `iat`, `exp`). |
| `GET` | `/api/auth/me` (`/auth/me`) | Autenticado (`Bearer`) | Devuelve el perfil del usuario autenticado y los claims de su token. |
| `PATCH` | `/api/auth/usuarios/:id/estado` | Restringido (`ADMIN`) | Permite habilitar/deshabilitar una cuenta (`activo`) o modificar su rol. |
| `GET` | `/health` (`/api/health`) | Público | Estado de salud del servicio y conexión a `db_auth`. |

---

## ⚙️ Variables de Entorno (`.env.example`)

| Variable | Por defecto (local) | Descripción |
| :--- | :--- | :--- |
| `PORT` | `3004` | Puerto HTTP de escucha (`3000` en contenedor) |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/db_auth` | URI de conexión a su base propia `db_auth` |
| `JWT_SECRET` | *(valor de desarrollo)* | Clave simétrica para firmar tokens `HS256` |
| `JWT_EXPIRES_IN` | `1h` | Tiempo de expiración del token |
| `JWT_ISSUER` | `auth-service-grupo1` | Emisor incluido en el claim `iss` |
| `BCRYPT_ROUNDS` | `10` | Factor de costo (salt rounds) de `bcrypt` |
| `ADMIN_EMAIL` | `admin@libreria.com` | Email del administrador inicial creado en el bootstrap |
| `ADMIN_PASSWORD` | `Admin1234!` | Contraseña de desarrollo para el bootstrap del admin inicial |
