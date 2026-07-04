const express = require('express');
const router = express.Router();
const { registrarCompra, getCompras, getCompraById, anularCompra } = require('../controllers/compras.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');

// GET /api/compras
router.get('/', authMiddleware, getCompras);

// GET /api/compras/:id
router.get('/:id', authMiddleware, getCompraById);

// POST /api/compras (solo admin, almacenero)
router.post('/', authMiddleware, roleMiddleware('admin', 'almacenero'), registrarCompra);

// POST /api/compras/:id/anular (solo admin) - NUEVO
router.post('/:id/anular', authMiddleware, roleMiddleware('admin'), anularCompra);

module.exports = router;
