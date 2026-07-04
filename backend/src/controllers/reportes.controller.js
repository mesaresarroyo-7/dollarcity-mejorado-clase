const pool = require('../config/db');

/**
 * GET /api/reportes/productos-mas-vendidos
 * Reporte de productos más vendidos con totales agregados.
 */
const productosMasVendidos = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        p.codigo_barras,
        p.categoria,
        p.precio AS precio_actual,
        p.stock AS stock_actual,
        SUM(dv.cantidad) AS total_vendido,
        SUM(dv.subtotal) AS total_ingresos,
        COUNT(dv.id) AS veces_vendido
      FROM detalle_ventas dv
      JOIN productos p ON p.id = dv.producto_id
      JOIN ventas v ON v.id = dv.venta_id
      WHERE v.estado = 'COMPLETADA'
      GROUP BY p.id, p.nombre, p.codigo_barras, p.categoria, p.precio, p.stock
      ORDER BY total_vendido DESC
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/resumen-dashboard
 * Datos agregados para el dashboard administrativo.
 */
const resumenDashboard = async (req, res, next) => {
  try {
    // Total de ventas completadas
    const ventasResult = await pool.query(
      "SELECT COUNT(*) AS total_ventas, COALESCE(SUM(total), 0) AS ingresos_totales FROM ventas WHERE estado = 'COMPLETADA'"
    );

    // Total de compras
    const comprasResult = await pool.query(
      "SELECT COUNT(*) AS total_compras, COALESCE(SUM(total), 0) AS gastos_totales FROM compras WHERE estado = 'COMPLETADA'"
    );

    // Productos activos
    const productosResult = await pool.query(
      "SELECT COUNT(*) AS total_productos FROM productos WHERE estado = 'ACTIVO'"
    );

    // Productos con stock bajo
    const stockBajoResult = await pool.query(
      "SELECT COUNT(*) AS productos_stock_bajo FROM productos WHERE stock <= stock_minimo AND estado = 'ACTIVO'"
    );

    // Proveedores activos
    const proveedoresResult = await pool.query(
      'SELECT COUNT(*) AS total_proveedores FROM proveedores WHERE activo = true'
    );

    // Ventas del día
    const ventasHoyResult = await pool.query(
      "SELECT COUNT(*) AS ventas_hoy, COALESCE(SUM(total), 0) AS ingresos_hoy FROM ventas WHERE estado = 'COMPLETADA' AND DATE(fecha_venta) = CURRENT_DATE"
    );

    // Últimas 5 ventas
    const ultimasVentasResult = await pool.query(
      `SELECT v.id, v.numero_comprobante, v.tipo_comprobante, v.total, v.fecha_venta, u.nombre AS vendedor
       FROM ventas v
       JOIN usuarios u ON u.id = v.usuario_id
       WHERE v.estado = 'COMPLETADA'
       ORDER BY v.fecha_venta DESC LIMIT 5`
    );

    // Productos con stock bajo (detalle)
    const stockBajoDetalle = await pool.query(
      `SELECT id, nombre, codigo_barras, stock, stock_minimo 
       FROM productos 
       WHERE stock <= stock_minimo AND estado = 'ACTIVO' 
       ORDER BY stock ASC LIMIT 10`
    );

    res.json({
      ventas: {
        total: parseInt(ventasResult.rows[0].total_ventas),
        ingresos: parseFloat(ventasResult.rows[0].ingresos_totales)
      },
      compras: {
        total: parseInt(comprasResult.rows[0].total_compras),
        gastos: parseFloat(comprasResult.rows[0].gastos_totales)
      },
      productos: {
        total: parseInt(productosResult.rows[0].total_productos),
        stock_bajo: parseInt(stockBajoResult.rows[0].productos_stock_bajo)
      },
      proveedores: {
        total: parseInt(proveedoresResult.rows[0].total_proveedores)
      },
      hoy: {
        ventas: parseInt(ventasHoyResult.rows[0].ventas_hoy),
        ingresos: parseFloat(ventasHoyResult.rows[0].ingresos_hoy)
      },
      ultimas_ventas: ultimasVentasResult.rows,
      alertas_stock: stockBajoDetalle.rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/ventas-por-dia
 * NUEVO: serie de ventas de los últimos N días (default 30) para gráficos.
 * Incluye días sin ventas con valor 0 usando generate_series.
 */
const ventasPorDia = async (req, res, next) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 30, 7), 90);

    const result = await pool.query(`
      SELECT 
        d.dia::date AS fecha,
        COALESCE(COUNT(v.id), 0) AS num_ventas,
        COALESCE(SUM(v.total), 0) AS total_dia
      FROM generate_series(
        CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS d(dia)
      LEFT JOIN ventas v 
        ON DATE(v.fecha_venta) = d.dia::date 
        AND v.estado = 'COMPLETADA'
      GROUP BY d.dia
      ORDER BY d.dia ASC
    `, [dias]);

    res.json(result.rows.map(r => ({
      fecha: r.fecha,
      num_ventas: parseInt(r.num_ventas, 10),
      total_dia: parseFloat(r.total_dia)
    })));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/ventas-por-categoria
 * NUEVO: ingresos agrupados por categoría de producto.
 */
const ventasPorCategoria = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        COALESCE(p.categoria, 'Sin categoría') AS categoria,
        SUM(dv.cantidad) AS unidades_vendidas,
        SUM(dv.subtotal) AS ingresos
      FROM detalle_ventas dv
      JOIN productos p ON p.id = dv.producto_id
      JOIN ventas v ON v.id = dv.venta_id
      WHERE v.estado = 'COMPLETADA'
      GROUP BY COALESCE(p.categoria, 'Sin categoría')
      ORDER BY ingresos DESC
    `);

    res.json(result.rows.map(r => ({
      categoria: r.categoria,
      unidades_vendidas: parseInt(r.unidades_vendidas, 10),
      ingresos: parseFloat(r.ingresos)
    })));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reportes/inventario-valorizado
 * NUEVO: valorización del inventario actual (stock x precio de venta),
 * agrupado por categoría, más el total general.
 */
const inventarioValorizado = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        COALESCE(categoria, 'Sin categoría') AS categoria,
        COUNT(*) AS num_productos,
        SUM(stock) AS unidades_totales,
        SUM(stock * precio) AS valor_total
      FROM productos
      WHERE estado = 'ACTIVO'
      GROUP BY COALESCE(categoria, 'Sin categoría')
      ORDER BY valor_total DESC
    `);

    const categorias = result.rows.map(r => ({
      categoria: r.categoria,
      num_productos: parseInt(r.num_productos, 10),
      unidades_totales: parseInt(r.unidades_totales, 10),
      valor_total: parseFloat(r.valor_total)
    }));

    res.json({
      categorias,
      resumen: {
        num_productos: categorias.reduce((a, c) => a + c.num_productos, 0),
        unidades_totales: categorias.reduce((a, c) => a + c.unidades_totales, 0),
        valor_total: parseFloat(categorias.reduce((a, c) => a + c.valor_total, 0).toFixed(2))
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { productosMasVendidos, resumenDashboard, ventasPorDia, ventasPorCategoria, inventarioValorizado };
