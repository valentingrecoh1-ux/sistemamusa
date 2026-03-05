import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { socket } from '../../main';
import { IP } from '../../main';
import { NumericFormat } from 'react-number-format';
import { dialog } from '../../components/shared/dialog';

/** Convierte un data-URI base64 a un Object URL que el browser puede renderizar */
function dataUriToBlobUrl(dataUri) {
  if (!dataUri || !dataUri.startsWith('data:')) return dataUri;
  try {
    const [header, b64] = dataUri.split(',');
    const mime = header.match(/data:(.*?);/)?.[1] || 'application/octet-stream';
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mime }));
  } catch { return dataUri; }
}
import Badge from '../../components/shared/Badge';
import Timeline from '../../components/shared/Timeline';
import Button from '../../components/shared/Button';
import s from './OrdenCompraDetalle.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);
const round2 = (n) => Math.round(n * 100) / 100;

const ESTADOS = { borrador: 'Borrador', pendiente_aprobacion: 'Pend. Aprobacion', aprobada: 'Aprobada', enviada: 'Enviada', en_camino: 'En Camino', recibida_parcial: 'Recibida Parcial', recibida: 'Recibida', cerrada: 'Cerrada', cancelada: 'Cancelada' };
const ESTADOS_PAGO = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado' };

const EMPTY_ITEM = { descripcion: '', cantidad: 1, precioUnitario: '', precioConIVA: '', bonif: 0, tipoPrecio: 'unidad' };

/** Precio unitario real: si tipoPrecio es 'caja6', divide entre 6 */
const getUnitPrice = (it, field, parsePriceFn) => {
  const raw = parsePriceFn(it[field]);
  return it.tipoPrecio === 'caja6' ? Math.round((raw / 6) * 100) / 100 : raw;
};

/** Cantidad real de unidades: si tipoPrecio es 'caja6', multiplica x6 */
const getRealQty = (it) => {
  const cant = Number(it.cantidad) || 0;
  return it.tipoPrecio === 'caja6' ? cant * 6 : cant;
};

export default function OrdenCompraDetalle({ usuario }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  // Shared state
  const [proveedores, setProveedores] = useState([]);

  // New OC state
  const [proveedorId, setProveedorId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [notas, setNotas] = useState('');
  const [newOCFiles, setNewOCFiles] = useState([]);
  const [newOCTipo, setNewOCTipo] = useState('Factura');

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');

  // Detail state
  const [orden, setOrden] = useState(null);
  const [showPayForm, setShowPayForm] = useState(false);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoMetodo, setPagoMetodo] = useState('efectivo');
  const [pagoNotas, setPagoNotas] = useState('');
  const [pagoConcepto, setPagoConcepto] = useState('factura');

  // Preview archivo modal
  const [previewArchivo, setPreviewArchivo] = useState(null);

  // Flete state
  const [showFleteForm, setShowFleteForm] = useState(false);
  const [fleteDescripcion, setFleteDescripcion] = useState('');
  const [fleteMonto, setFleteMonto] = useState('');

  // Upload factura state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadTipo, setUploadTipo] = useState('Factura');
  const [uploadFecha, setUploadFecha] = useState(new Date().toISOString().slice(0, 10));
  const [uploadMonto, setUploadMonto] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Edit OC state
  const [editMode, setEditMode] = useState(false);
  const [editProveedorId, setEditProveedorId] = useState('');
  const [editFecha, setEditFecha] = useState('');
  const [editItems, setEditItems] = useState([]);
  const [editFactura, setEditFactura] = useState('');
  const [editFacturaType, setEditFacturaType] = useState('A');
  const [editNotas, setEditNotas] = useState('');
  const [editBonifOpen, setEditBonifOpen] = useState(new Set());

  useEffect(() => {
    socket.on('response-proveedores', (data) => {
      setProveedores(data.proveedores || data || []);
    });
    socket.emit('request-proveedores', {});

    if (!isNew) {
      socket.on('response-orden-compra-detalle', (data) => {
        setOrden(data);
      });
      socket.on('cambios', () => {
        socket.emit('request-orden-compra-detalle', id);
      });
      socket.emit('request-orden-compra-detalle', id);
    }

    return () => {
      socket.off('response-proveedores');
      socket.off('response-orden-compra-detalle');
      socket.off('cambios');
    };
  }, [id]);

  // Siempre trata . como miles y , como decimal (formato es-AR)
  const parsePrice = (v) => {
    const s = String(v).trim();
    if (!s) return 0;
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  };

  // Formatea a es-AR para mostrar en el input (1234.56 → "1.234,56")
  const fmtPrice = (num) => {
    if (!num) return '';
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
  };

  // ── New OC handlers ──
  // Durante el tipeo: actualiza el campo tocado y calcula el par en vivo (sin formatear)
  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: value };
      if (field === 'precioUnitario') {
        const num = parsePrice(value);
        item.precioConIVA = num ? String(round2(num * 1.21)) : '';
      } else if (field === 'precioConIVA') {
        const num = parsePrice(value);
        item.precioUnitario = num ? String(round2(num / 1.21)) : '';
      }
      copy[index] = item;
      return copy;
    });
  };

  // Al salir del campo: formatea y auto-calcula el campo par
  const handleItemBlur = (index, field) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      const num = parsePrice(item[field]);
      item[field] = num ? fmtPrice(num) : '';
      if (field === 'precioUnitario') {
        item.precioConIVA = num ? fmtPrice(round2(num * 1.21)) : '';
      } else if (field === 'precioConIVA') {
        item.precioUnitario = num ? fmtPrice(round2(num / 1.21)) : '';
      }
      copy[index] = item;
      return copy;
    });
  };

  const [bonifOpen, setBonifOpen] = useState(new Set());

  const toggleBonifOpen = (i) => {
    setBonifOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
        // Si no tenía valor, no hace nada; si tenía, lo deja
      } else {
        next.add(i);
      }
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  };

  const removeItem = (index) => {
    setBonifOpen((prev) => {
      const next = new Set();
      prev.forEach((i) => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
      return next;
    });
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const itemSubSinIVA = (it) => getRealQty(it) * getUnitPrice(it, 'precioUnitario', parsePrice) * (1 - (Number(it.bonif) || 0) / 100);
  const itemSubConIVA = (it) => getRealQty(it) * getUnitPrice(it, 'precioConIVA', parsePrice) * (1 - (Number(it.bonif) || 0) / 100);

  const totalSinIVA = () => items.reduce((sum, it) => sum + itemSubSinIVA(it), 0);
  const totalConIVA = () => items.reduce((sum, it) => sum + itemSubConIVA(it), 0);

  const handleOcrUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrError('');
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const mimeType = file.type || 'image/jpeg';
      socket.emit('ocr-factura', { imageBase64: base64, mimeType }, (res) => {
        setOcrLoading(false);
        if (res.error) {
          setOcrError(res.error);
          return;
        }
        const d = res.data;
        if (d.items && d.items.length > 0) {
          setItems(d.items.map((it) => {
            const precio = it.precioUnitario || 0;
            return {
              descripcion: it.descripcion || '',
              cantidad: it.cantidad || 1,
              precioUnitario: fmtPrice(precio),
              precioConIVA: fmtPrice(round2(precio * 1.21)),
              bonif: 0,
              tipoPrecio: 'unidad',
            };
          }));
        }
        if (d.numeroFactura) setFactura(d.numeroFactura);
        if (d.fecha) setFecha(d.fecha);
        if (d.proveedor) {
          let match = null;
          if (d.proveedor.cuit) {
            const cuitClean = d.proveedor.cuit.replace(/[-\s]/g, '');
            match = proveedores.find((p) => p.cuit && p.cuit.replace(/[-\s]/g, '') === cuitClean);
          }
          if (!match && d.proveedor.nombre) {
            match = proveedores.find((p) =>
              p.nombre.toLowerCase().includes(d.proveedor.nombre.toLowerCase()) ||
              d.proveedor.nombre.toLowerCase().includes(p.nombre.toLowerCase())
            );
          }
          if (match) setProveedorId(match._id);
        }
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const buildItems = () =>
    items.filter((it) => it.descripcion).map((it) => {
      const cant = Number(it.cantidad) || 1;
      return {
        descripcion: it.descripcion,
        cantidad: it.tipoPrecio === 'caja6' ? cant * 6 : cant,
        precioUnitario: getUnitPrice(it, 'precioUnitario', parsePrice),
        bonif: Number(it.bonif) || 0,
      };
    });

  const submitNuevaOC = (extraValidation) => {
    if (extraValidation && !extraValidation()) return;
    socket.once('response-guardar-orden-compra', async ({ id }) => {
      if (newOCFiles.length > 0 && id) {
        for (const file of newOCFiles) {
          const formData = new FormData();
          formData.append('archivo', file);
          formData.append('tipo', newOCTipo);
          await fetch(`${IP()}/api/oc/${id}/factura`, { method: 'POST', body: formData });
        }
      }
      navigate('/compras');
    });
    socket.emit('guardar-orden-compra', { proveedor: proveedorId, fecha, items: buildItems(), notas });
  };

  const handleSaveDraft = async () => {
    if (!proveedorId) { await dialog.alert('Seleccioná un proveedor para guardar el borrador'); return; }
    submitNuevaOC();
  };

  const handleCreate = async () => {
    if (!proveedorId) { await dialog.alert('Seleccioná un proveedor'); return; }
    if (items.length === 0 || !items[0].descripcion) { await dialog.alert('Agregá al menos un producto'); return; }
    submitNuevaOC();
  };

  // ── Detail handlers ──
  const cambiarEstado = (nuevoEstado) => {
    socket.emit('cambiar-estado-oc', { id, estado: nuevoEstado });
  };

  const cancelarOC = async () => {
    if (await dialog.confirm('Cancelar esta Orden de Compra?')) {
      socket.emit('cancelar-orden-compra', id);
    }
  };

  const handlePago = (irACaja) => {
    if (!pagoMonto || Number(pagoMonto) <= 0) return;
    const monto = Number(pagoMonto);
    socket.emit('guardar-pago-proveedor', {
      ordenCompra: id,
      monto,
      metodo: pagoMetodo,
      notas: pagoNotas,
      concepto: pagoConcepto,
    });
    const conceptoLabel = pagoConcepto === 'flete' ? 'Flete' : 'Factura';
    const desc = `Pago ${conceptoLabel} - ${orden.proveedorNombre || ''} (${orden.numero || ''})`;
    setShowPayForm(false);
    setPagoMonto('');
    setPagoNotas('');
    setPagoConcepto('factura');
    setPagoMetodo('efectivo');
    if (irACaja) {
      if (pagoMetodo === 'efectivo') {
        navigate('/caja', {
          state: {
            prefill: {
              descripcion: desc,
              monto: -(Math.abs(monto)),
              nombre: orden.proveedorNombre || '',
              tipoOperacion: 'GASTO',
            },
          },
        });
      } else {
        navigate('/caja', {
          state: { tab: 'mercadopago' },
        });
      }
    }
  };

  // ── Flete handlers ──
  const handleAgregarFlete = () => {
    if (!fleteMonto || Number(fleteMonto) <= 0) return;
    socket.emit('agregar-flete-oc', {
      ordenCompraId: id,
      descripcion: fleteDescripcion || 'Flete',
      monto: Number(fleteMonto),
    });
    setShowFleteForm(false);
    setFleteDescripcion('');
    setFleteMonto('');
  };

  const handleEliminarFlete = async (index) => {
    if (!await dialog.confirm('Eliminar este flete?')) return;
    socket.emit('eliminar-flete-oc', { ordenCompraId: id, fleteIndex: index });
  };

  // ── Upload factura handlers ──
  const handleUploadFactura = async () => {
    if (!uploadFiles.length) { await dialog.alert('Seleccioná al menos un archivo'); return; }
    setUploadLoading(true);
    try {
      for (const file of uploadFiles) {
        const formData = new FormData();
        formData.append('archivo', file);
        formData.append('tipo', uploadTipo);
        formData.append('fecha', uploadFecha);
        formData.append('monto', uploadMonto);
        const res = await fetch(`${IP()}/api/oc/${id}/factura`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Error al subir ' + file.name);
      }
      setUploadFiles([]);
    } catch (err) {
      await dialog.alert(err.message || 'Error al subir el archivo');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDeleteFactura = async (idx) => {
    if (!await dialog.confirm('Eliminar esta factura?')) return;
    await fetch(`${IP()}/api/oc/${id}/factura/${idx}`, { method: 'DELETE' });
  };

  // ── Edit OC handlers ──
  const initEdit = () => {
    if (!orden) return;
    setEditProveedorId(orden.proveedorId || '');
    const firstFactura = orden.facturas?.[0];
    const fechaISO = firstFactura?.fecha
      ? firstFactura.fecha.slice(0, 10)
      : new Date(orden.createdAt).toISOString().slice(0, 10);
    setEditFecha(fechaISO);
    setEditItems((orden.items || []).map((it) => {
      const precio = it.precioUnitario || 0;
      return {
        descripcion: it.nombre || '',
        cantidad: it.cantidadSolicitada || 1,
        precioUnitario: fmtPrice(precio),
        precioConIVA: fmtPrice(round2(precio * 1.21)),
        bonif: it.bonif || 0,
        tipoPrecio: 'unidad',
      };
    }));
    if (firstFactura?.numero) {
      const m = firstFactura.numero.match(/^(A|C|REMITO)\s+(.+)$/);
      if (m) { setEditFacturaType(m[1]); setEditFactura(m[2]); }
      else { setEditFacturaType('A'); setEditFactura(firstFactura.numero); }
    } else {
      setEditFacturaType('A');
      setEditFactura('');
    }
    setEditNotas(orden.notas || '');
    setEditBonifOpen(new Set());
    setEditMode(true);
  };

  const handleEditItemChange = (index, field, value) => {
    setEditItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: value };
      if (field === 'precioUnitario') {
        const num = parsePrice(value);
        item.precioConIVA = num ? String(round2(num * 1.21)) : '';
      } else if (field === 'precioConIVA') {
        const num = parsePrice(value);
        item.precioUnitario = num ? String(round2(num / 1.21)) : '';
      }
      copy[index] = item;
      return copy;
    });
  };

  const handleEditItemBlur = (index, field) => {
    setEditItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      const num = parsePrice(item[field]);
      item[field] = num ? fmtPrice(num) : '';
      if (field === 'precioUnitario') {
        item.precioConIVA = num ? fmtPrice(round2(num * 1.21)) : '';
      } else if (field === 'precioConIVA') {
        item.precioUnitario = num ? fmtPrice(round2(num / 1.21)) : '';
      }
      copy[index] = item;
      return copy;
    });
  };

  const toggleEditBonifOpen = (i) => {
    setEditBonifOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const addEditItem = () => setEditItems((prev) => [...prev, { ...EMPTY_ITEM }]);

  const removeEditItem = (index) => {
    setEditBonifOpen((prev) => {
      const next = new Set();
      prev.forEach((i) => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
      return next;
    });
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  const editItemSubSinIVA = (it) => getRealQty(it) * getUnitPrice(it, 'precioUnitario', parsePrice) * (1 - (Number(it.bonif) || 0) / 100);
  const editItemSubConIVA = (it) => getRealQty(it) * getUnitPrice(it, 'precioConIVA', parsePrice) * (1 - (Number(it.bonif) || 0) / 100);
  const editTotalSinIVA = () => editItems.reduce((sum, it) => sum + editItemSubSinIVA(it), 0);
  const editTotalConIVA = () => editItems.reduce((sum, it) => sum + editItemSubConIVA(it), 0);

  const handleSave = async () => {
    if (!editProveedorId) { await dialog.alert('Seleccioná un proveedor'); return; }
    if (editItems.length === 0 || !editItems[0].descripcion) { await dialog.alert('Agregá al menos un producto'); return; }
    socket.emit('actualizar-orden-compra', {
      id,
      proveedor: editProveedorId,
      fecha: editFecha,
      items: editItems.map((it) => {
        const cant = Number(it.cantidad) || 1;
        return {
          descripcion: it.descripcion,
          cantidad: it.tipoPrecio === 'caja6' ? cant * 6 : cant,
          precioUnitario: getUnitPrice(it, 'precioUnitario', parsePrice),
          bonif: Number(it.bonif) || 0,
        };
      }),
      factura: editFactura ? `${editFacturaType} ${editFactura}` : '',
      notas: editNotas,
    });
    setEditMode(false);
  };

  // ── NEW OC VIEW ──
  if (isNew) {
    return (
      <div className={s.container}>
        <Link to="/compras" className={s.backLink}>
          <i className="bi bi-arrow-left" /> Volver a Compras
        </Link>

        {/* OCR Upload */}
        <div className={s.ocrCard}>
          <div className={s.ocrContent}>
            <i className="bi bi-stars" />
            <div className={s.ocrText}>
              <strong>Cargar factura con IA</strong>
              <span>Subi una foto de la factura y se completan los datos automaticamente</span>
            </div>
            <label className={s.ocrBtn} style={{ opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' }}>
              <><i className="bi bi-upload" /> Subir factura</>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleOcrUpload}
                disabled
              />
            </label>
          </div>
          {ocrError && <div className={s.ocrError}><i className="bi bi-exclamation-triangle" /> {ocrError}</div>}
        </div>

        <div className={s.card}>
          <h3 className={s.cardTitle}>Nueva Orden de Compra</h3>

          <div className={s.formRow}>
            <div className={s.inputGroup}>
              <span>Proveedor *</span>
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">-- Seleccionar --</option>
                {proveedores.map((p) => (
                  <option key={p._id} value={p._id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div className={s.inputGroup}>
              <span>Fecha de la factura</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          {/* Preview proveedor */}
          {proveedorId && (() => {
            const prov = proveedores.find((p) => p._id === proveedorId);
            if (!prov) return null;
            const campos = [
              { label: 'CUIT', value: prov.cuit },
              { label: 'Telefono', value: prov.telefono },
              { label: 'Email', value: prov.email },
              { label: 'CBU', value: prov.cbu },
              { label: 'Banco', value: prov.banco },
              { label: 'Alias', value: prov.alias },
              { label: 'Contacto', value: prov.contacto },
              { label: 'Cond. pago', value: prov.condicionPago },
            ].filter((c) => c.value);
            if (campos.length === 0) return null;
            return (
              <div className={s.proveedorPreview}>
                {campos.map((c) => (
                  <div key={c.label} className={s.proveedorPreviewItem}>
                    <span className={s.proveedorPreviewLabel}>{c.label}</span>
                    <span className={s.proveedorPreviewValue}>{c.value}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Items table */}
          <table className={s.itemsTable}>
            <thead>
              <tr>
                <th>Descripcion</th>
                <th style={{ width: 80 }}>Cantidad</th>
                <th style={{ width: 80 }}>Precio x</th>
                <th style={{ width: 110 }}>Precio s/IVA</th>
                <th style={{ width: 110 }}>Precio c/IVA</th>
                <th style={{ width: 55 }}>Bonif.</th>
                <th style={{ width: 105 }}>Subtotal s/IVA</th>
                <th style={{ width: 105 }}>Subtotal c/IVA</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className={s.itemInput}
                      type="text"
                      value={item.descripcion}
                      onChange={(e) => handleItemChange(i, 'descripcion', e.target.value)}
                      placeholder="Producto"
                    />
                  </td>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:3}}>
                      <input
                        className={s.itemInput}
                        type="number"
                        min="1"
                        value={item.cantidad}
                        onChange={(e) => handleItemChange(i, 'cantidad', e.target.value)}
                        title={item.tipoPrecio === 'caja6' ? `${item.cantidad} caja(s) = ${getRealQty(item)} unid.` : ''}
                      />
                      {item.tipoPrecio === 'caja6' && <span style={{fontSize:'0.65rem',color:'var(--info)',whiteSpace:'nowrap'}}>{getRealQty(item)}u</span>}
                    </div>
                  </td>
                  <td>
                    <div className={s.tipoPrecioToggle}>
                      <button type="button" className={`${s.tipoPrecioBtn} ${(item.tipoPrecio || 'unidad') === 'unidad' ? s.tipoPrecioActive : ''}`}
                        onClick={() => handleItemChange(i, 'tipoPrecio', 'unidad')} title="Precio por unidad">
                        <span style={{fontSize:'0.65rem',marginRight:2}}>1</span><svg width="12" height="14" viewBox="0 0 12 16" fill="currentColor"><rect x="4.5" y="0" width="3" height="4" rx="0.5"/><path d="M4 4.5h4L9 8.5v5.5a2 2 0 01-2 2H5a2 2 0 01-2-2V8.5L4 4.5z"/></svg>
                      </button>
                      <button type="button" className={`${s.tipoPrecioBtn} ${item.tipoPrecio === 'caja6' ? s.tipoPrecioActive : ''}`}
                        onClick={() => handleItemChange(i, 'tipoPrecio', 'caja6')} title="Precio por caja de 6">
                        <span style={{fontSize:'0.65rem',marginRight:2}}>6</span><i className="bi bi-box-seam" />
                      </button>
                    </div>
                  </td>
                  <td>
                    <input
                      className={s.itemInput}
                      type="text"
                      inputMode="decimal"
                      value={item.precioUnitario}
                      onChange={(e) => handleItemChange(i, 'precioUnitario', e.target.value)}
                      onBlur={() => handleItemBlur(i, 'precioUnitario')}
                    />
                  </td>
                  <td>
                    <input
                      className={s.itemInput}
                      type="text"
                      inputMode="decimal"
                      value={item.precioConIVA}
                      onChange={(e) => handleItemChange(i, 'precioConIVA', e.target.value)}
                      onBlur={() => handleItemBlur(i, 'precioConIVA')}
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {(bonifOpen.has(i) || Number(item.bonif) > 0) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <input
                          className={s.itemInput}
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={item.bonif || ''}
                          onChange={(e) => handleItemChange(i, 'bonif', e.target.value)}
                          placeholder="0"
                          autoFocus={bonifOpen.has(i) && !Number(item.bonif)}
                          style={{ ...(Number(item.bonif) > 0 ? { borderColor: 'var(--success)', color: 'var(--success)', fontWeight: 700 } : {}), width: 44 }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
                      </div>
                    ) : (
                      <button
                        className={s.removeBtn}
                        style={{ color: 'var(--text-muted)', fontSize: 14 }}
                        onClick={() => toggleBonifOpen(i)}
                        title="Agregar bonificacion"
                      >
                        <i className="bi bi-tag" />
                      </button>
                    )}
                  </td>
                  <td style={Number(item.bonif) === 100 ? { color: 'var(--success)', fontWeight: 700 } : {}}>
                    {Number(item.bonif) === 100 ? 'Gratis' : money(itemSubSinIVA(item))}
                  </td>
                  <td style={Number(item.bonif) === 100 ? { color: 'var(--success)', fontWeight: 700 } : {}}>
                    {Number(item.bonif) === 100 ? 'Gratis' : money(itemSubConIVA(item))}
                  </td>
                  <td>
                    <button className={s.removeBtn} onClick={() => removeItem(i)} title="Quitar">
                      <i className="bi bi-trash" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Total */}
              <tr className={s.totalRow}>
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
                <td style={{ fontWeight: 700 }}>{money(totalSinIVA())}</td>
                <td style={{ fontWeight: 700 }}>{money(totalConIVA())}</td>
                <td />
              </tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className={s.addRowBtn} onClick={addItem}>
              <i className="bi bi-plus" /> Agregar item
            </button>
          </div>

          <div style={{ marginTop: 8 }}>
            <div className={s.inputGroup}>
              <span>Notas</span>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones" />
            </div>
          </div>

          {/* Adjuntar comprobante */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div className={s.inputGroup} style={{ marginBottom: 10 }}>
              <span>¿Qué es? (opcional)</span>
              <select value={newOCTipo} onChange={(e) => setNewOCTipo(e.target.value)}>
                <option value="Factura">Factura</option>
                <option value="Remito">Remito</option>
              </select>
            </div>
            <label className={`${s.dropzone} ${newOCFiles.length > 0 ? s.dropzoneActive : ''}`}>
              <input type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }}
                onChange={(e) => setNewOCFiles(Array.from(e.target.files || []))} />
              {newOCFiles.length === 0 ? (
                <>
                  <i className={`bi bi-cloud-upload ${s.dropzoneIcon}`} />
                  <span className={s.dropzoneText}>Adjuntar factura o remito (opcional)<br /><small>PDF o imagen · podés seleccionar varios</small></span>
                </>
              ) : (
                <>
                  <i className={`bi bi-check-circle ${s.dropzoneIcon}`} style={{ color: 'var(--success)' }} />
                  <div className={s.dropzoneFiles}>
                    {newOCFiles.map((f, i) => (
                      <span key={i} className={s.dropzoneFile}>
                        <i className="bi bi-paperclip" /> {f.name}
                      </span>
                    ))}
                  </div>
                  <span className={s.dropzoneText} style={{ fontSize: 11 }}>Hacé click para cambiar</span>
                </>
              )}
            </label>
          </div>

          <div className={s.btnRow}>
            <button className={s.btnPrimary} onClick={handleCreate}>Crear Orden de Compra</button>
            <button className={s.btnOutline} onClick={handleSaveDraft}>
              <i className="bi bi-floppy" /> Guardar borrador
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (!orden) {
    return (
      <div className={s.container}>
        <Link to="/compras" className={s.backLink}>
          <i className="bi bi-arrow-left" /> Volver a Compras
        </Link>
        <div className={s.card} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Cargando orden de compra...
        </div>
      </div>
    );
  }

  const totalConIVAOrden = round2((orden.total || 0) * 1.21);
  const saldoFactura = totalConIVAOrden - (orden.totalPagado || 0);
  const saldoFlete = (orden.totalFletes || 0) - (orden.totalPagadoFlete || 0);
  const saldo = saldoFactura + saldoFlete;

  // ── EDIT VIEW ──
  if (editMode) {
    return (<>
      <div className={s.container}>
        <Link to="/compras" className={s.backLink}>
          <i className="bi bi-arrow-left" /> Volver a Compras
        </Link>
        <div className={s.header}>
          <h2 className={s.headerTitle}>Editar OC #{orden.numero || '-'}</h2>
          <div className={s.headerActions}>
            <button className={s.btnPrimary} onClick={handleSave}>Guardar cambios</button>
            <button className={s.btnOutline} onClick={() => setEditMode(false)}>Cancelar</button>
          </div>
        </div>

        <div className={s.card}>
          <div className={s.formRow}>
            <div className={s.inputGroup}>
              <span>Proveedor *</span>
              <select value={editProveedorId} onChange={(e) => setEditProveedorId(e.target.value)}>
                <option value="">-- Seleccionar --</option>
                {proveedores.map((p) => (
                  <option key={p._id} value={p._id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div className={s.inputGroup}>
              <span>Fecha de la factura</span>
              <input type="date" value={editFecha} onChange={(e) => setEditFecha(e.target.value)} />
            </div>
          </div>

          <div className={s.formRow}>
            <div className={s.inputGroup}>
              <span>Tipo de comprobante</span>
              <select value={editFacturaType} onChange={(e) => setEditFacturaType(e.target.value)}>
                <option value="A">Factura A</option>
                <option value="C">Factura C</option>
                <option value="REMITO">Remito</option>
              </select>
            </div>
            <div className={s.inputGroup}>
              <span>Nro de factura</span>
              <input type="text" value={editFactura} onChange={(e) => setEditFactura(e.target.value)} placeholder="Ej: 0001-00001234" />
            </div>
          </div>

          {/* Preview proveedor */}
          {editProveedorId && (() => {
            const prov = proveedores.find((p) => p._id === editProveedorId);
            if (!prov) return null;
            const campos = [
              { label: 'CUIT', value: prov.cuit },
              { label: 'Telefono', value: prov.telefono },
              { label: 'Email', value: prov.email },
              { label: 'CBU', value: prov.cbu },
              { label: 'Banco', value: prov.banco },
              { label: 'Alias', value: prov.alias },
              { label: 'Contacto', value: prov.contacto },
              { label: 'Cond. pago', value: prov.condicionPago },
            ].filter((c) => c.value);
            if (campos.length === 0) return null;
            return (
              <div className={s.proveedorPreview}>
                {campos.map((c) => (
                  <div key={c.label} className={s.proveedorPreviewItem}>
                    <span className={s.proveedorPreviewLabel}>{c.label}</span>
                    <span className={s.proveedorPreviewValue}>{c.value}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          <table className={s.itemsTable}>
            <thead>
              <tr>
                <th>Descripcion</th>
                <th style={{ width: 80 }}>Cantidad</th>
                <th style={{ width: 80 }}>Precio x</th>
                <th style={{ width: 110 }}>Precio s/IVA</th>
                <th style={{ width: 110 }}>Precio c/IVA</th>
                <th style={{ width: 55 }}>Bonif.</th>
                <th style={{ width: 105 }}>Subtotal s/IVA</th>
                <th style={{ width: 105 }}>Subtotal c/IVA</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {editItems.map((item, i) => (
                <tr key={i}>
                  <td>
                    <input className={s.itemInput} type="text" value={item.descripcion}
                      onChange={(e) => handleEditItemChange(i, 'descripcion', e.target.value)}
                      placeholder="Producto" />
                  </td>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:3}}>
                      <input className={s.itemInput} type="number" min="1" value={item.cantidad}
                        onChange={(e) => handleEditItemChange(i, 'cantidad', e.target.value)}
                        title={item.tipoPrecio === 'caja6' ? `${item.cantidad} caja(s) = ${getRealQty(item)} unid.` : ''} />
                      {item.tipoPrecio === 'caja6' && <span style={{fontSize:'0.65rem',color:'var(--info)',whiteSpace:'nowrap'}}>{getRealQty(item)}u</span>}
                    </div>
                  </td>
                  <td>
                    <div className={s.tipoPrecioToggle}>
                      <button type="button" className={`${s.tipoPrecioBtn} ${(item.tipoPrecio || 'unidad') === 'unidad' ? s.tipoPrecioActive : ''}`}
                        onClick={() => handleEditItemChange(i, 'tipoPrecio', 'unidad')} title="Precio por unidad">
                        <span style={{fontSize:'0.65rem',marginRight:2}}>1</span><svg width="12" height="14" viewBox="0 0 12 16" fill="currentColor"><rect x="4.5" y="0" width="3" height="4" rx="0.5"/><path d="M4 4.5h4L9 8.5v5.5a2 2 0 01-2 2H5a2 2 0 01-2-2V8.5L4 4.5z"/></svg>
                      </button>
                      <button type="button" className={`${s.tipoPrecioBtn} ${item.tipoPrecio === 'caja6' ? s.tipoPrecioActive : ''}`}
                        onClick={() => handleEditItemChange(i, 'tipoPrecio', 'caja6')} title="Precio por caja de 6">
                        <span style={{fontSize:'0.65rem',marginRight:2}}>6</span><i className="bi bi-box-seam" />
                      </button>
                    </div>
                  </td>
                  <td>
                    <input className={s.itemInput} type="text" inputMode="decimal" value={item.precioUnitario}
                      onChange={(e) => handleEditItemChange(i, 'precioUnitario', e.target.value)}
                      onBlur={() => handleEditItemBlur(i, 'precioUnitario')} />
                  </td>
                  <td>
                    <input className={s.itemInput} type="text" inputMode="decimal" value={item.precioConIVA}
                      onChange={(e) => handleEditItemChange(i, 'precioConIVA', e.target.value)}
                      onBlur={() => handleEditItemBlur(i, 'precioConIVA')} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {(editBonifOpen.has(i) || Number(item.bonif) > 0) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <input className={s.itemInput} type="number" min="0" max="100" step="1"
                          value={item.bonif || ''}
                          onChange={(e) => handleEditItemChange(i, 'bonif', e.target.value)}
                          placeholder="0"
                          autoFocus={editBonifOpen.has(i) && !Number(item.bonif)}
                          style={{ ...(Number(item.bonif) > 0 ? { borderColor: 'var(--success)', color: 'var(--success)', fontWeight: 700 } : {}), width: 44 }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
                      </div>
                    ) : (
                      <button className={s.removeBtn} style={{ color: 'var(--text-muted)', fontSize: 14 }}
                        onClick={() => toggleEditBonifOpen(i)} title="Agregar bonificacion">
                        <i className="bi bi-tag" />
                      </button>
                    )}
                  </td>
                  <td style={Number(item.bonif) === 100 ? { color: 'var(--success)', fontWeight: 700 } : {}}>
                    {Number(item.bonif) === 100 ? 'Gratis' : money(editItemSubSinIVA(item))}
                  </td>
                  <td style={Number(item.bonif) === 100 ? { color: 'var(--success)', fontWeight: 700 } : {}}>
                    {Number(item.bonif) === 100 ? 'Gratis' : money(editItemSubConIVA(item))}
                  </td>
                  <td>
                    <button className={s.removeBtn} onClick={() => removeEditItem(i)} title="Quitar">
                      <i className="bi bi-trash" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className={s.totalRow}>
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
                <td style={{ fontWeight: 700 }}>{money(editTotalSinIVA())}</td>
                <td style={{ fontWeight: 700 }}>{money(editTotalConIVA())}</td>
                <td />
              </tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button className={s.addRowBtn} onClick={addEditItem}>
              <i className="bi bi-plus" /> Agregar item
            </button>
          </div>

          <div style={{ marginTop: 8 }}>
            <div className={s.inputGroup}>
              <span>Notas</span>
              <textarea value={editNotas} onChange={(e) => setEditNotas(e.target.value)} placeholder="Observaciones" />
            </div>
          </div>

          {/* Adjuntar comprobantes */}
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', display: 'block', marginBottom: 12 }}>Facturas / Remitos adjuntos</span>

            <div className={s.inputGroup} style={{ marginBottom: 10 }}>
              <span>¿Qué es?</span>
              <select value={uploadTipo} onChange={(e) => setUploadTipo(e.target.value)}>
                <option value="Factura">Factura</option>
                <option value="Remito">Remito</option>
              </select>
            </div>
            <label className={`${s.dropzone} ${uploadFiles.length > 0 ? s.dropzoneActive : ''}`}>
              <input type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }}
                onChange={(e) => setUploadFiles(Array.from(e.target.files || []))} />
              {uploadFiles.length === 0 ? (
                <>
                  <i className={`bi bi-cloud-upload ${s.dropzoneIcon}`} />
                  <span className={s.dropzoneText}>Hacé click o arrastrá archivos aquí<br /><small>PDF o imagen · podés seleccionar varios</small></span>
                </>
              ) : (
                <>
                  <i className={`bi bi-check-circle ${s.dropzoneIcon}`} style={{ color: 'var(--success)' }} />
                  <div className={s.dropzoneFiles}>
                    {uploadFiles.map((f, i) => (
                      <span key={i} className={s.dropzoneFile}>
                        <i className="bi bi-paperclip" /> {f.name}
                      </span>
                    ))}
                  </div>
                  <span className={s.dropzoneText} style={{ fontSize: 11 }}>Hacé click para cambiar</span>
                </>
              )}
            </label>
            {uploadFiles.length > 0 && (
              <button className={s.btnPrimary} style={{ marginTop: 10, width: '100%' }} onClick={handleUploadFactura} disabled={uploadLoading}>
                {uploadLoading ? 'Subiendo...' : <><i className="bi bi-paperclip" /> Adjuntar {uploadFiles.length} archivo{uploadFiles.length > 1 ? 's' : ''}</>}
              </button>
            )}

            {(!orden.facturas || orden.facturas.length === 0) && uploadFiles.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '10px 0 0' }}>Sin comprobantes adjuntos</p>
            )}

            {(orden.facturas || []).map((f, i) => (
              <div key={i} className={s.facturaItem}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{f.numero || 'Comprobante'}</span>
                {f.archivo && (
                  <span onClick={() => setPreviewArchivo(f.archivo)} style={{ fontSize: 13, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <i className="bi bi-file-earmark-arrow-down" /> Ver archivo
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className={s.btnRow}>
            <button className={s.btnPrimary} onClick={handleSave}>Guardar cambios</button>
            <button className={s.btnOutline} onClick={() => setEditMode(false)}>Cancelar</button>
          </div>
        </div>
      </div>

      {previewArchivo && (
        <PreviewModal archivo={previewArchivo} onClose={() => setPreviewArchivo(null)} />
      )}
    </>
    );
  }

  return (
    <div className={s.container}>
      <Link to="/compras" className={s.backLink}>
        <i className="bi bi-arrow-left" /> Volver a Compras
      </Link>

      {/* Header */}
      <div className={s.header}>
        <h2 className={s.headerTitle}>OC #{orden.numero || '-'}</h2>
        <div className={s.headerBadges}>
          <Badge variant={orden.estado}>{ESTADOS[orden.estado] || orden.estado}</Badge>
          <Badge variant={orden.estadoPago}>{ESTADOS_PAGO[orden.estadoPago] || orden.estadoPago}</Badge>
        </div>
        <div className={s.headerActions}>
          {orden.estado === 'borrador' && (
            <button className={s.btnWarning} onClick={() => cambiarEstado('pendiente_aprobacion')}>
              Enviar a Aprobacion
            </button>
          )}
          {orden.estado === 'pendiente_aprobacion' && (
            <>
              <button className={s.btnSuccess} onClick={() => cambiarEstado('aprobada')}>Aprobar</button>
              <button className={s.btnDanger} onClick={() => cambiarEstado('borrador')}>Rechazar</button>
            </>
          )}
          {orden.estado === 'aprobada' && (
            <button className={s.btnInfo} onClick={() => cambiarEstado('enviada')}>Marcar Enviada</button>
          )}
          {orden.estado === 'enviada' && (
            <button className={s.btnInfo} onClick={() => cambiarEstado('en_camino')}>En Camino</button>
          )}
          {(orden.estado === 'recibida' || orden.estado === 'recibida_parcial') && orden.estadoPago !== 'pagado' && (
            <button className={s.btnSuccess} onClick={() => cambiarEstado('cerrada')}>Cerrar OC</button>
          )}
          {orden.estado !== 'cancelada' && orden.estado !== 'cerrada' && (
            <>
              <button className={s.btnOutline} onClick={initEdit}>
                <i className="bi bi-pencil" /> Editar
              </button>
              <button className={s.btnDanger} onClick={cancelarOC}>Cancelar OC</button>
            </>
          )}
          {orden.estadoPago !== 'pagado' && orden.estado !== 'cancelada' && (
            <button className={s.btnOutline} onClick={() => setShowPayForm(!showPayForm)}>
              <i className="bi bi-cash" /> Registrar Pago
            </button>
          )}
        </div>
      </div>

      {/* Pay form */}
      {showPayForm && (
        <div className={s.payForm}>
          <h4 className={s.payFormTitle}>Registrar Pago</h4>
          <div className={s.formRow}>
            <div className={s.inputGroup}>
              <span>Concepto</span>
              <div className={s.toggleGroup}>
                <button className={`${s.toggleBtn} ${pagoConcepto === 'factura' ? s.toggleBtnActive : ''}`} onClick={() => setPagoConcepto('factura')} type="button">
                  <i className="bi bi-receipt" /> Factura
                </button>
                <button className={`${s.toggleBtn} ${pagoConcepto === 'flete' ? s.toggleBtnActive : ''}`} onClick={() => setPagoConcepto('flete')} type="button">
                  <i className="bi bi-truck" /> Flete
                </button>
              </div>
            </div>
            <div className={s.inputGroup}>
              <span>Metodo</span>
              <div className={s.toggleGroup}>
                <button className={`${s.toggleBtn} ${pagoMetodo === 'efectivo' ? s.toggleBtnActive : ''}`} onClick={() => setPagoMetodo('efectivo')} type="button">
                  <i className="bi bi-cash" /> Efectivo
                </button>
                <button className={`${s.toggleBtn} ${pagoMetodo === 'digital' ? s.toggleBtnActive : ''}`} onClick={() => setPagoMetodo('digital')} type="button">
                  <i className="bi bi-phone" /> Digital
                </button>
              </div>
            </div>
          </div>
          <div className={s.formRow}>
            <div className={s.inputGroup} style={{ flex: 1 }}>
              <span>Monto</span>
              <NumericFormat
                className={s.payMontoInput}
                prefix="$ "
                thousandSeparator="."
                decimalSeparator=","
                value={pagoMonto}
                onValueChange={(v) => {
                  const max = pagoConcepto === 'flete' ? saldoFlete : saldoFactura;
                  const val = v.floatValue || 0;
                  setPagoMonto(val > max ? max : val);
                }}
                placeholder="$ 0"
                isAllowed={(v) => {
                  const max = pagoConcepto === 'flete' ? saldoFlete : saldoFactura;
                  return (v.floatValue || 0) <= max;
                }}
              />
              <span className={s.payMontoHelper}>de {money(pagoConcepto === 'flete' ? saldoFlete : saldoFactura)}</span>
            </div>
            <div className={s.inputGroup} style={{ flex: 1 }}>
              <span>Notas</span>
              <input type="text" value={pagoNotas} onChange={(e) => setPagoNotas(e.target.value)} />
            </div>
          </div>
          <div className={s.btnRow}>
            <button className={s.btnSuccess} onClick={() => handlePago(false)}>Confirmar Pago</button>
            <button className={s.btnInfo} onClick={() => handlePago(true)}>
              <i className="bi bi-box-arrow-up-right" /> Confirmar e ir a Caja
            </button>
            <button className={s.btnOutline} onClick={() => setShowPayForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Detail grid */}
      <div className={s.detailGrid}>
        {/* Products */}
        <div className={s.card}>
          <h3 className={s.cardTitle}>Productos</h3>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Descripcion</th>
                <th>Cant.</th>
                <th>Precio s/IVA</th>
                {(orden.totalFletes > 0) && <th>Flete/u</th>}
                {(orden.totalFletes > 0) && <th>Costo Total/u</th>}
                <th>Subtotal c/IVA</th>
              </tr>
            </thead>
            <tbody>
              {(orden.items || []).length === 0 ? (
                <tr className={s.emptyRow}><td colSpan={orden.totalFletes > 0 ? 6 : 4}>Sin productos</td></tr>
              ) : (orden.items || []).map((it, i) => {
                const cant = (it.cantidadSolicitada ?? it.cantidad) || 0;
                const pSin = it.precioUnitario || 0;
                const pCon = round2(pSin * 1.21);
                const bonif = 1 - (it.bonif || 0) / 100;
                const fpu = orden.fletePorUnidad || 0;
                return (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{it.nombre || it.descripcion}</td>
                    <td>{cant}</td>
                    <td>{money(pSin)}</td>
                    {(orden.totalFletes > 0) && <td style={{ color: 'var(--info)' }}>{money(fpu)}</td>}
                    {(orden.totalFletes > 0) && <td style={{ fontWeight: 600 }}>{money(pCon + fpu)}</td>}
                    <td>{money(cant * pCon * bonif)}</td>
                  </tr>
                );
              })}
              <tr className={s.totalRow}>
                <td colSpan={orden.totalFletes > 0 ? 5 : 3} style={{ textAlign: 'right', fontWeight: 700 }}>Total c/IVA</td>
                <td style={{ fontWeight: 700 }}>{money(round2((orden.total || 0) * 1.21))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Finanzas */}
        <div>
          <div className={s.card} style={{ marginBottom: 20 }}>
            <h3 className={s.cardTitle}>Finanzas</h3>
            <div className={s.finanzasGrid}>
              <div className={s.finanzasItem}>
                <span className={s.finanzasLabel}>Factura c/IVA</span>
                <span className={s.finanzasValue}>{money(totalConIVAOrden)}</span>
              </div>
              <div className={s.finanzasItem}>
                <span className={s.finanzasLabel}>Pagado factura</span>
                <span className={`${s.finanzasValue} ${s.finanzasValueSuccess}`}>{money(orden.totalPagado)}</span>
              </div>
              <div className={s.finanzasItem}>
                <span className={s.finanzasLabel}>Saldo factura</span>
                <span className={`${s.finanzasValue} ${saldoFactura > 0 ? s.finanzasValueDanger : s.finanzasValueSuccess}`}>
                  {money(saldoFactura)}
                </span>
              </div>
            </div>
            {(orden.totalFletes || 0) > 0 && (
              <div className={s.finanzasGrid} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div className={s.finanzasItem}>
                  <span className={s.finanzasLabel}>Total fletes</span>
                  <span className={s.finanzasValue}>{money(orden.totalFletes)}</span>
                </div>
                <div className={s.finanzasItem}>
                  <span className={s.finanzasLabel}>Pagado flete</span>
                  <span className={`${s.finanzasValue} ${s.finanzasValueSuccess}`}>{money(orden.totalPagadoFlete)}</span>
                </div>
                <div className={s.finanzasItem}>
                  <span className={s.finanzasLabel}>Saldo flete</span>
                  <span className={`${s.finanzasValue} ${saldoFlete > 0 ? s.finanzasValueDanger : s.finanzasValueSuccess}`}>
                    {money(saldoFlete)}
                  </span>
                </div>
              </div>
            )}
            <div className={s.finanzasGrid} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div className={s.finanzasItem}>
                <span className={s.finanzasLabel}>Saldo total</span>
                <span className={`${s.finanzasValue} ${saldo > 0 ? s.finanzasValueDanger : s.finanzasValueSuccess}`}>
                  {money(saldo)}
                </span>
              </div>
              <div className={s.finanzasItem}>
                <span className={s.finanzasLabel}>Estado Pago</span>
                <Badge variant={orden.estadoPago}>{ESTADOS_PAGO[orden.estadoPago] || orden.estadoPago}</Badge>
              </div>
            </div>
          </div>

          {/* Facturas */}
          <div className={s.card}>
            <h3 className={s.cardTitle}>Facturas / Remitos</h3>

            {(!orden.facturas || orden.facturas.length === 0) && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Sin comprobantes adjuntos</p>
            )}

            {(orden.facturas || []).map((f, i) => (
              <div key={i} className={s.facturaItem}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{f.numero || 'Comprobante'}</span>
                {f.archivo && (
                  <span onClick={() => setPreviewArchivo(f.archivo)} style={{ fontSize: 13, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <i className="bi bi-file-earmark-arrow-down" /> Ver archivo
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Fletes */}
          <div className={s.card}>
            <h3 className={s.cardTitle}>Fletes</h3>

            {(orden.fletes || []).length === 0 && !showFleteForm && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Sin fletes cargados</p>
            )}

            {(orden.fletes || []).map((f, i) => (
              <div key={i} className={s.facturaItem}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{f.descripcion || 'Flete'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.fecha}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{money(f.monto)}</span>
                  {orden.estado !== 'cancelada' && orden.estado !== 'cerrada' && (
                    <button className={s.removeBtn} onClick={() => handleEliminarFlete(i)} title="Eliminar flete">
                      <i className="bi bi-trash" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {(orden.fletes || []).length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Total fletes</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{money(orden.totalFletes)}</span>
              </div>
            )}

            {(orden.fletes || []).length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Flete por unidad</span>
                <span style={{ fontSize: 13, color: 'var(--info)', fontWeight: 600 }}>{money(orden.fletePorUnidad)}</span>
              </div>
            )}

            {orden.estado !== 'cancelada' && orden.estado !== 'cerrada' && (
              <>
                {showFleteForm ? (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div className={s.formRow}>
                      <div className={s.inputGroup}>
                        <span>Descripcion</span>
                        <input type="text" value={fleteDescripcion} onChange={(e) => setFleteDescripcion(e.target.value)} placeholder="Ej: Flete Mendoza" />
                      </div>
                      <div className={s.inputGroup}>
                        <span>Monto *</span>
                        <input type="number" min="0" value={fleteMonto} onChange={(e) => setFleteMonto(e.target.value)} placeholder="0" />
                      </div>
                    </div>
                    <div className={s.btnRow} style={{ marginTop: 8 }}>
                      <button className={s.btnSuccess} onClick={handleAgregarFlete}>Agregar flete</button>
                      <button className={s.btnOutline} onClick={() => { setShowFleteForm(false); setFleteDescripcion(''); setFleteMonto(''); }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button className={s.btnOutline} style={{ marginTop: 10, width: '100%' }} onClick={() => setShowFleteForm(true)}>
                    <i className="bi bi-truck" /> Agregar flete
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Proveedor info */}
      {orden.proveedor && (
        <div className={s.card}>
          <h3 className={s.cardTitle}>Proveedor</h3>
          <div className={s.finanzasGrid}>
            <div className={s.finanzasItem}>
              <span className={s.finanzasLabel}>Nombre</span>
              <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{orden.proveedor.nombre}</span>
            </div>
            <div className={s.finanzasItem}>
              <span className={s.finanzasLabel}>CUIT</span>
              <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{orden.proveedor.cuit || '-'}</span>
            </div>
            <div className={s.finanzasItem}>
              <span className={s.finanzasLabel}>Contacto</span>
              <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{orden.proveedor.contacto || '-'}</span>
            </div>
            <div className={s.finanzasItem}>
              <span className={s.finanzasLabel}>Telefono</span>
              <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{orden.proveedor.telefono || '-'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {orden.timeline && orden.timeline.length > 0 && (
        <div className={s.card}>
          <h3 className={s.cardTitle}>Historial</h3>
          <Timeline entries={orden.timeline} />
        </div>
      )}

      {/* Notas */}
      {orden.notas && (
        <div className={s.card}>
          <h3 className={s.cardTitle}>Notas</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>{orden.notas}</p>
        </div>
      )}

      {/* Modal preview archivo */}
      {previewArchivo && (
        <PreviewModal archivo={previewArchivo} onClose={() => setPreviewArchivo(null)} />
      )}
    </div>
  );
}

function PreviewModal({ archivo, onClose }) {
  const blobUrl = useMemo(() => dataUriToBlobUrl(archivo), [archivo]);
  const isImage = archivo?.match(/^data:image\//);

  useEffect(() => {
    return () => { if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={s.previewOverlay} onClick={onClose}>
      <div className={s.previewModal} onClick={(e) => e.stopPropagation()}>
        <button className={s.previewClose} onClick={onClose}>
          <i className="bi bi-x-lg" />
        </button>
        {isImage
          ? <img src={archivo} alt="Preview" className={s.previewImg} />
          : <iframe src={blobUrl} className={s.previewFrame} title="Preview" />
        }
      </div>
    </div>
  );
}
