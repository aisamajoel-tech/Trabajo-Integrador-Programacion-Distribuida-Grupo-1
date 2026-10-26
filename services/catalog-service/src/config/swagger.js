const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { SERVICE_NAME } = require('./env');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'API de Catálogo Bibliográfico (catalog-service)',
    version: '1.0.0',
    description:
      'Microservicio responsable de la gestión del catálogo bibliográfico (`db_catalog`). ' +
      'Administra altas, bajas, modificaciones y consultas de obras literarias sin acoplamiento con el stock ni con Redis.'
  },
  components: {
    schemas: {
      Libro: {
        type: 'object',
        required: ['titulo', 'autor', 'año', 'genero', 'isbn'],
        properties: {
          id: {
            type: 'string',
            description: 'Identificador único del libro en MongoDB (ObjectId)',
            example: '6712e8f0c3b2a9e4d1f00001'
          },
          titulo: {
            type: 'string',
            minLength: 1,
            maxLength: 150,
            description: 'Título oficial de la obra',
            example: 'Cien años de soledad'
          },
          autor: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Nombre del autor o autores',
            example: 'Gabriel García Márquez'
          },
          año: {
            type: 'integer',
            minimum: 1000,
            maximum: new Date().getFullYear() + 1,
            description: 'Año de publicación original',
            example: 1967
          },
          genero: {
            type: 'string',
            enum: ['Ficción', 'Novela', 'Historia', 'Ciencia', 'Terror', 'Fantasía', 'Otro'],
            description: 'Categoría bibliográfica controlada',
            example: 'Novela'
          },
          isbn: {
            type: 'string',
            description: 'Código ISBN único de 10 o 13 dígitos',
            example: '978-0307474728'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-10-26T12:00:00.000Z'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-10-26T12:00:00.000Z'
          }
        }
      },
      LibroInput: {
        type: 'object',
        required: ['titulo', 'autor', 'año', ' isbn'.trim()],
        properties: {
          titulo: {
            type: 'string',
            minLength: 1,
            maxLength: 150,
            example: 'Rayuela'
          },
          autor: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            example: 'Julio Cortázar'
          },
          año: {
            type: 'integer',
            minimum: 1000,
            example: 1963
          },
          genero: {
            type: 'string',
            enum: ['Ficción', 'Novela', 'Historia', 'Ciencia', 'Terror', 'Fantasía', 'Otro'],
            example: 'Novela'
          },
          isbn: {
            type: 'string',
            example: '978-8437604572'
          }
        }
      },
      HealthResponse: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            example: SERVICE_NAME
          },
          status: {
            type: 'string',
            example: 'ok'
          }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            example: 'Recurso solicitado inexistente.'
          },
          codigo: {
            type: 'string',
            example: 'LIBRO_NO_ENCONTRADO'
          },
          detalles: {
            type: 'array',
            items: {
              type: 'string'
            }
          }
        }
      }
    }
  }
};

const options = {
  swaggerDefinition,
  apis: [
    path.join(__dirname, '..', 'routes', '*.js'),
    path.join(__dirname, '..', 'app.js')
  ]
};

const swaggerSpec = swaggerJSDoc(options);

function setupSwagger(app) {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: `Swagger UI - ${SERVICE_NAME}`
    })
  );

  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

module.exports = { setupSwagger, swaggerSpec };
