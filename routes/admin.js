import express from "express";
import { supabase, unblockUser } from "./supabase.js";


const router = express.Router();

// 📌 Panel admin → muestra usuarios, productos y bloqueados
router.get("/admin", async (req, res) => {
  try {
    // Traer usuarios bloqueados
    const { data: bloqueados, error: errorBloq } = await supabase
      .from("usuarios")
      .select("*")
      .eq("estado", "bloqueado");

    if (errorBloq) console.error("Error al obtener bloqueados:", errorBloq.message);

    // Traer todos los usuarios
    const { data: usuarios, error: errorUsr } = await supabase
      .from("usuarios")
      .select("*");

    if (errorUsr) console.error("Error al obtener usuarios:", errorUsr.message);

    // Traer productos
    const { data: productos, error: errorProd } = await supabase
      .from("productos")
      .select("*");

    if (errorProd) console.error("Error al obtener productos:", errorProd.message);

    // Render con todo junto
    res.render("admin.ejs", {
      bloqueados: bloqueados || [],
      usuarios: usuarios || [],
      productos: productos || [],
      title: "Panel de Administración",
      message: null,
      messageType: null
    });
  } catch (err) {
    console.error("Error inesperado en admin:", err.message);
    res.render("admin.ejs", {
      bloqueados: [],
      usuarios: [],
      productos: [],
      title: "Panel de Administración",
      message: "Error cargando datos",
      messageType: "danger"
    });
  }
});

// 📌 Desbloquear usuario
router.post("/admin/unblock-user", async (req, res) => {
  try {
    const { email } = req.body;
    await unblockUser(email);

    res.redirect("/admin");
  } catch (error) {
    console.error("❌ Error desbloqueando:", error.message);
    res.redirect("/admin");
  }
});

export default router;
