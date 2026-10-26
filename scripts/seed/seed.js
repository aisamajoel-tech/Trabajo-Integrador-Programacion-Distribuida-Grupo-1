/**
 * Script reproducible de inicialización de datos de prueba (TP6 - Grupo 1)
 * Responsable: Joel Aisama (@aisamajoel-tech)
 *
 * Regla arquitectónica:
 * Nunca accede directamente a las bases de datos. Crea las obras a través de la API pública
 * de catalog-service (POST /api/libros) y luego inicializa sus existencias mediante la API
 * pública de inventory-service (POST /api/inventario).
 */

const crypto = require('crypto');

const CATALOG_SERVICE_URL = (process.env.CATALOG_SERVICE_URL || 'http://localhost:3001').replace(/\/$/, '');
const INVENTORY_SERVICE_URL = (process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002').replace(/\/$/, '');
const HTTP_TIMEOUT_MS = parseInt(process.env.HTTP_TIMEOUT_MS, 10) || 5000;

const LIBROS_SEMILLA = [
  {
    titulo: 'Cien años de soledad',
    autor: 'Gabriel García Márquez',
    año: 1967,
    genero: 'Novela',
    isbn: '978-0307474728',
    stockInicial: 1
  },
  {
    titulo: 'Don Quijote de la Mancha',
    autor: 'Miguel de Cervantes',
    año: 1605,
    genero: 'Novela',
    isbn: '978-8424115104',
    stockInicial: 5
  },
  {
    titulo: '1984',
    autor: 'George Orwell',
    año: 1949,
    genero: 'Ficción',
    isbn: '978-0451524935',
    stockInicial: 2
  },
  {
    titulo: 'Rayuela',
    autor: 'Julio Cortázar',
    año: 1963,
    genero: 'Novela',
    isbn: '978-8437604572',
    stockInicial: 4
  },
  {
    titulo: 'El Aleph',
    autor: 'Jorge Luis Borges',
    año: 1949,
    genero: 'Ficción',
    isbn: '978-8420633114',
    stockInicial: 3
  }
];

async function crearLibroEnCatalogo(libro, requestId) {
  const { titulo, autor, año, genero, isbn } = libro;
  const url = `${CATALOG_SERVICE_URL}/api/libros`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId
    },
    body: JSON.stringify({ titulo, autor, año, genero, isbn }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
  });

  if (res.status === 201) {
    const creado = await res.json();
    const id = creado.id || creado._id;
    console.log(`  [Catálogo]  201 Created -> "${titulo}" (ID: ${id})`);
    return id;
  }

  if (res.status === 409) {
    // Si ya existía por ISBN, consultamos el listado para recuperar su ID de forma idempotente
    const listRes = await fetch(url, {
      headers: { 'x-request-id': requestId },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });
    if (listRes.ok) {
      const lista = await listRes.json();
      const existente = lista.find((item) => item.isbn === isbn);
      if (existente) {
        const id = existente.id || existente._id;
        console.log(`  [Catálogo]  409 Ya registrado -> "${titulo}" (ID recuperado: ${id})`);
        return id;
      }
    }
  }

  const detalle = await res.text();
  throw new Error(`Fallo en catalog-service (${res.status}): ${detalle}`);
}

async function inicializarStockEnInventario(libroId, stockInicial, titulo, requestId) {
  const urlAlta = `${INVENTORY_SERVICE_URL}/api/inventario`;

  try {
    const res = await fetch(urlAlta, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId
      },
      body: JSON.stringify({
        libroId,
        stockInicial,
        stockDisponible: stockInicial
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });

    if (res.ok || res.status === 201) {
      console.log(`  [Inventario] ${res.status} Stock inicializado -> "${titulo}" (Stock: ${stockInicial})`);
      return true;
    }

    // Si ya tenía registro de stock, intentamos reponer/actualizar mediante /reponer
    const urlReponer = `${INVENTORY_SERVICE_URL}/api/inventario/${libroId}/reponer`;
    const resReponer = await fetch(urlReponer, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId
      },
      body: JSON.stringify({
        cantidad: stockInicial,
        stock: stockInicial
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });

    if (resReponer.ok) {
      console.log(`  [Inventario] 200 Stock repuesto -> "${titulo}" (Cantidad: ${stockInicial})`);
      return true;
    }

    const texto = await res.text();
    console.warn(`  [Inventario] Advertencia (${res.status}) para "${titulo}": ${texto}`);
    return false;
  } catch (err) {
    console.warn(`  [Inventario] No disponible en ${INVENTORY_SERVICE_URL} (${err.message}). Se omitió carga de stock para "${titulo}".`);
    return false;
  }
}

async function ejecutarSeed() {
  console.log('===================================================================');
  console.log('🌱 INICIANDO CARGA DE DATOS DE PRUEBA (SEED) — TP6 GRUPO 1');
  console.log(`📚 Catalog Service URL:   ${CATALOG_SERVICE_URL}`);
  console.log(`📦 Inventory Service URL: ${INVENTORY_SERVICE_URL}`);
  console.log('===================================================================\n');

  const resultados = [];

  for (const item of LIBROS_SEMILLA) {
    const requestId = `seed-${crypto.randomUUID()}`;
    console.log(`▶ Procesando obra: "${item.titulo}" (${item.isbn})`);

    try {
      const libroId = await crearLibroEnCatalogo(item, requestId);
      const stockOk = await inicializarStockEnInventario(libroId, item.stockInicial, item.titulo, requestId);
      resultados.push({
        titulo: item.titulo,
        isbn: item.isbn,
        libroId,
        stockInicial: item.stockInicial,
        inventarioSincronizado: stockOk
      });
    } catch (error) {
      console.error(`  ❌ Error procesando "${item.titulo}": ${error.message}`);
    }
    console.log('');
  }

  console.log('===================================================================');
  console.log(`✅ PROCESO FINALIZADO: ${resultados.length}/${LIBROS_SEMILLA.length} obras catalogadas.`);
  console.table(resultados);
}

ejecutarSeed().catch((err) => {
  console.error('❌ Error fatal en el script de seed:', err.message);
  process.exit(1);
});
