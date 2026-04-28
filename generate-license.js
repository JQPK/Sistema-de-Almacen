/**
 * Joyería Mariné — Generador de Licencias
 * 
 * USO:
 *   node generate-license.js <machineId> [nombre_cliente]
 * 
 * EJEMPLO:
 *   node generate-license.js A1B2C3D4E5F6G7H8 "Joyería El Diamante"
 * 
 * El machineId lo obtiene el cliente desde la pantalla de activación
 * de la aplicación (se muestra automáticamente al primer inicio).
 */

const { generateLicenseCode } = require('./src/license/license');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Joyería Mariné — Generador de Licencias   ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log('USO:');
  console.log('  node generate-license.js <machineId> [nombre_cliente]\n');
  console.log('EJEMPLO:');
  console.log('  node generate-license.js A1B2C3D4E5F6G7H8 "Joyería El Diamante"\n');
  process.exit(1);
}

const machineId = args[0].trim().toUpperCase();
const clientName = args[1] || 'Cliente';

if (machineId.length !== 16) {
  console.error('\n❌ Error: El Machine ID debe tener exactamente 16 caracteres.');
  console.error(`   Recibido: "${machineId}" (${machineId.length} caracteres)\n`);
  process.exit(1);
}

const licenseCode = generateLicenseCode(machineId);

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   Joyería Mariné — Licencia Generada         ║');
console.log('╚══════════════════════════════════════════════╝\n');
console.log(`  Cliente    : ${clientName}`);
console.log(`  Machine ID : ${machineId}`);
console.log(`  Licencia   : ${licenseCode}`);
console.log(`  Generada   : ${new Date().toLocaleString('es-PE')}`);
console.log('\n  ⚠️  Guarda este código. Es único para este dispositivo.\n');
