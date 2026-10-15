const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const PORT_HTTP = process.env.PORT_HTTP || 3000;
const PORT_HTTPS = process.env.PORT_HTTPS || 3443;

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'API REST de Gestión de Libros - Programación Distribuida',
    version: '3.0.0',
    description: `API RESTful desarrollada con **Node.js, Express, MongoDB (Mongoose), Winston y Redis (Distributed Lock)**.
Permite realizar operaciones CRUD sobre una biblioteca de libros con persistencia de datos, auditoría mediante logging estructurado y control de concurrencia para evitar condiciones de carrera.`,
    contact: {
      name: 'Cátedra de Programación Distribuida',
      url: 'https://localhost:3443'
    }
  },
  servers: [
    {
      url: `https://localhost:${PORT_HTTPS}`,
      description: 'Servidor HTTPS Seguro (Entorno de Desarrollo Local)'
    },
    {
      url: `http://localhost:${PORT_HTTP}`,
      description: 'Servidor HTTP Tradicional'
    }
  ],
  components: {
    schemas: {
      Libro: {
        type: 'object',
        required: ['titulo', 'autor', 'año', 'stock'],
        properties: {
          id: {
            type: 'string',
            description: 'Identificador único generado por MongoDB (ObjectId)',
            example: '64f8a123b456c789d01234ef'
          },
          titulo: {
            type: 'string',
            minLength: 1,
            maxLength: 150,
            description: 'Título de la obra',
            example: 'Cien años de soledad'
          },
          autor: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Autor del libro',
            example: 'Gabriel García Márquez'
          },
          año: {
            type: 'integer',
            minimum: 1000,
            maximum: 2027,
            description: 'Año de publicación original',
            example: 1967
          },
          stock: {
            type: 'integer',
            minimum: 0,
            description: 'Cantidad de ejemplares disponibles (recurso compartido)',
            example: 5
          },
          genero: {
            type: 'string',
            enum: ['Ficción', 'Novela', 'Historia', 'Ciencia', 'Terror', 'Fantasía', 'Otro'],
            description: 'Género o categoría del libro',
            example: 'Novela'
          },
          isbn: {
            type: 'string',
            description: 'Código ISBN único (10 o 13 dígitos)',
            example: '978-0307474728'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-09-03T18:00:00.000Z'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-09-03T18:30:00.000Z'
          }
        }
      },
      LibroInput: {
        type: 'object',
        required: ['titulo', 'autor', 'año'],
        properties: {
          titulo: {
            type: 'string',
            example: 'El Principito'
          },
          autor: {
            type: 'string',
            example: 'Antoine de Saint-Exupéry'
          },
          año: {
            type: 'integer',
            example: 1943
          },
          stock: {
            type: 'integer',
            example: 3
          },
          genero: {
            type: 'string',
            enum: ['Ficción', 'Novela', 'Historia', 'Ciencia', 'Terror', 'Fantasía', 'Otro'],
            example: 'Ficción'
          },
          isbn: {
            type: 'string',
            example: '978-0156012195'
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
          detalle: {
            type: 'string',
            example: 'Información adicional sobre la causa del error.'
          }
        }
      }
    }
  }
};

const options = {
  swaggerDefinition,
  apis: ['./routes/*.js']
};

const swaggerSpec = swaggerJSDoc(options);

function setupSwagger(app) {
  // Ruta interactiva Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Swagger UI - API Libros'
  }));

  // Ruta para obtener la especificación OpenAPI en JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

module.exports = {
  setupSwagger,
  swaggerSpec
};
