import express from "express";
import fetch from "node-fetch";
import bcrypt from "bcryptjs";
import {
  supabase,
  getUserByEmail,
  updateFailedAttempts,
  blockUser,
  resetAttempts,
  unblockUser
} from "./supabase.js";

import { auditEvent } from "../resources/audit.js";

const router = express.Router();

/* ============================================================
   ✅   MIDDLEWARE: Verificar si es ADMIN
============================================================ */
async function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {

    // AUDITORÍA: intento de acceso NO autorizado - CORREGIDO
    auditEvent("ACCESS_DENIED_ADMIN_PANEL", req, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      attemptedRoute: "/admin"
    }, req.session.user);

    return res.redirect("/login");
  }

  // AUDITORÍA: acceso al panel admin verificado - CORREGIDO
  auditEvent("ADMIN_AUTH_VERIFIED", req, {
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  }, req.session.user);

  next();
}

/* ============================================================
   ✅   PÁGINA PRINCIPAL
============================================================ */
router.get("/", async (req, res) => {
  try {

    // CORREGIDO: agregar req como segundo parámetro
    auditEvent("PAGE_VIEW_HOME", req, {
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    }, req.session.user);

    const { data: usuarios } = await supabase.from("usuarios").select("*");

    res.render("index.ejs", { data: usuarios || [], title: "Mi Página Principal" });

  } catch (error) {

    // CORREGIDO
    auditEvent("PAGE_VIEW_HOME_ERROR", req, {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.render("index.ejs", { data: [], title: "Mi Página Principal" });
  }
});

/* ============================================================
   ✅   REGISTRO
============================================================ */
router.get("/register", (req, res) => {

  // CORREGIDO
  auditEvent("PAGE_VIEW_REGISTER", req, {
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  });

  res.render("register.ejs", { data: [], title: "Registro de Usuario" });
});

router.post("/register", async (req, res) => {
  try {
    const { nombre, apellido, identificacion, email, password, fechaNacimiento, telefono } = req.body;

    // CORREGIDO
    auditEvent("REGISTER_ATTEMPT", req, {
      email,
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });

    // ¿Existe ya?
    const { data: existingUser } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {

      // CORREGIDO
      auditEvent("REGISTER_FAILED_EMAIL_EXISTS", req, {
        email,
        ip: req.ip
      });

      return res.render("register.ejs", {
        message: "El email ya está registrado.",
        messageType: "warning",
        title: "Registro"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("usuarios")
      .insert([{
        nombre,
        apellido,
        identificacion,
        email,
        password: hashedPassword,
        fechanacimiento: fechaNacimiento,
        telefono
      }])
      .select();

    if (error) throw error;

    // CORREGIDO
    auditEvent("REGISTER_SUCCESS", req, {
      email,
      ip: req.ip
    }, { email });

    res.render("register.ejs", {
      message: "Usuario registrado correctamente.",
      messageType: "success",
      title: "Registro"
    });
  } catch (error) {

    // CORREGIDO
    auditEvent("REGISTER_ERROR", req, {
      error: error.message,
      ip: req.ip
    });

    res.render("register.ejs", {
      message: "Error al registrar el usuario.",
      messageType: "danger",
      title: "Registro"
    });
  }
});

/* ============================================================
   ✅   LOGIN
============================================================ */
router.get("/login", (req, res) => {

  // CORREGIDO
  auditEvent("PAGE_VIEW_LOGIN", req, {
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  });

  res.render("login.ejs", { message: null, messageType: null, title: "Iniciar Sesión" });
});

router.post("/login", async (req, res) => {
  try {
    const { email, password, role, "g-recaptcha-response": recaptchaToken } = req.body;

    // CORREGIDO
    auditEvent("LOGIN_ATTEMPT", req, {
      email,
      role,
      ip: req.ip
    });

    // Validación de captcha
    const secretKey = "6LdEBxIsAAAAAPSIL0-QWDWb_gvhyF_RsipZLDPX";
    const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;

    const captchaResponse = await fetch(verifyURL, { method: "POST" });
    const captchaData = await captchaResponse.json();

    if (!captchaData.success) {

      // CORREGIDO
      auditEvent("LOGIN_FAILED_CAPTCHA", req, {
        email,
        ip: req.ip
      });

      return res.render("login.ejs", {
        message: "Verificación de reCAPTCHA fallida.",
        messageType: "danger",
        title: "Iniciar Sesión"
      });
    }

    // Buscar usuario
    let user;
    if (role === "admin") {
      const { data: admin } = await supabase
        .from("admins")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      user = admin;
    } else {
      user = await getUserByEmail(email);
    }

    if (!user) {
      // CORREGIDO
      auditEvent("LOGIN_FAILED_USER_NOT_FOUND", req, {
        email,
        ip: req.ip
      });
      return res.render("login.ejs", {
        message: "Usuario o contraseña incorrectas",
        messageType: "warning",
        title: "Iniciar Sesión"
      });
    }

    if (user.bloqueado) {
      // CORREGIDO
      auditEvent("LOGIN_BLOCKED_USER", req, {
        email,
        ip: req.ip
      });
      return res.render("login.ejs", {
        message: "Tu cuenta está bloqueada.",
        messageType: "danger",
        title: "Iniciar Sesión"
      });
    }

    // Comparación de contraseña
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      const attempts = (user.intentos_fallidos || 0) + 1;

      // CORREGIDO
      auditEvent("LOGIN_WRONG_PASSWORD", req, {
        email,
        attempts,
        ip: req.ip
      });

      if (attempts >= 3) {
        await blockUser(email);

        // CORREGIDO
        auditEvent("USER_AUTO_BLOCKED", req, {
          email,
          ip: req.ip
        });

        return res.render("login.ejs", {
          message: "Cuenta bloqueada por seguridad.",
          messageType: "danger",
          title: "Iniciar Sesión"
        });
      }

      await updateFailedAttempts(email, attempts);

      return res.render("login.ejs", {
        message: `Datos incorrectos. Intentos fallidos: ${attempts}/3`,
        messageType: "danger",
        title: "Iniciar Sesión"
      });
    }

    // Login correcto
    await resetAttempts(email);

    req.session.user = {
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      role
    };

    // CORREGIDO
    auditEvent("LOGIN_SUCCESS", req, {
      email,
      ip: req.ip
    }, user);

    if (role === "admin") return res.redirect("/admin");
    return res.redirect("/");

  } catch (error) {

    // CORREGIDO
    auditEvent("LOGIN_ERROR", req, {
      error: error.message,
      ip: req.ip
    });

    return res.render("login.ejs", {
      message: "Error al iniciar sesión",
      messageType: "danger",
      title: "Iniciar Sesión"
    });
  }
});

/* ============================================================
   ✅  LOGOUT
============================================================ */
router.get("/logout", (req, res) => {

  // CORREGIDO
  auditEvent("LOGOUT", req, {
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  }, req.session.user);

  req.session.destroy(err => {
    if (err) {
      // CORREGIDO
      auditEvent("LOGOUT_ERROR", req, {
        error: err.message,
        ip: req.ip
      }, req.session.user);
    }
    res.redirect("/login");
  });
});

/* ============================================================
   ✅   PERFIL / UPDATE / DELETE
============================================================ */
router.get("/perfil", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  // CORREGIDO
  auditEvent("PROFILE_VIEW", req, {
    ip: req.ip
  }, req.session.user);

  try {
    const { data: user } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", req.session.user.email)
      .single();

    res.render("perfil.ejs", { user, title: "Mi Perfil", message: null, messageType: null });
  } catch (error) {

    // CORREGIDO
    auditEvent("PROFILE_VIEW_ERROR", req, {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.redirect("/login");
  }
});

router.post("/perfil/update", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    const { nombre, apellido, telefono, password } = req.body;

    const { data: user } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", req.session.user.email)
      .single();

    const match = await bcrypt.compare(password, user.password);
    if (!match) {

      // CORREGIDO
      auditEvent("PROFILE_UPDATE_WRONG_PASSWORD", req, {
        ip: req.ip
      }, req.session.user);

      return res.render("perfil.ejs", {
        user,
        message: "Contraseña incorrecta",
        messageType: "danger",
        title: "Mi Perfil"
      });
    }

    await supabase.from("usuarios")
      .update({ nombre, apellido, telefono })
      .eq("email", req.session.user.email);

    req.session.user.nombre = nombre;
    req.session.user.apellido = apellido;

    // CORREGIDO
    auditEvent("PROFILE_UPDATED", req, {
      oldValue: user,
      newValue: { nombre, apellido, telefono },
      ip: req.ip
    }, req.session.user);

    res.render("perfil.ejs", {
      user: { ...user, nombre, apellido, telefono },
      message: "Datos actualizados",
      messageType: "success",
      title: "Mi Perfil"
    });

  } catch (error) {

    // CORREGIDO
    auditEvent("PROFILE_UPDATE_ERROR", req, {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.render("perfil.ejs", {
      message: "Error al actualizar datos",
      messageType: "danger",
      title: "Mi Perfil"
    });
  }
});

router.post("/perfil/update-password", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;

    const { data: user } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", req.session.user.email)
      .single();

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) {

      // CORREGIDO
      auditEvent("PROFILE_PASSWORD_WRONG_OLD_PASSWORD", req, {
        ip: req.ip
      }, req.session.user);

      return res.render("perfil.ejs", {
        user,
        title: "Mi Perfil",
        message: "Contraseña actual incorrecta",
        messageType: "danger"
      });
    }

    if (newPassword !== confirmNewPassword) {

      // CORREGIDO
      auditEvent("PROFILE_PASSWORD_MISMATCH", req, {
        ip: req.ip
      }, req.session.user);

      return res.render("perfil.ejs", {
        user,
        title: "Mi Perfil",
        message: "Las nuevas contraseñas no coinciden",
        messageType: "warning"
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await supabase
      .from("usuarios")
      .update({ password: hashedPassword })
      .eq("email", req.session.user.email);

    // CORREGIDO
    auditEvent("PROFILE_PASSWORD_UPDATED", req, {
      ip: req.ip
    }, req.session.user);

    res.render("perfil.ejs", {
      user: { ...user, password: hashedPassword },
      title: "Mi Perfil",
      message: "Contraseña actualizada",
      messageType: "success"
    });

  } catch (error) {

    // CORREGIDO
    auditEvent("PROFILE_PASSWORD_UPDATE_ERROR", req, {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.render("perfil.ejs", {
      message: "Error al actualizar contraseña",
      messageType: "danger",
      title: "Mi Perfil"
    });
  }
});

router.post("/perfil/delete", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    const { password } = req.body;

    const { data: user } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", req.session.user.email)
      .single();

    const match = await bcrypt.compare(password, user.password);
    if (!match) {

      // CORREGIDO
      auditEvent("PROFILE_DELETE_WRONG_PASSWORD", req, {
        ip: req.ip
      }, req.session.user);

      return res.render("perfil.ejs", {
        user,
        title: "Mi Perfil",
        message: "Contraseña incorrecta",
        messageType: "danger"
      });
    }

    await supabase.from("usuarios").delete().eq("email", req.session.user.email);

    // CORREGIDO
    auditEvent("PROFILE_DELETED", req, {
      ip: req.ip
    }, req.session.user);

    req.session.destroy();
    res.redirect("/register");

  } catch (error) {

    // CORREGIDO
    auditEvent("PROFILE_DELETE_ERROR", req, {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.redirect("/perfil");
  }
});

/* ============================================================
   ✅   ADMIN PANEL + CRUD
============================================================ */

router.get("/admin", isAdmin, async (req, res) => {
  try {

    // CORREGIDO
    auditEvent("ADMIN_PANEL_VIEW", req, {
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    }, req.session.user);

    const { data: usuarios } = await supabase.from("usuarios").select("*");
    const { data: productos } = await supabase.from("productos").select("*");
    const { data: bloqueados } = await supabase
      .from("usuarios")
      .select("*")
      .eq("bloqueado", true);

    res.render("admin.ejs", {
      usuarios: usuarios || [],
      productos: productos || [],
      bloqueados: bloqueados || [],
      title: "Panel de Administración",
      message: null,
      messageType: null
    });
  } catch (error) {

    // CORREGIDO
    auditEvent("ADMIN_PANEL_VIEW_ERROR", req, {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.render("admin.ejs", {
      usuarios: [],
      productos: [],
      bloqueados: [],
      title: "Panel de Administración",
      message: "Error cargando datos",
      messageType: "danger"
    });
  }
});

router.post("/admin/delete-user", isAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    await supabase.from("usuarios").delete().eq("email", email);

    // CORREGIDO
    auditEvent("ADMIN_DELETE_USER", req, {
      targetEmail: email,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");

  } catch (error) {

    // CORREGIDO
    auditEvent("ADMIN_DELETE_USER_ERROR", req, {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");
  }
});

router.post("/admin/add-product", isAdmin, async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock, color, imagen } = req.body;

    await supabase.from("productos").insert([{
      nombre,
      descripcion,
      precio: parseFloat(precio),
      stock: parseInt(stock),
      color,
      imagen
    }]);

    // CORREGIDO
    auditEvent("ADMIN_ADD_PRODUCT", req, {
      product: nombre,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");

  } catch (error) {

    // CORREGIDO
    auditEvent("ADMIN_ADD_PRODUCT_ERROR", req, {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");
  }
});

router.post("/admin/edit-product", isAdmin, async (req, res) => {
  try {
    const { id, nombre, descripcion, precio, stock, color, imagen } = req.body;

    await supabase
      .from("productos")
      .update({
        nombre,
        descripcion,
        precio: parseFloat(precio),
        stock: parseInt(stock),
        color,
        imagen
      })
      .eq("id", parseInt(id));

    // CORREGIDO
    auditEvent("ADMIN_EDIT_PRODUCT", req, {
      productId: id,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");

  } catch (error) {

    // CORREGIDO
    auditEvent("ADMIN_EDIT_PRODUCT_ERROR", req, {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");
  }
});

router.post("/admin/delete-product", isAdmin, async (req, res) => {
  try {
    const { id } = req.body;

    await supabase.from("productos").delete().eq("id", parseInt(id));

    // CORREGIDO
    auditEvent("ADMIN_DELETE_PRODUCT", req, {
      productId: id,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");

  } catch (error) {

    // CORREGIDO
    auditEvent("ADMIN_DELETE_PRODUCT_ERROR", req, {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");
  }
});

export default router;