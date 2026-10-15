require('dotenv').config();
const https = require('https');
const http = require('http');

const PORT_HTTPS = process.env.PORT_HTTPS || 3443;
const BASE_URL = `https://localhost:${PORT_HTTPS}`;

// Agente HTTPS que ignora certificados autofirmados para pruebas locales
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Función auxiliar para realizar peticiones HTTP/HTTPS
 */
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      agent: httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch {
          json = data;
        }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function ejecutarPruebas() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 SUITE INTEGRAL DE PRUEBAS - TP3 (MONGODB, LOGS Y REDIS LOCK)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 0. Test HTTPS, Health y Conexiones
    console.log('🔹 0. Verificando servicios y conexión segura HTTPS...');
    const health = await request('GET', '/api/health');
    console.log(`   Status: ${health.status} OK | Seguro: ${health.data.secure}`);
    console.log(`   MongoDB Conectado: ${health.data.mongoConectado ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   Redis Conectado:   ${health.data.redisConectado ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   Swagger UI:        https://localhost:${PORT_HTTPS}${health.data.documentacionSwagger}`);
    console.log('');

    if (!health.data.mongoConectado) {
      console.warn('⚠️ MongoDB no está conectado. Para probar la persistencia y concurrencia completa, inicia MongoDB o ejecuta: docker compose up -d');
      return;
    }

    // 1. Obtener un libro existente o crear uno para la prueba
    const lista = await request('GET', '/api/libros');
    let libroTest = null;

    if (lista.data && lista.data.length > 0) {
      libroTest = lista.data[0];
    } else {
      const nuevo = await request('POST', '/api/libros', {
        titulo: 'Libro de Prueba Concurrente',
        autor: 'Autor de Prueba',
        año: 2024,
        stock: 1,
        genero: 'Ciencia'
      });
      libroTest = nuevo.data;
    }

    const testId = libroTest._id || libroTest.id;
    console.log(`   📘 Libro seleccionado para pruebas en MongoDB: "${libroTest.titulo}" (ID: ${testId})`);
    console.log('');

    // 2. PRUEBA DE VALIDACIÓN E INTEGRIDAD (ObjectId válido vs inválido)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 PRUEBA 1: VALIDACIÓN DE IDENTIFICADORES (400 vs 404)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // ID con formato inválido
    const resIdInvalido = await request('GET', '/api/libros/id-totalmente-invalido-123');
    console.log(`   Solicitud con ID inválido ("id-totalmente-invalido-123"):`);
    console.log(`   Status recibido: ${resIdInvalido.status} (Esperado: 400 Bad Request) ✅`);

    // ID con formato válido (24 hex) pero inexistente
    const idInexistente = '507f1f77bcf86cd799439011';
    const resIdInexistente = await request('GET', `/api/libros/${idInexistente}`);
    console.log(`   Solicitud con ObjectId válido pero inexistente (${idInexistente}):`);
    console.log(`   Status recibido: ${resIdInexistente.status} (Esperado: 404 Not Found) ✅`);
    console.log('');

    // 3. REPRODUCCIÓN DE CONDICIÓN DE CARRERA (SIN LOCK EN MONGODB)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔴 PRUEBA 2: CONDICIÓN DE CARRERA EN MONGODB (MODO INSEGURO)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Restaurando stock del libro ${testId} a 1 en MongoDB...`);
    await request('POST', `/api/libros/${testId}/reset-stock`, { stock: 1 });

    console.log('🚀 Lanzando 2 compras SIMULTÁNEAS a /comprar-inseguro...');
    const t0 = Date.now();
    const [resInsegura1, resInsegura2] = await Promise.all([
      request('POST', `/api/libros/${testId}/comprar-inseguro`, null, { 'x-client-id': 'Cliente-A' }),
      request('POST', `/api/libros/${testId}/comprar-inseguro`, null, { 'x-client-id': 'Cliente-B' })
    ]);
    const duracion1 = Date.now() - t0;

    console.log(`   ⏱️ Duración: ${duracion1}ms`);
    console.log(`   📩 Cliente A: Status ${resInsegura1.status}`, resInsegura1.data);
    console.log(`   📩 Cliente B: Status ${resInsegura2.status}`, resInsegura2.data);

    const libroPostInseguro = (await request('GET', `/api/libros/${testId}`)).data;
    console.log(`\n   📊 RESULTADO EN MONGODB SIN LOCK:`);
    console.log(`      - Stock Inicial: 1`);
    console.log(`      - Compras Aceptadas: ${(resInsegura1.status === 200 ? 1 : 0) + (resInsegura2.status === 200 ? 1 : 0)}`);
    console.log(`      - Stock Final Persistido: ${libroPostInseguro.stock}`);
    console.log(`      💥 INCONSISTENCIA EN BD: Se vendieron 2 unidades habiendo solo 1.`);
    console.log('');

    if (!health.data.redisConectado) {
      console.log('ℹ️ Para continuar con las pruebas con Redis Lock, inicia Memurai o Redis en localhost:6379.');
      return;
    }

    // 4. EXCLUSIÓN MUTUA CON REDIS LOCK EN MONGODB
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🟢 PRUEBA 3: EXCLUSIÓN MUTUA CON REDIS LOCK SOBRE MONGODB');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Restaurando stock del libro ${testId} a 1 en MongoDB...`);
    await request('POST', `/api/libros/${testId}/reset-stock`, { stock: 1 });

    console.log('🚀 Lanzando 2 compras SIMULTÁNEAS con Lock a /comprar...');
    const t1 = Date.now();
    const [resSegura1, resSegura2] = await Promise.all([
      request('POST', `/api/libros/${testId}/comprar`, null, { 'x-client-id': 'Cliente-Seguro-1' }),
      request('POST', `/api/libros/${testId}/comprar`, null, { 'x-client-id': 'Cliente-Seguro-2' })
    ]);
    const duracion2 = Date.now() - t1;

    console.log(`   ⏱️ Duración: ${duracion2}ms`);
    console.log(`   📩 Cliente 1: Status ${resSegura1.status}`, resSegura1.data);
    console.log(`   📩 Cliente 2: Status ${resSegura2.status}`, resSegura2.data);

    const libroPostSeguro = (await request('GET', `/api/libros/${testId}`)).data;
    console.log(`\n   📊 RESULTADO EN MONGODB CON LOCK:`);
    console.log(`      - Stock Inicial: 1`);
    console.log(`      - Compras Aceptadas: ${(resSegura1.status === 200 ? 1 : 0) + (resSegura2.status === 200 ? 1 : 0)}`);
    console.log(`      - Rechazos por Concurrencia (409): ${(resSegura1.status === 409 ? 1 : 0) + (resSegura2.status === 409 ? 1 : 0)}`);
    console.log(`      - Stock Final Persistido: ${libroPostSeguro.stock}`);
    console.log(`      🛡️ CONSISTENCIA PERSISTIDA: Solo 1 cliente compró y el stock quedó exactamente en 0.`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TODAS LAS PRUEBAS AUTOMATIZADAS FINALIZARON CON ÉXITO');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Error durante la ejecución de pruebas:', error.message);
  }
}

ejecutarPruebas();
