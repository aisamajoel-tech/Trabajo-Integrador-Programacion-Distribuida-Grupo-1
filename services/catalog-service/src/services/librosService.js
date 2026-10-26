const Libro = require('../models/Libro');

/**
 * Extrae únicamente los atributos bibliográficos permitidos,
 * descartando cualquier campo ajeno al dominio como `stock`.
 */
function sanitizarDatosLibro(datos = {}) {
  const { titulo, autor, año, genero, isbn } = datos;
  const limpio = {};
  if (titulo !== undefined) limpio.titulo = titulo;
  if (autor !== undefined) limpio.autor = autor;
  if (año !== undefined) limpio.año = año;
  if (genero !== undefined) limpio.genero = genero;
  if (isbn !== undefined) limpio.isbn = isbn;
  return limpio;
}

/**
 * Lista los libros aplicando filtros opcionales de género y autor
 */
async function listarLibros(filtros = {}) {
  const query = {};
  if (filtros.genero) {
    query.genero = filtros.genero;
  }
  if (filtros.autor) {
    query.autor = { $regex: filtros.autor, $options: 'i' };
  }
  if (filtros.titulo) {
    query.titulo = { $regex: filtros.titulo, $options: 'i' };
  }

  return Libro.find(query).sort({ createdAt: -1 });
}

/**
 * Obtiene un libro por su ObjectId
 */
async function obtenerLibroPorId(id) {
  return Libro.findById(id);
}

/**
 * Crea un nuevo libro en el catálogo (sin stock)
 */
async function crearLibro(datos) {
  const datosLimpios = sanitizarDatosLibro(datos);
  const nuevoLibro = new Libro(datosLimpios);
  return nuevoLibro.save();
}

/**
 * Actualiza los datos bibliográficos de un libro existente
 */
async function actualizarLibro(id, datos) {
  const datosLimpios = sanitizarDatosLibro(datos);
  return Libro.findByIdAndUpdate(id, datosLimpios, {
    new: true,
    runValidators: true
  });
}

/**
 * Elimina un libro del catálogo por su ObjectId
 */
async function eliminarLibro(id) {
  return Libro.findByIdAndDelete(id);
}

module.exports = {
  listarLibros,
  obtenerLibroPorId,
  crearLibro,
  actualizarLibro,
  eliminarLibro
};
