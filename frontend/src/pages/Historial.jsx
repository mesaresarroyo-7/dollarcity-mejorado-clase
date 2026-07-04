import { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
import { useAuth } from '../context/AuthContext';

/**
 * NUEVA PÁGINA: Historial de Ventas
 * - Lista todas las ventas con filtros por fecha y estado
 * - Paginación desde el backend
 * - Detalle expandible de cada venta
 * - Anulación de ventas (solo admin): repone stock y registra Kardex
 */
export default function Historial() {
  const { usuario } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total_pages: 1, total: 0 });
  const [montoTotal, setMontoTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandida, setExpandida] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  // Filtros
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 15 });
      if (desde) params.append('desde', desde);
      if (hasta) params.append('hasta', hasta);
      if (estado) params.append('estado', estado);

      const res = await api.get(`/ventas?${params.toString()}`);
      setVentas(res.data.ventas);
      setPagination(res.data.pagination);
      setMontoTotal(res.data.monto_total_completadas);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, desde, hasta, estado]);

  useEffect(() => { fetchVentas(); }, [fetchVentas]);

  const toggleDetalle = async (ventaId) => {
    if (expandida === ventaId) {
      setExpandida(null);
      setDetalle(null);
      return;
    }
    try {
      const res = await api.get(`/ventas/${ventaId}`);
      setDetalle(res.data);
      setExpandida(ventaId);
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const handleAnular = async (venta) => {
    const motivo = window.prompt(
      `¿Anular la venta ${venta.numero_comprobante}?\n\nEsto repondrá el stock de todos los productos.\n\nMotivo (opcional):`
    );
    if (motivo === null) return; // canceló

    setAnulando(venta.id);
    try {
      const res = await api.post(`/ventas/${venta.id}/anular`, { motivo });
      setMensaje({ tipo: 'success', texto: res.data.message });
      setExpandida(null);
      fetchVentas();
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err.response?.data?.error || 'Error al anular la venta.'
      });
    } finally {
      setAnulando(null);
      setTimeout(() => setMensaje(null), 5000);
    }
  };

  const limpiarFiltros = () => {
    setDesde(''); setHasta(''); setEstado(''); setPage(1);
  };

  const formatFecha = (f) => new Date(f).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div>
      <div className="page-header">
        <h2>🧾 Historial de Ventas</h2>
        <p>Consulta, filtra y gestiona todas las ventas registradas</p>
      </div>

      {mensaje && (
        <div className="card" style={{
          marginBottom: '16px', padding: '14px 20px',
          borderLeft: `4px solid var(--${mensaje.tipo === 'success' ? 'success' : 'danger'})`,
          fontWeight: 600
        }}>
          {mensaje.tipo === 'success' ? '✅' : '⚠️'} {mensaje.texto}
        </div>
      )}

      {/* Filtros */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, opacity: 0.7 }}>Desde</label>
            <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1); }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, opacity: 0.7 }}>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1); }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, opacity: 0.7 }}>Estado</label>
            <select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }}>
              <option value="">Todos</option>
              <option value="COMPLETADA">Completadas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </div>
          <button className="btn" onClick={limpiarFiltros}>Limpiar</button>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>Total completadas (filtro actual)</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>
              S/ {montoTotal.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="card">
        {loading ? (
          <div className="loading-screen" style={{ minHeight: '200px' }}>
            <div className="spinner"></div><p>Cargando ventas...</p>
          </div>
        ) : ventas.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px' }}>
            <div className="empty-icon">🧾</div>
            <h3>Sin ventas</h3>
            <p>No hay ventas que coincidan con los filtros</p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Comprobante</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Vendedor</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => (
                  <>
                    <tr key={v.id} style={v.estado === 'ANULADA' ? { opacity: 0.55 } : {}}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v.numero_comprobante}</td>
                      <td><span className="badge badge-info">{v.tipo_comprobante}</span></td>
                      <td style={{ fontSize: '13px' }}>{formatFecha(v.fecha_venta)}</td>
                      <td>{v.usuario_nombre}</td>
                      <td style={{ fontWeight: 700 }}>S/ {parseFloat(v.total).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${v.payment_status === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}>
                          {v.payment_status}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${v.estado === 'COMPLETADA' ? 'badge-success' : 'badge-danger'}`}>
                          {v.estado}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn-sm" onClick={() => toggleDetalle(v.id)}>
                            {expandida === v.id ? '▲ Ocultar' : '▼ Detalle'}
                          </button>
                          {usuario?.rol === 'admin' && v.estado === 'COMPLETADA' && (
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={anulando === v.id}
                              onClick={() => handleAnular(v)}
                            >
                              {anulando === v.id ? '...' : '🚫 Anular'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandida === v.id && detalle && (
                      <tr key={`det-${v.id}`}>
                        <td colSpan={8} style={{ background: 'var(--bg-input)', padding: '16px 24px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
                            Productos de la venta:
                          </div>
                          <table style={{ fontSize: '13px' }}>
                            <thead>
                              <tr>
                                <th>Producto</th><th>Código</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detalle.detalles.map(d => (
                                <tr key={d.id}>
                                  <td>{d.producto_nombre}</td>
                                  <td style={{ fontFamily: 'monospace' }}>{d.codigo_barras}</td>
                                  <td>{d.cantidad}</td>
                                  <td>S/ {parseFloat(d.precio_unitario).toFixed(2)}</td>
                                  <td style={{ fontWeight: 600 }}>S/ {parseFloat(d.subtotal).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div style={{ marginTop: '10px', fontSize: '13px', textAlign: 'right' }}>
                            Subtotal: S/ {parseFloat(detalle.subtotal).toFixed(2)} · 
                            IGV (18%): S/ {parseFloat(detalle.igv).toFixed(2)} · 
                            <strong> Total: S/ {parseFloat(detalle.total).toFixed(2)}</strong>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {pagination.total_pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '20px', alignItems: 'center' }}>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              Página {pagination.page} de {pagination.total_pages} ({pagination.total} ventas)
            </span>
            <button className="btn btn-sm" disabled={page >= pagination.total_pages} onClick={() => setPage(page + 1)}>Siguiente →</button>
          </div>
        )}
      </div>
    </div>
  );
}
