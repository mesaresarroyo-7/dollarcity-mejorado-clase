const express = require('express');
const router = express.Router();
const { procesarVenta, getVentas, getVentaById, anularVenta, getKardex } = require('../controllers/ventas.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');

// GET /api/ventas (con filtros ?desde=&hasta=&estado=&page=&limit=)
router.get('/', authMiddleware, getVentas);

// GET /api/ventas/kardex/movimientos
router.get('/kardex/movimientos', authMiddleware, getKardex);

// GET /api/ventas/:id
router.get('/:id', authMiddleware, getVentaById);

// POST /api/ventas/procesar (solo admin, vendedor)
router.post('/procesar', authMiddleware, roleMiddleware('admin', 'vendedor'), procesarVenta);

// POST /api/ventas/:id/anular (solo admin) - NUEVO
router.post('/:id/anular', authMiddleware, roleMiddleware('admin'), anularVenta);

module.exports = router;
