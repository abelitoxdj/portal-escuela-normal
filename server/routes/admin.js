const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requiereLogin, requiereRol, verificarCsrf } = require('../middleware/auth');
const { passwordValida } = require('./auth');

const router = express.Router();
router.use(requiereLogin, requiereRol('admin'), verificarCsrf);

router.get('/usuarios', async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.id, u.email, u.nombre, u.apellido, u.activo, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id = u.rol_id ORDER BY u.apellido, u.nombre`);
  res.json(rows);
});

router.post('/usuarios', async (req, res) => {
  const { email, nombre, apellido, rol, password, anio_cursada, division, alumno_ids } = req.body;
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || !nombre || !apellido) return res.status(400).json({ error: 'Datos incompletos o correo inválido' });
  if (!['alumno', 'tutor', 'admin'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  if (!passwordValida(password)) return res.status(400).json({ error: 'Contraseña inicial inválida (8+ caracteres, letras y números)' });
  if (rol === 'alumno' && !(Number(anio_cursada) >= 1 && Number(anio_cursada) <= 6)) return res.status(400).json({ error: 'Año de cursada inválido' });
  const hash = await bcrypt.hash(password, 12);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[r]] = await conn.query(`SELECT id FROM roles WHERE nombre = ?`, [rol]);
    const [ins] = await conn.query(
      `INSERT INTO usuarios (rol_id, email, password_hash, nombre, apellido, debe_cambiar_password) VALUES (?,?,?,?,?,1)`,
      [r.id, mail, hash, String(nombre).trim(), String(apellido).trim()]);
    if (rol === 'alumno') {
      const [a] = await conn.query(`INSERT INTO alumnos (usuario_id, anio_cursada, division, anio_ingreso) VALUES (?,?,?,YEAR(CURDATE()))`,
        [ins.insertId, Number(anio_cursada), division || null]);
      // Inscribir automáticamente en las materias de su año
      await conn.query(`INSERT INTO inscripciones (alumno_id, materia_id) SELECT ?, id FROM materias WHERE anio_cursada = ?`, [a.insertId, Number(anio_cursada)]);
    } else if (rol === 'tutor') {
      const [t] = await conn.query(`INSERT INTO tutores (usuario_id) VALUES (?)`, [ins.insertId]);
      for (const aid of Array.isArray(alumno_ids) ? alumno_ids : []) {
        await conn.query(`INSERT INTO relaciones_familiares (tutor_id, alumno_id) VALUES (?,?)`, [t.insertId, Number(aid)]);
      }
    }
    await conn.commit();
    res.status(201).json({ ok: true, id: ins.insertId });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
    console.error(e); res.status(500).json({ error: 'Error interno' });
  } finally { conn.release(); }
});

router.patch('/usuarios/:id/activo', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.session.usuario.id) return res.status(400).json({ error: 'No podés desactivar tu propia cuenta' });
  await db.query(`UPDATE usuarios SET activo = ? WHERE id = ?`, [req.body.activo ? 1 : 0, id]);
  res.json({ ok: true });
});

router.post('/notas', async (req, res) => {
  const { alumno_id, materia_id, periodo_id, valor } = req.body;
  const v = Number(valor);
  if (!(v >= 0 && v <= 10)) return res.status(400).json({ error: 'La nota debe estar entre 0 y 10' });
  await db.query(
    `INSERT INTO notas (alumno_id, materia_id, periodo_id, valor) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
    [Number(alumno_id), Number(materia_id), Number(periodo_id), v]);
  const [[a]] = await db.query(`SELECT usuario_id FROM alumnos WHERE id = ?`, [Number(alumno_id)]);
  if (a) await db.query(`INSERT INTO notificaciones (usuario_id, mensaje) VALUES (?, 'Se cargó una nueva nota.')`, [a.usuario_id]);
  res.json({ ok: true });
});

router.post('/asistencias', async (req, res) => {
  const { alumno_id, materia_id, fecha, estado, justificada, motivo } = req.body;
  if (!['presente', 'ausente', 'tardanza'].includes(estado) || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) || isNaN(Date.parse(fecha))) return res.status(400).json({ error: 'Datos inválidos' });
  await db.query(`INSERT INTO asistencias (alumno_id, materia_id, fecha, estado, justificada, motivo) VALUES (?,?,?,?,?,?)`,
    [Number(alumno_id), materia_id ? Number(materia_id) : null, fecha, estado, justificada ? 1 : 0, motivo ? String(motivo).slice(0, 200) : null]);
  res.status(201).json({ ok: true });
});

router.post('/comunicados', async (req, res) => {
  const { titulo, cuerpo, importante } = req.body;
  if (!titulo || !cuerpo || String(titulo).length > 150) return res.status(400).json({ error: 'Título y cuerpo obligatorios' });
  await db.query(`INSERT INTO comunicados (titulo, cuerpo, importante, autor_id) VALUES (?,?,?,?)`,
    [String(titulo).trim(), String(cuerpo).trim(), importante ? 1 : 0, req.session.usuario.id]);
  await db.query(`INSERT INTO notificaciones (usuario_id, mensaje) SELECT id, ? FROM usuarios WHERE activo = 1 AND id <> ?`,
    [`Nuevo comunicado: ${String(titulo).slice(0, 200)}`, req.session.usuario.id]);
  res.status(201).json({ ok: true });
});

// ---------- Datos maestros ----------
const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f)) && !isNaN(Date.parse(f));
const esHora = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h));
const COLORES = ['primary', 'success', 'warning', 'danger', 'info', 'secondary'];
const err = (res, m) => res.status(400).json({ error: m });

router.get('/catalogos', async (req, res) => {
  const [materias] = await db.query(`SELECT id, nombre, anio_cursada FROM materias ORDER BY anio_cursada, nombre`);
  const [docentes] = await db.query(`SELECT id, nombre FROM docentes ORDER BY nombre`);
  const [periodos] = await db.query(`SELECT id, ciclo, nombre FROM periodos ORDER BY ciclo DESC, orden`);
  const [eventos] = await db.query(`SELECT id, titulo, fecha, tipo FROM eventos_calendario ORDER BY fecha`);
  res.json({ materias, docentes, periodos, eventos });
});

router.post('/docentes', async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre || nombre.length > 100) return err(res, 'Nombre de docente obligatorio');
  const [r] = await db.query(`INSERT INTO docentes (nombre) VALUES (?)`, [nombre]);
  res.status(201).json({ ok: true, id: r.insertId });
});

router.post('/materias', async (req, res) => {
  const { nombre, descripcion, anio_cursada, docente_id, color } = req.body;
  const anio = Number(anio_cursada);
  if (!String(nombre || '').trim() || String(nombre).length > 100) return err(res, 'Nombre de materia obligatorio');
  if (!(anio >= 1 && anio <= 6)) return err(res, 'Año de cursada inválido');
  const [r] = await db.query(
    `INSERT INTO materias (nombre, descripcion, anio_cursada, docente_id, color) VALUES (?,?,?,?,?)`,
    [String(nombre).trim(), descripcion ? String(descripcion).slice(0, 300) : null, anio, docente_id ? Number(docente_id) : null, COLORES.includes(color) ? color : 'primary']);
  // Inscribir a los alumnos existentes de ese año
  await db.query(`INSERT IGNORE INTO inscripciones (alumno_id, materia_id) SELECT id, ? FROM alumnos WHERE anio_cursada = ?`, [r.insertId, anio]);
  res.status(201).json({ ok: true, id: r.insertId });
});

router.post('/horarios', async (req, res) => {
  const { materia_id, dia_semana, hora_inicio, hora_fin, aula, docente_id } = req.body;
  const dia = Number(dia_semana);
  if (!(dia >= 1 && dia <= 5)) return err(res, 'Día inválido (1=lunes a 5=viernes)');
  if (!esHora(hora_inicio) || !esHora(hora_fin) || hora_fin <= hora_inicio) return err(res, 'Horas inválidas (HH:MM, fin posterior al inicio)');
  const [[m]] = await db.query(`SELECT anio_cursada FROM materias WHERE id = ?`, [Number(materia_id)]);
  if (!m) return err(res, 'Materia inexistente');
  await db.query(
    `INSERT INTO horarios (materia_id, anio_cursada, dia_semana, hora_inicio, hora_fin, aula, docente_id) VALUES (?,?,?,?,?,?,?)`,
    [Number(materia_id), m.anio_cursada, dia, hora_inicio, hora_fin, aula ? String(aula).slice(0, 20) : null, docente_id ? Number(docente_id) : null]);
  res.status(201).json({ ok: true });
});

router.post('/periodos', async (req, res) => {
  const { ciclo, nombre, orden, fecha_inicio, fecha_fin } = req.body;
  if (!(Number(ciclo) >= 2000) || !String(nombre || '').trim() || !(Number(orden) >= 1)) return err(res, 'Ciclo, nombre y orden obligatorios');
  if (!esFecha(fecha_inicio) || !esFecha(fecha_fin) || fecha_fin < fecha_inicio) return err(res, 'Fechas inválidas');
  try {
    await db.query(`INSERT INTO periodos (ciclo, nombre, orden, fecha_inicio, fecha_fin) VALUES (?,?,?,?,?)`,
      [Number(ciclo), String(nombre).trim().slice(0, 30), Number(orden), fecha_inicio, fecha_fin]);
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe ese período en el ciclo' });
    throw e;
  }
});

router.post('/pagos', async (req, res) => {
  const { alumno_id, concepto, monto, vencimiento } = req.body;
  if (!String(concepto || '').trim() || String(concepto).length > 100) return err(res, 'Concepto obligatorio');
  if (!(Number(monto) >= 0) || !esFecha(vencimiento)) return err(res, 'Monto o vencimiento inválido');
  const [[a]] = await db.query(`SELECT usuario_id FROM alumnos WHERE id = ?`, [Number(alumno_id)]);
  if (!a) return err(res, 'Alumno inexistente');
  await db.query(`INSERT INTO pagos (alumno_id, concepto, monto, vencimiento) VALUES (?,?,?,?)`, [Number(alumno_id), String(concepto).trim(), Number(monto), vencimiento]);
  await db.query(`INSERT INTO notificaciones (usuario_id, mensaje) VALUES (?, ?)`, [a.usuario_id, `Nueva cuota: ${String(concepto).slice(0, 100)}`]);
  res.status(201).json({ ok: true });
});

router.patch('/pagos/:id/pagado', async (req, res) => {
  const fecha = req.body.fecha_pago && esFecha(req.body.fecha_pago) ? req.body.fecha_pago : new Date().toISOString().slice(0, 10);
  const [r] = await db.query(`UPDATE pagos SET estado = 'pagado', fecha_pago = ? WHERE id = ?`, [fecha, Number(req.params.id)]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Pago inexistente' });
  res.json({ ok: true });
});

router.get('/pagos', async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.id, p.concepto, p.monto, p.vencimiento, p.estado, u.apellido, u.nombre
     FROM pagos p JOIN alumnos a ON a.id = p.alumno_id JOIN usuarios u ON u.id = a.usuario_id
     WHERE p.estado = 'pendiente' ORDER BY p.vencimiento LIMIT 200`);
  res.json(rows);
});

router.post('/calendario', async (req, res) => {
  const { titulo, fecha, tipo } = req.body;
  if (!String(titulo || '').trim() || String(titulo).length > 150 || !esFecha(fecha)) return err(res, 'Título y fecha válidos obligatorios');
  const t = ['feriado', 'examen', 'institucional', 'otro'].includes(tipo) ? tipo : 'otro';
  await db.query(`INSERT INTO eventos_calendario (titulo, fecha, tipo) VALUES (?,?,?)`, [String(titulo).trim(), fecha, t]);
  res.status(201).json({ ok: true });
});

router.delete('/calendario/:id', async (req, res) => {
  await db.query(`DELETE FROM eventos_calendario WHERE id = ?`, [Number(req.params.id)]);
  res.json({ ok: true });
});

module.exports = router;
