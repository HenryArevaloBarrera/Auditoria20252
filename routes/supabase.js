import os from "os";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
// ✨ IMPORTAR SISTEMA ENCRIPTADO
import { appendToDailyLog } from "../middleware/audit-storage.js";

// ----------------- CONFIG -----------------
const SUPABASE_URL = "https://mbnguyurjdtcxztlmkpf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ibmd1eXVyamR0Y3h6dGxta3BmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMTA5NjksImV4cCI6MjA3MjY4Njk2OX0.2vTXra15x8aaUCWFGbwMzu013htD6P50opyHj2wicJI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

// ⚠️ DEPRECADO: Ya no se usa logs-bucket, ahora todo va a audit-logs encriptado
const LOG_BUCKET = "logs-bucket"; // Mantener por compatibilidad con código viejo
// -----------------------------------------

// ================== FUNCIONES AUXILIARES ==================
export async function getUserByEmail(email) {
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ Error buscando usuario:", err.message);
    return null;
  }
}

export async function insertUser(user) {
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .insert([user])
      .select();

    if (error) throw error;
    console.log("✅ Usuario insertado:", data[0]);
    return data[0];
  } catch (err) {
    console.error("❌ Error insertando usuario:", err.message);
    return null;
  }
}

export async function testConnection() {
  try {
    const { error } = await supabase.from("usuarios").select("*").limit(1);
    if (error) throw error;
    console.log("✅ Conexión a Supabase exitosa");
  } catch (err) {
    console.error("❌ Error al conectar con Supabase:", err.message);
  }
}

// intentos / bloqueo
export async function updateFailedAttempts(email, intentos) {
  try {
    const { error } = await supabase
      .from("usuarios")
      .update({ intentos_fallidos: intentos })
      .eq("email", email);
    if (error) throw error;
  } catch (err) {
    console.error("❌ Error actualizando intentos:", err.message);
  }
}

export async function blockUser(email) {
  try {
    const { error } = await supabase
      .from("usuarios")
      .update({ bloqueado: true })
      .eq("email", email);
    if (error) throw error;
  } catch (err) {
    console.error("❌ Error bloqueando usuario:", err.message);
  }
}

export async function resetAttempts(email) {
  try {
    const { error } = await supabase
      .from("usuarios")
      .update({ intentos_fallidos: 0 })
      .eq("email", email);
    if (error) throw error;
  } catch (err) {
    console.error("❌ Error reseteando intentos:", err.message);
  }
}

export async function unblockUser(email) {
  try {
    const { error } = await supabase
      .from("usuarios")
      .update({ bloqueado: false, intentos_fallidos: 0 })
      .eq("email", email);
    if (error) throw error;
    console.log(`✅ Usuario desbloqueado: ${email}`);
  } catch (err) {
    console.error("❌ Error desbloqueando usuario:", err.message);
  }
}

// ================== SISTEMA DE LOGS UNIFICADO (CON ENCRIPTACIÓN) ==================

/**
 * ✨ NUEVO: Guarda logs ENCRIPTADOS usando el sistema de audit-storage.js
 * Esta función reemplaza la antigua saveLogToStorage
 * 
 * @param {string} eventType - Tipo de evento (LOGIN_SUCCESS, ADMIN_DELETE_USER, etc.)
 * @param {Object} req - Objeto request de Express (puede ser mock)
 * @param {Object} eventData - Datos adicionales del evento
 * @param {Object} user - Usuario relacionado con el evento
 */
export async function saveLogToStorage(eventType, req, eventData = {}, user = null) {
  try {
    // Crear un objeto request mock si no existe
    const mockReq = req || {
      method: null,
      originalUrl: null,
      ip: null,
      headers: {},
      params: {},
      query: {},
      body: {}
    };

    // Construir el log en el formato del nuevo sistema
    const logEntry = {
      timestamp: new Date().toISOString(),
      event_type: eventType,
      
      user: user 
        ? {
            id: user.id,
            email: user.email,
            role: user.role || null
          }
        : "anonymous",

      request: {
        method: mockReq.method,
        path: mockReq.originalUrl,
        ip: mockReq.ip || mockReq.headers?.['x-forwarded-for'] || "unknown",
        user_agent: mockReq.headers?.['user-agent'],
        params: mockReq.params || {},
        query: mockReq.query || {},
        body: eventData // Los datos del evento van aquí
      },

      server: {
        hostname: os.hostname(),
        environment: process.env.NODE_ENV || "development",
        platform: os.platform()
      }
    };

    // ✨ Delegar al sistema encriptado
    await appendToDailyLog(logEntry);
    
    console.log(`✅ Log encriptado guardado: ${eventType}`);

  } catch (err) {
    console.error("❌ Error guardando log encriptado:", err.message);
    
    // Fallback: intentar guardar en base de datos
    try {
      await saveLogToDatabase(eventType, eventData, user);
    } catch (fallbackErr) {
      console.error("❌ Fallback también falló:", fallbackErr.message);
    }
  }
}

/**
 * Fallback: guarda en la tabla audit_logs si storage falla
 */
async function saveLogToDatabase(eventType, data, user = null) {
  try {
    const payload = {
      event_type: eventType,
      user_id: user?.id || null,
      user_email: user?.email || null,
      event_data: data,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from("audit_logs").insert([payload]);

    if (error) {
      console.error("❌ Error guardando log en DB (fallback):", error.message || error);
      return false;
    }

    console.log("✅ Log guardado en DB (fallback)");
    return true;
  } catch (err) {
    console.error("❌ Exception en saveLogToDatabase:", err.message || err);
    return false;
  }
}

/**
 * ✨ NUEVO: Obtiene logs desencriptados del nuevo sistema
 * Reemplaza la antigua getLogsFromStorage
 */
export async function getLogsFromStorage(date = null, { limitFiles = 1000 } = {}) {
  try {
    // Importar dinámicamente para evitar dependencias circulares
    const { getDecryptedLogs } = await import("../middleware/audit-storage.js");
    
    const dateStr = date 
      ? (typeof date === 'string' ? date : date.toISOString().split('T')[0])
      : null;

    const logs = await getDecryptedLogs(dateStr);
    
    // Ordenar por timestamp descendente
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return logs.slice(0, limitFiles);

  } catch (err) {
    console.error("❌ Error en getLogsFromStorage:", err.message || err);
    return [];
  }
}

/**
 * ✨ NUEVO: Estadísticas usando el sistema encriptado
 */
export async function getLogStats(date = null) {
  try {
    const { getLogStats: getStats } = await import("../middleware/audit-storage.js");
    
    const dateStr = date 
      ? (typeof date === 'string' ? date : date.toISOString().split('T')[0])
      : null;

    return await getStats(dateStr);

  } catch (err) {
    console.error("❌ Error en getLogStats:", err.message || err);
    return null;
  }
}

/**
 * ⚠️ DEPRECADO: Esta función ya no se usa con el nuevo sistema
 * Los logs encriptados se mantienen en audit-logs y se gestionan automáticamente
 */
export async function cleanupOldLogs(days = 30) {
  console.warn("⚠️ cleanupOldLogs está deprecado. Los logs encriptados se gestionan en audit-logs bucket");
  return true;
}

// ================== FUNCIONES DE MIGRACIÓN (OPCIONAL) ==================

/**
 * Migra logs antiguos de logs-bucket a audit-logs (encriptados)
 * Úsala una sola vez para migrar datos históricos
 */
export async function migrateOldLogsToEncrypted() {
  console.log("🔄 Iniciando migración de logs antiguos...");
  
  try {
    // Listar todos los archivos en logs-bucket
    const { data: files, error } = await supabase.storage
      .from(LOG_BUCKET)
      .list("", { limit: 1000 });

    if (error) {
      console.error("❌ Error listando logs antiguos:", error);
      return false;
    }

    console.log(`📦 Encontrados ${files.length} archivos para migrar`);

    let migrated = 0;
    
    for (const file of files) {
      try {
        // Descargar archivo viejo
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(LOG_BUCKET)
          .download(file.name);

        if (downloadError || !fileData) continue;

        const content = await fileData.text();
        const lines = content.split('\n').filter(line => line.trim());

        // Migrar cada línea al nuevo sistema
        for (const line of lines) {
          try {
            const oldLog = JSON.parse(line);
            
            // Convertir al nuevo formato y guardar encriptado
            await saveLogToStorage(
              oldLog.eventType || "MIGRATED_LOG",
              {
                method: oldLog.method,
                originalUrl: oldLog.url,
                ip: oldLog.ip,
                headers: { 'user-agent': oldLog.userAgent }
              },
              oldLog.data || {},
              oldLog.user !== "anonymous" ? oldLog.user : null
            );
            
            migrated++;
          } catch (parseErr) {
            console.warn("⚠️ Error parseando log:", parseErr.message);
          }
        }

      } catch (fileErr) {
        console.warn("⚠️ Error procesando archivo:", file.name, fileErr.message);
      }
    }

    console.log(`✅ Migración completada: ${migrated} logs migrados y encriptados`);
    return true;

  } catch (err) {
    console.error("❌ Error en migración:", err.message);
    return false;
  }
}

// Inicialización
testConnection();