import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { socket } from '../../main';
import { IP } from '../../main';
import Badge from '../../components/shared/Badge';
import s from './RecepcionCompras.module.css';

const ESTADOS = { borrador: 'Borrador', pendiente_aprobacion: 'Pend. Aprobacion', aprobada: 'Aprobada', enviada: 'Enviada', en_camino: 'En Camino', recibida_parcial: 'Recibida Parcial', recibida: 'Recibida', cerrada: 'Cerrada', cancelada: 'Cancelada' };

export default function RecepcionCompras({ usuario }) {
  const [ordenes, setOrdenes] = useState([]);
  const [selectedOC, setSelectedOC] = useState(null);
  const [cantidades, setCantidades] = useState({});

  useEffect(() => {
    socket.on('response-ordenes-compra', (data) => {
      const ocs = data.ordenes || data || [];
      // Only show OCs that can receive items
      setOrdenes(ocs.filter((oc) =>
        ['aprobada', 'enviada', 'en_camino', 'recibida_parcial'].includes(oc.estado)
      ));
    });
    socket.on('cambios', () => {
      socket.emit('request-ordenes-compra', {});
    });

    socket.emit('request-ordenes-compra', {});

    return () => {
      socket.off('response-ordenes-compra');
      socket.off('cambios');
    };
  }, []);

  const handleSelectOC = (oc) => {
    setSelectedOC(oc);
    // Initialize quantities to 0 for each item
    const initial = {};
    (oc.items || []).forEach((item, i) => {
      initial[i] = 0;
    });
    setCantidades(initial);
  };

  const handleQtyChange = (index, value) => {
    setCantidades((prev) => ({
      ...prev,
      [index]: Math.max(0, Number(value) || 0),
    }));
  };

  const handleSubmit = () => {
    if (!selectedOC) return;
    const items = (selectedOC.items || []).map((item, i) => ({
      ...item,
      cantidadRecibida: cantidades[i] || 0,
    })).filter((it) => it.cantidadRecibida > 0);

    if (items.length === 0) return;

    socket.emit('registrar-recepcion', {
      ordenCompra: selectedOC._id,
      items,
    });
    setSelectedOC(null);
    setCantidades({});
  };

  const handleCancel = () => {
    setSelectedOC(null);
    setCantidades({});
  };

  return (
    <div className={s.container}>
      <Link to="/compras" className={s.backLink}>
        <i className="bi bi-arrow-left" /> Volver a Compras
      </Link>

      <h2 className={s.sectionTitle}>Recepcion de Mercaderia</h2>

      {/* OC cards */}
      {ordenes.length === 0 && !selectedOC && (
        <div className={s.empty}>
          <div className={s.emptyIcon}><i className="bi bi-box-seam" /></div>
          Sin ordenes pendientes de recepcion
        </div>
      )}

      {!selectedOC && ordenes.length > 0 && (
        <div className={s.cardsGrid}>
          {ordenes.map((oc) => (
            <div
              key={oc._id}
              className={s.ocCard}
              onClick={() => handleSelectOC(oc)}
            >
              <div className={s.ocCardHeader}>
                <span className={s.ocCardNumber}>OC #{oc.numero || '-'}</span>
                <Badge variant={oc.estado}>{ESTADOS[oc.estado] || oc.estado}</Badge>
              </div>
              <div className={s.ocCardProveedor}>{oc.proveedor?.nombre || '-'}</div>
              <div className={s.ocCardMeta}>
                <span>{oc.fecha ? new Date(oc.fecha).toLocaleDateString('es-AR') : '-'}</span>
                <span className={s.ocCardItems}>{(oc.items || []).length} items</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reception form */}
      {selectedOC && (
        <div className={s.receptionPanel}>
          <h3 className={s.receptionTitle}>
            Recepcion - OC #{selectedOC.numero || '-'} — {selectedOC.proveedor?.nombre || ''}
          </h3>

          <table className={s.table}>
            <thead>
              <tr>
                <th>Descripcion</th>
                <th>Cant. Pedida</th>
                <th>Recibida Prev.</th>
                <th>Pendiente</th>
                <th>Recibir Ahora</th>
              </tr>
            </thead>
            <tbody>
              {(selectedOC.items || []).map((item, i) => {
                const pedida = item.cantidad || 0;
                const recibidaPrev = item.cantidadRecibida || 0;
                const pendiente = pedida - recibidaPrev;
                return (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{item.descripcion}</td>
                    <td>{pedida}</td>
                    <td>{recibidaPrev}</td>
                    <td>
                      <span className={s.pendingQty}>{pendiente}</span>
                    </td>
                    <td>
                      <input
                        className={s.qtyInput}
                        type="number"
                        min="0"
                        max={pendiente}
                        value={cantidades[i] || 0}
                        onChange={(e) => handleQtyChange(i, e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className={s.btnRow}>
            <button className={s.submitBtn} onClick={handleSubmit}>Confirmar Recepcion</button>
            <button className={s.cancelBtn} onClick={handleCancel}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
