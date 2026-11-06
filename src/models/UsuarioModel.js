/**
 * MODELO MVC: UsuarioModel (auth-service - Base propia: db_auth)
 * Responsabilidad única: Administrar las cuentas de usuarios con contraseñas encriptadas
 * con hash bcrypt (10 rondas de salt) y roles RBAC (USER | ADMIN).
 */
const crypto = require('crypto');

class UsuarioModel {
  constructor(storage, bcrypt) {
    this.storage = storage;
    this.bcrypt = bcrypt;
  }

  buscarPorEmail(email) {
    const norm = String(email || '').trim().toLowerCase();
    return this.storage.obtenerAuth().usuarios.find((u) => u.email === norm) || null;
  }

  buscarPorId(id) {
    return this.storage.obtenerAuth().usuarios.find((u) => u.id === id) || null;
  }

  async crear({ email, password, nombre, role = 'USER' }) {
    const db = this.storage.obtenerAuth();
    const emailNorm = String(email).trim().toLowerCase();
    const passwordHash = await this.bcrypt.hash(String(password), 10);
    const nuevo = {
      id: crypto.randomBytes(12).toString('hex'),
      email: emailNorm,
      nombre: String(nombre || emailNorm.split('@')[0]).trim(),
      passwordHash,
      role: String(role).toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER',
      activo: true,
      createdAt: new Date().toISOString()
    };
    db.usuarios.push(nuevo);
    this.storage.guardar('auth', db);
    return nuevo;
  }
}

module.exports = UsuarioModel;
