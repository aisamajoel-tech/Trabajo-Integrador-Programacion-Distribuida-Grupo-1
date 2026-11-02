const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { SERVICE_NAME } = require('./env');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'API de Identidad y Autenticación JWT (auth-service)',
    version: '1.0.0',
    description:
      'Microservicio autoridad de identidades y credenciales (`db_auth`). ' +
      'Gestiona el registro seguro de usuarios con hash `bcrypt`, la autenticación de credenciales y la emisión de access tokens JWT firmados (`HS256`).'
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Ingrese el access token JWT obtenido en POST /api/auth/login'
      }
    },
    schemas: {
      RegisterInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'cliente@libreria.com'
          },
          password: {
            type: 'string',
            minLength: 6,
            example: 'Cliente123!'
          },
          nombre: {
            type: 'string',
            example: 'Cliente Demo'
          }
        }
      },
      UsuarioPublico: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            example: '6720a1b2c3d4e5f600000001'
          },
          email: {
            type: 'string',
            example: 'cliente@libreria.com'
          },
          nombre: {
            type: 'string',
            example: 'Cliente Demo'
          },
          role: {
            type: 'string',
            enum: ['USER', 'ADMIN'],
            example: 'USER'
          },
          activo: {
            type: 'boolean',
            example: true
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      RegisterResponse: {
        type: 'object',
        properties: {
          mensaje: {
            type: 'string',
            example: 'Usuario registrado exitosamente.'
          },
          usuario: {
            $ref: '#/components/schemas/UsuarioPublico'
          }
        }
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'admin@libreria.com'
          },
          password: {
            type: 'string',
            example: 'Admin1234!'
          }
        }
      },
      LoginResponse: {
        type: 'object',
        properties: {
          accessToken: {
            type: 'string',
            description: 'Token JWT firmado con HS256',
            example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
          },
          tokenType: {
            type: 'string',
            example: 'Bearer'
          },
          expiresIn: {
            type: 'string',
            example: '1h'
          },
          claims: {
            type: 'object',
            properties: {
              sub: { type: 'string', example: '6720a1b2c3d4e5f600000001' },
              email: { type: 'string', example: 'admin@libreria.com' },
              role: { type: 'string', example: 'ADMIN' },
              iss: { type: 'string', example: 'auth-service-grupo1' },
              iat: { type: 'integer', example: 1793300000 },
              exp: { type: 'integer', example: 1793303600 }
            }
          },
          usuario: {
            $ref: '#/components/schemas/UsuarioPublico'
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
          },
          dependencias: {
            type: 'object',
            properties: {
              mongodb: { type: 'string', example: 'up' }
            }
          }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            example: 'Credenciales inválidas.'
          },
          codigo: {
            type: 'string',
            example: 'CREDENCIALES_INVALIDAS'
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
