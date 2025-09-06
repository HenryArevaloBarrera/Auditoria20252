import express from "express";
import bcrypt from "bcryptjs";
import { supabase } from "./supabase.js"; // tu conexión a Supabase

const router = express.Router();

// ================== MIDDLEWARE ==================
async function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    console.log("No es admin o no está logueado");
    return res.redirect("/login");
  }
  console.log("Usuario admin verificado");
  next();
}

// ================== RUTAS ==================

// Página principal
router.get("/", async (req, res) => {
  console.log("GET / -> Consultando usuarios");
  try {
    const { data: usuarios, error } = await supabase.from("usuarios").select("*");
    if (error) throw error;
    console.log("Usuarios obtenidos:", usuarios.length);
    res.render("index.ejs", { data: usuarios, title: "Mi Página Principal" });
  } catch (error) {
    console.error("Error obteniendo usuarios:", error.message);
    res.render("index.ejs", { data: [], title: "Mi Página Principal" });
  }
});

// ================= Registro =================
router.get("/register", async (req, res) => {
  console.log("GET /register -> Mostrando formulario");
  res.render("register.ejs", { data: [], title: "Registro de Usuario" });
});

router.post("/register", async (req, res) => {
  console.log("POST /register -> Registrando usuario");
  try {
    const { nombre, apellido, identificacion, email, password, fechaNacimiento, telefono } = req.body;

    // Verificar si ya existe
    const { data: existingUser } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      console.log("Email ya registrado:", email);
      return res.render("register.ejs", {
        message: "El email ya está registrado.",
        messageType: "warning",
        title: "Registro"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar y devolver el nuevo usuario
    const { data, error } = await supabase
      .from("usuarios")
      .insert([{
  nombre,
  apellido,
  identificacion,
  email,
  password: hashedPassword,
  fechanacimiento: fechaNacimiento, // 👈 cambia aquí
  telefono
}])

      .select();

    if (error) throw error;

    console.log("✅ Usuario insertado:", data[0]);

    res.render("register.ejs", {
      message: "Usuario registrado correctamente.",
      messageType: "success",
      title: "Registro"
    });
  } catch (error) {
    console.error("❌ Error registrando usuario:", error.message);
    res.render("register.ejs", {
      message: "Error al registrar el usuario.",
      messageType: "danger",
      title: "Registro"
    });
  }
});


// ================= Login =================
router.get("/login", (req, res) => {
  console.log("GET /login -> Mostrando formulario");
  res.render("login.ejs", { message: null, messageType: null, title: "Iniciar Sesión" });
});

router.post("/login", async (req, res) => {
  console.log("POST /login -> Intentando iniciar sesión");
  try {
    const { email, password, role } = req.body;
    let user;

    if (role === "admin") {
      const { data: admins } = await supabase.from("admins").select("*").eq("email", email).single();
      user = admins;
      console.log("Buscando admin:", email);
    } else {
      const { data: usuarios } = await supabase.from("usuarios").select("*").eq("email", email).single();
      user = usuarios;
      console.log("Buscando usuario:", email);
    }

    if (!user) {
      console.log("Usuario no encontrado");
      return res.render("login.ejs", { message: "Datos Incorrectos.", messageType: "warning", title: "Iniciar Sesión" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log("Contraseña incorrecta");
      return res.render("login.ejs", { message: "Datos Incorrectos.", messageType: "danger", title: "Iniciar Sesión" });
    }

    req.session.user = { nombre: user.nombre, apellido: user.apellido, email: user.email, role };
    console.log("Usuario logueado:", email);

    if (role === "admin") return res.redirect("/admin");
    res.redirect("/");
  } catch (error) {
    console.error("Error en login:", error.message);
    res.render("login.ejs", { message: "Error al iniciar sesión.", messageType: "danger", title: "Iniciar Sesión" });
  }
});

// ================= Logout =================
router.get("/logout", (req, res) => {
  console.log("GET /logout -> Cerrando sesión");
  req.session.destroy(err => {
    if (err) console.error("Error cerrando sesión:", err);
    res.redirect("/login");
  });
});

// ================= Perfil =================
router.get("/perfil", async (req, res) => {
  console.log("GET /perfil -> Mostrando perfil");
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.role === "admin") return res.redirect("/admin");

  try {
    const { data: user, error } = await supabase.from("usuarios").select("*").eq("email", req.session.user.email).single();
    if (error) throw error;
    res.render("perfil.ejs", { user, title: "Mi Perfil", message: null, messageType: null });
  } catch (error) {
    console.error("Error cargando perfil:", error.message);
    res.redirect("/login");
  }
});

router.post("/perfil/update", async (req, res) => {
  console.log("POST /perfil/update -> Actualizando datos");
  if (!req.session.user) return res.redirect("/login");

  try {
    const { nombre, apellido, telefono, password } = req.body;
    const { data: user } = await supabase.from("usuarios").select("*").eq("email", req.session.user.email).single();

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log("Contraseña incorrecta al actualizar perfil");
      return res.render("perfil.ejs", { user, message: "Contraseña incorrecta", messageType: "danger", title: "Mi Perfil" });
    }

    await supabase.from("usuarios").update({ nombre, apellido, telefono }).eq("email", req.session.user.email);
    req.session.user.nombre = nombre;
    req.session.user.apellido = apellido;
    console.log("Perfil actualizado:", req.session.user.email);

    res.render("perfil.ejs", { user: { ...user, nombre, apellido, telefono }, message: "Datos actualizados", messageType: "success", title: "Mi Perfil" });
  } catch (error) {
    console.error("Error actualizando perfil:", error.message);
    res.render("perfil.ejs", { message: "Error al actualizar datos", messageType: "danger", title: "Mi Perfil" });
  }
});

router.post("/perfil/update-password", async (req, res) => {
  console.log("POST /perfil/update-password -> Cambiando contraseña");
  if (!req.session.user) return res.redirect("/login");

  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;
    const { data: user } = await supabase.from("usuarios").select("*").eq("email", req.session.user.email).single();

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) {
      console.log("Contraseña actual incorrecta");
      return res.render("perfil.ejs", { user, title: "Mi Perfil", message: "Contraseña actual incorrecta", messageType: "danger" });
    }

    if (newPassword !== confirmNewPassword) {
      console.log("Nuevas contraseñas no coinciden");
      return res.render("perfil.ejs", { user, title: "Mi Perfil", message: "Las nuevas contraseñas no coinciden", messageType: "warning" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await supabase.from("usuarios").update({ password: hashedPassword }).eq("email", req.session.user.email);
    console.log("Contraseña actualizada para:", req.session.user.email);

    res.render("perfil.ejs", { user: { ...user, password: hashedPassword }, title: "Mi Perfil", message: "Contraseña actualizada", messageType: "success" });
  } catch (error) {
    console.error("Error cambiando contraseña:", error.message);
    res.render("perfil.ejs", { message: "Error al actualizar contraseña", messageType: "danger", title: "Mi Perfil" });
  }
});

router.post("/perfil/delete", async (req, res) => {
  console.log("POST /perfil/delete -> Eliminando usuario");
  if (!req.session.user) return res.redirect("/login");

  try {
    const { password } = req.body;
    const { data: user } = await supabase.from("usuarios").select("*").eq("email", req.session.user.email).single();

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log("Contraseña incorrecta al eliminar usuario");
      return res.render("perfil.ejs", { user, title: "Mi Perfil", message: "Contraseña incorrecta", messageType: "danger" });
    }

    await supabase.from("usuarios").delete().eq("email", req.session.user.email);
    console.log("Usuario eliminado:", req.session.user.email);
    req.session.destroy();
    res.redirect("/register");
  } catch (error) {
    console.error("Error eliminando usuario:", error.message);
    res.redirect("/perfil");
  }
});

// ================= PANEL ADMIN =================
router.get("/admin", isAdmin, async (req, res) => {
  console.log("GET /admin -> Cargando panel de admin");
  try {
    const { data: usuarios } = await supabase.from("usuarios").select("*");
    const { data: productos } = await supabase.from("productos").select("*");
    console.log("Usuarios y productos cargados");

    res.render("admin.ejs", { usuarios, productos, title: "Panel de Administración", message: null, messageType: null });
  } catch (error) {
    console.error("Error cargando admin:", error.message);
    res.render("admin.ejs", { usuarios: [], productos: [], title: "Panel de Administración", message: "Error cargando datos", messageType: "danger" });
  }
});

// ================= USUARIOS =================
router.post("/admin/delete-user", isAdmin, async (req, res) => {
  console.log("POST /admin/delete-user -> Eliminando usuario");
  try {
    const { email } = req.body;
    await supabase.from("usuarios").delete().eq("email", email);
    console.log("Usuario eliminado:", email);
    res.redirect("/admin");
  } catch (error) {
    console.error("Error eliminando usuario:", error.message);
    res.redirect("/admin");
  }
});

// ================= PRODUCTOS =================
router.post("/admin/add-product", isAdmin, async (req, res) => {
  console.log("POST /admin/add-product -> Agregando producto");
  try {
    const { nombre, descripcion, precio, stock, color, imagen } = req.body;
    await supabase.from("productos").insert([{ nombre, descripcion, precio: parseFloat(precio), stock: parseInt(stock), color, imagen }]);
    console.log("Producto agregado:", nombre);
    res.redirect("/admin");
  } catch (error) {
    console.error("Error agregando producto:", error.message);
    res.redirect("/admin");
  }
});

router.post("/admin/edit-product", isAdmin, async (req, res) => {
  console.log("POST /admin/edit-product -> Editando producto");
  try {
    const { id, nombre, descripcion, precio, stock, color, imagen } = req.body;
    await supabase.from("productos").update({ nombre, descripcion, precio: parseFloat(precio), stock: parseInt(stock), color, imagen }).eq("id", parseInt(id));
    console.log("Producto actualizado:", id);
    res.redirect("/admin");
  } catch (error) {
    console.error("Error editando producto:", error.message);
    res.redirect("/admin");
  }
});

router.post("/admin/delete-product", isAdmin, async (req, res) => {
  console.log("POST /admin/delete-product -> Eliminando producto");
  try {
    const { id } = req.body;
    await supabase.from("productos").delete().eq("id", parseInt(id));
    console.log("Producto eliminado:", id);
    res.redirect("/admin");
  } catch (error) {
    console.error("Error eliminando producto:", error.message);
    res.redirect("/admin");
  }
});

export default router;
