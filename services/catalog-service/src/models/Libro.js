const mongoose = require('mongoose');

const añoActual = new Date().getFullYear();

const GENEROS_PERMITIDOS = [
  'Ficción',
  'Novela',
  'Historia',
  'Ciencia',
  'Terror',
  'Fantasía',
  'Otro'
];

/**
 * Esquema de Libro en db_catalog (SIN el campo stock, responsabilidad de inventory-service)
 */
const libroSchema = new mongoose.Schema(
  {
    titulo: {
      type: String,
      required: [true, 'El título del libro es obligatorio.'],
      trim: true,
      minlength: [1, 'El título debe tener al menos 1 carácter.'],
      maxlength: [150, 'El título no puede exceder los 150 caracteres.']
    },
    autor: {
      type: String,
      required: [true, 'El autor del libro es obligatorio.'],
      trim: true,
      minlength: [1, 'El autor debe tener al menos 1 carácter.'],
      maxlength: [100, 'El autor no puede exceder los 100 caracteres.']
    },
    año: {
      type: Number,
      required: [true, 'El año de publicación es obligatorio.'],
      min: [1000, 'El año no puede ser anterior al 1000.'],
      max: [añoActual + 1, `El año no puede ser superior a ${añoActual + 1}.`],
      validate: {
        validator: Number.isInteger,
        message: 'El año debe ser un número entero.'
      }
    },
    genero: {
      type: String,
      required: [true, 'El género es obligatorio.'],
      enum: {
        values: GENEROS_PERMITIDOS,
        message: `{VALUE} no es un género válido. Opciones permitidas: ${GENEROS_PERMITIDOS.join(', ')}.`
      },
      default: 'Otro'
    },
    isbn: {
      type: String,
      required: [true, 'El ISBN es obligatorio.'],
      trim: true,
      unique: true,
      validate: {
        validator: function (v) {
          if (!v) return false;
          return /^(?:\d[- ]*){9}[\dXx]$|^(?:\d[- ]*){13}$/.test(v);
        },
        message: 'El formato del ISBN es inválido (debe contener 10 o 13 dígitos).'
      }
    }
  },
  {
    timestamps: true,
    versionKey: false,
    strict: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        return ret;
      }
    }
  }
);

libroSchema.index({ genero: 1 });

const Libro = mongoose.model('Libro', libroSchema);

module.exports = Libro;
