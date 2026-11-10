// Envío de correo por SMTP. Si no hay SMTP_HOST configurado, no se envía (se informa en consola en desarrollo).
const nodemailer = require('nodemailer');
let transporte = null;
function configurado() { return !!process.env.SMTP_HOST; }
function obtener() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
    });
  }
  return transporte;
}
async function enviar(para, asunto, texto) {
  if (!configurado()) return false;
  await obtener().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: para, subject: asunto, text: texto });
  return true;
}
module.exports = { enviar, configurado };
