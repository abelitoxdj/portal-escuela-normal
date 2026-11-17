// Verifica el conjunto de demostración cargado con db/datos-demostracion.sql contra un servidor vivo.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const BASE = process.env.TEST_URL || 'http://localhost:3000';
const CUENTAS = { abel: ['djabelcarrera@gmail.com', '12345678a'], ramiro: ['rami@gmail.com', '12345678b'], lucca: ['lucca14@gmail.com', '12345678c'] };
const fallas = [], visto = [];
const t = (n, c, extra) => { console.log(c ? '  OK   ' : '  FALLA', n, c ? '' : (extra !== undefined ? '→ ' + JSON.stringify(extra) : '')); if (!c) fallas.push(n); };

async function sesion([email, password]) {
  let cookie = '';
  const guardar = r => (r.headers.getSetCookie?.() || []).forEach(c => { const p = c.split(';')[0]; const n = p.split('=')[0]; cookie = cookie.split('; ').filter(x => x && !x.startsWith(n + '=')).concat(p).join('; '); });
  let r = await fetch(BASE + '/api/auth/csrf'); guardar(r); const token = (await r.json()).token;
  r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': token }, body: JSON.stringify({ email, password }) });
  guardar(r); const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, cookie, d };
}
const get = async (s, u) => { const r = await fetch(BASE + u, { headers: { Cookie: s.cookie } }); const d = await r.json().catch(() => null); visto.push(JSON.stringify(d)); return { status: r.status, d }; };

async function dom(s) {
  const errores = [];
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  const w = new JSDOM(html, { runScripts: 'outside-only', url: BASE + '/', pretendToBeVisual: true }).window;
  w.fetch = (u, o = {}) => fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), Cookie: s.cookie } });
  w.FormData = FormData; w.bootstrap = { Modal: { getOrCreateInstance: () => ({ show() {}, hide() {} }) } };
  w.addEventListener('error', e => errores.push(e.message));
  w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'));
  await new Promise(r => setTimeout(r, 2500));
  return { w, d: w.document, errores };
}

(async () => {
  const S = {};
  for (const k of Object.keys(CUENTAS)) {
    S[k] = await sesion(CUENTAS[k]);
    t(`Login ${CUENTAS[k][0]}`, S[k].ok); t(`  sin cambio de clave obligatorio (${k})`, S[k].d.debeCambiarPassword === false, S[k].d);
  }
  t('Clave incorrecta rechazada', !(await sesion([CUENTAS.ramiro[0], '12345678x'])).ok);
  t('Alumno no accede a Administración', (await get(S.ramiro, '/api/admin/usuarios')).status === 403);

  const me = (await get(S.abel, '/api/auth/me')).d.usuario; t('Admin: nombre y rol', me.nombre === 'Abel' && me.rol === 'admin', me);
  const us = (await get(S.abel, '/api/admin/usuarios')).d; t('Exactamente 3 usuarios', us.length === 3, us.length);
  const als = (await get(S.abel, '/api/alumnos')).d; t('Admin ve 2 alumnos', als.length === 2, als);

  const esperado = {
    ramiro: { nombre: 'Ramiro', prom: [8.5, 7.5, 7.5, 8.83, 7.75], general: 8.02, faltas: 4, tard: 3, just: 2, injust: 2 },
    lucca: { nombre: 'Lucca', prom: [7.83, 8.25, 7, 7.83, 8.75], general: 7.93, faltas: 3, tard: 4, just: 1, injust: 2 } };
  for (const k of ['ramiro', 'lucca']) {
    const e = esperado[k], s = S[k];
    const p = (await get(s, '/api/perfil-alumno')).d; t(`${k}: perfil (${p.nombre} ${p.apellido}, ${p.anio_cursada}° año)`, p.nombre === e.nombre && p.anio_cursada === 2);
    const ms = (await get(s, '/api/materias')).d; t(`${k}: 5 materias con docente y asistencia`, ms.length === 5 && ms.every(m => m.docente && Number(m.asistencia_pct) >= 90), ms.map(m => [m.nombre, m.asistencia_pct]));
    const n = (await get(s, '/api/notas')).d; const proms = n.filas.map(f => f.promedio).sort((a, b) => a - b);
    t(`${k}: notas — 3 períodos, 5 materias, todas aprobadas`, n.periodos.length === 3 && n.filas.length === 5 && n.filas.every(f => f.estado === 'aprobada'));
    t(`${k}: promedios esperados`, JSON.stringify(proms) === JSON.stringify([...e.prom].sort((a, b) => a - b)), proms);
    t(`${k}: promedio general ${e.general}`, n.promedioGeneral === e.general, n.promedioGeneral);
    const a = (await get(s, '/api/asistencias')).d;
    t(`${k}: asistencias (${e.faltas} faltas, ${e.tard} tardanzas, ${e.just} justificadas)`, Number(a.resumen.faltas) === e.faltas && Number(a.resumen.tardanzas) === e.tard && Number(a.resumen.justificadas) === e.just, a.resumen);
    t(`${k}: historial de asistencias con motivos`, a.historial.length === e.faltas + e.tard && a.historial.some(h => h.justificada && h.motivo), a.historial.length);
    const h = (await get(s, '/api/horarios')).d; t(`${k}: 10 horarios con docente`, h.length === 10 && h.every(x => x.docente));
    const pg = (await get(s, '/api/pagos')).d; t(`${k}: 10 cuotas, 8 pagadas, deuda 28000`, pg.pagos.length === 10 && pg.pagos.filter(x => x.estado === 'pagado').length === 8 && Number(pg.deudaTotal) === 28000, [pg.pagos.length, pg.deudaTotal]);
    t(`${k}: ninguna cuota vencida (hoy ${new Date().toISOString().slice(0, 10)}; la de noviembre vence el 15/11)`, pg.pagos.every(x => !Number(x.vencido)), pg.pagos.filter(x => Number(x.vencido)).map(x => x.concepto));
    const dsh = (await get(s, '/api/dashboard')).d; t(`${k}: resumen de inicio`, dsh.faltasInjustificadas === e.injust && dsh.pagosPendientes === 2 && dsh.comunicadosImportantes.length === 3 && dsh.notificacionesSinLeer === 2, dsh);
    t(`${k}: 6 comunicados y 24 eventos`, (await get(s, '/api/comunicados')).d.length === 6 && (await get(s, '/api/calendario')).d.length === 24);
    t(`${k}: no accede al otro alumno`, (await get(s, `/api/notas?alumno=${als.find(x => x.nombre !== e.nombre).id}`)).status === 403);
  }
  const prohibidas = /ficticio|demo\b|demo\.|prueba|ejemplo/i;
  t('Ninguna respuesta de la API contiene "ficticio", "demo", "prueba" o "ejemplo"', !visto.some(v => prohibidas.test(v)), visto.find(v => prohibidas.test(v))?.slice(0, 160));

  for (const k of ['ramiro', 'abel']) {
    const { d, errores } = await dom(S[k]);
    t(`${k}: pantalla sin errores de JavaScript`, errores.length === 0, errores);
    if (k === 'ramiro') {
      t('Pantalla: nombre, 5 materias, notas, horarios, pagos, calendario, comunicados', d.getElementById('side-nombre').textContent === 'Ramiro' && d.querySelectorAll('.materia-item').length === 5 && d.querySelectorAll('#tabla-notas tr').length === 5 && d.querySelectorAll('#tabla-horarios-contenedor tbody tr').length === 2 && d.querySelectorAll('#pagos-lista tr').length === 10 && d.querySelectorAll('#calendario-lista li').length === 24 && d.querySelectorAll('#comunicados-lista > div').length === 6);
      t('Pantalla: próxima clase calculada', /Próxima clase/.test(d.getElementById('texto-proxima-clase').textContent));
      t('Pantalla: Administración oculta', d.getElementById('nav-admin').classList.contains('d-none'));
    } else {
      t('Pantalla admin: Administración visible, 3 usuarios, 2 alumnos en selectores, historial de 26 notas',
        !d.getElementById('nav-admin').classList.contains('d-none') && d.querySelectorAll('#admin-usuarios tr').length === 3 && d.getElementById('ada-alumno').options.length === 3 && d.querySelectorAll('#admin-notas .nota-input').length === 26, d.querySelectorAll('#admin-notas .nota-input').length);
      t('Pantalla admin: "Cargar nota" ya trae materias y períodos', d.getElementById('an-materia').options.length === 5 && d.getElementById('an-periodo').options.length === 3);
    }
  }
  console.log(fallas.length ? `\n${fallas.length} FALLAS` : '\nDataset verificado: todo OK'); process.exit(fallas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
