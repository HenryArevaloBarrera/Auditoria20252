#!/usr/bin/env node
// scripts/decrypt-logs.js
// Script para desencriptar logs desde la línea de comandos

import 'dotenv/config';
import { getDecryptedLogs, listLogFiles, getLogStats, searchLogs } from "./audit-storage.js";
import { testEncryption } from "./encryption-utils.js";

import fs from "fs";
import path from "path";

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader() {
  log('\n╔═══════════════════════════════════════╗', 'cyan');
  log('║   🔓 DESENCRIPTADOR DE LOGS          ║', 'cyan');
  log('╚═══════════════════════════════════════╝\n', 'cyan');
}

function printUsage() {
  log('Uso:', 'bright');
  log('  node scripts/decrypt-logs.js [comando] [opciones]\n', 'reset');
  
  log('Comandos disponibles:', 'bright');
  log('  list                    - Lista todos los archivos de logs', 'green');
  log('  read <fecha>            - Lee logs de una fecha (YYYY-MM-DD)', 'green');
  log('  today                   - Lee logs de hoy', 'green');
  log('  stats [fecha]           - Muestra estadísticas', 'green');
  log('  search [opciones]       - Busca logs específicos', 'green');
  log('  export <fecha> <salida> - Exporta logs a JSON', 'green');
  log('  test                    - Prueba el sistema de encriptación', 'green');
  
  log('\nEjemplos:', 'bright');
  log('  node scripts/decrypt-logs.js list', 'yellow');
  log('  node scripts/decrypt-logs.js read 2025-01-15', 'yellow');
  log('  node scripts/decrypt-logs.js today', 'yellow');
  log('  node scripts/decrypt-logs.js stats', 'yellow');
  log('  node scripts/decrypt-logs.js export 2025-01-15 ./logs-export.json\n', 'yellow');
}

async function commandList() {
  log('📁 Listando archivos de logs...\n', 'blue');
  
  const files = await listLogFiles();
  
  if (files.length === 0) {
    log('⚠️  No se encontraron archivos de logs', 'yellow');
    return;
  }

  log(`Se encontraron ${files.length} archivo(s):\n`, 'green');
  
  files.forEach((file, index) => {
    log(`${index + 1}. ${file.name}`, 'bright');
    log(`   📅 Fecha: ${file.date}`, 'reset');
    log(`   📦 Tamaño: ${(file.size / 1024).toFixed(2)} KB`, 'reset');
    log(`   🕐 Creado: ${file.created}\n`, 'reset');
  });
}

async function commandRead(date) {
  if (!date) {
    log('❌ Error: Debes especificar una fecha (YYYY-MM-DD)', 'red');
    return;
  }

  log(`📖 Leyendo logs de: ${date}\n`, 'blue');
  
  const logs = await getDecryptedLogs(date);
  
  if (logs.length === 0) {
    log('⚠️  No se encontraron logs para esta fecha', 'yellow');
    return;
  }

  log(`✅ Se encontraron ${logs.length} entradas\n`, 'green');
  
  logs.forEach((log, index) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Entrada #${index + 1}`);
    console.log(`${'='.repeat(60)}`);
    console.log(JSON.stringify(log, null, 2));
  });
}

async function commandToday() {
  const today = new Date().toISOString().slice(0, 10);
  log(`📖 Leyendo logs de HOY (${today})\n`, 'blue');
  await commandRead(today);
}

async function commandStats(date = null) {
  const dateStr = date || 'hoy';
  log(`📊 Obteniendo estadísticas de: ${dateStr}\n`, 'blue');
  
  const stats = await getLogStats(date);
  
  if (!stats || stats.total === 0) {
    log('⚠️  No hay estadísticas disponibles', 'yellow');
    return;
  }

  log('╔════════════════════════════════════╗', 'cyan');
  log('║        ESTADÍSTICAS DE LOGS        ║', 'cyan');
  log('╚════════════════════════════════════╝\n', 'cyan');
  
  log(`📈 Total de registros: ${stats.total}`, 'bright');
  log(`⚡ Duración promedio: ${stats.avgDuration}ms\n`, 'bright');
  
  log('🔹 Por método HTTP:', 'blue');
  Object.entries(stats.byMethod).forEach(([method, count]) => {
    log(`   ${method}: ${count}`, 'reset');
  });
  
  log('\n🔹 Por código de estado:', 'blue');
  Object.entries(stats.byStatus).forEach(([status, count]) => {
    const color = status.startsWith('2') ? 'green' : status.startsWith('4') ? 'yellow' : 'red';
    log(`   ${status}: ${count}`, color);
  });
  
  log('\n🔹 Por usuario:', 'blue');
  Object.entries(stats.byUser).forEach(([user, count]) => {
    log(`   ${user}: ${count}`, 'reset');
  });
  
  log('');
}

async function commandExport(date, outputPath) {
  if (!date || !outputPath) {
    log('❌ Error: Debes especificar fecha y ruta de salida', 'red');
    log('   Ejemplo: node decrypt-logs.js export 2025-01-15 ./output.json', 'yellow');
    return;
  }

  log(`📦 Exportando logs de ${date} a ${outputPath}...\n`, 'blue');
  
  const logs = await getDecryptedLogs(date);
  
  if (logs.length === 0) {
    log('⚠️  No hay logs para exportar', 'yellow');
    return;
  }

  try {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      outputPath,
      JSON.stringify(logs, null, 2),
      'utf8'
    );

    log(`✅ Exportados ${logs.length} logs exitosamente`, 'green');
    log(`📁 Archivo: ${path.resolve(outputPath)}`, 'green');

  } catch (err) {
    log(`❌ Error exportando: ${err.message}`, 'red');
  }
}

async function commandSearch() {
  log('🔍 Función de búsqueda avanzada:\n', 'blue');
  log('Esta función permite buscar logs con criterios específicos', 'reset');
  log('Ejemplo de uso en código:', 'yellow');
  log(`
  import { searchLogs } from './middleware/audit-storage.js';
  
  const results = await searchLogs({
    date: '2025-01-15',
    email: 'user@test.com',
    method: 'POST',
    status: 200,
    path: '/login'
  });
  `, 'cyan');
}

async function commandTest() {
  log('🧪 Ejecutando pruebas del sistema de encriptación...\n', 'blue');
  testEncryption();
}

// ========= MAIN =========
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  printHeader();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  try {
    switch (command) {
      case 'list':
        await commandList();
        break;
      
      case 'read':
        await commandRead(args[1]);
        break;
      
      case 'today':
        await commandToday();
        break;
      
      case 'stats':
        await commandStats(args[1]);
        break;
      
      case 'export':
        await commandExport(args[1], args[2]);
        break;
      
      case 'search':
        await commandSearch();
        break;
      
      case 'test':
        await commandTest();
        break;
      
      default:
        log(`❌ Comando desconocido: ${command}\n`, 'red');
        printUsage();
    }
  } catch (error) {
    log(`\n❌ Error ejecutando comando: ${error.message}`, 'red');
    if (process.env.NODE_ENV === 'development') {
      console.error(error);
    }
  }
}

// Ejecutar solo si se llama directamente
// Ejecutar directamente
main().catch(error => {
  console.error('❌ Error fatal:', error.message);
  process.exit(1);
});

export { main };