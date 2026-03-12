import { useState, useEffect, useCallback } from 'react';
import { socket } from '../../main';
import s from './WebPedidos.module.css';

const LOGISTICA_ESTADO_LABELS = {
  new: 'Nuevo',
  ready_to_pick: 'Listo para recoger',
  picking_list: 'En picking',
  packing_slip: 'Empaquetando',
  ready_to_ship: 'Listo para enviar',
  shipped: 'En camino',
  delivered: 'Entregado',
  not_delivered: 'No entregado',
  cancelled: 'Cancelado',
  on_hold: 'En espera',
  created: 'Creado',
};

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

const PAGO_LABELS = { approved: 'Aprobado', pending: 'Pendiente', rejected: 'Rechazado', in_process: 'En proceso', refunded: 'Reembolsado' };
const PAGO_CLASS = { approved: 'pago_approved', pending: 'pago_pending', rejected: 'pago_rejected', in_process: 'pago_pending' };
const TRANSPORTISTA_NOMBRES = { shipnow: 'ShipNow (OCA)', moova: 'Moova', fijo: 'Envio propio' };

// Un pedido puede confirmarse solo si el pago fue aprobado o si no usa MercadoPago
const puedConfirmar = (p) => {
  if (p.estado !== 'pendiente') return true; // no aplica
  // Si tiene preferencia de MP, necesita pago aprobado
  if (p.mpPreferenceId && p.mpStatus !== 'approved') return false;
  return true;
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
          setSelected((prev) => prev ? {
            ...prev,
            estado: nuevoEstado,
            logisticaTracking: res.tracking || prev.logisticaTracking,
            logisticaProveedor: res.proveedor || prev.logisticaProveedor,
          } : null);
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
            <span>Pago</span>
            <span>Entrega</span>
            <span>Estado</span>
            <span>Fecha</span>
            <span>Accion</span>
          </div>
          {pedidos.map((p) => {
            const pagoStatus = p.mpStatus || (p.mpPreferenceId ? 'pending' : null);
            const nextEst = NEXT_ESTADO[p.estado];
            const bloqueado = nextEst === 'confirmado' && !puedConfirmar(p);
            return (
              <div key={p._id} className={s.tableRow} onClick={() => setSelected(p)}>
                <span className={s.num}>{p.numeroPedido}</span>
                <span className={s.cliente}>
                  <strong>{p.cliente?.nombre}</strong>
                  <small>{p.cliente?.telefono}</small>
                </span>
                <span>{p.items?.length || 0}</span>
                <span className={s.total}>{money(p.montoTotal)}</span>
                <span>
                  {pagoStatus ? (
                    <span className={`${s.badge} ${s[PAGO_CLASS[pagoStatus]] || s.pago_pending}`}>{PAGO_LABELS[pagoStatus] || pagoStatus}</span>
                  ) : (
                    <span className={s.pagoNA}>—</span>
                  )}
                </span>
                <span className={s.entrega}>{p.entrega === 'envio' ? 'Envio' : 'Retiro'}</span>
                <span><span className={`${s.badge} ${s[`badge_${p.estado}`]}`}>{ESTADO_LABELS[p.estado]}</span></span>
                <span className={s.date}>{new Date(p.createdAt).toLocaleDateString('es-AR')}</span>
                <span onClick={(e) => e.stopPropagation()}>
                  {nextEst && !bloqueado && (
                    <button className={s.nextBtn} onClick={() => handleEstadoChange(p._id, nextEst)}>
                      {ESTADO_LABELS[nextEst]} <i className="bi bi-arrow-right" />
                    </button>
                  )}
                  {bloqueado && (
                    <span className={s.bloqueadoHint} title="El pago debe estar aprobado para confirmar">
                      <i className="bi bi-lock" /> Sin pago
                    </span>
                  )}
                </span>
              </div>
            );
          })}
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
                  {selected.cliente?.pisoDepto && <div><label>Piso/Depto</label><span>{selected.cliente.pisoDepto}</span></div>}
                  {selected.cliente?.localidad && <div><label>Localidad</label><span>{selected.cliente.localidad}</span></div>}
                  {selected.cliente?.codigoPostal && <div><label>CP</label><span>{selected.cliente.codigoPostal}</span></div>}
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

              {/* Pago */}
              <div className={s.modalSection}>
                <h4><i className="bi bi-credit-card" /> Pago</h4>
                {(() => {
                  const ps = selected.mpStatus || (selected.mpPreferenceId ? 'pending' : null);
                  if (!ps) return <p className={s.pagoNA} style={{ fontSize: 13 }}>Sin MercadoPago (pago por otro medio)</p>;
                  return (
                    <div className={s.modalGrid}>
                      <div>
                        <label>Estado del pago</label>
                        <span className={`${s.badge} ${s[PAGO_CLASS[ps]] || s.pago_pending}`} style={{ width: 'fit-content' }}>
                          {PAGO_LABELS[ps] || ps}
                        </span>
                      </div>
                      {selected.mpPaymentId && <div><label>ID Pago MP</label><span>{selected.mpPaymentId}</span></div>}
                      {selected.mpPreferenceId && <div><label>Preference ID</label><span style={{ fontSize: 11, fontFamily: 'monospace' }}>{selected.mpPreferenceId}</span></div>}
                    </div>
                  );
                })()}
              </div>

              {/* Estado */}
              <div className={s.modalSection}>
                <h4><i className="bi bi-flag" /> Estado del pedido</h4>
                {selected.estado === 'pendiente' && !puedConfirmar(selected) && (
                  <div className={s.pagoWarning}>
                    <i className="bi bi-exclamation-triangle" /> No se puede confirmar este pedido hasta que el pago este aprobado.
                  </div>
                )}
                <div className={s.estadoSelect}>
                  {ESTADOS.filter((e) => e).map((e) => {
                    const disabled = e === 'confirmado' && selected.estado === 'pendiente' && !puedConfirmar(selected);
                    return (
                      <button
                        key={e}
                        className={`${s.estadoBtn} ${selected.estado === e ? s.estadoBtnActive : ''} ${s[`estadoBtn_${e}`]} ${disabled ? s.estadoBtnDisabled : ''}`}
                        onClick={() => !disabled && handleEstadoChange(selected._id, e)}
                        disabled={disabled}
                        title={disabled ? 'Pago no aprobado' : ''}
                      >
                        {ESTADO_LABELS[e]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notas */}
              {selected.cliente?.notas && (
                <div className={s.modalSection}>
                  <h4><i className="bi bi-chat-left-text" /> Notas del cliente</h4>
                  <p className={s.notas}>{selected.cliente.notas}</p>
                </div>
              )}

              {/* Logistica */}
              {selected.entrega === 'envio' && (
                <div className={s.modalSection}>
                  <h4><i className="bi bi-truck" /> Logistica</h4>
                  <div className={s.modalGrid}>
                    {selected.logisticaProveedor && <div><label>Proveedor</label><span>{TRANSPORTISTA_NOMBRES[selected.logisticaProveedor] || selected.logisticaProveedor}</span></div>}
                    {selected.logisticaEnvioId && <div><label>ID Envio</label><span>{selected.logisticaEnvioId}</span></div>}
                    {selected.logisticaTracking && <div><label>Tracking</label><span className={s.tracking}>{selected.logisticaTracking}</span></div>}
                    {selected.logisticaEstado && (
                      <div><label>Estado logistica</label><span className={s.logEstado}>{LOGISTICA_ESTADO_LABELS[selected.logisticaEstado] || selected.logisticaEstado}</span></div>
                    )}
                    {selected.opcionEnvio?.servicio && <div><label>Servicio</label><span>{selected.opcionEnvio.servicio}</span></div>}
                    {selected.opcionEnvio?.tipo === 'sucursal' && <div><label>Tipo</label><span>Retiro en sucursal</span></div>}
                    {selected.costoEnvio > 0 && <div><label>Costo envio</label><span>{money(selected.costoEnvio)}</span></div>}
                  </div>
                  {selected.logisticaEnvioId ? (
                    <div className={s.logActions}>
                      <button
                        className={s.logBtn}
                        onClick={() => {
                          socket.emit('consultar-estado-envio', { pedidoId: selected._id }, (res) => {
                            if (res?.ok) {
                              setSelected((prev) => prev ? {
                                ...prev,
                                logisticaEstado: res.estado.estadoShipnow || res.estado.estadoPedidosYa || prev.logisticaEstado,
                                logisticaTracking: res.estado.tracking || prev.logisticaTracking,
                              } : null);
                              fetchPedidos();
                            }
                          });
                        }}
                      >
                        <i className="bi bi-arrow-clockwise" /> Actualizar estado
                      </button>
                      {selected.logisticaProveedor && selected.logisticaProveedor !== 'fijo' && (
                        <button
                          className={s.logBtn}
                          onClick={() => {
                            const trackingUrl = selected.logisticaProveedor === 'shipnow'
                              ? `https://app.shipnow.com.ar/orders/${selected.logisticaEnvioId}`
                              : null;
                            if (trackingUrl) window.open(trackingUrl, '_blank');
                          }}
                        >
                          <i className="bi bi-box-arrow-up-right" /> Ver en {selected.logisticaProveedor}
                        </button>
                      )}
                    </div>
                  ) : selected.opcionEnvio && ['listo', 'enviado', 'entregado'].includes(selected.estado) ? (
                    <div className={s.logActions}>
                      <button
                        className={s.logBtn}
                        style={{ background: 'var(--primary)', color: '#fff' }}
                        onClick={() => {
                          socket.emit('crear-envio-pedido', { pedidoId: selected._id }, (res) => {
                            if (res?.ok) {
                              setSelected((prev) => prev ? {
                                ...prev,
                                logisticaEnvioId: true,
                                logisticaTracking: res.tracking,
                                logisticaProveedor: res.proveedor,
                              } : null);
                              fetchPedidos();
                            } else {
                              alert(res?.error || 'Error creando envio');
                            }
                          });
                        }}
                      >
                        <i className="bi bi-truck" /> Crear envio en {TRANSPORTISTA_NOMBRES[selected.opcionEnvio?.proveedor] || selected.opcionEnvio?.proveedor}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Costos */}
              {(selected.costoEnvio > 0 || selected.montoSubtotal) && (
                <div className={s.modalSection}>
                  <h4><i className="bi bi-calculator" /> Detalle de costos</h4>
                  <div className={s.modalItem}><span>Subtotal</span><span>{money(selected.montoSubtotal || (selected.montoTotal - (selected.costoEnvio || 0)))}</span></div>
                  {selected.costoEnvio > 0 && <div className={s.modalItem}><span>Envio</span><span>{money(selected.costoEnvio)}</span></div>}
                  <div className={s.modalItem} style={{ fontWeight: 700, borderTop: '1px solid var(--card-border)', paddingTop: 8 }}>
                    <span>Total</span><span>{money(selected.montoTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
