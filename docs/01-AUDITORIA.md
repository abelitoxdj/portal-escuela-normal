# Auditoría — Portal Académico Escuela Normal

Estado inicial: frontend estático (HTML + Bootstrap 5.3.2 por CDN + JS en el cliente). Sin backend, sin base de datos, sin autenticación.

## Hallazgos críticos (errores de programación)

1. **`style.css` está completamente comentado.** Empieza con `/*` y termina con `*/`; ningún estilo propio se aplica (sidebar, tarjetas, tabla de horarios, tema oscuro, footer).
2. **FontAwesome no está enlazado** en `index.html`. Todos los `<i class="fa-solid ...">` quedan sin ícono.
3. **Clases inconsistentes entre JS, HTML y CSS.** `app.js` busca `.nav-link-custom`, mientras el CSS define `.seccion-activa` / `.seccion-oculta`; el README documenta un mecanismo distinto al implementado.
4. **Próxima clase:** si no hay más clases ese día muestra "Jornada finalizada" en lugar de la siguiente clase del próximo día lectivo.
5. **Notas y perfil con datos fijos en el HTML** ("Ramiro Martin", 22 años, notas 8/7/9...). No provienen de ninguna fuente.
6. **El README dice "promedio ponderado"**, pero el código calcula promedio simple.
7. Comparación `promedio >= 6` sobre un string (resultado de `toFixed`); funciona por coerción, pero es frágil.

## Funcionalidades terminadas (se conservan)

- Navegación SPA entre secciones.
- Buscador de materias en tiempo real.
- Simulador de promedio (se mantiene como herramienta independiente).
- Impresión del boletín (`window.print()`).
- Layout responsive con Bootstrap (offcanvas en móvil).
- Cambio de tema claro/oscuro (`data-bs-theme`).

## Funcionalidades que solo simulan (necesitan corrección)

| Función | Qué hace hoy | Problema |
|---|---|---|
| Cerrar sesión / Reiniciar vista | `location.reload()` | No existe sesión |
| Cambiar contraseña | Cierra el modal | No modifica nada |
| Editar perfil | Cierra el modal | No guarda nada |
| Foto de perfil | Vista previa local | No se sube ni persiste |
| Notificaciones | Switches sin efecto | No se guardan preferencias |

## Funcionalidades inexistentes (deben desarrollarse)

Login, roles y permisos, base de datos, API, **Asistencias, Pagos, Calendario y Comunicados** (solo aparecen mencionadas en texto; no hay secciones), recuperación de contraseña, protección de rutas.

## Autenticación y persistencia

- Autenticación real: **no existe**.
- Conexión a base de datos: **no existe**.
- Horarios: matriz fija dentro de `app.js`.
