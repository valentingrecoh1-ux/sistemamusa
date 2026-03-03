import { useState, useEffect } from 'react';
import { socket } from '../main';
import Pagination from '../components/shared/Pagination';
import Modal from '../components/shared/Modal';
import { dialog } from '../components/shared/dialog';
import s from './Clientes.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);
const EMPTY = { nombre: '', email: '', telefono: '', cuit: '', razonSocial: '', domicilio: '', localidad: '', provincia: '', notas: '', tags: [] };

export default function Clientes({ usuario }) {
  const [clientes, setClientes] = useState([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detalle, setDetalle] = useState(null);
  const [tagInput, setTagInput] = useState('');

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
  };

  const handleEdit = (c) => {
    setForm({ nombre: c.nombre || '', email: c.email || '', telefono: c.telefono || '', cuit: c.cuit || '', razonSocial: c.razonSocial || '', domicilio: c.domicilio || '', localidad: c.localidad || '', provincia: c.provincia || '', notas: c.notas || '', tags: c.tags || [] });
    setEditId(c._id);
  };

  const handleCancel = () => {
    setForm({ ...EMPTY });
    setEditId(null);
    setTagInput('');
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

  const openDetalle = (c) => {
    setDetalle({ loading: true, cliente: c });
    socket.emit('request-cliente-detalle', c._id);
    const handler = (data) => {
      setDetalle(data ? { ...data, loading: false } : null);
      socket.off('response-cliente-detalle', handler);
    };
    socket.on('response-cliente-detalle', handler);
  };

  return (
    <div className={s.container}>
      {/* Left: Form */}
      <div className={s.formCard}>
        <h3 className={s.formTitle}>{editId ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>

        <div className={s.inputGroup}>
          <span>Nombre *</span>
          <input type="text" value={form.nombre} onChange={(e) => handleChange('nombre', e.target.value)} placeholder="Nombre completo" />
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

        <div className={s.btnRow}>
          <button className={s.submitBtn} onClick={handleSubmit}>{editId ? 'Actualizar' : 'Guardar'}</button>
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
                <th>Nombre</th>
                <th>CUIT</th>
                <th>Contacto</th>
                <th>Tags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 ? (
                <tr className={s.emptyRow}><td colSpan={5}>Sin clientes</td></tr>
              ) : clientes.map((c) => (
                <tr key={c._id} className={s.clickableRow} onClick={() => openDetalle(c)}>
                  <td>
                    <div className={s.clienteName}>{c.nombre}</div>
                    {c.razonSocial && <div className={s.clienteSub}>{c.razonSocial}</div>}
                  </td>
                  <td><span className={s.mono}>{c.cuit || '—'}</span></td>
                  <td>
                    {c.email && <div className={s.contactLine}><i className="bi bi-envelope" /> {c.email}</div>}
                    {c.telefono && <div className={s.contactLine}><i className="bi bi-telephone" /> {c.telefono}</div>}
                    {!c.email && !c.telefono && <span className={s.muted}>—</span>}
                  </td>
                  <td>
                    {(c.tags || []).length > 0 ? (
                      <div className={s.tagsInline}>{c.tags.map((t) => <span key={t} className={s.tagSmall}>{t}</span>)}</div>
                    ) : <span className={s.muted}>—</span>}
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

      {/* Detail Modal */}
      {detalle && (
        <Modal title={detalle.cliente?.nombre || 'Cliente'} onClose={() => setDetalle(null)} wide>
          {detalle.loading ? (
            <div className={s.loadingModal}>Cargando...</div>
          ) : (
            <div className={s.detalleBody}>
              {/* KPIs */}
              <div className={s.kpiGrid}>
                <div className={s.kpiCard}>
                  <span className={s.kpiLabel}>Total Gastado</span>
                  <span className={s.kpiValue}>{money(detalle.metricas?.totalGastado)}</span>
                </div>
                <div className={s.kpiCard}>
                  <span className={s.kpiLabel}>Compras</span>
                  <span className={s.kpiValue}>{detalle.metricas?.cantCompras || 0}</span>
                </div>
                <div className={s.kpiCard}>
                  <span className={s.kpiLabel}>Ticket Promedio</span>
                  <span className={s.kpiValue}>{money(detalle.metricas?.ticketPromedio)}</span>
                </div>
                <div className={s.kpiCard}>
                  <span className={s.kpiLabel}>Ultima Compra</span>
                  <span className={s.kpiValue}>{detalle.metricas?.ultimaCompra ? new Date(detalle.metricas.ultimaCompra).toLocaleDateString('es-AR') : '—'}</span>
                </div>
              </div>

              {/* Info */}
              <div className={s.infoGrid}>
                {detalle.cliente?.cuit && <div><span className={s.infoLabel}>CUIT</span><span>{detalle.cliente.cuit}</span></div>}
                {detalle.cliente?.razonSocial && <div><span className={s.infoLabel}>Razon Social</span><span>{detalle.cliente.razonSocial}</span></div>}
                {detalle.cliente?.email && <div><span className={s.infoLabel}>Email</span><span>{detalle.cliente.email}</span></div>}
                {detalle.cliente?.telefono && <div><span className={s.infoLabel}>Telefono</span><span>{detalle.cliente.telefono}</span></div>}
                {detalle.cliente?.domicilio && <div><span className={s.infoLabel}>Domicilio</span><span>{detalle.cliente.domicilio} {detalle.cliente.localidad} {detalle.cliente.provincia}</span></div>}
                {detalle.cliente?.notas && <div><span className={s.infoLabel}>Notas</span><span>{detalle.cliente.notas}</span></div>}
              </div>

              {/* Ventas */}
              {(detalle.ventas || []).length > 0 && (
                <div className={s.detalleSection}>
                  <h4>Ventas ({detalle.ventas.length})</h4>
                  <div className={s.detalleList}>
                    {detalle.ventas.slice(0, 20).map((v) => (
                      <div key={v._id} className={s.detalleItem}>
                        <span>{v.stringNumeroFactura || `Venta`}</span>
                        <span>{v.fecha || (v.createdAt ? new Date(v.createdAt).toLocaleDateString('es-AR') : '')}</span>
                        <span className={s.detalleMonto}>{money(v.monto)}</span>
                        <span className={s.detallePago}>{v.formaPago || ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pedidos Web */}
              {(detalle.pedidos || []).length > 0 && (
                <div className={s.detalleSection}>
                  <h4>Pedidos Web ({detalle.pedidos.length})</h4>
                  <div className={s.detalleList}>
                    {detalle.pedidos.slice(0, 20).map((p) => (
                      <div key={p._id} className={s.detalleItem}>
                        <span>#{p.numeroPedido}</span>
                        <span>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('es-AR') : ''}</span>
                        <span className={s.detalleMonto}>{money(p.montoTotal)}</span>
                        <span className={s.detallePago}>{p.estado}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suscripciones */}
              {(detalle.suscripciones || []).length > 0 && (
                <div className={s.detalleSection}>
                  <h4>Suscripciones Club ({detalle.suscripciones.length})</h4>
                  <div className={s.detalleList}>
                    {detalle.suscripciones.map((sc) => (
                      <div key={sc._id} className={s.detalleItem}>
                        <span>{sc.planNombre || 'Plan'}</span>
                        <span>{sc.estado}</span>
                        <span className={s.detalleMonto}>{money(sc.precioMensual)}/mes</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(detalle.ventas || []).length === 0 && (detalle.pedidos || []).length === 0 && (detalle.suscripciones || []).length === 0 && (
                <div className={s.emptyDetalle}>Este cliente aun no tiene compras vinculadas.</div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
