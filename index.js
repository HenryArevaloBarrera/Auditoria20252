import express from "express";
import 'dotenv/config';
import routes from "./routes/mjs.js";
import path from 'path';
import session from "express-session";
import logoutRoute from './routes/logout.js';

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
  cookie: { maxAge: 5 * 60 * 1000 } // 5 minutos
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
app.use('/', routes);
app.use('/', logoutRoute);

// ✅ Ya no es necesario pasar `user` aquí, pero si quieres, puedes dejarlo
app.get('/', (req, res) => {
  res.render('index', { title: 'Inicio' });
});

// --------------------- Servidor --------------------- //
app.listen(app.get('PORT'), () => {
  console.log(`Servidor corriendo en el puerto ${app.get('PORT')}`);
});

export default app;
