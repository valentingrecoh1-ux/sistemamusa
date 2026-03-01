import { useState, useEffect } from 'react';
import { socket } from '../../main';
import { IP } from '../../main';
import Pagination from '../../components/shared/Pagination';
import s from './Proveedores.module.css';

const EMPTY = { nombre: '', cuit: '', contacto: '', email: '', telefono: '', direccion: '', cbu: '', alias: '', banco: '', condicionPago: '', notas: '' };

export default function Proveedores({ usuario }) {
  const puedeEditar = usuario?.rol === 'admin';

  const [proveedores, setProveedores] = useState([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    socket.on('response-proveedores', (data) => {
      setProveedores(data.proveedores || data || []);
      if (data.totalPages) setTotalPages(data.totalPages);
    });
    socket.on('cambios', () => {
      socket.emit('request-proveedores', { page, search });
    });

    socket.emit('request-proveedores', { page, search });

    return () => {
      socket.off('response-proveedores');
      socket.off('cambios');
    };
  }, []);

  useEffect(() => {
    socket.emit('request-proveedores', { page, search });
  }, [page, search]);

  const formatCuit = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: field === 'cuit' ? formatCuit(value) : value }));
  };

  const handleSubmit = () => {
    if (!form.nombre.trim()) return;
    const payload = editId ? { ...form, _id: editId } : { ...form };
    socket.emit('guardar-proveedor', payload);
    setForm({ ...EMPTY });
    setEditId(null);
  };

  const handleEdit = (prov) => {
    setForm({
      nombre: prov.nombre || '',
      cuit: prov.cuit || '',
      contacto: prov.contacto || '',
      email: prov.email || '',
      telefono: prov.telefono || '',
      direccion: prov.direccion || '',
      cbu: prov.cbu || '',
      alias: prov.alias || '',
      banco: prov.banco || '',
      condicionPago: prov.condicionPago || '',
      notas: prov.notas || '',
    });
    setEditId(prov._id);
  };

  const handleCancel = () => {
    setForm({ ...EMPTY });
    setEditId(null);
  };

  const toggleActivo = (prov) => {
    socket.emit('toggle-proveedor-activo', prov._id);
  };

  return (
    <div className={s.container}>
      {/* Left: Form */}
      {puedeEditar && (
        <div className={s.formCard}>
          <h3 className={s.formTitle}>{editId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>

          <div className={s.inputGroup}>
            <span>Nombre *</span>
            <input type="text" value={form.nombre} onChange={(e) => handleChange('nombre', e.target.value)} placeholder="Razon social" />
          </div>

          <div className={s.row2}>
            <div className={s.inputGroup}>
              <span>CUIT</span>
              <input type="text" value={form.cuit} onChange={(e) => handleChange('cuit', e.target.value)} placeholder="XX-XXXXXXXX-X" />
            </div>
            <div className={s.inputGroup}>
              <span>Contacto</span>
              <input type="text" value={form.contacto} onChange={(e) => handleChange('contacto', e.target.value)} />
            </div>
          </div>

          <div className={s.row2}>
            <div className={s.inputGroup}>
              <span>Email</span>
              <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} />
            </div>
            <div className={s.inputGroup}>
              <span>Telefono</span>
              <input type="text" value={form.telefono} onChange={(e) => handleChange('telefono', e.target.value)} />
            </div>
          </div>

          <div className={s.inputGroup}>
            <span>Direccion</span>
            <input type="text" value={form.direccion} onChange={(e) => handleChange('direccion', e.target.value)} />
          </div>

          <div className={s.row2}>
            <div className={s.inputGroup}>
              <span>CBU</span>
              <input type="text" value={form.cbu} onChange={(e) => handleChange('cbu', e.target.value)} />
            </div>
            <div className={s.inputGroup}>
              <span>Alias</span>
              <input type="text" value={form.alias} onChange={(e) => handleChange('alias', e.target.value)} />
            </div>
          </div>

          <div className={s.inputGroup}>
            <span>Banco</span>
            <input type="text" value={form.banco} onChange={(e) => handleChange('banco', e.target.value)} />
          </div>

          <div className={s.inputGroup}>
            <span>Condicion de Pago</span>
            <input type="text" value={form.condicionPago} onChange={(e) => handleChange('condicionPago', e.target.value)} placeholder="Ej: 30 dias" />
          </div>

          <div className={s.inputGroup}>
            <span>Notas</span>
            <textarea value={form.notas} onChange={(e) => handleChange('notas', e.target.value)} />
          </div>

          <div className={s.btnRow}>
            <button className={s.submitBtn} onClick={handleSubmit}>
              {editId ? 'Actualizar' : 'Guardar'}
            </button>
            {editId && (
              <button className={s.cancelBtn} onClick={handleCancel}>Cancelar</button>
            )}
          </div>
        </div>
      )}

      {/* Right: Table */}
      <div className={s.tableSection}>
        <div className={s.toolbar}>
          <input
            className={s.searchInput}
            type="text"
            placeholder="Buscar proveedor..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Pagination
            className={s.paginationDock}
            page={page}
            totalPages={totalPages}
            onChange={setPage}
          />
        </div>

        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>CUIT</th>
                <th>Contacto</th>
                <th>Telefono</th>
                <th>Cond. Pago</th>
                <th>Estado</th>
                {puedeEditar && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {proveedores.length === 0 ? (
                <tr className={s.emptyRow}><td colSpan={puedeEditar ? 7 : 6}>Sin proveedores</td></tr>
              ) : proveedores.map((prov) => (
                <tr key={prov._id}>
                  <td>{prov.nombre}</td>
                  <td>{prov.cuit || '-'}</td>
                  <td>{prov.contacto || '-'}</td>
                  <td>{prov.telefono || '-'}</td>
                  <td>{prov.condicionPago || '-'}</td>
                  <td>
                    <button
                      className={`${s.toggleBtn} ${prov.activo !== false ? s.toggleActive : s.toggleInactive}`}
                      onClick={() => toggleActivo(prov)}
                      disabled={!puedeEditar}
                    >
                      {prov.activo !== false ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  {puedeEditar && (
                    <td>
                      <button className={s.editBtn} onClick={() => handleEdit(prov)} title="Editar">
                        <i className="bi bi-pencil" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
