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
                (p.anio_ingreso ? fila('Año de Ingreso', esc(p.anio_ingreso)) : '') +
                (p.dni ? fila('DNI', esc(p.dni)) : '') +
                (p.fecha_nacimiento ? fila('Fecha de nacimiento', fechaLocal(p.fecha_nacimiento)) : '') +
                (p.telefono ? fila('Teléfono', esc(p.telefono)) : '') +
                (p.domicilio || p.localidad ? fila('Domicilio', esc([p.domicilio, p.localidad].filter(Boolean).join(', '))) : '');
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
        $('admin-usuarios').innerHTML = us.map(u => `<tr><td>${esc(u.nombre)} ${esc(u.apellido)}</td><td>${esc(u.email)}</td><td>${esc(u.rol)}</td><td class="text-nowrap"><button class="btn btn-sm btn-outline-primary btn-reset" data-id="${Number(u.id)}" data-nombre="${esc(u.nombre + ' ' + u.apellido)}" type="button">Nueva clave</button> <button class="btn btn-sm btn-outline-${u.activo ? 'danger' : 'success'} btn-activo" data-id="${Number(u.id)}" data-activo="${u.activo ? 0 : 1}" type="button">${u.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('');
        const opts = als.map(a => `<option value="${Number(a.id)}">${esc(a.apellido)}, ${esc(a.nombre)}</option>`).join('');
        $('an-alumno').innerHTML = opts; $('au-alumnos').innerHTML = opts;
        await cargarOpcionesNota();
        cargarPanelesAdmin();
    }
    async function cargarOpcionesNota() {
        const id = $('an-alumno').value;
        if (!id) return;
        const [ms, nt] = await Promise.all([api(`/api/materias?alumno=${id}`), api(`/api/notas?alumno=${id}`)]);
        $('an-materia').innerHTML = ms.length ? ms.map(m => `<option value="${Number(m.id)}">${esc(m.nombre)}</option>`).join('')
            : '<option value="">Sin materias: inscribí al alumno en "Datos del alumno"</option>';
        $('an-periodo').innerHTML = nt.periodos.length ? nt.periodos.map(p => `<option value="${Number(p.id)}">${esc(p.nombre)}</option>`).join('')
            : '<option value="">Sin períodos: creá uno en "Período (trimestre)"</option>';
    }
    $('an-alumno')?.addEventListener('change', cargarOpcionesNota);
    $('au-rol')?.addEventListener('change', () => {
        const r = $('au-rol').value;
        $('au-anio-box').classList.toggle('d-none', r !== 'alumno');
        $('au-dni-box').classList.toggle('d-none', r !== 'alumno');
        $('au-nac-box').classList.toggle('d-none', r !== 'alumno');
        $('au-alumnos-box').classList.toggle('d-none', r !== 'tutor');
    });
    const msg = (id, t, ok) => { const el = $(id); el.textContent = t; el.className = 'small ' + (ok ? 'text-success' : 'text-danger'); };
    let resetId = null;
    $('admin-usuarios')?.addEventListener('click', async e => {
        const r = e.target.closest('.btn-reset');
        if (r) {
            resetId = Number(r.dataset.id);
            $('rc-usuario').textContent = `Usuario: ${r.dataset.nombre}`;
            $('rc-error').textContent = ''; $('form-reset-clave').reset();
            modal('modalResetClave').show();
            return;
        }
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
                password: $('au-pass').value, anio_cursada: $('au-anio').value, dni: $('au-dni').value, fecha_nacimiento: $('au-nac').value,
                alumno_ids: [...$('au-alumnos').selectedOptions].map(o => Number(o.value)) } });
            msg('au-msg', 'Usuario creado (deberá cambiar su contraseña al ingresar).', true);
            $('form-admin-usuario').reset(); cargarAdmin();
        } catch (x) { msg('au-msg', x.message, false); }
    });
    $('form-admin-nota')?.addEventListener('submit', async e => {
        e.preventDefault();
        try {
            await api('/api/admin/notas', { method: 'POST', body: { alumno_id: $('an-alumno').value, materia_id: $('an-materia').value, periodo_id: $('an-periodo').value, valor: $('an-valor').value } });
            msg('an-msg', 'Nota guardada.', true); $('an-valor').value = ''; cargarHistorialNotas();
        } catch (x) { msg('an-msg', x.message, false); }
    });
    $('form-admin-comunicado')?.addEventListener('submit', async e => {
        e.preventDefault();
        try {
            const cuerpoC = { titulo: $('ac-titulo').value, cuerpo: $('ac-cuerpo').value, importante: $('ac-importante').checked };
            if (editComunicadoId) await api(`/api/admin/comunicados/${editComunicadoId}`, { method: 'PUT', body: cuerpoC });
            else await api('/api/admin/comunicados', { method: 'POST', body: cuerpoC });
            msg('ac-msg', editComunicadoId ? 'Comunicado actualizado.' : 'Comunicado publicado.', true); editComunicadoId = null; $('form-admin-comunicado').reset(); cargarComunicados(); cargarGestion();
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
                await cargarAdminDatos(); cargarGestion(); if (despues) despues();
            } catch (x) { msg(msgId, x.message, false); }
        });
    }
    formAdmin('form-admin-asistencia', '/api/admin/asistencias', () => ({ alumno_id: $('aa-alumno').value, materia_id: $('aa-materia').value || null, fecha: $('aa-fecha').value, estado: $('aa-estado').value, justificada: $('aa-just').checked, motivo: $('aa-motivo').value }), 'aa-msg');
    formAdmin('form-admin-pago', '/api/admin/pagos', () => ({ alumno_id: $('ap-alumno').value, concepto: $('ap-concepto').value, monto: $('ap-monto').value, vencimiento: $('ap-venc').value }), 'ap-msg');
    formAdmin('form-admin-evento', '/api/admin/calendario', () => ({ titulo: $('ae-titulo').value, fecha: $('ae-fecha').value, tipo: $('ae-tipo').value }), 'ae-msg', cargarCalendario);
    $('form-admin-materia')?.addEventListener('submit', async e => {
        e.preventDefault();
        const cuerpoM = { nombre: $('am-nombre').value, descripcion: $('am-desc').value, anio_cursada: $('am-anio').value, docente_id: $('am-docente').value || null, color: $('am-color').value };
        try {
            if (editMateriaId) await api(`/api/admin/materias/${editMateriaId}`, { method: 'PUT', body: cuerpoM });
            else await api('/api/admin/materias', { method: 'POST', body: cuerpoM });
            msg('am-msg', editMateriaId ? 'Materia actualizada.' : 'Materia guardada.', true);
            editMateriaId = null; $('form-admin-materia').reset();
            await cargarAdminDatos(); cargarGestion(); cargarTodoDelAlumno();
        } catch (x) { msg('am-msg', x.message, false); }
    });
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


    // ---------- Mostrar / ocultar contraseña ----------
    document.addEventListener('click', e => {
        const b = e.target.closest('.btn-ver-clave');
        if (!b) return;
        const inp = b.parentElement.querySelector('input');
        const oculto = inp.type === 'password';
        inp.type = oculto ? 'text' : 'password';
        b.firstElementChild.className = oculto ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });

    // ---------- Restablecer contraseña de un usuario ----------
    $('form-reset-clave')?.addEventListener('submit', async e => {
        e.preventDefault();
        $('rc-error').textContent = '';
        try {
            await api(`/api/admin/usuarios/${resetId}/password`, { method: 'POST', body: { password: $('rc-pass').value, forzar_cambio: $('rc-forzar').checked } });
            $('form-reset-clave').reset();
            modal('modalResetClave').hide();
            msg('au-msg', 'Contraseña restablecida.', true);
        } catch (x) { $('rc-error').textContent = x.message; }
    });

    // ---------- Datos completos del alumno ----------
    async function cargarPanelesAdmin() {
        const als = await api('/api/alumnos');
        const op = als.map(a => `<option value="${Number(a.id)}">${esc(a.apellido)}, ${esc(a.nombre)}</option>`).join('');
        const actual = $('ada-alumno').value, filtro = $('an2-filtro').value;
        $('ada-alumno').innerHTML = '<option value="">Elegí un alumno…</option>' + op; $('ada-alumno').value = actual;
        $('an2-filtro').innerHTML = '<option value="">Todos los alumnos</option>' + op; $('an2-filtro').value = filtro;
        cargarHistorialNotas(); cargarGestion();
    }
    async function cargarAlumnoAdmin() {
        const id = $('ada-alumno').value;
        $('form-admin-alumno').classList.toggle('d-none', !id);
        if (!id) return;
        const d = await api(`/api/admin/alumnos/${id}`);
        const a = d.alumno;
        $('ada-dni').value = a.dni || ''; $('ada-nac').value = a.fecha_nacimiento || ''; $('ada-anio').value = a.anio_cursada;
        $('ada-div').value = a.division || ''; $('ada-ing').value = a.anio_ingreso || ''; $('ada-tel').value = a.telefono || '';
        $('ada-dom').value = a.domicilio || ''; $('ada-loc').value = a.localidad || '';
        $('ada-materias').innerHTML = d.materias.length ? d.materias.map(m =>
            `<div class="form-check"><input class="form-check-input ada-mat" id="adamat-${Number(m.id)}" type="checkbox" value="${Number(m.id)}" ${d.inscriptas.includes(m.id) ? 'checked' : ''} /><label class="form-check-label" for="adamat-${Number(m.id)}">${esc(m.nombre)} (${Number(m.anio_cursada)}°)</label></div>`).join('')
            : '<span class="text-body-secondary">No hay materias cargadas.</span>';
        $('ada-msg').textContent = '';
    }
    $('ada-alumno')?.addEventListener('change', cargarAlumnoAdmin);
    $('form-admin-alumno')?.addEventListener('submit', async e => {
        e.preventDefault();
        try {
            await api(`/api/admin/alumnos/${$('ada-alumno').value}`, { method: 'PUT', body: {
                dni: $('ada-dni').value, fecha_nacimiento: $('ada-nac').value, anio_cursada: $('ada-anio').value, division: $('ada-div').value,
                anio_ingreso: $('ada-ing').value, telefono: $('ada-tel').value, domicilio: $('ada-dom').value, localidad: $('ada-loc').value,
                materias: [...document.querySelectorAll('.ada-mat:checked')].map(c => Number(c.value)) } });
            msg('ada-msg', 'Datos guardados.', true);
            await cargarOpcionesNota(); cargarTodoDelAlumno();
        } catch (x) { msg('ada-msg', x.message, false); }
    });

    // ---------- Historial de notas ----------
    async function cargarHistorialNotas() {
        const f = $('an2-filtro').value;
        try {
            const ns = await api('/api/admin/notas' + (f ? `?alumno=${f}` : ''));
            $('admin-notas').innerHTML = ns.length ? ns.map(n =>
                `<tr><td>${esc(n.apellido)}, ${esc(n.nombre)}</td><td>${esc(n.materia)}</td><td>${esc(n.periodo)} ${Number(n.ciclo)}</td>
                 <td><input aria-label="Nota" class="form-control form-control-sm nota-input" max="10" min="0" step="0.01" type="number" value="${esc(n.valor)}" /></td>
                 <td class="text-nowrap"><button class="btn btn-sm btn-outline-primary btn-nota-guardar" data-id="${Number(n.id)}" type="button">Guardar</button> <button class="btn btn-sm btn-outline-danger btn-nota-borrar" data-id="${Number(n.id)}" type="button">Borrar</button></td></tr>`).join('')
                : '<tr><td colspan="5" class="text-body-secondary">Sin notas cargadas.</td></tr>';
        } catch (e) { /* sin datos */ }
    }
    $('an2-filtro')?.addEventListener('change', cargarHistorialNotas);
    $('admin-notas')?.addEventListener('click', async e => {
        const g = e.target.closest('.btn-nota-guardar'), b = e.target.closest('.btn-nota-borrar');
        if (!g && !b) return;
        try {
            if (g) {
                const v = g.closest('tr').querySelector('.nota-input').value;
                await api(`/api/admin/notas/${g.dataset.id}`, { method: 'PUT', body: { valor: v } });
                msg('an2-msg', 'Nota actualizada.', true);
            } else {
                if (!confirm('¿Borrar esta nota?')) return;
                await api(`/api/admin/notas/${b.dataset.id}`, { method: 'DELETE' });
                msg('an2-msg', 'Nota borrada.', true);
            }
            cargarHistorialNotas(); cargarNotas();
        } catch (x) { msg('an2-msg', x.message, false); }
    });

    // ---------- Gestión de registros (editar / borrar) ----------
    let editComunicadoId = null, editMateriaId = null, gestionFilas = [];
    const ARS = v => Number(v).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    const GESTION = {
        comunicados: { url: '/api/comunicados', borrar: '/api/admin/comunicados/', cols: ['Título', 'Fecha', 'Importante'], editar: true,
            fila: c => [c.titulo, fechaLocal(c.publicado_en), c.importante ? 'Sí' : 'No'] },
        pagos: { url: '/api/admin/pagos?todos=1', borrar: '/api/admin/pagos/', cols: ['Alumno', 'Concepto', 'Monto', 'Vence', 'Estado'],
            fila: p => [`${p.apellido}, ${p.nombre}`, p.concepto, ARS(p.monto), fechaLocal(p.vencimiento), p.estado === 'pagado' ? 'Pagada' : 'Pendiente'] },
        asistencias: { url: '/api/admin/asistencias', borrar: '/api/admin/asistencias/', cols: ['Alumno', 'Fecha', 'Materia', 'Estado', 'Justificada'],
            fila: a => [`${a.apellido}, ${a.nombre}`, fechaLocal(a.fecha), a.materia || '-', a.estado, a.justificada ? 'Sí' : 'No'] },
        materias: { url: '/api/admin/materias', borrar: '/api/admin/materias/', cols: ['Materia', 'Año', 'Docente'], editar: true,
            aviso: 'Al borrar una materia también se borran sus notas, horarios e inscripciones.',
            fila: m => [m.nombre, `${m.anio_cursada}°`, m.docente || '-'] },
        horarios: { url: '/api/admin/horarios', borrar: '/api/admin/horarios/', cols: ['Día', 'Horario', 'Materia', 'Docente'],
            fila: h => [DIAS[h.dia_semana], `${hhmm(h.hora_inicio)} - ${hhmm(h.hora_fin)}`, h.materia, h.docente || '-'] },
        docentes: { url: '/api/admin/docentes', borrar: '/api/admin/docentes/', cols: ['Docente'], fila: d => [d.nombre] }
    };
    async function cargarGestion() {
        const tipo = $('ag-tipo')?.value, cfg = GESTION[tipo];
        if (!cfg) return;
        try {
            gestionFilas = await api(cfg.url);
            $('ag-thead').innerHTML = `<tr>${cfg.cols.map(c => `<th>${esc(c)}</th>`).join('')}<th></th></tr>`;
            $('ag-tbody').innerHTML = gestionFilas.length ? gestionFilas.map(r =>
                `<tr>${cfg.fila(r).map(c => `<td>${esc(c)}</td>`).join('')}<td class="text-nowrap">${cfg.editar ? `<button class="btn btn-sm btn-outline-primary btn-ag-editar" data-id="${Number(r.id)}" type="button">Editar</button> ` : ''}<button class="btn btn-sm btn-outline-danger btn-ag-borrar" data-id="${Number(r.id)}" type="button">Borrar</button></td></tr>`).join('')
                : `<tr><td colspan="${cfg.cols.length + 1}" class="text-body-secondary">Sin registros.</td></tr>`;
        } catch (e) { /* sin datos */ }
    }
    $('ag-tipo')?.addEventListener('change', cargarGestion);
    $('ag-tbody')?.addEventListener('click', async e => {
        const tipo = $('ag-tipo').value, cfg = GESTION[tipo];
        const ed = e.target.closest('.btn-ag-editar'), bo = e.target.closest('.btn-ag-borrar');
        if (!ed && !bo) return;
        try {
            if (bo) {
                if (!confirm('¿Borrar este registro?' + (cfg.aviso ? '\n' + cfg.aviso : ''))) return;
                await api(cfg.borrar + bo.dataset.id, { method: 'DELETE' });
                msg('ag-msg', 'Registro borrado.', true);
                cargarGestion(); cargarAdminDatos(); cargarComunicados(); cargarCalendario(); cargarTodoDelAlumno(); cargarHistorialNotas();
            } else {
                const r = gestionFilas.find(x => x.id === Number(ed.dataset.id));
                if (!r) return;
                if (tipo === 'comunicados') {
                    editComunicadoId = r.id; $('ac-titulo').value = r.titulo; $('ac-cuerpo').value = r.cuerpo; $('ac-importante').checked = !!r.importante;
                    msg('ac-msg', 'Editando comunicado: modificá y apretá Publicar.', true); $('ac-titulo').scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (tipo === 'materias') {
                    editMateriaId = r.id; $('am-nombre').value = r.nombre; $('am-desc').value = r.descripcion || ''; $('am-anio').value = r.anio_cursada;
                    $('am-docente').value = r.docente_id || ''; $('am-color').value = r.color;
                    msg('am-msg', 'Editando materia: modificá y apretá Guardar.', true); $('am-nombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        } catch (x) { msg('ag-msg', x.message, false); }
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
