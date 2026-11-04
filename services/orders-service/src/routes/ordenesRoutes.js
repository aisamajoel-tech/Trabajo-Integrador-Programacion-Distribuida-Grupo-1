const express = require('express');
const router = express.Router();
const controller = require('../controllers/ordenesController');
const { autenticarJWT, requerirRol } = require('../middlewares/authMiddleware');

/**
 * TP7 — Seguridad de orders-service:
 *  - Todos los endpoints de /api/ordenes exigen un JWT válido (401 si falta, está mal formado,
 *    tiene la firma adulterada o está vencido).
 *  - Roles permitidos: USER y ADMIN.
 *  - Propiedad del recurso (sección 11.2): un USER solo compra a su nombre y solo ve sus órdenes;
 *    un ADMIN puede ver todas. Esa regla se aplica en el controller (403 si no se cumple).
 */
const autenticado = [autenticarJWT, requerirRol('USER', 'ADMIN')];

/**
 * @openapi
 * /api/ordenes:
 *   post:
 *     summary: Crear una orden de compra (punto de entrada de la compra)
 *     description: >
 *       Requiere JWT (USER o ADMIN). Si el rol es USER, la orden se asocia al `sub` del token
 *       (el `clienteId` del body es opcional; si se envía distinto del `sub` -> 403). Un ADMIN
 *       puede indicar el `clienteId` de otro cliente. El token se propaga a inventory-service.
 *       Persiste la orden como PENDIENTE, verifica el libro en catalog-service y pide el descuento
 *       a inventory-service. Termina en CONFIRMADA o RECHAZADA (con motivo). En los rechazos
 *       también se devuelve el ordenId como comprobante del intento.
 *     tags: [Órdenes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrdenInput'
 *     responses:
 *       201:
 *         description: Orden CONFIRMADA (stock descontado).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrdenConfirmada'
 *       400:
 *         description: Body inválido (VALIDACION_FALLIDA). No se crea orden.
 *       401:
 *         description: Sin token, token mal formado, firma inválida o token vencido.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: >
 *           ACCESO_DENEGADO si un USER intenta comprar a nombre de otro cliente (clienteId distinto del `sub`
 *           del token), u Orden RECHAZADA — NO_AUTORIZADO si inventory-service rechazó el JWT propagado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Orden RECHAZADA — LIBRO_INEXISTENTE.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrdenRechazada'
 *       409:
 *         description: Orden RECHAZADA — SIN_STOCK o CONCURRENCIA.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrdenRechazada'
 *       503:
 *         description: Orden RECHAZADA — SERVICIO_NO_DISPONIBLE (catálogo o inventario caído / timeout), o db_orders no disponible.
 */
router.post('/', autenticado, controller.crearOrden);

/**
 * @openapi
 * /api/ordenes/cliente/{clienteId}:
 *   get:
 *     summary: Historial de órdenes de un cliente
 *     description: >
 *       Ordenado de la más reciente a la más antigua. Si no tiene órdenes devuelve [].
 *       Un USER solo puede pedir su propio historial (`clienteId` = `sub` del token); un ADMIN, el de cualquiera.
 *     tags: [Órdenes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clienteId
 *         required: true
 *         schema: { type: string, example: cli-0042 }
 *       - in: query
 *         name: estado
 *         required: false
 *         schema: { type: string, enum: [PENDIENTE, CONFIRMADA, RECHAZADA] }
 *     responses:
 *       200:
 *         description: Lista de órdenes.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Orden'
 *       400:
 *         description: Filtro de estado inválido.
 *       401:
 *         description: Sin token, token mal formado, firma inválida o token vencido.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Un USER consulta el historial de otro cliente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/cliente/:clienteId', autenticado, controller.historialCliente);

/**
 * @openapi
 * /api/ordenes/{id}:
 *   get:
 *     summary: Consultar una orden
 *     description: >
 *       No llama a otros servicios; todo está en db_orders (incluido el libroSnapshot).
 *       Un USER solo puede ver sus propias órdenes; un ADMIN, cualquiera.
 *     tags: [Órdenes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: 6712f0a1c3b2a9e4d1f00a11 }
 *     responses:
 *       200:
 *         description: Orden encontrada.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Orden'
 *       400:
 *         description: id con formato inválido.
 *       401:
 *         description: Sin token, token mal formado, firma inválida o token vencido.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Un USER consulta una orden que no es suya.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Orden inexistente.
 */
router.get('/:id', autenticado, controller.obtenerOrden);

module.exports = router;
