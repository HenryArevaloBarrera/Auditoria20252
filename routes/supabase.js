import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mbnguyurjdtcxztlmkpf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ibmd1eXVyamR0Y3h6dGxta3BmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMTA5NjksImV4cCI6MjA3MjY4Njk2OX0.2vTXra15x8aaUCWFGbwMzu013htD6P50opyHj2wicJI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ================== FUNCIONES AUXILIARES ==================

// ✅ Verificar si un usuario existe por email
export async function getUserByEmail(email) {
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", email)
      .maybeSingle(); // no falla si no encuentra nada

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ Error buscando usuario:", err.message);
    return null;
  }
}

// ✅ Insertar usuario y devolverlo
export async function insertUser(user) {
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .insert([user])
      .select(); // devuelve el registro insertado

    if (error) throw error;
    console.log("✅ Usuario insertado:", data[0]);
    return data[0];
  } catch (err) {
    console.error("❌ Error insertando usuario:", err.message);
    return null;
  }
}

// ✅ Probar conexión
export async function testConnection() {
  try {
    const { data, error } = await supabase.from("usuarios").select("*").limit(1);
    if (error) throw error;
    console.log("✅ Conexión a Supabase exitosa!");
  } catch (err) {
    console.error("❌ Error al conectar con Supabase:", err.message);
  }
}


// ✅ Actualizar intentos fallidos
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

// ✅ Bloquear usuario
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

// ✅ Resetear intentos al hacer login correcto
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

// ✅ Desbloquear usuario

export async function unblockUser(email) {
  try {
    const { error } = await supabase
      .from("usuarios")
      .update({ bloqueado: false, intentos_fallidos: 0 }) // lo desbloquea y reinicia intentos
      .eq("email", email);

    if (error) throw error;
    console.log(`✅ Usuario desbloqueado: ${email}`);
  } catch (err) {
    console.error("❌ Error desbloqueando usuario:", err.message);
  }
}

// Ejecutar prueba al iniciar
testConnection();