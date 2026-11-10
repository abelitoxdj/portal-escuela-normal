const crypto = require('crypto');

function requiereLogin(req, res, next) {
  if (!req.session || !req.session.usuario) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.session?.usuario || !roles.includes(req.session.usuario.rol)) {
      return res.status(403).json({ error: 'Sin permisos' });
    }
    next();
  };
}

// Protección CSRF: token en la sesión, enviado por el cliente en el header X-CSRF-Token
function tokenCsrf(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}
function verificarCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const enviado = req.get('X-CSRF-Token') || '';
  const esperado = req.session?.csrf || '';
  const a = Buffer.from(enviado), b = Buffer.from(esperado);
  if (!esperado || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Token CSRF inválido' });
  }
  next();
}

module.exports = { requiereLogin, requiereRol, tokenCsrf, verificarCsrf };
