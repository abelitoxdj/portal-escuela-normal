# Informe de pruebas

Entorno: Node 22, MariaDB 10.11 (compatible con MySQL), servidor Express real, base de datos real con datos demo ficticios. Base recreada desde cero antes de la corrida final.

- `tests/run-tests.js` — 41 pruebas de integración contra la API → **41/41 aprobadas**
- `tests/frontend-dom.js` — 26 verificaciones ejecutando `index.html` + `app.js` en jsdom contra el servidor vivo → **26/26 aprobadas**

## Checklist solicitado

| # | Prueba | Estado |
|---|---|---|
| 1 | Creación administrativa de usuarios (alumno, duplicado, clave débil) | Ejecutada, aprobada |
| 2 | Inicio de sesión correcto | Ejecutada, aprobada |
| 3 | Contraseña incorrecta / usuario inexistente / intento de inyección SQL | Ejecutada, aprobada |
| 4 | Acceso a páginas privadas (sin sesión → 401 / redirección a /login) | Ejecutada, aprobada |
| 5 | Aislamiento entre alumnos (7 endpoints) y entre tutores | Ejecutada, aprobada |
| 6 | Cierre de sesión (la cookie vieja deja de valer) | Ejecutada, aprobada |
| 7 | Persistencia de sesión entre peticiones | Ejecutada, aprobada |
| 8 | Edición y guardado de perfil (persiste tras nuevo login), foto | Ejecutada, aprobada |
| 9 | Cambio de contraseña (la anterior deja de funcionar) | Ejecutada, aprobada |
| 10-15 | Consultas de materias, notas, asistencias, horarios, pagos, comunicados/calendario | Ejecutadas, aprobadas (API y renderizado en DOM) |
| 16 | **Adaptación a celulares y computadoras** | **NO ejecutada** (ver abajo) |

Además (segunda ronda): alta de docentes, materias, horarios, períodos, cuotas y eventos de calendario desde el administrador; permisos de fotos por relación; token de recuperación. También: bloqueo tras 5 intentos, CSRF, cabeceras de seguridad, XSS en nombres, permisos de rol (alumno/tutor no pueden cargar notas), desactivación de usuarios, preferencias.

## Lo que NO se probó

- **Responsive en navegador real (punto 16):** no hubo navegador gráfico disponible. Se conserva el layout Bootstrap original (offcanvas en móvil), pero no lo vi renderizado. Probarlo en un celular y en escritorio antes de publicar.
- **Renderizado visual real y política CSP en un navegador:** jsdom no aplica CSP ni descarga CDN. Si algún recurso externo no cargara, se vería en la consola del navegador.
- **Expiración de sesión por inactividad (30 min):** configurada (`maxAge` + `rolling`), no medida.
- **Cookie `Secure` / HTTPS:** requiere despliegue con HTTPS real.
- **Envío real de correo (SMTP):** el código de envío está implementado (nodemailer), pero **no lo probé contra un servidor SMTP real**. Sin SMTP configurado solo se verificó que el flujo no falla, que genera el token y que no revela qué correos existen.
- Carga/estrés y pruebas de penetración profesionales.

## Hallazgos corregidos durante las pruebas
- Mi prueba de navegación SPA era tautológica (siempre pasaba) → reescrita.
- Falla aparente del tema oscuro: era un artefacto de la prueba (doble `DOMContentLoaded`), no un defecto de la app.

## Limitaciones conocidas del producto
- `style.css` original sigue **totalmente comentado** (`/* ... */`). No lo activé para no alterar el aspecto actual; los estilos nuevos van en `portal.css`. Decidir si se descomenta.
- Las pantallas de administración nuevas (asistencias, cuotas, calendario, materias, docentes, horarios, períodos) están probadas a nivel API y de DOM simulado, **no vistas en un navegador real**.
- No hay pantalla para editar o borrar materias, docentes, horarios o períodos ya cargados (solo alta); eso se corrige por SQL.
- Las notas, asistencias y cuotas cargadas por error tampoco tienen pantalla de edición/borrado (las notas se corrigen volviendo a cargarlas).
