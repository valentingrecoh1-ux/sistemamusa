import { useState, useEffect, useCallback } from 'react';
import { socket } from '../main';
import { IP } from '../main';
import Pagination from '../components/shared/Pagination';
import Modal from '../components/shared/Modal';
import { dialog } from '../components/shared/dialog';
import { fetchClienteToken } from '../lib/tiendaApi';
import s from './Clientes.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);
const EMPTY = { nombre: '', apellido: '', dni: '', whatsapp: '', email: '', telefono: '', cuit: '', razonSocial: '', domicilio: '', localidad: '', provincia: '', notas: '', tags: [] };

const NIVEL_COLORS = { Nuevo: '#94a3b8', Curioso: '#60a5fa', Explorador: '#34d399', Conocedor: '#f59e0b', Sommelier: '#a78bfa', Maestro: '#f43f5e' };
const NIVEL_PROGRESS = [0, 3, 10, 25, 50, 75];

const PREMIO_ICONS = { descuento: 'bi-percent', vino_gratis: 'bi-cup-straw', degustacion_gratis: 'bi-people' };
const PREMIO_COLORS = { descuento: '#3b82f6', vino_gratis: '#8b5cf6', degustacion_gratis: '#ec4899' };
const PREMIO_LABELS = { descuento: 'Descuento', vino_gratis: 'Vino gratis', degustacion_gratis: 'Degustacion gratis' };

const Stars = ({ value, onChange, size = 18 }) => (
  <div className={s.stars}>
    {[1, 2, 3, 4, 5].map((n) => (
      <i
        key={n}
        className={`bi ${n <= value ? 'bi-star-fill' : 'bi-star'}`}
        style={{ fontSize: size, color: n <= value ? '#f59e0b' : 'var(--text-muted)', cursor: onChange ? 'pointer' : 'default' }}
        onClick={() => onChange?.(n)}
      />
    ))}
  </div>
);

export default function Clientes({ usuario }) {
  const [clientes, setClientes] = useState([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [perfil, setPerfil] = useState(null);
  const [perfilTab, setPerfilTab] = useState('resumen');
  const [tagInput, setTagInput] = useState('');
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [vinoDetalle, setVinoDetalle] = useState(null);
  const [valoracionForm, setValoracionForm] = useState({ puntuacion: 0, notas: '', publica: false });
  const [cepaFilter, setCepaFilter] = useState('');
  const [resenasProducto, setResenasProducto] = useState([]);
  const [qrLink, setQrLink] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  useEffect(() => {
    const onClientes = (data) => {
      setClientes(data.clientes || []);
      setTotalPages(data.totalPages || 1);
    };
    const onCambios = () => socket.emit('request-clientes', { page, search });

    socket.on('response-clientes', onClientes);
    socket.on('cambios-clientes', onCambios);
    socket.emit('request-clientes', { page, search });

    return () => {
      socket.off('response-clientes', onClientes);
      socket.off('cambios-clientes', onCambios);
    };
  }, []);

  useEffect(() => {
    socket.emit('request-clientes', { page, search });
  }, [page, search]);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = () => {
    if (!form.nombre.trim()) return;
    const payload = editId ? { ...form, _id: editId } : { ...form };
    socket.emit('guardar-cliente', payload);
    setForm({ ...EMPTY });
    setEditId(null);
    setTagInput('');
    setShowMoreFields(false);
  };

  const handleEdit = (c) => {
    setForm({
      nombre: c.nombre || '', apellido: c.apellido || '', dni: c.dni || '', whatsapp: c.whatsapp || '',
      email: c.email || '', telefono: c.telefono || '', cuit: c.cuit || '', razonSocial: c.razonSocial || '',
      domicilio: c.domicilio || '', localidad: c.localidad || '', provincia: c.provincia || '', notas: c.notas || '', tags: c.tags || [],
    });
    setEditId(c._id);
    setShowMoreFields(true);
  };

  const handleCancel = () => {
    setForm({ ...EMPTY });
    setEditId(null);
    setTagInput('');
    setShowMoreFields(false);
  };

  const handleDelete = async (id) => {
    if (!await dialog.confirm('Eliminar este cliente?')) return;
    socket.emit('borrar-cliente', id);
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || form.tags.includes(tag)) return;
    setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    setTagInput('');
  };

  const removeTag = (tag) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  const openPerfil = useCallback((c) => {
    setPerfil({ loading: true, cliente: c });
    setPerfilTab('resumen');
    setQrLink('');
    socket.emit('request-cliente-perfil', c._id);
    const handler = (data) => {
      setPerfil(data ? { ...data, loading: false } : null);
      socket.off('response-cliente-perfil', handler);
    };
    socket.on('response-cliente-perfil', handler);
  }, []);

  const openVinoDetalle = (vino) => {
    setVinoDetalle(vino);
    const existing = perfil?.valoracionMap?.[String(vino._id)];
    setValoracionForm({
      puntuacion: existing?.puntuacion || 0,
      notas: existing?.notas || '',
      publica: existing?.publica || false,
    });
    // Cargar reseñas públicas de este vino
    socket.emit('request-valoraciones-producto', vino._id);
    const handler = (data) => {
      setResenasProducto(data || []);
      socket.off('response-valoraciones-producto', handler);
    };
    socket.on('response-valoraciones-producto', handler);
  };

  const generarQrLink = async (clienteId) => {
    setQrLoading(true);
    setQrLink('');
    try {
      const res = await fetchClienteToken(clienteId);
      if (res.token) {
        const origin = window.location.origin;
        setQrLink(`${origin}/tienda/mi-perfil/${res.token}`);
      }
    } catch {
      // silent
    }
    setQrLoading(false);
  };

  const copiarQrLink = () => {
    if (qrLink) {
      navigator.clipboard.writeText(qrLink);
      dialog.alert('Link copiado al portapapeles!');
    }
  };

  const guardarValoracion = () => {
    if (!vinoDetalle || !perfil?.cliente?._id) return;
    socket.emit('guardar-valoracion-vino', {
      clienteId: perfil.cliente._id,
      productoId: vinoDetalle._id,
      ...valoracionForm,
    }, (res) => {
      if (res?.ok) {
        // Refrescar perfil
        openPerfil(perfil.cliente);
        setVinoDetalle(null);
      }
    });
  };

  return (
    <div className={s.container}>
      {/* Left: Form */}
      <div className={s.formCard}>
        <h3 className={s.formTitle}>{editId ? 'Editar Cliente' : 'Registrar Cliente'}</h3>

        <div className={s.row2}>
          <div className={s.inputGroup}>
            <span>Nombre *</span>
            <input type="text" value={form.nombre} onChange={(e) => handleChange('nombre', e.target.value)} placeholder="Nombre" />
          </div>
          <div className={s.inputGroup}>
            <span>Apellido</span>
            <input type="text" value={form.apellido} onChange={(e) => handleChange('apellido', e.target.value)} placeholder="Apellido" />
          </div>
        </div>

        <div className={s.row2}>
          <div className={s.inputGroup}>
            <span>WhatsApp</span>
            <input type="tel" value={form.whatsapp} onChange={(e) => handleChange('whatsapp', e.target.value)} placeholder="+54 11 1234-5678" />
          </div>
          <div className={s.inputGroup}>
            <span>DNI</span>
            <input type="text" value={form.dni} onChange={(e) => handleChange('dni', e.target.value)} placeholder="12345678" />
          </div>
        </div>

        {showMoreFields ? (
          <>
            <div className={s.row2}>
              <div className={s.inputGroup}>
                <span>Email</span>
                <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="email@ejemplo.com" />
              </div>
              <div className={s.inputGroup}>
                <span>Telefono</span>
                <input type="tel" value={form.telefono} onChange={(e) => handleChange('telefono', e.target.value)} placeholder="+54 11 1234-5678" />
              </div>
            </div>

            <div className={s.row2}>
              <div className={s.inputGroup}>
                <span>CUIT</span>
                <input type="text" value={form.cuit} onChange={(e) => handleChange('cuit', e.target.value)} placeholder="20-12345678-9" />
              </div>
              <div className={s.inputGroup}>
                <span>Razon Social</span>
                <input type="text" value={form.razonSocial} onChange={(e) => handleChange('razonSocial', e.target.value)} placeholder="Razon social" />
              </div>
            </div>

            <div className={s.row2}>
              <div className={s.inputGroup}>
                <span>Domicilio</span>
                <input type="text" value={form.domicilio} onChange={(e) => handleChange('domicilio', e.target.value)} placeholder="Calle 123" />
              </div>
              <div className={s.inputGroup}>
                <span>Localidad</span>
                <input type="text" value={form.localidad} onChange={(e) => handleChange('localidad', e.target.value)} placeholder="Localidad" />
              </div>
            </div>

            <div className={s.inputGroup}>
              <span>Notas</span>
              <textarea value={form.notas} onChange={(e) => handleChange('notas', e.target.value)} placeholder="Notas internas..." rows={2} />
            </div>

            <div className={s.inputGroup}>
              <span>Tags</span>
              <div className={s.tagRow}>
                <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Agregar tag..." onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} />
                <button type="button" className={s.tagAddBtn} onClick={addTag}>+</button>
              </div>
              {form.tags.length > 0 && (
                <div className={s.tags}>
                  {form.tags.map((t) => (
                    <span key={t} className={s.tag}>{t} <button onClick={() => removeTag(t)}>&times;</button></span>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <button className={s.moreFieldsBtn} onClick={() => setShowMoreFields(true)}>
            <i className="bi bi-plus-circle" /> Mas campos
          </button>
        )}

        <div className={s.btnRow}>
          <button className={s.submitBtn} onClick={handleSubmit}>{editId ? 'Actualizar' : 'Registrar'}</button>
          {editId && <button className={s.cancelBtn} onClick={handleCancel}>Cancelar</button>}
        </div>
      </div>

      {/* Right: Table */}
      <div className={s.tableSection}>
        <div className={s.toolbar}>
          <input
            className={s.searchInput}
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Pagination className={s.paginationDock} page={page} totalPages={totalPages} onChange={setPage} />
        </div>

        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>WhatsApp</th>
                <th>DNI</th>
                <th>Tags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 ? (
                <tr className={s.emptyRow}><td colSpan={5}>Sin clientes</td></tr>
              ) : clientes.map((c) => (
                <tr key={c._id} className={s.clickableRow} onClick={() => openPerfil(c)}>
                  <td>
                    <div className={s.clienteName}>
                      {c.nombre}{c.apellido ? ` ${c.apellido}` : ''}
                      {c.autoRegistro && <span className={s.autoRegistroBadge}>Auto-registro</span>}
                    </div>
                    {c.razonSocial && <div className={s.clienteSub}>{c.razonSocial}</div>}
                  </td>
                  <td>
                    {c.whatsapp ? (
                      <div className={s.contactLine}><i className="bi bi-whatsapp" /> {c.whatsapp}</div>
                    ) : c.telefono ? (
                      <div className={s.contactLine}><i className="bi bi-telephone" /> {c.telefono}</div>
                    ) : <span className={s.muted}>-</span>}
                  </td>
                  <td><span className={s.mono}>{c.dni || '-'}</span></td>
                  <td>
                    {(c.tags || []).length > 0 ? (
                      <div className={s.tagsInline}>{c.tags.map((t) => <span key={t} className={s.tagSmall}>{t}</span>)}</div>
                    ) : <span className={s.muted}>-</span>}
                  </td>
                  <td>
                    <div className={s.actions} onClick={(e) => e.stopPropagation()}>
                      <button className={s.editBtn} onClick={() => handleEdit(c)} title="Editar"><i className="bi bi-pencil" /></button>
                      <button className={s.deleteBtn} onClick={() => handleDelete(c._id)} title="Eliminar"><i className="bi bi-trash" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Perfil Modal ── */}
      {perfil && (
        <Modal title={`${perfil.cliente?.nombre || ''}${perfil.cliente?.apellido ? ' ' + perfil.cliente.apellido : ''}`} onClose={() => { setPerfil(null); setVinoDetalle(null); }} wide>
          {perfil.loading ? (
            <div className={s.loadingModal}>Cargando perfil...</div>
          ) : (
            <div className={s.perfilBody}>
              {/* Header: Nivel + KPIs */}
              <div className={s.perfilHeader}>
                <div className={s.nivelBadge} style={{ background: NIVEL_COLORS[perfil.nivel] || '#94a3b8' }}>
                  <span className={s.nivelNum}>Nv.{perfil.nivelNum}</span>
                  <span className={s.nivelNombre}>{perfil.nivel}</span>
                </div>
                <div className={s.perfilKpis}>
                  <div className={s.kpiMini}><span className={s.kpiMiniVal}>{perfil.metricas?.cantCompras || 0}</span><span className={s.kpiMiniLabel}>Compras</span></div>
                  <div className={s.kpiMini}><span className={s.kpiMiniVal}>{perfil.metricas?.vinosUnicos || 0}</span><span className={s.kpiMiniLabel}>Vinos</span></div>
                  <div className={s.kpiMini}><span className={s.kpiMiniVal}>{money(perfil.metricas?.totalGastado)}</span><span className={s.kpiMiniLabel}>Total</span></div>
                  <div className={s.kpiMini}><span className={s.kpiMiniVal}>{perfil.preferencias?.cepasProbadas || 0}/{perfil.preferencias?.totalCepas || 0}</span><span className={s.kpiMiniLabel}>Cepas</span></div>
                </div>
                {perfil.preferencias?.cepaFavorita && (
                  <div className={s.prefChips}>
                    <span className={s.prefChip}><i className="bi bi-heart-fill" /> {perfil.preferencias.cepaFavorita}</span>
                    {perfil.preferencias?.bodegaFavorita && <span className={s.prefChip}><i className="bi bi-building" /> {perfil.preferencias.bodegaFavorita}</span>}
                  </div>
                )}
              </div>

              {/* QR Link */}
              <div className={s.qrSection}>
                {!qrLink ? (
                  <button className={s.qrBtn} onClick={() => generarQrLink(perfil.cliente?._id)} disabled={qrLoading}>
                    <i className="bi bi-qr-code" /> {qrLoading ? 'Generando...' : 'Generar link de perfil publico'}
                  </button>
                ) : (
                  <div className={s.qrResult}>
                    <span className={s.qrLabel}><i className="bi bi-link-45deg" /> Link publico del cliente:</span>
                    <div className={s.qrLinkRow}>
                      <input className={s.qrLinkInput} value={qrLink} readOnly onClick={(e) => e.target.select()} />
                      <button className={s.qrCopyBtn} onClick={copiarQrLink}><i className="bi bi-clipboard" /> Copiar</button>
                    </div>
                    <span className={s.qrHint}>El cliente puede acceder desde este link o escaneando un QR con esta URL</span>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className={s.tabs}>
                {[
                  { key: 'resumen', label: 'Resumen', icon: 'bi-person' },
                  { key: 'historial', label: 'Historial', icon: 'bi-clock-history' },
                  { key: 'coleccion', label: 'Coleccion', icon: 'bi-collection' },
                  { key: 'logros', label: 'Logros', icon: 'bi-trophy' },
                  { key: 'premios', label: 'Premios', icon: 'bi-gift' },
                  { key: 'catalogo', label: 'Catalogo', icon: 'bi-grid-3x3-gap' },
                ].map((t) => (
                  <button key={t.key} className={`${s.tab} ${perfilTab === t.key ? s.tabActive : ''}`} onClick={() => setPerfilTab(t.key)}>
                    <i className={`bi ${t.icon}`} /> {t.label}
                  </button>
                ))}
              </div>

              {/* Tab: Resumen */}
              {perfilTab === 'resumen' && (
                <div className={s.tabContent}>
                  <div className={s.infoGrid}>
                    {perfil.cliente?.whatsapp && <div><span className={s.infoLabel}>WhatsApp</span><span>{perfil.cliente.whatsapp}</span></div>}
                    {perfil.cliente?.dni && <div><span className={s.infoLabel}>DNI</span><span>{perfil.cliente.dni}</span></div>}
                    {perfil.cliente?.email && <div><span className={s.infoLabel}>Email</span><span>{perfil.cliente.email}</span></div>}
                    {perfil.cliente?.cuit && <div><span className={s.infoLabel}>CUIT</span><span>{perfil.cliente.cuit}</span></div>}
                    {perfil.cliente?.domicilio && <div><span className={s.infoLabel}>Domicilio</span><span>{perfil.cliente.domicilio} {perfil.cliente.localidad} {perfil.cliente.provincia}</span></div>}
                    {perfil.cliente?.notas && <div><span className={s.infoLabel}>Notas</span><span>{perfil.cliente.notas}</span></div>}
                  </div>

                  {/* Nivel progress */}
                  <div className={s.nivelProgress}>
                    <div className={s.nivelProgressLabel}>
                      Progreso al siguiente nivel
                      {perfil.nivelNum < 5 && (
                        <span className={s.nivelNextInfo}>
                          {perfil.metricas?.cantCompras}/{NIVEL_PROGRESS[perfil.nivelNum + 1]} compras
                        </span>
                      )}
                    </div>
                    <div className={s.progressBar}>
                      <div
                        className={s.progressFill}
                        style={{
                          width: perfil.nivelNum >= 5 ? '100%' : `${Math.min(100, (perfil.metricas?.cantCompras / NIVEL_PROGRESS[perfil.nivelNum + 1]) * 100)}%`,
                          background: NIVEL_COLORS[perfil.nivel],
                        }}
                      />
                    </div>
                  </div>

                  {/* Quick logros preview */}
                  {(perfil.logros || []).length > 0 && (
                    <div className={s.logrosPreview}>
                      <span className={s.logrosPreviewLabel}>Logros ({perfil.logros.length})</span>
                      <div className={s.logrosPreviewIcons}>
                        {perfil.logros.slice(0, 8).map((l) => (
                          <span key={l.id} className={s.logroMini} title={l.nombre}><i className={`bi ${l.icono}`} /></span>
                        ))}
                        {perfil.logros.length > 8 && <span className={s.logroMore}>+{perfil.logros.length - 8}</span>}
                      </div>
                    </div>
                  )}

                  {/* Últimas compras */}
                  {(perfil.historial || []).length > 0 && (
                    <div className={s.detalleSection}>
                      <h4>Ultimas compras</h4>
                      <div className={s.detalleList}>
                        {perfil.historial.slice(0, 5).map((h, i) => (
                          <div key={i} className={s.detalleItem}>
                            <span>{h.nombre}</span>
                            <span className={s.detalleCepa}>{h.cepa || ''}</span>
                            <span>{h.fecha ? new Date(h.fecha).toLocaleDateString('es-AR') : ''}</span>
                            <span className={s.detalleCant}>x{h.cantidad}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Historial */}
              {perfilTab === 'historial' && (
                <div className={s.tabContent}>
                  {(perfil.historial || []).length === 0 ? (
                    <div className={s.emptyDetalle}>Sin compras registradas aun.</div>
                  ) : (
                    <div className={s.detalleSection}>
                      <h4>Historial de compras ({perfil.historial.length})</h4>
                      <div className={s.detalleList}>
                        {perfil.historial.map((h, i) => (
                          <div key={i} className={s.historialRow}>
                            <div className={s.historialInfo}>
                              <span className={s.historialNombre}>{h.nombre}</span>
                              <span className={s.historialMeta}>{h.bodega} {h.cepa ? `- ${h.cepa}` : ''}</span>
                            </div>
                            <span className={s.historialFecha}>{h.fecha ? new Date(h.fecha).toLocaleDateString('es-AR') : ''}</span>
                            <span className={s.detalleCant}>x{h.cantidad}</span>
                            {perfil.valoracionMap?.[String(h.productoId)] ? (
                              <Stars value={perfil.valoracionMap[String(h.productoId)].puntuacion} size={13} />
                            ) : (
                              <span className={s.sinValorar}>Sin valorar</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Coleccion de cepas */}
              {perfilTab === 'coleccion' && (
                <div className={s.tabContent}>
                  <div className={s.coleccionHeader}>
                    <h4>Coleccion de Cepas</h4>
                    <span className={s.coleccionProgress}>
                      {perfil.coleccionCepas?.filter((c) => c.probada).length || 0} / {perfil.coleccionCepas?.length || 0} probadas
                    </span>
                  </div>
                  <div className={s.cepaGrid}>
                    {(perfil.coleccionCepas || []).map((c) => (
                      <div key={c.cepa} className={`${s.cepaCard} ${c.probada ? s.cepaProbada : s.cepaNoProbada}`}>
                        <div className={s.cepaIcon}>
                          <i className={`bi ${c.probada ? 'bi-check-circle-fill' : 'bi-circle'}`} />
                        </div>
                        <div className={s.cepaInfo}>
                          <span className={s.cepaNombre}>{c.cepa}</span>
                          <span className={s.cepaCount}>
                            {c.probada ? `${c.vinosProbados} probado${c.vinosProbados !== 1 ? 's' : ''}` : `${c.vinosDisponibles} disponible${c.vinosDisponibles !== 1 ? 's' : ''}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(perfil.coleccionCepas || []).length === 0 && (
                    <div className={s.emptyDetalle}>No hay cepas en el catalogo aun.</div>
                  )}
                </div>
              )}

              {/* Tab: Logros */}
              {perfilTab === 'logros' && (
                <div className={s.tabContent}>
                  <h4>Logros desbloqueados ({perfil.logros?.length || 0})</h4>
                  <div className={s.logrosGrid}>
                    {(perfil.todosLogros || []).map((l) => (
                      <div key={l.id} className={`${s.logroCard} ${l.req ? s.logroDesbloqueado : s.logroBloqueado}`}>
                        <div className={s.logroIcon}><i className={`bi ${l.icono}`} /></div>
                        <div className={s.logroInfo}>
                          <span className={s.logroNombre}>{l.nombre}</span>
                          <span className={s.logroDesc}>{l.desc}</span>
                          {l.premio && (
                            <span className={s.logroPremioChip} style={{ color: PREMIO_COLORS[l.premio.tipo] || '#3b82f6' }}>
                              <i className={`bi ${PREMIO_ICONS[l.premio.tipo] || 'bi-gift'}`} /> {l.premio.descripcion}
                            </span>
                          )}
                        </div>
                        {l.req && <i className="bi bi-check-circle-fill" style={{ color: '#34d399' }} />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Premios */}
              {perfilTab === 'premios' && (
                <div className={s.tabContent}>
                  {(() => {
                    const premiosGanados = (perfil.logros || []).filter((l) => l.premio);
                    const premiosPendientes = (perfil.todosLogros || []).filter((l) => !l.req && l.premio);
                    return (
                      <>
                        <h4>Premios disponibles ({premiosGanados.length})</h4>
                        {premiosGanados.length === 0 ? (
                          <div className={s.emptyDetalle}>Aun no desbloqueaste premios. Segui comprando para ganar recompensas!</div>
                        ) : (
                          <div className={s.premiosGrid}>
                            {premiosGanados.map((l) => (
                              <div key={l.id} className={s.premioCard}>
                                <div className={s.premioIconWrap} style={{ background: `${PREMIO_COLORS[l.premio.tipo]}18`, color: PREMIO_COLORS[l.premio.tipo] }}>
                                  <i className={`bi ${PREMIO_ICONS[l.premio.tipo] || 'bi-gift'}`} />
                                </div>
                                <div className={s.premioInfo}>
                                  <span className={s.premioTipo} style={{ color: PREMIO_COLORS[l.premio.tipo] }}>{PREMIO_LABELS[l.premio.tipo] || 'Premio'}</span>
                                  <span className={s.premioDesc}>{l.premio.descripcion}</span>
                                  <span className={s.premioOrigen}>Por: {l.nombre}</span>
                                </div>
                                <i className="bi bi-check-circle-fill" style={{ color: '#34d399', fontSize: 18 }} />
                              </div>
                            ))}
                          </div>
                        )}

                        {premiosPendientes.length > 0 && (
                          <>
                            <h4 style={{ marginTop: 8 }}>Proximos premios</h4>
                            <div className={s.premiosGrid}>
                              {premiosPendientes.map((l) => (
                                <div key={l.id} className={`${s.premioCard} ${s.premioPendiente}`}>
                                  <div className={s.premioIconWrap} style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                                    <i className={`bi ${PREMIO_ICONS[l.premio.tipo] || 'bi-gift'}`} />
                                  </div>
                                  <div className={s.premioInfo}>
                                    <span className={s.premioTipo} style={{ color: 'var(--text-muted)' }}>{PREMIO_LABELS[l.premio.tipo] || 'Premio'}</span>
                                    <span className={s.premioDesc}>{l.premio.descripcion}</span>
                                    <span className={s.premioOrigen}><i className="bi bi-lock" /> {l.nombre} - {l.desc}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Tab: Catalogo de vinos */}
              {perfilTab === 'catalogo' && (
                <div className={s.tabContent}>
                  <div className={s.catalogoHeader}>
                    <h4>Catalogo de Vinos</h4>
                    <select className={s.cepaSelect} value={cepaFilter} onChange={(e) => setCepaFilter(e.target.value)}>
                      <option value="">Todas las cepas</option>
                      {[...new Set((perfil.todosVinos || []).map((v) => v.cepa).filter(Boolean))].sort().map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className={s.vinoGrid}>
                    {(perfil.todosVinos || [])
                      .filter((v) => !cepaFilter || v.cepa === cepaFilter)
                      .map((v) => (
                        <div key={v._id} className={`${s.vinoCard} ${v.probado ? s.vinoProbado : ''}`} onClick={() => openVinoDetalle(v)}>
                          {v.fotoUrl ? (
                            <img src={v.fotoUrl} alt="" className={s.vinoImg} loading="lazy" />
                          ) : (
                            <div className={s.vinoImgPlaceholder}><i className="bi bi-cup-straw" /></div>
                          )}
                          <div className={s.vinoInfo}>
                            <span className={s.vinoNombre}>{v.nombre}</span>
                            <span className={s.vinoMeta}>{v.bodega} {v.cepa ? `- ${v.cepa}` : ''}</span>
                            {v.rating && (
                              <div className={s.vinoRating}>
                                <i className="bi bi-star-fill" style={{ color: '#f59e0b', fontSize: 11 }} /> {v.rating.promedio} ({v.rating.cantidad})
                              </div>
                            )}
                          </div>
                          {v.probado && <span className={s.vinoProbadoBadge}><i className="bi bi-check" /></span>}
                          {v.miValoracion && (
                            <div className={s.vinoMiNota}><Stars value={v.miValoracion.puntuacion} size={10} /></div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* ── Vino Detalle Modal ── */}
      {vinoDetalle && (
        <Modal title={vinoDetalle.nombre} onClose={() => setVinoDetalle(null)}>
          <div className={s.vinoDetalleBody}>
            <div className={s.vinoDetalleHeader}>
              {vinoDetalle.fotoUrl ? (
                <img src={vinoDetalle.fotoUrl} alt="" className={s.vinoDetalleImg} loading="lazy" />
              ) : (
                <div className={s.vinoDetalleImgPlaceholder}><i className="bi bi-cup-straw" /></div>
              )}
              <div>
                <div className={s.vinoDetalleNombre}>{vinoDetalle.nombre}</div>
                <div className={s.vinoDetalleMeta}>{vinoDetalle.bodega} {vinoDetalle.cepa ? `- ${vinoDetalle.cepa}` : ''}</div>
                {vinoDetalle.probado && <span className={s.tagSmall} style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>Probado</span>}
                {vinoDetalle.rating && (
                  <div className={s.vinoRating} style={{ marginTop: 4 }}>
                    <i className="bi bi-star-fill" style={{ color: '#f59e0b' }} /> {vinoDetalle.rating.promedio} ({vinoDetalle.rating.cantidad} {vinoDetalle.rating.cantidad === 1 ? 'valoracion' : 'valoraciones'})
                  </div>
                )}
              </div>
            </div>

            {/* Mi valoración */}
            <div className={s.valoracionSection}>
              <h4>Mi valoracion</h4>
              <Stars value={valoracionForm.puntuacion} onChange={(n) => setValoracionForm((p) => ({ ...p, puntuacion: n }))} size={24} />
              <textarea
                className={s.valoracionTextarea}
                value={valoracionForm.notas}
                onChange={(e) => setValoracionForm((p) => ({ ...p, notas: e.target.value }))}
                placeholder="Que sentiste con este vino? Aromas, sabores, maridaje..."
                rows={3}
              />
              <label className={s.publicaLabel}>
                <input type="checkbox" checked={valoracionForm.publica} onChange={(e) => setValoracionForm((p) => ({ ...p, publica: e.target.checked }))} />
                Compartir con otros clientes
              </label>
              <button className={s.submitBtn} onClick={guardarValoracion} style={{ marginTop: 8 }}>Guardar Valoracion</button>
            </div>

            {/* Reseñas públicas */}
            {resenasProducto.length > 0 && (
              <div className={s.detalleSection}>
                <h4>Lo que dicen otros ({resenasProducto.length})</h4>
                <div className={s.resenasList}>
                  {resenasProducto.map((r) => (
                    <div key={r._id} className={s.resenaItem}>
                      <div className={s.resenaHeader}>
                        <span className={s.resenaAutor}>{r.clienteNombre}</span>
                        <Stars value={r.puntuacion} size={12} />
                      </div>
                      {r.notas && <p className={s.resenaTexto}>{r.notas}</p>}
                      <span className={s.resenaFecha}>{new Date(r.createdAt).toLocaleDateString('es-AR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
