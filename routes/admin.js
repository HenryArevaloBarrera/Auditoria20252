import express from "express";
import { supabase, unblockUser } from "./supabase.js";
import { auditEvent } from "../resources/audit.js";

const router = express.Router();

/* ------------------------------------------------------
   📌 Panel admin → muestra usuarios, productos y bloqueados
------------------------------------------------------ */
router.get("/admin", async (req, res) => {
  try {
    // ✅ Registrar evento de acceso al panel admin
    auditEvent("ADMIN_PANEL_ACCESS", {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      route: "/admin"
    }, req.session.user);

    // Usuarios bloqueados
    const { data: bloqueados, error: errorBloq } = await supabase
      .from("usuarios")
      .select("*")
      .eq("estado", "bloqueado");

    if (errorBloq) console.error("Error al obtener bloqueados:", errorBloq.message);

    // Usuarios
    const { data: usuarios, error: errorUsr } = await supabase
      .from("usuarios")
      .select("*");

    if (errorUsr) console.error("Error al obtener usuarios:", errorUsr.message);

    // Productos
    const { data: productos, error: errorProd } = await supabase
      .from("productos")
      .select("*");

    if (errorProd) console.error("Error al obtener productos:", errorProd.message);

    // Renderizar admin
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

    auditEvent("ADMIN_PANEL_ACCESS_ERROR", {
      error: err.message,
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    }, req.session.user);

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

/* ------------------------------------------------------
   📌 Desbloquear usuario
------------------------------------------------------ */
router.post("/admin/unblock-user", async (req, res) => {
  try {
    const { email } = req.body;

    // ✅ Desbloquear usuario en BD
    await unblockUser(email);

    // ✅ Registrar evento auditoría
    auditEvent("ADMIN_UNBLOCK_USER", {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      targetEmail: email
    }, req.session.user);

    res.redirect("/admin");

  } catch (error) {
    console.error("❌ Error desbloqueando:", error.message);

    auditEvent("ADMIN_UNBLOCK_USER_ERROR", {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      targetEmail: req.body.email,
      error: error.message
    }, req.session.user);

    res.redirect("/admin");
  }
});

export default router;
