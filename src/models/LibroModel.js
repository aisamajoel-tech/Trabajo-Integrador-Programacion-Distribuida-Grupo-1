/**
 * MODELO MVC: LibroModel (catalog-service - Base de datos independiente: db_catalog)
 * Responsabilidad única: Gestionar exclusivamente los metadatos editoriales de las obras.
 * No almacena ni conoce el stock físico ni tiene acoplamiento con Redis.
 */
const crypto = require('crypto');

class LibroModel {
  constructor(storage) {
    this.storage = storage;
  }

  listar({ genero, autor } = {}) {
    let lista = [...this.storage.obtenerCatalog().libros];
    if (genero) {
      lista = lista.filter((l) => l.genero.toLowerCase() === String(genero).toLowerCase());
    }
    if (autor) {
      lista = lista.filter((l) => l.autor.toLowerCase().includes(String(autor).toLowerCase()));
    }
    return lista;
  }

  buscarPorId(id) {
    return this.storage.obtenerCatalog().libros.find((l) => l.id === id) || null;
  }

  buscarPorIsbn(isbn) {
    return this.storage.obtenerCatalog().libros.find((l) => l.isbn === String(isbn).trim()) || null;
  }

  crear({ titulo, autor, año, genero = 'Novela', isbn }) {
    const db = this.storage.obtenerCatalog();
    const nuevo = {
      id: crypto.randomBytes(12).toString('hex'),
      titulo: String(titulo).trim(),
      autor: String(autor).trim(),
      año: Number(año),
      genero: String(genero).trim(),
      isbn: String(isbn).trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.libros.push(nuevo);
    this.storage.guardar('catalog', db);
    return nuevo;
  }

  actualizar(id, campos) {
    const db = this.storage.obtenerCatalog();
    const idx = db.libros.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    db.libros[idx] = {
      ...db.libros[idx],
      ...(campos.titulo ? { titulo: String(campos.titulo).trim() } : {}),
      ...(campos.autor ? { autor: String(campos.autor).trim() } : {}),
      ...(campos.año ? { año: Number(campos.año) } : {}),
      ...(campos.genero ? { genero: String(campos.genero).trim() } : {}),
      ...(campos.isbn ? { isbn: String(campos.isbn).trim() } : {}),
      updatedAt: new Date().toISOString()
    };
    this.storage.guardar('catalog', db);
    return db.libros[idx];
  }

  eliminar(id) {
    const db = this.storage.obtenerCatalog();
    const idx = db.libros.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    const [eliminado] = db.libros.splice(idx, 1);
    this.storage.guardar('catalog', db);
    return eliminado;
  }
}

module.exports = LibroModel;
