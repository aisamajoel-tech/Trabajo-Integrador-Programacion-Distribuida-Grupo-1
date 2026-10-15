const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

async function main() {
  const certDir = path.join(__dirname, '..', 'certs');

  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  console.log('Generando certificado digital autofirmado X.509...');

  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'Universidad - Programacion Distribuida' },
    { name: 'countryName', value: 'AR' }
  ];

  // selfsigned v2+ can return a Promise
  const pems = await (selfsigned.generate ? selfsigned.generate(attrs, { days: 365, keySize: 2048, algorithm: 'sha256' }) : selfsigned(attrs, { days: 365 }));

  const privateKey = pems.private;
  const cert = pems.cert;

  if (!privateKey || !cert) {
    console.log('pems obtenido:', pems);
    throw new Error('No se encontraron las claves en pems');
  }

  fs.writeFileSync(path.join(certDir, 'server.key'), privateKey);
  fs.writeFileSync(path.join(certDir, 'server.cert'), cert);

  console.log('✅ Certificados generados exitosamente en la carpeta ./certs/');
  console.log('   - Clave privada: certs/server.key');
  console.log('   - Certificado:   certs/server.cert');
}

main().catch(err => {
  console.error('Error generando certificados:', err);
  process.exit(1);
});
