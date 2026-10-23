# 📌 Plan de Tareas por Integrante - TP N° 6
**Programación Distribuida - Implementación de Microservicios y Docker - Grupo N° 1**
**Repositorio:** [https://github.com/aisamajoel-tech/Trabajo-Integrador-Programacion-Distribuida-Grupo-1](https://github.com/aisamajoel-tech/Trabajo-Integrador-Programacion-Distribuida-Grupo-1)

Todos trabajamos **en paralelo**, cada uno en su rama y en su carpeta. Nadie necesita esperar a otro para arrancar: basta con respetar las convenciones de la sección 0.

---

## ⚖️ Criterio del reparto

Estimamos cuánto trabajo lleva cada tarea (1 = poco, 5 = mucho) y armamos grupos que pesen parecido, de modo que todos tengan una carga equivalente y aportes identificables en el historial (consigna, sección 19).

| Tarea | Peso |
|---|---|
| catalog-service | 2 |
| inventory-service | 3 |
| orders-service | 4 |
| docker-compose (red, volúmenes, healthchecks) | 3 |
| Dockerfile de un servicio | 0,5 |
| Ratificación de arquitectura (Hito 1) | 1,5 |
| Script de datos de prueba | 1,5 |
| Análisis de fallo parcial | 1,5 |
| README principal | 2 |
| Pruebas con evidencia | repartidas: cada uno prueba lo suyo |

| Integrante | Tareas | Carga |
|---|---|---|
| **Joel** | catalog-service + Dockerfile + script de datos de prueba | ~4,5 |
| **Bautista** | inventory-service + Dockerfile + test de concurrencia + prueba local vs Docker | ~5 |
| **Candela** | orders-service + Dockerfile + prueba de indisponibilidad | ~5 |
| **Delfina** | Ratificación (Hito 1) + docker-compose + pruebas de persistencia, logs y arranque | ~5,5 |
| **Carolina** | Análisis de fallo parcial + pruebas de integración + README principal | ~5 |

---

## 0. Acuerdos comunes (leer ANTES de empezar)

Para que todo encaje al integrar con Docker Compose sin tener que modificar código.

### 0.1 Estructura del repositorio
```
/
├── services/
│   ├── catalog-service/      ← Joel
│   ├── inventory-service/    ← Bautista
│   └── orders-service/       ← Candela
├── docker-compose.yml        ← Delfina
├── .env.example              ← Delfina (variables para Compose)
├── scripts/seed/             ← Joel
├── docs/
│   ├── arquitectura.md       (TP5)
│   ├── servicios/            (especificaciones por servicio)
│   └── tp6/                  ← documentos y evidencias del TP6
│       └── evidencias/
├── app-base/                 (monolito original, se conserva como referencia)
└── README.md                 ← Carolina (con aportes de todos)
```

Cada uno crea **su propia carpeta dentro de su rama**. No hace falta que nadie las cree antes.

### 0.2 Estructura interna de cada servicio
```
services/<nombre>-service/
├── src/
│   ├── routes/        # rutas
│   ├── controllers/   # adaptan request/response HTTP
│   ├── services/      # reglas de negocio
│   ├── clients/       # llamadas HTTP a otros servicios (solo si las necesita)
│   ├── models/        # modelos Mongoose propios
│   ├── config/        # env, db, logger, swagger
│   └── app.js
├── index.js           # punto de inicio
├── package.json       # dependencias SOLO de este servicio
├── package-lock.json
├── Dockerfile
├── .dockerignore
├── .env.example
└── README.md
```

### 0.3 Puertos y nombres internos

| Servicio | Nombre DNS en Compose | Puerto interno (contenedor) | Puerto local / publicado al host |
|---|---|---|---|
| catalog-service | `catalog-service` | 3000 | 3001 |
| inventory-service | `inventory-service` | 3000 | 3002 |
| orders-service | `orders-service` | 3000 | 3003 |
| MongoDB catálogo | `catalog-db` | 27017 | no se publica |
| MongoDB inventario | `inventory-db` | 27017 | no se publica |
| MongoDB órdenes | `orders-db` | 27017 | no se publica |
| Redis | `redis` | 6379 | no se publica |

### 0.4 Variables de entorno (mismos nombres en todos los servicios)

| Variable | Ejemplo local | Ejemplo Docker Compose | Quién la usa |
|---|---|---|---|
| `PORT` | `3001` / `3002` / `3003` | `3000` | todos |
| `SERVICE_NAME` | `catalog-service` | `catalog-service` | todos (logs y health) |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/db_catalog` | `mongodb://catalog-db:27017/db_catalog` | todos |
| `LOG_LEVEL` | `info` | `info` | todos |
| `REDIS_URL` | `redis://127.0.0.1:6379` | `redis://redis:6379` | inventory |
| `LOCK_TTL_MS` | `5000` | `5000` | inventory |
| `CATALOG_SERVICE_URL` | `http://localhost:3001` | `http://catalog-service:3000` | orders |
| `INVENTORY_SERVICE_URL` | `http://localhost:3002` | `http://inventory-service:3000` | orders |
| `HTTP_TIMEOUT_MS` | `3000` | `3000` | orders |

**Reglas:**
- Nunca escribir `localhost`, IPs ni puertos dentro del código: todo se lee de `process.env`.
- Nunca subir archivos `.env` reales, solo `.env.example`.
- Ojo, en el monolito las variables se llaman distinto (`PORT_HTTP`, `REDIS_HOST` + `REDIS_PORT`). En los servicios nuevos se usan los nombres de esta tabla.

### 0.5 Contrato mínimo que TODOS cumplen
- **Health:** `GET /health` responde `200 { "service": "<nombre>", "status": "ok" }`, sin datos sensibles.
- **Swagger:** en `/api-docs`.
- **Logs:** Winston con salida a **consola** (stdout), indicando `service`, `level`, endpoint y error cuando corresponda.
- **Errores:** formato `{ "error": "mensaje", "codigo": "CODIGO_OPCIONAL" }`.
- **Protocolo:** solo HTTP (la consigna no exige HTTPS entre contenedores).
- **Dockerfile:** `node:20-alpine`, `npm ci --omit=dev`, `EXPOSE 3000`, `CMD ["npm","start"]`.
- **.dockerignore:** `node_modules/`, `.env`, `*.log`, `logs/`, `.git/`, `certs/*.pfx`.

### 0.6 Contratos entre servicios (heredados del TP5)

| Servicio dueño | Endpoint | Respuestas |
|---|---|---|
| catalog-service | `GET /api/libros/:id` | `200` libro · `404` no existe |
| inventory-service | `POST /api/inventario/:libroId/descontar` — body `{ cantidad, clienteId }` | `200` descontado · `400` stock insuficiente · `404` sin registro de stock · `409` lock ocupado · `503` Redis no disponible |
| orders-service | `POST /api/ordenes` — body `{ clienteId, libroId, cantidad }` | `201` confirmada · `400` body inválido · `404` libro inexistente · `409` sin stock / concurrencia · `503` dependencia no disponible |

Todas las llamadas entre servicios propagan el header `x-request-id`.

### 0.7 Qué pasa con cada endpoint del monolito

| Endpoint de `app-base` | Nuevo dueño |
|---|---|
| `GET/POST /api/libros`, `GET/PUT/DELETE /api/libros/:id` | catalog-service (sin el campo `stock`) |
| `POST /api/libros/:id/comprar` | Se reemplaza por `POST /api/ordenes` (orders), que usa `POST /api/inventario/:libroId/descontar` (inventory) |
| `POST /api/libros/:id/reset-stock` | inventory-service → `POST /api/inventario/:libroId/reponer` |
| `GET /api/libros/:id/lock-status` | inventory-service (diagnóstico) |
| `POST /api/libros/:id/comprar-inseguro` | Se elimina (era solo demostrativo) |

---

## 👥 Tareas comunes (todos por igual)

1. **Evidencia de Docker:** captura de lo siguiente, guardada en `docs/tp6/evidencias/docker-<nombre>.png`:
   ```bash
   docker --version
   docker compose version
   docker run --rm hello-world
   ```
   Si no tienen espacio para instalar Docker, pueden usar **GitHub Codespaces**: en el repo, *Code → Codespaces → Create codespace* (ya trae Docker).
2. **README de su parte**: qué hace, cómo se ejecuta y qué variables usa.
3. **Evidencia de su propia parte**: build de la imagen, `/health` y Swagger (quien tenga servicio).
4. **PR con descripción**: qué resuelve, qué modifica y cómo se probó.
5. **Revisar el PR de un compañero, en ronda:**
   Joel → revisa a Bautista · Bautista → a Candela · Candela → a Delfina · Delfina → a Carolina · Carolina → a Joel.

---

## 👤 1. Joel Aisama (@aisamajoel-tech) — carga ~4,5
### Issue: [TP6-Catálogo] catalog-service y datos de prueba

**Rama A:** `feature/catalog-service-implementation`
1. Crear `services/catalog-service/` con la estructura de la sección 0.2.
2. Migrar desde `app-base`: `GET /api/libros`, `GET /api/libros/:id`, `POST /api/libros`, `PUT /api/libros/:id`, `DELETE /api/libros/:id`.
3. Modelo `Libro` **sin el campo `stock`** (titulo, autor, año, genero, isbn), conservando todas las validaciones bibliográficas.
4. Conexión a `MONGODB_URI`: si Mongo todavía no está disponible, loguear el error y reintentar, sin que el proceso se caiga.
5. `GET /health`, Swagger en `/api-docs` y logger con `SERVICE_NAME`.
6. `Dockerfile`, `.dockerignore`, `.env.example`, `README.md`.
7. Build: `docker build -t grupo1/catalog-service:tp6 ./services/catalog-service`.

**Rama B:** `feature/seed-data`
1. `scripts/seed/seed.js`: crea 3–5 libros llamando a `POST /api/libros` y después su stock llamando a `POST /api/inventario`. Siempre **a través de las APIs**, nunca tocando las bases directamente.
2. Las URLs se leen de `CATALOG_SERVICE_URL` e `INVENTORY_SERVICE_URL`, así funciona igual en local y en Compose.
3. `scripts/seed/README.md` con el comando para ejecutarlo.

**Al final:** cuando todos los PRs estén aprobados, mergear lo que falte y crear el tag `tp6-entrega`.

**Commits sugeridos:** `feat(catalog): implement catalog-service with own database` · `feat(seed): add reproducible test data script`

---

## 👤 2. Bautista Navarro (@BautiNavarro) — carga ~5
### Issue: [TP6-Inventario] inventory-service con Redis Lock

**Rama:** `feature/inventory-service-implementation`
1. Crear `services/inventory-service/` con la estructura de la sección 0.2.
2. Modelo `Stock` propio (`libroId`, `stockDisponible`). El `libroId` es una **referencia lógica**: se guarda el ID, pero nunca se accede a la base del catálogo.
3. Endpoints:
   * `POST /api/inventario` → crea el registro de stock de un libro.
   * `GET /api/inventario/:libroId` → consulta la disponibilidad.
   * `POST /api/inventario/:libroId/descontar` → descuenta con lock (contrato de la sección 0.6).
   * `POST /api/inventario/:libroId/reponer` → reposición (reemplaza al `reset-stock` del monolito).
   * `GET /api/inventario/:libroId/lock-status` → diagnóstico.
4. Migrar `lockService.js` usando **`REDIS_URL`** en vez de `REDIS_HOST` + `REDIS_PORT`: `SET NX PX` con `LOCK_TTL_MS` y liberación con script Lua.
5. Si Redis no está disponible, responder `503` controlado, nunca `500`.
6. `GET /health`, Swagger, logger, `Dockerfile`, `.dockerignore`, `.env.example`, `README.md`.
7. Build: `docker build -t grupo1/inventory-service:tp6 ./services/inventory-service`.

**Pruebas a cargo:**
* **Concurrencia:** adaptar `test-concurrencia.js` para que llame a `POST /api/inventario/:libroId/descontar` y demuestre que no hay sobreventa.
* **Configuración por entorno:** demostrar que el mismo código corre en local (con Memurai o Redis local y `.env` local) y en Docker Compose, cambiando **solo** variables de entorno. Evidencia en `docs/tp6/evidencias/`.

**Commit sugerido:** `feat(inventory): implement inventory-service with redis distributed lock`

---

## 👤 3. Candela Aguilar (@candeaguilar) — carga ~5
### Issue: [TP6-Órdenes] orders-service y clientes HTTP

**Rama:** `feature/orders-service-implementation`
1. Crear `services/orders-service/` con la estructura de la sección 0.2, siguiendo la spec `docs/servicios/orders-service.md`.
2. Modelo `Orden`: estados `PENDIENTE` / `CONFIRMADA` / `RECHAZADA`, más `motivoRechazo`, `libroSnapshot` y `requestId`.
3. Endpoints: `POST /api/ordenes`, `GET /api/ordenes/:id`, `GET /api/ordenes/cliente/:clienteId`.
4. **Clientes HTTP** en `src/clients/`: `catalogClient.js` e `inventoryClient.js`, con `fetch` nativo y:
   * timeout explícito (`AbortSignal.timeout(HTTP_TIMEOUT_MS)`);
   * URL base tomada de `CATALOG_SERVICE_URL` / `INVENTORY_SERVICE_URL`;
   * distinción de errores (consigna, sección 15.2): `404` → error funcional; `409` → conflicto; timeout, DNS o conexión rechazada → `503`; `5xx` remoto → log + respuesta controlada.
5. Propagar el header `x-request-id` y loguear servicio origen, dependencia y causa de cada fallo.
6. `GET /health`, Swagger, logger, `Dockerfile`, `.dockerignore`, `.env.example`, `README.md`.
7. Build: `docker build -t grupo1/orders-service:tp6 ./services/orders-service`.

**Prueba a cargo — Indisponibilidad (sección 15.1):**
levantar todo → comprar OK → `docker compose stop inventory-service` → comprar otra vez: tiene que dar `503` y orders **no** se cae → `docker compose start inventory-service` → la compra vuelve a funcionar. Comandos y capturas en `docs/tp6/evidencias/`.

**Commit sugerido:** `feat(orders): implement orders-service with resilient http clients`

---

## 👤 4. Delfina Ibáñez (@delfinaibanez) — carga ~5,5
### Issue: [TP6-Integración] Ratificación de arquitectura y Docker Compose

**Rama A:** `docs/tp6-ratificacion`
1. `docs/tp6/ratificacion-arquitectura.md` (Hito 1):
   * matriz Microservicio / Responsabilidad / Endpoints a implementar / Datos propios / Dependencias;
   * tabla de qué servicio se queda con cada endpoint del monolito (base: sección 0.7);
   * tabla de casos de uso (consigna, sección 7): Caso / Entrada / Servicio responsable / Servicios consultados / Resultado;
   * cambios respecto del TP5 y su justificación (por ejemplo, `reset-stock` → `reponer`, `comprar-inseguro` eliminado).

**Rama B:** `feature/compose-integration`
1. `docker-compose.yml` en la raíz con los 3 servicios, `catalog-db`, `inventory-db`, `orders-db` y `redis`.
2. Una red interna (`backend`) y volúmenes nombrados para cada Mongo.
3. Publicar **solo** los puertos 3001, 3002 y 3003. Las bases y Redis no se publican.
4. Healthchecks:
   * Mongo: `mongosh --eval "db.adminCommand('ping')"`;
   * Redis: `redis-cli ping`;
   * servicios Node: `node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.
5. `depends_on` con `condition: service_healthy`.
6. `.env.example` de la raíz para Compose (sin secretos).
7. Verificar con `docker compose config`, `up --build`, `ps` y `logs -f`.

**Pruebas a cargo:**
* **Persistencia (sección 13):** crear un dato → `docker compose down` → `up -d` → el dato sigue estando. Explicar la diferencia con `down -v`.
* **Logs (sección 14):** `docker compose logs <servicio>` muestra servicio, nivel, endpoint y errores.
* **Arranque y disponibilidad (sección 11.1):** los servicios esperan a que sus bases estén *healthy*.

**Commits sugeridos:** `docs(tp6): ratify architecture and endpoint ownership` · `feat(compose): integrate services, databases, redis and healthchecks`

---

## 👤 5. Carolina Fetta (@gcfetta) — carga ~5
### Issue: [TP6-Calidad] Fallo parcial, pruebas de integración y README

**Rama A:** `docs/tp6-fallo-parcial` (se puede hacer desde el día 1, es documental)
1. `docs/tp6/analisis-fallo-parcial.md` (consigna, sección 15.3), sobre el caso de compra:
   * qué servicios participan y en qué orden (orders → catalog → inventory → orders);
   * qué cambio de estado produce cada etapa;
   * qué pasa si falla cada etapa posterior a una ya confirmada (ejemplo clave: inventario descontó el stock pero orders no pudo guardar la orden como `CONFIRMADA`);
   * si el sistema puede quedar inconsistente;
   * qué información haría falta para detectarlo, recuperarlo o compensarlo (`requestId`, `ordenId`, operación de reposición, etc.).
   * Base: `docs/servicios/orders-service.md`, sección 5.4.

**Rama B:** `docs/tp6-pruebas`
1. `docs/tp6/pruebas.md`: una tabla con **todas** las pruebas de la sección 18 (comando + resultado esperado + captura), **linkeando** las que hizo cada compañero.
2. Pruebas a cargo de Carolina:
   * **CRUD / negocio:** las operaciones principales siguen funcionando después de la migración.
   * **Comunicación:** una compra en la que orders consulta a catálogo e inventario por HTTP.
   * **Propiedad de datos:** cada servicio escribe solo en su propia base (mostrar las 3 bases separadas).

**Rama C:** `docs/tp6-readme`
1. Actualizar el `README.md` principal con todos los puntos de la sección 20 de la consigna. Cada compañero le pasa la información de su parte y Caro la integra.

**Commits sugeridos:** `docs(tp6): add partial failure analysis` · `docs(tp6): add integration test evidence` · `docs(readme): document tp6 deployment and operation`

---

## 🔄 Flujo de Git
```bash
git checkout main
git pull origin main
git checkout -b <tu-rama>
# trabajar SOLO en tu carpeta, con commits chicos y frecuentes
git add .
git commit -m "<mensaje descriptivo>"
git push -u origin <tu-rama>
```
1. Abrir el PR hacia `main`, con la descripción: **qué resuelve, qué modifica y cómo se probó**.
2. Lo revisa el compañero que te toca en la ronda, que aprueba y mergea.
3. Antes de empezar algo nuevo: `git pull origin main`.
4. Mejor **varios commits chicos** que uno solo al final: la consigna evalúa los aportes de cada uno.

## ✅ Checklist final antes del tag
- [ ] Los 3 servicios corren con `npm start` (local) y con Docker Compose.
- [ ] `docker compose up --build` levanta todo con un solo comando.
- [ ] Health, Swagger y logs funcionan en los 3 servicios.
- [ ] No hay `.env` reales ni `node_modules` en Git.
- [ ] Están todas las evidencias de `docs/tp6/pruebas.md`.
- [ ] El README principal está completo.
- [ ] Todos los PRs están mergeados y `main` está probado → `git tag tp6-entrega` + `git push origin tp6-entrega`.
