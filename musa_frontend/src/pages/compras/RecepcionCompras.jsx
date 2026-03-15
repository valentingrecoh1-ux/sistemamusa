import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { socket } from '../../main';
import { IP } from '../../main';
import Badge from '../../components/shared/Badge';
import s from './RecepcionCompras.module.css';

const ESTADOS = { borrador: 'Borrador', pendiente_aprobacion: 'Pend. Aprobacion', aprobada: 'Aprobada', enviada: 'Enviada', en_camino: 'En Camino', recibida_parcial: 'Recibida Parcial', recibida: 'Recibida', cerrada: 'Cerrada', cancelada: 'Cancelada' };

const EMPTY_PROD = { nombre: '', bodega: '', cepa: '', year: '', origen: '', codigo: '', costo: '', venta: '', cantidad: 0, tipo: 'vino' };

export default function RecepcionCompras({ usuario }) {
  const [ordenes, setOrdenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [selectedOC, setSelectedOC] = useState(null);
  const [cantidades, setCantidades] = useState({});
  const [vinculaciones, setVinculaciones] = useState({});
  const [searchProd, setSearchProd] = useState({});
  const [crearModal, setCrearModal] = useState(null); // index of item to link after creation
  const [newProd, setNewProd] = useState(EMPTY_PROD);
  const [creando, setCreando] = useState(false);
  const [scannerIdx, setScannerIdx] = useState(null); // index of item being scanned
  const [scanResult, setScanResult] = useState(null);
  const scannerRef = useRef(null);

  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1200;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }, []);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current.clear().catch(() => {});
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback((itemIndex) => {
    setScannerIdx(itemIndex);
    setScanResult(null);
    setTimeout(() => {
      const html5QrCode = new Html5Qrcode('barcode-reader');
      scannerRef.current = html5QrCode;
      html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 30, qrbox: { width: 350, height: 180 }, formatsToSupport: [2, 11, 12] },
        (decodedText) => {
          playBeep();
          setScanResult(decodedText);
          html5QrCode.stop().catch(() => {});
          // Search for product by codigo
          const found = productos.find((p) =>
            p.codigo && p.codigo.toLowerCase() === decodedText.toLowerCase()
          );
          if (found) {
            handleVinculacion(itemIndex, found._id);
            setScannerIdx(null);
            setScanResult(null);
          }
        },
      ).catch((err) => {
        console.error('Error starting scanner:', err);
      });
    }, 300);
  }, [productos, playBeep]);

  const closeScannerModal = useCallback(() => {
    stopScanner();
    setScannerIdx(null);
    setScanResult(null);
  }, [stopScanner]);

  useEffect(() => {
    socket.on('response-ordenes-compra', (data) => {
      const ocs = data.ordenes || data || [];
      setOrdenes(ocs.filter((oc) =>
        ['aprobada', 'enviada', 'en_camino', 'recibida_parcial'].includes(oc.estado)
      ));
    });
    socket.on('response-productos-simple', (data) => {
      setProductos(data || []);
    });
    socket.on('cambios', () => {
      socket.emit('request-ordenes-compra', {});
      socket.emit('request-productos-simple');
    });

    socket.emit('request-ordenes-compra', {});
    socket.emit('request-productos-simple');

    return () => {
      socket.off('response-ordenes-compra');
      socket.off('response-productos-simple');
      socket.off('cambios');
    };
  }, []);

  const handleSelectOC = (oc) => {
    setSelectedOC(oc);
    const initial = {};
    const vincInit = {};
    (oc.items || []).forEach((item, i) => {
      const pendiente = (item.cantidadSolicitada || 0) - (item.cantidadRecibida || 0);
      initial[i] = pendiente > 0 ? pendiente : 0;
      vincInit[i] = item.productoId || '';
    });
    setCantidades(initial);
    setVinculaciones(vincInit);
    setSearchProd({});
  };

  const handleQtyChange = (index, value) => {
    const item = selectedOC.items[index];
    const pendiente = (item.cantidadSolicitada || 0) - (item.cantidadRecibida || 0);
    const val = Math.max(0, Math.min(pendiente, Number(value) || 0));
    setCantidades((prev) => ({ ...prev, [index]: val }));
  };

  const handleVinculacion = (index, prodId) => {
    setVinculaciones((prev) => ({ ...prev, [index]: prodId }));
    setSearchProd((prev) => ({ ...prev, [index]: undefined }));
  };

  const generateEAN13 = useCallback(() => {
    const timestamp = Date.now().toString().slice(0, 12);
    const modified = timestamp.replace(/^1/, '8');
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const d = parseInt(modified.charAt(i));
      sum += i % 2 === 0 ? d : d * 3;
    }
    const r = sum % 10;
    const check = r === 0 ? 0 : 10 - r;
    setNewProd((p) => ({ ...p, codigo: modified + check }));
  }, []);

  const openCrearModal = (index) => {
    const item = selectedOC?.items?.[index];
    setCrearModal(index);
    setNewProd({
      ...EMPTY_PROD,
      nombre: item?.nombre || '',
      bodega: selectedOC?.proveedorBodega || selectedOC?.proveedorNombre || '',
      costo: item?.precioUnitario || '',
    });
    setSearchProd((prev) => ({ ...prev, [index]: undefined }));
  };

  const handleCrearProducto = async () => {
    if (!newProd.nombre) return;
    setCreando(true);
    try {
      const formData = new FormData();
      Object.entries(newProd).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) formData.append(k, v);
      });
      const res = await fetch(`${IP()}/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.status === 'ok' && data.producto) {
        // Link the new product to the item
        handleVinculacion(crearModal, data.producto._id);
        socket.emit('request-productos-simple');
      }
    } catch (err) {
      console.error('Error creando producto:', err);
    }
    setCreando(false);
    setCrearModal(null);
    setNewProd(EMPTY_PROD);
  };

  const handleSubmit = () => {
    if (!selectedOC) return;
    const items = (selectedOC.items || []).map((item, i) => ({
      index: i,
      nombre: item.nombre,
      cantidadRecibida: cantidades[i] || 0,
      productoId: vinculaciones[i] || item.productoId || '',
    })).filter((it) => it.cantidadRecibida > 0);

    if (items.length === 0) return;

    socket.emit('registrar-recepcion', {
      ordenCompra: selectedOC._id,
      items,
    });
    setSelectedOC(null);
    setCantidades({});
    setVinculaciones({});
  };

  const handleCancel = () => {
    setSelectedOC(null);
    setCantidades({});
    setVinculaciones({});
  };

  const getProgreso = (oc) => {
    const items = oc.items || [];
    if (items.length === 0) return 0;
    const total = items.reduce((s, it) => s + (it.cantidadSolicitada || 0), 0);
    const recibido = items.reduce((s, it) => s + (it.cantidadRecibida || 0), 0);
    return total > 0 ? Math.round((recibido / total) * 100) : 0;
  };

  return (
    <div className={s.container}>
      <Link to="/compras" className={s.backLink}>
        <i className="bi bi-arrow-left" /> Volver a Compras
      </Link>

      <h2 className={s.sectionTitle}>Recepcion de Mercaderia</h2>

      {ordenes.length === 0 && !selectedOC && (
        <div className={s.empty}>
          <div className={s.emptyIcon}><i className="bi bi-box-seam" /></div>
          Sin ordenes pendientes de recepcion
        </div>
      )}

      {!selectedOC && ordenes.length > 0 && (
        <div className={s.cardsGrid}>
          {ordenes.map((oc) => {
            const prog = getProgreso(oc);
            return (
              <div key={oc._id} className={s.ocCard} onClick={() => handleSelectOC(oc)}>
                <div className={s.ocCardHeader}>
                  <span className={s.ocCardNumber}>OC #{oc.numero || '-'}</span>
                  <Badge variant={oc.estado}>{ESTADOS[oc.estado] || oc.estado}</Badge>
                </div>
                <div className={s.ocCardProveedor}>{oc.proveedorBodega || oc.proveedorNombre || '-'}</div>
                <div className={s.ocCardMeta}>
                  <span>{oc.createdAt ? new Date(oc.createdAt).toLocaleDateString('es-AR') : '-'}</span>
                  <span className={s.ocCardItems}>{(oc.items || []).length} items</span>
                </div>
                {prog > 0 && (
                  <div className={s.progressBar}>
                    <div className={s.progressFill} style={{ width: `${prog}%` }} />
                    <span className={s.progressText}>{prog}% recibido</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedOC && (
        <div className={s.receptionPanel}>
          <h3 className={s.receptionTitle}>
            Recepcion - OC #{selectedOC.numero || '-'} — {selectedOC.proveedorBodega || selectedOC.proveedorNombre || ''}
          </h3>

          <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Vinculacion</th>
                <th>Pedida</th>
                <th>Recibida</th>
                <th>Pendiente</th>
                <th>Recibir</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(selectedOC.items || []).map((item, i) => {
                const pedida = item.cantidadSolicitada || 0;
                const recibidaPrev = item.cantidadRecibida || 0;
                const pendiente = pedida - recibidaPrev;
                const completado = pendiente <= 0;
                const vinculado = vinculaciones[i] || item.productoId;
                const prodVinculado = vinculado ? productos.find((p) => p._id === vinculado) : null;

                const searchTerm = searchProd[i];
                const showSearch = searchTerm !== undefined;
                const filteredProds = showSearch && searchTerm
                  ? productos.filter((p) => {
                      const q = searchTerm.toLowerCase();
                      return p.nombre?.toLowerCase().includes(q) ||
                        p.codigo?.toLowerCase().includes(q) ||
                        p.bodega?.toLowerCase().includes(q);
                    }).slice(0, 6)
                  : [];

                return (
                  <tr key={i} className={completado ? s.completedRow : ''}>
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>
                      {item.nombre || '-'}
                    </td>
                    <td style={{ position: 'relative', minWidth: 200 }}>
                      {completado ? (
                        <span className={s.vinculadoTag}>
                          {prodVinculado ? prodVinculado.nombre : (vinculado ? 'Vinculado' : '-')}
                        </span>
                      ) : prodVinculado ? (
                        <div className={s.vinculadoWrap}>
                          <span className={s.vinculadoTag}>
                            <i className="bi bi-link-45deg" /> {prodVinculado.nombre}
                          </span>
                          <button
                            type="button"
                            className={s.desvincularBtn}
                            onClick={() => handleVinculacion(i, '')}
                            title="Desvincular"
                          >
                            <i className="bi bi-x" />
                          </button>
                        </div>
                      ) : (
                        <div className={s.vincularWrap}>
                          <div className={s.vincularInputRow}>
                            <input
                              type="text"
                              className={s.vincularInput}
                              placeholder="Buscar producto..."
                              value={searchTerm || ''}
                              onChange={(e) => setSearchProd((prev) => ({ ...prev, [i]: e.target.value }))}
                              onFocus={() => setSearchProd((prev) => ({ ...prev, [i]: prev[i] || '' }))}
                            />
                            <button
                              type="button"
                              className={s.scanBtn}
                              onClick={() => startScanner(i)}
                              title="Escanear codigo de barras"
                            >
                              <i className="bi bi-upc-scan" />
                            </button>
                          </div>
                          {showSearch && (
                            <div className={s.vincularDropdown}>
                              {filteredProds.map((p) => (
                                <div
                                  key={p._id}
                                  className={s.vincularOption}
                                  onClick={() => handleVinculacion(i, p._id)}
                                >
                                  <span className={s.vincularProdName}>
                                    {p.nombre}
                                    {p.bodega ? <span className={s.vincularProdBodega}> · {p.bodega}</span> : ''}
                                    {p.anio ? <span className={s.vincularProdAnio}> · {p.anio}</span> : ''}
                                  </span>
                                  <span className={s.vincularProdStock}>Stock: {p.cantidad || 0}</span>
                                </div>
                              ))}
                              <div
                                className={s.vincularOptionCrear}
                                onClick={() => openCrearModal(i)}
                              >
                                <i className="bi bi-plus-circle" />
                                <span>Crear producto nuevo</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td>{pedida}</td>
                    <td>{recibidaPrev > 0 ? <span className={s.recibidaQty}>{recibidaPrev}</span> : 0}</td>
                    <td>
                      {completado ? (
                        <span className={s.completedBadge}><i className="bi bi-check-circle-fill" /></span>
                      ) : (
                        <span className={s.pendingQty}>{pendiente}</span>
                      )}
                    </td>
                    <td>
                      {completado ? '-' : (
                        <input
                          className={s.qtyInput}
                          type="number"
                          min="0"
                          max={pendiente}
                          value={cantidades[i] || 0}
                          onChange={(e) => handleQtyChange(i, e.target.value)}
                        />
                      )}
                    </td>
                    <td>
                      {!completado && pendiente > 0 && (
                        <button
                          type="button"
                          className={s.fillBtn}
                          onClick={() => setCantidades((prev) => ({ ...prev, [i]: pendiente }))}
                          title="Recibir todo"
                        >
                          <i className="bi bi-check-all" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          <div className={s.btnRow}>
            <button className={s.cancelBtn} onClick={handleCancel}>
              <i className="bi bi-arrow-left" /> Volver
            </button>
          </div>
        </div>
      )}

      {/* Modal scanner */}
      {scannerIdx !== null && (
        <div className={s.modalOverlay} onClick={closeScannerModal}>
          <div className={s.scannerModal} onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>Escanear Codigo de Barras</span>
              <button type="button" className={s.modalCloseBtn} onClick={closeScannerModal}>
                <i className="bi bi-x-lg" />
              </button>
            </div>
            <div className={s.scannerBody}>
              <div id="barcode-reader" className={s.scannerView} />
              {scanResult && (
                <div className={s.scanResultBox}>
                  <span>Codigo: <strong>{scanResult}</strong></span>
                  {!productos.find((p) => p.codigo?.toLowerCase() === scanResult.toLowerCase()) && (
                    <span className={s.scanNotFound}>No se encontro producto con este codigo</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal crear producto */}
      {crearModal !== null && (
        <div className={s.modalOverlay} onClick={() => { setCrearModal(null); setNewProd(EMPTY_PROD); }}>
          <div className={s.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>Crear Producto</span>
              <button type="button" className={s.modalCloseBtn} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCrearModal(null); setNewProd(EMPTY_PROD); }}>
                <i className="bi bi-x-lg" style={{ pointerEvents: 'none' }} />
              </button>
            </div>
            <div className={s.modalBody}>
              <div className={s.modalField}>
                <span>Codigo</span>
                <div className={s.codigoRow}>
                  <input type="text" value={newProd.codigo} onChange={(e) => setNewProd((p) => ({ ...p, codigo: e.target.value.replace(/\D/g, '') }))} placeholder="EAN-13" />
                  <button type="button" className={s.generateBtn} onClick={generateEAN13}>Generar</button>
                </div>
              </div>
              <div className={s.modalRow}>
                <div className={s.modalField}>
                  <span>Nombre *</span>
                  <input type="text" value={newProd.nombre} onChange={(e) => setNewProd((p) => ({ ...p, nombre: e.target.value }))} />
                </div>
              </div>
              <div className={s.modalRow}>
                <div className={s.modalField}>
                  <span>Bodega</span>
                  <input type="text" value={newProd.bodega} onChange={(e) => setNewProd((p) => ({ ...p, bodega: e.target.value }))} />
                </div>
                <div className={s.modalField}>
                  <span>Cepa</span>
                  <input type="text" value={newProd.cepa} onChange={(e) => setNewProd((p) => ({ ...p, cepa: e.target.value }))} />
                </div>
              </div>
              <div className={s.modalRow}>
                <div className={s.modalField}>
                  <span>Cosecha</span>
                  <input type="text" value={newProd.year} onChange={(e) => setNewProd((p) => ({ ...p, year: e.target.value }))} placeholder="2024" />
                </div>
                <div className={s.modalField}>
                  <span>Origen</span>
                  <input type="text" value={newProd.origen} onChange={(e) => setNewProd((p) => ({ ...p, origen: e.target.value }))} placeholder="Mendoza" />
                </div>
              </div>
              <div className={s.modalRow}>
                <div className={s.modalField}>
                  <span>Costo</span>
                  <input type="number" min="0" value={newProd.costo} onChange={(e) => setNewProd((p) => ({ ...p, costo: e.target.value }))} />
                </div>
                <div className={s.modalField}>
                  <span>Precio Venta</span>
                  <input type="number" min="0" value={newProd.venta} onChange={(e) => setNewProd((p) => ({ ...p, venta: e.target.value }))} />
                </div>
              </div>
              <div className={s.modalRow}>
                <div className={s.modalField}>
                  <span>Tipo</span>
                  <select value={newProd.tipo} onChange={(e) => setNewProd((p) => ({ ...p, tipo: e.target.value }))}>
                    <option value="vino">Vino</option>
                    <option value="espumante">Espumante</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>
            </div>
            <div className={s.modalFooter}>
              <button className={s.submitBtn} onClick={handleCrearProducto} disabled={creando || !newProd.nombre}>
                {creando ? 'Creando...' : <><i className="bi bi-plus-circle" /> Crear y vincular</>}
              </button>
              <button className={s.cancelBtn} onClick={() => { setCrearModal(null); setNewProd(EMPTY_PROD); }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
