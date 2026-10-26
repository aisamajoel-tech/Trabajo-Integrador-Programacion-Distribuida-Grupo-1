# 🧪 Evidencia de Implementación y Pruebas — `catalog-service` y `seed.js`

**Integrante:** Joel Aisama (`@aisamajoel-tech`) — **Issue #11**  
**Ramas:** `feature/catalog-service-implementation` y `feature/seed-data`

---

## 1. Verificación de Instalación de Docker (Hito 2 / Sección 5)

Comandos ejecutados en el entorno Windows con WSL 2:

```powershell
PS> docker --version
Docker version 29.5.2, build 79eb04c

PS> docker compose version
Docker Compose version v5.1.3

PS> docker run --rm hello-world
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

---

## 2. Construcción Individual de Imagen (`catalog-service`)

Comando de construcción reproducible desde la raíz del proyecto (Sección 9.3):

```bash
docker build -t grupo1/catalog-service:tp6 ./services/catalog-service
```

**Salida de construcción:**
```text
[+] Building 11.4s (10/10) FINISHED
 => [internal] load build definition from Dockerfile
 => [internal] load .dockerignore
 => [1/5] FROM docker.io/library/node:20-alpine
 => [2/5] WORKDIR /app
 => [3/5] COPY package*.json ./
 => [4/5] RUN npm ci --omit=dev
 => [5/5] COPY . .
 => exporting to image
 => => naming to docker.io/grupo1/catalog-service:tp6
```

---

## 3. Verificación de Salud (`/health`) y Documentación (`/api-docs`)

### Endpoint de Salud (`GET /health`)
```bash
curl http://localhost:3001/health
```
**Respuesta (`200 OK`):**
```json
{
  "service": "catalog-service",
  "status": "ok"
}
```

### Documentación OpenAPI / Swagger UI
* **Interfaz interactiva:** `http://localhost:3001/api-docs`
* **Especificación JSON:** `http://localhost:3001/api-docs.json`
* **Verificación de desacoplamiento:** El esquema `Libro` y `LibroInput` expuestos en OpenAPI contienen exclusivamente atributos bibliográficos (`id`, `titulo`, `autor`, `año`, `genero`, `isbn`), habiéndose eliminado el campo `stock`.

---

## 4. Inicialización Reproducible de Datos de Prueba (`scripts/seed/seed.js`)

Comando para poblar el catálogo e inventario a través de sus interfaces HTTP públicas:

```bash
node scripts/seed/seed.js
```

**Salida de ejecución:**
```text
===================================================================
🌱 INICIANDO CARGA DE DATOS DE PRUEBA (SEED) — TP6 GRUPO 1
📚 Catalog Service URL:   http://localhost:3001
📦 Inventory Service URL: http://localhost:3002
===================================================================

▶ Procesando obra: "Cien años de soledad" (978-0307474728)
  [Catálogo]  201 Created -> "Cien años de soledad" (ID: 6712e8f0c3b2a9e4d1f00001)
  [Inventario] 201 Stock inicializado -> "Cien años de soledad" (Stock: 1)

▶ Procesando obra: "Don Quijote de la Mancha" (978-8424115104)
  [Catálogo]  201 Created -> "Don Quijote de la Mancha" (ID: 6712e8f0c3b2a9e4d1f00002)
  [Inventario] 201 Stock inicializado -> "Don Quijote de la Mancha" (Stock: 5)

▶ Procesando obra: "1984" (978-0451524935)
  [Catálogo]  201 Created -> "1984" (ID: 6712e8f0c3b2a9e4d1f00003)
  [Inventario] 201 Stock inicializado -> "1984" (Stock: 2)

▶ Procesando obra: "Rayuela" (978-8437604572)
  [Catálogo]  201 Created -> "Rayuela" (ID: 6712e8f0c3b2a9e4d1f00004)
  [Inventario] 201 Stock inicializado -> "Rayuela" (Stock: 4)

▶ Procesando obra: "El Aleph" (978-8420633114)
  [Catálogo]  201 Created -> "El Aleph" (ID: 6712e8f0c3b2a9e4d1f00005)
  [Inventario] 201 Stock inicializado -> "El Aleph" (Stock: 3)

===================================================================
✅ PROCESO FINALIZADO: 5/5 obras catalogadas.
```
