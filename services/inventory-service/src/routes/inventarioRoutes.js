const express = require('express');
const router = express.Router();
const controller = require('../controllers/inventarioController');
const { autenticarJWT, requerirRol } = require('../middlewares/authMiddleware');

/*
 * TP7 — Matriz de acceso de inventory-service:
 *  - GET /:libroId y GET /:libroId/lock-status         -> públicos
 *  - POST / (alta) y POST /:libroId/reponer             -> solo ADMIN
 *  - POST /:libroId/descontar y POST /:libroId/revertir -> autenticados (USER o ADMIN)
 * Sin token o token inválido/vencido -> 401 · rol no permitido -> 403.
 */
const soloAdmin = [autenticarJWT, requerirRol('ADMIN')];
const autenticado = [autenticarJWT, requerirRol('USER', 'ADMIN')];

/**
 * @openapi
 * /api/inventario:
 *   post:
 *     summary: Crear el registro de stock de un libro (solo ADMIN)
 *     description: >
 *       Da de alta el saldo inicial de un libro. El libroId es una referencia lógica al catálogo.
 *       Si CATALOG_SERVICE_URL está configurada, antes verifica por HTTP que el libro exista.
 *     tags: [Inventario]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RequestId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AltaStockInput'
 *     responses:
 *       201:
 *         description: Registro de stock creado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stock'
 *       400: { $ref: '#/components/responses/Invalido' }
 *       409:
 *         description: El libro ya tiene registro de stock (STOCK_YA_EXISTE).
 *       422:
 *         description: El libro no existe en el catálogo (LIBRO_INEXISTENTE).
 *       401: { $ref: '#/components/responses/NoAutenticado' }
 *       403: { $ref: '#/components/responses/SinPermiso' }
 *       503: { $ref: '#/components/responses/NoDisponible' }
 */
router.post('/', soloAdmin, controller.crearStock);

/**
 * @openapi
 * /api/inventario/{libroId}:
 *   get:
 *     summary: Consultar la disponibilidad de un libro
 *     tags: [Inventario]
 *     parameters:
 *       - $ref: '#/components/parameters/LibroId'
 *     responses:
 *       200:
 *         description: Stock disponible.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stock'
 *       400: { $ref: '#/components/responses/Invalido' }
 *       404: { $ref: '#/components/responses/SinStock' }
 *       503: { $ref: '#/components/responses/NoDisponible' }
 */
router.get('/:libroId', controller.consultarStock);

/**
 * @openapi
 * /api/inventario/{libroId}/descontar:
 *   post:
 *     summary: Descontar stock con exclusión mutua (USER o ADMIN)
 *     description: >
 *       Sección crítica protegida con SET lock:libro:{id} NX PX LOCK_TTL_MS y liberación con script Lua.
 *       Si el lock está ocupado reintenta brevemente; si sigue ocupado responde 409.
 *       Si se envía ordenId, el descuento es idempotente (no descuenta dos veces la misma orden).
 *     tags: [Concurrencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/LibroId'
 *       - $ref: '#/components/parameters/RequestId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DescontarInput'
 *     responses:
 *       200:
 *         description: Descuento aplicado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DescontarResponse'
 *       400:
 *         description: Stock insuficiente (STOCK_INSUFICIENTE) o datos inválidos.
 *       404: { $ref: '#/components/responses/SinStock' }
 *       409:
 *         description: Lock ocupado por otra operación concurrente (LOCK_OCUPADO).
 *       401: { $ref: '#/components/responses/NoAutenticado' }
 *       403: { $ref: '#/components/responses/SinPermiso' }
 *       503: { $ref: '#/components/responses/NoDisponible' }
 */
router.post('/:libroId/descontar', autenticado, controller.descontarStock);

/**
 * @openapi
 * /api/inventario/{libroId}/reponer:
 *   post:
 *     summary: Reponer stock (solo ADMIN; reemplaza a reset-stock del monolito)
 *     description: >
 *       Con { cantidad } suma unidades. Con { stock } fija el saldo en ese valor (útil para reiniciar pruebas).
 *       Si llegan ambos campos, se aplica stock.
 *     tags: [Inventario]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/LibroId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReponerInput'
 *     responses:
 *       200:
 *         description: Stock actualizado.
 *       400: { $ref: '#/components/responses/Invalido' }
 *       404: { $ref: '#/components/responses/SinStock' }
 *       409:
 *         description: Lock ocupado (LOCK_OCUPADO).
 *       401: { $ref: '#/components/responses/NoAutenticado' }
 *       403: { $ref: '#/components/responses/SinPermiso' }
 *       503: { $ref: '#/components/responses/NoDisponible' }
 */
router.post('/:libroId/reponer', soloAdmin, controller.reponerStock);

/**
 * @openapi
 * /api/inventario/{libroId}/revertir:
 *   post:
 *     summary: Revertir el descuento de una orden (USER o ADMIN)
 *     description: Devuelve las unidades solo si ese ordenId descontó stock y todavía no fue revertido.
 *     tags: [Concurrencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/LibroId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ordenId]
 *             properties:
 *               ordenId: { type: string, example: '6712f0a1c3b2a9e4d1f00a11' }
 *     responses:
 *       200:
 *         description: Resultado de la compensación (revertido true/false).
 *       400: { $ref: '#/components/responses/Invalido' }
 *       404: { $ref: '#/components/responses/SinStock' }
 *       401: { $ref: '#/components/responses/NoAutenticado' }
 *       403: { $ref: '#/components/responses/SinPermiso' }
 *       503: { $ref: '#/components/responses/NoDisponible' }
 */
router.post('/:libroId/revertir', autenticado, controller.revertirDescuento);

/**
 * @openapi
 * /api/inventario/{libroId}/lock-status:
 *   get:
 *     summary: Diagnóstico del lock en Redis
 *     description: Indica si hay un lock activo para el libro y su TTL restante en milisegundos.
 *     tags: [Concurrencia]
 *     parameters:
 *       - $ref: '#/components/parameters/LibroId'
 *     responses:
 *       200:
 *         description: Estado del lock.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LockStatus'
 *       400: { $ref: '#/components/responses/Invalido' }
 *       503: { $ref: '#/components/responses/NoDisponible' }
 */
router.get('/:libroId/lock-status', controller.estadoLock);

module.exports = router;
