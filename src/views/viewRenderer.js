/**
 * VISTA MVC: ViewRenderer (Capa de Presentación - Tienda Web NovaLectura)
 * Responsabilidad única: Renderizar la vista HTML de la tienda comercial (index.html)
 * y entregar los recursos gráficos propios del portal.
 */
const fs = require('fs');
const { PATHS } = require('../config/env');

const BOOKSTORE_SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1e3a8a"/><path d="M16 18c6 0 11 2 16 6 5-4 10-6 16-6v28c-6 0-11 2-16 6-5-4-10-6-16-6V18z" fill="#ffffff"/></svg>`;

function renderizarTiendaWeb(res) {
  if (fs.existsSync(PATHS.VIEW_TIENDA)) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    });
    return res.end(fs.readFileSync(PATHS.VIEW_TIENDA, 'utf8'));
  }
  res.writeHead(404);
  return res.end('Vista de tienda no encontrada.');
}

function renderizarFavicon(res) {
  res.writeHead(200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Clear-Site-Data': '"cache"'
  });
  return res.end(BOOKSTORE_SVG_ICON);
}

module.exports = {
  renderizarTiendaWeb,
  renderizarFavicon
};
