# portal-escuela-normal
proyecto escolar completo
# Portal Académico — Escuela Normal

Aplicación web con login real, roles (alumno, padre/tutor, administrador), base de datos MySQL y API REST.
Se conservó el diseño original (HTML + Bootstrap 5) y las funciones que ya andaban (navegación, buscador, simulador, impresión).

**Stack:** Node.js + Express · MySQL/MariaDB · sesiones en base de datos · bcrypt · Bootstrap 5.

## Requisitos
Node.js 20+ y MySQL 8 (o MariaDB 10.5+). Opcional: una cuenta SMTP para el correo de recuperación (ver `.env.example`).

## Instalación
```bash
npm install
cp .env.example .env          # completar credenciales y SESSION_SECRET
```
Crear la base y un usuario con permisos limitados (como root de MySQL):
```sql
SOURCE db/schema.sql;
CREATE USER 'portal_user'@'localhost' IDENTIFIED BY 'UNA_CLAVE_LARGA';
GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,INDEX ON portal_escuela.* TO 'portal_user'@'localhost';
```
(`CREATE`/`INDEX` los necesita el almacén de sesiones para crear su tabla la primera vez.)

Crear el **primer administrador**:
```bash
ADMIN_EMAIL=director@tu-escuela.edu.ar ADMIN_PASSWORD='ClaveInicial2026' npm run admin:crear
```
Iniciar: `npm start` → http://localhost:3000

### Datos de demostración (solo desarrollo)
```bash
DEMO_PASSWORD='clave-de-prueba-1' npm run db:seed-demo
```
Crea usuarios `admin@`, `alumno1@`, `alumno2@`, `tutor1@demo.invalid` con datos **ficticios** (el cronograma de materias y docentes proviene de la grilla que ya estaba en el proyecto). **No ejecutar en producción.**

## Pruebas
Con el servidor y los datos demo levantados: `DEMO_PASSWORD=... npm test` (ver `docs/04-INFORME-PRUEBAS.md`).

## Estructura
```
public/   frontend (index.html, login.html, app.js, login.js, estilos)
server/   Express: index.js, routes/{auth,api,admin}.js, middleware/
db/       schema.sql, seed-demo.js, backup.sh
tests/    pruebas de integración y de frontend
docs/     auditoría, producción, manual, informe de pruebas
```

## Documentación
- `docs/01-AUDITORIA.md` — estado inicial y errores hallados
- `docs/02-PRODUCCION.md` — hosting, HTTPS, backups, actualización
- `docs/03-MANUAL-USUARIO.md` — uso por rol
- `docs/04-INFORME-PRUEBAS.md` — pruebas ejecutadas y limitaciones
