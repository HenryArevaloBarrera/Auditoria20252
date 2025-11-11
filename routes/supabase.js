import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mbnguyurjdtcxztlmkpf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ibmd1eXVyamR0Y3h6dGxta3BmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMTA5NjksImV4cCI6MjA3MjY4Njk2OX0.2vTXra15x8aaUCWFGbwMzu013htD6P50opyHj2wicJI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .limit(1);

    if (error) throw error;
    console.log("✅ Conexión a Supabase exitosa!");
  } catch (err) {
    console.error("❌ Error al conectar con Supabase:", err.message);
  }
}

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

// ================== SISTEMA DE LOGS EN STORAGE ==================

export async function saveLogToStorage(eventType, data, user = null) {
  try {
    const timestamp = new Date().toISOString();

    const logEntry = {
      timestamp,
      event_type: eventType,
      user: user
        ? { id: user.id, email: user.email, role: user.role }
        : null,
      data,
      ip: data.ip || null,
      user_agent: data.userAgent || null,
    };

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    const folderPath = `logs/${year}/${month}/${day}/`;
    const fileName = `log_${timestamp.replace(/[:.]/g, "-")}.json`;

    const logContent = JSON.stringify(logEntry, null, 2);

    // Convertir siempre a Blob para Node
    const blob = new Blob([logContent], {
      type: "application/json",
    });

    const { data: uploadData, error } = await supabase.storage
      .from("logs-bucket")
      .upload(`${folderPath}${fileName}`, blob, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("❌ Error guardando log en storage:", error);
      await saveLogToDatabase(eventType, data, user);
      return;
    }

    console.log("✅ Log guardado en storage:", uploadData?.path);
  } catch (error) {
    console.error("❌ Error en saveLogToStorage:", error);
    await saveLogToDatabase(eventType, data, user);
  }
}

async function saveLogToDatabase(eventType, data, user = null) {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      event_type: eventType,
      user_id: user?.id || null,
      user_email: user?.email || null,
      ip_address: data.ip || null,
      user_agent: data.userAgent || null,
      event_data: data,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("❌ Error guardando log en base de datos:", error);
    } else {
      console.log("✅ Log guardado en base de datos (fallback)");
    }
  } catch (error) {
    console.error("❌ Error en saveLogToDatabase:", error);
  }
}

export async function getLogsFromStorage(date = null) {
  try {
    const targetDate = date ? new Date(date) : new Date();
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");

    const folderPath = `logs/${year}/${month}/${day}/`;

    const { data: files, error } = await supabase.storage
      .from("logs-bucket")
      .list(folderPath);

    if (error) {
      console.error("❌ Error listando logs:", error);
      return [];
    }

    const logs = [];
    for (const file of files || []) {
      try {
        const { data: fileData, error: downloadError } =
          await supabase.storage
            .from("logs-bucket")
            .download(`${folderPath}${file.name}`);

        if (!downloadError && fileData) {
          const content = await fileData.text();
          logs.push(JSON.parse(content));
        }
      } catch (fileError) {
        console.error(
          `❌ Error procesando archivo ${file.name}:`,
          fileError
        );
      }
    }

    return logs.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
  } catch (error) {
    console.error("❌ Error en getLogsFromStorage:", error);
    return [];
  }
}

export async function getLogStats() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const logs = await getLogsFromStorage(today);

    const stats = {
      total: logs.length,
      byEventType: {},
      byHour: {},
      errors: logs.filter(
        (log) =>
          log.event_type.includes("ERROR") ||
          log.event_type.includes("FAILED")
      ).length,
      successes: logs.filter((log) =>
        log.event_type.includes("SUCCESS")
      ).length,
    };

    logs.forEach((log) => {
      stats.byEventType[log.event_type] =
        (stats.byEventType[log.event_type] || 0) + 1;

      const hour = new Date(log.timestamp).getHours();
      stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
    });

    return stats;
  } catch (error) {
    console.error("❌ Error obteniendo estadísticas de logs:", error);
    return null;
  }
}

export async function cleanupOldLogs(days = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    console.log(
      `🧹 Eliminando logs anteriores a: ${cutoffDate.toISOString()}`
    );

    return true;
  } catch (error) {
    console.error("❌ Error en limpieza de logs:", error);
    return false;
  }
}

// ================== INICIALIZACIÓN ==================

testConnection();
// createLogsBucket() ELIMINADO
