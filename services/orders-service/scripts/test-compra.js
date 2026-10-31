/**
 * Prueba de punta a punta de orders-service (con catalog-service e inventory-service levantados).
 *
 *  1. Compra simple: una orden CONFIRMADA (201).
 *  2. Rechazos: libro inexistente (404) y stock insuficiente (409).
 *  3. Compras simultáneas a través de orders: nunca se confirman más órdenes que unidades
 *     y el stock final cuadra con las órdenes CONFIRMADAS.
 *
 * Uso:
 *   npm run test:compra
 *   ORDERS_SERVICE_URL=http://localhost:3003 COMPRADORES=15 STOCK_INICIAL=4 npm run test:compra
 *
 * Variables opcionales: ORDERS_SERVICE_URL (3003), CATALOG_SERVICE_URL (3001),
 * INVENTORY_SERVICE_URL (3002), COMPRADORES (15), STOCK_INICIAL (4).
 * Sale con código 1 si algo no cuadra.
 */
require('dotenv').config();
const crypto = require('crypto');

const url = (v, def) => (process.env[v] || def).replace(/\/$/, '');
const ORDERS = url('ORDERS_SERVICE_URL', 'http://localhost:3003');
const CATALOG = url('CATALOG_SERVICE_URL', 'http://localhost:3001');
const INVENTORY = url('INVENTORY_SERVICE_URL', 'http://localhost:3002');
const COMPRADORES = parseInt(process.env.COMPRADORES, 10) || 15;
const STOCK_INICIAL = parseInt(process.env.STOCK_INICIAL, 10) || 4;
const LINEA = '━'.repeat(64);

async function request(method, fullUrl, body) {
  const res = await fetch(fullUrl, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-request-id': `test-${crypto.randomUUID()}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

const comprar = (libroId, cantidad, clienteId) =>
  request('POST', `${ORDERS}/api/ordenes`, { clienteId, libroId, cantidad });

async function prepararLibro() {
  const isbn = `978${String(Date.now()).slice(-10)}`;
  const libro = await request('POST', `${CATALOG}/api/libros`, {
    titulo: 'Libro de prueba de órdenes',
    autor: 'Grupo 1',
    año: 2026,
    genero: 'Otro',
    isbn
  });
  if (libro.status !== 201) throw new Error(`No se pudo crear el libro (HTTP ${libro.status}): ${JSON.stringify(libro.data)}`);
  const libroId = libro.data.id || libro.data._id;

  const stock = await request('POST', `${INVENTORY}/api/inventario`, { libroId, stockInicial: 0 });
  if (stock.status !== 201) throw new Error(`No se pudo crear el stock (HTTP ${stock.status}): ${JSON.stringify(stock.data)}`);
  return libroId;
}

async function fijarStock(libroId, stock) {
  const r = await request('POST', `${INVENTORY}/api/inventario/${libroId}/reponer`, { stock });
  if (r.status !== 200) throw new Error(`No se pudo fijar el stock (HTTP ${r.status})`);
}

const stockActual = async (libroId) => (await request('GET', `${INVENTORY}/api/inventario/${libroId}`)).data.stockDisponible;

function check(condicion, texto) {
  console.log(`   ${condicion ? '✅' : '❌'} ${texto}`);
  return condicion;
}

async function main() {
  console.log(LINEA);
  console.log('🧪 PRUEBA DE COMPRAS — orders-service');
  console.log(`   orders: ${ORDERS} · catalog: ${CATALOG} · inventory: ${INVENTORY}`);
  console.log(LINEA);

  for (const [nombre, base] of [['orders', ORDERS], ['catalog', CATALOG], ['inventory', INVENTORY]]) {
    const h = await request('GET', `${base}/health`);
    console.log(`   ${nombre}/health -> ${h.status} ${JSON.stringify(h.data)}`);
  }

  const libroId = await prepararLibro();
  console.log(`   Libro de prueba: ${libroId}\n`);
  const resultados = [];

  console.log(LINEA);
  console.log('🟢 PRUEBA 1: compra simple');
  console.log(LINEA);
  await fijarStock(libroId, 2);
  const ok = await comprar(libroId, 1, 'cli-test-1');
  console.log(`   POST /api/ordenes -> ${ok.status} ${ok.data?.estado} (ordenId ${ok.data?.ordenId})`);
  resultados.push(check(ok.status === 201 && ok.data?.estado === 'CONFIRMADA', 'Orden CONFIRMADA con 201'));
  const consulta = await request('GET', `${ORDERS}/api/ordenes/${ok.data?.ordenId}`);
  resultados.push(check(consulta.status === 200 && consulta.data?.libroSnapshot?.titulo, 'GET /api/ordenes/:id devuelve la orden con libroSnapshot'));

  console.log(`\n${LINEA}`);
  console.log('🟠 PRUEBA 2: rechazos');
  console.log(LINEA);
  const inexistente = await comprar('6712e8f0c3b2a9e4d1f0ffff', 1, 'cli-test-1');
  console.log(`   Libro inexistente -> ${inexistente.status} ${inexistente.data?.motivoRechazo}`);
  resultados.push(check(inexistente.status === 404 && inexistente.data?.motivoRechazo === 'LIBRO_INEXISTENTE', '404 LIBRO_INEXISTENTE'));
  const sinStock = await comprar(libroId, 50, 'cli-test-1');
  console.log(`   Pedir 50 unidades -> ${sinStock.status} ${sinStock.data?.motivoRechazo}`);
  resultados.push(check(sinStock.status === 409 && sinStock.data?.motivoRechazo === 'SIN_STOCK', '409 SIN_STOCK'));
  const invalida = await comprar(libroId, 0, 'cli-test-1');
  resultados.push(check(invalida.status === 400, `Body inválido -> ${invalida.status} (no se crea orden)`));

  console.log(`\n${LINEA}`);
  console.log(`🟢 PRUEBA 3: ${COMPRADORES} compras simultáneas con ${STOCK_INICIAL} unidades`);
  console.log(LINEA);
  await fijarStock(libroId, STOCK_INICIAL);
  const t0 = Date.now();
  const respuestas = await Promise.all(
    Array.from({ length: COMPRADORES }, (_, i) => comprar(libroId, 1, `cli-concurrente-${i + 1}`))
  );
  const porMotivo = respuestas.reduce((acc, r) => {
    const clave = r.status === 201 ? 'CONFIRMADA' : r.data?.motivoRechazo || `HTTP ${r.status}`;
    return { ...acc, [clave]: (acc[clave] || 0) + 1 };
  }, {});
  const confirmadas = porMotivo.CONFIRMADA || 0;
  const final = await stockActual(libroId);
  console.log(`   Duración: ${Date.now() - t0} ms · resultados: ${JSON.stringify(porMotivo)}`);
  console.log(`   Stock inicial: ${STOCK_INICIAL} · órdenes CONFIRMADAS: ${confirmadas} · stock final: ${final}`);
  resultados.push(check(confirmadas <= STOCK_INICIAL, 'Nunca se confirman más órdenes que unidades'));
  resultados.push(check(final === STOCK_INICIAL - confirmadas && final >= 0, 'El stock final cuadra con las órdenes confirmadas'));

  const historial = await request('GET', `${ORDERS}/api/ordenes/cliente/cli-concurrente-1`);
  resultados.push(check(historial.status === 200 && historial.data.length >= 1, 'Cada intento quedó registrado como orden (historial por cliente)'));

  const todoOk = resultados.every(Boolean);
  console.log(`\n${LINEA}`);
  console.log(todoOk ? '✅ RESULTADO: todas las verificaciones pasaron.' : '❌ RESULTADO: alguna verificación falló.');
  console.log(LINEA);
  process.exit(todoOk ? 0 : 1);
}

main().catch((err) => {
  console.error(`❌ Error ejecutando la prueba: ${err.message}`);
  console.error('   ¿Están levantados orders-service, catalog-service e inventory-service?');
  process.exit(1);
});
