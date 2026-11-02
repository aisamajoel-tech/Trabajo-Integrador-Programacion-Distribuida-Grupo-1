# 📚 `catalog-service` — Microservicio de Catálogo Bibliográfico (TP6 / TP7)

**Responsable:** Joel Aisama (`@aisamajoel-tech`) — **Issues #11 y #26**  
**Materia:** Programación Distribuida — Grupo N° 1

---

## 1. Responsabilidad del Servicio y Modelo de Seguridad (TP7)

`catalog-service` es la **única fuente de verdad** sobre las obras literarias registradas en el sistema y sus metadatos bibliográficos (`titulo`, `autor`, `año`, `genero`, `isbn`) en `db_catalog`.

* **Protección JWT y RBAC (TP7):**
  * **Endpoints públicos (`GET /api/libros` y `GET /api/libros/:id`):** abiertos para cualquier visitante y para la validación de `orders-service`.
  * **Endpoints restringidos a `ADMIN` (`POST /api/libros`, `PUT /api/libros/:id`, `DELETE /api/libros/:id`):** protegidos mediante el middleware reutilizable `autenticarJWT` (`401 Unauthorized` si falta el token, está mal formado, su firma es inválida o está vencido) y `requerirRol('ADMIN')` (`403 Forbidden` si el usuario tiene rol `USER`).

---

## 2. Variables de Entorno (`.env.example`)

| Variable | Valor por defecto (Local) | Valor en Docker Compose | Descripción |
| :--- | :--- | :--- | :--- |
| `SERVICE_NAME` | `catalog-service` | `catalog-service` | Nombre identificador en logs y `/health` |
| `PORT` | `3001` | `3000` | Puerto de escucha HTTP del proceso |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/db_catalog` | `mongodb://catalog-db:27017/db_catalog` | Conexión a MongoDB propia |
| `JWT_SECRET` | *(valor de desarrollo)* | `${JWT_SECRET}` | Clave simétrica `HS256` para verificar tokens emitidos por `auth-service` |
| `JWT_ISSUER` | `auth-service-grupo1` | `auth-service-grupo1` | Emisor esperado en el claim `iss` |
| `LOG_LEVEL` | `info` | `info` | Nivel de registro de Winston |

---

## 3. Endpoints Expuestos y Control de Acceso

| Método | Ruta | Acceso | Descripción | Respuestas |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/health` | Público | Estado de salud del servicio | `200 { "service": "catalog-service", "status": "ok" }` |
| `GET` | `/api-docs` | Público | Documentación interactiva OpenAPI 3.0 (Swagger UI con `BearerAuth`) | `200 HTML` |
| `GET` | `/api/libros` | Público | Listar y filtrar libros (`?genero=`, `?autor=`) | `200 OK` |
| `GET` | `/api/libros/:id` | Público | Consultar ficha de un libro por su ObjectId | `200 OK` · `400` · `404` |
| `POST` | `/api/libros` | **Solo `ADMIN`** | Alta de obra bibliográfica (sin stock) | `201` · `400` · `401` · `403` · `409` |
| `PUT` | `/api/libros/:id` | **Solo `ADMIN`** | Modificar datos editoriales de una obra | `200` · `400` · `401` · `403` · `404` · `409` |
| `DELETE` | `/api/libros/:id` | **Solo `ADMIN`** | Eliminar una obra del catálogo | `200` · `400` · `401` · `403` · `404` |
