/**
 * CONTROLADORES MVC (Capa Controller)
 * Reúne los controladores de cada dominio de negocio del sistema:
 * - CatalogController  (services/catalog-service/src/controllers/libroController.js)
 * - InventoryController (services/inventory-service/src/controllers/inventarioController.js)
 * - OrdersController   (services/orders-service/src/controllers/ordenController.js)
 * - AuthController     (services/auth-service/src/controllers/authController.js)
 * - ViewController     (Renderizado de la tienda web comercial en :3000)
 */
const { renderizarTiendaWeb, renderizarFavicon } = require('../views/viewRenderer');

module.exports = {
  ViewController: {
    mostrarTienda: (_req, res) => renderizarTiendaWeb(res),
    mostrarFavicon: (_req, res) => renderizarFavicon(res)
  }
};
