const bcrypt = require('bcrypt');
const db = require('./server/db');
(async () => {
  const hash = await bcrypt.hash(process.env.NUEVA, 12);
  const [r] = await db.query(
    'UPDATE usuarios SET password_hash=?, intentos_fallidos=0, bloqueado_hasta=NULL, activo=1, debe_cambiar_password=0 WHERE id=1', [hash]);
  console.log('filas actualizadas:', r.affectedRows);
  const [[u]] = await db.query('SELECT email, password_hash FROM usuarios WHERE id=1');
  console.log('correo para entrar:', u.email);
  console.log('clave verificada:', await bcrypt.compare(process.env.NUEVA, u.password_hash));
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
