# 📋 Guía de Trabajo y Entrega - TP N° 5: De API REST a Microservicios
**Licenciatura en Sistemas de Información - Programación Distribuida (Universidad Champagnat)**

---

## 💡 ¿De qué se trata este TP5? (Objetivo para el grupo)
En este TP **no tenemos que programar los microservicios desde cero todavía**. La consigna es de **diseño arquitectónico y flujo colaborativo con Git**:
1. Diseñar cómo vamos a dividir nuestra API previa de libros en **3 microservicios** (`catalog-service`, `inventory-service` y `orders-service`).
2. Documentar las responsabilidades, los acoplamientos actuales, las matrices de datos y las comunicaciones entre servicios.
3. Armar el **repositorio único en GitHub/GitLab** que usaremos para este TP y los siguientes, demostrando trabajo en ramas, commits claros y al menos un Pull Request.

---

## ✅ ¿Qué ya tenemos listo en esta carpeta?
Todo el trabajo técnico y documental ya fue generado:
* **`app-base/`**: Contiene la aplicación funcional monolítica previa (Node.js, Express, MongoDB, Redis Lock, Winston, HTTPS) limpia y sin archivos pesados (`node_modules`) ni credenciales.
* **`docs/arquitectura.md`**: Es el **documento maestro de 43 KB** que responde los 16 puntos solicitados por la cátedra (inventario de endpoints, respuestas a las 8 preguntas funcionales, los 3 acoplamientos, fichas técnicas completas de los 3 microservicios, matrices de propiedad de datos, matrices HTTP, trazado de casos de uso y checklist).
* **`docs/diagrama-arquitectura.mermaid`**: El diagrama visual de la arquitectura propuesta.
* **`.gitignore` y `.env.example`**: Configuración para no subir archivos sensibles.
* **`README.md`**: Portada oficial del proyecto.

---

## 🛠️ Tareas que tenemos que hacer entre nosotros (Paso a Paso)

### 📌 Paso 1: Crear el Repositorio Remoto en GitHub o GitLab
1. Un integrante del grupo entra a GitHub (o GitLab) y crea un repositorio nuevo llamado, por ejemplo:  
   `programacion-distribuida-tp-integrador` (público o privado).
2. **IMPORTANTE:** Agregar a los dos profesores como colaboradores con rol de lectura/escritura:
   * `alvarezadriel@uch.edu.ar`
   * `cortezedgardo@uch.edu.ar`
3. Invitar a todos los compañeros del grupo como colaboradores.

---

### 📌 Paso 2: Subir el Proyecto Base a la rama `main`
El que creó el repositorio abre una terminal en la carpeta `TRABAJO INTEGRADOR` y ejecuta:

```bash
# 1. Inicializar Git y configurar rama main
git init
git branch -M main

# 2. Vincular el repositorio remoto de GitHub (reemplazar la URL por la de su repo)
git remote add origin https://github.com/aisamajoel-tech/Trabajo-Integrador-Programacion-Distribuida-Grupo-1.git

# 3. Guardar y subir la versión base inicial
git add .
git commit -m "Add initial shared repository with base app and TP5 architecture docs"
git push -u origin main
```

---

### 📌 Paso 3: Configuración de los demás integrantes
Cada integrante clona el repositorio en su computadora y configura su identidad real de Git para que los commits queden a su nombre:

```bash
# Clonar el proyecto
git clone https://github.com/aisamajoel-tech/Trabajo-Integrador-Programacion-Distribuida-Grupo-1.git
cd programacion-distribuida-tp-integrador

# Configurar nombre y correo institucional/real
git config --global user.name "Nombre Apellido"
git config --global user.email "tu-correo@ejemplo.com"
```

---

### 📌 Paso 4: Evidenciar el Trabajo en Ramas y Pull Request (Requisito de la Cátedra)
Para demostrar que trabajamos en equipo y no todo directo a `main`:

1. **Uno de los compañeros crea una rama:**
   ```bash
   git checkout -b docs/completar-integrantes
   ```
2. **Abre los archivos `README.md` y `docs/arquitectura.md`** y completa los nombres, DNIs y correos de todos los integrantes del grupo en la carátula.
3. **Hace el commit y lo sube:**
   ```bash
   git add README.md docs/arquitectura.md
   git commit -m "Update group members information in architecture document"
   git push origin docs/completar-integrantes
   ```
4. **Crear el Pull Request en GitHub:**
   * Entran a la página del repositorio en GitHub.
   * Hacen clic en **Compare & pull request**.
   * Le ponen un título claro (ej: *"Completar datos de integrantes y carátula del TP5"*).
   * En la descripción explican brevemente qué se modificó.
   * Otro integrante del grupo revisa el PR y hace clic en **Merge pull request** para integrarlo a `main`.

---

### 📌 Paso 5: Crear el Tag de Entrega (`tp5-entrega`)
Una vez que el Pull Request fue mergeado a `main`:

```bash
# Volver a la rama main y actualizar los cambios integrados
git checkout main
git pull origin main

# Crear la etiqueta oficial de entrega
git tag tp5-entrega

# Subir la etiqueta a GitHub
git push origin tp5-entrega
```

---

### 📌 Paso 6: Verificación de que la Aplicación Base Funciona
Cualquiera puede probar que la aplicación base arranca sin problemas:

1. Abrir una terminal dentro de `app-base`:
   ```bash
   cd app-base
   npm install
   cp .env.example .env
   npm start
   ```
2. Entrar al navegador a:
   * Catálogo: `http://localhost:3000/api/libros`
   * Swagger: `http://localhost:3000/api-docs`
3. Si tienen Redis corriendo (o Memurai), probar la concurrencia:
   ```bash
   npm run test:concurrencia
   ```

---

## 📦 Lista de Entregables para Enviar a los Profesores
Cuando la cátedra pida el link o el informe:
1. **URL del Repositorio:** `https://github.com/...`
2. **Tag de Entrega:** `tp5-entrega`
3. **Documentación:** Mostrarles el archivo `docs/arquitectura.md` del repositorio.
4. **Docentes invitados:** Confirmar que les haya llegado la invitación a `alvarezadriel@uch.edu.ar` y `cortezedgardo@uch.edu.ar`.
