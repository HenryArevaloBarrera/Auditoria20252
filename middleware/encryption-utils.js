import 'dotenv/config';
// middleware/encryption-utils.js
import crypto from "crypto";

// ========= CONFIGURACIÓN DE ENCRIPTACIÓN =========
// ⚠️ IMPORTANTE: Guarda esta clave en variables de entorno (.env)
const ENCRYPTION_KEY = process.env.AUDIT_ENCRYPTION_KEY || "clave-por-defecto-32-caracteres";
const ALGORITHM = "aes-256-cbc";

// Asegurarse de que la clave tenga exactamente 32 bytes
const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();

/**
 * Encripta un objeto/texto
 * @param {Object|String} data - Datos a encriptar
 * @returns {String} - String encriptado en formato "iv:datos"
 */
export function encrypt(data) {
  try {
    const iv = crypto.randomBytes(16); // Vector de inicialización aleatorio
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Convertir a string si es un objeto
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    // Retorna IV + datos encriptados (separados por ":")
    return iv.toString("hex") + ":" + encrypted;
  } catch (error) {
    console.error("❌ Error encriptando:", error.message);
    throw error;
  }
}

/**
 * Desencripta un texto encriptado
 * @param {String} encryptedText - Texto en formato "iv:datos"
 * @returns {Object|String|null} - Datos desencriptados o null si falla
 */
export function decrypt(encryptedText) {
  try {
    if (!encryptedText || typeof encryptedText !== 'string') {
      console.error("❌ Texto encriptado inválido");
      return null;
    }

    const parts = encryptedText.split(":");
    
    if (parts.length !== 2) {
      console.error("❌ Formato de encriptación inválido");
      return null;
    }

    const iv = Buffer.from(parts[0], "hex");
    const encryptedData = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    // Intentar parsear como JSON, si falla retornar como string
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

/**
 * Encripta un archivo completo línea por línea
 * @param {String} content - Contenido del archivo (una línea JSON por línea)
 * @returns {String} - Contenido encriptado
 */
export function encryptFile(content) {
  try {
    const lines = content.split("\n").filter(line => line.trim());
    const encryptedLines = lines.map(line => {
      try {
        const data = JSON.parse(line);
        return encrypt(data);
      } catch {
        // Si no es JSON válido, encriptar como texto plano
        return encrypt(line);
      }
    });
    
    return encryptedLines.join("\n");
  } catch (error) {
    console.error("❌ Error encriptando archivo:", error.message);
    throw error;
  }
}

/**
 * Desencripta un archivo completo línea por línea
 * @param {String} encryptedContent - Contenido encriptado
 * @returns {Array} - Array de objetos/strings desencriptados
 */
export function decryptFile(encryptedContent) {
  try {
    const lines = encryptedContent.split("\n").filter(line => line.trim());
    const decryptedData = [];
    
    for (const line of lines) {
      const decrypted = decrypt(line);
      if (decrypted) {
        decryptedData.push(decrypted);
      }
    }
    
    return decryptedData;
  } catch (error) {
    console.error("❌ Error desencriptando archivo:", error.message);
    return [];
  }
}

/**
 * Verifica si un string está encriptado (formato básico)
 * @param {String} text - Texto a verificar
 * @returns {Boolean}
 */
export function isEncrypted(text) {
  if (!text || typeof text !== 'string') return false;
  
  // Un texto encriptado debe tener el formato "hex:hex"
  const parts = text.split(":");
  if (parts.length !== 2) return false;
  
  // Verificar que ambas partes sean hexadecimales
  const hexRegex = /^[0-9a-f]+$/i;
  return hexRegex.test(parts[0]) && hexRegex.test(parts[1]);
}

/**
 * Encripta solo campos sensibles de un objeto
 * @param {Object} data - Objeto con datos
 * @param {Array} sensitiveFields - Array de campos a encriptar
 * @returns {Object} - Objeto con campos sensibles encriptados
 */
export function encryptSensitiveFields(data, sensitiveFields = ['password', 'token', 'apiKey']) {
  const result = { ...data };
  
  for (const field of sensitiveFields) {
    if (result[field]) {
      result[field] = encrypt(result[field]);
    }
  }
  
  return result;
}

/**
 * Desencripta solo campos sensibles de un objeto
 * @param {Object} data - Objeto con datos encriptados
 * @param {Array} sensitiveFields - Array de campos a desencriptar
 * @returns {Object} - Objeto con campos sensibles desencriptados
 */
export function decryptSensitiveFields(data, sensitiveFields = ['password', 'token', 'apiKey']) {
  const result = { ...data };
  
  for (const field of sensitiveFields) {
    if (result[field] && isEncrypted(result[field])) {
      result[field] = decrypt(result[field]);
    }
  }
  
  return result;
}

/**
 * Genera un hash (no reversible) - útil para comparaciones
 * @param {String} text - Texto a hashear
 * @returns {String} - Hash SHA256
 */
export function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Verifica si la clave de encriptación está configurada
 * @returns {Boolean}
 */
export function isEncryptionConfigured() {
  return process.env.AUDIT_ENCRYPTION_KEY && 
         process.env.AUDIT_ENCRYPTION_KEY !== "clave-por-defecto-32-caracteres";
}

// ========= FUNCIONES DE UTILIDAD PARA TESTING =========

/**
 * Prueba las funciones de encriptación (solo para desarrollo)
 */
export function testEncryption() {
  console.log("\n🧪 Probando sistema de encriptación...\n");

  // Test 1: Encriptar/Desencriptar objeto
  const testData = {
    user: "admin@test.com",
    password: "secreto123",
    timestamp: new Date().toISOString()
  };

  console.log("📝 Datos originales:", testData);
  
  const encrypted = encrypt(testData);
  console.log("🔒 Encriptado:", encrypted);
  
  const decrypted = decrypt(encrypted);
  console.log("🔓 Desencriptado:", decrypted);
  
  const isMatch = JSON.stringify(testData) === JSON.stringify(decrypted);
  console.log("✅ Coincidencia:", isMatch ? "SÍ" : "NO");

  // Test 2: Encriptar campos sensibles
  console.log("\n📝 Test de campos sensibles:");
  const userData = {
    name: "Juan",
    email: "juan@test.com",
    password: "mipassword123",
    age: 30
  };
  
  console.log("Original:", userData);
  const protectedData = encryptSensitiveFields(userData);
  console.log("Protegido:", protectedData);
  const restored = decryptSensitiveFields(protectedData);
  console.log("Restaurado:", restored);

  // Test 3: Verificar configuración
  console.log("\n⚙️ Configuración:");
  console.log("¿Encriptación configurada?", isEncryptionConfigured() ? "SÍ ✅" : "NO ⚠️ (usando clave por defecto)");
  
  console.log("\n✅ Pruebas completadas\n");
}

export default {
  encrypt,
  decrypt,
  encryptFile,
  decryptFile,
  isEncrypted,
  encryptSensitiveFields,
  decryptSensitiveFields,
  hash,
  isEncryptionConfigured,
  testEncryption
};