/**
 * ENRUTADORES MVC (Capa Routes)
 * Define el mapa de rutas HTTP de cada servicio dentro de la arquitectura:
 * - /api/libros             -> catalogRoutes   (Puerto 3001)
 * - /api/inventario         -> inventoryRoutes (Puerto 3002)
 * - /api/ordenes            -> ordersRoutes    (Puerto 3003)
 * - /api/auth               -> authRoutes      (Puerto 3004)
 * - /                       -> portalRoutes    (Puerto 3000 - Vista Tienda Web)
 */
const { PORTS } = require('../config/env');

module.exports = {
  MAPA_RUTAS_MVC: {
    webPortal: { puerto: PORTS.WEB_PORTAL, prefijo: '/', vista: 'services/web-portal/public/index.html' },
    catalogService: { puerto: PORTS.CATALOG_SERVICE, prefijo: '/api/libros', controlador: 'libroController.js', modelo: 'Libro.js' },
    inventoryService: { puerto: PORTS.INVENTORY_SERVICE, prefijo: '/api/inventario', controlador: 'inventarioController.js', modelo: 'Inventario.js' },
    ordersService: { puerto: PORTS.ORDERS_SERVICE, prefijo: '/api/ordenes', controlador: 'ordenController.js', modelo: 'Orden.js' },
    authService: { puerto: PORTS.AUTH_SERVICE, prefijo: '/api/auth', controlador: 'authController.js', modelo: 'Usuario.js' }
  }
};
