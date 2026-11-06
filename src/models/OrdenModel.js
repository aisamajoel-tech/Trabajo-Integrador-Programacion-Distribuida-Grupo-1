/**
 * MODELO MVC: OrdenModel (orders-service - Base propia: db_orders)
 * Responsabilidad única: Persistir el ciclo de vida de las órdenes de compra
 * (PENDIENTE -> CONFIRMADA | RECHAZADA) y preservar el libroSnapshot inmutable.
 */
const crypto = require('crypto');

class OrdenModel {
  constructor(storage) {
    this.storage = storage;
  }

  crearPendiente({ clienteId, clienteEmail, libroId, cantidad = 1, requestId }) {
    const db = this.storage.obtenerOrders();
    const orden = {
      ordenId: crypto.randomBytes(12).toString('hex'),
      clienteId,
      clienteEmail,
      libroId,
      cantidad: Number(cantidad),
      estado: 'PENDIENTE',
      motivoRechazo: null,
      libroSnapshot: null,
      requestId,
      compensacion: 'NO_REQUERIDA',
      fechaCreacion: new Date().toISOString(),
      fechaResolucion: null
    };
    db.ordenes.unshift(orden);
    this.storage.guardar('orders', db);
    return orden;
  }

  listarPorUsuario(user) {
    const ordenes = this.storage.obtenerOrders().ordenes;
    if (user.role === 'ADMIN') return ordenes;
    return ordenes.filter((o) => String(o.clienteId) === String(user.sub));
  }

  buscarPorId(ordenId) {
    return this.storage.obtenerOrders().ordenes.find((o) => o.ordenId === ordenId) || null;
  }
}

module.exports = OrdenModel;
