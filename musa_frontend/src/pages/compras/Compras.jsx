import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { socket } from '../../main';
import { IP } from '../../main';
import KPICard from '../../components/shared/KPICard';
import Badge from '../../components/shared/Badge';
import Pagination from '../../components/shared/Pagination';
import s from './Compras.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);
const round2 = (n) => Math.round(n * 100) / 100;

const ESTADOS = { borrador: 'Borrador', pendiente_aprobacion: 'Pend. Aprobacion', aprobada: 'Aprobada', enviada: 'Enviada', en_camino: 'En Camino', recibida_parcial: 'Recibida Parcial', recibida: 'Recibida', cerrada: 'Cerrada', cancelada: 'Cancelada' };
const ESTADOS_PAGO = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado' };

export default function Compras({ usuario }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [dash, setDash] = useState({ pendientesAprobacion: 0, pendientesPago: 0, pendientesRecepcion: 0, deudaTotal: 0 });
  const [ordenes, setOrdenes] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState(searchParams.get('filtro') || '');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    socket.on('response-compras-dashboard', (data) => setDash(data));
    socket.on('response-ordenes-compra', (data) => {
      setOrdenes(data.ordenes || []);
      setTotalPages(data.totalPages || 1);
    });
    socket.on('response-notificaciones', (data) => setNotifs(data || []));
    socket.on('cambios', () => {
      socket.emit('request-compras-dashboard');
      socket.emit('request-ordenes-compra', { page, estado: filtroEstado, search });
      socket.emit('request-notificaciones');
    });

    socket.emit('request-compras-dashboard');
    socket.emit('request-ordenes-compra', { page, estado: filtroEstado, search });
    socket.emit('request-notificaciones');

    return () => {
      socket.off('response-compras-dashboard');
      socket.off('response-ordenes-compra');
      socket.off('response-notificaciones');
      socket.off('cambios');
    };
  }, []);

  useEffect(() => {
    socket.emit('request-ordenes-compra', { page, estado: filtroEstado, search });
  }, [page, filtroEstado, search]);

  const marcarLeida = (id) => {
    socket.emit('marcar-notificacion-leida', id);
  };

  const marcarTodasLeidas = () => {
    socket.emit('marcar-todas-notificaciones-leidas');
  };

  return (
    <div className={s.container}>
      {/* KPI Cards */}
      <div className={s.kpiGrid}>
        <KPICard label="Pend. Aprobacion" value={dash.pendientesAprobacion} urgent={dash.pendientesAprobacion > 0} />
        <KPICard label="Pend. Pago" value={dash.pendientesPago} urgent={dash.pendientesPago > 0} />
        <KPICard label="Pend. Recepcion" value={dash.pendientesRecepcion} />
        <KPICard label="Deuda Total" value={money(dash.deudaTotal)} urgent={dash.deudaTotal > 0} />
      </div>

      {/* Nav Pills */}
      <div className={s.nav}>
        <Link to="/compras/orden/nueva" className={s.navPill}>
          <i className="bi bi-plus-circle" /> Nueva OC
        </Link>
        <Link to="/compras/proveedores" className={s.navPill}>
          <i className="bi bi-people" /> Proveedores
        </Link>
        <Link to="/compras/recepcion" className={s.navPill}>
          <i className="bi bi-box-seam" /> Recepcion
        </Link>
        <Link to="/compras/pagos" className={s.navPill}>
          <i className="bi bi-cash-stack" /> Pagos
        </Link>
      </div>

      {/* Toolbar: search + filter + pagination */}
      <div className={s.toolbar}>
        <input
          className={s.searchInput}
          type="text"
          placeholder="Buscar OC, proveedor..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className={s.filterGroup}>
          <button
            className={`${s.filterBtn} ${filtroEstado === '' ? s.filterBtnActive : ''}`}
            onClick={() => { setFiltroEstado(''); setPage(1); }}
          >
            Todas
          </button>
          {Object.entries(ESTADOS).map(([key, label]) => (
            <button
              key={key}
              className={`${s.filterBtn} ${filtroEstado === key ? s.filterBtnActive : ''}`}
              onClick={() => { setFiltroEstado(key); setPage(1); }}
            >
              {label}
            </button>
          ))}
        </div>
        <Pagination
          className={s.paginationDock}
          page={page}
          totalPages={totalPages}
          onChange={setPage}
        />
      </div>

      {/* OC Table */}
      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Bodega</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Pago</th>
            </tr>
          </thead>
          <tbody>
            {ordenes.length === 0 ? (
              <tr className={s.emptyRow}><td colSpan={6}>Sin ordenes de compra</td></tr>
            ) : ordenes.map((oc) => (
              <tr key={oc._id} className={s.clickableRow} onClick={() => navigate(`/compras/orden/${oc._id}`)} style={{ cursor: 'pointer' }}>
                <td>{oc.numero || '-'}</td>
                <td>{oc.createdAt ? new Date(oc.createdAt).toLocaleDateString('es-AR') : '-'}</td>
                <td>{oc.proveedorBodega || oc.proveedorNombre || '-'}</td>
                <td>{money(round2((oc.montoTotal || 0) * 1.21 + (oc.otrosTributos || []).reduce((s, t) => s + (t.importe || 0), 0)))}</td>
                <td><Badge variant={oc.estado}>{ESTADOS[oc.estado] || oc.estado}</Badge></td>
                <td><Badge variant={oc.estadoPago}>{ESTADOS_PAGO[oc.estadoPago] || oc.estadoPago}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notifications */}
      <div className={s.notifSection}>
        <div className={s.notifHeader}>
          <span className={s.notifTitle}>Notificaciones</span>
          <button className={s.markAllBtn} onClick={marcarTodasLeidas}>Marcar todas leidas</button>
        </div>
        <div className={s.notifList}>
          {notifs.length === 0 ? (
            <div className={s.notifEmpty}>Sin notificaciones</div>
          ) : notifs.map((n) => (
            <div
              key={n._id}
              className={`${s.notifItem} ${!n.leida ? s.notifUnread : ''}`}
              onClick={() => marcarLeida(n._id)}
            >
              <div className={`${s.notifDot} ${n.leida ? s.notifDotRead : ''}`} />
              <span className={s.notifMsg}>{n.mensaje}</span>
              <span className={s.notifDate}>{n.createdAt ? new Date(n.createdAt).toLocaleString('es-AR') : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
