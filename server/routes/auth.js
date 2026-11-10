const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requiereLogin, tokenCsrf, verificarCsrf } = require('../middleware/auth');
const mailer = require('../mailer');

const router = express.Router();
const DUMMY_HASH = bcrypt.hashSync('dummy-password-no-usar', 12);
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo más tarde.' }
});

function passwordValida(p) {
  return typeof p === 'string' && p.length >= 8 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);
}

router.get('/csrf', (req, res) => res.json({ token: tokenCsrf(req) }));

router.post('/login', limitadorLogin, verificarCsrf, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password || email.length > 120) {
    return res.status(400).json({ error: 'Completá usuario y contraseña' });
  }
  try {
    const [rows] = await db.query(
      `SELECT u.*, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.email = ?`, [email]);
    const u = rows[0];
    if (u && u.bloqueado_hasta && new Date(u.bloqueado_hasta.replace(' ', 'T')) > new Date()) {
      return res.status(429).json({ error: 'Cuenta bloqueada temporalmente por intentos fallidos' });
    }
    const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
    if (!u || !u.activo || !ok) {
      if (u) {
        const n = u.intentos_fallidos + 1;
        if (n >= MAX_INTENTOS) {
          await db.query(`UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?`, [BLOQUEO_MIN, u.id]);
        } else {
          await db.query(`UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?`, [n, u.id]);
        }
      }
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    await db.query(`UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`, [u.id]);
    // Nueva sesión para evitar fijación de sesión
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Error de sesión' });
      req.session.usuario = { id: u.id, rol: u.rol };
      tokenCsrf(req);
      req.session.save(() => res.json({ ok: true, csrf: req.session.csrf, debeCambiarPassword: !!u.debe_cambiar_password }));
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.post('/logout', verificarCsrf, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('portal.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requiereLogin, async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.id, u.email, u.nombre, u.apellido, u.telefono, u.foto, u.tema, u.debe_cambiar_password, r.nombre AS rol
     FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = ?`, [req.session.usuario.id]);
  if (!rows[0]) return res.status(401).json({ error: 'No autenticado' });
  res.json({ usuario: rows[0], csrf: tokenCsrf(req) });
});

router.post('/cambiar-password', requiereLogin, verificarCsrf, async (req, res) => {
  const { actual, nueva } = req.body;
  if (!passwordValida(nueva)) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener 8 a 72 caracteres, con letras y números' });
  }
  const [rows] = await db.query(`SELECT password_hash FROM usuarios WHERE id = ?`, [req.session.usuario.id]);
  if (!rows[0] || !(await bcrypt.compare(String(actual || ''), rows[0].password_hash))) {
    return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
  }
  const hash = await bcrypt.hash(nueva, 12);
  await db.query(`UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0 WHERE id = ?`, [hash, req.session.usuario.id]);
  res.json({ ok: true });
});

// Recuperación: genera token de un solo uso. El envío por correo requiere configurar SMTP (ver docs).
router.post('/recuperar', limitadorLogin, verificarCsrf, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const respuesta = { ok: true, mensaje: 'Si el correo está registrado, recibirás instrucciones para restablecer la contraseña.' };
  try {
    const [rows] = await db.query(`SELECT id FROM usuarios WHERE email = ? AND activo = 1`, [email]);
    if (rows[0]) {
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      await db.query(`INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`, [rows[0].id, hash]);
      const base = process.env.APP_URL || 'http://localhost:3000';
      const enviado = await mailer.enviar(email, 'Recuperar contraseña - Portal Escuela Normal',
        `Para crear una nueva contraseña ingresá a:\n${base}/login?token=${token}\n\nEl enlace vence en 1 hora. Si no lo pediste, ignorá este mensaje.`)
        .catch(e => { console.error('Error SMTP:', e.message); return false; });
      if (!enviado && process.env.NODE_ENV !== 'production') console.log(`[DEV] Token de recuperación para ${email}: ${token}`);
    }
  } catch (e) { console.error(e); }
  res.json(respuesta);
});

router.post('/restablecer', limitadorLogin, verificarCsrf, async (req, res) => {
  const { token, nueva } = req.body;
  if (!passwordValida(nueva)) return res.status(400).json({ error: 'Contraseña inválida (8+ caracteres, letras y números)' });
  const hash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const [rows] = await db.query(`SELECT id, usuario_id FROM tokens_recuperacion WHERE token_hash = ? AND usado = 0 AND expira_en > NOW()`, [hash]);
  if (!rows[0]) return res.status(400).json({ error: 'Token inválido o vencido' });
  const nuevoHash = await bcrypt.hash(nueva, 12);
  await db.query(`UPDATE usuarios SET password_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`, [nuevoHash, rows[0].usuario_id]);
  await db.query(`UPDATE tokens_recuperacion SET usado = 1 WHERE id = ?`, [rows[0].id]);
  res.json({ ok: true });
});

module.exports = router;
module.exports.passwordValida = passwordValida;
