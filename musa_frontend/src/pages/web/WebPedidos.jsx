import { useState, useEffect } from 'react';
import { socket } from '../../main';
import s from './WebPedidos.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

const ESTADOS = ['', 'pendiente', 'confirmado', 'preparando', 'listo', 'enviado', 'entregado', 'cancelado'];
const ESTADO_LABELS = {
  '': 'Todos',
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  listo: 'Listo',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const NEXT_ESTADO = {
  pendiente: 'confirmado',
  confirmado: 'preparando',
  preparando: 'listo',
  listo: 'enviado',
  enviado: 'entregado',
};

export default function WebPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [estado, setEstado] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const fetchPedidos = (params = {}) => {
    socket.emit('request-pedidos-web', {
      estado: params.estado ?? estado,
      search: params.search ?? search,
      page: params.page ?? page,
    });
  };

  useEffect(() => {
    const handler = (data) => {
      setPedidos(data.pedidos || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    };
    socket.on('response-pedidos-web', handler);
    socket.on('cambios-web', () => fetchPedidos());
    fetchPedidos();
    return () => {
      socket.off('response-pedidos-web', handler);
      socket.off('cambios-web');
    };
  }, []);

  useEffect(() => {
    fetchPedidos({ page: 1 });
    setPage(1);
  }, [estado, search]);

  const handleEstadoChange = (pedidoId, nuevoEstado) => {
    socket.emit('update-estado-pedido-web', { pedidoId, estado: nuevoEstado }, (res) => {
      if (res?.ok) {
        fetchPedidos();
        if (selected?._id === pedidoId) {
          setSelected((prev) => prev ? { ...prev, estado: nuevoEstado } : null);
        }
      }
    });
  };

  return (
    <div className={s.pedidos}>
      {/* Filters */}
      <div className={s.toolbar}>
        <div className={s.tabs}>
          {ESTADOS.map((e) => (
            <button
              key={e}
              className={`${s.tab} ${estado === e ? s.tabActive : ''}`}
              onClick={() => setEstado(e)}
            >
              {ESTADO_LABELS[e]}
            </button>
          ))}
        </div>
        <div className={s.searchWrap}>
          <i className="bi bi-search" />
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={s.searchInput}
          />
        </div>
      </div>

      {/* Results */}
      <div className={s.info}>{total} pedido{total !== 1 ? 's' : ''}</div>

      {pedidos.length === 0 ? (
        <div className={s.empty}>No hay pedidos</div>
      ) : (
        <div className={s.table}>
          <div className={s.tableHeader}>
            <span>#</span>
            <span>Cliente</span>
            <span>Items</span>
            <span>Total</span>
            <span>Entrega</span>
            <span>Estado</span>
            <span>Fecha</span>
            <span>Accion</span>
          </div>
          {pedidos.map((p) => (
            <div key={p._id} className={s.tableRow} onClick={() => setSelected(p)}>
              <span className={s.num}>{p.numeroPedido}</span>
              <span className={s.cliente}>
                <strong>{p.cliente?.nombre}</strong>
                <small>{p.cliente?.telefono}</small>
              </span>
              <span>{p.items?.length || 0}</span>
              <span className={s.total}>{money(p.montoTotal)}</span>
              <span className={s.entrega}>{p.entrega === 'envio' ? 'Envio' : 'Retiro'}</span>
              <span><span className={`${s.badge} ${s[`badge_${p.estado}`]}`}>{ESTADO_LABELS[p.estado]}</span></span>
              <span className={s.date}>{new Date(p.createdAt).toLocaleDateString('es-AR')}</span>
              <span onClick={(e) => e.stopPropagation()}>
                {NEXT_ESTADO[p.estado] && (
                  <button className={s.nextBtn} onClick={() => handleEstadoChange(p._id, NEXT_ESTADO[p.estado])}>
                    {ESTADO_LABELS[NEXT_ESTADO[p.estado]]} <i className="bi bi-arrow-right" />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={s.pagination}>
          <button disabled={page <= 1} onClick={() => { setPage(page - 1); fetchPedidos({ page: page - 1 }); }}>
            <i className="bi bi-chevron-left" />
          </button>
          <span>Pagina {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { setPage(page + 1); fetchPedidos({ page: page + 1 }); }}>
            <i className="bi bi-chevron-right" />
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className={s.overlay} onClick={() => setSelected(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3>Pedido #{selected.numeroPedido}</h3>
              <button className={s.closeBtn} onClick={() => setSelected(null)}><i className="bi bi-x-lg" /></button>
            </div>

            <div className={s.modalBody}>
              {/* Cliente */}
              <div className={s.modalSection}>
                <h4><i className="bi bi-person" /> Cliente</h4>
                <div className={s.modalGrid}>
                  <div><label>Nombre</label><span>{selected.cliente?.nombre}</span></div>
                  <div><label>Email</label><span>{selected.cliente?.email}</span></div>
                  <div><label>Telefono</label><span>{selected.cliente?.telefono}</span></div>
                  {selected.cliente?.direccion && <div><label>Direccion</label><span>{selected.cliente.direccion}</span></div>}
                </div>
                {selected.cliente?.telefono && (
                  <a
                    href={`https://wa.me/${selected.cliente.telefono.replace(/\D/g, '')}?text=Hola ${selected.cliente.nombre}! Te escribo por tu pedido #${selected.numeroPedido} en MUSA Vinoteca.`}
                    target="_blank"
                    rel="noreferrer"
                    className={s.waLink}
                  >
                    <i className="bi bi-whatsapp" /> Contactar
                  </a>
                )}
              </div>

              {/* Items */}
              <div className={s.modalSection}>
                <h4><i className="bi bi-bag" /> Productos</h4>
                {selected.items?.map((item, i) => (
                  <div key={i} className={s.modalItem}>
                    <span>{item.nombre} x{item.cantidad}</span>
                    <span>{money(item.subtotal)}</span>
                  </div>
                ))}
                <div className={s.modalItem} style={{ fontWeight: 700, borderTop: '1px solid var(--card-border)', paddingTop: 8 }}>
                  <span>Total</span>
                  <span>{money(selected.montoTotal)}</span>
                </div>
              </div>

              {/* Estado */}
              <div className={s.modalSection}>
                <h4><i className="bi bi-flag" /> Estado</h4>
                <div className={s.estadoSelect}>
                  {ESTADOS.filter((e) => e).map((e) => (
                    <button
                      key={e}
                      className={`${s.estadoBtn} ${selected.estado === e ? s.estadoBtnActive : ''} ${s[`estadoBtn_${e}`]}`}
                      onClick={() => handleEstadoChange(selected._id, e)}
                    >
                      {ESTADO_LABELS[e]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              {selected.cliente?.notas && (
                <div className={s.modalSection}>
                  <h4><i className="bi bi-chat-left-text" /> Notas del cliente</h4>
                  <p className={s.notas}>{selected.cliente.notas}</p>
                </div>
              )}

              {/* MP */}
              {selected.mpPaymentId && (
                <div className={s.modalSection}>
                  <h4><i className="bi bi-credit-card" /> MercadoPago</h4>
                  <p>ID Pago: {selected.mpPaymentId} — Estado: {selected.mpStatus}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
