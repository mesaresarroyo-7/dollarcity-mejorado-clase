const pool = require('../config/db');
const { processPayment } = require('../services/payment.service');
const { generarNumeroComprobante } = require('../utils/comprobante');

/**
 * POST /api/ventas/procesar
 * Procesa una venta completa con validación de pago sandbox,
 * transacción PostgreSQL, actualización de stock, Kardex y comprobante.
 *
 * MEJORA: el descuento de stock ahora es atómico
 * (UPDATE ... SET stock = stock - X WHERE stock >= X). Antes se leía el
 * stock fuera de la transacción y se escribía un valor calculado, lo que
 * permitía vender más unidades de las disponibles si dos ventas del mismo
 * producto ocurrían al mismo tiempo (race condition / sobreventa).
 */
const procesarVenta = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { tipo_comprobante, payment_token, items } = req.body;
    const usuario_id = req.user.id;

    // Validaciones iniciales
    if (!tipo_comprobante || !['BOLETA', 'FACTURA'].includes(tipo_comprobante)) {
      return res.status(400).json({ error: 'tipo_comprobante debe ser BOLETA o FACTURA.' });
    }
    if (!payment_token) {
      return res.status(400).json({ error: 'payment_token es requerido.' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito no puede estar vacío.' });
    }
    if (items.length > 100) {
      return res.status(400).json({ error: 'Máximo 100 items por venta.' });
    }

    // Consolidar items duplicados (mismo producto agregado dos veces)
    const itemsMap = new Map();
    for (const item of items) {
      const cantidad = parseInt(item.cantidad, 10);
      if (!item.producto_id || !Number.isInteger(cantidad) || cantidad <= 0) {
        return res.status(400).json({ error: 'Cada item debe tener producto_id y cantidad entera válida.' });
      }
      itemsMap.set(item.producto_id, (itemsMap.get(item.producto_id) || 0) + cantidad);
    }

    // Pre-validación de precios y stock (lectura rápida, sin locks)
    let subtotalVenta = 0;
    const detalles = [];

    for (const [producto_id, cantidad] of itemsMap) {
      const prodResult = await pool.query(
        "SELECT id, nombre, codigo_barras, precio, stock FROM productos WHERE id = $1 AND estado = 'ACTIVO'",
        [producto_id]
      );

      if (prodResult.rows.length === 0) {
        return res.status(404).json({ error: `Producto con id ${producto_id} no encontrado o inactivo.` });
      }

      const producto = prodResult.rows[0];

      if (cantidad > producto.stock) {
        return res.status(400).json({
          error: `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock}, solicitado: ${cantidad}.`
        });
      }

      const subtotalItem = parseFloat((cantidad * parseFloat(producto.precio)).toFixed(2));
      subtotalVenta += subtotalItem;

      detalles.push({
        producto_id: producto.id,
        nombre: producto.nombre,
        codigo_barras: producto.codigo_barras,
        cantidad,
        precio_unitario: parseFloat(producto.precio),
        subtotal: subtotalItem
      });
    }

    // Calcular IGV y total
    subtotalVenta = parseFloat(subtotalVenta.toFixed(2));
    const igv = parseFloat((subtotalVenta * 0.18).toFixed(2));
    const total = parseFloat((subtotalVenta + igv).toFixed(2));

    // Validar pago con servicio sandbox ANTES de iniciar transacción
    const paymentResult = await processPayment(payment_token, total);

    if (!paymentResult.approved) {
      return res.status(402).json({
        error: 'Pago no aprobado.',
        payment_status: paymentResult.status,
        payment_message: paymentResult.message
      });
    }

    // Pago aprobado - Iniciar transacción PostgreSQL
    await client.query('BEGIN');

    try {
      // Generar número de comprobante (con advisory lock, ver utils/comprobante.js)
      const numero_comprobante = await generarNumeroComprobante(tipo_comprobante, client);

      // Insertar cabecera de venta
      const ventaResult = await client.query(
        `INSERT INTO ventas (usuario_id, tipo_comprobante, numero_comprobante, subtotal, igv, total, payment_token, payment_status, payment_reference, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETADA')
         RETURNING *`,
        [usuario_id, tipo_comprobante, numero_comprobante, subtotalVenta, igv, total,
         payment_token, paymentResult.status, paymentResult.reference]
      );
      const venta_id = ventaResult.rows[0].id;

      // Insertar detalles, descontar stock (atómico) y registrar kardex
      for (const detalle of detalles) {
        // Descuento atómico: falla si el stock ya no alcanza
        const stockResult = await client.query(
          `UPDATE productos 
           SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2 AND stock >= $1
           RETURNING stock`,
          [detalle.cantidad, detalle.producto_id]
        );

        if (stockResult.rows.length === 0) {
          // Otra venta consumió el stock entre la pre-validación y ahora
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: `El stock de "${detalle.nombre}" cambió durante la venta y ya no alcanza. Intente nuevamente.`,
            payment_status: paymentResult.status,
            payment_reference: paymentResult.reference,
            nota: 'El pago sandbox no genera cargo real; en producción aquí se ejecutaría un reembolso automático.'
          });
        }

        const stockNuevo = stockResult.rows[0].stock;
        const stockAnterior = stockNuevo + detalle.cantidad;

        // Insertar detalle de venta
        await client.query(
          `INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [venta_id, detalle.producto_id, detalle.cantidad, detalle.precio_unitario, detalle.subtotal]
        );

        // Registrar Kardex - SALIDA por VENTA
        await client.query(
          `INSERT INTO kardex (producto_id, tipo_movimiento, origen, referencia_id, cantidad, stock_anterior, stock_nuevo, descripcion, usuario_id)
           VALUES ($1, 'SALIDA', 'VENTA', $2, $3, $4, $5, $6, $7)`,
          [detalle.producto_id, venta_id, detalle.cantidad, stockAnterior, stockNuevo,
           `Venta #${venta_id} - ${detalle.nombre}`, usuario_id]
        );
      }

      // Insertar comprobante
      await client.query(
        `INSERT INTO comprobantes (venta_id, tipo_comprobante, numero_comprobante, subtotal, igv, total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [venta_id, tipo_comprobante, numero_comprobante, subtotalVenta, igv, total]
      );

      await client.query('COMMIT');

      // Respuesta exitosa
      res.status(201).json({
        message: 'Venta procesada correctamente',
        venta_id,
        comprobante: {
          tipo_comprobante,
          numero_comprobante,
          subtotal: subtotalVenta,
          igv,
          total,
          payment_status: paymentResult.status,
          payment_reference: paymentResult.reference,
          fecha: ventaResult.rows[0].fecha_venta,
          items: detalles.map(d => ({
            producto_id: d.producto_id,
            nombre: d.nombre,
            cantidad: d.cantidad,
            precio_unitario: d.precio_unitario,
            subtotal: d.subtotal
          }))
        }
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};

/**
 * GET /api/ventas
 * Listar ventas con filtros opcionales y paginación.
 * Query params: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&estado=COMPLETADA|ANULADA&page=1&limit=20
 */
const getVentas = async (req, res, next) => {
  try {
    const { desde, hasta, estado } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const condiciones = [];
    const params = [];

    if (desde) {
      params.push(desde);
      condiciones.push(`v.fecha_venta >= $${params.length}`);
    }
    if (hasta) {
      params.push(hasta);
      condiciones.push(`v.fecha_venta < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (estado && ['COMPLETADA', 'ANULADA'].includes(estado)) {
      params.push(estado);
      condiciones.push(`v.estado = $${params.length}`);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(total) FILTER (WHERE estado = 'COMPLETADA'), 0) AS monto_total
       FROM ventas v ${where}`,
      params
    );

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT v.*, u.nombre AS usuario_nombre
       FROM ventas v
       JOIN usuarios u ON u.id = v.usuario_id
       ${where}
       ORDER BY v.fecha_venta DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      ventas: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total, 10),
        total_pages: Math.ceil(parseInt(countResult.rows[0].total, 10) / limit)
      },
      monto_total_completadas: parseFloat(countResult.rows[0].monto_total)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/ventas/:id
 * Obtener detalle de una venta específica.
 */
const getVentaById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ventaResult = await pool.query(
      `SELECT v.*, u.nombre AS usuario_nombre
       FROM ventas v
       JOIN usuarios u ON u.id = v.usuario_id
       WHERE v.id = $1`,
      [id]
    );

    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Venta no encontrada.' });
    }

    const detallesResult = await pool.query(
      `SELECT dv.*, p.nombre AS producto_nombre, p.codigo_barras
       FROM detalle_ventas dv
       JOIN productos p ON p.id = dv.producto_id
       WHERE dv.venta_id = $1`,
      [id]
    );

    const comprobanteResult = await pool.query(
      'SELECT * FROM comprobantes WHERE venta_id = $1',
      [id]
    );

    res.json({
      ...ventaResult.rows[0],
      detalles: detallesResult.rows,
      comprobante: comprobanteResult.rows[0] || null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/ventas/:id/anular  (solo admin)
 * NUEVA FUNCIONALIDAD: anula una venta COMPLETADA.
 * - Cambia estado a ANULADA (el estado ya existía en el schema pero no se usaba)
 * - Repone el stock de cada producto
 * - Registra el movimiento en Kardex como INGRESO origen VENTA (devolución)
 * Todo dentro de una transacción.
 */
const anularVenta = async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { motivo } = req.body || {};
    const usuario_id = req.user.id;

    await client.query('BEGIN');

    // Bloquear la venta para evitar doble anulación simultánea
    const ventaResult = await client.query(
      'SELECT id, estado, numero_comprobante FROM ventas WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (ventaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Venta no encontrada.' });
    }

    if (ventaResult.rows[0].estado === 'ANULADA') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La venta ya fue anulada.' });
    }

    // Obtener detalles para reponer stock
    const detallesResult = await client.query(
      `SELECT dv.producto_id, dv.cantidad, p.nombre
       FROM detalle_ventas dv
       JOIN productos p ON p.id = dv.producto_id
       WHERE dv.venta_id = $1`,
      [id]
    );

    for (const det of detallesResult.rows) {
      const stockResult = await client.query(
        `UPDATE productos 
         SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2
         RETURNING stock`,
        [det.cantidad, det.producto_id]
      );

      const stockNuevo = stockResult.rows[0].stock;
      const stockAnterior = stockNuevo - det.cantidad;

      await client.query(
        `INSERT INTO kardex (producto_id, tipo_movimiento, origen, referencia_id, cantidad, stock_anterior, stock_nuevo, descripcion, usuario_id)
         VALUES ($1, 'INGRESO', 'VENTA', $2, $3, $4, $5, $6, $7)`,
        [det.producto_id, id, det.cantidad, stockAnterior, stockNuevo,
         `Anulación venta #${id}${motivo ? ` - Motivo: ${motivo}` : ''} - ${det.nombre}`, usuario_id]
      );
    }

    await client.query(
      "UPDATE ventas SET estado = 'ANULADA' WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');

    res.json({
      message: `Venta ${ventaResult.rows[0].numero_comprobante} anulada correctamente. Stock repuesto.`,
      venta_id: parseInt(id, 10),
      items_repuestos: detallesResult.rows.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * GET /api/ventas/kardex/movimientos
 * Obtener historial de Kardex.
 */
const getKardex = async (req, res, next) => {
  try {
    const { producto_id } = req.query;
    let query = `
      SELECT k.*, p.nombre AS producto_nombre, p.codigo_barras, u.nombre AS usuario_nombre
      FROM kardex k
      JOIN productos p ON p.id = k.producto_id
      JOIN usuarios u ON u.id = k.usuario_id
    `;
    const params = [];

    if (producto_id) {
      query += ' WHERE k.producto_id = $1';
      params.push(producto_id);
    }

    query += ' ORDER BY k.fecha_movimiento DESC LIMIT 200';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

module.exports = { procesarVenta, getVentas, getVentaById, anularVenta, getKardex };
