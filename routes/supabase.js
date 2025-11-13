import os from "os";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid"; // npm i uuid

// ----------------- CONFIG -----------------
const SUPABASE_URL = "https://mbnguyurjdtcxztlmkpf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ibmd1eXVyamR0Y3h6dGxta3BmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMTA5NjksImV4cCI6MjA3MjY4Njk2OX0.2vTXra15x8aaUCWFGbwMzu013htD6P50opyHj2wicJI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const LOG_BUCKET = "logs-bucket";
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

// ================== SISTEMA DE LOGS EN STORAGE (mejorado) ==================

/**
 * Construye el path para hoy o para una fecha dada
 * formato: logs/YYYY/MM/DD/
 */
function dailyFolderFor(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `logs/${year}/${month}/${day}/`;
}

/**
 * Guarda un evento como UN archivo individual en storage:
 * logs/YYYY/MM/DD/<isoTimestamp>-<uuid>.json
 * (Evita conflictos por concurrencia)
 */

/**
 * Guarda todos los logs en UN solo archivo diario JSONL en Supabase Storage
 */
export async function saveLogToStorage(eventType, req, eventData = {}, user = null) {
    const bucket = "logs-bucket";

    const date = new Date().toISOString().split("T")[0];
    const filePath = `logs-${date}.jsonl`;

    const logEntry = {
        timestamp: new Date().toISOString(),
        eventType,
        ip: req.ip || null,
        method: req.method || null,
        url: req.originalUrl || null,
        user: user ? { id: user.id, email: user.email } : "anonymous",
        data: eventData
    };

    const logString = JSON.stringify(logEntry) + "\n";

    // ↓↓↓ CORREGIDO PARA NODE.JS ↓↓↓
    let existingContent = "";

    const { data: existingFile } = await supabase.storage
        .from(bucket)
        .download(filePath);

    if (existingFile) {
        existingContent = await existingFile.text();
    }

    const finalContent = existingContent + logString;

    // ↓↓↓ CORREGIDO: usar Buffer, no Blob ↓↓↓
    const buffer = Buffer.from(finalContent, "utf-8");

    const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, buffer, {
            upsert: true,
            contentType: "text/plain"
        });

    if (uploadError) {
        console.error("❌ Error guardando log:", uploadError);
        throw uploadError;
    }

    console.log("✔ Log guardado en:", filePath);
}



/**
 * Fallback: guarda en la tabla audit_logs si storage falla
 * Crea la tabla con el SQL provisto abajo si aún no existe
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
 * Lista y descarga todos los archivos del día (o de la fecha dada).
 * Devuelve array de logs (objetos JSON).
 * NOTA: puede tardar si hay muchos archivos; se pueden paginar usando list() con offset/limit.
 */
export async function getLogsFromStorage(date = null, { limitFiles = 1000 } = {}) {
  try {
    const target = date ? new Date(date) : new Date();
    const folder = dailyFolderFor(target);

    // listar archivos en la carpeta
    const { data: list, error: listErr } = await supabase.storage
      .from(LOG_BUCKET)
      .list(folder, { limit: limitFiles, offset: 0 });

    if (listErr) {
      console.error("❌ Error listando archivos de logs:", listErr);
      return [];
    }

    if (!list || list.length === 0) return [];

    // Descargar cada archivo y parsear JSON
    const logs = [];
    for (const fileObj of list) {
      // fileObj.name contiene el nombre relativo dentro de folder; supabase list ya devuelve objetos con name y id
      const path = `${folder}${fileObj.name}`;
      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(LOG_BUCKET)
          .download(path);

        if (downloadError || !fileData) {
          console.warn("⚠️ No se pudo descargar:", path, downloadError);
          continue;
        }

        const text = await fileData.text();
        try {
          const parsed = JSON.parse(text);
          logs.push(parsed);
        } catch (parseErr) {
          console.warn("⚠️ JSON mal formado en:", path, parseErr);
        }
      } catch (innerErr) {
        console.warn("⚠️ Error descargando archivo:", path, innerErr);
      }
    }

    // ordenar por timestamp descendente
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return logs;

  } catch (err) {
    console.error("❌ Error en getLogsFromStorage:", err.message || err);
    return [];
  }
}

/**
 * Estadísticas simples basadas en los logs del día (o fecha)
 */
export async function getLogStats(date = null) {
  try {
    const logs = await getLogsFromStorage(date);
    const stats = {
      total: logs.length,
      byEventType: {},
      byHour: {},
      errors: 0,
      successes: 0
    };

    for (const log of logs) {
      const t = log.event_type || "UNKNOWN";
      stats.byEventType[t] = (stats.byEventType[t] || 0) + 1;

      const hour = new Date(log.timestamp).getHours();
      stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;

      if (/ERROR|FAILED/i.test(t)) stats.errors++;
      if (/SUCCESS/i.test(t)) stats.successes++;
    }

    return stats;
  } catch (err) {
    console.error("❌ Error en getLogStats:", err.message || err);
    return null;
  }
}

/**
 * Borra archivos de logs anteriores a X días (limpieza).
 * Nota: supabase.storage.delete acepta array de paths.
 */
export async function cleanupOldLogs(days = 30) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Podemos listar carpetas por año/mes/día. Para simplificar listamos todo "logs" y verificamos nombres.
    const { data: years, error: yearsErr } = await supabase.storage.from(LOG_BUCKET).list("logs", { limit: 1000, offset: 0 });
    if (yearsErr) {
      console.error("❌ Error listando logs para limpieza:", yearsErr);
      return false;
    }

    const toDelete = [];

    // years contiene carpetas tipo '2025' (o archivos si no hay carpeta)
    for (const y of years) {
      const yearPrefix = `logs/${y.name}/`;
      const { data: months } = await supabase.storage.from(LOG_BUCKET).list(yearPrefix, { limit: 1000, offset: 0 }).catch(() => ({ data: [] }));
      for (const m of (months.data || [])) {
        const monthPrefix = `${yearPrefix}${m.name}/`;
        const { data: days } = await supabase.storage.from(LOG_BUCKET).list(monthPrefix, { limit: 1000, offset: 0 }).catch(() => ({ data: [] }));
        for (const d of (days.data || [])) {
          const dayPrefix = `${monthPrefix}${d.name}/`;
          const dayStr = d.name; // dd
          // construir fecha
          const parts = [y.name, m.name, d.name]; // [YYYY, MM, DD]
          const dateStr = `${parts[0]}-${parts[1]}-${parts[2]}`;
          const dateObj = new Date(dateStr);
          if (dateObj < cutoff) {
            // listar archivos del día
            const { data: files } = await supabase.storage.from(LOG_BUCKET).list(dayPrefix, { limit: 1000, offset: 0 }).catch(() => ({ data: [] }));
            for (const f of (files.data || [])) {
              toDelete.push(`${dayPrefix}${f.name}`);
            }
          }
        }
      }
    }

    if (toDelete.length === 0) {
      console.log("🧹 No hay archivos para eliminar");
      return true;
    }

    // borrar en lotes (supabase permite array)
    const { error: delErr } = await supabase.storage.from(LOG_BUCKET).remove(toDelete);
    if (delErr) {
      console.error("❌ Error eliminando archivos antiguos:", delErr);
      return false;
    }

    console.log(`🧹 Eliminados ${toDelete.length} archivos antiguos de logs`);
    return true;

  } catch (err) {
    console.error("❌ Error en cleanupOldLogs:", err.message || err);
    return false;
  }
}

// Inicialización
testConnection();
