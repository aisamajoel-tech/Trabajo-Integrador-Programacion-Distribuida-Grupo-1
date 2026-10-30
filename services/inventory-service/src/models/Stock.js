const mongoose = require('mongoose');

/**
 * Saldo de existencias por libro en db_inventory.
 *
 * `libroId` es una REFERENCIA LÓGICA al libro de catalog-service: se guarda el ID,
 * pero este servicio nunca accede a db_catalog ni guarda títulos o autores.
 */
const stockSchema = new mongoose.Schema(
  {
    libroId: {
      type: String,
      required: [true, 'El libroId es obligatorio.'],
      trim: true,
      match: [/^[a-fA-F0-9]{24}$/, 'El libroId debe ser un ObjectId válido (24 caracteres hexadecimales).']
    },
    stockDisponible: {
      type: Number,
      required: [true, 'El stockDisponible es obligatorio.'],
      min: [0, 'El stock no puede ser negativo.'],
      validate: {
        validator: Number.isInteger,
        message: 'El stock debe ser un número entero.'
      }
    }
  },
  {
    collection: 'stock',
    timestamps: { createdAt: 'creadoEn', updatedAt: 'ultimaActualizacion' },
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        delete ret._id;
        return ret;
      }
    }
  }
);

stockSchema.index({ libroId: 1 }, { unique: true });

module.exports = mongoose.model('Stock', stockSchema);
