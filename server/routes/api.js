const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { requiereLogin, verificarCsrf } = require('../middleware/auth');

const router = express.Router();
router.use(requiereLogin);

const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

// ---- Control de acceso a datos de alumnos ----
async function alumnosDelUsuario(u) {
  if (u.rol === 'alumno') {
    const [r] = await db.query(`SELECT a.id FROM alumnos a WHERE a.usuario_id = ?`, [u.id]);
    return r.map(x => x.id);
  }
  if (u.rol === 'tutor') {
    const [r] = await db.query(
      `SELECT rf.alumno_id AS id FROM relaciones_familiares rf JOIN tutores t ON t.id = rf.tutor_id WHERE t.usuario_id = ?`, [u.id]);
    return r.map(x => x.id);
  }
  const [r] = await db.query(`SELECT id FROM alumnos`);
  return r.map(x => x.id);
}

// Resuelve el alumno solicitado y verifica que el usuario esté autorizado
async function resolverAlumno(req, res, next) {
  try {
    const permitidos = await alumnosDelUsuario(req.session.usuario);
    let id = req.query.alumno ? Number(req.query.alumno) : permitidos[0];
    if (!id || !permitidos.includes(id)) {
      return res.status(403).json({ error: 'No tenés acceso a ese alumno' });
    }
    req.alumnoId = id;
    next();
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }); }
}

router.get('/alumnos', async (req, res) => {
  const ids = await alumnosDelUsuario(req.session.usuario);
  if (!ids.length) return res.json([]);
  const [rows] = await db.query(
    `SELECT a.id, u.nombre, u.apellido, a.anio_cursada, a.division, a.anio_ingreso, a.fecha_nacimiento
     FROM alumnos a JOIN usuarios u ON u.id = a.usuario_id WHERE a.id IN (?) ORDER BY u.apellido`, [ids]);
  res.json(rows);
});

router.get('/perfil-alumno', resolverAlumno, async (req, res) => {
  const [r] = await db.query(
    `SELECT a.id, u.nombre, u.apellido, a.anio_cursada, a.division, a.anio_ingreso,
            TIMESTAMPDIFF(YEAR, a.fecha_nacimiento, CURDATE()) AS edad
     FROM alumnos a JOIN usuarios u ON u.id = a.usuario_id WHERE a.id = ?`, [req.alumnoId]);
  res.json(r[0]);
});

router.get('/materias', resolverAlumno, async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.id, m.nombre, m.descripcion, m.color, d.nombre AS docente,
       (SELECT ROUND(100 * SUM(s.estado <> 'ausente' OR s.justificada = 1) / NULLIF(COUNT(*),0))
          FROM asistencias s WHERE s.alumno_id = i.alumno_id AND s.materia_id = m.id) AS asistencia_pct
     FROM inscripciones i JOIN materias m ON m.id = i.materia_id
     LEFT JOIN docentes d ON d.id = m.docente_id WHERE i.alumno_id = ? ORDER BY m.nombre`, [req.alumnoId]);
  res.json(rows);
});

router.get('/notas', resolverAlumno, async (req, res) => {
  const [periodos] = await db.query(`SELECT id, nombre, orden FROM periodos WHERE ciclo = YEAR(CURDATE()) ORDER BY orden`);
  const [mats] = await db.query(
    `SELECT m.id, m.nombre FROM inscripciones i JOIN materias m ON m.id = i.materia_id WHERE i.alumno_id = ? ORDER BY m.nombre`, [req.alumnoId]);
  const [notas] = await db.query(`SELECT materia_id, periodo_id, valor FROM notas WHERE alumno_id = ?`, [req.alumnoId]);
  const filas = mats.map(m => {
    const porPeriodo = {};
    notas.filter(n => n.materia_id === m.id).forEach(n => { porPeriodo[n.periodo_id] = Number(n.valor); });
    const vals = Object.values(porPeriodo);
    const promedio = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    return { materia: m.nombre, notas: porPeriodo, promedio, estado: promedio === null ? 'sin_datos' : promedio >= 6 ? 'aprobada' : 'desaprobada' };
  });
  const proms = filas.filter(f => f.promedio !== null).map(f => f.promedio);
  const general = proms.length ? Math.round((proms.reduce((a, b) => a + b, 0) / proms.length) * 100) / 100 : null;
  res.json({ periodos, filas, promedioGeneral: general });
});

router.get('/asistencias', resolverAlumno, async (req, res) => {
  const [hist] = await db.query(
    `SELECT s.id, s.fecha, s.estado, s.justificada, s.motivo, m.nombre AS materia
     FROM asistencias s LEFT JOIN materias m ON m.id = s.materia_id
     WHERE s.alumno_id = ? AND s.estado <> 'presente' ORDER BY s.fecha DESC LIMIT 200`, [req.alumnoId]);
  const [[res1]] = await db.query(
    `SELECT COUNT(*) AS total, SUM(estado='ausente') AS faltas, SUM(estado='tardanza') AS tardanzas,
            SUM(estado='ausente' AND justificada=1) AS justificadas FROM asistencias WHERE alumno_id = ?`, [req.alumnoId]);
  res.json({ resumen: res1, historial: hist });
});

router.get('/horarios', resolverAlumno, async (req, res) => {
  const [[al]] = await db.query(`SELECT anio_cursada FROM alumnos WHERE id = ?`, [req.alumnoId]);
  const [rows] = await db.query(
    `SELECT h.dia_semana, h.hora_inicio, h.hora_fin, h.aula, m.nombre AS materia, m.color, d.nombre AS docente
     FROM horarios h JOIN materias m ON m.id = h.materia_id LEFT JOIN docentes d ON d.id = COALESCE(h.docente_id, m.docente_id)
     WHERE h.anio_cursada = ? ORDER BY h.dia_semana, h.hora_inicio`, [al.anio_cursada]);
  res.json(rows);
});

router.get('/pagos', resolverAlumno, async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, concepto, monto, vencimiento, fecha_pago, estado,
            (estado = 'pendiente' AND vencimiento < CURDATE()) AS vencido
     FROM pagos WHERE alumno_id = ? ORDER BY vencimiento DESC`, [req.alumnoId]);
  const deuda = rows.filter(p => p.estado === 'pendiente').reduce((a, p) => a + Number(p.monto), 0);
  res.json({ pagos: rows, deudaTotal: deuda });
});

router.get('/comunicados', async (req, res) => {
  const [rows] = await db.query(`SELECT id, titulo, cuerpo, importante, publicado_en FROM comunicados ORDER BY publicado_en DESC LIMIT 50`);
  res.json(rows);
});

router.get('/calendario', async (req, res) => {
  const [rows] = await db.query(`SELECT id, titulo, fecha, tipo FROM eventos_calendario ORDER BY fecha`);
  res.json(rows);
});

router.get('/dashboard', resolverAlumno, async (req, res) => {
  const [[pend]] = await db.query(`SELECT COUNT(*) AS n FROM pagos WHERE alumno_id = ? AND estado = 'pendiente'`, [req.alumnoId]);
  const [[faltas]] = await db.query(`SELECT COUNT(*) AS n FROM asistencias WHERE alumno_id = ? AND estado = 'ausente' AND justificada = 0`, [req.alumnoId]);
  const [coms] = await db.query(`SELECT id, titulo, publicado_en FROM comunicados WHERE importante = 1 ORDER BY publicado_en DESC LIMIT 3`);
  const [[nt]] = await db.query(`SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = ? AND leida = 0`, [req.session.usuario.id]);
  res.json({ pagosPendientes: pend.n, faltasInjustificadas: faltas.n, comunicadosImportantes: coms, notificacionesSinLeer: nt.n });
});

// ---- Notificaciones (solo las propias) ----
router.get('/notificaciones', async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, mensaje, leida, creada_en FROM notificaciones WHERE usuario_id = ? ORDER BY creada_en DESC LIMIT 50`, [req.session.usuario.id]);
  res.json(rows);
});
router.post('/notificaciones/:id/leer', verificarCsrf, async (req, res) => {
  await db.query(`UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?`, [Number(req.params.id), req.session.usuario.id]);
  res.json({ ok: true });
});
router.post('/notificaciones/leer-todas', verificarCsrf, async (req, res) => {
  await db.query(`UPDATE notificaciones SET leida = 1 WHERE usuario_id = ?`, [req.session.usuario.id]);
  res.json({ ok: true });
});

// ---- Perfil y preferencias ----
router.put('/perfil', verificarCsrf, async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const apellido = String(req.body.apellido || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const telefono = String(req.body.telefono || '').trim();
  if (!nombre || nombre.length > 80 || !apellido || apellido.length > 80) return res.status(400).json({ error: 'Nombre y apellido son obligatorios' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return res.status(400).json({ error: 'Correo inválido' });
  if (telefono && !/^[0-9+\-\s()]{6,30}$/.test(telefono)) return res.status(400).json({ error: 'Teléfono inválido' });
  try {
    await db.query(`UPDATE usuarios SET nombre=?, apellido=?, email=?, telefono=? WHERE id=?`,
      [nombre, apellido, email, telefono || null, req.session.usuario.id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese correo ya está en uso' });
    console.error(e); res.status(500).json({ error: 'Error interno' });
  }
});

const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype))
});
function extensionPorFirma(buf) {
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
router.post('/perfil/foto', upload.single('foto'), verificarCsrf, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Imagen inválida (PNG, JPG o WEBP, máx. 2 MB)' });
  const ext = extensionPorFirma(req.file.buffer);
  if (!ext) return res.status(400).json({ error: 'El archivo no es una imagen válida' });
  const nombre = `u${req.session.usuario.id}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS, nombre), req.file.buffer);
  await db.query(`UPDATE usuarios SET foto = ? WHERE id = ?`, [nombre, req.session.usuario.id]);
  res.json({ ok: true, foto: nombre });
});

router.get('/preferencias', async (req, res) => {
  const [[u]] = await db.query(`SELECT tema FROM usuarios WHERE id = ?`, [req.session.usuario.id]);
  const [[p]] = await db.query(`SELECT notif_notas, notif_horarios, notif_avisos FROM preferencias WHERE usuario_id = ?`, [req.session.usuario.id]);
  res.json({ tema: u.tema, notif_notas: p ? !!p.notif_notas : true, notif_horarios: p ? !!p.notif_horarios : true, notif_avisos: p ? !!p.notif_avisos : true });
});
router.put('/preferencias', verificarCsrf, async (req, res) => {
  const { tema, notif_notas, notif_horarios, notif_avisos } = req.body;
  if (tema !== undefined) {
    if (!['light', 'dark'].includes(tema)) return res.status(400).json({ error: 'Tema inválido' });
    await db.query(`UPDATE usuarios SET tema = ? WHERE id = ?`, [tema, req.session.usuario.id]);
  }
  if ([notif_notas, notif_horarios, notif_avisos].some(v => v !== undefined)) {
    await db.query(
      `INSERT INTO preferencias (usuario_id, notif_notas, notif_horarios, notif_avisos) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE notif_notas=VALUES(notif_notas), notif_horarios=VALUES(notif_horarios), notif_avisos=VALUES(notif_avisos)`,
      [req.session.usuario.id, notif_notas ? 1 : 0, notif_horarios ? 1 : 0, notif_avisos ? 1 : 0]);
  }
  res.json({ ok: true });
});

// Foto: la puede ver su dueño, un admin, o quien esté relacionado (alumno <-> tutor)
router.get('/foto/:archivo', async (req, res) => {
  const archivo = path.basename(req.params.archivo);
  const [[dueno]] = await db.query(`SELECT id FROM usuarios WHERE foto = ?`, [archivo]);
  if (!dueno) return res.status(404).end();
  const yo = req.session.usuario;
  let permitido = yo.id === dueno.id || yo.rol === 'admin';
  if (!permitido) {
    const [r] = await db.query(
      `SELECT 1 FROM relaciones_familiares rf
         JOIN tutores t ON t.id = rf.tutor_id JOIN alumnos a ON a.id = rf.alumno_id
       WHERE (t.usuario_id = ? AND a.usuario_id = ?) OR (t.usuario_id = ? AND a.usuario_id = ?) LIMIT 1`,
      [yo.id, dueno.id, dueno.id, yo.id]);
    permitido = r.length > 0;
  }
  if (!permitido) return res.status(403).end();
  res.sendFile(path.join(UPLOADS, archivo));
});

module.exports = router;
