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

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'portal.css'), 'utf8');
const fallas = []; const t = (n, c) => { console.log(c ? '  OK   ' : '  FALLA', n); if (!c) fallas.push(n); };
(async () => {
  t('CSS: ninguna regla oculta permanentemente las secciones (seccion-oculta)', !/\.seccion-oculta\s*\{[^}]*display\s*:\s*none/.test(css));
  // Datos completos del alumno 1 cargados por el administrador (para ver el perfil completo)
  {
    const ck0 = await sesion('admin@demo.invalid'); const tk0 = (await (await fetch(BASE + '/api/auth/csrf', { headers: { Cookie: ck0 } })).json()).token;
    const hd = { 'Content-Type': 'application/json', Cookie: ck0, 'X-CSRF-Token': tk0 };
    const lista = await (await fetch(BASE + '/api/alumnos', { headers: { Cookie: ck0 } })).json();
    const a1 = lista.find(a => a.nombre.includes('Uno')); const det = await (await fetch(BASE + `/api/admin/alumnos/${a1.id}`, { headers: { Cookie: ck0 } })).json();
    await fetch(BASE + `/api/admin/alumnos/${a1.id}`, { method: 'PUT', headers: hd, body: JSON.stringify({ dni: '38123456', fecha_nacimiento: '2002-08-20', anio_cursada: 2, division: 'A', anio_ingreso: 2025, domicilio: 'Av. Siempre Viva 742', localidad: 'San Miguel de Tucumán', telefono: '381 123-4567', materias: det.inscriptas }) });
  }
  let { w, d, errores } = await cargar('alumno1@demo.invalid');
  t('Sin errores de JavaScript al cargar', errores.length === 0);
  t('Perfil muestra DNI, nacimiento, domicilio y teléfono', /DNI/.test(d.getElementById('perfil-datos').textContent) && /38123456/.test(d.getElementById('perfil-datos').textContent) && /20\/08\/2002/.test(d.getElementById('perfil-datos').textContent) && /Siempre Viva/.test(d.getElementById('perfil-datos').textContent));
  t('Cambiar contraseña: 3 botones de ojo (mostrar/ocultar)', d.querySelectorAll('#modalPassword .btn-ver-clave').length === 3);
  { const i = d.getElementById('pw-nueva'); const btn = d.querySelectorAll('#modalPassword .btn-ver-clave')[1]; btn.click(); t('Ojo: la clave pasa a texto', i.type === 'text'); btn.click(); t('Ojo: vuelve a oculta', i.type === 'password'); }
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
  t('Admin: paneles de datos del alumno, historial y gestión presentes', !!x.d.getElementById('form-admin-alumno') && x.d.getElementById('ada-alumno').options.length >= 3 && x.d.getElementById('an2-filtro').options.length >= 3);
  t('Admin: historial de notas con filas editables', x.d.querySelectorAll('#admin-notas .nota-input').length >= 10);
  t('Admin: gestión lista comunicados con Editar y Borrar', x.d.querySelectorAll('#ag-tbody .btn-ag-borrar').length >= 1 && x.d.querySelectorAll('#ag-tbody .btn-ag-editar').length >= 1);
  t('Admin: botón Nueva clave por usuario', x.d.querySelectorAll('#admin-usuarios .btn-reset').length >= 4);
  t('Admin: modal restablecer clave con ojo', x.d.querySelectorAll('#modalResetClave .btn-ver-clave').length === 1 && x.d.querySelectorAll('#form-admin-usuario .btn-ver-clave').length === 1);
  x.d.getElementById('ag-tipo').value = 'materias'; x.d.getElementById('ag-tipo').dispatchEvent(new x.w.Event('change')); await new Promise(r => setTimeout(r, 800));
  t('Admin: cambiar a Materias recarga la tabla de gestión', x.d.querySelectorAll('#ag-tbody tr').length >= 5 && /Materia/.test(x.d.getElementById('ag-thead').textContent));
  t('Admin: tabla de usuarios cargada', x.d.querySelectorAll('#admin-usuarios tr').length >= 4);

  const tu = await cargar('tutor1@demo.invalid');
  t('Tutor: selector con 1 alumno asociado', tu.d.getElementById('selector-alumno').options.length === 1);
  t('Tutor no ve Administración', tu.d.getElementById('nav-admin').classList.contains('d-none'));

  console.log(fallas.length ? `\n${fallas.length} fallas` : '\nTodas las verificaciones de frontend OK'); process.exit(fallas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
