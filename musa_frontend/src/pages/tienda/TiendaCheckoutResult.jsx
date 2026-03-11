import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchEstadoPedido, fetchTracking, fetchConfig } from '../../lib/tiendaApi';
import { tiendaPath, TIENDA_BASE } from '../../tiendaConfig';
import s from './TiendaCheckoutResult.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  listo: 'Listo para envio',
  enviado: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const TRACKING_STEPS = ['confirmado', 'preparando', 'listo', 'enviado', 'entregado'];

export default function TiendaCheckoutResult() {
  const [searchParams] = useSearchParams();
  const [pedido, setPedido] = useState(null);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);

  const status = searchParams.get('collection_status') || searchParams.get('status');
  const pedidoId = searchParams.get('external_reference') || searchParams.get('pedidoId');
  const noMp = searchParams.get('noMp');
  const numeroPedido = searchParams.get('numeroPedido');

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
    if (pedidoId) {
      fetchEstadoPedido(pedidoId).then(setPedido).catch(() => {}).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [pedidoId]);

  // Refresh tracking periodically if order is in transit
  useEffect(() => {
    if (!pedidoId || !pedido?.entrega || pedido?.entrega !== 'envio') return;
    if (['entregado', 'cancelado'].includes(pedido?.estado)) return;

    const interval = setInterval(() => {
      fetchTracking(pedidoId).then((data) => {
        if (data && !data.error) setPedido(data);
      }).catch(() => {});
    }, 30000); // cada 30s

    return () => clearInterval(interval);
  }, [pedidoId, pedido?.estado, pedido?.entrega]);

  const isSuccess = status === 'approved' || pedido?.mpStatus === 'approved' || pedido?.estado === 'confirmado';
  const isPending = status === 'pending' || status === 'in_process' || pedido?.estado === 'pendiente';

  const nroPedido = pedido?.numeroPedido || numeroPedido;

  if (loading) return <div className={s.loading}>Verificando tu pago...</div>;

  return (
    <div className={s.result}>
      <div className={s.card}>
        {isSuccess ? (
          <>
            <div className={`${s.iconCircle} ${s.success}`}>
              <i className="bi bi-check-lg" />
            </div>
            <h1 className={s.title}>Pago confirmado!</h1>
            <p className={s.desc}>Tu pedido fue recibido y estamos preparandolo.</p>
          </>
        ) : isPending || noMp ? (
          <>
            <div className={`${s.iconCircle} ${s.pending}`}>
              <i className="bi bi-clock" />
            </div>
            <h1 className={s.title}>{noMp ? 'Pedido registrado' : 'Pago pendiente'}</h1>
            <p className={s.desc}>
              {noMp
                ? 'Tu pedido fue registrado. Contactanos por WhatsApp para coordinar el pago.'
                : 'Tu pago esta siendo procesado. Te notificaremos cuando se confirme.'}
            </p>
          </>
        ) : (
          <>
            <div className={`${s.iconCircle} ${s.error}`}>
              <i className="bi bi-x-lg" />
            </div>
            <h1 className={s.title}>Hubo un problema</h1>
            <p className={s.desc}>El pago no pudo ser procesado. Podes intentar de nuevo o contactarnos.</p>
          </>
        )}

        {nroPedido && (
          <div className={s.orderNum}>
            <span className={s.orderLabel}>Numero de pedido</span>
            <span className={s.orderValue}>#{nroPedido}</span>
          </div>
        )}

        {pedido?.montoTotal && (
          <div className={s.orderTotal}>Total: {money(pedido.montoTotal)}</div>
        )}

        {/* Tracking timeline para envios */}
        {pedido?.entrega === 'envio' && pedido?.estado !== 'cancelado' && pedido?.estado !== 'pendiente' && (
          <div className={s.trackingSection}>
            <h3 className={s.trackingTitle}><i className="bi bi-truck" /> Seguimiento del envio</h3>
            <div className={s.timeline}>
              {TRACKING_STEPS.map((step, i) => {
                const currentIdx = TRACKING_STEPS.indexOf(pedido.estado);
                const isDone = i <= currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <div key={step} className={`${s.timelineStep} ${isDone ? s.timelineDone : ''} ${isCurrent ? s.timelineCurrent : ''}`}>
                    <div className={s.timelineDot} />
                    {i < TRACKING_STEPS.length - 1 && <div className={s.timelineLine} />}
                    <span className={s.timelineLabel}>{ESTADO_LABELS[step]}</span>
                  </div>
                );
              })}
            </div>
            {pedido.logisticaTracking && (
              <div className={s.trackingCode}>
                <span>Codigo de seguimiento:</span>
                <strong>{pedido.logisticaTracking}</strong>
              </div>
            )}
            {pedido.opcionEnvio?.servicio && (
              <div className={s.trackingMeta}>
                Servicio: {pedido.opcionEnvio.servicio}
                {pedido.logisticaProveedor && ` (${pedido.logisticaProveedor})`}
              </div>
            )}
          </div>
        )}

        <div className={s.actions}>
          {config.whatsappNumero && (
            <a
              href={`https://wa.me/${config.whatsappNumero.replace(/\D/g, '')}?text=Hola! Hice el pedido ${nroPedido ? '#' + nroPedido : ''}. Quiero consultar sobre el estado.`}
              target="_blank"
              rel="noreferrer"
              className={s.waBtn}
            >
              <i className="bi bi-whatsapp" /> Contactar por WhatsApp
            </a>
          )}
          <Link to={TIENDA_BASE || '/'} className={s.homeBtn}>
            <i className="bi bi-house" /> Volver a la tienda
          </Link>
        </div>
      </div>
    </div>
  );
}
