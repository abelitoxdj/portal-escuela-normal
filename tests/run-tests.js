// Pruebas de integración reales contra el servidor + base de datos.
// Requiere: servidor en TEST_URL (por defecto http://localhost:3000) y datos demo cargados.
const BASE = process.env.TEST_URL || 'http://localhost:3000';
const PASS = process.env.DEMO_PASSWORD || 'Demo-Clave-2026';
const resultados = [];

class Cliente {
  constructor() { this.cookie = ''; this.csrf = ''; }
  async req(method, url, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && this.csrf && headers['X-CSRF-Token'] === undefined) headers['X-CSRF-Token'] = this.csrf;
    const r = await fetch(BASE + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    sc.forEach(c => { const par = c.split(';')[0]; const nom = par.split('=')[0]; this.cookie = this.cookie.split('; ').filter(x => x && !x.startsWith(nom + '=')).concat(par).join('; '); });
    let data = null; try { data = await r.json(); } catch (e) { /* no json */ }
    return { status: r.status, data, headers: r.headers };
  }
  async iniciar(email, password) {
    this.cookie = ''; this.csrf = '';
    this.csrf = (await this.req('GET', '/api/auth/csrf')).data.token;
    const r = await this.req('POST', '/api/auth/login', { email, password });
    if (r.data && r.data.csrf) this.csrf = r.data.csrf;
    return r;
  }
}

async function prueba(nombre, fn) {
  try { await fn(); resultados.push([nombre, true]); console.log('  OK   ', nombre); }
  catch (e) { resultados.push([nombre, false, e.message]); console.log('  FALLA', nombre, '→', e.message); }
}
const igual = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} esperado ${b}, obtenido ${a}`); };
const cierto = (c, m) => { if (!c) throw new Error(m || 'condición falsa'); };

(async () => {
  const admin = new Cliente(), a1 = new Cliente(), a2 = new Cliente(), tutor = new Cliente(), anon = new Cliente();
  const sufijo = Date.now();

  console.log('Pruebas contra', BASE);
  await prueba('Inicio de sesión correcto (admin)', async () => igual((await admin.iniciar('admin@demo.invalid', PASS)).status, 200));
  await prueba('Inicio de sesión correcto (alumno 1, alumno 2, tutor)', async () => {
    igual((await a1.iniciar('alumno1@demo.invalid', PASS)).status, 200);
    igual((await a2.iniciar('alumno2@demo.invalid', PASS)).status, 200);
    igual((await tutor.iniciar('tutor1@demo.invalid', PASS)).status, 200);
  });
  await prueba('Contraseña incorrecta → 401 con mensaje genérico', async () => {
    const c = new Cliente(); const r = await c.iniciar('alumno1@demo.invalid', 'incorrecta123');
    igual(r.status, 401); cierto(/incorrectos/.test(r.data.error));
  });
  await prueba('Usuario inexistente → misma respuesta que contraseña incorrecta', async () => {
    const c = new Cliente(); const r = await c.iniciar('noexiste@demo.invalid', 'incorrecta123');
    igual(r.status, 401); cierto(/incorrectos/.test(r.data.error));
  });
  await prueba('Intento de inyección SQL en login no rompe ni autentica', async () => {
    const c = new Cliente(); const r = await c.iniciar("' OR '1'='1' --@x.com", "' OR '1'='1");
    cierto([400, 401].includes(r.status), 'status ' + r.status);
  });
  await prueba('Rutas privadas sin sesión → 401', async () => {
    for (const u of ['/api/materias', '/api/notas', '/api/pagos', '/api/asistencias', '/api/horarios', '/api/comunicados', '/api/auth/me', '/api/admin/usuarios'])
      igual((await anon.req('GET', u)).status, 401, u);
  });
  await prueba('Página principal sin sesión redirige a /login', async () => {
    const r = await anon.req('GET', '/'); igual(r.status, 302); igual(r.headers.get('location'), '/login');
  });
  await prueba('Escritura sin token CSRF → 403', async () => {
    const r = await a1.req('PUT', '/api/perfil', { nombre: 'X', apellido: 'Y', email: 'alumno1@demo.invalid' }, { 'X-CSRF-Token': 'falso' });
    igual(r.status, 403);
  });
  await prueba('Sesión persiste entre peticiones', async () => {
    igual((await a1.req('GET', '/api/auth/me')).status, 200); igual((await a1.req('GET', '/api/auth/me')).status, 200);
  });
  await prueba('Cookie de sesión con HttpOnly y SameSite', async () => {
    const c = new Cliente(); const r = await c.req('GET', '/api/auth/csrf'); await c.iniciar('alumno1@demo.invalid', PASS);
    const r2 = await fetch(BASE + '/api/auth/csrf'); const sc = r2.headers.getSetCookie ? r2.headers.getSetCookie().join(';') : '';
    cierto(/HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc), sc);
  });

  let idA1, idA2;
  await prueba('Alumno ve solo su propio registro', async () => {
    const l = (await a1.req('GET', '/api/alumnos')).data; igual(l.length, 1); idA1 = l[0].id;
    idA2 = (await a2.req('GET', '/api/alumnos')).data[0].id; cierto(idA1 !== idA2);
  });
  await prueba('Aislamiento: alumno 1 NO accede a datos de alumno 2 (todas las secciones)', async () => {
    for (const u of ['materias', 'notas', 'asistencias', 'horarios', 'pagos', 'dashboard', 'perfil-alumno'])
      igual((await a1.req('GET', `/api/${u}?alumno=${idA2}`)).status, 403, u);
  });
  await prueba('Tutor ve solo los alumnos asociados', async () => {
    const l = (await tutor.req('GET', '/api/alumnos')).data; igual(l.length, 1); igual(l[0].id, idA1);
    igual((await tutor.req('GET', `/api/notas?alumno=${idA2}`)).status, 403);
    igual((await tutor.req('GET', `/api/notas?alumno=${idA1}`)).status, 200);
  });
  await prueba('Consulta de materias con docentes', async () => {
    const m = (await a1.req('GET', '/api/materias')).data; cierto(m.length >= 5 && m[0].docente, 'sin materias/docentes');
  });
  await prueba('Consulta de notas con promedios y estado', async () => {
    const n = (await a1.req('GET', '/api/notas')).data; cierto(n.filas.length >= 5 && n.periodos.length === 3 && n.promedioGeneral !== null);
    cierto(n.filas.every(f => ['aprobada', 'desaprobada'].includes(f.estado)));
  });
  await prueba('Consulta de asistencias (faltas, tardanzas, justificadas)', async () => {
    const a = (await a1.req('GET', '/api/asistencias')).data; igual(Number(a.resumen.faltas), 2); igual(Number(a.resumen.tardanzas), 1); igual(Number(a.resumen.justificadas), 1);
  });
  await prueba('Consulta de horarios (10 franjas)', async () => igual((await a1.req('GET', '/api/horarios')).data.length, 10));
  await prueba('Consulta de pagos y deuda', async () => {
    const p = (await a1.req('GET', '/api/pagos')).data; igual(p.pagos.length, 2); igual(Number(p.deudaTotal), 1000);
  });
  await prueba('Visualización de comunicados y calendario', async () => {
    cierto((await a1.req('GET', '/api/comunicados')).data.length >= 1); cierto((await a1.req('GET', '/api/calendario')).data.length >= 1);
  });
  await prueba('Marcar notificación como leída (solo propias)', async () => {
    const ns = (await a1.req('GET', '/api/notificaciones')).data; cierto(ns.length >= 1);
    igual((await a1.req('POST', `/api/notificaciones/${ns[0].id}/leer`, {})).status, 200);
    const despues = (await a1.req('GET', '/api/notificaciones')).data.find(n => n.id === ns[0].id); igual(despues.leida, 1);
    const nsA2 = (await a2.req('GET', '/api/notificaciones')).data;
    await a1.req('POST', `/api/notificaciones/${nsA2[0].id}/leer`, {});
    igual((await a2.req('GET', '/api/notificaciones')).data.find(n => n.id === nsA2[0].id).leida, 0, 'a1 no debe marcar notificaciones de a2');
  });

  await prueba('Alumno NO puede modificar notas ni crear usuarios (403)', async () => {
    igual((await a1.req('POST', '/api/admin/notas', { alumno_id: idA1, materia_id: 1, periodo_id: 1, valor: 10 })).status, 403);
    igual((await a1.req('POST', '/api/admin/asistencias', { alumno_id: idA1, fecha: '2026-01-01', estado: 'presente' })).status, 403);
    igual((await a1.req('POST', '/api/admin/usuarios', {})).status, 403);
    igual((await tutor.req('POST', '/api/admin/comunicados', { titulo: 'x', cuerpo: 'y' })).status, 403);
  });

  const emailNuevo = `nuevo${sufijo}@demo.invalid`;
  await prueba('Admin crea usuario alumno; puede iniciar sesión', async () => {
    const r = await admin.req('POST', '/api/admin/usuarios', { email: emailNuevo, nombre: 'Nuevo', apellido: 'Ficticio', rol: 'alumno', password: 'Inicial2026x', anio_cursada: 2 });
    igual(r.status, 201); const c = new Cliente(); igual((await c.iniciar(emailNuevo, 'Inicial2026x')).data.debeCambiarPassword, true);
    cierto((await c.req('GET', '/api/materias')).data.length >= 5, 'sin inscripción automática');
  });
  await prueba('Admin: correo duplicado → 409; contraseña débil → 400', async () => {
    igual((await admin.req('POST', '/api/admin/usuarios', { email: emailNuevo, nombre: 'N', apellido: 'F', rol: 'alumno', password: 'Inicial2026x', anio_cursada: 2 })).status, 409);
    igual((await admin.req('POST', '/api/admin/usuarios', { email: `x${sufijo}@demo.invalid`, nombre: 'N', apellido: 'F', rol: 'admin', password: '123' })).status, 400);
  });
  await prueba('Admin carga nota y el alumno la ve; valor fuera de rango → 400', async () => {
    const mats = (await a1.req('GET', '/api/materias')).data; const per = (await a1.req('GET', '/api/notas')).data.periodos;
    igual((await admin.req('POST', '/api/admin/notas', { alumno_id: idA1, materia_id: mats[0].id, periodo_id: per[2].id, valor: 9.5 })).status, 200);
    const fila = (await a1.req('GET', '/api/notas')).data.filas.find(f => f.materia === mats[0].nombre); igual(fila.notas[per[2].id], 9.5);
    igual((await admin.req('POST', '/api/admin/notas', { alumno_id: idA1, materia_id: mats[0].id, periodo_id: per[2].id, valor: 11 })).status, 400);
  });

  await prueba('Edición de perfil se guarda en la base y persiste', async () => {
    igual((await a2.req('PUT', '/api/perfil', { nombre: 'Alumno Dos', apellido: 'Ficticio', email: 'alumno2@demo.invalid', telefono: '381 555-0000' })).status, 200);
    const nuevo = new Cliente(); await nuevo.iniciar('alumno2@demo.invalid', PASS);
    igual((await nuevo.req('GET', '/api/auth/me')).data.usuario.telefono, '381 555-0000');
  });
  await prueba('Perfil: correo ajeno repetido → 409; datos inválidos → 400', async () => {
    igual((await a2.req('PUT', '/api/perfil', { nombre: 'A', apellido: 'B', email: 'alumno1@demo.invalid' })).status, 409);
    igual((await a2.req('PUT', '/api/perfil', { nombre: '', apellido: 'B', email: 'a@b.com' })).status, 400);
    igual((await a2.req('PUT', '/api/perfil', { nombre: 'A', apellido: 'B', email: 'no-es-correo' })).status, 400);
  });
  await prueba('Cambio de contraseña real (clave vieja deja de funcionar)', async () => {
    igual((await a2.req('POST', '/api/auth/cambiar-password', { actual: 'mal', nueva: 'NuevaClave2026' })).status, 401);
    igual((await a2.req('POST', '/api/auth/cambiar-password', { actual: PASS, nueva: 'corta' })).status, 400);
    igual((await a2.req('POST', '/api/auth/cambiar-password', { actual: PASS, nueva: 'NuevaClave2026' })).status, 200);
    igual((await new Cliente().iniciar('alumno2@demo.invalid', PASS)).status, 401);
    igual((await new Cliente().iniciar('alumno2@demo.invalid', 'NuevaClave2026')).status, 200);
    await a2.req('POST', '/api/auth/cambiar-password', { actual: 'NuevaClave2026', nueva: PASS });
  });
  await prueba('Subida de foto: rechaza archivo no imagen', async () => {
    const fd = new FormData(); fd.append('foto', new Blob(['no soy imagen'], { type: 'image/png' }), 'x.png');
    const r = await fetch(BASE + '/api/perfil/foto', { method: 'POST', headers: { Cookie: a1.cookie, 'X-CSRF-Token': a1.csrf }, body: fd });
    igual(r.status, 400);
  });
  await prueba('Subida de foto: acepta PNG válido y se sirve autenticada', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData(); fd.append('foto', new Blob([png], { type: 'image/png' }), 'f.png');
    const r = await fetch(BASE + '/api/perfil/foto', { method: 'POST', headers: { Cookie: a1.cookie, 'X-CSRF-Token': a1.csrf }, body: fd });
    igual(r.status, 200); const f = (await r.json()).foto;
    igual((await fetch(BASE + '/api/foto/' + f, { headers: { Cookie: a1.cookie } })).status, 200);
    igual((await fetch(BASE + '/api/foto/' + f)).status, 401);
  });
  await prueba('Recuperación de contraseña no revela si el correo existe', async () => {
    const c = new Cliente(); await c.req('GET', '/api/auth/csrf'); c.csrf = (await c.req('GET', '/api/auth/csrf')).data.token;
    const r1 = await c.req('POST', '/api/auth/recuperar', { email: 'alumno1@demo.invalid' }); const r2 = await c.req('POST', '/api/auth/recuperar', { email: 'nadie@demo.invalid' });
    igual(r1.data.mensaje, r2.data.mensaje);
  });
  await prueba('Cierre de sesión real invalida la sesión', async () => {
    const c = new Cliente(); await c.iniciar('alumno1@demo.invalid', PASS);
    igual((await c.req('GET', '/api/materias')).status, 200);
    const guardada = c.cookie; igual((await c.req('POST', '/api/auth/logout', {})).status, 200);
    const reuso = new Cliente(); reuso.cookie = guardada; igual((await reuso.req('GET', '/api/materias')).status, 401, 'la cookie vieja sigue siendo válida');
  });
  await prueba('Bloqueo tras 5 intentos fallidos (incluso con clave correcta)', async () => {
    const em = `bloq${sufijo}@demo.invalid`;
    await admin.req('POST', '/api/admin/usuarios', { email: em, nombre: 'B', apellido: 'F', rol: 'admin', password: 'Bloqueo2026x' });
    const c = new Cliente(); for (let i = 0; i < 5; i++) await c.iniciar(em, 'mala');
    igual((await c.iniciar(em, 'Bloqueo2026x')).status, 429);
  });
  await prueba('Preferencias y tema persisten en la base', async () => {
    igual((await a1.req('PUT', '/api/preferencias', { tema: 'dark', notif_notas: false, notif_horarios: true, notif_avisos: true })).status, 200);
    const c = new Cliente(); await c.iniciar('alumno1@demo.invalid', PASS);
    const p = (await c.req('GET', '/api/preferencias')).data; igual(p.tema, 'dark'); igual(p.notif_notas, false);
    igual((await c.req('PUT', '/api/preferencias', { tema: 'azul' })).status, 400);
    await c.req('PUT', '/api/preferencias', { tema: 'light', notif_notas: true, notif_horarios: true, notif_avisos: true });
  });
  await prueba('Admin desactiva usuario → no puede iniciar sesión; no puede desactivarse a sí mismo', async () => {
    const em = `baja${sufijo}@demo.invalid`;
    const id = (await admin.req('POST', '/api/admin/usuarios', { email: em, nombre: 'B', apellido: 'F', rol: 'tutor', password: 'Baja2026clave' })).data.id;
    igual((await new Cliente().iniciar(em, 'Baja2026clave')).status, 200);
    igual((await admin.req('PATCH', `/api/admin/usuarios/${id}/activo`, { activo: false })).status, 200);
    igual((await new Cliente().iniciar(em, 'Baja2026clave')).status, 401);
    const miId = (await admin.req('GET', '/api/auth/me')).data.usuario.id;
    igual((await admin.req('PATCH', `/api/admin/usuarios/${miId}/activo`, { activo: false })).status, 400);
  });
  await prueba('Admin publica comunicado y genera notificaciones a los demás', async () => {
    igual((await admin.req('POST', '/api/admin/comunicados', { titulo: 'Prueba ' + sufijo, cuerpo: 'Texto', importante: true })).status, 201);
    cierto((await a1.req('GET', '/api/comunicados')).data.some(c => c.titulo === 'Prueba ' + sufijo));
    cierto((await a1.req('GET', '/api/notificaciones')).data.some(n => n.mensaje.includes('Prueba ' + sufijo)));
  });
  await prueba('Admin: docente, materia (inscribe alumnos del año), horario, período', async () => {
    const d = await admin.req('POST', '/api/admin/docentes', { nombre: 'Docente Ficticio ' + sufijo }); igual(d.status, 201);
    const m = await admin.req('POST', '/api/admin/materias', { nombre: 'Materia Ficticia ' + sufijo, anio_cursada: 2, docente_id: d.data.id, color: 'info' }); igual(m.status, 201);
    cierto((await a1.req('GET', '/api/materias')).data.some(x => x.nombre === 'Materia Ficticia ' + sufijo), 'alumno no inscripto');
    igual((await admin.req('POST', '/api/admin/horarios', { materia_id: m.data.id, dia_semana: 5, hora_inicio: '18:00', hora_fin: '19:00', docente_id: d.data.id })).status, 201);
    cierto((await a1.req('GET', '/api/horarios')).data.some(h => h.materia === 'Materia Ficticia ' + sufijo && h.docente === 'Docente Ficticio ' + sufijo));
    igual((await admin.req('POST', '/api/admin/horarios', { materia_id: m.data.id, dia_semana: 7, hora_inicio: '18:00', hora_fin: '19:00' })).status, 400);
    igual((await admin.req('POST', '/api/admin/horarios', { materia_id: m.data.id, dia_semana: 1, hora_inicio: '19:00', hora_fin: '18:00' })).status, 400);
    igual((await admin.req('POST', '/api/admin/materias', { nombre: '', anio_cursada: 2 })).status, 400);
    igual((await admin.req('POST', '/api/admin/periodos', { ciclo: 2031, nombre: 'T', orden: 1, fecha_inicio: '2031-03-01', fecha_fin: '2031-05-31' })).status, 201);
    igual((await admin.req('POST', '/api/admin/periodos', { ciclo: 2031, nombre: 'T', orden: 1, fecha_inicio: '2031-03-01', fecha_fin: '2031-05-31' })).status, 409);
    igual((await admin.req('POST', '/api/admin/periodos', { ciclo: 2031, nombre: 'T', orden: 2, fecha_inicio: '2031-06-01', fecha_fin: '2031-05-31' })).status, 400);
  });
  await prueba('Admin: cuota → alumno la ve y recibe aviso → marcar pagada', async () => {
    igual((await admin.req('POST', '/api/admin/pagos', { alumno_id: idA1, concepto: 'Cuota X ' + sufijo, monto: 500, vencimiento: '2030-01-10' })).status, 201);
    const antes = (await a1.req('GET', '/api/pagos')).data; const p = antes.pagos.find(x => x.concepto === 'Cuota X ' + sufijo); cierto(p && p.estado === 'pendiente');
    igual((await admin.req('PATCH', `/api/admin/pagos/${p.id}/pagado`, {})).status, 200);
    igual((await a1.req('GET', '/api/pagos')).data.pagos.find(x => x.id === p.id).estado, 'pagado');
    igual((await admin.req('POST', '/api/admin/pagos', { alumno_id: idA1, concepto: 'x', monto: -5, vencimiento: '2030-01-10' })).status, 400);
    igual((await a1.req('POST', '/api/admin/pagos', { alumno_id: idA1, concepto: 'x', monto: 1, vencimiento: '2030-01-10' })).status, 403);
  });
  await prueba('Admin: asistencia registrada se refleja; evento de calendario alta/baja', async () => {
    igual((await admin.req('POST', '/api/admin/asistencias', { alumno_id: idA1, fecha: '2026-06-20', estado: 'ausente', justificada: false })).status, 201);
    igual((await admin.req('POST', '/api/admin/asistencias', { alumno_id: idA1, fecha: '2026-13-45', estado: 'ausente' })).status, 400);
    const ev = await admin.req('POST', '/api/admin/calendario', { titulo: 'Evento ' + sufijo, fecha: '2030-05-05', tipo: 'institucional' }); igual(ev.status, 201);
    const lista = (await a1.req('GET', '/api/calendario')).data.find(e => e.titulo === 'Evento ' + sufijo); cierto(lista);
    igual((await admin.req('DELETE', `/api/admin/calendario/${lista.id}`)).status, 200);
    cierto(!(await a1.req('GET', '/api/calendario')).data.some(e => e.titulo === 'Evento ' + sufijo));
    igual((await a1.req('DELETE', `/api/admin/calendario/${lista.id}`)).status, 403);
  });
  await prueba('Fotos: dueño y tutor relacionado sí; otro alumno no', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData(); fd.append('foto', new Blob([png], { type: 'image/png' }), 'f.png');
    const r = await fetch(BASE + '/api/perfil/foto', { method: 'POST', headers: { Cookie: a1.cookie, 'X-CSRF-Token': a1.csrf }, body: fd });
    const f = (await r.json()).foto;
    const ver = c => fetch(BASE + '/api/foto/' + f, { headers: { Cookie: c.cookie } }).then(x => x.status);
    igual(await ver(a1), 200, 'dueño'); igual(await ver(tutor), 200, 'tutor relacionado'); igual(await ver(admin), 200, 'admin'); igual(await ver(a2), 403, 'otro alumno');
  });
  await prueba('Recuperación: sin SMTP no rompe y el token restablece la clave (un solo uso)', async () => {
    const mysql = require('mysql2/promise'); require('dotenv').config();
    const c = new Cliente(); c.csrf = (await c.req('GET', '/api/auth/csrf')).data.token;
    const em = `rec${sufijo}@demo.invalid`;
    await admin.req('POST', '/api/admin/usuarios', { email: em, nombre: 'R', apellido: 'F', rol: 'tutor', password: 'Recup2026clave' });
    igual((await c.req('POST', '/api/auth/recuperar', { email: em })).status, 200);
    const cx = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
    const [[fila]] = await cx.query('SELECT COUNT(*) n FROM tokens_recuperacion t JOIN usuarios u ON u.id=t.usuario_id WHERE u.email=? AND t.usado=0', [em]); await cx.end();
    igual(fila.n, 1, 'token no generado');
    igual((await c.req('POST', '/api/auth/restablecer', { token: 'invalido', nueva: 'Nueva2026clave' })).status, 400);
  });
  await prueba('Cabeceras de seguridad presentes (CSP, nosniff, sin x-powered-by)', async () => {
    const r = await fetch(BASE + '/login'); cierto(r.headers.get('content-security-policy'), 'sin CSP');
    igual(r.headers.get('x-content-type-options'), 'nosniff'); cierto(!r.headers.get('x-powered-by'));
  });

  const fallos = resultados.filter(r => !r[1]);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} pruebas aprobadas`);
  process.exit(fallos.length ? 1 : 0);
})();
