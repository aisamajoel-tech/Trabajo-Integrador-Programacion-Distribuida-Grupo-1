# Especificación Técnica — Acoplamientos, Propiedad de Datos y Validación de Límites
**Issue #4: [Arquitectura] Matriz de acoplamientos y checklist de validación de límites**  
**Responsable:** Delfina Ibáñez (@delfinaibanez) · **Rama:** `feature/architecture-validation`  
**Referencia:** `docs/arquitectura.md` — Secciones 5, 7 y 11.

---

## 1. Justificación y Análisis de Acoplamientos del Monolito

El análisis de la aplicación base (`app-base`) reveló tres formas críticas de acoplamiento que impedían su escalabilidad, mantenibilidad e independencia de despliegue.

### Caso 1: Acoplamiento de Esquema de Datos (Catálogo e Inventario fusionados)
* **Situación en el monolito (`app-base/models/Libro.js`):** El esquema Mongoose unificaba los metadatos bibliográficos (`titulo`, `autor`, `año`, `isbn`) con el contador de existencias (`stock: { type: Number, default: 0 }`).
* **Problema:** Cada operación de compra competía a nivel de documento de base de datos con las operaciones editoriales. Un bibliotecario modificando una fe de erratas en el título podía sufrir contención por bloqueos derivados de compras concurrentes.
* **Resolución implementada:** Se dividió en dos modelos independientes con patrón *Database per Service*:
  * `catalog-service` custodia la colección `libros` en `db_catalog` sin ningún campo de stock.
  * `inventory-service` custodia la colección `stock` en `db_inventory` indexada por `libroId`.
  * La vinculación entre ambos es exclusivamente a través del identificador público de la obra.

### Caso 2: Ausencia de Dominio de Órdenes y Mutación Invasiva
* **Situación en el monolito (`app-base/routes/libros.js`):** La compra se resolvía en `POST /api/libros/:id/comprar`, restando directamente el stock del libro y respondiendo un mensaje plano sin emitir comprobante.
* **Problema:** Inexistencia de trazabilidad comercial, imposibilidad de auditoría y mezcla de responsabilidades en la entidad libro.
* **Resolución implementada:** Se creó `orders-service` elevando la compra a una entidad de primer orden (`db_orders.ordenes`). El servicio orquesta la validación bibliográfica y el descuento de existencias mediante llamadas HTTP REST síncronas, registrando estados (`PENDIENTE`, `CONFIRMADA`, `RECHAZADA`) e inmutabilidad comercial.

### Caso 3: Acoplamiento de Disponibilidad de Infraestructura (MongoDB y Redis)
* **Situación en el monolito (`app-base/index.js` y `routes/libros.js`):** El proceso Node.js único inicializaba conexiones tanto a MongoDB como a Redis (`lockService.js`), requiriendo que ambas estuvieran operativas.
* **Problema:** Una caída temporal de Redis degradaba la disponibilidad de todo el servidor, incluyendo la consulta pública de catálogo (`GET /api/libros`), que no requiere Redis en absoluto.
* **Resolución implementada:** Confinamiento estricto de Redis / Memurai al interior de `inventory-service`. `catalog-service` no conoce Redis, asegurando disponibilidad del 100% para lectores incluso ante contingencias en el almacenamiento en memoria.

---

## 2. Matriz de Propiedad de Datos (Data Ownership)

Bajo el principio de que **ningún servicio accede directamente a la base de datos de otro**, se define la siguiente matriz de responsabilidades:

| Dato / Recurso | Microservicio Propietario | Consultores Autorizados | Modificadores Autorizados | Interfaz de Acceso |
|---|---|---|---|---|
| **Metadatos Bibliográficos** (`titulo`, `autor`, `año`, `isbn`, `genero`) | `catalog-service` | Clientes públicos, `orders-service`, `inventory-service` | Exclusivamente Administrador vía `catalog-service` | `GET /api/libros[/:id]` |
| **Existencias de Stock** (`stockDisponible`) | `inventory-service` | Clientes públicos, `orders-service` | Exclusivamente `inventory-service` | `POST /api/inventario/:libroId/descontar` |
| **Claves de Lock** (`lock:libro:{id}`) | `inventory-service` | `inventory-service` (diagnóstico interno) | Exclusivamente script Lua interno de `inventory-service` | Cliente nativo Redis con TTL de 5000ms |
| **Órdenes de Compra** (`ordenId`, `clienteId`, `estado`, `snapshot`) | `orders-service` | Cliente emisor, personal de auditoría | Exclusivamente `orders-service` (solo en estado `PENDIENTE`) | `GET /api/ordenes[/:id]` |

---

## 3. Checklist de Validación de Límites Arquitectónicos

Revisión formal de los 9 criterios de delimitación establecidos en la Sección 12 de las consignas:

1. **Responsabilidad explicable en una frase:**
   * `catalog-service`: Expone qué obras existen y sus características bibliográficas.
   * `inventory-service`: Custodia cuántas unidades hay de cada obra y previene la sobreventa.
   * `orders-service`: Orquesta la venta y emite un comprobante inmutable con su resultado.
2. **Agrupación de reglas de negocio cohesivas:** Validaciones editoriales en catálogo; exclusión mutua y saldos no negativos en inventario; transiciones de estados y snapshots en órdenes.
3. **Persistencia y decisiones propias:** Bases lógicas independientes (`db_catalog`, `db_inventory`, `db_orders`) y gestión aislada de locks en Redis.
4. **Justificación por dominio y no por tabla preexistente:** La separación surge de la necesidad funcional de desacoplar lectores, depósitos y compradores.
5. **Interfaz pública encapsulada:** Los contratos intercambian DTOs en formato JSON sin exponer detalles tecnológicos (Mongoose, Redis, Memurai).
6. **Evolución independiente:** El mecanismo de lock en inventario puede migrar a Redlock multinodo sin requerir modificaciones en catálogo ni en órdenes.
7. **No duplicación de reglas:** Solo inventario sabe y dictamina si hay stock; catálogo e interpretadores solo leen sus códigos HTTP.
8. **Dependencias unidireccionales y justificadas:** `catalog-service` no depende de nadie; `inventory-service` solo valida el libro al crearse; `orders-service` orquesta a ambos.
9. **Límites claros y explícitos:** Cada servicio cuenta con un apartado "Fuera de Alcance" en su especificación técnica.

---

## 4. Checklist de la Issue #4 cumplido

- [x] Fundamentación técnica profunda de los 3 casos de acoplamiento resueltos.
- [x] Elaboración de la Matriz de Propiedad de Datos con reglas de acceso estricto.
- [x] Validación y justificación de los 9 puntos del checklist de límites arquitectónicos.
