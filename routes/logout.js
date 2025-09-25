// routes/logout.js
import express from "express";
const router = express.Router();

router.get("/logout", (req, res) => {
  // 🔐 1. Destruir sesión en el servidor
  req.session.destroy((err) => {
    if (err) {
      console.error("Error al cerrar sesión:", err);
      return res.redirect("/");
    }

    // 🧹 2. Eliminar cookies de sesión del navegador
    res.clearCookie("connect.sid"); // Nombre por defecto de express-session

    // 🔁 3. Redirigir a login
    return res.redirect("/login");
  });
});

export default router;
