import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { socket } from '../../main';
import Badge from '../../components/shared/Badge';
import s from './RecepcionCompras.module.css';

const ESTADOS = { borrador: 'Borrador', pendiente_aprobacion: 'Pend. Aprobacion', aprobada: 'Aprobada', enviada: 'Enviada', en_camino: 'En Camino', recibida_parcial: 'Recibida Parcial', recibida: 'Recibida', cerrada: 'Cerrada', cancelada: 'Cancelada' };

export default function RecepcionCompras({ usuario }) {
  const [ordenes, setOrdenes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [selectedOC, setSelectedOC] = useState(null);
  const [cantidades, setCantidades] = useState({});
  const [vinculaciones, setVinculaciones] = useState({});
  const [searchProd, setSearchProd] = useState({});

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

                // Filter products for search
                const searchTerm = searchProd[i];
                const showSearch = searchTerm !== undefined;
                const filteredProds = showSearch && searchTerm
                  ? productos.filter((p) =>
                      p.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      p.codigo?.toLowerCase().includes(searchTerm.toLowerCase())
                    ).slice(0, 8)
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
                          <input
                            type="text"
                            className={s.vincularInput}
                            placeholder="Buscar producto..."
                            value={searchTerm || ''}
                            onChange={(e) => setSearchProd((prev) => ({ ...prev, [i]: e.target.value }))}
                            onFocus={() => setSearchProd((prev) => ({ ...prev, [i]: prev[i] || '' }))}
                          />
                          {showSearch && (
                            <div className={s.vincularDropdown}>
                              {filteredProds.length === 0 && searchTerm ? (
                                <div className={s.vincularEmpty}>Sin resultados</div>
                              ) : filteredProds.map((p) => (
                                <div
                                  key={p._id}
                                  className={s.vincularOption}
                                  onClick={() => handleVinculacion(i, p._id)}
                                >
                                  <span className={s.vincularProdName}>{p.nombre}</span>
                                  <span className={s.vincularProdStock}>Stock: {p.cantidad || 0}</span>
                                </div>
                              ))}
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

          <div className={s.btnRow}>
            <button className={s.submitBtn} onClick={handleSubmit}>
              <i className="bi bi-check-lg" /> Confirmar Recepcion
            </button>
            <button className={s.cancelBtn} onClick={handleCancel}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
