const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { SERVICE_NAME } = require('./env');

const LIBRO_ID_EJEMPLO = '6712e8f0c3b2a9e4d1f00001';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'API de Inventario (inventory-service)',
    version: '1.0.0',
    description:
      'Microservicio responsable de las existencias de cada libro (`db_inventory`) y de evitar la sobreventa ' +
      'con un lock distribuido en Redis/Memurai. Trabaja solo con `libroId`: no guarda datos bibliográficos.'
  },
  components: {
    parameters: {
      LibroId: {
        in: 'path',
        name: 'libroId',
        required: true,
        schema: { type: 'string', example: LIBRO_ID_EJEMPLO },
        description: 'ObjectId del libro en catalog-service (referencia lógica)'
      },
      RequestId: {
        in: 'header',
        name: 'x-request-id',
        required: false,
        schema: { type: 'string' },
        description: 'Identificador para trazar la operación entre servicios'
      }
    },
    schemas: {
      Stock: {
        type: 'object',
        properties: {
          libroId: { type: 'string', example: LIBRO_ID_EJEMPLO },
          stockDisponible: { type: 'integer', minimum: 0, example: 5 },
          ultimaActualizacion: { type: 'string', format: 'date-time' }
        }
      },
      AltaStockInput: {
        type: 'object',
        required: ['libroId', 'stockInicial'],
        properties: {
          libroId: { type: 'string', example: LIBRO_ID_EJEMPLO },
          stockInicial: { type: 'integer', minimum: 0, example: 5 }
        }
      },
      DescontarInput: {
        type: 'object',
        required: ['cantidad'],
        properties: {
          cantidad: { type: 'integer', minimum: 1, example: 1 },
          clienteId: { type: 'string', example: 'cliente-123' },
          ordenId: {
            type: 'string',
            description: 'Opcional. Si se envía, el descuento es idempotente.',
            example: '6712f0a1c3b2a9e4d1f00a11'
          }
        }
      },
      DescontarResponse: {
        type: 'object',
        properties: {
          libroId: { type: 'string', example: LIBRO_ID_EJEMPLO },
          stockPrevio: { type: 'integer', example: 5 },
          cantidadDescontada: { type: 'integer', example: 1 },
          stockRestante: { type: 'integer', example: 4 },
          clienteId: { type: 'string', example: 'cliente-123' }
        }
      },
      ReponerInput: {
        type: 'object',
        properties: {
          cantidad: { type: 'integer', minimum: 1, example: 10, description: 'Unidades a sumar' },
          stock: { type: 'integer', minimum: 0, example: 1, description: 'Fija el saldo en este valor' }
        }
      },
      LockStatus: {
        type: 'object',
        properties: {
          libroId: { type: 'string', example: LIBRO_ID_EJEMPLO },
          bloqueado: { type: 'boolean', example: false },
          key: { type: 'string', example: `lock:libro:${LIBRO_ID_EJEMPLO}` },
          token: { type: 'string', nullable: true },
          ttlRestanteMs: { type: 'integer', example: 0 }
        }
      },
      HealthResponse: {
        type: 'object',
        properties: {
          service: { type: 'string', example: SERVICE_NAME },
          status: { type: 'string', example: 'ok' },
          dependencias: {
            type: 'object',
            properties: {
              mongodb: { type: 'string', example: 'up' },
              redis: { type: 'string', example: 'up' }
            }
          }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Stock insuficiente para realizar la operación.' },
          codigo: { type: 'string', example: 'STOCK_INSUFICIENTE' }
        }
      }
    },
    responses: {
      Invalido: {
        description: 'Datos o libroId inválidos (ID_INVALIDO / VALIDACION_FALLIDA).',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
      },
      SinStock: {
        description: 'No existe registro de stock para el libro (STOCK_NO_ENCONTRADO).',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
      },
      NoDisponible: {
        description: 'MongoDB o Redis no disponibles (DB_NO_DISPONIBLE / REDIS_NO_DISPONIBLE).',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
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
