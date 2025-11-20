import 'dotenv/config';
// middleware/audit-storage.js
import { supabase } from "../routes/supabase.js";
import { encrypt, decryptFile } from "./encryption-utils.js";

function generateDailyName() {
  return `audit-${new Date().toISOString().slice(0, 10)}.log`;
}

async function downloadLogFile(name) {
  const { data, error } = await supabase.storage
    .from("audit-logs")
    .download(name);

  if (error || !data) return "";
  return await data.text();
}

/**
 * Guarda evento ENCRIPTADO en Supabase Storage
 * @param {Object} event - Evento a registrar
 */
export async function appendToDailyLog(event) {
  try {
    const filename = generateDailyName();

    // 1️⃣ Obtener contenido del archivo actual
    const existing = await downloadLogFile(filename);

    // 2️⃣ ENCRIPTAR el evento completo
    const eventWithTimestamp = {
      timestamp: new Date().toISOString(),
      ...event
    };
    
    const encryptedEvent = encrypt(eventWithTimestamp);

    // 3️⃣ Agregar nueva línea encriptada
    const newLine = encryptedEvent + "\n";
    const newContent = existing + newLine;

    // 4️⃣ Subir archivo actualizado
    const upload = await supabase.storage
      .from("audit-logs")
      .upload(filename, newContent, {
        contentType: "text/plain",
        upsert: true
      });

    if (upload.error) {
      console.error("❌ Error subiendo archivo log diario:", upload.error.message);
    } else {
      // Solo en desarrollo: confirmar que se guardó
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Log encriptado guardado: ${filename}`);
      }
    }

  } catch (err) {
    console.error("❌ Error en appendToDailyLog:", err.message);
  }
}

/**
 * Lee y DESENCRIPTA logs de un archivo específico
 * @param {String} date - Fecha en formato YYYY-MM-DD (opcional)
 * @returns {Array} - Array de logs desencriptados
 */
export async function getDecryptedLogs(date = null) {
  try {
    const filename = date 
      ? `audit-${date}.log` 
      : generateDailyName();

    console.log(`📖 Leyendo logs de: ${filename}`);

    const content = await downloadLogFile(filename);
    
    if (!content) {
      console.log(`⚠️ No hay logs para: ${filename}`);
      return [];
    }

    // Usar la función decryptFile del módulo de encriptación
    const decryptedLogs = decryptFile(content);
    
    console.log(`✅ ${decryptedLogs.length} logs desencriptados`);
    return decryptedLogs;

  } catch (err) {
    console.error("❌ Error obteniendo logs desencriptados:", err.message);
    return [];
  }
}

/**
 * Lista todos los archivos de logs disponibles
 * @returns {Array} - Array de nombres de archivos
 */
export async function listLogFiles() {
  try {
    const { data, error } = await supabase.storage
      .from("audit-logs")
      .list();

    if (error) {
      console.error("❌ Error listando archivos:", error.message);
      return [];
    }

    // Filtrar solo archivos .log y ordenar por fecha descendente
    const logFiles = data
      .filter(file => file.name.endsWith('.log'))
      .map(file => ({
        name: file.name,
        date: file.name.replace('audit-', '').replace('.log', ''),
        size: file.metadata?.size || 0,
        created: file.created_at
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return logFiles;

  } catch (err) {
    console.error("❌ Error listando archivos de logs:", err.message);
    return [];
  }
}

/**
 * Obtiene estadísticas de los logs
 * @param {String} date - Fecha específica (opcional)
 * @returns {Object} - Objeto con estadísticas
 */
export async function getLogStats(date = null) {
  try {
    const logs = await getDecryptedLogs(date);

    if (logs.length === 0) {
      return {
        total: 0,
        byMethod: {},
        byStatus: {},
        byUser: {},
        avgDuration: 0
      };
    }

    const stats = {
      total: logs.length,
      byMethod: {},
      byStatus: {},
      byUser: {},
      totalDuration: 0,
      avgDuration: 0
    };

    logs.forEach(log => {
      // Contar por método HTTP
      const method = log.request?.method || 'UNKNOWN';
      stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;

      // Contar por código de estado
      const status = log.response?.status_code || 'UNKNOWN';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      // Contar por usuario
      const userEmail = log.user?.email || 'anonymous';
      stats.byUser[userEmail] = (stats.byUser[userEmail] || 0) + 1;

      // Sumar duración
      if (log.response?.duration_ms) {
        stats.totalDuration += log.response.duration_ms;
      }
    });

    // Calcular duración promedio
    stats.avgDuration = Math.round(stats.totalDuration / logs.length);

    return stats;

  } catch (err) {
    console.error("❌ Error obteniendo estadísticas:", err.message);
    return null;
  }
}

/**
 * Busca logs por criterios específicos
 * @param {Object} criteria - Criterios de búsqueda
 * @returns {Array} - Logs que coinciden
 */
export async function searchLogs(criteria = {}) {
  try {
    const { date, userId, method, status, email, path } = criteria;
    
    const logs = await getDecryptedLogs(date);
    
    return logs.filter(log => {
      // Filtrar por userId
      if (userId && log.user?.id !== userId) return false;
      
      // Filtrar por email
      if (email && log.user?.email !== email) return false;
      
      // Filtrar por método HTTP
      if (method && log.request?.method !== method) return false;
      
      // Filtrar por código de estado
      if (status && log.response?.status_code !== status) return false;
      
      // Filtrar por path (búsqueda parcial)
      if (path && !log.request?.path?.includes(path)) return false;
      
      return true;
    });

  } catch (err) {
    console.error("❌ Error buscando logs:", err.message);
    return [];
  }
}

export default {
  appendToDailyLog,
  getDecryptedLogs,
  listLogFiles,
  getLogStats,
  searchLogs
};