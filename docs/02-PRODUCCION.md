# Puesta en producción

## 1. Servidor
VPS o hosting con Node.js 20+ y MySQL 8 (ej. un VPS Ubuntu). Netlify (donde está publicado el sitio estático actual) **no sirve** para esta versión: ahora hay backend y base de datos.

## 2. Variables de entorno (`.env`)
```
NODE_ENV=production
PORT=3000
DB_HOST / DB_USER / DB_PASSWORD / DB_NAME
SESSION_SECRET=<48 bytes aleatorios>   # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_MINUTOS=30
COOKIE_SECURE=true                     # obligatorio con HTTPS
```
Con `NODE_ENV=production` el servidor confía en el proxy (`trust proxy`) y no imprime tokens de recuperación en consola.

## 3. Proceso y HTTPS
Ejecutar con un gestor de procesos (`pm2 start server/index.js --name portal`) detrás de Nginx o Caddy con certificado Let's Encrypt.
Ejemplo Caddy (HTTPS automático):
```
portal.tu-dominio.edu.ar {
    reverse_proxy 127.0.0.1:3000
}
```
Apuntar el registro DNS A del dominio a la IP del servidor.

## 4. Base de datos
Cargar `db/schema.sql`, crear el usuario con permisos limitados (ver README) y el primer administrador con `npm run admin:crear`. La base no puede ser accesible desde internet (firewall: solo 80/443 abiertos).

## 5. Copias de seguridad
`db/backup.sh` genera un volcado comprimido y borra los de más de 30 días. Programar con cron:
```
0 3 * * * DB_USER=portal_user DB_PASSWORD=... /ruta/portal/db/backup.sh /var/backups/portal
```
Copiar también la carpeta `uploads/` (fotos de perfil). Probar la restauración periódicamente (`gunzip -c archivo.sql.gz | mysql portal_escuela`).

## 6. Actualizar
```bash
git pull && npm ci --omit=dev
# aplicar cambios de esquema si los hay (se documentarán como scripts en db/)
pm2 restart portal
```
Hacer backup antes de actualizar.

## 7. Qué necesita la institución para usar datos reales
- **Carga de datos reales** (alumnos, materias, docentes, horarios, períodos, notas, asistencias, cuotas, calendario): el administrador puede hacerla desde la sección Administración. Corregir o borrar registros ya cargados (materias, horarios, etc.) todavía requiere SQL.
- **Envío de correo (SMTP)** para recuperar contraseña: completar `APP_URL` y las variables `SMTP_*` del `.env` (Gmail con clave de aplicación, Brevo, Mailgun, etc.). Sin SMTP el flujo genera el token pero no envía nada. El envío no se probó contra un servidor real: probarlo con una cuenta de verdad antes de publicar.
- Política de privacidad / consentimiento para datos de menores (Ley 25.326 de Protección de Datos Personales, Argentina) y un responsable de la base de datos.
- Eliminar los usuarios `@demo.invalid` si se cargaron datos de prueba.
- Definir quién administra cuentas y cómo se verifica la identidad de los tutores antes de asociarlos a un alumno.
