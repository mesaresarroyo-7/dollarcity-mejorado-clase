import { useState, useEffect } from 'react';
import api from '../api/axiosConfig';

export default function Reportes() {
  const [productos, setProductos] = useState([]);
  const [ventasDia, setVentasDia] = useState([]);
  const [inventario, setInventario] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReporte();
  }, []);

  const fetchReporte = async () => {
    try {
      // MEJORA: se cargan los 3 reportes en paralelo
      const [resProductos, resDias, resInventario] = await Promise.all([
        api.get('/reportes/productos-mas-vendidos'),
        api.get('/reportes/ventas-por-dia?dias=30'),
        api.get('/reportes/inventario-valorizado')
      ]);
      setProductos(resProductos.data);
      setVentasDia(resDias.data);
      setInventario(resInventario.data);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner"></div><p>Cargando reportes...</p></div>;

  // Datos para gráfico simple con barras CSS
  const maxVendido = productos.length > 0 ? Math.max(...productos.map(p => parseInt(p.total_vendido))) : 1;

  return (
    <div>
      <div className="page-header">
        <h2>📈 Reportes</h2>
        <p>Análisis de ventas y productos más vendidos</p>
      </div>

      {/* NUEVO: Resumen de inventario valorizado */}
      {inventario && (
        <div className="stats-grid" style={{marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px'}}>
          <div className="card" style={{textAlign: 'center'}}>
            <div style={{fontSize: '13px', opacity: 0.7, marginBottom: '4px'}}>💰 Valor del inventario</div>
            <div style={{fontSize: '26px', fontWeight: 800, color: 'var(--success)'}}>
              S/ {inventario.resumen.valor_total.toLocaleString('es-PE', {minimumFractionDigits: 2})}
            </div>
          </div>
          <div className="card" style={{textAlign: 'center'}}>
            <div style={{fontSize: '13px', opacity: 0.7, marginBottom: '4px'}}>📦 Unidades en stock</div>
            <div style={{fontSize: '26px', fontWeight: 800}}>
              {inventario.resumen.unidades_totales.toLocaleString('es-PE')}
            </div>
          </div>
          <div className="card" style={{textAlign: 'center'}}>
            <div style={{fontSize: '13px', opacity: 0.7, marginBottom: '4px'}}>🏷️ Productos activos</div>
            <div style={{fontSize: '26px', fontWeight: 800}}>
              {inventario.resumen.num_productos}
            </div>
          </div>
        </div>
      )}

      {/* NUEVO: Ventas de los últimos 30 días */}
      {ventasDia.length > 0 && (
        <div className="card" style={{marginBottom: '24px'}}>
          <h3 className="card-title" style={{marginBottom: '20px'}}>📅 Ventas de los Últimos 30 Días</h3>
          {(() => {
            const maxTotal = Math.max(...ventasDia.map(d => d.total_dia), 1);
            const totalPeriodo = ventasDia.reduce((a, d) => a + d.total_dia, 0);
            const numVentas = ventasDia.reduce((a, d) => a + d.num_ventas, 0);
            return (
              <>
                <div style={{display: 'flex', gap: '24px', marginBottom: '16px', fontSize: '14px'}}>
                  <span>Total del período: <strong style={{color: 'var(--success)'}}>S/ {totalPeriodo.toFixed(2)}</strong></span>
                  <span>Ventas realizadas: <strong>{numVentas}</strong></span>
                </div>
                <div style={{display: 'flex', alignItems: 'flex-end', gap: '3px', height: '140px'}}>
                  {ventasDia.map((d) => (
                    <div
                      key={d.fecha}
                      title={`${new Date(d.fecha).toLocaleDateString('es-PE')}: S/ ${d.total_dia.toFixed(2)} (${d.num_ventas} ventas)`}
                      style={{
                        flex: 1,
                        height: `${Math.max((d.total_dia / maxTotal) * 100, 2)}%`,
                        background: d.total_dia > 0
                          ? 'linear-gradient(180deg, var(--primary-light, #3b82f6), var(--primary, #2563eb))'
                          : 'var(--bg-input)',
                        borderRadius: '3px 3px 0 0',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s'
                      }}
                    ></div>
                  ))}
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', opacity: 0.6, marginTop: '6px'}}>
                  <span>{new Date(ventasDia[0].fecha).toLocaleDateString('es-PE')}</span>
                  <span>Hoy</span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Gráfico simple de barras */}
      {productos.length > 0 && (
        <div className="card" style={{marginBottom: '24px'}}>
          <h3 className="card-title" style={{marginBottom: '24px'}}>📊 Top Productos Más Vendidos</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
            {productos.slice(0, 10).map((p, idx) => (
              <div key={p.id} style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                <span style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: `hsl(${220 + idx * 15}, 70%, ${55 - idx * 3}%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0
                }}>
                  {idx + 1}
                </span>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '4px'}}>
                    <span style={{fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                      {p.nombre}
                    </span>
                    <span style={{fontSize: '13px', fontWeight: 700, color: 'var(--success)', flexShrink: 0, marginLeft: '8px'}}>
                      {p.total_vendido} uds.
                    </span>
                  </div>
                  <div style={{
                    height: '8px', borderRadius: '4px',
                    background: 'var(--bg-input)', overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%', borderRadius: '4px',
                      background: `linear-gradient(90deg, hsl(${220 + idx * 15}, 70%, 55%), hsl(${220 + idx * 15}, 70%, 45%))`,
                      width: `${(parseInt(p.total_vendido) / maxVendido) * 100}%`,
                      transition: 'width 0.8s ease'
                    }}></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla detallada */}
      <div className="card">
        <h3 className="card-title" style={{marginBottom: '20px'}}>📋 Detalle de Ventas por Producto</h3>
        
        {productos.length === 0 ? (
          <div className="empty-state" style={{padding: '30px'}}>
            <div className="empty-icon">📊</div>
            <h3>Sin datos de ventas</h3>
            <p>Realice ventas para ver el reporte</p>
          </div>
        ) : (
          <div className="table-container" style={{border: 'none'}}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th>Código</th>
                  <th>Categoría</th>
                  <th>Total Vendido</th>
                  <th>Veces Vendido</th>
                  <th>Ingresos</th>
                  <th>Stock Actual</th>
                  <th>Precio Actual</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p, idx) => (
                  <tr key={p.id}>
                    <td style={{fontWeight: 700}}>{idx + 1}</td>
                    <td style={{fontWeight: 600}}>{p.nombre}</td>
                    <td style={{fontFamily: 'monospace', fontSize: '12px'}}>{p.codigo_barras}</td>
                    <td><span className="badge badge-info">{p.categoria || 'General'}</span></td>
                    <td style={{fontWeight: 700, color: 'var(--success)'}}>{p.total_vendido} uds.</td>
                    <td>{p.veces_vendido} veces</td>
                    <td style={{fontWeight: 700}}>S/ {parseFloat(p.total_ingresos).toFixed(2)}</td>
                    <td>
                      <span className={parseInt(p.stock_actual) <= 10 ? 'stock-warning' : 'stock-ok'}>
                        {p.stock_actual}
                      </span>
                    </td>
                    <td>S/ {parseFloat(p.precio_actual).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
