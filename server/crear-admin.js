// Uso: ADMIN_EMAIL=... ADMIN_PASSWORD=... node server/crear-admin.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./db');
const { passwordValida } = require('./routes/auth');
(async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !passwordValida(pass)) {
    console.error('Definí ADMIN_EMAIL válido y ADMIN_PASSWORD (8+ caracteres con letras y números).'); process.exit(1);
  }
  const [[r]] = await db.query("SELECT id FROM roles WHERE nombre='admin'");
  await db.query('INSERT INTO usuarios (rol_id,email,password_hash,nombre,apellido) VALUES (?,?,?,?,?)',
    [r.id, email, await bcrypt.hash(pass, 12), process.env.ADMIN_NOMBRE || 'Administrador', process.env.ADMIN_APELLIDO || 'Sistema']);
  console.log('Administrador creado:', email); process.exit(0);
})().catch(e => { console.error(e.code === 'ER_DUP_ENTRY' ? 'Ese correo ya existe' : e); process.exit(1); });
