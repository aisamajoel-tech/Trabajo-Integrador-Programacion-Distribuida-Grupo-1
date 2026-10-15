# Trabajo Práctico N° 3: Persistencia, Logging y Documentación de APIs REST

**Asignatura:** Programación Distribuida  
**Tecnologías:** Node.js, Express, MongoDB (Mongoose), Winston (Daily Rotate File), OpenAPI 3.0 (Swagger UI), Redis (Distributed Lock) y HTTPS.

---

## 📋 Resumen del Proyecto

Este trabajo práctico continúa la evolución de la API REST de gestión de libros iniciada en los TP N° 1 y TP N° 2:
1. **Persistencia e Integridad:** Migración del almacenamiento en memoria a **MongoDB** utilizando **Mongoose** con Schemas, tipos de datos, campos obligatorios, restricciones de dominio (longitud, límites numéricos, enumeraciones de género e ISBN único con tratamiento de código `409 Conflict`).
2. **Logging Centralizado y Rotación:** Implementación de **Winston** con rotación diaria automática mediante `winston-daily-rotate-file` en archivos separados (`application-%DATE%.log` y `error-%DATE%.log`) con políticas de retención (`14d` y `30d`), niveles `INFO`, `WARN` y `ERROR`, excluyendo cualquier dato sensible.
3. **Documentación Interactiva:** Especificación **OpenAPI 3.0** y publicación de **Swagger UI** en `/api-docs` y formato JSON en `/api-docs.json`.
4. **Continuidad de Concurrencia y HTTPS:** Mantenimiento del servidor seguro bajo **HTTPS**, variables de entorno (`.env`) y protección de la sección crítica de compras concurrentes mediante **Distributed Lock con Redis/Memurai** persistiendo el stock final en MongoDB.

---

## 📂 Estructura del Proyecto

```
tp1 programacion distribuida/
├── config/
│   ├── db.js                 ← Conexión a MongoDB con Mongoose y logging
│   └── swagger.js            ← Configuración de OpenAPI 3.0 y Swagger UI
├── data/
│   └── mockData.js           ← Datos iniciales de referencia
├── models/
│   └── Libro.js              ← Schema y Model de Mongoose con validaciones
├── routes/
│   └── libros.js             ← Endpoints CRUD + Concurrencia + Anotaciones Swagger
├── scripts/
│   └── generate-cert.js      ← Generación de certificados autofirmados X.509
├── services/
│   └── lockService.js        ← Exclusión Mutua con Redis (Distributed Lock y Lua)
├── utils/
│   └── logger.js             ← Logger centralizado Winston con rotación de archivos
├── .env.example              ← Plantilla de configuración de entorno (sin secretos)
├── .env                      ← Variables locales de desarrollo (excluido en git)
├── .gitignore                ← Exclusión de node_modules, .env, certs/ y logs/
├── docker-compose.yml        ← Orquestación de MongoDB y Redis con un comando
├── index.js                  ← Punto de entrada HTTP/HTTPS, Swagger y middlewares
├── package.json              ← Dependencias y scripts de ejecución
├── README.md                 ← Documentación completa y respuestas teóricas
└── test-concurrencia.js      ← Suite integral de pruebas automatizadas
```

---

## 🚀 Instalación y Puesta en Marcha

### 1. Clonar o descomprimir e instalar dependencias
```bash
npm install
```

### 2. Configurar el archivo de entorno
Copiar `.env.example` a `.env`:
```bash
cp .env.example .env
```
*(En Windows PowerShell: `copy .env.example .env`)*

Contenido del `.env`:
```env
PORT_HTTP=3000
PORT_HTTPS=3443
SSL_KEY_PATH=./certs/server.key
SSL_CERT_PATH=./certs/server.cert
MONGODB_URI=mongodb://127.0.0.1:27017/biblioteca_db
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
LOCK_TTL_MS=5000
ARTIFICIAL_DELAY_MS=1500
LOG_LEVEL=info
LOG_MAX_SIZE=20m
LOG_MAX_FILES=14d
```

### 3. Iniciar Servicios Externos (MongoDB y Redis)

#### Opción A: Mediante Docker (Recomendada)
Si tienes Docker Desktop instalado, inicia ambos servicios con:
```bash
docker compose up -d
```
Esto iniciará:
- **MongoDB** en `localhost:27017`
- **Redis** en `localhost:6379`

#### Opción B: Servicios Locales en Windows
- **MongoDB:** Iniciar el servicio de MongoDB Community Server (se conecta por defecto a `mongodb://127.0.0.1:27017/biblioteca_db`). Puedes visualizar los datos con **MongoDB Compass**.
- **Redis:** Iniciar **Memurai Developer Edition** en el puerto `6379`.

### 4. Generar Certificados HTTPS
```bash
npm run cert:generate
```

### 5. Iniciar la Aplicación
```bash
npm start
```
Salida esperada en consola:
```
[2026-09-03 18:00:00] info: Iniciando servicios del sistema...
[2026-09-03 18:00:01] info: ✅ Conexión establecida exitosamente con MongoDB en: mongodb://127.0.0.1:27017/biblioteca_db
[2026-09-03 18:00:01] info: 🌐 Servidor HTTP iniciado en:  http://localhost:3000
[2026-09-03 18:00:01] info: 📖 Documentación Swagger UI en: http://localhost:3000/api-docs
[2026-09-03 18:00:01] info: 🔒 Servidor HTTPS iniciado en: https://localhost:3443
[2026-09-03 18:00:01] info: 📖 Swagger UI Seguro en:       https://localhost:3443/api-docs
```

---

## 📖 Documentación Interactiva OpenAPI / Swagger UI

Una vez iniciado el servidor, abre tu navegador en:
👉 **[http://localhost:3000/api-docs](http://localhost:3000/api-docs)** o **[https://localhost:3443/api-docs](https://localhost:3443/api-docs)**

- **Try it out:** Permite probar todas las solicitudes CRUD y de concurrencia directamente desde la web.
- **Especificación JSON OpenAPI:** Disponible en `http://localhost:3000/api-docs.json`.

---

## 📝 Endpoints Implementados y Códigos HTTP

| Método | Endpoint | Descripción | Códigos HTTP |
|---|---|---|---|
| `GET` | `/api/libros` | Listar todos los libros desde MongoDB | `200`, `500` |
| `GET` | `/api/libros/:id` | Consultar libro por ObjectId | `200`, `400` (ID inválido), `404` (No existe) |
| `POST` | `/api/libros` | Crear y persistir nuevo libro | `201` (Creado), `400` (Validación), `409` (ISBN duplicado) |
| `PUT` | `/api/libros/:id` | Modificar libro en MongoDB | `200`, `400`, `404`, `409` |
| `DELETE` | `/api/libros/:id` | Eliminar libro de MongoDB | `204` (Sin contenido), `400`, `404` |
| `POST` | `/api/libros/:id/comprar-inseguro` | Compra **sin lock** (demuestra condición de carrera) | `200`, `400`, `404` |
| `POST` | `/api/libros/:id/comprar` | Compra **con Distributed Lock (Redis)** | `200`, `400`, `404`, `409` (Bloqueado), `503` |
| `GET` | `/api/libros/:id/lock-status` | Consultar TTL y estado del lock en Redis | `200` |
| `POST` | `/api/libros/:id/reset-stock` | Reiniciar stock de prueba en MongoDB | `200`, `400`, `404` |
| `GET` | `/api/health` | Estado del servidor, MongoDB y Redis | `200` |

---

## 🧪 Pruebas Automatizadas

Con el servidor encendido en una terminal, abre otra terminal y ejecuta:
```bash
npm run test:concurrencia
```

El script ejecuta automáticamente:
1. **Verificación de HTTPS y Conexión:** Comprueba salud del servidor, MongoDB y Redis.
2. **Validación de Identificadores:** Demuestra `400 Bad Request` para formato inválido y `404 Not Found` para ObjectId válido inexistente.
3. **Condición de Carrera en MongoDB (Inseguro):** Demuestra sobreventa y stock negativo al realizar dos compras simultáneas sin exclusión mutua.
4. **Exclusión Mutua con Redis Lock en MongoDB:** Demuestra que con el Lock de Redis, solo 1 compra es aceptada (`200 OK`) y la concurrente es rechazada (`409 Conflict`), persistiendo el stock exactamente en 0.

---

## 📑 Respuestas a las Preguntas de Comprensión

### PARTE I - PERSISTENCIA Y MODELADO
#### 1. ¿Qué diferencia existe entre almacenar un recurso en un arreglo JavaScript y almacenarlo en MongoDB?
- **Arreglo en memoria (RAM):** Es volátil. Si el servidor Node.js se reinicia, se cae o se detiene, todos los datos se pierden inmediatamente. Además, no permite escalabilidad horizontal (múltiples instancias del servidor no comparten el arreglo) ni ofrece mecanismos avanzados de indexación o integridad transaccional.
- **MongoDB (Disco no volátil):** La información se almacena permanentemente en disco como documentos BSON. Sobrevive a caídas y reinicios del servidor. Permite que múltiples instancias compartan los mismos datos, cuenta con soporte para consultas complejas, índices secundarios y escalabilidad distribuida.

#### 2. ¿Qué función cumplen el Schema y el Model de Mongoose dentro de la aplicación?
- **Schema:** Define la estructura formal del documento, los tipos de datos, valores por defecto y las reglas de validación de negocio (campos obligatorios, restricciones de longitud, límites de año, stock no negativo, géneros enumerados y formato único de ISBN).
- **Model:** Es la clase constructora compilada a partir del Schema que provee la interfaz para interactuar directamente con la colección en la base de datos (operaciones CRUD como `find`, `findById`, `save`, `findByIdAndUpdate`, `findByIdAndDelete`).

#### 3. ¿Por qué conviene diferenciar un identificador inválido de un identificador válido cuyo documento no existe?
Representan fallas de naturaleza completamente distinta en una API REST:
- **Identificador inválido (`400 Bad Request`):** La petición del cliente está mal formulada sintácticamente (por ejemplo, enviar `"123"` o `"abc"` cuando se espera un `ObjectId` de 24 caracteres hexadecimales). No tiene sentido consultar la base de datos y se rechaza inmediatamente.
- **Identificador válido inexistente (`404 Not Found`):** El parámetro cumple con el formato requerido, pero tras buscar en la colección de MongoDB, no existe ningún documento asociado a ese identificador (por ejemplo, fue eliminado o nunca se registró).

---

### PARTE II - LOGGING Y ROTACIÓN DE ARCHIVOS
#### 1. ¿Qué diferencia práctica existe entre registrar un evento como INFO, WARN o ERROR?
- **INFO:** Registra eventos operacionales normales y esperados del sistema (inicio del servidor, conexión exitosa a MongoDB/Redis, peticiones HTTP completadas con status 200/201). Permite auditar el comportamiento regular sin indicar ninguna anomalía.
- **WARN:** Registra situaciones anormales o solicitudes rechazadas por reglas de validación que no impiden el funcionamiento continuo del servidor (errores de cliente 400, recursos 404, conflictos de concurrencia 409). Alerta sobre posibles usos indebidos o advertencias de capacidad.
- **ERROR:** Registra fallos críticos que impidieron completar una operación o excepciones no controladas (caídas de la base de datos, errores 500). Requiere atención y diagnóstico inmediato por parte del equipo de desarrollo.

#### 2. ¿Qué problema resuelven la rotación y la retención limitada de archivos de log?
Resuelven dos problemas críticos de administración:
1. **Evitar la saturación del disco:** Un archivo de log continuo crecería indefinidamente hasta llenar el espacio de almacenamiento del servidor, provocando la caída de los servicios.
2. **Facilidad de auditoría y rendimiento:** Archivos de log muy pesados son lentos y difíciles de abrir o procesar. La rotación segmenta los logs por fecha o tamaño (comprimiéndolos en `.gz`), y la política de retención (`maxFiles: '14d'`) elimina automáticamente los logs antiguos obsoletos.

---

### PARTE III - DOCUMENTACIÓN CON OPENAPI / SWAGGER
#### 1. ¿Qué diferencia existe entre OpenAPI y Swagger UI?
- **OpenAPI:** Es la especificación estándar (un contrato en formato JSON o YAML) que define rigurosamente los endpoints, métodos HTTP, parámetros, esquemas de entrada/salida y códigos de estado de una API REST.
- **Swagger UI:** Es la herramienta de interfaz gráfica web que toma esa especificación OpenAPI y la renderiza en el navegador de forma interactiva y legible, permitiendo además ejecutar solicitudes reales mediante *Try it out*.

#### 2. ¿La existencia de documentación Swagger garantiza que la implementación del endpoint sea correcta? Justifique.
**No.** La especificación Swagger es meramente descriptiva o declarativa. Si el código fuente tiene errores lógicos, excepciones no capturadas o devuelve datos que no coinciden con lo documentado, Swagger no lo corrige ni lo previene. La garantía de corrección del software proviene de las pruebas y la implementación, no del documento que describe la API.

#### 3. ¿Qué ventaja aporta disponer de un contrato de API documentado y reproducible?
Permite el desacoplamiento entre equipos: desarrolladores de frontend, aplicaciones móviles o servicios externos pueden integrar y consumir la API conociendo con exactitud los esquemas y códigos esperados sin consultar el código fuente del backend. Además, facilita la generación automática de clientes, stubs de prueba y pruebas de regresión.

---

### PARTE IV - INTEGRACIÓN Y VALIDACIÓN FINAL
#### 1. ¿Qué problema resuelve MongoDB/Mongoose que no resolvía el almacenamiento en memoria?
Resuelve la **durabilidad y persistencia de los datos**: los registros sobreviven a los reinicios del proceso Node.js. Adicionalmente, proporciona consistencia de tipos mediante esquemas y validaciones de integridad a nivel de base de datos.

#### 2. ¿Qué responsabilidad cumple cada componente: MongoDB, Redis/Memurai, Winston y OpenAPI/Swagger?
- **MongoDB (Mongoose):** Capa de **persistencia de datos** duradera y modelado con validaciones de integridad.
- **Redis / Memurai:** Capa de **coordinación distribuida y exclusión mutua** (Distributed Lock con TTL) para evitar condiciones de carrera en operaciones concurrentes.
- **Winston:** Capa de **auditoría, logging centralizado y diagnóstico** con rotación y retención de archivos en disco.
- **OpenAPI / Swagger UI:** Capa de **documentación interactiva y contrato de interfaz pública** en `/api-docs`.

---

## 📦 Pautas para la Entrega
El archivo comprimido para la entrega final debe incluir:
- Código fuente completo (`index.js`, carpetas `config/`, `models/`, `routes/`, `services/`, `utils/`, `scripts/`).
- `package.json` y `package-lock.json`.
- `.env.example` y `docker-compose.yml`.
- `test-concurrencia.js` y este `README.md`.

**NO deben incluirse:**
- Carpeta `node_modules/`
- Carpeta `logs/`
- Archivo `.env` con valores reales
- Carpeta `certs/` ni claves privadas
