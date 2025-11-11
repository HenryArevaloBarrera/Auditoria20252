import { supabase } from "../routes/supabase.js";

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

export async function appendToDailyLog(event) {
  try {
    const filename = generateDailyName();

    // 1) Obtener contenido del archivo actual
    const existing = await downloadLogFile(filename);

    // 2) Agregar nueva línea (evento)
    const newLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event
    }) + "\n";

    const newContent = existing + newLine;

    // 3) Subir archivo actualizado
    const upload = await supabase.storage
      .from("audit-logs")
      .upload(filename, newContent, {
        contentType: "text/plain",
        upsert: true
      });

    if (upload.error) {
      console.error("❌ Error subiendo archivo log diario:", upload.error.message);
    }

  } catch (err) {
    console.error("❌ Error en appendToDailyLog:", err.message);
  }
}
