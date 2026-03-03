import { useState, useEffect } from 'react';
import { socket } from '../../main';
import { dialog } from '../../components/shared/dialog';
import Pagination from '../../components/shared/Pagination';
import Badge from '../../components/shared/Badge';
import Modal from '../../components/shared/Modal';
import { PERMISOS_DISPONIBLES } from '../../lib/permisos';
import s from './Usuarios.module.css';

const ROL_LABELS = { admin: 'Admin', comprador: 'Comprador', recepcion: 'Recepcion', vendedor: 'Vendedor' };
const ROL_VARIANTS = { admin: 'danger', comprador: 'info', recepcion: 'warning', vendedor: 'success' };
const EMPTY = { nombre: '', username: '', password: '', rol: 'vendedor' };

export default function Usuarios({ usuario }) {
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [editPermisos, setEditPermisos] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [permisosOpen, setPermisosOpen] = useState(false);
  const [claveModal, setClaveModal] = useState(null);
  const [nuevaClave, setNuevaClave] = useState('');
  const [permisosModal, setPermisosModal] = useState(null);
  const [permisosTemp, setPermisosTemp] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const isAdmin = usuario?.rol === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    const onUsuarios = (data) => {
      setUsuarios(data.usuarios || []);
      if (data.totalPages) setTotalPages(data.totalPages);
    };
    const onCambios = () => socket.emit('request-usuarios', { page, search });

    socket.on('response-usuarios', onUsuarios);
    socket.on('cambios', onCambios);
    socket.emit('request-usuarios', { page, search });

    return () => {
      socket.off('response-usuarios', onUsuarios);
      socket.off('cambios', onCambios);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    socket.emit('request-usuarios', { page, search });
  }, [page, search]);

  if (!isAdmin) {
    return <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>Acceso restringido.</div>;
  }

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const togglePermiso = (key) => {
    setEditPermisos((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const handleSubmit = () => {
    if (!form.nombre.trim() || !form.username.trim()) return;
    if (!editId && !form.password.trim()) return;
    const payload = editId
      ? { ...form, _id: editId, permisos: editPermisos }
      : { ...form, permisos: editPermisos };
    socket.emit('guardar-usuario', payload);
    setForm({ ...EMPTY });
    setEditId(null);
    setEditPermisos([]);
  };

  const handleEdit = (u) => {
    setForm({ nombre: u.nombre, username: u.username, password: '', rol: u.rol });
    setEditId(u._id);
    setEditPermisos(u.permisos || []);
    setPermisosOpen(true);
  };

  const handleCancel = () => {
    setForm({ ...EMPTY });
    setEditId(null);
    setEditPermisos([]);
    setPermisosOpen(false);
  };

  const toggleActivo = (u) => {
    if (u._id === usuario?._id) return;
    socket.emit('toggle-usuario-activo', u._id);
  };

  const handleDelete = (u) => {
    socket.emit('eliminar-usuario', u._id, async (res) => {
      if (res?.error) await dialog.alert(res.error);
    });
    setDeleteConfirm(null);
  };

  const handleCambiarClave = () => {
    if (!nuevaClave.trim() || !claveModal?._id) return;
    socket.emit('cambiar-clave-usuario', { id: claveModal._id, nuevaClave });
    setClaveModal(null);
    setNuevaClave('');
  };

  const openPermisosModal = (u) => {
    setPermisosModal(u);
    setPermisosTemp(u.permisos || []);
  };

  const togglePermisoTemp = (key) => {
    setPermisosTemp((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const guardarPermisos = () => {
    if (!permisosModal) return;
    socket.emit('guardar-usuario', { _id: permisosModal._id, permisos: permisosTemp }, async (res) => {
      if (res?.error) {
        await dialog.alert('Error al guardar permisos: ' + res.error);
        return;
      }
      socket.emit('request-usuarios', { page, search });
    });
    setPermisosModal(null);
    setPermisosTemp([]);
  };

  const todosLosPermisos = PERMISOS_DISPONIBLES.flatMap((g) => g.permisos.map((p) => p.key));

  const toggleTodos = (perms, setPerms) => {
    if (todosLosPermisos.every((k) => perms.includes(k))) {
      setPerms([]);
    } else {
      setPerms([...todosLosPermisos]);
    }
  };

  return (
    <div className={s.container}>
      {/* Left: Form */}
      <div className={s.formCard}>
        <h3 className={s.formTitle}>{editId ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>

        <div className={s.inputGroup}>
          <span>Nombre</span>
          <input type="text" value={form.nombre} onChange={(e) => handleChange('nombre', e.target.value)} placeholder="Nombre completo" />
        </div>

        <div className={s.inputGroup}>
          <span>Usuario</span>
          <input type="text" value={form.username} onChange={(e) => handleChange('username', e.target.value.toLowerCase().trim())} placeholder="username" />
        </div>

        <div className={s.inputGroup}>
          <span>{editId ? 'Nueva clave (vacío = sin cambios)' : 'Contraseña'}</span>
          <input type="password" value={form.password} onChange={(e) => handleChange('password', e.target.value)} placeholder={editId ? 'Sin cambios si vacío' : 'Contraseña'} />
        </div>

        <div className={s.inputGroup}>
          <span>Rol</span>
          <select value={form.rol} onChange={(e) => handleChange('rol', e.target.value)}>
            <option value="vendedor">Vendedor</option>
            <option value="recepcion">Recepcion</option>
            <option value="comprador">Comprador</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {form.rol !== 'admin' && (
          <div className={s.permisosSection}>
            <button type="button" className={s.permisosToggle} onClick={() => setPermisosOpen(!permisosOpen)}>
              <span className={s.permisosLabel}>
                <i className={`bi ${permisosOpen ? 'bi-chevron-down' : 'bi-chevron-right'}`} />
                Permisos
              </span>
              <span className={s.permisosCount}>{editPermisos.length}/{todosLosPermisos.length}</span>
            </button>
            {permisosOpen && (
              <>
                <div className={s.permisosHeader}>
                  <span />
                  <button type="button" className={s.toggleAllBtn} onClick={() => toggleTodos(editPermisos, setEditPermisos)}>
                    {todosLosPermisos.every((k) => editPermisos.includes(k)) ? 'Quitar todos' : 'Marcar todos'}
                  </button>
                </div>
                {PERMISOS_DISPONIBLES.map((grupo) => (
                  <div key={grupo.grupo} className={s.permisosGrupo}>
                    <div className={s.permisosGrupoTitle}>{grupo.grupo}</div>
                    {grupo.permisos.map((p) => (
                      <label key={p.key} className={s.permisoCheck}>
                        <input type="checkbox" checked={editPermisos.includes(p.key)} onChange={() => togglePermiso(p.key)} />
                        <span>{p.label}</span>
                        <div className={s.toggle} />
                      </label>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

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
            placeholder="Buscar usuario..."
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
                <th>Usuario</th>
                <th>Rol</th>
                <th>Permisos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 ? (
                <tr className={s.emptyRow}><td colSpan={6}>Sin usuarios</td></tr>
              ) : usuarios.map((u) => (
                <tr key={u._id}>
                  <td>{u.nombre}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{u.username}</td>
                  <td><Badge variant={ROL_VARIANTS[u.rol] || 'default'}>{ROL_LABELS[u.rol] || u.rol}</Badge></td>
                  <td>
                    {u.rol === 'admin' ? (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Todos</span>
                    ) : (
                      <button className={s.permisosBtn} onClick={() => openPermisosModal(u)}>
                        <i className="bi bi-shield-lock" />
                        <span>{(u.permisos || []).length}/{todosLosPermisos.length}</span>
                      </button>
                    )}
                  </td>
                  <td>
                    <button
                      className={`${s.toggleBtn} ${u.activo !== false ? s.toggleActive : s.toggleInactive}`}
                      onClick={() => toggleActivo(u)}
                      disabled={u._id === usuario?._id}
                      title={u._id === usuario?._id ? 'No podés desactivarte a vos mismo' : ''}
                    >
                      {u.activo !== false ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td>
                    <div className={s.actions}>
                      <button className={s.editBtn} onClick={() => handleEdit(u)} title="Editar">
                        <i className="bi bi-pencil" />
                      </button>
                      <button className={s.editBtn} onClick={() => { setClaveModal(u); setNuevaClave(''); }} title="Cambiar contraseña">
                        <i className="bi bi-key" />
                      </button>
                      {u._id !== usuario?._id && (
                        <button className={s.deleteBtn} onClick={() => setDeleteConfirm(u)} title="Eliminar">
                          <i className="bi bi-trash" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Change Modal */}
      {claveModal && (
        <Modal title={`Cambiar contraseña — ${claveModal.nombre}`} onClose={() => setClaveModal(null)}>
          <div className={s.inputGroup} style={{ padding: '0 20px' }}>
            <span>Nueva Contraseña</span>
            <input type="password" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} placeholder="Nueva contraseña" autoFocus />
          </div>
          <div className={s.btnRow} style={{ padding: '14px 20px 0' }}>
            <button className={s.submitBtn} onClick={handleCambiarClave}>Guardar</button>
            <button className={s.cancelBtn} onClick={() => setClaveModal(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal title="Confirmar eliminacion" onClose={() => setDeleteConfirm(null)}>
          <div style={{ padding: '0 20px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Estas seguro de eliminar a <strong>{deleteConfirm.nombre}</strong> ({deleteConfirm.username})?
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--danger)' }}>Esta accion no se puede deshacer.</p>
          </div>
          <div className={s.btnRow} style={{ padding: '14px 20px 0', justifyContent: 'center' }}>
            <button className={s.deleteConfirmBtn} onClick={() => handleDelete(deleteConfirm)}>Eliminar</button>
            <button className={s.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* Permisos Modal */}
      {permisosModal && (
        <Modal title={`Permisos — ${permisosModal.nombre}`} onClose={() => setPermisosModal(null)}>
          <div style={{ padding: '0 20px' }}>
            <div className={s.permisosModalHeader}>
              <span className={s.permisosCount}>
                <strong>{permisosTemp.length}</strong> / {todosLosPermisos.length} activos
              </span>
              <button type="button" className={s.toggleAllBtn} onClick={() => toggleTodos(permisosTemp, setPermisosTemp)}>
                {todosLosPermisos.every((k) => permisosTemp.includes(k)) ? 'Quitar todos' : 'Marcar todos'}
              </button>
            </div>
            {PERMISOS_DISPONIBLES.map((grupo) => (
              <div key={grupo.grupo} className={s.permisosGrupo}>
                <div className={s.permisosGrupoTitle}>{grupo.grupo}</div>
                {grupo.permisos.map((p) => (
                  <label key={p.key} className={s.permisoCheck}>
                    <input type="checkbox" checked={permisosTemp.includes(p.key)} onChange={() => togglePermisoTemp(p.key)} />
                    <span>{p.label}</span>
                    <div className={s.toggle} />
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className={s.btnRow} style={{ padding: '14px 20px 0' }}>
            <button className={s.submitBtn} onClick={guardarPermisos}>Guardar</button>
            <button className={s.cancelBtn} onClick={() => setPermisosModal(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
