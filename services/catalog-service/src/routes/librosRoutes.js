const express = require('express');
const router = express.Router();
const librosController = require('../controllers/librosController');
const { autenticarJWT, requerirRol } = require('../middlewares/authMiddleware');

/**
 * @openapi
 * /api/libros:
 *   get:
 *     summary: Listar y filtrar obras del catálogo (Público)
 *     description: Retorna la lista de libros registrados en db_catalog (sin datos de stock). Acceso público.
 *     tags:
 *       - Catálogo Bibliográfico
 *     parameters:
 *       - in: query
 *         name: genero
 *         schema:
 *           type: string
 *         description: Filtrar por género literario
 *       - in: query
 *         name: autor
 *         schema:
 *           type: string
 *         description: Filtrar por coincidencia parcial en autor
 *     responses:
 *       200:
 *         description: Lista de libros obtenida exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Libro'
 *       503:
 *         description: Base de datos de catálogo no disponible.
 */
router.get('/', librosController.getLibros);

/**
 * @openapi
 * /api/libros/{id}:
 *   get:
 *     summary: Consultar ficha bibliográfica de un libro por ID (Público)
 *     description: Endpoint público utilizado por clientes, orders-service e inventory-service.
 *     tags:
 *       - Catálogo Bibliográfico
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId del libro
 *     responses:
 *       200:
 *         description: Libro encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Libro'
 *       400:
 *         description: Formato de ObjectId inválido.
 *       404:
 *         description: Libro inexistente.
 */
router.get('/:id', librosController.getLibroById);

/**
 * @openapi
 * /api/libros:
 *   post:
 *     summary: Dar de alta una nueva obra en el catálogo (Restringido a rol ADMIN)
 *     description: >
 *       Registra los metadatos bibliográficos aplicando validaciones de esquema e ISBN único.
 *       Requiere un access token JWT válido con rol `ADMIN`.
 *     tags:
 *       - Catálogo Bibliográfico
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LibroInput'
 *     responses:
 *       201:
 *         description: Obra creada exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Libro'
 *       400:
 *         description: Datos de entrada inválidos.
 *       401:
 *         description: Token ausente, mal formado, inválido o vencido (`TOKEN_NO_PROPORCIONADO` / `TOKEN_INVALIDO` / `TOKEN_VENCIDO`).
 *       403:
 *         description: Permisos insuficientes (requiere rol `ADMIN`).
 *       409:
 *         description: Conflicto de integridad (ISBN duplicado).
 */
router.post('/', autenticarJWT, requerirRol('ADMIN'), librosController.createLibro);

/**
 * @openapi
 * /api/libros/{id}:
 *   put:
 *     summary: Modificar datos editoriales de una obra (Restringido a rol ADMIN)
 *     description: Actualiza los metadatos bibliográficos de un libro existente. Requiere rol `ADMIN`.
 *     tags:
 *       - Catálogo Bibliográfico
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LibroInput'
 *     responses:
 *       200:
 *         description: Obra actualizada exitosamente.
 *       400:
 *         description: Datos o ID inválidos.
 *       401:
 *         description: Token ausente, inválido o vencido.
 *       403:
 *         description: Permisos insuficientes (requiere rol `ADMIN`).
 *       404:
 *         description: Obra no encontrada.
 *       409:
 *         description: ISBN duplicado.
 */
router.put('/:id', autenticarJWT, requerirRol('ADMIN'), librosController.updateLibro);

/**
 * @openapi
 * /api/libros/{id}:
 *   delete:
 *     summary: Dar de baja una obra del catálogo (Restringido a rol ADMIN)
 *     description: Elimina la ficha bibliográfica de db_catalog. Exclusivo para rol `ADMIN`.
 *     tags:
 *       - Catálogo Bibliográfico
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Obra eliminada correctamente.
 *       400:
 *         description: Formato de ID inválido.
 *       401:
 *         description: Token ausente, inválido o vencido.
 *       403:
 *         description: Permisos insuficientes (requiere rol `ADMIN`).
 *       404:
 *         description: Obra inexistente.
 */
router.delete('/:id', autenticarJWT, requerirRol('ADMIN'), librosController.deleteLibro);

module.exports = router;
