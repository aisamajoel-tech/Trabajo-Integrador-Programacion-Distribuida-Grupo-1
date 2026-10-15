const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Libro = require('../models/Libro');
const lockService = require('../services/lockService');
const logger = require('../utils/logger');

// Función auxiliar para retardo artificial
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Valida si un string es un ObjectId válido de MongoDB
 */
function validarObjectId(id, res) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    logger.warn(`Formato de ID inválido recibido: "${id}"`);
    res.status(400).json({
      error: 'Identificador inválido. Debe ser un ObjectId válido de MongoDB (24 caracteres hexadecimales).'
    });
    return false;
  }
  return true;
}

// ==========================================
// 1. ENDPOINTS CRUD CON MONGODB Y MONGOOSE
// ==========================================

/**
 * @openapi
 * /api/libros:
 *   get:
 *     summary: Obtener todos los libros
 *     description: Retorna la lista completa de libros almacenados en MongoDB.
 *     tags:
 *       - Libros (CRUD)
 *     responses:
 *       200:
 *         description: Lista de libros obtenida exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Libro'
 *       500:
 *         description: Error interno del servidor o de persistencia.
 */
router.get('/', async (req, res, next) => {
  try {
    const libros = await Libro.find().sort({ createdAt: -1 });
    logger.info(`Consulta general de libros exitosa. Total registros: ${libros.length}`);
    res.status(200).json(libros);
  } catch (error) {
    logger.error('Error al consultar libros en MongoDB:', { error: error.message });
    next(error);
  }
});

/**
 * @openapi
 * /api/libros/{id}:
 *   get:
 *     summary: Obtener un libro por ID
 *     description: Consulta un libro individual a partir de su ObjectId en MongoDB.
 *     tags:
 *       - Libros (CRUD)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId del libro a consultar
 *     responses:
 *       200:
 *         description: Libro encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Libro'
 *       400:
 *         description: Identificador con formato inválido.
 *       404:
 *         description: Recurso solicitado inexistente.
 */
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  if (!validarObjectId(id, res)) return;

  try {
    const libro = await Libro.findById(id);

    if (!libro) {
      logger.warn(`Libro no encontrado con ID: ${id}`);
      return res.status(404).json({ error: 'Recurso solicitado inexistente.' });
    }

    logger.info(`Libro encontrado: "${libro.titulo}" (ID: ${id})`);
    res.status(200).json(libro);
  } catch (error) {
    logger.error(`Error al buscar libro ${id}:`, { error: error.message });
    next(error);
  }
});

/**
 * @openapi
 * /api/libros:
 *   post:
 *     summary: Crear un nuevo libro
 *     description: Da de alta un nuevo libro en MongoDB aplicando validaciones de Schema.
 *     tags:
 *       - Libros (CRUD)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LibroInput'
 *     responses:
 *       201:
 *         description: Libro creado y persistido exitosamente en MongoDB.
 *       400:
 *         description: Datos de entrada inválidos o faltantes.
 *       409:
 *         description: Conflicto de integridad (ej. ISBN duplicado).
 */
router.post('/', async (req, res, next) => {
  try {
    const nuevoLibro = new Libro(req.body);
    const libroGuardado = await nuevoLibro.save();

    logger.info(`Nuevo libro creado con éxito: "${libroGuardado.titulo}" (ID: ${libroGuardado._id})`);
    res.status(201).json(libroGuardado);
  } catch (error) {
    // Manejo de clave duplicada (ej. ISBN único)
    if (error.code === 11000) {
      const campoDuplicado = Object.keys(error.keyPattern || {})[0] || 'campo';
      logger.warn(`Conflicto de unicidad en MongoDB (409 Conflict): ${campoDuplicado}`);
      return res.status(409).json({
        error: `Conflicto de integridad: ya existe un libro con el mismo valor para ${campoDuplicado}.`
      });
    }

    // Error de validación de Mongoose
    if (error.name === 'ValidationError') {
      const errores = Object.values(error.errors).map((e) => e.message);
      logger.warn('Fallo de validación de datos en POST /api/libros:', { errores });
      return res.status(400).json({
        error: 'Datos de entrada inválidos o incompletos.',
        detalles: errores
      });
    }

    logger.error('Error inesperado al crear libro en MongoDB:', { error: error.message });
    next(error);
  }
});

/**
 * @openapi
 * /api/libros/{id}:
 *   put:
 *     summary: Modificar un libro existente
 *     description: Actualiza los campos de un libro en MongoDB aplicando validación del Schema.
 *     tags:
 *       - Libros (CRUD)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId del libro
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LibroInput'
 *     responses:
 *       200:
 *         description: Libro actualizado correctamente.
 *       400:
 *         description: Identificador inválido o datos incorrectos.
 *       404:
 *         description: Libro no encontrado.
 *       409:
 *         description: Conflicto de unicidad (ej. ISBN duplicado).
 */
router.put('/:id', async (req, res, next) => {
  const { id } = req.params;
  if (!validarObjectId(id, res)) return;

  try {
    const libroActualizado = await Libro.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true
    });

    if (!libroActualizado) {
      logger.warn(`Intento de actualización de libro inexistente: ${id}`);
      return res.status(404).json({ error: 'Recurso solicitado inexistente.' });
    }

    logger.info(`Libro actualizado exitosamente: "${libroActualizado.titulo}" (ID: ${id})`);
    res.status(200).json(libroActualizado);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Conflicto de integridad: el ISBN especificado ya pertenece a otro libro.'
      });
    }

    if (error.name === 'ValidationError') {
      const errores = Object.values(error.errors).map((e) => e.message);
      logger.warn(`Fallo de validación en actualización de libro ${id}:`, { errores });
      return res.status(400).json({
        error: 'Datos de actualización inválidos.',
        detalles: errores
      });
    }

    logger.error(`Error al actualizar libro ${id}:`, { error: error.message });
    next(error);
  }
});

/**
 * @openapi
 * /api/libros/{id}:
 *   delete:
 *     summary: Eliminar un libro
 *     description: Elimina de forma permanente un libro de MongoDB.
 *     tags:
 *       - Libros (CRUD)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId del libro a eliminar
 *     responses:
 *       204:
 *         description: Libro eliminado exitosamente (sin contenido).
 *       400:
 *         description: Identificador inválido.
 *       404:
 *         description: Libro no encontrado.
 */
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;
  if (!validarObjectId(id, res)) return;

  try {
    const libroEliminado = await Libro.findByIdAndDelete(id);

    if (!libroEliminado) {
      logger.warn(`Intento de eliminación de libro inexistente: ${id}`);
      return res.status(404).json({ error: 'Recurso solicitado inexistente.' });
    }

    logger.info(`Libro eliminado de MongoDB: "${libroEliminado.titulo}" (ID: ${id})`);
    res.status(204).send();
  } catch (error) {
    logger.error(`Error al eliminar libro ${id}:`, { error: error.message });
    next(error);
  }
});

// ==========================================
// 2. CONCURRENCIA, CONDICIÓN DE CARRERA Y REDIS LOCK
// ==========================================

/**
 * @openapi
 * /api/libros/{id}/comprar-inseguro:
 *   post:
 *     summary: Comprar libro (MODO INSEGURO SIN LOCK)
 *     description: Reproduce la CONDICIÓN DE CARRERA en MongoDB. Dos llamadas simultáneas cuando stock=1 producirán sobreventa o stock negativo.
 *     tags:
 *       - Concurrencia
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Compra realizada en modo inseguro.
 *       400:
 *         description: Stock insuficiente.
 *       404:
 *         description: Libro no encontrado.
 */
router.post('/:id/comprar-inseguro', async (req, res, next) => {
  const { id } = req.params;
  if (!validarObjectId(id, res)) return;

  const clientId = req.headers['x-client-id'] || `req-${Math.random().toString(36).substring(2, 7)}`;
  const delayMs = parseInt(process.env.ARTIFICIAL_DELAY_MS, 10) || 1500;

  try {
    const libro = await Libro.findById(id);

    if (!libro) {
      return res.status(404).json({ error: 'Recurso solicitado inexistente.' });
    }

    logger.warn(`[INSEGURO] [${clientId}] Leyendo stock de "${libro.titulo}". Stock en MongoDB: ${libro.stock}`);

    // Sección Crítica sin lock
    if (libro.stock <= 0) {
      logger.warn(`[INSEGURO] [${clientId}] Stock insuficiente (${libro.stock}). Operación rechazada.`);
      return res.status(400).json({
        error: 'Stock insuficiente para realizar la compra.',
        stockActual: libro.stock,
        clientId
      });
    }

    logger.info(`[INSEGURO] [${clientId}] Esperando retardo artificial de ${delayMs}ms...`);
    await esperar(delayMs);

    libro.stock -= 1;
    await libro.save();

    logger.warn(`[INSEGURO] [${clientId}] Compra persistida en MongoDB. Nuevo stock: ${libro.stock}`);

    res.status(200).json({
      mensaje: 'Compra realizada (MODO INSEGURO SIN LOCK)',
      libroId: id,
      titulo: libro.titulo,
      stockRestante: libro.stock,
      clientId
    });
  } catch (error) {
    logger.error(`Error en compra insegura del libro ${id}:`, { error: error.message });
    next(error);
  }
});

/**
 * @openapi
 * /api/libros/{id}/comprar:
 *   post:
 *     summary: Comprar libro (PROTEGIDO CON REDIS DISTRIBUTED LOCK)
 *     description: Exclusión mutua garantizada con Redis/Memurai. Protege la sección crítica sobre MongoDB. Si el lock está ocupado, responde 409 Conflict.
 *     tags:
 *       - Concurrencia
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Compra realizada con éxito y persistida consistentemente en MongoDB.
 *       400:
 *         description: Stock insuficiente.
 *       404:
 *         description: Libro no encontrado.
 *       409:
 *         description: Conflicto de concurrencia (Recurso bloqueado por otra operación).
 *       503:
 *         description: Redis/Memurai no disponible.
 */
router.post('/:id/comprar', async (req, res, next) => {
  const { id } = req.params;
  if (!validarObjectId(id, res)) return;

  const clientId = req.headers['x-client-id'] || `req-${Math.random().toString(36).substring(2, 7)}`;
  const delayMs = parseInt(process.env.ARTIFICIAL_DELAY_MS, 10) || 1500;
  const ttlMs = parseInt(process.env.LOCK_TTL_MS, 10) || 5000;

  logger.info(`[SEGURO] [${clientId}] Intentando adquirir Lock para libro ${id} (TTL: ${ttlMs}ms)...`);

  let lock = null;
  try {
    lock = await lockService.adquirirLock(id, ttlMs);
  } catch (error) {
    logger.error(`[SEGURO] [${clientId}] Fallo en servicio Redis:`, { error: error.message });
    return res.status(503).json({
      error: 'Servicio de coordinación (Redis/Memurai) no disponible.',
      detalle: error.message
    });
  }

  if (!lock.exitoso) {
    logger.warn(`[SEGURO] [${clientId}] Recurso bloqueado. Retornando 409 Conflict para libro ${id}`);
    return res.status(409).json({
      error: 'Conflicto de concurrencia: El recurso se encuentra actualmente bloqueado por otra operación en curso.',
      recurso: `libro:${id}`,
      estadoLock: 'OCUPADO',
      clientId
    });
  }

  logger.info(`[SEGURO] [${clientId}] Lock OBTENIDO (Token: ${lock.token}). Entrando a sección crítica en MongoDB.`);

  try {
    const libro = await Libro.findById(id);

    if (!libro) {
      return res.status(404).json({ error: 'Recurso solicitado inexistente.' });
    }

    if (libro.stock <= 0) {
      logger.warn(`[SEGURO] [${clientId}] Stock agotado (${libro.stock}). Rechazando compra.`);
      return res.status(400).json({
        error: 'Stock insuficiente para realizar la compra.',
        stockActual: libro.stock,
        clientId
      });
    }

    logger.info(`[SEGURO] [${clientId}] Procesando compra protegida (espera de ${delayMs}ms)...`);
    await esperar(delayMs);

    libro.stock -= 1;
    await libro.save();

    logger.info(`[SEGURO] [${clientId}] Compra exitosa persistida en MongoDB. Stock restante: ${libro.stock}`);

    return res.status(200).json({
      mensaje: 'Compra realizada exitosamente (PROTEGIDO CON LOCK REDIS Y PERSISTIDO EN MONGODB)',
      libroId: id,
      titulo: libro.titulo,
      stockRestante: libro.stock,
      lockKey: lock.key,
      clientId
    });
  } catch (error) {
    logger.error(`Error procesando compra protegida para libro ${id}:`, { error: error.message });
    next(error);
  } finally {
    const liberado = await lockService.liberarLock(id, lock.token);
    logger.info(`[SEGURO] [${clientId}] Lock liberado: ${liberado ? 'SI (propietario verificado con Lua)' : 'NO / expirado'}`);
  }
});

/**
 * @openapi
 * /api/libros/{id}/lock-status:
 *   get:
 *     summary: Consultar estado y TTL del Lock en Redis
 *     description: Inspecciona si el lock existe en Redis y cuál es su tiempo de vida restante (TTL) en milisegundos.
 *     tags:
 *       - Concurrencia
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado actual del lock obtenido.
 */
router.get('/:id/lock-status', async (req, res) => {
  const { id } = req.params;
  const estado = await lockService.obtenerEstadoLock(id);
  res.status(200).json({
    libroId: id,
    ...estado
  });
});

/**
 * @openapi
 * /api/libros/{id}/reset-stock:
 *   post:
 *     summary: Reiniciar stock de un libro en MongoDB
 *     description: Endpoint utilitario para restaurar el stock a un valor deseado para pruebas.
 *     tags:
 *       - Concurrencia
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stock:
 *                 type: integer
 *                 default: 1
 *     responses:
 *       200:
 *         description: Stock reiniciado en MongoDB.
 *       400:
 *         description: ID inválido.
 *       404:
 *         description: Libro no encontrado.
 */
router.post('/:id/reset-stock', async (req, res, next) => {
  const { id } = req.params;
  if (!validarObjectId(id, res)) return;

  const nuevoStock = typeof req.body.stock === 'number' ? req.body.stock : 1;

  try {
    const libro = await Libro.findByIdAndUpdate(
      id,
      { stock: nuevoStock },
      { new: true, runValidators: true }
    );

    if (!libro) {
      return res.status(404).json({ error: 'Recurso solicitado inexistente.' });
    }

    logger.info(`Stock reiniciado en MongoDB para libro "${libro.titulo}" (${id}) a: ${nuevoStock}`);
    res.status(200).json({
      mensaje: `Stock reiniciado en MongoDB para el libro ${id}`,
      libroId: id,
      stock: libro.stock
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
