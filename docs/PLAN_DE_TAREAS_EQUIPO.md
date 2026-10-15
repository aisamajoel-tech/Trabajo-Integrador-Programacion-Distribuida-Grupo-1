# 📌 Plan de División de Tareas y Ramas - TP N° 5
**Programación Distribuida - Trabajo Integrador**

Para cumplir con el requerimiento de trazabilidad individual y trabajo colaborativo sin conflictos ni pisarse, el trabajo se divide en dos grandes frentes de responsabilidad técnica:

---

## 👤 Integrante 1: Joel Aisama
### Responsabilidad: Dominios de Catálogo y Órdenes de Compra

* **Rama de trabajo:** `feature/catalog-and-orders-spec`
* **Módulos asignados:**
  1. Especificación del **`catalog-service`**:
     * Definición de contratos DTO de entrada y salida para `GET /api/libros`, `POST /api/libros`, etc.
     * Esquema de persistencia propio en MongoDB (`db_catalog`).
  2. Especificación del **`orders-service`**:
     * Diseño del contrato del endpoint de orquestación `POST /api/ordenes`.
     * Modelo de datos inmutable de la orden (`ordenId`, `clienteId`, `libroId`, `cantidad`, `estado`).
  3. Trazado del flujo del **Caso de Uso B**:
     * Diagramación de la secuencia de compra desde el cliente hacia `orders-service` y llamadas REST.

### Comandos de ejecución para Joel:
```bash
# 1. Crear y cambiarse a su rama
git checkout main
git pull origin main
git checkout -b feature/catalog-and-orders-spec

# 2. Realizar sus aportes o revisiones en los archivos correspondientes
# 3. Guardar cambios y subir a GitHub
git add .
git commit -m "feat(catalog,orders): refine service contracts and order orchestration flow"
git push -u origin feature/catalog-and-orders-spec
```
*Luego, Joel abre el Pull Request en GitHub y solicita la revisión de Bautista.*

---

## 👤 Integrante 2: Bautista Navarro
### Responsabilidad: Dominio de Inventario, Concurrencia y Resiliencia

* **Rama de trabajo:** `feature/inventory-and-concurrency-spec`
* **Módulos asignados:**
  1. Especificación del **`inventory-service`**:
     * Definición del endpoint `POST /api/inventario/:libroId/descontar`.
     * Integración del mecanismo de exclusión mutua distribuida con Redis/Memurai (clave `lock:libro:{id}`, TTL 5000ms y script Lua).
  2. Análisis de Acoplamientos y Checklist:
     * Fundamentación técnica de los 3 casos de acoplamiento resueltos.
     * Completado y validación de las 9 casillas del Checklist de límites arquitectónicos (Sección 12).
  3. Matriz de Propiedad de Datos:
     * Especificación de reglas de acceso a las existencias de stock y claves de lock.

### Comandos de ejecución para Bautista:
```bash
# 1. Traer los cambios actualizados del repo
git checkout main
git pull origin main

# 2. Crear y cambiarse a su rama
git checkout -b feature/inventory-and-concurrency-spec

# 3. Realizar sus aportes o revisiones
# 4. Guardar cambios y subir a GitHub
git add .
git commit -m "feat(inventory): specify stock concurrency lock and data ownership matrix"
git push -u origin feature/inventory-and-concurrency-spec
```
*Luego, Bautista abre el Pull Request en GitHub y solicita la revisión de Joel.*

---

## 🔄 Flujo de Revisión Cruzada (Code Review)
1. **Bautista revisa el PR de Joel:** Entra al PR de Joel, deja un comentario de aprobación (ej: *"Revisado y aprobado el contrato de órdenes y catálogo"*) y hace el merge a `main`.
2. **Joel revisa el PR de Bautista:** Entra al PR de Bautista, deja un comentario de aprobación (ej: *"Revisada la especificación de exclusión mutua con Redis y matriz de stock"*) y hace el merge a `main`.

---

## 🏷️ Cierre y Tag Final de Entrega
Una vez que ambos Pull Requests estén integrados en `main`:
```bash
git checkout main
git pull origin main
git tag -a tp5-entrega-final -m "Entrega final TP5 completada por ambos integrantes"
git push origin tp5-entrega-final
```
