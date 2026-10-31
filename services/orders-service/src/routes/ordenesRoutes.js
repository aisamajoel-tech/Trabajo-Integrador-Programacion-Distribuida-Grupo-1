const express = require('express');
const router = express.Router();
const controller = require('../controllers/ordenesController');

/**
 * @openapi
 * /api/ordenes:
 *   post:
 *     summary: Crear una orden de compra (punto de entrada de la compra)
 *     description: >
 *       Persiste la orden como PENDIENTE, verifica el libro en catalog-service y pide el descuento
 *       a inventory-service. Termina en CONFIRMADA o RECHAZADA (con motivo). En los rechazos
 *       también se devuelve el ordenId como comprobante del intento.
 *     tags: [Órdenes]
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
router.post('/', controller.crearOrden);

/**
 * @openapi
 * /api/ordenes/cliente/{clienteId}:
 *   get:
 *     summary: Historial de órdenes de un cliente
 *     description: Ordenado de la más reciente a la más antigua. Si no tiene órdenes devuelve [].
 *     tags: [Órdenes]
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
 */
router.get('/cliente/:clienteId', controller.historialCliente);

/**
 * @openapi
 * /api/ordenes/{id}:
 *   get:
 *     summary: Consultar una orden
 *     description: No llama a otros servicios; todo está en db_orders (incluido el libroSnapshot).
 *     tags: [Órdenes]
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
 *       404:
 *         description: Orden inexistente.
 */
router.get('/:id', controller.obtenerOrden);

module.exports = router;
