import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { crearPedido, fetchConfig } from '../../lib/tiendaApi';
import { tiendaPath } from '../../tiendaConfig';
import s from './TiendaCheckout.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

export default function TiendaCheckout() {
  const navigate = useNavigate();
  const { items, totalPrice, clearCart } = useCart();
  const [config, setConfig] = useState({});
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', direccion: '', notas: '' });
  const [entrega, setEntrega] = useState('retiro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (items.length === 0) navigate(tiendaPath('/carrito'));
  }, [items, navigate]);

  const costoEnvio = entrega === 'envio' && config.envioHabilitado ? (config.costoEnvio || 0) : 0;
  const montoTotal = totalPrice + costoEnvio;

  const handleField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.nombre.trim() || !form.email.trim() || !form.telefono.trim()) {
      setError('Completa nombre, email y telefono');
      return;
    }
    if (entrega === 'envio' && !form.direccion.trim()) {
      setError('Completa la direccion de envio');
      return;
    }

    setLoading(true);
    try {
      const result = await crearPedido({
        items: items.map((i) => ({ productoId: i.productoId, nombre: i.nombre, cantidad: i.cantidad })),
        cliente: form,
        entrega,
      });

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // Si hay link de MP, redirigir
      if (result.initPoint) {
        clearCart();
        window.location.href = result.initPoint;
        return;
      }

      // Sin MP, ir a resultado
      clearCart();
      navigate(`${tiendaPath('/checkout/resultado')}?pedidoId=${result.pedidoId}&numeroPedido=${result.numeroPedido}&noMp=1`);
    } catch (err) {
      setError('Error al procesar el pedido. Intenta de nuevo.');
      setLoading(false);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className={s.checkout}>
      <Link to={tiendaPath('/carrito')} className={s.back}>
        <i className="bi bi-arrow-left" /> Volver al carrito
      </Link>

      <h1 className={s.title}>Checkout</h1>

      <form className={s.layout} onSubmit={handleSubmit}>
        <div className={s.formCol}>
          {/* Datos del cliente */}
          <div className={s.card}>
            <h3 className={s.cardTitle}><i className="bi bi-person" /> Tus datos</h3>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label>Nombre *</label>
                <input type="text" value={form.nombre} onChange={handleField('nombre')} placeholder="Tu nombre completo" />
              </div>
              <div className={s.field}>
                <label>Email *</label>
                <input type="email" value={form.email} onChange={handleField('email')} placeholder="tu@email.com" />
              </div>
              <div className={s.field}>
                <label>Telefono *</label>
                <input type="tel" value={form.telefono} onChange={handleField('telefono')} placeholder="1155551234" />
              </div>
            </div>
          </div>

          {/* Entrega */}
          <div className={s.card}>
            <h3 className={s.cardTitle}><i className="bi bi-truck" /> Entrega</h3>
            <div className={s.deliveryOptions}>
              {config.retiroEnLocal !== false && (
                <label className={`${s.deliveryOption} ${entrega === 'retiro' ? s.deliveryActive : ''}`}>
                  <input type="radio" name="entrega" value="retiro" checked={entrega === 'retiro'} onChange={() => setEntrega('retiro')} />
                  <div>
                    <strong>Retiro en local</strong>
                    {config.direccionLocal && <span>{config.direccionLocal}</span>}
                  </div>
                  <span className={s.deliveryPrice}>Gratis</span>
                </label>
              )}
              {config.envioHabilitado && (
                <label className={`${s.deliveryOption} ${entrega === 'envio' ? s.deliveryActive : ''}`}>
                  <input type="radio" name="entrega" value="envio" checked={entrega === 'envio'} onChange={() => setEntrega('envio')} />
                  <div>
                    <strong>Envio a domicilio</strong>
                    <span>Recibilo en tu puerta</span>
                  </div>
                  <span className={s.deliveryPrice}>{config.costoEnvio ? money(config.costoEnvio) : 'Gratis'}</span>
                </label>
              )}
            </div>
            {entrega === 'envio' && (
              <div className={s.field} style={{ marginTop: 12 }}>
                <label>Direccion de envio *</label>
                <input type="text" value={form.direccion} onChange={handleField('direccion')} placeholder="Calle, numero, piso, depto, localidad" />
              </div>
            )}
          </div>

          {/* Notas */}
          <div className={s.card}>
            <h3 className={s.cardTitle}><i className="bi bi-chat-left-text" /> Notas (opcional)</h3>
            <textarea className={s.textarea} value={form.notas} onChange={handleField('notas')} placeholder="Algun comentario sobre tu pedido..." rows={3} />
          </div>
        </div>

        {/* Summary */}
        <div className={s.summaryCol}>
          <div className={s.summary}>
            <h3 className={s.summaryTitle}>Resumen del pedido</h3>
            {items.map((item) => (
              <div key={item.productoId} className={s.summaryItem}>
                <span>{item.nombre} x{item.cantidad}</span>
                <span>{money(item.precioUnitario * item.cantidad)}</span>
              </div>
            ))}
            <div className={s.summaryDivider} />
            <div className={s.summaryRow}>
              <span>Subtotal</span>
              <span>{money(totalPrice)}</span>
            </div>
            {costoEnvio > 0 && (
              <div className={s.summaryRow}>
                <span>Envio</span>
                <span>{money(costoEnvio)}</span>
              </div>
            )}
            <div className={`${s.summaryRow} ${s.summaryTotal}`}>
              <span>Total</span>
              <span>{money(montoTotal)}</span>
            </div>

            {error && <div className={s.error}>{error}</div>}

            <button type="submit" className={s.payBtn} disabled={loading}>
              {loading ? (
                'Procesando...'
              ) : (
                <><i className="bi bi-credit-card" /> Pagar con MercadoPago</>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
