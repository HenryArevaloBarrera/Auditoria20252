import express from "express";
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";

const router = express.Router();

// ================== PATHS ==================
const usuariosPath = path.resolve("./resources/usuarios.json");
const productosPath = path.resolve("./resources/productos.json");
const AdminPath = path.resolve("./resources/admin.json"); // ruta al JSON

// ================== FUNCIONES ==================

// Leer usuarios
function leerUsuarios() {
  if (!fs.existsSync(usuariosPath)) return [];
  const data = fs.readFileSync(usuariosPath, "utf-8");
  return JSON.parse(data);
}

// Guardar usuarios
function guardarUsuarios(usuarios) {
  fs.writeFileSync(usuariosPath, JSON.stringify(usuarios, null, 2));
}

// Funciones genéricas JSON (usuarios/productos)
function leerJSON(ruta) {
  if (!fs.existsSync(ruta)) return [];
  return JSON.parse(fs.readFileSync(ruta, "utf-8"));
}

function guardarJSON(ruta, data) {
  fs.writeFileSync(ruta, JSON.stringify(data, null, 2));
}

// Middleware para proteger rutas de admin
function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.redirect("/login");
  }
  next();
}

// ================== RUTAS ==================

// Página principal
router.get("/", (req, res) => {
  const data = leerUsuarios();
  res.render("index.ejs", { data, title: "Mi Página Principal" });
});

// ================= Registro =================
router.get("/register", (req, res) => {
  res.render("register.ejs", { data: leerUsuarios(), title: "Registro de Usuario" });
});

router.post("/register", async (req, res) => {
  try {
    const { nombre, apellido, identificacion, email, password, fechaNacimiento, telefono } = req.body;
    const usuarios = leerUsuarios();

    if (usuarios.some(u => u.email === email)) {
      return res.render("register.ejs", {
        data: usuarios,
        title: "Registro de Usuario",
        message: "El email ya está registrado.",
        messageType: "warning"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const nuevoUsuario = { nombre, apellido, identificacion, email, password: hashedPassword, fechaNacimiento, telefono };
    usuarios.push(nuevoUsuario);
    guardarUsuarios(usuarios);

    res.render("register.ejs", {
      data: usuarios,
      title: "Registro de Usuario",
      message: "Usuario registrado correctamente.",
      messageType: "success"
    });
  } catch (error) {
    console.error(error);
    res.render("register.ejs", {
      data: leerUsuarios(),
      title: "Registro de Usuario",
      message: "Error al registrar el usuario.",
      messageType: "danger"
    });
  }
});

// ================= Login =================
router.get("/login", (req, res) => {
  res.render("login.ejs", { message: null, messageType: null, title: "Iniciar Sesión" });
});

router.post("/login", async (req, res) => {
  const { email, password, role } = req.body;

  let user;
  if (role === "admin") {
    const admins = leerJSON(AdminPath);
    user = admins.find(u => u.email === email);
  } else {
    const usuarios = leerUsuarios();
    user = usuarios.find(u => u.email === email);
  }

  if (!user) {
    return res.render("login.ejs", { message: "Datos Incorrectos.", messageType: "warning", title: "Iniciar Sesión" });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.render("login.ejs", { message: "Datos Incorrectos.", messageType: "danger", title: "Iniciar Sesión" });
  }

  req.session.user = {
    nombre: user.nombre,
    apellido: user.apellido,
    email: user.email,
    role: role
  };

  if (role === "admin") return res.redirect("/admin");
  res.redirect("/");
});

// ================= Logout =================
router.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect("/login");
  });
});

// ================= Perfil =================
// ================= Perfil =================
router.get("/perfil", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  // Si es admin, redirige a /admin
  if (req.session.user.role === "admin") return res.redirect("/admin");

  const usuarios = leerUsuarios();
  const user = usuarios.find(u => u.email === req.session.user.email);
  if (!user) return res.redirect("/login");

  res.render("perfil.ejs", { 
    user, 
    title: "Mi Perfil",
    message: null, 
    messageType: null 
  });
});


router.post("/perfil/update", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { nombre, apellido, telefono, password } = req.body;
  const usuarios = leerUsuarios();
  const userIndex = usuarios.findIndex(u => u.email === req.session.user.email);

  if (userIndex === -1) return res.redirect("/login");

  const match = await bcrypt.compare(password, usuarios[userIndex].password);
  if (!match) {
    return res.render("perfil.ejs", { user: usuarios[userIndex], message: "Contraseña incorrecta", messageType: "danger" });
  }

  usuarios[userIndex].nombre = nombre;
  usuarios[userIndex].apellido = apellido;
  usuarios[userIndex].telefono = telefono;

  guardarUsuarios(usuarios);
  req.session.user.nombre = nombre;
  req.session.user.apellido = apellido;

  res.render("perfil.ejs", { user: usuarios[userIndex], title: "Mi Perfil", message: "Datos actualizados", messageType: "success" });
});

router.post("/perfil/update-password", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { oldPassword, newPassword, confirmNewPassword } = req.body;
  const usuarios = leerUsuarios();
  const userIndex = usuarios.findIndex(u => u.email === req.session.user.email);

  if (userIndex === -1) return res.redirect("/login");

  const match = await bcrypt.compare(oldPassword, usuarios[userIndex].password);
  if (!match) return res.render("perfil.ejs", { user: usuarios[userIndex], title: "Mi Perfil", message: "Contraseña actual incorrecta", messageType: "danger" });

  if (newPassword !== confirmNewPassword) return res.render("perfil.ejs", { user: usuarios[userIndex], title: "Mi Perfil", message: "Las nuevas contraseñas no coinciden", messageType: "warning" });

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  usuarios[userIndex].password = hashedPassword;

  guardarUsuarios(usuarios);
  res.render("perfil.ejs", { user: usuarios[userIndex], title: "Mi Perfil", message: "Contraseña actualizada", messageType: "success" });
});

router.post("/perfil/delete", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { password } = req.body;
  let usuarios = leerUsuarios();
  const userIndex = usuarios.findIndex(u => u.email === req.session.user.email);

  if (userIndex === -1) return res.redirect("/login");

  const match = await bcrypt.compare(password, usuarios[userIndex].password);
  if (!match) return res.render("perfil.ejs", { user: usuarios[userIndex], title: "Mi Perfil", message: "Contraseña incorrecta", messageType: "danger" });

  usuarios.splice(userIndex, 1);
  guardarUsuarios(usuarios);
  req.session.destroy();
  res.redirect("/register");
});

// ================= PANEL ADMIN =================
router.get("/admin", isAdmin, (req, res) => {
  const usuarios = leerJSON(usuariosPath);
  const productos = leerJSON(productosPath);
  res.render("admin.ejs", {
    usuarios,
    productos,
    title: "Panel de Administración",
    message: null,
    messageType: null
  });
});

// ================= USUARIOS =================
router.post("/admin/delete-user", isAdmin, (req, res) => {
  const { email } = req.body;
  let usuarios = leerJSON(usuariosPath);
  usuarios = usuarios.filter(u => u.email !== email);
  guardarJSON(usuariosPath, usuarios);
  res.redirect("/admin");
});

// ================= PRODUCTOS =================
router.post("/admin/add-product", isAdmin, (req, res) => {
  const { nombre, descripcion, precio, stock, color, imagen } = req.body;
  const productos = leerJSON(productosPath);
  const newId = productos.length > 0 ? productos[productos.length - 1].id + 1 : 1;

  const nuevoProducto = {
    id: newId,
    nombre,
    descripcion,
    precio: parseFloat(precio),
    stock: parseInt(stock),
    color,
    imagen
  };

  productos.push(nuevoProducto);
  guardarJSON(productosPath, productos);
  res.redirect("/admin");
});

router.post("/admin/edit-product", isAdmin, (req, res) => {
  const { id, nombre, descripcion, precio, stock, color, imagen } = req.body;
  const productos = leerJSON(productosPath);
  const index = productos.findIndex(p => p.id === parseInt(id));

  if (index !== -1) {
    productos[index] = { id: parseInt(id), nombre, descripcion, precio: parseFloat(precio), stock: parseInt(stock), color, imagen };
    guardarJSON(productosPath, productos);
  }

  res.redirect("/admin");
});

router.post("/admin/delete-product", isAdmin, (req, res) => {
  const { id } = req.body;
  let productos = leerJSON(productosPath);
  productos = productos.filter(p => p.id !== parseInt(id));
  guardarJSON(productosPath, productos);
  res.redirect("/admin");
});

export default router;
