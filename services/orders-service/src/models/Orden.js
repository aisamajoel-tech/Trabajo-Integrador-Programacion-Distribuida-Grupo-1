const mongoose = require('mongoose');

const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'RECHAZADA'];
const MOTIVOS = ['LIBRO_INEXISTENTE', 'SIN_STOCK', 'CONCURRENCIA', 'SERVICIO_NO_DISPONIBLE'];

/**
 * Orden de compra en db_orders (spec: docs/servicios/orders-service.md, sección 2).
 *
 * - Se persiste como PENDIENTE antes de llamar a otros servicios.
 * - Solo puede pasar a CONFIRMADA o RECHAZADA (estados finales, inmutables).
 * - libroSnapshot es una copia histórica para el comprobante: nunca se usa para decidir.
 * - compensacion: solo aplica cuando no se supo si inventario descontó (timeout). Indica si
 *   ya se pidió la reversión del descuento (REALIZADA) o si hay que reintentarla (PENDIENTE).
 */
const ordenSchema = new mongoose.Schema(
  {
    clienteId: { type: String, required: true, trim: true },
    libroId: { type: String, required: true, trim: true },
    cantidad: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'La cantidad debe ser un entero.' }
    },
    estado: { type: String, enum: ESTADOS, default: 'PENDIENTE' },
    motivoRechazo: { type: String, enum: [...MOTIVOS, null], default: null },
    libroSnapshot: {
      titulo: String,
      autor: String,
      isbn: String
    },
    requestId: { type: String, required: true },
    fechaResolucion: { type: Date, default: null },
    compensacion: {
      type: String,
      enum: ['NO_REQUERIDA', 'PENDIENTE', 'REALIZADA'],
      default: 'NO_REQUERIDA'
    }
  },
  {
    collection: 'ordenes',
    timestamps: { createdAt: 'fechaCreacion', updatedAt: false },
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        ret.ordenId = ret._id.toString();
        delete ret._id;
        return ret;
      }
    }
  }
);

// Historial por cliente, del más reciente al más antiguo
ordenSchema.index({ clienteId: 1, fechaCreacion: -1 });
// Búsqueda de compensaciones pendientes
ordenSchema.index({ compensacion: 1 });

module.exports = mongoose.model('Orden', ordenSchema);
module.exports.ESTADOS = ESTADOS;
module.exports.MOTIVOS = MOTIVOS;
