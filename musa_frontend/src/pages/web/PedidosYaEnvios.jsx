import { useState, useEffect, useCallback } from 'react';
import { socket } from '../../main';
import s from './PedidosYaEnvios.module.css';

const ESTADO_LABELS = {
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  PICKING_UP: 'Buscando',
  ONGOING: 'En camino',
  NEAR_DROP_OFF: 'Llegando',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  RETURNED: 'Devuelto',
};

const TIMELINE_STEPS = ['CONFIRMED', 'PICKING_UP', 'ONGOING', 'DELIVERED'];

const money = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

export default function PedidosYaEnvios() {
  const [envios, setEnvios] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Form state
  const [form, setForm] = useState({
    destinoNombre: '',
    destinoTelefono: '',
    destinoDireccion: '',
    destinoCiudad: '',
    destinoEmail: '',
    referencia: '',
    descripcion: '',
    cantidad: 1,
  });
  const [cotizacion, setCotizacion] = useState(null);
  const [estimando, setEstimando] = useState(false);
  const [creando, setCreando] = useState(false);

  // Load envios from localStorage
  const loadEnvios = useCallback(() => {
    try {
      const saved = localStorage.getItem('pedidosya_envios');
      if (saved) setEnvios(JSON.parse(saved));
    } catch {}
  }, []);

  const saveEnvios = (list) => {
    setEnvios(list);
    localStorage.setItem('pedidosya_envios', JSON.stringify(list));
  };

  useEffect(() => {
    loadEnvios();
  }, [loadEnvios]);

  // Refresh all envio statuses
  const refreshAll = async () => {
    setRefreshing(true);
    const updated = [...envios];
    let changed = false;
    for (const envio of updated) {
      if (envio.status === 'DELIVERED' || envio.status === 'CANCELLED' || envio.status === 'RETURNED') continue;
      try {
        await new Promise((resolve) => {
          socket.emit('pedidosya-estado-envio', { envioId: envio.envioId }, (res) => {
            if (res?.ok) {
              envio.status = res.envio.status;
              envio.trackingUrl = res.envio.trackingUrl || envio.trackingUrl;
              envio.rider = res.envio.rider || envio.rider;
              changed = true;
            }
            resolve();
          });
        });
      } catch {}
    }
    if (changed) saveEnvios(updated);
    setRefreshing(false);
  };

  // Estimate
  const handleEstimar = () => {
    if (!form.destinoDireccion || !form.destinoNombre) return;
    setEstimando(true);
    setCotizacion(null);
    socket.emit('pedidosya-estimar', {
      destino: {
        nombre: form.destinoNombre,
        telefono: form.destinoTelefono,
        direccion: form.destinoDireccion,
        ciudad: form.destinoCiudad || 'CABA',
        email: form.destinoEmail,
      },
      items: [{
        cantidad: parseInt(form.cantidad) || 1,
        precioUnitario: 0,
        nombre: form.descripcion || 'Paquete',
      }],
    }, (res) => {
      setEstimando(false);
      if (res?.ok && res.opciones?.length > 0) {
        setCotizacion(res.opciones[0]);
      } else {
        alert(res?.error || 'No se pudo estimar el envio. Verifica la direccion.');
      }
    });
  };

  // Create
  const handleCrear = () => {
    setCreando(true);
    socket.emit('pedidosya-crear-envio', {
      destino: {
        nombre: form.destinoNombre,
        telefono: form.destinoTelefono,
        direccion: form.destinoDireccion,
        ciudad: form.destinoCiudad || 'CABA',
        email: form.destinoEmail,
      },
      items: [{
        cantidad: parseInt(form.cantidad) || 1,
        precioUnitario: 0,
        nombre: form.descripcion || 'Paquete',
      }],
      referencia: form.referencia || `PYA-${Date.now()}`,
    }, (res) => {
      setCreando(false);
      if (res?.ok) {
        const nuevoEnvio = {
          envioId: res.envio.envioId,
          referencia: form.referencia || `PYA-${Date.now()}`,
          destino: {
            nombre: form.destinoNombre,
            direccion: form.destinoDireccion,
            telefono: form.destinoTelefono,
          },
          status: res.envio.estado || 'CONFIRMED',
          trackingUrl: res.envio.tracking,
          rider: null,
          createdAt: new Date().toISOString(),
          precio: cotizacion?.precio || null,
        };
        saveEnvios([nuevoEnvio, ...envios]);
        setShowForm(false);
        setCotizacion(null);
        setForm({
          destinoNombre: '', destinoTelefono: '', destinoDireccion: '',
          destinoCiudad: '', destinoEmail: '', referencia: '', descripcion: '', cantidad: 1,
        });
      } else {
        alert(res?.error || 'Error al crear envio');
      }
    });
  };

  // Cancel
  const handleCancelar = (envioId) => {
    if (!confirm('Seguro que queres cancelar este envio?')) return;
    socket.emit('pedidosya-cancelar-envio', { envioId }, (res) => {
      if (res?.ok) {
        const updated = envios.map((e) => e.envioId === envioId ? { ...e, status: 'CANCELLED' } : e);
        saveEnvios(updated);
        if (selected?.envioId === envioId) setSelected({ ...selected, status: 'CANCELLED' });
      } else {
        alert(res?.error || 'Error al cancelar');
      }
    });
  };

  // Refresh single
  const refreshEnvio = (envioId) => {
    socket.emit('pedidosya-estado-envio', { envioId }, (res) => {
      if (res?.ok) {
        const updated = envios.map((e) =>
          e.envioId === envioId
            ? { ...e, status: res.envio.status, trackingUrl: res.envio.trackingUrl || e.trackingUrl, rider: res.envio.rider || e.rider }
            : e
        );
        saveEnvios(updated);
        if (selected?.envioId === envioId) {
          setSelected({ ...selected, status: res.envio.status, trackingUrl: res.envio.trackingUrl || selected.trackingUrl, rider: res.envio.rider || selected.rider });
        }
      }
    });
  };

  // Remove from list (local only)
  const removeEnvio = (envioId) => {
    saveEnvios(envios.filter((e) => e.envioId !== envioId));
    setSelected(null);
  };

  // KPIs
  const activos = envios.filter((e) => !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(e.status)).length;
  const entregados = envios.filter((e) => e.status === 'DELIVERED').length;
  const cancelados = envios.filter((e) => e.status === 'CANCELLED' || e.status === 'RETURNED').length;

  // Timeline position
  const getTimelineIdx = (status) => {
    const idx = TIMELINE_STEPS.indexOf(status);
    if (status === 'PREPARING') return 0;
    if (status === 'NEAR_DROP_OFF') return 2;
    return idx >= 0 ? idx : -1;
  };

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <h2><i className="bi bi-scooter" /> PedidosYa Envios</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.refreshBtn} onClick={refreshAll} disabled={refreshing}>
            <i className={`bi bi-arrow-clockwise ${refreshing ? 'spin' : ''}`} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
          <button className={s.nuevoBtn} onClick={() => setShowForm(true)}>
            <i className="bi bi-plus-lg" /> Nuevo envio
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className={s.kpis}>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>Total envios</span>
          <span className={s.kpiValue}>{envios.length}</span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>Activos</span>
          <span className={`${s.kpiValue} ${s.activos}`}>{activos}</span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>Entregados</span>
          <span className={`${s.kpiValue} ${s.entregados}`}>{entregados}</span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>Cancelados</span>
          <span className={`${s.kpiValue} ${s.cancelados}`}>{cancelados}</span>
        </div>
      </div>

      {/* Envios list */}
      {envios.length === 0 ? (
        <div className={s.empty}>
          <i className="bi bi-scooter" />
          <strong>No hay envios registrados</strong>
          <p>Crea tu primer envio con PedidosYa haciendo clic en "Nuevo envio"</p>
        </div>
      ) : (
        <div className={s.envios}>
          {envios.map((e) => (
            <div key={e.envioId} className={s.envioCard} onClick={() => { setSelected(e); refreshEnvio(e.envioId); }}>
              <div className={s.envioIcon}><i className="bi bi-scooter" /></div>
              <div className={s.envioInfo}>
                <div className={s.envioRef}>{e.referencia || `#${e.envioId}`}</div>
                <div className={s.envioDestino}>
                  {e.destino?.nombre} - {e.destino?.direccion}
                </div>
              </div>
              <div className={s.envioMeta}>
                <span className={s.envioFecha}>
                  {new Date(e.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`${s.badge} ${s[`badge_${e.status}`]}`}>
                  {ESTADO_LABELS[e.status] || e.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New shipment form modal */}
      {showForm && (
        <div className={s.overlay} onClick={() => setShowForm(false)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3><i className="bi bi-plus-circle" style={{ color: '#ff2449' }} /> Nuevo envio PedidosYa</h3>
              <button className={s.closeBtn} onClick={() => setShowForm(false)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className={s.modalBody}>
              <div className={s.modalSection}>
                <h4><i className="bi bi-geo-alt" /> Destino</h4>
                <div className={s.row}>
                  <div className={s.field}>
                    <label>Nombre destinatario *</label>
                    <input value={form.destinoNombre} onChange={(e) => setForm({ ...form, destinoNombre: e.target.value })} placeholder="Juan Perez" />
                  </div>
                  <div className={s.field}>
                    <label>Telefono</label>
                    <input value={form.destinoTelefono} onChange={(e) => setForm({ ...form, destinoTelefono: e.target.value })} placeholder="1155551234" />
                  </div>
                </div>
                <div className={s.field}>
                  <label>Direccion *</label>
                  <input value={form.destinoDireccion} onChange={(e) => setForm({ ...form, destinoDireccion: e.target.value })} placeholder="Av. Corrientes 1234" />
                </div>
                <div className={s.row}>
                  <div className={s.field}>
                    <label>Ciudad</label>
                    <input value={form.destinoCiudad} onChange={(e) => setForm({ ...form, destinoCiudad: e.target.value })} placeholder="CABA" />
                  </div>
                  <div className={s.field}>
                    <label>Email</label>
                    <input value={form.destinoEmail} onChange={(e) => setForm({ ...form, destinoEmail: e.target.value })} placeholder="cliente@mail.com" />
                  </div>
                </div>
              </div>

              <div className={s.modalSection}>
                <h4><i className="bi bi-box" /> Paquete</h4>
                <div className={s.row}>
                  <div className={s.field}>
                    <label>Referencia / nota</label>
                    <input value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} placeholder="Pedido #123" />
                  </div>
                  <div className={s.field}>
                    <label>Cantidad items</label>
                    <input type="number" min={1} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
                  </div>
                </div>
                <div className={s.field}>
                  <label>Descripcion</label>
                  <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Vinos, paquete, etc." />
                </div>
              </div>

              {/* Cotizacion */}
              {cotizacion && (
                <div className={s.cotizacion}>
                  <div>
                    <div className={s.cotizServicio}>{cotizacion.servicio}</div>
                    <div className={s.cotizPrecio}>{money(cotizacion.precio)}</div>
                  </div>
                  {cotizacion.entregaMin && <div className={s.cotizEta}>{cotizacion.entregaMin}</div>}
                </div>
              )}

              <div className={s.formActions}>
                <button className={s.cancelBtn} onClick={() => setShowForm(false)}>Cancelar</button>
                {!cotizacion ? (
                  <button className={s.submitBtn} onClick={handleEstimar} disabled={estimando || !form.destinoDireccion || !form.destinoNombre}>
                    {estimando ? 'Estimando...' : 'Estimar envio'}
                  </button>
                ) : (
                  <button className={s.submitBtn} onClick={handleCrear} disabled={creando}>
                    {creando ? 'Creando...' : 'Confirmar y crear envio'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className={s.overlay} onClick={() => setSelected(null)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3><i className="bi bi-scooter" style={{ color: '#ff2449' }} /> {selected.referencia || `Envio #${selected.envioId}`}</h3>
              <button className={s.closeBtn} onClick={() => setSelected(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className={s.modalBody}>
              {/* Timeline */}
              {selected.status !== 'CANCELLED' && selected.status !== 'RETURNED' && (
                <div className={s.timeline}>
                  {TIMELINE_STEPS.map((step, i) => {
                    const currentIdx = getTimelineIdx(selected.status);
                    const isDone = i < currentIdx;
                    const isActive = i === currentIdx;
                    return (
                      <div key={step} style={{ display: 'contents' }}>
                        <div className={s.timelineStep}>
                          <div className={`${s.timelineDot} ${isDone ? s.done : ''} ${isActive ? s.active : ''}`} />
                          <span className={`${s.timelineLabel} ${isDone ? s.done : ''} ${isActive ? s.active : ''}`}>
                            {ESTADO_LABELS[step]}
                          </span>
                        </div>
                        {i < TIMELINE_STEPS.length - 1 && (
                          <div className={`${s.timelineLine} ${isDone ? s.done : ''}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Estado */}
              <div className={s.modalSection}>
                <h4><i className="bi bi-flag" /> Estado</h4>
                <span className={`${s.badge} ${s[`badge_${selected.status}`]}`} style={{ fontSize: 13, padding: '5px 14px' }}>
                  {ESTADO_LABELS[selected.status] || selected.status}
                </span>
              </div>

              {/* Destino */}
              <div className={s.modalSection}>
                <h4><i className="bi bi-geo-alt" /> Destino</h4>
                <div className={s.detailGrid}>
                  <div><label>Nombre</label><span>{selected.destino?.nombre}</span></div>
                  <div><label>Telefono</label><span>{selected.destino?.telefono || '-'}</span></div>
                  <div><label>Direccion</label><span>{selected.destino?.direccion}</span></div>
                  {selected.precio && <div><label>Costo</label><span>{money(selected.precio)}</span></div>}
                </div>
              </div>

              {/* Rider */}
              {selected.rider && (
                <div className={s.modalSection}>
                  <h4><i className="bi bi-person-badge" /> Repartidor</h4>
                  <div className={s.riderCard}>
                    {selected.rider.foto && <img src={selected.rider.foto} alt="" className={s.riderFoto} />}
                    <div className={s.riderInfo}>
                      <span className={s.riderNombre}>{selected.rider.nombre}</span>
                      {selected.rider.telefono && <span className={s.riderTel}>{selected.rider.telefono}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Tracking */}
              {selected.trackingUrl && (
                <a href={selected.trackingUrl} target="_blank" rel="noreferrer" className={s.trackingLink}>
                  <i className="bi bi-geo" /> Ver seguimiento en vivo
                </a>
              )}

              {/* Actions */}
              <div className={s.detailActions}>
                <button className={s.refreshBtn} onClick={() => refreshEnvio(selected.envioId)}>
                  <i className="bi bi-arrow-clockwise" /> Actualizar
                </button>
                {!['DELIVERED', 'CANCELLED', 'RETURNED'].includes(selected.status) && (
                  <button className={s.dangerBtn} onClick={() => handleCancelar(selected.envioId)}>
                    <i className="bi bi-x-circle" /> Cancelar envio
                  </button>
                )}
                {['DELIVERED', 'CANCELLED', 'RETURNED'].includes(selected.status) && (
                  <button className={s.refreshBtn} onClick={() => removeEnvio(selected.envioId)}>
                    <i className="bi bi-trash" /> Quitar de la lista
                  </button>
                )}
              </div>

              {/* Meta */}
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ID: {selected.envioId} | Creado: {new Date(selected.createdAt).toLocaleString('es-AR')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
