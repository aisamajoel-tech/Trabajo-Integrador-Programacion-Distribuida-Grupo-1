# Especificación Técnica — `catalog-service`
**Issue #1: [Catálogo] Especificación técnica de contratos y persistencia de Libros**  
**Responsable:** Joel Aisama (@aisamajoel-tech) · **Rama:** `feature/catalog-service-spec`  
**Referencia:** `docs/arquitectura.md` — Ficha N° 1 (sección 6.1), Inventario de endpoints (sección 3) y Caso de Uso 3 (sección 9).

---

## 1. Propósito del servicio

`catalog-service` es el microservicio responsable de ser la **única fuente de verdad** sobre qué obras existen en el sistema y cómo se describen bibliográficamente. Administra el ciclo de vida editorial completo de los libros (altas, bajas, modificaciones y consultas), aislando por completo esta información de los contadores de stock y las transacciones de compra.

| Dato técnico | Valor |
|---|---|
| Puerto | `3001` |
| Base de datos | MongoDB `db_catalog` |
| Colección | `libros` |
| Rol en la arquitectura | Proveedor de datos bibliográficos (solo lectura para terceros) |
| Depende de | Ningún servicio externo ni Redis (autónomo) |
| Es invocado por | Clientes web, `orders-service` (verificación) e `inventory-service` (alta de stock) |

**Fuera de alcance:** 
* No administra existencias físicas ni saldo de unidades (responsabilidad exclusiva de `inventory-service`).
* No interactúa con Redis ni implementa locks de concurrencia.
* No gestiona órdenes de compra, pagos, clientes ni facturación (responsabilidad de `orders-service`).

---

## 2. Modelo de datos — colección `libros` (`db_catalog`)

### 2.1 Estructura del documento

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `_id` | ObjectId | Sí (auto) | Identificador único de la obra (`libroId`). |
| `titulo` | String (1 a 150 caracteres) | Sí | Título oficial de la obra. |
| `autor` | String (1 a 100 caracteres) | Sí | Nombre del autor o autores. |
| `año` | Number (entero) | Sí | Año de publicación (entre 1000 y el año actual + 1). |
| `genero` | String (enum) | Sí | Categoría bibliográfica normalizada. |
| `isbn` | String (10 o 13 dígitos) | Sí | Código normalizado internacional único (índice único). |
| `createdAt` | Date | Sí (auto) | Marca temporal de alta del registro. |
| `updatedAt` | Date | Sí (auto) | Marca temporal de última modificación editorial. |

### 2.2 Eliminación del campo `stock` y justificación de desacople

> **Decisión arquitectónica clave (Resolución de Acoplamiento N° 1):**  
> En la aplicación monolítica original (`app-base`), el modelo `Libro` contenía el atributo `stock: { type: Number, default: 0 }`. Esto provocaba que las modificaciones editoriales (un `PUT` de corrección de título) y las compras concurrentes compitieran por el mismo documento en la base de datos, además de obligar al catálogo a depender de la infraestructura de locks de Redis.
>
> En `catalog-service`:
> 1. **Se elimina completamente el campo `stock` de la colección `libros`.**
> 2. Las consultas públicas de catálogo —que representan más del 80% del tráfico del sistema— quedan 100% aisladas, sin contención de bloqueos ni sobrecarga de concurrencia.
> 3. La custodia de las unidades disponibles migra a `inventory-service` en su propia colección `stock`, vinculada únicamente a través del `libroId`.

### 2.3 Esquema de referencia (Mongoose)

```javascript
const mongoose = require('mongoose');

const generosValidos = [
  'Ficción', 
  'Novela', 
  'Historia', 
  'Ciencia', 
  'Terror', 
  'Fantasía', 
  'Otro'
];

const libroSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: [true, 'El título es obligatorio'],
    trim: true,
    minlength: [1, 'El título no puede estar vacío'],
    maxlength: [150, 'El título no puede superar los 150 caracteres']
  },
  autor: {
    type: String,
    required: [true, 'El autor es obligatorio'],
    trim: true,
    minlength: [1, 'El autor no puede estar vacío'],
    maxlength: [100, 'El autor no puede superar los 100 caracteres']
  },
  año: {
    type: Number,
    required: [true, 'El año de publicación es obligatorio'],
    validate: {
      validator: function(v) {
        return Number.isInteger(v) && v >= 1000 && v <= new Date().getFullYear() + 1;
      },
      message: props => `${props.value} no es un año de publicación válido (debe ser entre 1000 y el año actual + 1)`
    }
  },
  genero: {
    type: String,
    required: [true, 'El género es obligatorio'],
    enum: {
      values: generosValidos,
      message: '{VALUE} no es un género permitido'
    }
  },
  isbn: {
    type: String,
    required: [true, 'El ISBN es obligatorio'],
    trim: true,
    unique: true,
    match: [
      /^(?:\d{9}[\dX]|\d{13})$/,
      'El ISBN debe tener 10 o 13 dígitos numéricos válidos'
    ]
  }
}, {
  timestamps: true,
  versionKey: false
});

// Índice único sobre ISBN para garantizar integridad editorial
libroSchema.index({ isbn: 1 }, { unique: true });
// Índice por género para optimizar listados y filtros
libroSchema.index({ genero: 1 });

module.exports = mongoose.model('Libro', libroSchema);
```

### 2.4 Ejemplo de documento JSON persistido

```json
{
  "_id": "6712e8f0c3b2a9e4d1f00001",
  "titulo": "Cien años de soledad",
  "autor": "Gabriel García Márquez",
  "año": 1967,
  "genero": "Novela",
  "isbn": "9780307474728",
  "createdAt": "2026-10-15T10:14:00.000Z",
  "updatedAt": "2026-10-15T10:14:00.000Z"
}
```

---

## 3. Endpoints expuestos y Contratos DTO

### 3.1 `GET /api/libros` — Listar y filtrar obras

Devuelve el listado de libros disponibles en el catálogo, con soporte de filtrado opcional.

* **Método:** `GET`
* **Ruta:** `/api/libros`
* **Query Params opcionales:** `?genero=Novela&autor=García&limit=20&skip=0`
* **Códigos HTTP de respuesta:**
  * `200 OK`: Retorna el arreglo de obras encontradas.

**Ejemplo de respuesta (`200 OK`):**
```json
[
  {
    "id": "6712e8f0c3b2a9e4d1f00001",
    "titulo": "Cien años de soledad",
    "autor": "Gabriel García Márquez",
    "año": 1967,
    "genero": "Novela",
    "isbn": "9780307474728"
  },
  {
    "id": "6712e8f0c3b2a9e4d1f00002",
    "titulo": "El Aleph",
    "autor": "Jorge Luis Borges",
    "año": 1949,
    "genero": "Ficción",
    "isbn": "9788420633114"
  }
]
```

---

### 3.2 `GET /api/libros/:id` — Consultar ficha individual de una obra

Permite obtener el detalle bibliográfico de un libro por su identificador único.  
**Punto de integración crítico:** este endpoint es utilizado de forma síncrona por `orders-service` (para verificar existencia y tomar el `libroSnapshot`) e `inventory-service` (para validar la existencia de la obra al dar de alta el stock inicial).

* **Método:** `GET`
* **Ruta:** `/api/libros/:id`
* **Headers de entrada:** `x-request-id` (opcional, para trazabilidad distribuida).
* **Códigos HTTP de respuesta:**
  * `200 OK`: Retorna la ficha completa de la obra.
  * `400 Bad Request`: El parámetro `id` no posee un formato válido de MongoDB ObjectId.
  * `404 Not Found`: No existe ninguna obra registrada con el identificador provisto.

**Ejemplo de respuesta (`200 OK`):**
```json
{
  "id": "6712e8f0c3b2a9e4d1f00001",
  "titulo": "Cien años de soledad",
  "autor": "Gabriel García Márquez",
  "año": 1967,
  "genero": "Novela",
  "isbn": "9780307474728",
  "createdAt": "2026-10-15T10:14:00.000Z",
  "updatedAt": "2026-10-15T10:14:00.000Z"
}
```

**Ejemplo de respuesta (`404 Not Found`):**
```json
{
  "error": "Libro no encontrado",
  "mensaje": "No existe ningún libro con el identificador 6712e8f0c3b2a9e4d1f99999"
}
```

---

### 3.3 `POST /api/libros` — Alta de una nueva obra bibliográfica

Permite al administrador incorporar una nueva obra al catálogo. No recibe ni gestiona stock.

* **Método:** `POST`
* **Ruta:** `/api/libros`
* **Headers:** `Content-Type: application/json`

**DTO de entrada (Request Body):**
```json
{
  "titulo": "Rayuela",
  "autor": "Julio Cortázar",
  "año": 1963,
  "genero": "Novela",
  "isbn": "9788437604572"
}
```

* **Códigos HTTP de respuesta:**
  * `201 Created`: Obra registrada exitosamente. Retorna el objeto creado con su nuevo `id`.
  * `400 Bad Request`: Faltan campos obligatorios o no superan las validaciones de esquema (ej. año fuera de rango, género no admitido).
  * `409 Conflict`: Ya existe otra obra registrada con el mismo código ISBN.

**Ejemplo de respuesta (`201 Created`):**
```json
{
  "id": "6712e8f0c3b2a9e4d1f00003",
  "titulo": "Rayuela",
  "autor": "Julio Cortázar",
  "año": 1963,
  "genero": "Novela",
  "isbn": "9788437604572",
  "createdAt": "2026-10-22T19:00:00.000Z"
}
```

**Ejemplo de respuesta (`409 Conflict`):**
```json
{
  "error": "Conflicto de integridad",
  "mensaje": "El ISBN 9788437604572 ya se encuentra registrado para otra obra."
}
```

---

### 3.4 `PUT /api/libros/:id` — Modificación de datos bibliográficos

Permite actualizar los atributos editoriales de una obra existente.

* **Método:** `PUT`
* **Ruta:** `/api/libros/:id`
* **Regla de negocio estricta:** Si el cliente envía atributos ajenos al catálogo (como `stock`), el servicio los ignora o rechaza la solicitud. La modificación editorial no impacta sobre el inventario.
* **Códigos HTTP de respuesta:**
  * `200 OK`: Modificación aplicada exitosamente.
  * `400 Bad Request`: Datos de validación erróneos o ID mal formado.
  * `404 Not Found`: Obra inexistente.
  * `409 Conflict`: El nuevo ISBN propuesto colisiona con otra obra existente.

---

### 3.5 `DELETE /api/libros/:id` — Baja de una obra del catálogo

Elimina la ficha bibliográfica de la base de datos `db_catalog`.

* **Método:** `DELETE`
* **Ruta:** `/api/libros/:id`
* **Comportamiento ante desacoplamiento:**  
  `catalog-service` no invoca a `inventory-service` ni a `orders-service` durante el borrado. De acuerdo con el diseño arquitectónico:
  1. Si un cliente intenta comprar posteriormente una obra eliminada, `orders-service` llamará a `GET /api/libros/:id`, recibirá `404 Not Found` y rechazará la compra de inmediato bajo el motivo `LIBRO_INEXISTENTE`, protegiendo el sistema.
  2. La limpieza de remanentes en depósitos se gestiona administrativamente o mediante eventos asíncronos en etapas futuras.
* **Códigos HTTP de respuesta:**
  * `200 OK`: Obra eliminada correctamente.
  * `404 Not Found`: La obra no existía.

---

## 4. Aislamiento y Resiliencia del Servicio

1. **Autonomía Operativa:** `catalog-service` no tiene dependencias salientes hacia ningún otro microservicio. Depende únicamente de su propia base de datos MongoDB (`db_catalog`).
2. **Inmunidad ante caídas:** Si Redis / Memurai sufre una interrupción o si `inventory-service` se encuentra caído, `catalog-service` continúa respondiendo lecturas y búsquedas al 100% de su capacidad.
3. **Configuración por variables de entorno:**
```env
CATALOG_PORT=3001
MONGO_URI_CATALOG=mongodb://localhost:27017/db_catalog
LOG_LEVEL=info
```

---

## 5. Trazado de Casos de Uso Vinculados

### 5.1 Caso de Uso 3: Consulta pública de Catálogo (Lectura pura)
```
Cliente Web / Lector
       │
       │  GET /api/libros
       ▼
catalog-service ───> Consulta optimizada a db_catalog (índices por género)
       │
       ▼
Respuesta 200 OK [ { id, titulo, autor, año, genero, isbn }, ... ]
```
* **Ventaja del desacoplamiento:** No requiere interacción con locks ni verificación de stock, lo que garantiza latencias inferiores a 15 ms para el usuario final.

### 5.2 Caso de Uso 2: Alta de una obra con stock inicial (Flujo en dos pasos)
1. **Paso 1 (Administrador → `catalog-service`):**  
   `POST /api/libros` con datos bibliográficos. El servicio valida unicidad de ISBN y persiste en `db_catalog`, respondiendo `201 Created` con el nuevo `id`.
2. **Paso 2 (Administrador → `inventory-service`):**  
   `POST /api/inventario` enviando `{ libroId: id, stockInicial: 10 }`. `inventory-service` consulta a `catalog-service` (`GET /api/libros/:id`) para certificar que la obra existe y recién entonces inicializa las existencias.

---

## 6. Checklist de la Issue #1 cumplido

- [x] Contratos DTO de entrada y salida definidos para todos los endpoints (`GET /api/libros`, `GET /api/libros/:id`, `POST /api/libros`, `PUT /api/libros/:id`, `DELETE /api/libros/:id`).
- [x] Confirmación y fundamentación de la eliminación definitiva del campo `stock` en `db_catalog.libros`.
- [x] Esquema Mongoose completo con validaciones estrictas (ISBN 10/13 único, autor, título, año y género controlado).
- [x] Documentación de aislamiento operacional y respuesta ante contingencias externas.
