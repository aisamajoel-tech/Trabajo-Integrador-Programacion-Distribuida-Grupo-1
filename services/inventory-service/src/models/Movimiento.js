const mongoose = require('mongoose');

/**
 * Registro de cada descuento/reversión asociado a una orden.
 *
 * Sirve para dos cosas:
 *  - Idempotencia: si orders-service reintenta el mismo descuento (mismo ordenId),
 *    no se descuenta dos veces.
 *  - Compensación: solo se puede revertir un descuento que realmente existió.
 *
 * Solo se registra cuando el pedido trae `ordenId` (el body mínimo `{ cantidad, clienteId }`
 * del contrato sigue funcionando sin él).
 */
const movimientoSchema = new mongoose.Schema(
  {
    ordenId: { type: String, required: true, trim: true },
    libroId: { type: String, required: true, trim: true },
    tipo: { type: String, required: true, enum: ['DESCUENTO', 'REVERSION'] },
    cantidad: { type: Number, required: true, min: 1 },
    clienteId: { type: String, trim: true },
    requestId: { type: String, trim: true }
  },
  {
    collection: 'movimientos',
    timestamps: { createdAt: 'fecha', updatedAt: false },
    versionKey: false
  }
);

// Un mismo ordenId solo puede tener un DESCUENTO y una REVERSION
movimientoSchema.index({ ordenId: 1, tipo: 1 }, { unique: true });

module.exports = mongoose.model('Movimiento', movimientoSchema);
