import express from "express";
import 'dotenv/config';
import routes from "./routes/mjs.js";
import path from 'path';
import session from "express-session";
import logoutRoute from './routes/logout.js';
import adminRoutes from "./routes/admin.js"; 

const app = express();

// --------------------- Middlewares --------------------- //
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// --------------------- Configuración de sesión --------------------- //
app.use(session({
  secret: process.env.SESSION_SECRET || "mi-secreto-super-seguro",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1 * 60 * 1000 } // 1 minuto
}));

// --------------------- Evitar caché --------------------- //
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ✅ Middleware global: ahora `user` estará disponible en todas las vistas
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// --------------------- Vistas --------------------- //
app.set('views', path.resolve('./views'));
app.set('view engine', 'ejs');
app.set('PORT', process.env.PORT || 3000);

// --------------------- Rutas --------------------- //
// ORDEN CORREGIDO: adminRoutes PRIMERO
app.use('/admin', adminRoutes);   // ✅ Ahora con prefijo /admin
app.use('/', routes);             // mjs.js 
app.use('/', logoutRoute);        // logout.js

// ✅ Ruta principal
app.get('/', (req, res) => {
  res.render('index', { title: 'Inicio' });
});

// --------------------- Servidor --------------------- //
app.listen(app.get('PORT'), () => {
  console.log(`Servidor corriendo en el puerto ${app.get('PORT')}`);
});

export default app;