import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../main';
import { tienePermiso } from '../lib/permisos';
import KPICard from '../components/shared/KPICard';
import { dialog } from '../components/shared/dialog';
import s from './Dashboard.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

export default function Dashboard({ usuario }) {
  const navegar = useNavigate();
  const [totales, setTotales] = useState({});
  const [dash, setDash] = useState({ pendientesAprobacion: 0, pendientesRecepcion: 0, deudaTotal: 0, pendientesPago: 0 });
  const [stockBajo, setStockBajo] = useState([]);
  const [dashData, setDashData] = useState({
    ventas: { cantidad: 0, total: 0, ticketPromedio: 0 },
    ventasVinos: { cantidad: 0, total: 0, ticketPromedio: 0 },
    ventasReservas: { cantidad: 0, total: 0, ticketPromedio: 0 },
    mp: { totalCobrado: 0, neto: 0, comisiones: 0, retenciones: 0, gastos: 0, cantidadPagos: 0 },
    ultimasVentas: [],
  });
  const [mpComisAcum, setMpComisAcum] = useState({ comisiones: 0, retenciones: 0, desde: null, hasta: null, cantidadPagos: 0 });
  const [cerrandoComis, setCerrandoComis] = useState(false);

  const fetchAll = () => {
    socket.emit('request-totales');
    socket.emit('request-compras-dashboard');
    socket.emit('request-stock-bajo');
    socket.emit('request-dashboard-data');
    socket.emit('request-mp-comisiones-acumuladas');
  };

  useEffect(() => {
    socket.on('response-totales', (data) => {
      if (data.status !== 'error') setTotales(data);
    });
    socket.on('response-compras-dashboard', (data) => setDash(data));
    socket.on('response-stock-bajo', (data) => setStockBajo(data || []));
    socket.on('response-dashboard-data', (data) => setDashData(data));
    socket.on('response-mp-comisiones-acumuladas', (data) => setMpComisAcum(data));
    socket.on('cambios', fetchAll);
    fetchAll();
    return () => {
      socket.off('response-totales');
      socket.off('response-compras-dashboard');
      socket.off('response-stock-bajo');
      socket.off('response-dashboard-data');
      socket.off('response-mp-comisiones-acumuladas');
      socket.off('cambios');
    };
  }, []);

  const cerrarComisiones = async () => {
    if (mpComisAcum.cantidadPagos === 0) return;
    const total = mpComisAcum.comisiones + mpComisAcum.retenciones;
    if (!await dialog.confirm(`¿Cerrar comisiones y retenciones MP por ${money(total)}?\n\nSe crearán gastos en Caja por:\n• Comisiones: ${money(mpComisAcum.comisiones)}\n• Retenciones: ${money(mpComisAcum.retenciones)}\n\n(${mpComisAcum.cantidadPagos} pagos)`)) return;
    setCerrandoComis(true);
    socket.emit('cerrar-comisiones-mp', {}, (res) => {
      setCerrandoComis(false);
      if (res?.ok) {
        fetchAll();
      } else {
        dialog.alert(res?.error || 'Error al cerrar comisiones');
      }
    });
  };

  const formatPeriodo = (desde, hasta) => {
    if (!desde) return '';
    const fmt = (f) => { const [y, m, d] = f.split('-'); return `${d}/${m}`; };
    return desde === hasta ? fmt(desde) : `${fmt(desde)} — ${fmt(hasta)}`;
  };

  return (
    <div>
      {/* Caja del Dia */}
      <div className={s.section}>
        <div className={s.sectionHeader} onClick={() => navegar('/caja')}>
          <div className={s.sectionTitle}><i className="bi bi-cash-stack"></i> Caja del Dia</div>
          <i className={`bi bi-arrow-right ${s.sectionArrow}`}></i>
        </div>
        <div className={s.grid}>
          <KPICard label="Efectivo" value={money(totales.efectivo || 0)} />
          <KPICard label="Digital" value={money(totales.digital || 0)} />
          <KPICard label="Total" value={money((totales.efectivo || 0) + (totales.digital || 0))} />
        </div>
      </div>

      {/* Compras */}
      <div className={s.section}>
        <div className={s.sectionHeader} onClick={() => navegar('/compras')}>
          <div className={s.sectionTitle}><i className="bi bi-truck"></i> Compras</div>
          <i className={`bi bi-arrow-right ${s.sectionArrow}`}></i>
        </div>
        <div className={s.grid}>
          <KPICard label="Pend. Aprobacion" value={dash.pendientesAprobacion} urgent={dash.pendientesAprobacion > 0} onClick={() => navegar('/compras?filtro=pendiente_aprobacion')} />
          <KPICard label="Pend. Pago" value={dash.pendientesPago} urgent={dash.pendientesPago > 0} onClick={() => navegar('/compras/pagos')} />
          <KPICard label="Pend. Recepcion" value={dash.pendientesRecepcion} onClick={() => navegar('/compras/recepcion')} />
          <KPICard label="Deuda Total" value={money(dash.deudaTotal)} urgent={dash.deudaTotal > 0} onClick={() => navegar('/compras')} />
        </div>
      </div>

      {/* Ventas del Dia + MP en dos columnas */}
      <div className={s.twoCol}>
        <div>
          <div className={s.section}>
            <div className={s.sectionHeader} onClick={() => navegar('/ventas')}>
              <div className={s.sectionTitle}><i className="bi bi-bag-check"></i> Ventas del Dia</div>
              <i className={`bi bi-arrow-right ${s.sectionArrow}`}></i>
            </div>
            <div className={s.grid}>
              <KPICard label="Ventas" value={dashData.ventas.cantidad} />
              <KPICard label="Total" value={money(dashData.ventas.total)} />
              <KPICard label="Ticket Vinos" value={money(dashData.ventasVinos?.ticketPromedio || 0)} />
              <KPICard label="Ticket Reservas" value={money(dashData.ventasReservas?.ticketPromedio || 0)} />
            </div>
            {dashData.ultimasVentas.length > 0 && (
              <div className={s.miniList}>
                <div className={s.miniListTitle}>Últimas ventas</div>
                {dashData.ultimasVentas.map((v) => (
                  <div key={v._id} className={s.miniListItem}>
                    <div className={s.miniListLeft}>
                      <span className={s.miniListName}>{v.factura || `Venta #${v.numeroVenta || ''}`}</span>
                      <span className={s.miniListSub}>
                        {v.turno && `${v.turno} · `}
                        {v.cantProductos} prod. · {new Date(v.hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className={s.miniListMonto}>{money(v.monto)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stock Bajo */}
          {stockBajo.length > 0 && (
            <div className={s.section}>
              <div className={s.sectionHeader} onClick={() => navegar('/inventario')}>
                <div className={s.sectionTitle}>
                  <i className="bi bi-exclamation-triangle"></i> Stock Bajo
                  <span className={s.stockCount}>{stockBajo.length}</span>
                </div>
                <i className={`bi bi-arrow-right ${s.sectionArrow}`}></i>
              </div>
              <div className={s.stockList}>
                {stockBajo.map((p) => (
                  <div key={p._id} className={s.stockItem}>
                    <div className={s.stockInfo}>
                      <span className={s.stockName}>{p.nombre}</span>
                      <span className={s.stockDetail}>{p.bodega} {p.cepa ? `— ${p.cepa}` : ''}</span>
                      {p.proveedorNombre && <span className={s.stockProveedor}><i className="bi bi-truck"></i> {p.proveedorNombre}</span>}
                    </div>
                    <span className={`${s.stockBadge} ${p.cantidad <= 0 ? s.stockCritical : s.stockLow}`}>
                      {p.cantidad}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={s.section}>
          <div className={s.sectionHeader} onClick={() => navegar('/caja', { state: { tab: 'mercadopago' } })}>
            <div className={s.sectionTitle}><i className="bi bi-credit-card"></i> MercadoPago Hoy</div>
            <i className={`bi bi-arrow-right ${s.sectionArrow}`}></i>
          </div>
          <div className={s.grid}>
            <KPICard label="Cobrado" value={money(dashData.mp.totalCobrado)} />
            <KPICard label="Neto" value={money(dashData.mp.neto)} />
            <KPICard label="Comisiones y Retenciones" value={money((dashData.mp.comisiones || 0) + (dashData.mp.retenciones || 0))} />
          </div>
          <div className={s.mpMiniStats}>
            <div className={s.mpMiniStat}>
              <span className={s.mpMiniStatLabel}>Pagos procesados</span>
              <span className={s.mpMiniStatValue}>{dashData.mp.cantidadPagos}</span>
            </div>
            {dashData.mp.comisiones > 0 && (
              <div className={s.mpMiniStat}>
                <span className={s.mpMiniStatLabel}>Comisiones</span>
                <span className={`${s.mpMiniStatValue} ${s.mpMiniStatNeg}`}>{money(dashData.mp.comisiones)}</span>
              </div>
            )}
            {dashData.mp.retenciones > 0 && (
              <div className={s.mpMiniStat}>
                <span className={s.mpMiniStatLabel}>Retenciones</span>
                <span className={`${s.mpMiniStatValue} ${s.mpMiniStatNeg}`}>{money(dashData.mp.retenciones)}</span>
              </div>
            )}
            {dashData.mp.gastos > 0 && (
              <div className={s.mpMiniStat}>
                <span className={s.mpMiniStatLabel}>Gastos MP</span>
                <span className={`${s.mpMiniStatValue} ${s.mpMiniStatNeg}`}>{money(dashData.mp.gastos)}</span>
              </div>
            )}
          </div>

          {(mpComisAcum.comisiones > 0 || mpComisAcum.retenciones > 0) && (
            <div className={s.cierreComis}>
              <div className={s.cierreComisHeader}>
                <i className="bi bi-receipt-cutoff"></i> Comisiones acumuladas
                {mpComisAcum.desde && (
                  <span className={s.cierreComisPerio}>{formatPeriodo(mpComisAcum.desde, mpComisAcum.hasta)}</span>
                )}
              </div>
              <div className={s.cierreComisBody}>
                <div className={s.cierreComisRow}>
                  <span>Comisiones</span>
                  <span className={s.cierreComisNeg}>{money(mpComisAcum.comisiones)}</span>
                </div>
                <div className={s.cierreComisRow}>
                  <span>Retenciones</span>
                  <span className={s.cierreComisNeg}>{money(mpComisAcum.retenciones)}</span>
                </div>
                <div className={`${s.cierreComisRow} ${s.cierreComisTotal}`}>
                  <span>Total ({mpComisAcum.cantidadPagos} pagos)</span>
                  <span>{money(mpComisAcum.comisiones + mpComisAcum.retenciones)}</span>
                </div>
              </div>
              {tienePermiso(usuario, 'cerrar_comisiones') && <button className={s.cierreComisBtn} onClick={cerrarComisiones} disabled={cerrandoComis}>
                {cerrandoComis ? 'Cerrando...' : 'Cerrar comisiones → Caja'}
              </button>}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
