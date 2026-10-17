# Programación Distribuida - Trabajo Práctico Integrador
**Universidad Champagnat - Licenciatura en Sistemas de Información**  
**Grupo N° 1**

Repositorio único y evolutivo para los Trabajos Prácticos de la cátedra de Programación Distribuida.

---

## 👥 Integrantes del Grupo 1
* **Joel Aisama**  - GitHub: [@aisamajoel-tech](https://github.com/aisamajoel-tech)
* **Bautista Navarro**  - GitHub: [@BautiNavarro](https://github.com/BautiNavarro)
* **Candela Aguilar** - GitHub: [@candeaguilar](https://github.com/candeaguilar)
* **Delfina Ibáñez** - GitHub: [@delfinaibanez](https://github.com/delfinaibanez)

### Docentes Colaboradores
* Prof. Adriel Álvarez (`alvarezadriel@uch.edu.ar`)
* Prof. Edgardo Cortez (`cortezedgardo@uch.edu.ar`)

---

## 📂 Estructura del Repositorio

* **`docs/`**: Contiene la documentación arquitectónica y de diseño del sistema.
  * **[`docs/arquitectura.md`](docs/arquitectura.md)**: **Documento maestro de entrega del TP N° 5: De API REST a Microservicios** (inventario funcional, análisis de acoplamientos, fichas de 3 microservicios, propiedad de datos, matrices de comunicación HTTP y trazado de casos de uso).
  * **[`docs/diagrama-arquitectura.mermaid`](docs/diagrama-arquitectura.mermaid)**: Diagrama de arquitectura en formato editable.
  * **[`docs/PLAN_DE_TAREAS_EQUIPO.md`](docs/PLAN_DE_TAREAS_EQUIPO.md)**: Reparto de tareas e Issues para los 4 integrantes.
* **`app-base/`**: Aplicación de partida funcional (API REST monolítica desarrollada en Node.js, Express, MongoDB, Redis Lock, Winston y HTTPS).
* **`.gitignore`**: Reglas de exclusión de dependencias (`node_modules`), logs, claves privadas y variables sensibles.
* **`.env.example`**: Archivo de ejemplo con variables de entorno para inicializar el proyecto.

---

## 🚀 Puesta en Marcha de la Aplicación Base (`app-base`)

La versión de partida permite verificar el estado conocido del sistema sobre el cual se basa la migración a microservicios.

### Requisitos Previos
* Node.js LTS (v18 o superior) y npm.
* MongoDB en ejecución en el puerto `27017`.
* Redis o Memurai en ejecución en el puerto `6379`.

### Pasos de Instalación
```bash
# 1. Ingresar a la carpeta de la aplicación base
cd app-base

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env

# 4. Iniciar el servidor
npm start
```

### Endpoints Principales
* **Catálogo de Libros (HTTP):** `http://localhost:3000/api/libros`
* **Documentación OpenAPI / Swagger:** `http://localhost:3000/api-docs`
* **Acceso Seguro (HTTPS):** `https://localhost:3443/api/libros`
* **Prueba de Concurrencia y Lock Distribuido:**
  ```bash
  npm run test:concurrencia
  ```

---

## 🌿 Flujo de Trabajo con Git y Entregas

Este repositorio utiliza el flujo de ramas temáticas, Issues y Pull Requests:
1. `feature/*`: Desarrollo de nuevas capacidades y contratos de servicios.
2. `docs/*`: Documentación técnica y diagramas.
3. `main`: Rama estable que contiene las entregas validadas.

### Marcado de Entrega (TP5)
La versión aprobada correspondiente al TP5 se encuentra identificada con su respectivo tag:
```bash
git tag tp5-entrega
git push origin tp5-entrega
```
