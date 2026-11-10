(() => {
  const $ = id => document.getElementById(id);
  let csrf = '';

  async function cargarCsrf() {
    const r = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    csrf = (await r.json()).token;
  }
  async function post(url, body) {
    const r = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(body)
    });
    let data = {};
    try { data = await r.json(); } catch (e) { /* respuesta sin cuerpo */ }
    return { ok: r.ok, status: r.status, data };
  }
  function mostrar(cual) {
    ['form-login', 'form-recuperar', 'form-restablecer'].forEach(f => $(f).classList.toggle('d-none', f !== cual));
  }
  function aviso(el, texto, ok) {
    el.textContent = texto;
    el.className = 'alert py-2 small ' + (ok ? 'alert-success' : 'alert-danger');
  }

  $('btn-ver').addEventListener('click', () => {
    const i = $('password');
    const oculto = i.type === 'password';
    i.type = oculto ? 'text' : 'password';
    $('btn-ver').firstElementChild.className = oculto ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  });

  $('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('login-error');
    err.classList.add('d-none');
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Ingresá un correo válido.'; err.classList.remove('d-none'); return; }
    if (!password) { err.textContent = 'Ingresá tu contraseña.'; err.classList.remove('d-none'); return; }
    $('btn-login').disabled = true;
    const r = await post('/api/auth/login', { email, password });
    $('btn-login').disabled = false;
    if (r.ok) { window.location.href = '/'; return; }
    err.textContent = r.data.error || 'No se pudo iniciar sesión.';
    err.classList.remove('d-none');
    $('password').value = '';
  });

  $('link-recuperar').addEventListener('click', e => { e.preventDefault(); mostrar('form-recuperar'); });
  $('rec-volver').addEventListener('click', e => { e.preventDefault(); mostrar('form-login'); });
  $('res-volver').addEventListener('click', e => { e.preventDefault(); mostrar('form-login'); });
  $('rec-tengo-token').addEventListener('click', e => { e.preventDefault(); mostrar('form-restablecer'); });

  $('form-recuperar').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await post('/api/auth/recuperar', { email: $('rec-email').value.trim() });
    aviso($('rec-msg'), r.ok ? r.data.mensaje : (r.data.error || 'Error'), r.ok);
  });
  $('form-restablecer').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await post('/api/auth/restablecer', { token: $('res-token').value.trim(), nueva: $('res-pass').value });
    aviso($('res-msg'), r.ok ? 'Contraseña actualizada. Ya podés ingresar.' : (r.data.error || 'Error'), r.ok);
    if (r.ok) setTimeout(() => mostrar('form-login'), 1500);
  });

  const tokenUrl = new URLSearchParams(window.location.search).get('token');
  if (tokenUrl) { $('res-token').value = tokenUrl; mostrar('form-restablecer'); history.replaceState(null, '', '/login'); }
  cargarCsrf();
})();
