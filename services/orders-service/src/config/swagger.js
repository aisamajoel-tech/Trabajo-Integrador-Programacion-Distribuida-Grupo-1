const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { SERVICE_NAME } = require('./env');

const LIBRO_ID = '6712e8f0c3b2a9e4d1f00001';
const ORDEN_ID = '6712f0a1c3b2a9e4d1f00a11';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'API de Órdenes (orders-service)',
    version: '1.0.0',
    description:
      'Microservicio que orquesta la compra (`db_orders`). Consulta a catalog-service y a inventory-service ' +
      'solo por sus APIs públicas y registra cada intento de compra con su resultado.\n\n' +
      '**Seguridad (TP7):** todos los endpoints de `/api/ordenes` requieren `Authorization: Bearer <JWT>` ' +
      'emitido por auth-service (`POST /api/auth/login`). Un `USER` solo compra a su nombre y solo ve sus órdenes; ' +
      'un `ADMIN` puede ver todas. `/health` y `/api-docs` son públicos.'
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token obtenido en auth-service: POST /api/auth/login.'
      }
    },
    parameters: {
      RequestId: {
        in: 'header',
        name: 'x-request-id',
        required: false,
        schema: { type: 'string' },
        description: 'Si no se envía, el servicio genera uno y lo propaga a catálogo e inventario.'
      }
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'No tiene permiso para acceder a esta orden.' },
          codigo: { type: 'string', example: 'ACCESO_DENEGADO' }
        }
      },
      OrdenInput: {
        type: 'object',
        required: ['libroId', 'cantidad'],
        properties: {
          clienteId: {
            type: 'string',
            example: '6720a1b2c3d4e5f600000002',
            description:
              'Opcional. Si el rol es USER, la orden se asocia siempre al `sub` del token (si se envía distinto -> 403). ' +
              'Un ADMIN puede indicar el cliente para el que compra.'
          },
          libroId: { type: 'string', example: LIBRO_ID },
          cantidad: { type: 'integer', minimum: 1, example: 1 }
        }
      },
      LibroSnapshot: {
        type: 'object',
        properties: {
          titulo: { type: 'string', example: 'Cien años de soledad' },
          autor: { type: 'string', example: 'Gabriel García Márquez' },
          isbn: { type: 'string', example: '978-0307474728' }
        }
      },
      OrdenConfirmada: {
        type: 'object',
        properties: {
          ordenId: { type: 'string', example: ORDEN_ID },
          estado: { type: 'string', example: 'CONFIRMADA' },
          clienteId: { type: 'string', example: 'cli-0042' },
          libro: {
            allOf: [
              { type: 'object', properties: { id: { type: 'string', example: LIBRO_ID } } },
              { $ref: '#/components/schemas/LibroSnapshot' }
            ]
          },
          cantidad: { type: 'integer', example: 1 },
          fechaCreacion: { type: 'string', format: 'date-time' },
          fechaResolucion: { type: 'string', format: 'date-time' }
        }
      },
      OrdenRechazada: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'No hay stock suficiente para completar la compra.' },
          codigo: { type: 'string', example: 'SIN_STOCK' },
          ordenId: { type: 'string', example: ORDEN_ID },
          estado: { type: 'string', example: 'RECHAZADA' },
          motivoRechazo: {
            type: 'string',
            enum: ['LIBRO_INEXISTENTE', 'SIN_STOCK', 'CONCURRENCIA', 'SERVICIO_NO_DISPONIBLE', 'NO_AUTORIZADO']
          },
          mensaje: { type: 'string' }
        }
      },
      Orden: {
        type: 'object',
        properties: {
          ordenId: { type: 'string', example: ORDEN_ID },
          clienteId: { type: 'string', example: 'cli-0042' },
          libroId: { type: 'string', example: LIBRO_ID },
          cantidad: { type: 'integer', example: 1 },
          estado: { type: 'string', enum: ['PENDIENTE', 'CONFIRMADA', 'RECHAZADA'] },
          motivoRechazo: { type: 'string', nullable: true },
          libroSnapshot: { $ref: '#/components/schemas/LibroSnapshot' },
          requestId: { type: 'string' },
          compensacion: { type: 'string', enum: ['NO_REQUERIDA', 'PENDIENTE', 'REALIZADA'] },
          fechaCreacion: { type: 'string', format: 'date-time' },
          fechaResolucion: { type: 'string', format: 'date-time', nullable: true }
        }
      },
      HealthResponse: {
        type: 'object',
        properties: {
          service: { type: 'string', example: SERVICE_NAME },
          status: { type: 'string', example: 'ok' },
          dependencias: {
            type: 'object',
            properties: { mongodb: { type: 'string', example: 'up' } }
          }
        }
      }
    }
  }
};

const swaggerSpec = swaggerJSDoc({
  swaggerDefinition,
  apis: [path.join(__dirname, '..', 'routes', '*.js'), path.join(__dirname, '..', 'app.js')]
});

function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: `Swagger UI - ${SERVICE_NAME}` }));
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
}

module.exports = { setupSwagger, swaggerSpec };
