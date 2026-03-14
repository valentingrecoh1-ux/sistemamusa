import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { socket } from '../../main';
import { IP } from '../../main';
import Pagination from '../../components/shared/Pagination';
import s from './PagosProveedor.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

const METODOS = ['Transferencia', 'Efectivo', 'Cheque', 'Otro'];

export default function PagosProveedor({ usuario }) {
  const [ordenes, setOrdenes] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [selectedOC, setSelectedOC] = useState('');
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('Transferencia');
  const [referencia, setReferencia] = useState('');
  const [notasPago, setNotasPago] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    socket.on('response-ordenes-compra', (data) => {
      const ocs = data.ordenes || data || [];
      setOrdenes(ocs.filter((oc) => oc.estadoPago !== 'pagado' && oc.estado !== 'cancelada'));
    });
    socket.on('response-pagos-proveedor', (data) => {
      setPagos(data.pagos || data || []);
      if (data.totalPages) setTotalPages(data.totalPages);
    });
    socket.on('cambios', () => {
      socket.emit('request-ordenes-compra', {});
      socket.emit('request-pagos-proveedor', { page, search });
    });

    socket.emit('request-ordenes-compra', {});
    socket.emit('request-pagos-proveedor', { page, search });

    return () => {
      socket.off('response-ordenes-compra');
      socket.off('response-pagos-proveedor');
      socket.off('cambios');
    };
  }, []);

  useEffect(() => {
    socket.emit('request-pagos-proveedor', { page, search });
  }, [page, search]);

  const ocSeleccionada = ordenes.find((oc) => oc._id === selectedOC);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setArchivo(e.target.files[0]);
    }
  };

  const resetForm = () => {
    setSelectedOC('');
    setMonto('');
    setMetodo('Transferencia');
    setReferencia('');
    setNotasPago('');
    setArchivo(null);
    setEditId(null);
  };

  const handleSubmit = async () => {
    if (editId) {
      // Update existing payment
      if (archivo) {
        const formData = new FormData();
        formData.append('archivo', archivo);
        try {
          await fetch(`${IP()}/api/pago-proveedor/${editId}/comprobante`, {
            method: 'POST',
            body: formData,
          });
        } catch (err) {
          console.error('Error subiendo comprobante:', err);
        }
      }
      socket.emit('actualizar-pago-proveedor', {
        id: editId,
        metodo,
        referencia,
        notas: notasPago,
      });
      resetForm();
      return;
    }

    // New payment
    if (!selectedOC || !monto || Number(monto) <= 0) return;

    let comprobanteUrl = '';
    if (archivo) {
      const formData = new FormData();
      formData.append('file', archivo);
      try {
        const res = await fetch(`${IP()}/upload_pago_proveedor`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        comprobanteUrl = data.url || '';
      } catch (err) {
        console.error('Error subiendo comprobante:', err);
      }
    }

    socket.emit('guardar-pago-proveedor', {
      ordenCompra: selectedOC,
      monto: Number(monto),
      metodo,
      referencia,
      notas: notasPago,
      comprobante: comprobanteUrl,
    });

    resetForm();
  };

  const handleEdit = (pago) => {
    setEditId(pago._id);
    setSelectedOC(pago.ordenCompraId?._id || '');
    setMonto(pago.monto || '');
    setMetodo(pago.metodoPago || 'Transferencia');
    setReferencia(pago.referencia || '');
    setNotasPago(pago.notas || '');
    setArchivo(null);
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  return (
    <div className={s.container}>
      <Link to="/compras" className={s.backLink}>
        <i className="bi bi-arrow-left" /> Volver a Compras
      </Link>

      {/* Left: Form */}
      <div className={s.formCard}>
        <h3 className={s.formTitle}>{editId ? 'Editar Pago' : 'Registrar Pago'}</h3>

        <div className={s.inputGroup}>
          <span>Orden de Compra *</span>
          <select value={selectedOC} onChange={(e) => setSelectedOC(e.target.value)} disabled={!!editId}>
            <option value="">-- Seleccionar OC --</option>
            {ordenes.map((oc) => (
              <option key={oc._id} value={oc._id}>
                OC #{oc.numero || '-'} - {oc.proveedorBodega || oc.proveedorNombre || '-'} ({money(oc.montoTotal ? Math.round(oc.montoTotal * 1.21 * 100) / 100 : oc.total)})
              </option>
            ))}
          </select>
        </div>

        {ocSeleccionada && !editId && (
          <div className={s.ocInfo}>
            Total: <span className={s.ocInfoValue}>{money(Math.round((ocSeleccionada.montoTotal || 0) * 1.21 * 100) / 100)}</span>
            {' | '}Pagado: <span className={s.ocInfoValue}>{money(ocSeleccionada.montoPagado || 0)}</span>
            {' | '}Saldo: <span className={s.ocInfoValue}>{money(Math.round((ocSeleccionada.montoTotal || 0) * 1.21 * 100) / 100 - (ocSeleccionada.montoPagado || 0))}</span>
          </div>
        )}

        <div className={s.inputGroup}>
          <span>Monto *</span>
          <input type="number" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" disabled={!!editId} />
        </div>

        <div className={s.inputGroup}>
          <span>Metodo de Pago</span>
          <div className={s.metodoGroup}>
            {METODOS.map((m) => (
              <button
                key={m}
                className={`${s.metodoBtn} ${metodo === m ? s.metodoBtnActive : ''}`}
                onClick={() => setMetodo(m)}
                type="button"
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className={s.inputGroup}>
          <span>Referencia</span>
          <input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Nro transferencia, cheque..." />
        </div>

        <div className={s.inputGroup}>
          <span>Notas</span>
          <textarea value={notasPago} onChange={(e) => setNotasPago(e.target.value)} />
        </div>

        <div className={s.inputGroup}>
          <span>Comprobante</span>
          <label className={s.fileLabel}>
            <i className="bi bi-upload" />
            {archivo ? archivo.name : 'Subir archivo'}
            <input type="file" onChange={handleFileChange} accept="image/*,.pdf" />
          </label>
          {archivo && <div className={s.fileName}>{archivo.name}</div>}
        </div>

        <div className={s.formActions}>
          <button className={s.submitBtn} onClick={handleSubmit}>
            {editId ? 'Actualizar Pago' : 'Registrar Pago'}
          </button>
          {editId && (
            <button className={s.cancelBtn} onClick={handleCancelEdit} type="button">
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Right: Table */}
      <div className={s.tableSection}>
        <div className={s.toolbar}>
          <input
            className={s.searchInput}
            type="text"
            placeholder="Buscar pago..."
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
                <th>Fecha</th>
                <th>OC</th>
                <th>Proveedor</th>
                <th>Monto</th>
                <th>Metodo</th>
                <th>Referencia</th>
                <th>Comp.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagos.length === 0 ? (
                <tr className={s.emptyRow}><td colSpan={8}>Sin pagos registrados</td></tr>
              ) : pagos.map((p) => (
                <tr key={p._id} className={editId === p._id ? s.editingRow : ''}>
                  <td>{p.fecha ? new Date(p.fecha).toLocaleDateString('es-AR') : '-'}</td>
                  <td>{p.ordenCompraId?.numero || '-'}</td>
                  <td>{p.proveedorId?.bodega || p.proveedorId?.nombre || '-'}</td>
                  <td>{money(p.monto)}</td>
                  <td>{p.metodoPago || '-'}</td>
                  <td>{p.referencia || '-'}</td>
                  <td>
                    {p.filePath ? (
                      <a href={p.filePath} target="_blank" rel="noopener noreferrer" className={s.comprobanteLink}>
                        <i className="bi bi-file-earmark" />
                      </a>
                    ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                  </td>
                  <td>
                    <button
                      className={s.editBtn}
                      onClick={() => handleEdit(p)}
                      title="Editar pago"
                      type="button"
                    >
                      <i className="bi bi-pencil" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
