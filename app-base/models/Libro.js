const mongoose = require('mongoose');

const añoActual = new Date().getFullYear();

const libroSchema = new mongoose.Schema(
  {
    titulo: {
      type: String,
      required: [true, 'El título del libro es obligatorio.'],
      trim: true,
      minlength: [1, 'El título debe tener al menos 1 caracter.'],
      maxlength: [150, 'El título no puede exceder los 150 caracteres.']
    },
    autor: {
      type: String,
      required: [true, 'El autor del libro es obligatorio.'],
      trim: true,
      minlength: [1, 'El autor debe tener al menos 1 caracter.'],
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
    stock: {
      type: Number,
      required: [true, 'El stock es obligatorio.'],
      min: [0, 'El stock no puede ser negativo.'],
      default: 1,
      validate: {
        validator: Number.isInteger,
        message: 'El stock debe ser un número entero.'
      }
    },
    genero: {
      type: String,
      enum: {
        values: ['Ficción', 'Novela', 'Historia', 'Ciencia', 'Terror', 'Fantasía', 'Otro'],
        message: '{VALUE} no es un género válido. Opciones permitidas: Ficción, Novela, Historia, Ciencia, Terror, Fantasía, Otro.'
      },
      default: 'Otro'
    },
    isbn: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // Permite omitir el campo, pero si se envía debe ser único
      validate: {
        validator: function (v) {
          if (!v) return true;
          // Validación simple de formato ISBN (10 o 13 dígitos con o sin guiones)
          return /^(?:\d[- ]*){9}[\dXx]$|^(?:\d[- ]*){13}$/.test(v);
        },
        message: 'El formato del ISBN es inválido.'
      }
    }
  },
  {
    timestamps: true, // createdAt y updatedAt
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        return ret;
      }
    }
  }
);

const Libro = mongoose.model('Libro', libroSchema);

module.exports = Libro;
