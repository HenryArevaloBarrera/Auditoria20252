// desencriptar-offline.js
// Desencripta logs sin necesidad de conectarse a Supabase

import crypto from "crypto";
import fs from "fs";

// ========== CONFIGURACIÓN ==========
// Pega tu clave de encriptación aquí
const ENCRYPTION_KEY = "mi-clave-super-secreta-de-32-chars-exactos";
const ALGORITHM = "aes-256-cbc";

// Generar la clave de 32 bytes
const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();

// ========== FUNCIONES ==========

function decrypt(encryptedText) {
  try {
    if (!encryptedText || typeof encryptedText !== 'string') {
      return null;
    }

    const parts = encryptedText.split(":");
    if (parts.length !== 2) {
      return null;
    }

    const iv = Buffer.from(parts[0], "hex");
    const encryptedData = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    console.error("❌ Error desencriptando:", error.message);
    return null;
  }
}

function decryptFromFile(filepath) {
  try {
    console.log(`\n📖 Leyendo archivo: ${filepath}\n`);
    
    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split("\n").filter(line => line.trim());
    
    console.log(`✅ Encontradas ${lines.length} líneas encriptadas\n`);
    console.log('='.repeat(60));
    
    lines.forEach((line, index) => {
      const decrypted = decrypt(line.trim());
      
      if (decrypted) {
        console.log(`\nEntrada #${index + 1}`);
        console.log('='.repeat(60));
        console.log(JSON.stringify(decrypted, null, 2));
      } else {
        console.log(`\n⚠️ No se pudo desencriptar la línea #${index + 1}`);
      }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ Proceso completado: ${lines.length} líneas procesadas\n`);
    
  } catch (error) {
    console.error(`\n❌ Error leyendo archivo: ${error.message}\n`);
  }
}

function decryptFromClipboard(encryptedText) {
  console.log('\n🔓 Desencriptando texto...\n');
  console.log('='.repeat(60));
  
  const lines = encryptedText.split("\n").filter(line => line.trim());
  
  lines.forEach((line, index) => {
    const decrypted = decrypt(line.trim());
    
    if (decrypted) {
      console.log(`\nEntrada #${index + 1}`);
      console.log('='.repeat(60));
      console.log(JSON.stringify(decrypted, null, 2));
    } else {
      console.log(`\n⚠️ No se pudo desencriptar la línea #${index + 1}`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Proceso completado\n`);
}

// ========== EJECUCIÓN ==========

console.log('\n╔═══════════════════════════════════════╗');
console.log('║   🔓 DESENCRIPTADOR OFFLINE          ║');
console.log('╚═══════════════════════════════════════╝\n');

// Obtener argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('📝 Uso:\n');
  console.log('  Opción 1 - Desde archivo:');
  console.log('    node desencriptar-offline.js logs-encriptados.txt\n');
  console.log('  Opción 2 - Pegar texto encriptado directamente:');
  console.log('    node desencriptar-offline.js "a5e59480033de9c7608738651c503e5e:0585f77..."\n');
  console.log('  Opción 3 - Desde múltiples líneas (archivo):');
  console.log('    Crea un archivo .txt con logs encriptados (uno por línea)\n');
  process.exit(0);
}

const input = args[0];

// Verificar si es un archivo o texto encriptado
if (fs.existsSync(input)) {
  // Es un archivo
  decryptFromFile(input);
} else if (input.includes(':')) {
  // Es texto encriptado directo
  decryptFromClipboard(input);
} else {
  console.log('❌ Error: No se encontró el archivo o el texto no parece estar encriptado\n');
  console.log('💡 Asegúrate de:');
  console.log('  1. Que el archivo existe');
  console.log('  2. O que el texto encriptado tenga el formato correcto (xxx:xxx)\n');
}