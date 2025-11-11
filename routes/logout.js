// routes/logout.js
import express from "express";
import { auditEvent } from "../resources/audit.js";

const router = express.Router();

router.get("/logout", (req, res) => {

  // ✅ Registrar el evento ANTES de destruir la sesión
  auditEvent("LOGOUT", {
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  }, req.session.user);

  req.session.destroy((err) => {
    if (err) {

      // ✅ Registrar error en logout
      auditEvent("LOGOUT_ERROR", {
        error: err.message,
        ip: req.ip,
        userAgent: req.headers["user-agent"]
      }, req.session.user);

      console.error("Error al cerrar sesión:", err);
      return res.redirect("/");
    }

    // ✅ Limpiar cookies de sesión
    res.clearCookie("connect.sid");

    // ✅ Redirigir a login
    return res.redirect("/login");
  });
});

export default router;
