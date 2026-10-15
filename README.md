# Programación Distribuida - Trabajo Integrador
**Universidad Champagnat - Licenciatura en Sistemas de Información**

Repositorio único y evolutivo para los Trabajos Prácticos de la cátedra de Programación Distribuida.

---

## 📂 Estructura del Repositorio

* **`docs/`**: Contiene la documentación arquitectónica y de diseño del sistema.
  * **[`docs/arquitectura.md`](docs/arquitectura.md)**: Documento maestro del **TP N° 5: De API REST a Microservicios** (inventario funcional, análisis de acoplamientos, fichas de microservicios, propiedad de datos, matrices de comunicación y trazado de casos de uso).
  * **[`docs/diagrama-arquitectura.mermaid`](docs/diagrama-arquitectura.mermaid)**: Diagrama de arquitectura en formato editable.
* **`app-base/`**: Aplicación de partida funcional (API REST monolítica desarrollada en Node.js, Express, MongoDB, Redis, Winston y HTTPS).
* **`.gitignore`**: Reglas de exclusión de dependencias (`node_modules`), logs, claves privadas y variables sensibles.
* **`.env.example`**: Archivo de ejemplo con variables de entorno para inicializar el proyecto.

---

## 👥 Integrantes del Grupo
* **Aisama Joel** (DNI: 44.537.211)
* [Completar Nombre y Apellido]
* [Completar Nombre y Apellido]

### Docentes Colaboradores
* Prof. Adriel Álvarez (`alvarezadriel@uch.edu.ar`)
* Prof. Edgardo Cortez (`cortezedgardo@uch.edu.ar`)

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

Este repositorio utiliza el flujo de ramas temáticas y Pull Requests:
1. `feature/*`: Desarrollo de nuevas capacidades y servicios.
2. `docs/*`: Documentación técnica y diagramas.
3. `main`: Rama estable que contiene las entregas validadas.

### Marcado de Entrega (TP5)
Una vez integrado el trabajo en `main`, la entrega queda identificada con su respectivo tag:
```bash
git tag tp5-entrega
git push origin tp5-entrega
```
