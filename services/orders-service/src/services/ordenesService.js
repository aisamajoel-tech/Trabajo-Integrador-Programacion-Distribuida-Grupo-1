const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Orden = require('../models/Orden');
const { JWT_SECRET, JWT_ISSUER, SERVICE_NAME } = require('../config/env');
const catalogClient = require('../clients/catalogClient');
const inventoryClient = require('../clients/inventoryClient');
const logger = require('../config/logger');

/**
 * Status HTTP y mensaje que recibe el cliente según cómo terminó la orden
 * (spec orders-service, sección 3.1).
 */
const RESPUESTA_POR_MOTIVO = {
  LIBRO_INEXISTENTE: { status: 404, mensaje: 'El libro solicitado no existe en el catálogo.' },
  SIN_STOCK: { status: 409, mensaje: 'No hay stock suficiente para completar la compra.' },
  CONCURRENCIA: {
    status: 409,
    mensaje: 'El libro está siendo comprado por otro cliente en este momento. Intentá nuevamente en unos segundos.'
  },
  SERVICIO_NO_DISPONIBLE: {
    status: 503,
    mensaje: 'No se pudo completar la compra porque un servicio necesario no está disponible. Intentá más tarde.'
  },
  NO_AUTORIZADO: {
    status: 403,
    mensaje: 'El servicio de inventario rechazó las credenciales de la compra. No se descontó stock.'
  }
};

/**
 * Cierra una orden PENDIENTE. El filtro { estado: 'PENDIENTE' } garantiza que una orden
 * en estado final nunca se modifique (regla de inmutabilidad).
 */
async function resolver(ordenId, cambios) {
  return Orden.findOneAndUpdate(
    { _id: ordenId, estado: 'PENDIENTE' },
    { $set: { ...cambios, fechaResolucion: new Date() } },
    { new: true }
  );
}

async function rechazar(orden, motivoRechazo, extra = {}) {
  const actualizada = await resolver(orden._id, { estado: 'RECHAZADA', motivoRechazo, ...extra });
  logger.warn(`Orden RECHAZADA (${motivoRechazo})`, {
    ordenId: orden._id.toString(),
    libroId: orden.libroId,
    clienteId: orden.clienteId,
    requestId: orden.requestId
  });
  const { status, mensaje } = RESPUESTA_POR_MOTIVO[motivoRechazo];
  return {
    status,
    body: {
      error: mensaje,
      codigo: motivoRechazo,
      ordenId: orden._id.toString(),
      estado: 'RECHAZADA',
      motivoRechazo,
      mensaje,
      ...(actualizada?.compensacion === 'PENDIENTE' ? { compensacion: 'PENDIENTE' } : {})
    }
  };
}

/**
 * POST /api/ordenes — orquesta la compra (Caso de Uso B).
 *  1. Persiste la orden PENDIENTE.
 *  2. Pregunta a catalog-service si el libro existe (y guarda el snapshot).
 *  3. Pide a inventory-service que descuente el stock (con ordenId, idempotente).
 *  4. Cierra la orden como CONFIRMADA o RECHAZADA según las respuestas.
 */
async function crearOrden({ clienteId, libroId, cantidad }, requestIdEntrante, authorization) {
  const requestId = requestIdEntrante || crypto.randomUUID();
  const orden = await Orden.create({ clienteId, libroId, cantidad, requestId });
  const ordenId = orden._id.toString();
  const ctx = { ordenId, libroId, clienteId, requestId };
  logger.info('Orden registrada como PENDIENTE', ctx);

  // 2. Catálogo primero: si el libro no existe no se toca el stock ni se toma un lock
  const catalogo = await catalogClient.obtenerLibro(libroId, requestId);
  if (catalogo.resultado === 'NO_EXISTE') return rechazar(orden, 'LIBRO_INEXISTENTE');
  if (catalogo.resultado === 'NO_DISPONIBLE') return rechazar(orden, 'SERVICIO_NO_DISPONIBLE');

  await Orden.updateOne({ _id: orden._id, estado: 'PENDIENTE' }, { $set: { libroSnapshot: catalogo.libro } });

  // 3. Inventario: decide si hay stock y lo descuenta bajo su propio lock.
  //    TP7: se propaga el mismo Authorization: Bearer <JWT> del cliente (sección 13).
  const inventario = await inventoryClient.descontar(libroId, { cantidad, clienteId, ordenId }, requestId, authorization);

  switch (inventario.resultado) {
    case 'DESCONTADO': {
      const confirmada = await resolver(orden._id, { estado: 'CONFIRMADA' });
      logger.info('Orden CONFIRMADA', { ...ctx, stockRestante: inventario.data?.stockRestante });
      return {
        status: 201,
        body: {
          ordenId,
          estado: 'CONFIRMADA',
          clienteId,
          libro: { id: libroId, ...catalogo.libro },
          cantidad,
          fechaCreacion: confirmada.fechaCreacion,
          fechaResolucion: confirmada.fechaResolucion
        }
      };
    }
    case 'SIN_STOCK':
      return rechazar(orden, 'SIN_STOCK');
    case 'CONCURRENCIA':
      return rechazar(orden, 'CONCURRENCIA');
    case 'NO_AUTORIZADO':
      // Inventario no aceptó el token propagado: el descuento no se aplicó, no hay nada que compensar
      return rechazar(orden, 'NO_AUTORIZADO');
    case 'NO_DISPONIBLE':
      // Inventario no estaba disponible: el descuento no se aplicó, no hay nada que compensar
      return rechazar(orden, 'SERVICIO_NO_DISPONIBLE');
    case 'INCIERTO':
    default: {
      // Timeout: el descuento pudo haberse aplicado. Se pide revertirlo con el mismo ordenId;
      // si inventario sigue sin responder, la compensación queda PENDIENTE y se reintenta sola.
      logger.warn('Resultado del descuento incierto. Se solicita compensación.', { ...ctx, causa: inventario.causa });
      const compensacion = await inventoryClient.revertir(libroId, ordenId, requestId, authorization);
      return rechazar(orden, 'SERVICIO_NO_DISPONIBLE', {
        compensacion: compensacion.exito ? 'REALIZADA' : 'PENDIENTE'
      });
    }
  }
}

/** GET /api/ordenes/:id */
async function obtenerOrden(ordenId) {
  return Orden.findById(ordenId);
}

/** GET /api/ordenes/cliente/:clienteId?estado= */
async function historialCliente(clienteId, estado) {
  const filtro = { clienteId };
  if (estado) filtro.estado = estado;
  return Orden.find(filtro).sort({ fechaCreacion: -1 });
}

/**
 * TP7 — Credencial técnica para la tarea en segundo plano de compensaciones.
 * El reintento periódico no ocurre dentro de una petición de un usuario, así que no hay un JWT
 * de cliente para propagar (y guardar tokens de usuarios en la base sería inseguro: vencen y
 * se podrían filtrar). Se firma un token de corta vida (60 s) que identifica al propio
 * orders-service, con el rol mínimo que inventory-service acepta en /revertir (USER).
 * Mejora futura: que auth-service emita credenciales de servicio (client credentials).
 */
function tokenDeServicio() {
  const token = jwt.sign({ sub: SERVICE_NAME, role: 'USER', tipo: 'servicio' }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '60s',
    ...(JWT_ISSUER ? { issuer: JWT_ISSUER } : {})
  });
  return `Bearer ${token}`;
}

/**
 * Reintenta las compensaciones que quedaron PENDIENTE (inventario no respondió al revertir).
 * Es seguro repetirlo: inventario solo devuelve unidades si ese ordenId descontó.
 */
async function procesarCompensacionesPendientes() {
  const pendientes = await Orden.find({ compensacion: 'PENDIENTE' }).limit(20);
  const authorization = pendientes.length ? tokenDeServicio() : undefined;
  for (const orden of pendientes) {
    const ordenId = orden._id.toString();
    const r = await inventoryClient.revertir(orden.libroId, ordenId, orden.requestId, authorization);
    if (r.exito) {
      await Orden.updateOne({ _id: orden._id, compensacion: 'PENDIENTE' }, { $set: { compensacion: 'REALIZADA' } });
      logger.info('Compensación realizada', { ordenId, revertido: r.data?.revertido, requestId: orden.requestId });
    }
  }
  return pendientes.length;
}

module.exports = {
  crearOrden,
  obtenerOrden,
  historialCliente,
  procesarCompensacionesPendientes
};
