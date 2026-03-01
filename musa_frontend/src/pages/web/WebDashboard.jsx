import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../../main';
import KPICard from '../../components/shared/KPICard';
import s from './WebDashboard.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  listo: 'Listo',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export default function WebDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState({
    totalPedidos: 0,
    pendientes: 0,
    pedidosHoy: 0,
    ingresosTotal: 0,
    ingresosHoy: 0,
    ultimos: [],
  });

  useEffect(() => {
    const handler = (d) => setData(d);
    socket.on('response-web-dashboard', handler);
    socket.on('cambios-web', () => socket.emit('request-web-dashboard'));
    socket.emit('request-web-dashboard');
    return () => {
      socket.off('response-web-dashboard', handler);
      socket.off('cambios-web');
    };
  }, []);

  return (
    <div>
      <div className={s.topBar}>
        <a href="/tienda" target="_blank" rel="noreferrer" className={s.viewStore}>
          <i className="bi bi-box-arrow-up-right" /> Ver tienda
        </a>
      </div>

      <div className={s.grid}>
        <KPICard label="Pedidos hoy" value={data.pedidosHoy} />
        <KPICard label="Pendientes" value={data.pendientes} urgent={data.pendientes > 0} />
        <KPICard label="Ingresos hoy" value={money(data.ingresosHoy)} />
        <KPICard label="Ingresos total" value={money(data.ingresosTotal)} />
        <KPICard label="Total pedidos" value={data.totalPedidos} />
      </div>

      {/* Pedidos recientes */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <h2 className={s.sectionTitle}><i className="bi bi-clock-history" /> Pedidos recientes</h2>
          <button className={s.sectionLink} onClick={() => navigate('/web/pedidos')}>
            Ver todos <i className="bi bi-arrow-right" />
          </button>
        </div>

        {data.ultimos.length === 0 ? (
          <div className={s.empty}>No hay pedidos aun</div>
        ) : (
          <div className={s.table}>
            <div className={s.tableHeader}>
              <span>#</span>
              <span>Cliente</span>
              <span>Total</span>
              <span>Estado</span>
              <span>Fecha</span>
            </div>
            {data.ultimos.map((p) => (
              <div key={p._id} className={s.tableRow} onClick={() => navigate('/web/pedidos')}>
                <span className={s.orderNum}>{p.numeroPedido}</span>
                <span>{p.cliente?.nombre || '-'}</span>
                <span className={s.orderTotal}>{money(p.montoTotal)}</span>
                <span className={`${s.badge} ${s[`badge_${p.estado}`]}`}>{ESTADO_LABELS[p.estado] || p.estado}</span>
                <span className={s.orderDate}>{new Date(p.createdAt).toLocaleDateString('es-AR')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
