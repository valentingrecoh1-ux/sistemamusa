import { useState, useEffect } from 'react';
import { socket } from '../../main';
import { dialog } from '../../components/shared/dialog';
import s from './WebClub.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

const ESTADOS_SUB = ['', 'pendiente', 'activa', 'pausada', 'cancelada'];
const ESTADO_LABELS = { '': 'Todas', pendiente: 'Pendiente', activa: 'Activa', pausada: 'Pausada', cancelada: 'Cancelada' };

const EMPTY_PLAN = { nombre: '', descripcion: '', precioMensual: '', cantidadVinos: 1, beneficios: [], activo: true, destacado: false, orden: 0 };

export default function WebClub() {
  const [activeTab, setActiveTab] = useState('planes');
  const [planes, setPlanes] = useState([]);
  const [suscripciones, setSuscripciones] = useState([]);
  const [estadoFilter, setEstadoFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modal plan
  const [editPlan, setEditPlan] = useState(null);
  const [beneficioInput, setBeneficioInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    socket.on('response-planes-club', setPlanes);
    socket.on('response-suscripciones-club', setSuscripciones);
    socket.emit('request-planes-club');
    socket.emit('request-suscripciones-club');
    return () => {
      socket.off('response-planes-club', setPlanes);
      socket.off('response-suscripciones-club', setSuscripciones);
    };
  }, []);

  const fetchSubs = (params = {}) => {
    socket.emit('request-suscripciones-club', {
      estado: params.estado ?? estadoFilter,
      search: params.search ?? search,
    });
  };

  const handleSavePlan = () => {
    if (!editPlan.nombre || !editPlan.precioMensual) return;
    setSaving(true);
    socket.emit('save-plan-club', {
      ...editPlan,
      precioMensual: Number(editPlan.precioMensual),
      cantidadVinos: Number(editPlan.cantidadVinos),
      orden: Number(editPlan.orden || 0),
    }, () => {
      setSaving(false);
      setEditPlan(null);
    });
  };

  const handleDeletePlan = async (id) => {
    if (!await dialog.confirm('Eliminar este plan?')) return;
    socket.emit('delete-plan-club', id);
  };

  const handleAddBeneficio = () => {
    if (!beneficioInput.trim()) return;
    setEditPlan({ ...editPlan, beneficios: [...(editPlan.beneficios || []), beneficioInput.trim()] });
    setBeneficioInput('');
  };

  const handleRemoveBeneficio = (i) => {
    setEditPlan({ ...editPlan, beneficios: editPlan.beneficios.filter((_, idx) => idx !== i) });
  };

  const handleEstadoSub = (id, estado) => {
    socket.emit('update-estado-suscripcion', { id, estado });
  };

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h2>Club de Vinos</h2>
        <div className={s.tabs}>
          <button className={`${s.tab} ${activeTab === 'planes' ? s.tabActive : ''}`} onClick={() => setActiveTab('planes')}>
            <i className="bi bi-grid" /> Planes
          </button>
          <button className={`${s.tab} ${activeTab === 'suscripciones' ? s.tabActive : ''}`} onClick={() => setActiveTab('suscripciones')}>
            <i className="bi bi-people" /> Suscripciones ({suscripciones.length})
          </button>
        </div>
      </div>

      {/* ── Tab Planes ── */}
      {activeTab === 'planes' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className={s.addBtn} onClick={() => { setEditPlan({ ...EMPTY_PLAN }); setBeneficioInput(''); }}>
              <i className="bi bi-plus-lg" /> Nuevo Plan
            </button>
          </div>

          {planes.length === 0 ? (
            <div className={s.empty}>No hay planes creados. Crea el primer plan del club.</div>
          ) : (
            <div className={s.planesGrid}>
              {planes.map((p) => (
                <div key={p._id} className={`${s.planCard} ${p.destacado ? s.planCardDestacado : ''} ${!p.activo ? s.planInactivo : ''}`}>
                  {p.destacado && <span className={s.planBadge}>Destacado</span>}
                  <div className={s.planName}>{p.nombre}</div>
                  <div className={s.planMeta}>
                    <span className={s.planPrice}>{money(p.precioMensual)}/mes</span>
                    <span><i className="bi bi-box-seam" /> {p.cantidadVinos} vinos</span>
                  </div>
                  {p.descripcion && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.descripcion}</div>}
                  {p.beneficios?.length > 0 && (
                    <div className={s.planBeneficios}>
                      {p.beneficios.map((b, i) => <span key={i} className={s.planBeneficio}>{b}</span>)}
                    </div>
                  )}
                  {!p.activo && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Inactivo</div>}
                  <div className={s.planActions}>
                    <button onClick={() => { setEditPlan({ ...p }); setBeneficioInput(''); }}>
                      <i className="bi bi-pencil" /> Editar
                    </button>
                    <button onClick={() => handleDeletePlan(p._id)}>
                      <i className="bi bi-trash" /> Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tab Suscripciones ── */}
      {activeTab === 'suscripciones' && (
        <>
          <div className={s.toolbar}>
            <div className={s.filterTabs}>
              {ESTADOS_SUB.map((e) => (
                <button
                  key={e}
                  className={`${s.tab} ${estadoFilter === e ? s.tabActive : ''}`}
                  onClick={() => { setEstadoFilter(e); fetchSubs({ estado: e }); }}
                >
                  {ESTADO_LABELS[e]}
                </button>
              ))}
            </div>
            <div className={s.searchWrap}>
              <i className="bi bi-search" />
              <input
                className={s.searchInput}
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); fetchSubs({ search: e.target.value }); }}
              />
            </div>
          </div>

          {suscripciones.length === 0 ? (
            <div className={s.empty}>No hay suscripciones registradas.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Email</th>
                    <th>Telefono</th>
                    <th>Plan</th>
                    <th>Precio</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {suscripciones.map((sub) => (
                    <tr key={sub._id}>
                      <td>{sub.cliente?.nombre}</td>
                      <td>{sub.cliente?.email}</td>
                      <td>{sub.cliente?.telefono}</td>
                      <td>{sub.planNombre}</td>
                      <td>{money(sub.precioMensual)}</td>
                      <td>
                        <span className={`${s.badge} ${s[`badge${sub.estado?.charAt(0).toUpperCase()}${sub.estado?.slice(1)}`]}`}>
                          {sub.estado}
                        </span>
                      </td>
                      <td>{sub.createdAt ? new Date(sub.createdAt).toLocaleDateString('es-AR') : '-'}</td>
                      <td>
                        <div className={s.estadoBtns}>
                          {sub.estado === 'pendiente' && (
                            <button className={s.estadoBtn} onClick={() => handleEstadoSub(sub._id, 'activa')}>Activar</button>
                          )}
                          {sub.estado === 'activa' && (
                            <button className={s.estadoBtn} onClick={() => handleEstadoSub(sub._id, 'pausada')}>Pausar</button>
                          )}
                          {sub.estado === 'pausada' && (
                            <button className={s.estadoBtn} onClick={() => handleEstadoSub(sub._id, 'activa')}>Reactivar</button>
                          )}
                          {sub.estado !== 'cancelada' && (
                            <button className={s.estadoBtn} onClick={() => handleEstadoSub(sub._id, 'cancelada')}>Cancelar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Modal Editar/Crear Plan ── */}
      {editPlan && (
        <div className={s.modalOverlay} onClick={(e) => e.target === e.currentTarget && setEditPlan(null)}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>{editPlan._id ? 'Editar Plan' : 'Nuevo Plan'}</h3>
              <button className={s.modalClose} onClick={() => setEditPlan(null)}><i className="bi bi-x-lg" /></button>
            </div>

            <div className={s.field}>
              <label>Nombre del plan *</label>
              <input value={editPlan.nombre} onChange={(e) => setEditPlan({ ...editPlan, nombre: e.target.value })} placeholder="Ej: Plan Clasico" />
            </div>

            <div className={s.row}>
              <div className={s.field}>
                <label>Precio mensual *</label>
                <input type="number" value={editPlan.precioMensual} onChange={(e) => setEditPlan({ ...editPlan, precioMensual: e.target.value })} min={0} />
              </div>
              <div className={s.field}>
                <label>Cantidad de vinos</label>
                <input type="number" value={editPlan.cantidadVinos} onChange={(e) => setEditPlan({ ...editPlan, cantidadVinos: e.target.value })} min={1} />
              </div>
            </div>

            <div className={s.field}>
              <label>Descripcion</label>
              <textarea value={editPlan.descripcion} onChange={(e) => setEditPlan({ ...editPlan, descripcion: e.target.value })} rows={2} placeholder="Descripcion breve del plan" />
            </div>

            <div className={s.field}>
              <label>Beneficios</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={beneficioInput}
                  onChange={(e) => setBeneficioInput(e.target.value)}
                  placeholder="Agregar beneficio..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBeneficio())}
                  style={{ flex: 1 }}
                />
                <button className={s.addBtn} onClick={handleAddBeneficio} style={{ padding: '8px 12px' }}>
                  <i className="bi bi-plus" />
                </button>
              </div>
              {editPlan.beneficios?.length > 0 && (
                <div className={s.planBeneficios} style={{ marginTop: 8 }}>
                  {editPlan.beneficios.map((b, i) => (
                    <span key={i} className={s.planBeneficio} style={{ cursor: 'pointer' }} onClick={() => handleRemoveBeneficio(i)}>
                      {b} <i className="bi bi-x" />
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className={s.row}>
              <div className={s.field}>
                <label>Orden (para ordenar en la web)</label>
                <input type="number" value={editPlan.orden} onChange={(e) => setEditPlan({ ...editPlan, orden: e.target.value })} min={0} />
              </div>
            </div>

            <div className={s.toggleRow}>
              <label className={s.toggle}>
                <input type="checkbox" checked={editPlan.activo} onChange={(e) => setEditPlan({ ...editPlan, activo: e.target.checked })} />
                <span>Activo</span>
                <div className={s.toggleTrack} />
              </label>
              <label className={s.toggle}>
                <input type="checkbox" checked={editPlan.destacado} onChange={(e) => setEditPlan({ ...editPlan, destacado: e.target.checked })} />
                <span>Destacado</span>
                <div className={s.toggleTrack} />
              </label>
            </div>

            <button className={s.saveBtn} onClick={handleSavePlan} disabled={saving || !editPlan.nombre || !editPlan.precioMensual}>
              {saving ? 'Guardando...' : editPlan._id ? 'Guardar Cambios' : 'Crear Plan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
