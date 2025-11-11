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

    // AUDITORÍA: intento de acceso NO autorizado
    auditEvent("ACCESS_DENIED_ADMIN_PANEL", {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      attemptedRoute: "/admin"
    }, req.session.user);

    return res.redirect("/login");
  }

  // AUDITORÍA: acceso al panel admin verificado
  auditEvent("ADMIN_AUTH_VERIFIED", {
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

    auditEvent("PAGE_VIEW_HOME", {
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    }, req.session.user);

    const { data: usuarios } = await supabase.from("usuarios").select("*");

    res.render("index.ejs", { data: usuarios || [], title: "Mi Página Principal" });

  } catch (error) {

    auditEvent("PAGE_VIEW_HOME_ERROR", {
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

  auditEvent("PAGE_VIEW_REGISTER", {
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  });

  res.render("register.ejs", { data: [], title: "Registro de Usuario" });
});

router.post("/register", async (req, res) => {
  try {
    const { nombre, apellido, identificacion, email, password, fechaNacimiento, telefono } = req.body;

    auditEvent("REGISTER_ATTEMPT", {
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

      auditEvent("REGISTER_FAILED_EMAIL_EXISTS", {
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

    auditEvent("REGISTER_SUCCESS", {
      email,
      ip: req.ip
    }, { email });

    res.render("register.ejs", {
      message: "Usuario registrado correctamente.",
      messageType: "success",
      title: "Registro"
    });
  } catch (error) {

    auditEvent("REGISTER_ERROR", {
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

  auditEvent("PAGE_VIEW_LOGIN", {
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  });

  res.render("login.ejs", { message: null, messageType: null, title: "Iniciar Sesión" });
});

router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    auditEvent("LOGIN_ATTEMPT", {
      email,
      role,
      ip: req.ip
    });

    // Buscar usuario según rol
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

    // Usuario no encontrado
    if (!user) {
      auditEvent("LOGIN_FAILED_USER_NOT_FOUND", {
        email,
        ip: req.ip
      });

      return res.render("login.ejs", {
        message: "Usuario o contraseña incorrectas",
        messageType: "warning",
        title: "Iniciar Sesión"
      });
    }

    // Usuario bloqueado
    if (user.bloqueado) {
      auditEvent("LOGIN_BLOCKED_USER", {
        email,
        ip: req.ip
      });

      return res.render("login.ejs", {
        message: "Tu cuenta está bloqueada.",
        messageType: "danger",
        title: "Iniciar Sesión"
      });
    }

    // Validar contraseña
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      const attempts = (user.intentos_fallidos || 0) + 1;

      auditEvent("LOGIN_WRONG_PASSWORD", {
        email,
        attempts,
        ip: req.ip
      });

      // Bloqueo automático
      if (attempts >= 3) {
        await blockUser(email);

        auditEvent("USER_AUTO_BLOCKED", {
          email,
          ip: req.ip
        });

        return res.render("login.ejs", {
          message: "Cuenta bloqueada por seguridad.",
          messageType: "danger",
          title: "Iniciar Sesión"
        });
      }

      // Actualizar intentos
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

    auditEvent("LOGIN_SUCCESS", {
      email,
      ip: req.ip
    }, user);

    if (role === "admin") return res.redirect("/admin");
    return res.redirect("/");

  } catch (error) {
    auditEvent("LOGIN_ERROR", {
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

  auditEvent("LOGOUT", {
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  }, req.session.user);

  req.session.destroy(err => {
    if (err) {
      auditEvent("LOGOUT_ERROR", {
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

  auditEvent("PROFILE_VIEW", {
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

    auditEvent("PROFILE_VIEW_ERROR", {
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

      auditEvent("PROFILE_UPDATE_WRONG_PASSWORD", {
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

    auditEvent("PROFILE_UPDATED", {
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

    auditEvent("PROFILE_UPDATE_ERROR", {
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

      auditEvent("PROFILE_PASSWORD_WRONG_OLD_PASSWORD", {
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

      auditEvent("PROFILE_PASSWORD_MISMATCH", {
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

    auditEvent("PROFILE_PASSWORD_UPDATED", {
      ip: req.ip
    }, req.session.user);

    res.render("perfil.ejs", {
      user: { ...user, password: hashedPassword },
      title: "Mi Perfil",
      message: "Contraseña actualizada",
      messageType: "success"
    });

  } catch (error) {

    auditEvent("PROFILE_PASSWORD_UPDATE_ERROR", {
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

      auditEvent("PROFILE_DELETE_WRONG_PASSWORD", {
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

    auditEvent("PROFILE_DELETED", {
      ip: req.ip
    }, req.session.user);

    req.session.destroy();
    res.redirect("/register");

  } catch (error) {

    auditEvent("PROFILE_DELETE_ERROR", {
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

    auditEvent("ADMIN_PANEL_VIEW", {
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

    auditEvent("ADMIN_PANEL_VIEW_ERROR", {
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

    auditEvent("ADMIN_DELETE_USER", {
      targetEmail: email,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");

  } catch (error) {

    auditEvent("ADMIN_DELETE_USER_ERROR", {
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

    auditEvent("ADMIN_ADD_PRODUCT", {
      product: nombre,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");

  } catch (error) {

    auditEvent("ADMIN_ADD_PRODUCT_ERROR", {
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

    auditEvent("ADMIN_EDIT_PRODUCT", {
      productId: id,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");

  } catch (error) {

    auditEvent("ADMIN_EDIT_PRODUCT_ERROR", {
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

    auditEvent("ADMIN_DELETE_PRODUCT", {
      productId: id,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");

  } catch (error) {

    auditEvent("ADMIN_DELETE_PRODUCT_ERROR", {
      error: error.message,
      ip: req.ip
    }, req.session.user);

    res.redirect("/admin");
  }
});

export default router;
