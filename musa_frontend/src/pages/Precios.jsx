import { useState, useEffect, useRef } from 'react';
import { NumericFormat } from 'react-number-format';
import { socket } from '../main';
import Pagination from '../components/shared/Pagination';
import Modal from '../components/shared/Modal';
import s from './Precios.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);
const TIPOS = { '': 'Todos', vino: 'Vino', articulo: 'Articulo', servicio: 'Servicio' };

export default function Precios({ usuario }) {
  const [productos, setProductos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  // Inline edit
  const [editCell, setEditCell] = useState(null); // { id, campo }
  const [editValue, setEditValue] = useState('');
  const editRef = useRef(null);

  // Selection for bulk
  const [selected, setSelected] = useState(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkPct, setBulkPct] = useState('');
  const [bulkCampo, setBulkCampo] = useState('venta');

  // History modal
  const [histModal, setHistModal] = useState(null);

  const fetchRef = useRef();
  fetchRef.current = () => {
    socket.emit('request-precios', { page, search, tipo: filtroTipo });
  };

  useEffect(() => {
    const handler = (data) => {
      setProductos(data?.productos || []);
      setTotalPages(data?.totalPages || 1);
    };
    const cambiosHandler = () => fetchRef.current();
    socket.on('response-precios', handler);
    socket.on('cambios', cambiosHandler);
    fetchRef.current();
    return () => {
      socket.off('response-precios', handler);
      socket.off('cambios', cambiosHandler);
    };
  }, []);

  useEffect(() => { fetchRef.current(); }, [page, search, filtroTipo]);

  useEffect(() => {
    if (editCell && editRef.current) editRef.current.focus();
  }, [editCell]);

  const startEdit = (id, campo, valorActual) => {
    setEditCell({ id, campo });
    setEditValue(String(valorActual || ''));
  };

  const saveEdit = () => {
    if (!editCell) return;
    const val = Number(editValue) || 0;
    socket.emit('actualizar-precio', { productoId: editCell.id, campo: editCell.campo, valor: val });
    setEditCell(null);
    setEditValue('');
  };

  const handleEditKey = (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') { setEditCell(null); setEditValue(''); }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === productos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(productos.map((p) => p._id)));
    }
  };

  const handleBulk = () => {
    const pct = Number(bulkPct);
    if (!pct || selected.size === 0) return;
    socket.emit('actualizar-precios-masivo', { productoIds: [...selected], porcentaje: pct, campo: bulkCampo });
    setBulkModal(false);
    setBulkPct('');
    setSelected(new Set());
  };

  const calcMargen = (venta, costo) => {
    const v = Number(venta) || 0;
    const c = Number(costo) || 0;
    return { abs: v - c, pct: c > 0 ? ((v - c) / c * 100) : 0 };
  };

  return (
    <div className={s.container}>
      {/* Toolbar */}
      <div className={s.toolbar}>
        <input
          className={s.searchInput}
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className={s.filterSelect}
          value={filtroTipo}
          onChange={(e) => { setFiltroTipo(e.target.value); setPage(1); setSelected(new Set()); }}
        >
          {Object.entries(TIPOS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {selected.size > 0 && (
          <button className={s.bulkBtn} onClick={() => setBulkModal(true)}>
            <i className="bi bi-percent" /> Ajuste masivo ({selected.size})
          </button>
        )}
        <Pagination className={s.paginationDock} page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {/* Table */}
      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.checkCol}>
                <label className={s.check}>
                  <input type="checkbox" checked={selected.size === productos.length && productos.length > 0} onChange={toggleAll} />
                  <span className={s.checkMark} />
                </label>
              </th>
              <th>Producto</th>
              <th>Bodega / Cepa</th>
              <th>Costo</th>
              <th>Venta</th>
              <th>Margen</th>
              <th>Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productos.length === 0 ? (
              <tr><td colSpan={8} className={s.empty}>Sin productos</td></tr>
            ) : productos.map((p) => {
              const m = calcMargen(p.venta, p.costo);
              return (
                <tr key={p._id}>
                  <td className={s.checkCol}>
                    <label className={s.check}>
                      <input type="checkbox" checked={selected.has(p._id)} onChange={() => toggleSelect(p._id)} />
                      <span className={s.checkMark} />
                    </label>
                  </td>
                  <td>
                    <div className={s.prodName}>{p.nombre}</div>
                    <div className={s.prodCode}>{p.codigo}</div>
                  </td>
                  <td>
                    <span className={s.bodega}>{p.bodega || '—'}</span>
                    {p.cepa && <span className={s.cepa}>{p.cepa}</span>}
                  </td>
                  <td className={s.priceCell} onClick={() => startEdit(p._id, 'costo', p.costo)}>
                    {editCell?.id === p._id && editCell.campo === 'costo' ? (
                      <NumericFormat
                        getInputRef={editRef}
                        className={s.priceInput}
                        prefix="$"
                        thousandSeparator="."
                        decimalSeparator=","
                        value={editValue}
                        onValueChange={(v) => setEditValue(v.value)}
                        onBlur={saveEdit}
                        onKeyDown={handleEditKey}
                      />
                    ) : (
                      <span className={s.priceValue}>{p.costo ? money(p.costo) : <span className={s.noCosto}>Sin costo</span>}</span>
                    )}
                  </td>
                  <td className={s.priceCell} onClick={() => startEdit(p._id, 'venta', p.venta)}>
                    {editCell?.id === p._id && editCell.campo === 'venta' ? (
                      <NumericFormat
                        getInputRef={editRef}
                        className={s.priceInput}
                        prefix="$"
                        thousandSeparator="."
                        decimalSeparator=","
                        value={editValue}
                        onValueChange={(v) => setEditValue(v.value)}
                        onBlur={saveEdit}
                        onKeyDown={handleEditKey}
                      />
                    ) : (
                      <span className={s.priceValue}>{money(Number(p.venta) || 0)}</span>
                    )}
                  </td>
                  <td>
                    {p.costo > 0 ? (
                      <div className={s.margenCell}>
                        <span className={m.abs >= 0 ? s.margenPos : s.margenNeg}>{money(m.abs)}</span>
                        <span className={`${s.margenPct} ${m.pct >= 0 ? s.margenPos : s.margenNeg}`}>{m.pct.toFixed(0)}%</span>
                      </div>
                    ) : (
                      <span className={s.noCosto}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={p.cantidad > 0 ? s.stockOk : s.stockZero}>{p.cantidad || 0}</span>
                  </td>
                  <td>
                    {p.historialPrecios?.length > 0 && (
                      <button className={s.histBtn} onClick={() => setHistModal(p)} title="Historial de precios">
                        <i className="bi bi-clock-history" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* History Modal */}
      {histModal && (
        <Modal title={`Historial — ${histModal.nombre}`} onClose={() => setHistModal(null)}>
          <div className={s.histBody}>
            <div className={s.histCurrent}>
              <span>Precio actual</span>
              <strong>{money(Number(histModal.venta) || 0)}</strong>
            </div>
            <div className={s.histTimeline}>
              {[...histModal.historialPrecios].reverse().map((h, i) => (
                <div key={i} className={s.histItem}>
                  <div className={s.histDot} />
                  <div className={s.histInfo}>
                    <span className={s.histPrice}>{money(Number(h.precio) || 0)}</span>
                    <span className={s.histDate}>
                      {new Date(h.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Modal */}
      {bulkModal && (
        <Modal title={`Ajuste masivo — ${selected.size} productos`} onClose={() => setBulkModal(false)}>
          <div className={s.bulkBody}>
            <div className={s.bulkField}>
              <span>Porcentaje</span>
              <div className={s.bulkPctRow}>
                <NumericFormat
                  className={s.bulkInput}
                  suffix="%"
                  value={bulkPct}
                  onValueChange={(v) => setBulkPct(v.value)}
                  placeholder="ej: 10 o -5"
                  allowNegative
                />
              </div>
              <span className={s.bulkHint}>Positivo sube, negativo baja</span>
            </div>
            <div className={s.bulkField}>
              <span>Aplicar a</span>
              <div className={s.bulkRadios}>
                <label className={s.bulkRadio}>
                  <input type="radio" name="bulkCampo" value="venta" checked={bulkCampo === 'venta'} onChange={() => setBulkCampo('venta')} />
                  <span>Precio de venta</span>
                </label>
                <label className={s.bulkRadio}>
                  <input type="radio" name="bulkCampo" value="costo" checked={bulkCampo === 'costo'} onChange={() => setBulkCampo('costo')} />
                  <span>Costo</span>
                </label>
              </div>
            </div>
            <div className={s.bulkActions}>
              <button className={s.submitBtn} onClick={handleBulk} disabled={!bulkPct}>Aplicar</button>
              <button className={s.cancelBtn} onClick={() => setBulkModal(false)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
