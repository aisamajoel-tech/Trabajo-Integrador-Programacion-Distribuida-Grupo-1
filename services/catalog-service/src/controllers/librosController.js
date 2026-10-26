const mongoose = require('mongoose');
const librosService = require('../services/librosService');
const logger = require('../config/logger');
const { estaConectadoMongo } = require('../config/db');

function validarObjectId(id, res, endpoint) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    logger.warn('Identificador con formato inválido recibido', { endpoint, id });
    res.status(400).json({
      error: 'Identificador inválido. Debe ser un ObjectId válido de MongoDB (24 caracteres hexadecimales).',
      codigo: 'ID_INVALIDO'
    });
    return false;
  }
  return true;
}

function verificarDisponibilidadDB(res, endpoint) {
  if (!estaConectadoMongo()) {
    logger.error('Operación rechazada: base de datos db_catalog no disponible', { endpoint });
    res.status(503).json({
      error: 'Base de datos del catálogo temporalmente no disponible.',
      codigo: 'DB_NO_DISPONIBLE'
    });
    return false;
  }
  return true;
}

async function getLibros(req, res, next) {
  const endpoint = 'GET /api/libros';
  if (!verificarDisponibilidadDB(res, endpoint)) return;

  try {
    const libros = await librosService.listarLibros(req.query);
    logger.info(`Consulta de catálogo exitosa. Total registros: ${libros.length}`, {
      endpoint,
      requestId: req.headers['x-request-id']
    });
    return res.status(200).json(libros);
  } catch (error) {
    logger.error('Error al listar libros del catálogo', { endpoint, error: error.message });
    return next(error);
  }
}

async function getLibroById(req, res, next) {
  const { id } = req.params;
  const endpoint = `GET /api/libros/${id}`;
  if (!validarObjectId(id, res, endpoint)) return;
  if (!verificarDisponibilidadDB(res, endpoint)) return;

  try {
    const libro = await librosService.obtenerLibroPorId(id);
    if (!libro) {
      logger.warn(`Libro no encontrado en catálogo: ${id}`, {
        endpoint,
        requestId: req.headers['x-request-id']
      });
      return res.status(404).json({
        error: 'Recurso solicitado inexistente.',
        codigo: 'LIBRO_INEXISTENTE'
      });
    }

    logger.info(`Libro consultado: "${libro.titulo}"`, {
      endpoint,
      libroId: id,
      requestId: req.headers['x-request-id']
    });
    return res.status(200).json(libro);
  } catch (error) {
    logger.error(`Error al consultar libro ${id}`, { endpoint, error: error.message });
    return next(error);
  }
}

async function createLibro(req, res, next) {
  const endpoint = 'POST /api/libros';
  if (!verificarDisponibilidadDB(res, endpoint)) return;

  try {
    if (req.body && req.body.stock !== undefined) {
      logger.info('Atributo "stock" ignorado en alta de catálogo (responsabilidad de inventory-service)', {
        endpoint
      });
    }

    const libroGuardado = await librosService.crearLibro(req.body);
    logger.info(`Nuevo libro registrado en catálogo: "${libroGuardado.titulo}"`, {
      endpoint,
      libroId: libroGuardado._id.toString(),
      isbn: libroGuardado.isbn
    });
    return res.status(201).json(libroGuardado);
  } catch (error) {
    if (error.code === 11000) {
      const campoDuplicado = Object.keys(error.keyPattern || {})[0] || 'isbn';
      logger.warn(`Conflicto de unicidad en catálogo (${campoDuplicado})`, {
        endpoint,
        error: error.message
      });
      return res.status(409).json({
        error: `Conflicto de integridad: ya existe un libro con el mismo ${campoDuplicado}.`,
        codigo: 'ISBN_DUPLICADO'
      });
    }

    if (error.name === 'ValidationError') {
      const detalles = Object.values(error.errors).map((e) => e.message);
      logger.warn('Fallo de validación bibliográfica al crear libro', { endpoint, detalles });
      return res.status(400).json({
        error: 'Datos de entrada inválidos o incompletos.',
        codigo: 'VALIDACION_FALLIDA',
        detalles
      });
    }

    logger.error('Error inesperado al crear libro en catálogo', { endpoint, error: error.message });
    return next(error);
  }
}

async function updateLibro(req, res, next) {
  const { id } = req.params;
  const endpoint = `PUT /api/libros/${id}`;
  if (!validarObjectId(id, res, endpoint)) return;
  if (!verificarDisponibilidadDB(res, endpoint)) return;

  try {
    const libroActualizado = await librosService.actualizarLibro(id, req.body);
    if (!libroActualizado) {
      logger.warn(`Intento de actualización de libro inexistente: ${id}`, { endpoint });
      return res.status(404).json({
        error: 'Recurso solicitado inexistente.',
        codigo: 'LIBRO_INEXISTENTE'
      });
    }

    logger.info(`Libro actualizado exitosamente: "${libroActualizado.titulo}"`, {
      endpoint,
      libroId: id
    });
    return res.status(200).json(libroActualizado);
  } catch (error) {
    if (error.code === 11000) {
      logger.warn(`Conflicto de ISBN duplicado al actualizar libro ${id}`, { endpoint });
      return res.status(409).json({
        error: 'Conflicto de integridad: el ISBN especificado ya pertenece a otra obra.',
        codigo: 'ISBN_DUPLICADO'
      });
    }

    if (error.name === 'ValidationError') {
      const detalles = Object.values(error.errors).map((e) => e.message);
      logger.warn(`Fallo de validación al actualizar libro ${id}`, { endpoint, detalles });
      return res.status(400).json({
        error: 'Datos de actualización inválidos.',
        codigo: 'VALIDACION_FALLIDA',
        detalles
      });
    }

    logger.error(`Error al actualizar libro ${id}`, { endpoint, error: error.message });
    return next(error);
  }
}

async function deleteLibro(req, res, next) {
  const { id } = req.params;
  const endpoint = `DELETE /api/libros/${id}`;
  if (!validarObjectId(id, res, endpoint)) return;
  if (!verificarDisponibilidadDB(res, endpoint)) return;

  try {
    const libroEliminado = await librosService.eliminarLibro(id);
    if (!libroEliminado) {
      logger.warn(`Intento de eliminación de libro inexistente: ${id}`, { endpoint });
      return res.status(404).json({
        error: 'Recurso solicitado inexistente.',
        codigo: 'LIBRO_INEXISTENTE'
      });
    }

    logger.info(`Libro eliminado del catálogo: "${libroEliminado.titulo}"`, {
      endpoint,
      libroId: id
    });
    return res.status(200).json({
      mensaje: 'Obra eliminada correctamente del catálogo.',
      id: libroEliminado._id.toString()
    });
  } catch (error) {
    logger.error(`Error al eliminar libro ${id}`, { endpoint, error: error.message });
    return next(error);
  }
}

module.exports = {
  getLibros,
  getLibroById,
  createLibro,
  updateLibro,
  deleteLibro
};
