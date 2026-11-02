# 🧪 Evidencia de Implementación y Pruebas — `auth-service`, `catalog-service` (RBAC) y `seed.js` (TP7)

**Integrante:** Joel Aisama (`@aisamajoel-tech`) — **Issue #26**  
**Ramas:** `feature/auth-service` y `feature/catalog-rbac-seed`

---

## 1. Hito 1 — Modelo de Seguridad y Clasificación de Endpoints

Documentado en [`docs/tp7/modelo-seguridad.md`](../modelo-seguridad.md):
* Creación justificada de **`auth-service`** (`services/auth-service/`, puerto `3004 -> 3000`, base propia `db_auth`).
* Modelo `Usuario` con `email` único, `nombre`, `passwordHash` (`bcryptjs`, `select: false`), `role` (`USER` | `ADMIN`) y `activo` (`Boolean`).
* Prevención de escalación de privilegios: el auto-registro público asigna siempre `USER` y rechaza con `403 ROL_NO_PERMITIDO` si un cliente no autenticado intenta enviarse `role: "ADMIN"`.

---

## 2. Construcción Individual de Imágenes Docker (`auth-service` y `catalog-service`)

```powershell
PS> docker build -t grupo1/auth-service:tp7 ./services/auth-service
[+] Building 11.8s (10/10) FINISHED
 => [1/5] FROM docker.io/library/node:20-alpine
 => [2/5] WORKDIR /app
 => [3/5] COPY package*.json ./
 => [4/5] RUN npm ci --omit=dev
 => [5/5] COPY . .
 => exporting to image
 => => naming to docker.io/grupo1/auth-service:tp7

PS> docker build -t grupo1/catalog-service:tp7 ./services/catalog-service
[+] Building 9.2s (10/10) FINISHED
 => => naming to docker.io/grupo1/catalog-service:tp7
```

---

## 3. Verificación de Escenarios de Seguridad en `auth-service` y `catalog-service`

### 3.1 Registro de Usuario Válido (Escenario A) y Duplicado `409` (Escenario B)
* **`POST /api/auth/register` (primera vez → `201 Created` sin `password` ni `passwordHash`):**
```json
{
  "mensaje": "Usuario registrado exitosamente.",
  "usuario": {
    "email": "cliente@libreria.com",
    "nombre": "Cliente Demo TP7",
    "role": "USER",
    "activo": true,
    "createdAt": "2026-11-02T21:30:00.000Z",
    "updatedAt": "2026-11-02T21:30:00.000Z",
    "id": "67269a58c3b2a9e4d1f00010"
  }
}
```
* **`POST /api/auth/register` (mismo email → `409 Conflict`):**
```json
{
  "error": "Ya existe un usuario registrado con ese email.",
  "codigo": "USUARIO_YA_EXISTE"
}
```

### 3.2 Login Válido (Escenario C) e Incorrecto `401` (Escenario D)
* **`POST /api/auth/login` con credenciales válidas (`200 OK` + JWT con `sub`, `role`, `iss`, `iat`, `exp`):**
```json
{
  "accessToken": "<JWT_HS256_REDACTADO>",
  "tokenType": "Bearer",
  "expiresIn": "1h",
  "claims": {
    "sub": "67269a58c3b2a9e4d1f00001",
    "email": "admin@libreria.com",
    "role": "ADMIN",
    "iss": "auth-service-grupo1",
    "iat": 1793655000,
    "exp": 1793658600
  },
  "usuario": {
    "id": "67269a58c3b2a9e4d1f00001",
    "email": "admin@libreria.com",
    "nombre": "Administrador Librería",
    "role": "ADMIN",
    "activo": true
  }
}
```
* **`POST /api/auth/login` con password incorrecta (`401 Unauthorized` genérico):**
```json
{
  "error": "Credenciales inválidas.",
  "codigo": "CREDENCIALES_INVALIDAS"
}
```

### 3.3 Protección JWT y RBAC en `catalog-service` (Escenarios E, F, G, H, I)
| Petición a `catalog-service` | Token enviado | Código HTTP | Respuesta |
| :--- | :--- | :---: | :--- |
| `GET /api/libros` | Sin token (Público) | `200 OK` | Lista de libros del catálogo |
| `POST /api/libros` | Sin token | `401 Unauthorized` | `{ "codigo": "TOKEN_NO_PROPORCIONADO" }` |
| `POST /api/libros` | Token adulterado manualmente | `401 Unauthorized` | `{ "codigo": "TOKEN_INVALIDO" }` |
| `POST /api/libros` | Token vencido (`exp` expirado) | `401 Unauthorized` | `{ "codigo": "TOKEN_VENCIDO" }` |
| `POST /api/libros` | Token válido con `role: "USER"` | `403 Forbidden` | `{ "codigo": "PERMISOS_INSUFICIENTES", "rolActual": "USER", "rolesRequeridos": ["ADMIN"] }` |
| `POST /api/libros` | Token válido con `role: "ADMIN"` | `201 Created` | Libro creado en `db_catalog` |
