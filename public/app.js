document.addEventListener("DOMContentLoaded", async () => {
    // ---------- Utilidades ----------
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const COLORES = ['primary', 'success', 'warning', 'danger', 'info', 'secondary'];
    const colorSeguro = c => COLORES.includes(c) ? c : 'primary';
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const fechaLocal = f => { const [y, m, d] = String(f).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
    const hhmm = t => String(t).slice(0, 5);

    let csrf = '';
    let usuario = null;
    let alumnoId = null;
    let horariosCache = [];

    async function api(url, opts = {}) {
        const headers = { ...(opts.headers || {}) };
        if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
        if (opts.method && opts.method !== 'GET') headers['X-CSRF-Token'] = csrf;
        const r = await fetch(url, {
            credentials: 'same-origin', ...opts, headers,
            body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body
        });
        if (r.status === 401 && !url.includes('/auth/cambiar-password')) { window.location.href = '/login'; throw new Error('sesión'); }
        let data = {};
        try { data = await r.json(); } catch (e) { /* sin cuerpo */ }
        if (!r.ok) { const err = new Error(data.error || 'Error'); err.status = r.status; throw err; }
        return data;
    }
    const qAlumno = () => alumnoId ? `?alumno=${alumnoId}` : '';

    // ---------- 1. Navegación tipo SPA ----------
    const enlacesMenu = document.querySelectorAll('.nav-link-custom');
    const todasLasSecciones = document.querySelectorAll('main section');
    enlacesMenu.forEach(enlace => {
        enlace.addEventListener('click', function (evento) {
            evento.preventDefault();
            enlacesMenu.forEach(link => { link.classList.remove('active'); link.classList.add('text-white-50'); });
            this.classList.add('active');
            this.classList.remove('text-white-50');
            todasLasSecciones.forEach(s => s.classList.add('d-none'));
            const destino = document.querySelector(this.getAttribute('href'));
            if (destino) destino.classList.remove('d-none');
        });
    });

    // ---------- 2. Simulador de promedio (herramienta independiente) ----------
    const btnCalcular = $('btn-calcular');
    const resultadoTexto = $('resultado-promedio');
    if (btnCalcular) {
        btnCalcular.addEventListener('click', () => {
            const n = ['nota1', 'nota2', 'nota3'].map(id => parseFloat($(id).value));
            if (n.some(isNaN)) {
                resultadoTexto.innerHTML = `<span class="badge bg-warning text-dark px-3 py-2 fs-6">⚠️ Por favor, ingresa las 3 notas</span>`;
                return;
            }
            if (n.some(v => v < 0 || v > 10)) {
                resultadoTexto.innerHTML = `<span class="badge bg-warning text-dark px-3 py-2 fs-6">⚠️ Las notas van de 0 a 10</span>`;
                return;
            }
            const promedio = (n[0] + n[1] + n[2]) / 3;
            const txt = promedio.toFixed(2);
            resultadoTexto.innerHTML = promedio >= 6
                ? `<span class="badge bg-success px-3 py-2 fs-6">¡Aprobado! Promedio: ${txt}</span>`
                : `<span class="badge bg-danger px-3 py-2 fs-6">Desaprobado. Promedio: ${txt}</span>`;
        });
    }

    // ---------- 3. Cerrar sesión (real) ----------
    async function cerrarSesion(e) {
        e.preventDefault();
        try { await api('/api/auth/logout', { method: 'POST' }); } catch (err) { /* continuar */ }
        window.location.href = '/login';
    }
    $('btn-cerrar-sesion')?.addEventListener('click', cerrarSesion);
    $('btn-cerrar-sesion-menu')?.addEventListener('click', cerrarSesion);

    // ---------- 4. Imprimir boletín ----------
    $('btn-imprimir-notas')?.addEventListener('click', () => window.print());

    // ---------- 5. Buscador de materias ----------
    $('buscador-materias')?.addEventListener('input', e => {
        const texto = e.target.value.toLowerCase();
        document.querySelectorAll('.materia-item').forEach(item => {
            const titulo = item.querySelector('.titulo-materia').textContent.toLowerCase();
            item.style.display = titulo.includes(texto) ? 'block' : 'none';
        });
    });

    // ---------- 6. Próxima clase (con siguiente día lectivo) ----------
    function calcularProximaClase() {
        const el = $('texto-proxima-clase');
        if (!el) return;
        const ahora = new Date();
        const tActual = ahora.getHours() + ahora.getMinutes() / 60;
        const num = t => { const [h, m] = hhmm(t).split(':').map(Number); return h + m / 60; };
        if (!horariosCache.length) {
            el.innerHTML = '<i class="fa-solid fa-circle-info me-2"></i> No hay horarios cargados.';
            el.className = 'alert alert-secondary border-0 shadow-sm mb-0';
            return;
        }
        for (let off = 0; off < 8; off++) {
            const dia = (ahora.getDay() + off) % 7;
            const clases = horariosCache
                .filter(c => c.dia_semana === dia && (off > 0 || num(c.hora_inicio) >= tActual))
                .sort((a, b) => num(a.hora_inicio) - num(b.hora_inicio));
            if (clases.length) {
                const c = clases[0];
                const cuando = off === 0 ? 'hoy' : off === 1 ? 'mañana' : `el ${DIAS[dia].toLowerCase()}`;
                el.innerHTML = `<i class="fa-solid fa-circle-info me-2"></i> Próxima clase (${esc(cuando)}): <strong>${esc(c.materia)}</strong> (${esc(c.docente || 's/d')}) a las <strong>${esc(hhmm(c.hora_inicio))}</strong> hs.`;
                el.className = 'alert alert-primary border-0 shadow-sm mb-0 bg-primary-subtle text-primary';
                return;
            }
        }
    }
    setInterval(calcularProximaClase, 60000);

    // ---------- 8. Tema oscuro ----------
    function aplicarTema(t) {
        document.documentElement.setAttribute('data-bs-theme', t);
        const b = $('toggle-modo-oscuro');
        if (b) b.innerHTML = t === 'dark'
            ? '<i class="fa-solid fa-sun me-2 text-primary"></i> Tema claro'
            : '<i class="fa-solid fa-moon me-2 text-primary"></i> Tema oscuro';
    }
    $('toggle-modo-oscuro')?.addEventListener('click', async e => {
        e.preventDefault();
        const nuevo = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
        aplicarTema(nuevo);
        try { await api('/api/preferencias', { method: 'PUT', body: { tema: nuevo } }); } catch (err) { /* se mantiene localmente */ }
    });

    // ---------- Renderizado de secciones ----------
    async function cargarPerfilAlumno() {
        const ul = $('perfil-datos');
        try {
            const p = await api('/api/perfil-alumno' + qAlumno());
            const fila = (k, v) => `<li class="d-flex justify-content-between align-items-center pb-2 border-bottom"><span class="text-body-secondary fw-medium">${k}</span><span class="fw-bold">${v}</span></li>`;
            ul.innerHTML = fila('Nombre Completo', esc(`${p.nombre} ${p.apellido}`)) +
                (p.edad != null ? fila('Edad', `${esc(p.edad)} años`) : '') +
                fila('Año', `<span class="badge bg-primary-subtle text-primary fw-bold px-3 py-2 rounded-pill">${esc(p.anio_cursada)}° Año${p.division ? ' ' + esc(p.division) : ''}</span>`) +
                (p.anio_ingreso ? fila('Año de Ingreso', esc(p.anio_ingreso)) : '');
        } catch (e) { ul.innerHTML = '<li class="text-body-secondary">No hay un alumno asociado a esta cuenta.</li>'; }
    }

    async function cargarMaterias() {
        const cont = $('lista-materias');
        try {
            const ms = await api('/api/materias' + qAlumno());
            cont.innerHTML = ms.length ? ms.map(m => {
                const c = colorSeguro(m.color);
                const pct = m.asistencia_pct == null ? null : Number(m.asistencia_pct);
                return `<div class="materia-item p-3 border-start border-${c} border-4 rounded-4 bg-body border shadow-sm">
                  <div class="d-flex justify-content-between align-items-start mb-2"><div>
                    <h3 class="h6 fw-bold mb-0 titulo-materia"><i class="fa-solid fa-circle text-${c} me-2 fs-6"></i>${esc(m.nombre)}</h3>
                    <small class="text-body-secondary">${esc(m.docente || 'Docente a designar')}</small></div>
                    ${pct == null ? '' : `<span class="badge bg-${c}-subtle text-${c} px-2 py-1 rounded-pill">${pct}% Asistencia</span>`}</div>
                  ${m.descripcion ? `<p class="small text-body-secondary mb-2">${esc(m.descripcion)}</p>` : ''}
                  ${pct == null ? '' : `<div class="progress rounded-pill" style="height: 6px"><div class="progress-bar bg-${c}" style="width: ${pct}%"></div></div>`}
                </div>`;
            }).join('') : '<p class="text-body-secondary mb-0">Sin materias.</p>';
        } catch (e) { cont.innerHTML = '<p class="text-body-secondary mb-0">Sin datos.</p>'; }
    }

    async function cargarNotas() {
        try {
            const d = await api('/api/notas' + qAlumno());
            $('thead-notas').innerHTML = `<tr><th class="text-start py-3">Materia</th>${d.periodos.map(p => `<th class="py-3">${esc(p.nombre)}</th>`).join('')}<th class="py-3">Promedio</th><th class="py-3">Estado</th></tr>`;
            const est = { aprobada: ['success', 'Aprobada'], desaprobada: ['danger', 'Desaprobada'], sin_datos: ['secondary', 'Sin notas'] };
            $('tabla-notas').innerHTML = d.filas.map(f => {
                const [c, t] = est[f.estado];
                return `<tr><td class="text-start fw-semibold">${esc(f.materia)}</td>${d.periodos.map(p => `<td>${f.notas[p.id] ?? '-'}</td>`).join('')}<td class="fw-bold">${f.promedio ?? '-'}</td><td><span class="badge bg-${c}-subtle text-${c} border">${t}</span></td></tr>`;
            }).join('');
            $('promedio-general').textContent = d.promedioGeneral != null ? `Promedio general: ${d.promedioGeneral}` : '';
        } catch (e) { $('tabla-notas').innerHTML = '<tr><td colspan="6" class="text-body-secondary">Sin datos.</td></tr>'; }
    }

    async function cargarAsistencias() {
        try {
            const d = await api('/api/asistencias' + qAlumno());
            const r = d.resumen;
            const tarj = (t, v, c) => `<div class="col-6 col-md-3"><div class="card resumen-card border-0 bg-${c}-subtle p-3 text-center"><div class="h4 fw-bold mb-0">${esc(v ?? 0)}</div><small>${t}</small></div></div>`;
            $('asist-resumen').innerHTML = tarj('Faltas', r.faltas, 'danger') + tarj('Tardanzas', r.tardanzas, 'warning') + tarj('Justificadas', r.justificadas, 'success') + tarj('Registros', r.total, 'primary');
            $('asist-historial').innerHTML = d.historial.length ? d.historial.map(h =>
                `<tr><td>${fechaLocal(h.fecha)}</td><td>${esc(h.materia || '-')}</td><td>${h.estado === 'ausente' ? 'Falta' : 'Tardanza'}</td><td>${h.justificada ? 'Justificada' + (h.motivo ? ': ' + esc(h.motivo) : '') : 'Sin justificar'}</td></tr>`).join('')
                : '<tr><td colspan="4" class="text-body-secondary">Sin faltas ni tardanzas registradas.</td></tr>';
        } catch (e) { /* sin datos */ }
    }

    async function cargarHorarios() {
        try {
            horariosCache = await api('/api/horarios' + qAlumno());
        } catch (e) { horariosCache = []; }
        const cont = $('tabla-horarios-contenedor');
        const franjas = [...new Set(horariosCache.map(h => hhmm(h.hora_inicio)))].sort();
        if (!franjas.length) { cont.innerHTML = '<p class="text-body-secondary mb-0">No hay horarios cargados.</p>'; calcularProximaClase(); return; }
        const fin = {}; horariosCache.forEach(h => { fin[hhmm(h.hora_inicio)] = hhmm(h.hora_fin); });
        let html = '<div class="table-responsive rounded-3 border"><table class="table table-bordered text-center align-middle small mb-0 tabla-horarios"><thead class="table-light"><tr><th>Horario</th>' +
            [1, 2, 3, 4, 5].map(d => `<th>${DIAS[d]}</th>`).join('') + '</tr></thead><tbody>';
        franjas.forEach(f => {
            html += `<tr><td class="fw-semibold">${f} - ${fin[f]}</td>`;
            [1, 2, 3, 4, 5].forEach(d => {
                const c = horariosCache.find(h => h.dia_semana === d && hhmm(h.hora_inicio) === f);
                html += c ? `<td class="bg-${colorSeguro(c.color)}-subtle"><strong>${esc(c.materia)}</strong><small class="text-body-secondary">${esc(c.docente || '')}${c.aula ? ' · Aula ' + esc(c.aula) : ''}</small></td>` : '<td>-</td>';
            });
            html += '</tr>';
        });
        cont.innerHTML = html + '</tbody></table></div>';
        calcularProximaClase();
    }

    async function cargarPagos() {
        try {
            const d = await api('/api/pagos' + qAlumno());
            const money = v => Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
            $('pagos-resumen').innerHTML = d.deudaTotal > 0
                ? `<span class="badge bg-danger-subtle text-danger px-3 py-2 fs-6">Deuda pendiente: ${money(d.deudaTotal)}</span>`
                : '<span class="badge bg-success-subtle text-success px-3 py-2 fs-6">Sin deuda pendiente</span>';
            $('pagos-lista').innerHTML = d.pagos.length ? d.pagos.map(p => {
                const e = p.estado === 'pagado' ? ['success', 'Pagado' + (p.fecha_pago ? ' el ' + fechaLocal(p.fecha_pago) : '')] : Number(p.vencido) ? ['danger', 'Vencido'] : ['warning', 'Pendiente'];
                return `<tr><td>${esc(p.concepto)}</td><td>${money(p.monto)}</td><td>${fechaLocal(p.vencimiento)}</td><td><span class="badge bg-${e[0]}-subtle text-${e[0]}">${esc(e[1])}</span></td></tr>`;
            }).join('') : '<tr><td colspan="4" class="text-body-secondary">Sin cuotas registradas.</td></tr>';
        } catch (e) { /* sin datos */ }
    }

    async function cargarCalendario() {
        try {
            const ev = await api('/api/calendario');
            const tipos = { feriado: ['danger', 'Feriado'], examen: ['warning', 'Examen'], institucional: ['primary', 'Institucional'], otro: ['secondary', 'Otro'] };
            $('calendario-lista').innerHTML = ev.length ? ev.map(x => {
                const [c, t] = tipos[x.tipo] || tipos.otro;
                return `<li class="list-group-item bg-transparent d-flex justify-content-between align-items-center"><span><strong>${fechaLocal(x.fecha)}</strong> · ${esc(x.titulo)}</span><span class="badge bg-${c}-subtle text-${c}">${t}</span></li>`;
            }).join('') : '<li class="list-group-item bg-transparent text-body-secondary">Sin eventos cargados.</li>';
        } catch (e) { /* sin datos */ }
    }

    async function cargarComunicados() {
        try {
            const cs = await api('/api/comunicados');
            $('comunicados-lista').innerHTML = cs.length ? cs.map(c =>
                `<div class="p-3 rounded-4 border ${c.importante ? 'border-danger' : ''}"><div class="d-flex justify-content-between"><strong>${esc(c.titulo)}</strong>${c.importante ? '<span class="badge bg-danger">Importante</span>' : ''}</div><div class="small text-body-secondary mb-1">${fechaLocal(c.publicado_en)}</div><div class="small" style="white-space: pre-line">${esc(c.cuerpo)}</div></div>`).join('')
                : '<p class="text-body-secondary mb-0">Sin comunicados.</p>';
        } catch (e) { /* sin datos */ }
    }

    async function cargarNotificaciones() {
        try {
            const ns = await api('/api/notificaciones');
            $('notificaciones-lista').innerHTML = ns.length ? ns.map(n =>
                `<div class="d-flex justify-content-between align-items-center p-2 rounded-3 border ${n.leida ? '' : 'bg-primary-subtle'}"><span class="small">${esc(n.mensaje)}</span>${n.leida ? '' : `<button class="btn btn-sm btn-link btn-leer" data-id="${Number(n.id)}" type="button">Marcar leída</button>`}</div>`).join('')
                : '<p class="text-body-secondary mb-0">Sin notificaciones.</p>';
        } catch (e) { /* sin datos */ }
    }
    $('notificaciones-lista')?.addEventListener('click', async e => {
        const b = e.target.closest('.btn-leer');
        if (!b) return;
        await api(`/api/notificaciones/${b.dataset.id}/leer`, { method: 'POST' });
        cargarNotificaciones(); cargarDashboard();
    });
    $('btn-leer-todas')?.addEventListener('click', async () => {
        await api('/api/notificaciones/leer-todas', { method: 'POST' });
        cargarNotificaciones(); cargarDashboard();
    });

    async function cargarDashboard() {
        try {
            const d = await api('/api/dashboard' + qAlumno());
            const tarj = (icono, texto, c) => `<div class="col-12 col-md-4"><div class="card resumen-card border-0 shadow-sm p-3 h-100"><div class="d-flex align-items-center gap-3"><i class="fa-solid ${icono} fs-3 text-${c}"></i><div class="small">${texto}</div></div></div></div>`;
            const coms = d.comunicadosImportantes.length
                ? d.comunicadosImportantes.map(c => esc(c.titulo)).join(' · ') : 'Sin comunicados importantes';
            $('dashboard-resumen').innerHTML =
                tarj('fa-calendar-xmark', `<strong>${d.faltasInjustificadas}</strong> faltas sin justificar`, 'danger') +
                tarj('fa-money-bill-wave', `<strong>${d.pagosPendientes}</strong> cuotas pendientes`, 'warning') +
                tarj('fa-bell', `<strong>${d.notificacionesSinLeer}</strong> notificaciones sin leer`, 'primary') +
                `<div class="col-12"><div class="card resumen-card border-0 shadow-sm p-3 small"><i class="fa-solid fa-bullhorn text-danger me-2"></i><strong>Comunicados importantes:</strong> ${coms}</div></div>`;
        } catch (e) { /* sin datos */ }
    }

    async function cargarTodoDelAlumno() {
        await Promise.all([cargarPerfilAlumno(), cargarMaterias(), cargarNotas(), cargarAsistencias(), cargarHorarios(), cargarPagos(), cargarDashboard()]);
    }

    // ---------- 9-12. Perfil, contraseña y foto (persisten en el servidor) ----------
    let fotoSeleccionada = null;
    const urlFoto = f => f ? `/api/foto/${encodeURIComponent(f)}` : '/img/logon.png';
    const modal = id => bootstrap.Modal.getOrCreateInstance($(id));

    function pintarUsuario() {
        $('side-nombre').textContent = usuario.nombre;
        $('side-rol').textContent = { alumno: 'Alumno', tutor: 'Padre / Tutor', admin: 'Administrador' }[usuario.rol] || '';
        $('side-foto').src = urlFoto(usuario.foto);
        $('perfil-foto-preview').src = urlFoto(usuario.foto);
        $('perfil-nombre').value = usuario.nombre;
        $('perfil-apellido').value = usuario.apellido;
        $('perfil-email').value = usuario.email;
        $('perfil-telefono').value = usuario.telefono || '';
    }

    $('input-foto-perfil')?.addEventListener('change', e => {
        const f = e.target.files[0];
        if (!f) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 2 * 1024 * 1024) {
            $('perfil-error').textContent = 'La foto debe ser PNG, JPG o WEBP de hasta 2 MB.';
            e.target.value = ''; return;
        }
        $('perfil-error').textContent = '';
        fotoSeleccionada = f;
        const lector = new FileReader();
        lector.onload = ev => { $('perfil-foto-preview').src = ev.target.result; };
        lector.readAsDataURL(f);
    });

    $('form-perfil')?.addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('perfil-error');
        err.textContent = '';
        try {
            await api('/api/perfil', { method: 'PUT', body: {
                nombre: $('perfil-nombre').value, apellido: $('perfil-apellido').value,
                email: $('perfil-email').value, telefono: $('perfil-telefono').value } });
            if (fotoSeleccionada) {
                const fd = new FormData(); fd.append('foto', fotoSeleccionada);
                await api('/api/perfil/foto', { method: 'POST', body: fd });
                fotoSeleccionada = null;
            }
            const me = await api('/api/auth/me');
            usuario = me.usuario; pintarUsuario();
            if (usuario.rol === 'alumno') cargarPerfilAlumno();
            modal('modalPerfil').hide();
        } catch (x) { err.textContent = x.message; }
    });

    $('form-password')?.addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('pw-error');
        err.textContent = '';
        if ($('pw-nueva').value !== $('pw-repetir').value) { err.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
        try {
            await api('/api/auth/cambiar-password', { method: 'POST', body: { actual: $('pw-actual').value, nueva: $('pw-nueva').value } });
            $('form-password').reset();
            modal('modalPassword').hide();
        } catch (x) { err.textContent = x.message; }
    });

    // Preferencias de notificaciones
    ['notif-notas', 'notif-horarios', 'notif-avisos'].forEach(id => {
        $(id)?.addEventListener('change', () => api('/api/preferencias', { method: 'PUT', body: {
            notif_notas: $('notif-notas').checked, notif_horarios: $('notif-horarios').checked, notif_avisos: $('notif-avisos').checked } }));
    });

    // ---------- Administración ----------
    async function cargarAdmin() {
        const [us, als] = await Promise.all([api('/api/admin/usuarios'), api('/api/alumnos')]);
        $('admin-usuarios').innerHTML = us.map(u => `<tr><td>${esc(u.nombre)} ${esc(u.apellido)}</td><td>${esc(u.email)}</td><td>${esc(u.rol)}</td><td><button class="btn btn-sm btn-outline-${u.activo ? 'danger' : 'success'} btn-activo" data-id="${Number(u.id)}" data-activo="${u.activo ? 0 : 1}" type="button">${u.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('');
        const opts = als.map(a => `<option value="${Number(a.id)}">${esc(a.apellido)}, ${esc(a.nombre)}</option>`).join('');
        $('an-alumno').innerHTML = opts; $('au-alumnos').innerHTML = opts;
        await cargarOpcionesNota();
    }
    async function cargarOpcionesNota() {
        const id = $('an-alumno').value;
        if (!id) return;
        const [ms, nt] = await Promise.all([api(`/api/materias?alumno=${id}`), api(`/api/notas?alumno=${id}`)]);
        $('an-materia').innerHTML = ms.map(m => `<option value="${Number(m.id)}">${esc(m.nombre)}</option>`).join('');
        $('an-periodo').innerHTML = nt.periodos.map(p => `<option value="${Number(p.id)}">${esc(p.nombre)}</option>`).join('');
    }
    $('an-alumno')?.addEventListener('change', cargarOpcionesNota);
    $('au-rol')?.addEventListener('change', () => {
        const r = $('au-rol').value;
        $('au-anio-box').classList.toggle('d-none', r !== 'alumno');
        $('au-alumnos-box').classList.toggle('d-none', r !== 'tutor');
    });
    const msg = (id, t, ok) => { const el = $(id); el.textContent = t; el.className = 'small ' + (ok ? 'text-success' : 'text-danger'); };
    $('admin-usuarios')?.addEventListener('click', async e => {
        const b = e.target.closest('.btn-activo');
        if (!b) return;
        try { await api(`/api/admin/usuarios/${b.dataset.id}/activo`, { method: 'PATCH', body: { activo: b.dataset.activo === '1' } }); cargarAdmin(); }
        catch (x) { alert(x.message); }
    });
    $('form-admin-usuario')?.addEventListener('submit', async e => {
        e.preventDefault();
        try {
            await api('/api/admin/usuarios', { method: 'POST', body: {
                nombre: $('au-nombre').value, apellido: $('au-apellido').value, email: $('au-email').value, rol: $('au-rol').value,
                password: $('au-pass').value, anio_cursada: $('au-anio').value,
                alumno_ids: [...$('au-alumnos').selectedOptions].map(o => Number(o.value)) } });
            msg('au-msg', 'Usuario creado (deberá cambiar su contraseña al ingresar).', true);
            $('form-admin-usuario').reset(); cargarAdmin();
        } catch (x) { msg('au-msg', x.message, false); }
    });
    $('form-admin-nota')?.addEventListener('submit', async e => {
        e.preventDefault();
        try {
            await api('/api/admin/notas', { method: 'POST', body: { alumno_id: $('an-alumno').value, materia_id: $('an-materia').value, periodo_id: $('an-periodo').value, valor: $('an-valor').value } });
            msg('an-msg', 'Nota guardada.', true); $('an-valor').value = '';
        } catch (x) { msg('an-msg', x.message, false); }
    });
    $('form-admin-comunicado')?.addEventListener('submit', async e => {
        e.preventDefault();
        try {
            await api('/api/admin/comunicados', { method: 'POST', body: { titulo: $('ac-titulo').value, cuerpo: $('ac-cuerpo').value, importante: $('ac-importante').checked } });
            msg('ac-msg', 'Comunicado publicado.', true); $('form-admin-comunicado').reset(); cargarComunicados();
        } catch (x) { msg('ac-msg', x.message, false); }
    });


    // ---------- Administración: datos maestros ----------
    async function cargarAdminDatos() {
        const [cat, als, pend] = await Promise.all([api('/api/admin/catalogos'), api('/api/alumnos'), api('/api/admin/pagos')]);
        const opAl = als.map(a => `<option value="${Number(a.id)}">${esc(a.apellido)}, ${esc(a.nombre)}</option>`).join('');
        const opMat = cat.materias.map(m => `<option value="${Number(m.id)}">${esc(m.nombre)} (${Number(m.anio_cursada)}°)</option>`).join('');
        const opDoc = '<option value="">Sin docente</option>' + cat.docentes.map(d => `<option value="${Number(d.id)}">${esc(d.nombre)}</option>`).join('');
        $('aa-alumno').innerHTML = opAl; $('ap-alumno').innerHTML = opAl;
        $('aa-materia').innerHTML = '<option value="">Sin materia</option>' + opMat; $('ah-materia').innerHTML = opMat;
        $('am-docente').innerHTML = opDoc; $('ah-docente').innerHTML = opDoc;
        $('aa-materia').required = false; $('am-docente').required = false; $('ah-docente').required = false;
        $('admin-eventos').innerHTML = cat.eventos.map(e => `<li class="list-group-item bg-transparent d-flex justify-content-between align-items-center"><span>${fechaLocal(e.fecha)} · ${esc(e.titulo)}</span><button class="btn btn-sm btn-outline-danger btn-borrar-evento" data-id="${Number(e.id)}" type="button">Borrar</button></li>`).join('') || '<li class="list-group-item bg-transparent text-body-secondary">Sin eventos.</li>';
        $('admin-pagos').innerHTML = pend.map(p => `<tr><td>${esc(p.apellido)}, ${esc(p.nombre)}</td><td>${esc(p.concepto)}</td><td>${fechaLocal(p.vencimiento)}</td><td><button class="btn btn-sm btn-outline-success btn-pagado" data-id="${Number(p.id)}" type="button">Marcar pagado</button></td></tr>`).join('') || '<tr><td class="text-body-secondary">Sin cuotas pendientes.</td></tr>';
    }
    function formAdmin(formId, url, cuerpo, msgId, despues) {
        $(formId)?.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                await api(url, { method: 'POST', body: cuerpo() });
                msg(msgId, 'Guardado.', true); $(formId).reset();
                await cargarAdminDatos(); if (despues) despues();
            } catch (x) { msg(msgId, x.message, false); }
        });
    }
    formAdmin('form-admin-asistencia', '/api/admin/asistencias', () => ({ alumno_id: $('aa-alumno').value, materia_id: $('aa-materia').value || null, fecha: $('aa-fecha').value, estado: $('aa-estado').value, justificada: $('aa-just').checked, motivo: $('aa-motivo').value }), 'aa-msg');
    formAdmin('form-admin-pago', '/api/admin/pagos', () => ({ alumno_id: $('ap-alumno').value, concepto: $('ap-concepto').value, monto: $('ap-monto').value, vencimiento: $('ap-venc').value }), 'ap-msg');
    formAdmin('form-admin-evento', '/api/admin/calendario', () => ({ titulo: $('ae-titulo').value, fecha: $('ae-fecha').value, tipo: $('ae-tipo').value }), 'ae-msg', cargarCalendario);
    formAdmin('form-admin-materia', '/api/admin/materias', () => ({ nombre: $('am-nombre').value, descripcion: $('am-desc').value, anio_cursada: $('am-anio').value, docente_id: $('am-docente').value || null, color: $('am-color').value }), 'am-msg');
    formAdmin('form-admin-docente', '/api/admin/docentes', () => ({ nombre: $('ad-nombre').value }), 'ad-msg');
    formAdmin('form-admin-horario', '/api/admin/horarios', () => ({ materia_id: $('ah-materia').value, dia_semana: $('ah-dia').value, hora_inicio: $('ah-ini').value, hora_fin: $('ah-fin').value, aula: $('ah-aula').value, docente_id: $('ah-docente').value || null }), 'ah-msg');
    formAdmin('form-admin-periodo', '/api/admin/periodos', () => ({ ciclo: $('apd-ciclo').value, nombre: $('apd-nombre').value, orden: $('apd-orden').value, fecha_inicio: $('apd-ini').value, fecha_fin: $('apd-fin').value }), 'apd-msg');
    $('admin-pagos')?.addEventListener('click', async e => {
        const b = e.target.closest('.btn-pagado'); if (!b) return;
        await api(`/api/admin/pagos/${b.dataset.id}/pagado`, { method: 'PATCH', body: {} }); cargarAdminDatos();
    });
    $('admin-eventos')?.addEventListener('click', async e => {
        const b = e.target.closest('.btn-borrar-evento'); if (!b) return;
        await api(`/api/admin/calendario/${b.dataset.id}`, { method: 'DELETE' }); cargarAdminDatos(); cargarCalendario();
    });

    // ---------- Arranque ----------
    try {
        const me = await api('/api/auth/me');
        usuario = me.usuario; csrf = me.csrf;
    } catch (e) { return; }
    pintarUsuario();
    try {
        const pref = await api('/api/preferencias');
        aplicarTema(pref.tema);
        $('notif-notas').checked = pref.notif_notas; $('notif-horarios').checked = pref.notif_horarios; $('notif-avisos').checked = pref.notif_avisos;
    } catch (e) { aplicarTema('light'); }

    const alumnos = await api('/api/alumnos');
    const sel = $('selector-alumno');
    if (usuario.rol !== 'alumno' && alumnos.length) {
        sel.innerHTML = alumnos.map(a => `<option value="${Number(a.id)}">${esc(a.apellido)}, ${esc(a.nombre)}</option>`).join('');
        sel.classList.remove('d-none');
        sel.addEventListener('change', () => { alumnoId = Number(sel.value); cargarTodoDelAlumno(); });
    }
    alumnoId = alumnos.length ? alumnos[0].id : null;
    if (usuario.rol === 'admin') { $('nav-admin').classList.remove('d-none'); cargarAdmin(); cargarAdminDatos(); }

    await Promise.all([cargarTodoDelAlumno(), cargarCalendario(), cargarComunicados(), cargarNotificaciones()]);
    if (usuario.debe_cambiar_password) modal('modalPassword').show();
});
