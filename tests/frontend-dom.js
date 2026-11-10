// Ejecuta index.html + app.js reales en jsdom contra el servidor vivo y verifica el DOM resultante.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const BASE = process.env.TEST_URL || 'http://localhost:3000';
const PASS = process.env.DEMO_PASSWORD || 'Demo-Clave-2026';

async function sesion(email) {
  let cookie = '';
  const guardar = r => (r.headers.getSetCookie?.() || []).forEach(c => { const p = c.split(';')[0]; const n = p.split('=')[0]; cookie = cookie.split('; ').filter(x => x && !x.startsWith(n + '=')).concat(p).join('; '); });
  let r = await fetch(BASE + '/api/auth/csrf'); guardar(r);
  const token = (await r.json()).token;
  r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': token }, body: JSON.stringify({ email, password: PASS }) });
  guardar(r); if (!r.ok) throw new Error('login falló'); return cookie;
}

async function cargar(email) {
  const cookie = await sesion(email);
  const errores = [];
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: BASE + '/', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = (u, o = {}) => fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), Cookie: cookie } });
  w.FormData = FormData; w.bootstrap = { Modal: { getOrCreateInstance: () => ({ show() {}, hide() {} }) } };
  w.addEventListener('error', e => errores.push(e.message));
  w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'));
  // jsdom dispara DOMContentLoaded por sí mismo tras el eval; no se dispara a mano
  await new Promise(r => setTimeout(r, 2500));
  return { w, d: w.document, errores };
}

const fallas = []; const t = (n, c) => { console.log(c ? '  OK   ' : '  FALLA', n); if (!c) fallas.push(n); };
(async () => {
  let { w, d, errores } = await cargar('alumno1@demo.invalid');
  t('Sin errores de JavaScript al cargar', errores.length === 0);
  t('Sidebar muestra nombre del usuario', d.getElementById('side-nombre').textContent.includes('Alumno Uno'));
  t('Perfil renderizado desde la BD (nombre, año)', /Alumno Uno/.test(d.getElementById('perfil-datos').textContent) && /2° Año/.test(d.getElementById('perfil-datos').textContent));
  t('5 materias renderizadas con docente', d.querySelectorAll('.materia-item').length >= 5);
  t('Tabla de notas con 5 filas y estados', d.querySelectorAll('#tabla-notas tr').length >= 5 && /Aprobada|Desaprobada/.test(d.getElementById('tabla-notas').textContent));
  t('Tabla de horarios con 5 días', d.querySelectorAll('#tabla-horarios-contenedor thead th').length === 6);
  t('Asistencias: resumen e historial', /Faltas/.test(d.getElementById('asist-resumen').textContent) && d.querySelectorAll('#asist-historial tr').length >= 3);
  t('Pagos: deuda pendiente visible', /Deuda pendiente/.test(d.getElementById('pagos-resumen').textContent));
  t('Calendario y comunicados renderizados', d.querySelectorAll('#calendario-lista li').length >= 1 && /Importante/.test(d.getElementById('comunicados-lista').textContent));
  t('Próxima clase calculada (incluye otro día si hoy no hay más)', /Próxima clase/.test(d.getElementById('texto-proxima-clase').textContent));
  t('Dashboard con resumen', d.querySelectorAll('#dashboard-resumen .resumen-card').length >= 3);
  t('Alumno NO ve el menú de Administración', d.getElementById('nav-admin').classList.contains('d-none'));
  t('Alumno NO ve selector de alumnos', d.getElementById('selector-alumno').classList.contains('d-none'));

  // Buscador
  const b = d.getElementById('buscador-materias'); b.value = 'legisl'; b.dispatchEvent(new w.Event('input'));
  t('Buscador filtra materias', [...d.querySelectorAll('.materia-item')].filter(x => x.style.display !== 'none').length === 1);

  // Simulador
  d.getElementById('nota1').value = 8; d.getElementById('nota2').value = 7; d.getElementById('nota3').value = 6;
  d.getElementById('btn-calcular').click(); t('Simulador calcula promedio (7.00 aprobado)', /Aprobado.*7\.00/.test(d.getElementById('resultado-promedio').textContent));
  d.getElementById('nota3').value = 1; d.getElementById('btn-calcular').click(); t('Simulador: desaprobado (5.33)', /Desaprobado.*5\.33/.test(d.getElementById('resultado-promedio').textContent));

  // Navegación SPA
  d.querySelector('a[href="#pagos"]').click();
  const visibles = [...d.querySelectorAll('main section')].filter(s => !s.classList.contains('d-none')).map(s => s.id);
  t('Navegación SPA: solo Pagos visible tras hacer clic', visibles.length === 1 && visibles[0] === 'pagos');
  // Tema
  d.getElementById('toggle-modo-oscuro').click(); t('Tema oscuro se aplica', d.documentElement.getAttribute('data-bs-theme') === 'dark');
  await new Promise(r => setTimeout(r, 500));

  // XSS: un nombre con HTML no debe inyectar elementos en la tabla de usuarios del admin
  const ck = await sesion('admin@demo.invalid');
  const ct = await (await fetch(BASE + '/api/auth/csrf', { headers: { Cookie: ck } })).json();
  await fetch(BASE + '/api/admin/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck, 'X-CSRF-Token': ct.token },
    body: JSON.stringify({ email: `xss${Date.now()}@demo.invalid`, nombre: '<img src=x id=xss-inyectado>', apellido: 'T', rol: 'admin', password: 'Xss2026clave' }) });
  const x = await cargar('admin@demo.invalid');
  t('Admin ve el menú de Administración y el selector', !x.d.getElementById('nav-admin').classList.contains('d-none') && !x.d.getElementById('selector-alumno').classList.contains('d-none'));
  t('XSS: el HTML del nombre se muestra como texto, no se inyecta', x.d.getElementById('xss-inyectado') === null && /<img src=x/.test(x.d.getElementById('admin-usuarios').textContent));
  t('Admin: selectores de asistencia/pago/horario cargados desde la BD', x.d.getElementById('aa-alumno').options.length >= 2 && x.d.getElementById('ah-materia').options.length >= 5 && x.d.getElementById('ah-docente').options.length >= 6);
  t('Admin: calendario y cuotas pendientes listados', x.d.querySelectorAll('#admin-eventos li').length >= 1 && x.d.querySelectorAll('#admin-pagos tr').length >= 1);
  t('Admin: sin errores de JavaScript', x.errores.length === 0);
  t('Admin: tabla de usuarios cargada', x.d.querySelectorAll('#admin-usuarios tr').length >= 4);

  const tu = await cargar('tutor1@demo.invalid');
  t('Tutor: selector con 1 alumno asociado', tu.d.getElementById('selector-alumno').options.length === 1);
  t('Tutor no ve Administración', tu.d.getElementById('nav-admin').classList.contains('d-none'));

  console.log(fallas.length ? `\n${fallas.length} fallas` : '\nTodas las verificaciones de frontend OK'); process.exit(fallas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
