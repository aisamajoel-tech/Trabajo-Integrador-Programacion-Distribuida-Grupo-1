const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { autenticarJWT, requerirRol } = require('../middlewares/authMiddleware');

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Registrar un nuevo usuario
 *     description: >
 *       Valida los datos obligatorios, impide correos duplicados (409), genera el hash de la contraseña
 *       con bcrypt y persiste el usuario en `db_auth`. Nunca devuelve la contraseña ni su hash.
 *       El registro público asigna siempre el rol `USER`. Para registrar otro `ADMIN` se requiere enviar
 *       un token Bearer perteneciente a un `ADMIN`.
 *     tags:
 *       - Autenticación e Identidad
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente (sin password ni passwordHash).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegisterResponse'
 *       400:
 *         description: Datos de entrada inválidos.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Intento de auto-asignarse rol ADMIN sin estar autenticado como ADMIN.
 *       409:
 *         description: El email ya se encuentra registrado (`USUARIO_YA_EXISTE`).
 */
router.post('/register', authController.register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Autenticar credenciales y obtener un access token JWT
 *     description: >
 *       Compara la contraseña recibida contra el `passwordHash` almacenado en `db_auth` mediante `bcrypt.compare`.
 *       Si las credenciales son válidas y la cuenta está activa, emite un JWT firmado (`HS256`) con los claims
 *       `sub`, `email`, `role`, `iss`, `iat` y `exp`.
 *     tags:
 *       - Autenticación e Identidad
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Credenciales válidas. Retorna el access token JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Payload inválido o campos faltantes.
 *       401:
 *         description: Credenciales inválidas (usuario inexistente o password incorrecta, sin revelar cuál falló).
 *       403:
 *         description: Cuenta de usuario deshabilitada (`activo: false`).
 */
router.post('/login', authController.login);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Consultar identidad autenticada a partir del JWT
 *     description: Verifica el token Bearer enviado y devuelve los datos públicos del usuario y los claims del token.
 *     tags:
 *       - Autenticación e Identidad
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil de la identidad autenticada.
 *       401:
 *         description: Sin token, token mal formado, firma inválida o token vencido.
 */
router.get('/me', autenticarJWT, authController.me);

/**
 * @openapi
 * /api/auth/usuarios/{id}/estado:
 *   patch:
 *     summary: Habilitar/deshabilitar una cuenta o cambiar su rol (Solo ADMIN)
 *     description: Operación restringida al rol `ADMIN` para activar/desactivar usuarios (`activo`) o administrar roles.
 *     tags:
 *       - Administración de Identidades
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId del usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               activo:
 *                 type: boolean
 *                 example: false
 *               role:
 *                 type: string
 *                 enum: [USER, ADMIN]
 *                 example: USER
 *     responses:
 *       200:
 *         description: Estado del usuario actualizado.
 *       401:
 *         description: Token ausente, inválido o vencido.
 *       403:
 *         description: Permisos insuficientes (requiere rol ADMIN).
 *       404:
 *         description: Usuario no encontrado.
 */
router.patch('/usuarios/:id/estado', autenticarJWT, requerirRol('ADMIN'), authController.actualizarEstado);

module.exports = router;
