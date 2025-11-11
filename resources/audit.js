import { saveLogToStorage, getLogsFromStorage, getLogStats } from "../routes/supabase.js";

/**
 * Función de auditoría mejorada que guarda en Supabase Storage
 * @param {string} eventType - Tipo de evento
 * @param {Object} eventData - Datos del evento
 * @param {Object} user - Usuario relacionado (opcional)
 */
export async function auditEvent(eventType, eventData, user = null) {
  try {
    // Guardar en Supabase Storage
    await saveLogToStorage(eventType, eventData, user);
    
    // También mantener el console.log para desarrollo
    console.log(`[AUDIT] ${eventType}:`, {
      timestamp: new Date().toISOString(),
      user: user ? { id: user.id, email: user.email } : 'anonymous',
      data: eventData
    });
    
  } catch (error) {
    console.error('❌ Error en auditEvent:', error);
  }
}

/**
 * Función para obtener logs (para panel admin)
 */
export async function getAuditLogs(date = null, limit = 100) {
  try {
    const logs = await getLogsFromStorage(date);
    return logs.slice(0, limit);
  } catch (error) {
    console.error('❌ Error obteniendo logs de auditoría:', error);
    return [];
  }
}

/**
 * Obtener estadísticas de auditoría
 */
export async function getAuditStats() {
  try {
    return await getLogStats();
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas de auditoría:', error);
    return null;
  }
}