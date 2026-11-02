const mongoose = require('mongoose');

/**
 * Esquema de Usuario en db_auth (Propiedad exclusiva de auth-service).
 * Regla de seguridad (Sección 6):
 * - Nunca persiste la contraseña en texto plano; solo almacena `passwordHash` (bcrypt).
 * - `passwordHash` tiene `select: false` por defecto y se elimina explícitamente en `toJSON`.
 */
const usuarioSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'El email es obligatorio.'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El formato del email no es válido.']
    },
    nombre: {
      type: String,
      required: [true, 'El nombre del usuario es obligatorio.'],
      trim: true,
      minlength: [2, 'El nombre debe tener al menos 2 caracteres.'],
      maxlength: [100, 'El nombre no puede superar los 100 caracteres.']
    },
    passwordHash: {
      type: String,
      required: [true, 'El hash de la contraseña es obligatorio.'],
      select: false
    },
    role: {
      type: String,
      enum: {
        values: ['USER', 'ADMIN'],
        message: 'El rol debe ser USER o ADMIN.'
      },
      default: 'USER'
    },
    activo: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.passwordHash;
        return ret;
      }
    }
  }
);

module.exports = mongoose.model('Usuario', usuarioSchema, 'usuarios');
