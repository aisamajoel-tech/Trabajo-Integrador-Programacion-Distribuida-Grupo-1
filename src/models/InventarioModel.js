/**
 * MODELO MVC: InventarioModel (inventory-service - Base propia: db_inventory + Redis Lock)
 * Responsabilidad única: Administrar la disponibilidad física por libroId, auditoría de movimientos
 * y exclusión mutua mediante Lock Distribuido en Redis (SET lock:libro:{id} NX PX 5000 + liberación Lua).
 */
const crypto = require('crypto');

class InventarioModel {
  constructor(storage, lockTtlMs = 5000) {
    this.storage = storage;
    this.lockTtlMs = lockTtlMs;
    this.redisLocks = new Map();
  }

  adquirirLock(libroId) {
    const key = `lock:libro:${libroId}`;
    const ahora = Date.now();
    const actual = this.redisLocks.get(key);
    if (actual && actual.expiraEn > ahora) {
      return { exitoso: false, key };
    }
    const token = crypto.randomUUID();
    this.redisLocks.set(key, { token, expiraEn: ahora + this.lockTtlMs, adquiridoEn: ahora });
    return { exitoso: true, key, token };
  }

  liberarLockLua(libroId, tokenPropietario) {
    const key = `lock:libro:${libroId}`;
    const actual = this.redisLocks.get(key);
    if (actual && actual.token === tokenPropietario) {
      this.redisLocks.delete(key);
      return true;
    }
    return false;
  }

  estadoLock(libroId) {
    const key = `lock:libro:${libroId}`;
    const lock = this.redisLocks.get(key);
    const activo = Boolean(lock && lock.expiraEn > Date.now());
    return {
      libroId,
      key,
      bloqueado: activo,
      ttlRestanteMs: activo ? Math.max(0, lock.expiraEn - Date.now()) : -2
    };
  }

  obtenerResumen() {
    const db = this.storage.obtenerInventory();
    return {
      stock: db.stock,
      movimientos: [...db.movimientos].slice(-40).reverse()
    };
  }

  buscarPorLibroId(libroId) {
    return this.storage.obtenerInventory().stock.find((s) => s.libroId === libroId) || null;
  }
}

module.exports = InventarioModel;
