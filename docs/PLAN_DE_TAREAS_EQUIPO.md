# 📌 Plan de Tareas e Issues por Integrante - TP N° 5
**Programación Distribuida - Trabajo Integrador Grupo N° 1**  
**Repositorio:** [https://github.com/aisamajoel-tech/Trabajo-Integrador-Programacion-Distribuida-Grupo-1](https://github.com/aisamajoel-tech/Trabajo-Integrador-Programacion-Distribuida-Grupo-1)

Para garantizar la trazabilidad individual que exige la cátedra sin hacer el proyecto innecesariamente complejo ("lo justo y necesario"), el trabajo se divide de manera equitativa entre los **4 integrantes**:

---

## 👤 1. Joel Aisama (@aisamajoel-tech)
### Issue #1: [Catálogo] Especificación técnica de contratos y persistencia de Libros
* **Rama asignada:** `feature/catalog-service-spec`
* **Tareas a cargo:**
  1. Especificación técnica del **`catalog-service`**:
     * Definición de contratos DTO de entrada y salida para `GET /api/libros`, `GET /api/libros/:id` y `POST /api/libros`.
     * Confirmar el esquema propio en MongoDB (`db_catalog`), eliminando el campo `stock` de la colección `libros`.
     * Documentar las reglas de validación bibliográfica (ISBN, título, autor, género).
* **Comandos en Git:**
  ```bash
  git checkout main
  git pull origin main
  git checkout -b feature/catalog-service-spec
  git add .
  git commit -m "feat(catalog): specify book catalog endpoints and schema boundaries (Closes #1)"
  git push -u origin feature/catalog-service-spec
  ```

---

## 👤 2. Bautista Navarro (@BautiNavarro)
### Issue #2: [Inventario] Control de stock y exclusión mutua distribuida con Redis Lock
* **Rama asignada:** `feature/inventory-concurrency-spec`
* **Tareas a cargo:**
  1. Especificación técnica del **`inventory-service`**:
     * Definición del endpoint `POST /api/inventario/:libroId/descontar` para operaciones de compra.
     * Documentar el mecanismo de exclusión mutua con **Redis/Memurai**: clave `lock:libro:{id}`, TTL de 5000ms y script Lua de liberación atómica por token.
     * Especificar la respuesta `HTTP 409 Conflict` cuando el lock está retenido concurrentemente.
* **Comandos en Git:**
  ```bash
  git checkout main
  git pull origin main
  git checkout -b feature/inventory-concurrency-spec
  git add .
  git commit -m "feat(inventory): specify stock concurrency and redis lock mechanism (Closes #2)"
  git push -u origin feature/inventory-concurrency-spec
  ```

---

## 👤 3. Candela Aguilar (@candeaguilar)
### Issue #3: [Ventas] Servicio de Órdenes y trazado del flujo de compras
* **Rama asignada:** `feature/orders-service-spec`
* **Tareas a cargo:**
  1. Especificación técnica del **`orders-service`**:
     * Diseño del modelo de datos de la colección `ordenes` en MongoDB (`db_orders`): inmutabilidad, estados (`PENDIENTE`, `CONFIRMADA`, `RECHAZADA`).
     * Definición del endpoint `POST /api/ordenes` y sus llamadas REST salientes a catálogo e inventario.
     * Trazado del **Caso de Uso B**: flujo paso a paso de compra concurrente con validación de existencia y descuento de stock.
* **Comandos en Git:**
  ```bash
  git checkout main
  git pull origin main
  git checkout -b feature/orders-service-spec
  git add .
  git commit -m "feat(orders): specify order orchestration service and purchase flow (Closes #3)"
  git push -u origin feature/orders-service-spec
  ```

---

## 👤 4. Delfina Ibáñez (@delfinaibanez)
### Issue #4: [Arquitectura] Análisis de acoplamientos y checklist de validación de límites
* **Rama asignada:** `feature/architecture-validation`
* **Tareas a cargo:**
  1. Fundamentación y validación arquitectónica:
     * Documentar los **3 casos concretos de acoplamiento** del monolito previo y sus propuestas de desacople.
     * Elaborar la **Matriz de Propiedad de Datos** (Data Ownership: qué servicio es dueño de qué datos).
     * Completar y verificar las 9 casillas del **Checklist de validación de límites de microservicios** (Sección 12 del enunciado).
* **Comandos en Git:**
  ```bash
  git checkout main
  git pull origin main
  git checkout -b feature/architecture-validation
  git add .
  git commit -m "docs(architecture): document coupling analysis and service boundaries checklist (Closes #4)"
  git push -u origin feature/architecture-validation
  ```

---

## 🔄 Flujo de Integración y Pull Requests
1. Cada integrante sube su rama a GitHub.
2. Abre su **Pull Request** hacia `main` mencionando la Issue correspondiente (`Closes #1`, `Closes #2`, `Closes #3` o `Closes #4`).
3. Otro compañero revisa el Pull Request, deja un comentario de aprobación y realiza el **Merge**.
4. Al mergear, la Issue asignada se cierra automáticamente en GitHub.
