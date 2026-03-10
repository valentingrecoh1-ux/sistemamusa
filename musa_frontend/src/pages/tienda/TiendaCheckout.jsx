import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { crearPedido, fetchConfig, cotizarEnvio } from '../../lib/tiendaApi';
import { tiendaPath } from '../../tiendaConfig';
import s from './TiendaCheckout.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

export default function TiendaCheckout() {
  const navigate = useNavigate();
  const { items, totalPrice, clearCart } = useCart();
  const [config, setConfig] = useState({});
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', direccion: '', codigoPostal: '', notas: '' });
  const [entrega, setEntrega] = useState('retiro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Opciones de envio dinamicas
  const [opcionesEnvio, setOpcionesEnvio] = useState([]);
  const [opcionElegida, setOpcionElegida] = useState(null);
  const [cotizando, setCotizando] = useState(false);
  const tieneLogistica = config.shipnowActivo || config.moovaActivo;

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (items.length === 0) navigate(tiendaPath('/carrito'));
  }, [items, navigate]);

  // Cotizar cuando cambia la direccion/CP y esta en modo envio
  const handleCotizar = useCallback(async () => {
    if (entrega !== 'envio') return;
    if (!tieneLogistica) return;
    if (!form.direccion.trim() && !form.codigoPostal.trim()) return;

    setCotizando(true);
    setOpcionElegida(null);
    try {
      const res = await cotizarEnvio({
        direccion: form.direccion,
        codigoPostal: form.codigoPostal,
        ciudad: 'CABA',
        provincia: 'CABA',
      });
      const opts = res.opciones || [];
      setOpcionesEnvio(opts);
      if (opts.length > 0) setOpcionElegida(opts[0]);
    } catch {
      setOpcionesEnvio([]);
    } finally {
      setCotizando(false);
    }
  }, [entrega, form.direccion, form.codigoPostal, tieneLogistica]);

  // Costo de envio
  let costoEnvio = 0;
  if (entrega === 'envio') {
    if (tieneLogistica && opcionElegida) {
      costoEnvio = opcionElegida.precio || 0;
    } else if (config.envioHabilitado) {
      costoEnvio = config.costoEnvio || 0;
    }
  }
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
        opcionEnvio: entrega === 'envio' && opcionElegida ? opcionElegida : null,
      });

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.initPoint) {
        clearCart();
        window.location.href = result.initPoint;
        return;
      }

      clearCart();
      navigate(`${tiendaPath('/checkout/resultado')}?pedidoId=${result.pedidoId}&numeroPedido=${result.numeroPedido}&noMp=1`);
    } catch (err) {
      setError('Error al procesar el pedido. Intenta de nuevo.');
      setLoading(false);
    }
  };

  if (items.length === 0) return null;

  const formatEntrega = (opt) => {
    if (!opt.entregaMin) return '';
    const d = new Date(opt.entregaMin);
    return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  };

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
              {(config.envioHabilitado || tieneLogistica) && (
                <label className={`${s.deliveryOption} ${entrega === 'envio' ? s.deliveryActive : ''}`}>
                  <input type="radio" name="entrega" value="envio" checked={entrega === 'envio'} onChange={() => setEntrega('envio')} />
                  <div>
                    <strong>Envio a domicilio</strong>
                    <span>{tieneLogistica ? 'Cotiza ingresando tu direccion' : 'Recibilo en tu puerta'}</span>
                  </div>
                  {!tieneLogistica && (
                    <span className={s.deliveryPrice}>{config.costoEnvio ? money(config.costoEnvio) : 'Gratis'}</span>
                  )}
                </label>
              )}
            </div>

            {entrega === 'envio' && (
              <div style={{ marginTop: 12 }}>
                <div className={s.formGrid}>
                  <div className={s.field}>
                    <label>Direccion de envio *</label>
                    <input type="text" value={form.direccion} onChange={handleField('direccion')} placeholder="Calle, numero, piso, depto" />
                  </div>
                  {tieneLogistica && (
                    <div className={s.field}>
                      <label>Codigo postal</label>
                      <input type="text" value={form.codigoPostal} onChange={handleField('codigoPostal')} placeholder="1425" />
                    </div>
                  )}
                </div>

                {tieneLogistica && (
                  <>
                    <button
                      type="button"
                      className={s.cotizarBtn}
                      onClick={handleCotizar}
                      disabled={cotizando || (!form.direccion.trim() && !form.codigoPostal.trim())}
                    >
                      {cotizando ? (
                        <><i className="bi bi-hourglass-split" /> Cotizando...</>
                      ) : (
                        <><i className="bi bi-calculator" /> Cotizar envio</>
                      )}
                    </button>

                    {opcionesEnvio.length > 0 && (
                      <div className={s.shippingOptions}>
                        {opcionesEnvio.map((opt, i) => (
                          <label key={i} className={`${s.shippingOption} ${opcionElegida === opt ? s.shippingOptionActive : ''}`}>
                            <input
                              type="radio"
                              name="opcionEnvio"
                              checked={opcionElegida === opt}
                              onChange={() => setOpcionElegida(opt)}
                            />
                            <div className={s.shippingOptionInfo}>
                              <div className={s.shippingOptionTop}>
                                <span className={s.shippingProvider}>
                                  {opt.proveedor === 'shipnow' ? 'Shipnow' : opt.proveedor === 'moova' ? 'Moova' : 'Envio'}
                                </span>
                                <span className={s.shippingService}>{opt.servicio}</span>
                              </div>
                              {opt.entregaMin && (
                                <span className={s.shippingDate}>
                                  <i className="bi bi-calendar3" /> Llega {formatEntrega(opt)}
                                </span>
                              )}
                            </div>
                            <span className={s.shippingPrice}>
                              {opt.precio > 0 ? money(opt.precio) : 'Gratis'}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {opcionesEnvio.length === 0 && !cotizando && form.direccion.trim() && (
                      <p className={s.shippingHint}>
                        <i className="bi bi-info-circle" /> Ingresa tu direccion y presiona "Cotizar envio"
                      </p>
                    )}
                  </>
                )}
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
                <span>Envio ({opcionElegida?.proveedor === 'shipnow' ? 'Shipnow' : opcionElegida?.proveedor === 'moova' ? 'Moova' : 'Domicilio'})</span>
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
