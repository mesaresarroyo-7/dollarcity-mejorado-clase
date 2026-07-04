const express = require('express');
const router = express.Router();
const { login, getPerfil } = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { loginRateLimit } = require('../middlewares/rateLimit.middleware');

// POST /api/auth/login (con rate limit anti fuerza bruta)
router.post('/login', loginRateLimit, login);

// GET /api/auth/perfil (protegido)
router.get('/perfil', authMiddleware, getPerfil);

module.exports = router;
