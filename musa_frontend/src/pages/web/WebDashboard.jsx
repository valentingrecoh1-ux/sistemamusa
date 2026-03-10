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

const TIPO_ICONS = { sugerencia: 'bi-lightbulb', mejora: 'bi-arrow-up-circle', reclamo: 'bi-exclamation-circle', otro: 'bi-chat' };
const TIPO_COLORS = { sugerencia: '#a78bfa', mejora: '#34d399', reclamo: '#f87171', otro: '#94a3b8' };
const ESTADO_SUG_LABELS = { pendiente: 'Pendiente', leido: 'Leido', respondido: 'Respondido' };

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
  const [sugerencias, setSugerencias] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [respuestaTexto, setRespuestaTexto] = useState({});
  const [expandedSug, setExpandedSug] = useState(null);

  useEffect(() => {
    const handler = (d) => setData(d);
    const sugHandler = (d) => setSugerencias(d || []);
    socket.on('response-web-dashboard', handler);
    socket.on('response-sugerencias-clientes', sugHandler);
    socket.on('cambios-web', () => socket.emit('request-web-dashboard'));
    socket.on('cambios', () => socket.emit('request-sugerencias-clientes', {}));
    socket.emit('request-web-dashboard');
    socket.emit('request-sugerencias-clientes', {});
    return () => {
      socket.off('response-web-dashboard', handler);
      socket.off('response-sugerencias-clientes', sugHandler);
      socket.off('cambios-web');
      socket.off('cambios');
    };
  }, []);

  const handleResponder = (sugId) => {
    const texto = respuestaTexto[sugId]?.trim();
    if (!texto) return;
    socket.emit('responder-sugerencia', { sugerenciaId: sugId, respuesta: texto });
    setRespuestaTexto((prev) => ({ ...prev, [sugId]: '' }));
    setExpandedSug(null);
    socket.emit('request-sugerencias-clientes', {});
  };

  const handleMarcarLeida = (sugId) => {
    socket.emit('marcar-sugerencia-leida', sugId);
    socket.emit('request-sugerencias-clientes', {});
  };

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

      {/* Feedback de clientes */}
      <div className={s.section}>
        <div className={s.sectionHeader} style={{ cursor: 'pointer' }} onClick={() => setShowFeedback(!showFeedback)}>
          <h2 className={s.sectionTitle}>
            <i className="bi bi-chat-dots" /> Feedback de clientes
            {sugerencias.filter((sg) => sg.estado === 'pendiente').length > 0 && (
              <span className={s.feedbackBadge}>{sugerencias.filter((sg) => sg.estado === 'pendiente').length}</span>
            )}
          </h2>
          <i className={`bi ${showFeedback ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 18, color: '#94a3b8' }} />
        </div>

        {showFeedback && (
          sugerencias.length === 0 ? (
            <div className={s.empty}>No hay feedback aun</div>
          ) : (
            <div className={s.feedbackList}>
              {sugerencias.map((sg) => (
                <div key={sg._id} className={`${s.feedbackItem} ${sg.estado === 'pendiente' ? s.feedbackPendiente : ''}`}>
                  <div className={s.feedbackTop} onClick={() => setExpandedSug(expandedSug === sg._id ? null : sg._id)}>
                    <div className={s.feedbackMeta}>
                      <i className={`bi ${TIPO_ICONS[sg.tipo] || 'bi-chat'}`} style={{ color: TIPO_COLORS[sg.tipo] }} />
                      <span className={s.feedbackCliente}>{sg.clienteNombre || 'Anonimo'}</span>
                      <span className={`${s.feedbackEstado} ${s[`feedbackEstado_${sg.estado}`]}`}>
                        {ESTADO_SUG_LABELS[sg.estado] || sg.estado}
                      </span>
                    </div>
                    <span className={s.feedbackDate}>{new Date(sg.createdAt).toLocaleDateString('es-AR')}</span>
                  </div>
                  <p className={s.feedbackMsg}>{sg.mensaje}</p>

                  {sg.respuesta && (
                    <div className={s.feedbackRespuesta}>
                      <i className="bi bi-reply" /> <strong>{sg.respondidoPor || 'Admin'}:</strong> {sg.respuesta}
                    </div>
                  )}

                  {expandedSug === sg._id && !sg.respuesta && (
                    <div className={s.feedbackActions}>
                      {sg.estado === 'pendiente' && (
                        <button className={s.feedbackBtnLeido} onClick={() => handleMarcarLeida(sg._id)}>
                          <i className="bi bi-eye" /> Marcar leido
                        </button>
                      )}
                      <div className={s.feedbackResponder}>
                        <input
                          className={s.feedbackInput}
                          placeholder="Escribi una respuesta..."
                          value={respuestaTexto[sg._id] || ''}
                          onChange={(e) => setRespuestaTexto((prev) => ({ ...prev, [sg._id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && handleResponder(sg._id)}
                        />
                        <button className={s.feedbackBtnResponder} onClick={() => handleResponder(sg._id)} disabled={!(respuestaTexto[sg._id]?.trim())}>
                          <i className="bi bi-send" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
