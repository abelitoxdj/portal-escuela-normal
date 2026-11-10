require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const path = require('path');
const db = require('./db');
const { verificarCsrf } = require('./middleware/auth');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('Falta SESSION_SECRET (mínimo 32 caracteres) en .env'); process.exit(1);
}
const prod = process.env.NODE_ENV === 'production';
const app = express();
app.disable('x-powered-by');
if (prod) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"], frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '50kb' }));

const minutos = Number(process.env.SESSION_MINUTOS || 30);
const store = new MySQLStore({ clearExpired: true, checkExpirationInterval: 15 * 60 * 1000 }, db.pool || db);
app.use(session({
  name: 'portal.sid',
  secret: process.env.SESSION_SECRET,
  store, resave: false, saveUninitialized: false, rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', maxAge: minutos * 60 * 1000 }
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
// verificarCsrf antes de /api: las escrituras sin token válido se rechazan
app.use('/api', verificarCsrf, require('./routes/api'));
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

// Fotos y estáticos. La app privada solo se sirve a sesiones válidas.
app.use('/img', express.static(path.join(__dirname, '..', 'public', 'img')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login.html')));
app.use('/login-assets', express.static(path.join(__dirname, '..', 'public', 'login-assets')));
app.get(['/', '/index.html'], (req, res) => {
  if (!req.session.usuario) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) app.listen(PORT, () => console.log(`Portal en http://localhost:${PORT}`));
module.exports = app;
