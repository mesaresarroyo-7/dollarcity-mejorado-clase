const express = require('express');
const router = express.Router();
const { productosMasVendidos, resumenDashboard, ventasPorDia, ventasPorCategoria, inventarioValorizado } = require('../controllers/reportes.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');

// GET /api/reportes/productos-mas-vendidos (solo admin)
router.get('/productos-mas-vendidos', authMiddleware, roleMiddleware('admin'), productosMasVendidos);

// GET /api/reportes/dashboard (todos los roles autenticados: el dashboard es la pantalla de inicio)
router.get('/dashboard', authMiddleware, resumenDashboard);

// GET /api/reportes/ventas-por-dia?dias=30 (solo admin) - NUEVO
router.get('/ventas-por-dia', authMiddleware, roleMiddleware('admin'), ventasPorDia);

// GET /api/reportes/ventas-por-categoria (solo admin) - NUEVO
router.get('/ventas-por-categoria', authMiddleware, roleMiddleware('admin'), ventasPorCategoria);

// GET /api/reportes/inventario-valorizado (solo admin) - NUEVO
router.get('/inventario-valorizado', authMiddleware, roleMiddleware('admin'), inventarioValorizado);

module.exports = router;
