const Stock = require('../models/Stock');
const Movimiento = require('../models/Movimiento');
const lockService = require('./lockService');
const catalogClient = require('../clients/catalogClient');
const logger = require('../config/logger');
const { ARTIFICIAL_DELAY_MS } = require('../config/env');

/**
 * Error de negocio con su código HTTP y código de error del contrato.
 * El controlador lo traduce a { error, codigo } con el status indicado.
 */
class ErrorNegocio extends Error {
  constructor(status, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.name = 'ErrorNegocio';
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const aRespuesta = (stock) => ({
  libroId: stock.libroId,
  stockDisponible: stock.stockDisponible,
  ultimaActualizacion: stock.ultimaActualizacion
});

async function buscarStockOFallar(libroId) {
  const stock = await Stock.findOne({ libroId });
  if (!stock) {
    throw new ErrorNegocio(404, 'STOCK_NO_ENCONTRADO', 'No existe registro de stock para este libro.', { libroId });
  }
  return stock;
}

/**
 * Ejecuta `fn` dentro de la sección crítica del libro (lock distribuido en Redis).
 * Si el lock sigue ocupado después de los reintentos -> 409 LOCK_OCUPADO.
 * El lock se libera siempre (finally), verificando el token con Lua.
 */
async function conLock(libroId, contexto, fn) {
  const lock = await lockService.adquirirLock(libroId);
  if (!lock.exitoso) {
    logger.warn('Lock ocupado tras los reintentos. Se responde 409.', { libroId, ...contexto });
    throw new ErrorNegocio(
      409,
      'LOCK_OCUPADO',
      'El stock de este libro está siendo modificado por otra operación concurrente. Reintente en breve.',
      { libroId, recurso: lock.key }
    );
  }

  logger.info('Lock adquirido. Entrando a sección crítica.', { libroId, key: lock.key, ...contexto });
  try {
    return await fn();
  } finally {
    const liberado = await lockService.liberarLock(libroId, lock.token);
    logger.info(`Lock liberado: ${liberado ? 'sí (propietario verificado con Lua)' : 'no / ya había expirado'}`, {
      libroId,
      ...contexto
    });
  }
}

/** POST /api/inventario — alta del registro de stock de un libro */
async function crearStock({ libroId, stockInicial }, requestId) {
  const existente = await Stock.findOne({ libroId });
  if (existente) {
    throw new ErrorNegocio(409, 'STOCK_YA_EXISTE', 'El libro ya tiene un registro de stock. Use /reponer.', {
      libroId,
      stockDisponible: existente.stockDisponible
    });
  }

  const verificacion = await catalogClient.verificarLibro(libroId, requestId);
  if (verificacion === 'NO_EXISTE') {
    throw new ErrorNegocio(422, 'LIBRO_INEXISTENTE', 'El libro no existe en el catálogo; no se crea su stock.', {
      libroId
    });
  }
  if (verificacion === 'NO_DISPONIBLE') {
    throw new ErrorNegocio(503, 'CATALOGO_NO_DISPONIBLE', 'No se pudo verificar el libro: catalog-service no disponible.');
  }

  try {
    const stock = await Stock.create({ libroId, stockDisponible: stockInicial });
    return { ...aRespuesta(stock), verificacionCatalogo: verificacion };
  } catch (err) {
    if (err.code === 11000) {
      throw new ErrorNegocio(409, 'STOCK_YA_EXISTE', 'El libro ya tiene un registro de stock. Use /reponer.', { libroId });
    }
    throw err;
  }
}

/** GET /api/inventario/:libroId */
async function consultarStock(libroId) {
  return aRespuesta(await buscarStockOFallar(libroId));
}

/**
 * POST /api/inventario/:libroId/descontar — sección crítica protegida por el lock.
 * Si viene `ordenId`, el descuento es idempotente (el mismo ordenId nunca descuenta dos veces).
 */
async function descontarStock(libroId, { cantidad, clienteId, ordenId }, requestId) {
  const contexto = { clienteId, ordenId, requestId };

  // 404 antes de tomar el lock: no tiene sentido bloquear un libro sin stock registrado
  await buscarStockOFallar(libroId);

  return conLock(libroId, contexto, async () => {
    // Idempotencia (se verifica dentro del lock para que dos reintentos simultáneos no pasen ambos)
    if (ordenId) {
      const previo = await Movimiento.findOne({ ordenId, tipo: 'DESCUENTO' });
      if (previo) {
        if (previo.libroId !== libroId) {
          throw new ErrorNegocio(409, 'ORDEN_DUPLICADA', 'El ordenId ya se usó para descontar otro libro.', { ordenId });
        }
        const actual = await buscarStockOFallar(libroId);
        logger.info('Descuento repetido para el mismo ordenId: no se descuenta de nuevo (idempotencia).', {
          libroId,
          ...contexto
        });
        return {
          libroId,
          cantidadDescontada: previo.cantidad,
          stockRestante: actual.stockDisponible,
          ordenId,
          idempotente: true
        };
      }
    }

    const stock = await buscarStockOFallar(libroId);
    if (stock.stockDisponible < cantidad) {
      logger.warn('Stock insuficiente. Se rechaza el descuento.', {
        libroId,
        stockDisponible: stock.stockDisponible,
        cantidadSolicitada: cantidad,
        ...contexto
      });
      throw new ErrorNegocio(400, 'STOCK_INSUFICIENTE', 'Stock insuficiente para realizar la operación.', {
        libroId,
        stockDisponible: stock.stockDisponible,
        cantidadSolicitada: cantidad
      });
    }

    // Retardo opcional solo para demostrar la exclusión mutua en las pruebas (por defecto 0)
    if (ARTIFICIAL_DELAY_MS > 0) await esperar(ARTIFICIAL_DELAY_MS);

    // Primero se registra el movimiento (si hay ordenId) y después se descuenta;
    // si el descuento fallara, se borra el movimiento para no dejar un registro huérfano.
    let movimiento = null;
    if (ordenId) {
      movimiento = await Movimiento.create({ ordenId, libroId, tipo: 'DESCUENTO', cantidad, clienteId, requestId });
    }

    // Defensa adicional: el filtro $gte impide dejar el stock negativo aunque algo fallara con el lock
    const actualizado = await Stock.findOneAndUpdate(
      { libroId, stockDisponible: { $gte: cantidad } },
      { $inc: { stockDisponible: -cantidad } },
      { new: true }
    );

    if (!actualizado) {
      if (movimiento) await Movimiento.deleteOne({ _id: movimiento._id });
      throw new ErrorNegocio(400, 'STOCK_INSUFICIENTE', 'Stock insuficiente para realizar la operación.', {
        libroId,
        cantidadSolicitada: cantidad
      });
    }

    logger.info(`Descuento aplicado. Stock restante: ${actualizado.stockDisponible}`, {
      libroId,
      cantidad,
      ...contexto
    });

    return {
      libroId,
      stockPrevio: stock.stockDisponible,
      cantidadDescontada: cantidad,
      stockRestante: actualizado.stockDisponible,
      ...(clienteId ? { clienteId } : {}),
      ...(ordenId ? { ordenId } : {})
    };
  });
}

/**
 * POST /api/inventario/:libroId/reponer — reemplaza al reset-stock del monolito.
 *  - { cantidad: n } suma n unidades (reposición).
 *  - { stock: n }    fija el stock en n (reinicio para pruebas). Si vienen ambos, manda `stock`.
 */
async function reponerStock(libroId, { cantidad, stock: stockAbsoluto }, requestId) {
  await buscarStockOFallar(libroId);

  return conLock(libroId, { requestId }, async () => {
    const actualizacion =
      stockAbsoluto !== undefined
        ? { $set: { stockDisponible: stockAbsoluto } }
        : { $inc: { stockDisponible: cantidad } };

    const actualizado = await Stock.findOneAndUpdate({ libroId }, actualizacion, { new: true, runValidators: true });
    if (!actualizado) {
      throw new ErrorNegocio(404, 'STOCK_NO_ENCONTRADO', 'No existe registro de stock para este libro.', { libroId });
    }

    const operacion = stockAbsoluto !== undefined ? 'REINICIO' : 'REPOSICION';
    logger.info(`Stock actualizado (${operacion}). Nuevo saldo: ${actualizado.stockDisponible}`, { libroId, requestId });
    return { ...aRespuesta(actualizado), operacion };
  });
}

/**
 * POST /api/inventario/:libroId/revertir — compensación de un descuento (saga).
 * Solo devuelve unidades si ese ordenId realmente descontó stock y todavía no se revirtió.
 */
async function revertirDescuento(libroId, { ordenId }, requestId) {
  await buscarStockOFallar(libroId);

  return conLock(libroId, { ordenId, requestId }, async () => {
    const descuento = await Movimiento.findOne({ ordenId, tipo: 'DESCUENTO', libroId });
    if (!descuento) {
      const actual = await buscarStockOFallar(libroId);
      return { libroId, ordenId, revertido: false, motivo: 'No hubo descuento para esta orden.', stockDisponible: actual.stockDisponible };
    }

    const yaRevertido = await Movimiento.findOne({ ordenId, tipo: 'REVERSION' });
    if (yaRevertido) {
      const actual = await buscarStockOFallar(libroId);
      return { libroId, ordenId, revertido: false, motivo: 'La orden ya había sido revertida.', stockDisponible: actual.stockDisponible };
    }

    await Movimiento.create({ ordenId, libroId, tipo: 'REVERSION', cantidad: descuento.cantidad, requestId });
    const actualizado = await Stock.findOneAndUpdate(
      { libroId },
      { $inc: { stockDisponible: descuento.cantidad } },
      { new: true }
    );

    logger.info(`Descuento revertido (+${descuento.cantidad}). Stock: ${actualizado.stockDisponible}`, {
      libroId,
      ordenId,
      requestId
    });
    return { libroId, ordenId, revertido: true, cantidadDevuelta: descuento.cantidad, stockDisponible: actualizado.stockDisponible };
  });
}

/** GET /api/inventario/:libroId/lock-status — diagnóstico */
async function estadoLock(libroId) {
  return { libroId, ...(await lockService.obtenerEstadoLock(libroId)) };
}

module.exports = {
  ErrorNegocio,
  crearStock,
  consultarStock,
  descontarStock,
  reponerStock,
  revertirDescuento,
  estadoLock
};
