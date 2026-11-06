# 📚 NovaLectura — Plataforma Distribuida de Librería Comercial

**NovaLectura** es una tienda web y plataforma comercial de librería construida bajo una arquitectura de **Microservicios Desacoplados** siguiendo el patrón **MVC (Modelo–Vista–Controlador) + Capa de Servicios**.

El sistema permite explorar un catálogo editorial en tiempo real, gestionar el stock físico en depósito con **exclusión mutua distribuida (Redis Lock)** para evitar la sobreventa cuando múltiples clientes compran el último ejemplar simultáneamente, procesar órdenes de compra con comprobantes históricos inmutables (`libroSnapshot`) y proteger las operaciones mediante **Autenticación JWT (`HS256`) y Control de Acceso Basado en Roles (`RBAC`: `USER` y `ADMIN`)**.

---

## 🚀 Cómo Clonar y Levantar el Sistema

Podés clonar y levantar el sistema completo (Tienda Web + 4 Microservicios + Bases de Datos + Motor de Locks) de dos maneras:

### Opción A — Ejecución Inmediata con Node.js (Recomendada / Sin requerir Docker)

No requiere tener Docker Desktop ni MongoDB instalados localmente. Levanta los 4 microservicios en sus puertos reales (`3001`, `3002`, `3003`, `3004`) y la Tienda Web Comercial en el puerto `3000`.

1. **Clonar el repositorio e instalar dependencias:**
   ```bash
   git clone https://github.com/aisamajoel-tech/Trabajo-Integrador-Programacion-Distribuida-Grupo-1.git
   cd Trabajo-Integrador-Programacion-Distribuida-Grupo-1
   npm install
   npm start
   ```
   *(O en Windows, simplemente hacé doble clic sobre el archivo **`INICIAR_SISTEMA.bat`**).*

2. **Abrir la Tienda Web en el navegador:**
   👉 **http://localhost:3000**

---

### Opción B — Ejecución en Contenedores con Docker Compose

Si tenés **Docker Desktop** corriendo y querés levantar la infraestructura completa de contenedores (`catalog-service`, `inventory-service`, `orders-service`, `auth-service`, 4 instancias independientes de `MongoDB 7` y `Redis 7 Alpine`):

```bash
cp .env.example .env
docker compose up -d --build
```

Para poblar las 4 bases de datos con los libros iniciales, el stock y los usuarios de prueba (`ADMIN` y `USER`):

```bash
cd scripts/seed
npm install
npm run seed
```

---

## 🔑 Cuentas de Prueba Precargadas (JWT & RBAC)

En la barra superior de **http://localhost:3000** podés alternar entre roles con **1 solo clic**, o bien iniciar sesión manualmente desde el botón **"Iniciar Sesión"**:

| Rol | Email | Contraseña | Permisos en el Sistema |
| :--- | :--- | :--- | :--- |
| **Público (Sin Token)** | *(Visitante)* | — | Puede navegar la tienda, buscar libros por título/autor/ISBN y consultar stock disponible (`GET /api/libros`, `GET /api/inventario`). |
| **Cliente (`USER`)** | `cliente@libreria.com` | `Cliente123!` | Puede comprar libros (`POST /api/ordenes`) y consultar únicamente sus propios comprobantes de compra (`GET /api/ordenes`). Recibe `403 Forbidden` si intenta crear/borrar libros o reponer stock. |
| **Otro Cliente (`USER`)** | `otro.cliente@libreria.com` | `Cliente123!` | Segunda cuenta de cliente para probar compras simultáneas y verificar que un cliente no puede ver ni crear órdenes a nombre de otro (`403 ACCESO_DENEGADO`). |
| **Administrador (`ADMIN`)** | `admin@libreria.com` | `Admin1234!` | Acceso total al **Panel de Gestión de Catálogo y Stock**: alta, edición y baja de libros (`POST/PUT/DELETE /api/libros`), reposición de stock (`POST /api/inventario/:id/reponer`) y auditoría global de órdenes. |

---

## 🏛️ Arquitectura del Sistema y Patrón MVC

El proyecto aplica estrictamente el patrón **MVC (Modelo – Vista – Controlador)** combinado con una capa de **Servicios (`services/`)** y **Middlewares (`middlewares/`)** tanto en el portal como en cada uno de los 4 microservicios independientes:

```text
├── INICIAR_SISTEMA.bat                 # Lanzador rápido de 1 clic para Windows
├── iniciar-sistema.js                  # Orquestador local de los 4 microservicios + Tienda Web
├── docker-compose.yml                  # Orquestación de 9 contenedores (4 APIs + 4 Mongo + 1 Redis)
├── package.json
├── README.md                           # Documentación principal del sistema
│
├── src/                                # Estructura MVC unificada del sistema
│   ├── config/
│   │   └── env.js                      # Variables de entorno, puertos (3000-3004), JWT_SECRET y TTL Redis
│   ├── models/                         # [M] CAPA MODELO (Acceso a datos y reglas de persistencia)
│   │   ├── LibroModel.js               # Modelo de Catálogo Editorial (db_catalog)
│   │   ├── InventarioModel.js          # Modelo de Stock, Movimientos y Lock Redis (db_inventory)
│   │   ├── OrdenModel.js               # Modelo de Órdenes de Compra y libroSnapshot (db_orders)
│   │   └── UsuarioModel.js             # Modelo de Usuarios con hash bcrypt y roles (db_auth)
│   ├── views/                          # [V] CAPA VISTA (Interfaz de usuario E-Commerce)
│   │   └── viewRenderer.js             # Renderizador de la Tienda Web NovaLectura
│   ├── controllers/                    # [C] CAPA CONTROLADOR (Manejo de peticiones y respuestas HTTP)
│   │   └── index.js                    # Controladores HTTP desacoplados por dominio
│   ├── routes/                         # ENRUTADORES HTTP (Mapeo de endpoints REST)
│   │   └── index.js                    # Definición de rutas por servicio
│   └── middlewares/                    # MIDDLEWARES TRANSVERSALES
│       └── authMiddleware.js           # Verificación de firma JWT HS256 (401) y rol RBAC (403)
│
├── services/                           # Microservicios independientes (Cada uno con su propio MVC)
│   ├── web-portal/                     # Tienda Web Comercial E-Commerce (Puerto 3000)
│   │   └── public/index.html           # Vista interactiva: Tienda + Mis Compras + Admin + Monitor
│   │
│   ├── catalog-service/                # Microservicio de Catálogo Editorial (Puerto 3001 - db_catalog)
│   │   └── src/
│   │       ├── config/                 # Conexión MongoDB, logger y Swagger
│   │       ├── models/Libro.js         # [Modelo] Esquema Mongoose (titulo, autor, año, genero, isbn)
│   │       ├── controllers/            # [Controlador] libroController.js
│   │       ├── services/               # [Servicio] libroService.js
│   │       ├── routes/                 # [Rutas] libroRoutes.js
│   │       └── middlewares/            # [Seguridad] authMiddleware.js (JWT + RBAC ADMIN)
│   │
│   ├── inventory-service/              # Microservicio de Stock y Concurrencia (Puerto 3002 - db_inventory + Redis)
│   │   └── src/
│   │       ├── config/                 # Conexión MongoDB + Cliente Redis
│   │       ├── models/                 # [Modelo] Inventario.js y MovimientoStock.js
│   │       ├── controllers/            # [Controlador] inventarioController.js
│   │       ├── services/               # [Servicio] inventarioService.js + lockService.js (SET NX PX + Lua)
│   │       ├── routes/                 # [Rutas] inventarioRoutes.js
│   │       └── middlewares/            # [Seguridad] authMiddleware.js (JWT + RBAC)
│   │
│   ├── orders-service/                 # Microservicio Orquestador de Ventas (Puerto 3003 - db_orders)
│   │   └── src/
│   │       ├── config/                 # Conexión MongoDB y variables de entorno
│   │       ├── models/Orden.js         # [Modelo] Orden (PENDIENTE -> CONFIRMADA | RECHAZADA + libroSnapshot)
│   │       ├── controllers/            # [Controlador] ordenController.js
│   │       ├── services/               # [Servicio] ordenService.js (Orquestación HTTP y propiedad del recurso)
│   │       ├── clients/                # Clientes HTTP hacia catalog-service e inventory-service
│   │       ├── routes/                 # [Rutas] ordenRoutes.js
│   │       └── middlewares/            # [Seguridad] authMiddleware.js
│   │
│   └── auth-service/                   # Microservicio de Identidad y JWT (Puerto 3004 - db_auth)
│       └── src/
│           ├── config/                 # Configuración JWT (HS256) y conexión a db_auth
│           ├── models/Usuario.js       # [Modelo] Usuario (email, passwordHash bcrypt, role USER|ADMIN)
│           ├── controllers/            # [Controlador] authController.js
│           ├── services/               # [Servicio] authService.js
│           ├── routes/                 # [Rutas] authRoutes.js
│           └── middlewares/            # [Seguridad] authMiddleware.js
│
└── scripts/
    └── seed/seed.js                    # Script idempotente de carga inicial de datos
```

---

## 🌐 Mapa de Puertos y Endpoints REST

| Servicio | Puerto | Base de Datos | Endpoints Principales | Acceso / Rol Requerido |
| :--- | :---: | :---: | :--- | :--- |
| **Tienda Web (`web-portal`)** | `3000` | — | `GET /` (Interfaz E-Commerce)<br>`GET /api/monitor/estado` | Público |
| **`catalog-service`** | `3001` | `db_catalog` | `GET /api/libros`<br>`GET /api/libros/:id`<br>`POST /api/libros`<br>`PUT /api/libros/:id`<br>`DELETE /api/libros/:id` | Público<br>Público<br>🔒 Solo `ADMIN`<br>🔒 Solo `ADMIN`<br>🔒 Solo `ADMIN` |
| **`inventory-service`** | `3002` | `db_inventory` + `Redis` | `GET /api/inventario`<br>`GET /api/inventario/:libroId`<br>`POST /api/inventario/:libroId/descontar`<br>`POST /api/inventario/:libroId/reponer`<br>`POST /api/inventario` | Público<br>Público<br>🔒 `USER` o `ADMIN` (Con Lock Redis)<br>🔒 Solo `ADMIN`<br>🔒 Solo `ADMIN` |
| **`orders-service`** | `3003` | `db_orders` | `POST /api/ordenes`<br>`GET /api/ordenes`<br>`GET /api/ordenes/:id`<br>`GET /api/ordenes/cliente/:clienteId` | 🔒 `USER` o `ADMIN` (Valida propiedad)<br>🔒 `USER` (ve propias) / `ADMIN` (ve todas)<br>🔒 Dueño de la orden o `ADMIN`<br>🔒 Dueño de la cuenta o `ADMIN` |
| **`auth-service`** | `3004` | `db_auth` | `POST /api/auth/register`<br>`POST /api/auth/login`<br>`GET /api/auth/me` | Público (crea rol `USER` con `bcrypt`)<br>Público (emite Token JWT `HS256`)<br>🔒 Autenticado (`USER` o `ADMIN`) |

---

## 🔄 Flujo Completo de una Compra y Prevención de Sobreventa

1. **Petición del Cliente:** El cliente autenticado (`Bearer <JWT>`) hace clic en **"Comprar ahora"** en la tienda web (`POST http://localhost:3003/api/ordenes`).
2. **Validación de Identidad y Propiedad:** `orders-service` verifica la firma del Token JWT (`HS256`) y comprueba que el `clienteId` coincida con el `sub` del token (evitando que un usuario compre a nombre de otro).
3. **Creación de Orden `PENDIENTE`:** Se persiste la orden en `db_orders` con estado inicial `PENDIENTE`.
4. **Consulta a Catálogo y `libroSnapshot`:** `orders-service` consulta por HTTP a `catalog-service` (`GET /api/libros/:id`) y guarda una copia inmutable de los datos editoriales (`titulo`, `autor`, `isbn`) dentro de la orden.
5. **Descuento Atómico con Lock Distribuido en Redis:** `orders-service` invoca a `inventory-service` (`POST /api/inventario/:id/descontar`) propagando el header `Authorization: Bearer <JWT>` y el `x-request-id`:
   * `inventory-service` adquiere un candado exclusivo en Redis: `SET lock:libro:{id} <token> NX PX 5000`.
   * Si dos personas intentan comprar el último ejemplar en el mismo milisegundo, la primera adquiere el lock y descuenta el stock (`1 -> 0`), mientras que la segunda recibe `409 Conflict`.
   * Al finalizar la sección crítica, un **script Lua** libera el candado verificando que el token propietario coincida.
6. **Resolución Final:** La orden pasa a estado **`CONFIRMADA` (`201 Created`)** o **`RECHAZADA` (`409` / `404` / `503`)** especificando el motivo (`SIN_STOCK`, `CONCURRENCIA`, `LIBRO_INEXISTENTE` o `SERVICIO_NO_DISPONIBLE`).

---

## 🤖 Guía y Reglas de Arquitectura para Agentes de IA (Copilot / Claude / Cursor)

Si abrís este proyecto con un asistente de IA (**GitHub Copilot**, **Claude**, **Cursor**, etc.), el agente debe respetar estrictamente las siguientes reglas de diseño:

1. **Respetar el Patrón MVC en cada Microservicio:**
   * **Modelos (`models/`):** Contienen únicamente esquemas de datos y operaciones de persistencia de su propia base de datos (**Database per Service**). Ningún servicio puede conectarse a la base de datos de otro servicio.
   * **Vistas (`views/` y `services/web-portal/public/`):** Toda la interfaz gráfica del usuario vive en `web-portal` y se comunica con los microservicios exclusivamente por HTTP REST JSON.
   * **Controladores (`controllers/`):** Solo reciben `req` y `res`, validan parámetros de entrada, delegan la lógica de negocio a la capa `services/` o `models/` y devuelven códigos HTTP semánticos (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `503`).
   * **Rutas (`routes/`):** Definen los endpoints REST y conectan los `middlewares/` (`authenticateJWT`, `requireRole`) antes de invocar al controlador.
2. **Desacoplamiento Estricto:**
   * `catalog-service` (`:3001`) **NO** debe tener campo `stock` ni depender de Redis.
   * `inventory-service` (`:3002`) es el único dueño del stock y del Lock Distribuido en Redis (`lock:libro:{libroId}`).
   * `orders-service` (`:3003`) coordina las compras por HTTP propagando los headers `Authorization: Bearer <JWT>` y `x-request-id`.
   * `auth-service` (`:3004`) almacena contraseñas exclusivamente hasheadas con `bcryptjs` (`passwordHash`) y firma tokens JWT con `HS256`.
