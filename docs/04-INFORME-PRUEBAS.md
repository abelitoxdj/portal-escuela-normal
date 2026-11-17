# Informe de pruebas

Entorno: Node 22, MariaDB 10.11 (compatible con MySQL), servidor Express real, base de datos real con datos demo ficticios. Base recreada desde cero antes de la corrida final.

- `tests/run-tests.js` — 46 pruebas de integración contra la API → **46/46 aprobadas**
- `tests/frontend-dom.js` — 36 verificaciones ejecutando `index.html` + `app.js` en jsdom contra el servidor vivo → **36/36 aprobadas**

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

Tercera ronda: restablecer contraseña de usuarios (cierra sus sesiones), datos completos del alumno (DNI, nacimiento, domicilio, inscripción a materias), historial de notas con edición y borrado, y gestión (editar/borrar) de comunicados, cuotas, asistencias, materias, horarios y docentes; botón de ojo en las contraseñas. Además (segunda ronda): alta de docentes, materias, horarios, períodos, cuotas y eventos de calendario desde el administrador; permisos de fotos por relación; token de recuperación. También: bloqueo tras 5 intentos, CSRF, cabeceras de seguridad, XSS en nombres, permisos de rol (alumno/tutor no pueden cargar notas), desactivación de usuarios, preferencias.

## Conjunto de demostración
`tests/verificar-demostracion.js` carga el dataset en una base limpia y comprueba, con las tres cuentas: logins, aislamiento entre alumnos, 5 materias con docente, promedios calculados a mano (8.02 y 7.93), asistencias (faltas, tardanzas, justificadas), 10 cuotas con deuda 28000, resumen de inicio, 6 comunicados, 24 eventos, que ninguna respuesta de la API contenga "ficticio/demo/prueba/ejemplo", y el renderizado de la pantalla de un alumno y del administrador en jsdom. **Resultado: todo OK.** Esto se ejecutó sobre MariaDB local, **no sobre tu base de alwaysdata**.
Dos aserciones propias que siempre pasaban (tautológicas) se detectaron y corrigieron durante el trabajo.

## Lo que NO se probó

- **Responsive en navegador real (punto 16):** yo no pude verlo renderizado. El usuario informó que en el celular funciona bien (revisión manual suya, no mía). Las pantallas nuevas de administración no fueron revisadas en celular.
- **Renderizado visual real y política CSP en un navegador:** jsdom no aplica CSP ni descarga CDN. Si algún recurso externo no cargara, se vería en la consola del navegador.
- **Expiración de sesión por inactividad (30 min):** configurada (`maxAge` + `rolling`), no medida.
- **Cookie `Secure` / HTTPS:** requiere despliegue con HTTPS real.
- **Envío real de correo (SMTP):** el código de envío está implementado (nodemailer), pero **no lo probé contra un servidor SMTP real**. Sin SMTP configurado solo se verificó que el flujo no falla, que genera el token y que no revela qué correos existen.
- Carga/estrés y pruebas de penetración profesionales.

## Hallazgos corregidos durante las pruebas
- El límite de intentos de login (por IP) contaba también los ingresos correctos: en una escuela, con muchos alumnos en el mismo Wi-Fi, podía bloquear ingresos legítimos. Ahora cuenta solo los fallidos (100 por 15 min por IP); el bloqueo por cuenta (5 intentos) se mantiene.
- Mi prueba de navegación SPA era tautológica (siempre pasaba) → reescrita.
- Falla aparente del tema oscuro: era un artefacto de la prueba (doble `DOMContentLoaded`), no un defecto de la app.

## Limitaciones conocidas del producto
- `style.css` original sigue **totalmente comentado** (`/* ... */`). No lo activé para no alterar el aspecto actual; los estilos nuevos van en `portal.css`. Decidir si se descomenta.
- Las pantallas de administración nuevas (asistencias, cuotas, calendario, materias, docentes, horarios, períodos) están probadas a nivel API y de DOM simulado, **no vistas en un navegador real**.
- No hay pantalla para editar o borrar materias, docentes, horarios o períodos ya cargados (solo alta); eso se corrige por SQL.
- Las notas, asistencias y cuotas cargadas por error tampoco tienen pantalla de edición/borrado (las notas se corrigen volviendo a cargarlas).
