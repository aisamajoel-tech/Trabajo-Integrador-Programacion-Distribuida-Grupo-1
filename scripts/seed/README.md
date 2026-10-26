# 🌱 Script Reproducible de Datos de Prueba (`seed.js`)

**Responsable:** Joel Aisama (`@aisamajoel-tech`) — **Issue #11**  
**Materia:** Programación Distribuida — TP N° 6 (Grupo N° 1)

---

## 1. Propósito

Este script prepara un **estado inicial conocido y reproducible** de 5 obras literarias y su respectivo stock inicial para ejecutar las pruebas obligatorias del TP6 (CRUD, concurrencia, compras e indisponibilidad).

Siguiendo la regla de **Propiedad de Datos** (Sección 8 de la consigna):
1. Nunca se conecta directamente a MongoDB (`db_catalog` ni `db_inventory`).
2. Da de alta las fichas bibliográficas invocando `POST /api/libros` en `catalog-service`.
3. Obtiene el `libroId` generado y registra las existencias invocando `POST /api/inventario` en `inventory-service`.
4. Es **idempotente**: si las obras ya existen por ISBN, recupera su `id` sin duplicar registros.

---

## 2. Obras Cargadas

| Título | Autor | Año | Género | ISBN | Stock Inicial |
| :--- | :--- | :---: | :---: | :---: | :---: |
| *Cien años de soledad* | Gabriel García Márquez | 1967 | Novela | `978-0307474728` | **1** (ideal para test de concurrencia) |
| *Don Quijote de la Mancha* | Miguel de Cervantes | 1605 | Novela | `978-8424115104` | **5** |
| *1984* | George Orwell | 1949 | Ficción | `978-0451524935` | **2** |
| *Rayuela* | Julio Cortázar | 1963 | Novela | `978-8437604572` | **4** |
| *El Aleph* | Jorge Luis Borges | 1949 | Ficción | `978-8420633114` | **3** |

---

## 3. Variables de Entorno

| Variable | Valor por defecto | Descripción |
| :--- | :--- | :--- |
| `CATALOG_SERVICE_URL` | `http://localhost:3001` | URL base del microservicio de catálogo |
| `INVENTORY_SERVICE_URL` | `http://localhost:3002` | URL base del microservicio de inventario |
| `HTTP_TIMEOUT_MS` | `5000` | Timeout por petición HTTP en milisegundos |

---

## 4. Cómo Ejecutarlo

### A. Desde el Host (con servicios corriendo en local o publicados por Docker Compose)
```bash
node scripts/seed/seed.js
```

### B. Personalizando las URLs de destino
```bash
# PowerShell
$env:CATALOG_SERVICE_URL="http://localhost:3001"; $env:INVENTORY_SERVICE_URL="http://localhost:3002"; node scripts/seed/seed.js

# Bash / Linux
CATALOG_SERVICE_URL=http://localhost:3001 INVENTORY_SERVICE_URL=http://localhost:3002 node scripts/seed/seed.js
```
