# 📚 `catalog-service` — Microservicio de Catálogo Bibliográfico

**Responsable:** Joel Aisama (`@aisamajoel-tech`) — **Issue #11**  
**Materia:** Programación Distribuida — TP N° 6 (Grupo N° 1)

---

## 1. Responsabilidad del Servicio

`catalog-service` es la **única fuente de verdad** sobre las obras literarias registradas en el sistema y sus metadatos bibliográficos (`titulo`, `autor`, `año`, `genero`, `isbn`).

* **Desacoplamiento respecto del monolito (`app-base`):**
  * Se eliminó por completo el campo `stock` del modelo `Libro` (ahora responsabilidad exclusiva de `inventory-service`).
  * No depende de Redis ni de ningún otro microservicio para operar, asegurando alta disponibilidad en lecturas públicas.
  * Posee su propia base de datos lógica/física (`db_catalog`).

---

## 2. Estructura Interna

```text
services/catalog-service/
├── src/
│   ├── config/        # env.js, db.js (con reconexión automática), logger.js (Winston), swagger.js
│   ├── models/        # Libro.js (Esquema Mongoose sin stock)
│   ├── services/      # librosService.js (Reglas de negocio y sanitización)
│   ├── controllers/   # librosController.js (Adaptación HTTP y códigos de estado)
│   ├── routes/        # librosRoutes.js (Definición de endpoints y OpenAPI)
│   └── app.js         # Configuración de Express y middlewares
├── index.js           # Punto de entrada del servidor HTTP
├── package.json       # Dependencias exclusivas del servicio
├── Dockerfile         # Imagen node:20-alpine reproducible
├── .dockerignore      # Exclusión de node_modules, .env y logs
└── .env.example       # Variables de entorno documentadas
```

---

## 3. Variables de Entorno

| Variable | Valor por defecto (Local) | Valor en Docker Compose | Descripción |
| :--- | :--- | :--- | :--- |
| `SERVICE_NAME` | `catalog-service` | `catalog-service` | Nombre identificador en logs y `/health` |
| `PORT` | `3001` | `3000` | Puerto de escucha HTTP del proceso |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/db_catalog` | `mongodb://catalog-db:27017/db_catalog` | Conexión a MongoDB propia |
| `LOG_LEVEL` | `info` | `info` | Nivel de registro de Winston |
| `DB_RETRY_INTERVAL_MS` | `5000` | `5000` | Tiempo de espera entre reintentos de conexión a MongoDB |

---

## 4. Endpoints Expuestos

| Método | Ruta | Descripción | Respuestas |
| :---: | :--- | :--- | :--- |
| `GET` | `/health` | Estado de salud del servicio | `200 { "service": "catalog-service", "status": "ok" }` |
| `GET` | `/api-docs` | Documentación interactiva OpenAPI 3.0 (Swagger UI) | `200 HTML` |
| `GET` | `/api/libros` | Listar y filtrar libros (`?genero=`, `?autor=`) | `200 OK` |
| `GET` | `/api/libros/:id` | Consultar ficha de un libro por su ObjectId | `200 OK` · `400` · `404` |
| `POST` | `/api/libros` | Alta de obra bibliográfica (sin stock) | `201 Created` · `400` · `409 (ISBN duplicado)` |
| `PUT` | `/api/libros/:id` | Modificar datos editoriales de una obra | `200 OK` · `400` · `404` · `409` |
| `DELETE` | `/api/libros/:id` | Eliminar una obra del catálogo | `200 OK` · `400` · `404` |

---

## 5. Ejecución Local (Node.js)

```bash
cd services/catalog-service
npm install
cp .env.example .env
npm start
```

* **API:** `http://localhost:3001/api/libros`
* **Health:** `http://localhost:3001/health`
* **Swagger UI:** `http://localhost:3001/api-docs`

---

## 6. Construcción y Ejecución con Docker

Desde la raíz del repositorio:

```bash
# 1. Construir la imagen individual
docker build -t grupo1/catalog-service:tp6 ./services/catalog-service

# 2. Ejecutar el contenedor pasando las variables de entorno
docker run --rm -p 3001:3000 --env-file ./services/catalog-service/.env.example grupo1/catalog-service:tp6
```
