/**
 * NUEVO: Rate limiter en memoria para el endpoint de login.
 * Protege contra ataques de fuerza bruta sin dependencias externas.
 * Límite: 10 intentos por IP cada 15 minutos.
 */
const intentos = new Map();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_INTENTOS = 10;

// Limpieza periódica para no acumular memoria
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, data] of intentos) {
    if (ahora - data.inicio > WINDOW_MS) intentos.delete(ip);
  }
}, 5 * 60 * 1000).unref();

const loginRateLimit = (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const ahora = Date.now();

  let data = intentos.get(ip);

  if (!data || ahora - data.inicio > WINDOW_MS) {
    data = { count: 0, inicio: ahora };
    intentos.set(ip, data);
  }

  data.count++;

  if (data.count > MAX_INTENTOS) {
    const minutosRestantes = Math.ceil((WINDOW_MS - (ahora - data.inicio)) / 60000);
    return res.status(429).json({
      error: `Demasiados intentos de inicio de sesión. Intente nuevamente en ${minutosRestantes} minuto(s).`
    });
  }

  next();
};

module.exports = { loginRateLimit };
