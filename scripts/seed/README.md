# 🌱 Script Reproducible de Datos de Prueba (`seed.js`) — TP6 / TP7

**Responsable:** Joel Aisama (`@aisamajoel-tech`) — **Issues #11 y #26**

---

## 1. Propósito y Flujo con Autenticación JWT (TP7)

Prepara un **estado inicial conocido y reproducible** de usuarios (`ADMIN` y `USER`), 5 obras literarias y su respectivo stock inicial a través de las APIs HTTP públicas de los microservicios:

1. **Autenticación y Usuarios de Prueba (`auth-service`):**
   * Inicia sesión con el administrador inicial (`admin@libreria.com` / `Admin1234!`) en `POST /api/auth/login` para obtener un JWT con rol `ADMIN`.
   * Registra de forma idempotente el usuario cliente de prueba (`cliente@libreria.com` / `Cliente123!`, rol `USER`) en `POST /api/auth/register`.
2. **Carga de Catálogo (`catalog-service`):**
   * Invoca `POST /api/libros` enviando `Authorization: Bearer <token_admin>`.
3. **Carga de Inventario (`inventory-service`):**
   * Invoca `POST /api/inventario` (o `/reponer` si ya existía) enviando `Authorization: Bearer <token_admin>`.

---

## 2. Credenciales de Prueba Disponibles tras el Seed

| Rol | Email | Contraseña (desarrollo) | Permisos |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | `admin@libreria.com` | `Admin1234!` | Alta/edición/baja de libros, alta/reposición de stock, consulta global de órdenes |
| **`USER`** | `cliente@libreria.com` | `Cliente123!` | Consulta pública, compra de libros (`POST /api/ordenes`) y consulta de sus propias órdenes |

---

## 3. Ejecución

```bash
node scripts/seed/seed.js
```
