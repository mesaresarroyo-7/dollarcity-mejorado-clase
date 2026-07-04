const pool = require('../config/db');

/**
 * POST /api/compras
 * Registra una compra a proveedor con transacción PostgreSQL.
 * Actualiza stock y registra Kardex.
 */
const registrarCompra = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { proveedor_id, items } = req.body;
    const usuario_id = req.user.id;

    // Validaciones
    if (!proveedor_id) {
      return res.status(400).json({ error: 'proveedor_id es requerido.' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un item.' });
    }

    await client.query('BEGIN');

    // Validar proveedor
    const provResult = await client.query(
      'SELECT id, razon_social FROM proveedores WHERE id = $1 AND activo = true',
      [proveedor_id]
    );
    if (provResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Proveedor no encontrado o inactivo.' });
    }

    let subtotalCompra = 0;
    const detalles = [];

    // Validar productos y calcular subtotales
    for (const item of items) {
      if (!item.producto_id || !item.cantidad || !item.precio_unitario) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cada item debe tener producto_id, cantidad y precio_unitario.' });
      }
      if (item.cantidad <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'La cantidad debe ser mayor a cero.' });
      }
      if (item.precio_unitario < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'El precio unitario no puede ser negativo.' });
      }

      const prodResult = await client.query(
        'SELECT id, nombre, stock FROM productos WHERE id = $1',
        [item.producto_id]
      );
      if (prodResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Producto con id ${item.producto_id} no encontrado.` });
      }

      const subtotalItem = parseFloat((item.cantidad * item.precio_unitario).toFixed(2));
      subtotalCompra += subtotalItem;

      detalles.push({
        producto_id: item.producto_id,
        nombre: prodResult.rows[0].nombre,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: subtotalItem,
        stock_actual: prodResult.rows[0].stock
      });
    }

    // Calcular IGV y total
    subtotalCompra = parseFloat(subtotalCompra.toFixed(2));
    const igv = parseFloat((subtotalCompra * 0.18).toFixed(2));
    const total = parseFloat((subtotalCompra + igv).toFixed(2));

    // Insertar cabecera de compra
    const compraResult = await client.query(
      `INSERT INTO compras (proveedor_id, usuario_id, subtotal, igv, total, estado)
       VALUES ($1, $2, $3, $4, $5, 'COMPLETADA')
       RETURNING *`,
      [proveedor_id, usuario_id, subtotalCompra, igv, total]
    );
    const compra_id = compraResult.rows[0].id;

    // Insertar detalles, actualizar stock y registrar kardex
    for (const detalle of detalles) {
      // Insertar detalle
      await client.query(
        `INSERT INTO detalle_compras (compra_id, producto_id, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [compra_id, detalle.producto_id, detalle.cantidad, detalle.precio_unitario, detalle.subtotal]
      );

      const stockAnterior = detalle.stock_actual;
      const stockNuevo = stockAnterior + detalle.cantidad;

      // Aumentar stock
      await client.query(
        'UPDATE productos SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [stockNuevo, detalle.producto_id]
      );

      // Registrar Kardex - INGRESO por COMPRA
      await client.query(
        `INSERT INTO kardex (producto_id, tipo_movimiento, origen, referencia_id, cantidad, stock_anterior, stock_nuevo, descripcion, usuario_id)
         VALUES ($1, 'INGRESO', 'COMPRA', $2, $3, $4, $5, $6, $7)`,
        [detalle.producto_id, compra_id, detalle.cantidad, stockAnterior, stockNuevo,
         `Compra #${compra_id} - ${detalle.nombre}`, usuario_id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Compra registrada exitosamente.',
      compra: {
        id: compra_id,
        proveedor: provResult.rows[0].razon_social,
        subtotal: subtotalCompra,
        igv,
        total,
        items: detalles.map(d => ({
          producto_id: d.producto_id,
          nombre: d.nombre,
          cantidad: d.cantidad,
          precio_unitario: d.precio_unitario,
          subtotal: d.subtotal
        }))
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * GET /api/compras
 * Listar todas las compras con datos del proveedor.
 */
const getCompras = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, p.razon_social AS proveedor_nombre, u.nombre AS usuario_nombre
       FROM compras c
       JOIN proveedores p ON p.id = c.proveedor_id
       JOIN usuarios u ON u.id = c.usuario_id
       ORDER BY c.fecha_compra DESC`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/compras/:id
 * Obtener detalle de una compra específica.
 */
const getCompraById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const compraResult = await pool.query(
      `SELECT c.*, p.razon_social AS proveedor_nombre, u.nombre AS usuario_nombre
       FROM compras c
       JOIN proveedores p ON p.id = c.proveedor_id
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.id = $1`,
      [id]
    );

    if (compraResult.rows.length === 0) {
      return res.status(404).json({ error: 'Compra no encontrada.' });
    }

    const detallesResult = await pool.query(
      `SELECT dc.*, pr.nombre AS producto_nombre, pr.codigo_barras
       FROM detalle_compras dc
       JOIN productos pr ON pr.id = dc.producto_id
       WHERE dc.compra_id = $1`,
      [id]
    );

    res.json({
      ...compraResult.rows[0],
      detalles: detallesResult.rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/compras/:id/anular  (solo admin)
 * NUEVA FUNCIONALIDAD: anula una compra COMPLETADA.
 * - Valida que el stock actual alcance para revertir el ingreso
 *   (si parte de esa mercadería ya se vendió, no se puede anular)
 * - Descuenta el stock ingresado por la compra
 * - Registra el movimiento en Kardex como SALIDA origen COMPRA
 * Todo dentro de una transacción.
 */
const anularCompra = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { motivo } = req.body || {};
    const usuario_id = req.user.id;

    await client.query('BEGIN');

    const compraResult = await client.query(
      'SELECT id, estado FROM compras WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (compraResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Compra no encontrada.' });
    }

    if (compraResult.rows[0].estado === 'ANULADA') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La compra ya fue anulada.' });
    }

    const detallesResult = await client.query(
      `SELECT dc.producto_id, dc.cantidad, p.nombre
       FROM detalle_compras dc
       JOIN productos p ON p.id = dc.producto_id
       WHERE dc.compra_id = $1`,
      [id]
    );

    for (const det of detallesResult.rows) {
      // Descuento atómico: falla si el stock actual no alcanza para revertir
      const stockResult = await client.query(
        `UPDATE productos 
         SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND stock >= $1
         RETURNING stock`,
        [det.cantidad, det.producto_id]
      );

      if (stockResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `No se puede anular: el stock actual de "${det.nombre}" es menor a las ${det.cantidad} unidades ingresadas por esta compra (probablemente ya se vendieron).`
        });
      }

      const stockNuevo = stockResult.rows[0].stock;
      const stockAnterior = stockNuevo + det.cantidad;

      await client.query(
        `INSERT INTO kardex (producto_id, tipo_movimiento, origen, referencia_id, cantidad, stock_anterior, stock_nuevo, descripcion, usuario_id)
         VALUES ($1, 'SALIDA', 'COMPRA', $2, $3, $4, $5, $6, $7)`,
        [det.producto_id, id, det.cantidad, stockAnterior, stockNuevo,
         `Anulación compra #${id}${motivo ? ` - Motivo: ${motivo}` : ''} - ${det.nombre}`, usuario_id]
      );
    }

    await client.query(
      "UPDATE compras SET estado = 'ANULADA' WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');

    res.json({
      message: `Compra #${id} anulada correctamente. Stock revertido.`,
      compra_id: parseInt(id, 10),
      items_revertidos: detallesResult.rows.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

module.exports = { registrarCompra, getCompras, getCompraById, anularCompra };
