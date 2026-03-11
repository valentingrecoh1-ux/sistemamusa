import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { crearPedido, fetchConfig, cotizarEnvio } from '../../lib/tiendaApi';
import { tiendaPath } from '../../tiendaConfig';
import s from './TiendaCheckout.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

// Agrupar opciones de sucursal con mismo precio/servicio/transportista
function agruparOpciones(opciones) {
  const grupos = [];
  const sucursalMap = new Map();

  for (const opt of opciones) {
    if (opt.tipo === 'sucursal' && opt.sucursal) {
      const key = `${opt.proveedor}|${opt.servicio}|${opt.precio}|${opt.transportista || ''}`;
      if (sucursalMap.has(key)) {
        sucursalMap.get(key).sucursales.push(opt.sucursal);
        sucursalMap.get(key)._originales.push(opt);
      } else {
        const grupo = {
          ...opt,
          sucursales: [opt.sucursal],
          _originales: [opt],
          sucursal: undefined,
        };
        sucursalMap.set(key, grupo);
        grupos.push(grupo);
      }
    } else {
      grupos.push(opt);
    }
  }
  return grupos;
}

export default function TiendaCheckout() {
  const navigate = useNavigate();
  const { items, totalPrice, totalItems, clearCart } = useCart();
  const [config, setConfig] = useState({});
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', calle: '', numero: '', pisoDepto: '', localidad: '', provincia: '', codigoPostal: '', notas: '' });
  const [entrega, setEntrega] = useState('retiro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Opciones de envio dinamicas
  const [opcionesEnvioRaw, setOpcionesEnvioRaw] = useState([]);
  const [opcionElegida, setOpcionElegida] = useState(null);
  const [sucursalElegida, setSucursalElegida] = useState(null);
  const [cotizando, setCotizando] = useState(false);
  const [yaCotizo, setYaCotizo] = useState(false);
  const tieneLogistica = config.shipnowActivo || config.moovaActivo || config.pedidosyaActivo;
  const debounceRef = useRef(null);
  const cpLookupRef = useRef(null);

  // Opciones agrupadas (sucursales del mismo precio en 1 sola opcion)
  const opcionesEnvio = useMemo(() => agruparOpciones(opcionesEnvioRaw), [opcionesEnvioRaw]);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (items.length === 0) navigate(tiendaPath('/carrito'));
  }, [items, navigate]);

  const direccionCompleta = [form.calle, form.numero, form.pisoDepto, form.localidad].filter(Boolean).join(' ');

  // Cotizar envio (llamado automaticamente)
  const doCotizar = useCallback(async () => {
    if (entrega !== 'envio') return;
    if (!tieneLogistica) return;
    if (!form.codigoPostal.trim() || form.codigoPostal.trim().length < 4) return;

    setCotizando(true);
    setOpcionElegida(null);
    setSucursalElegida(null);
    setYaCotizo(true);
    try {
      const res = await cotizarEnvio({
        direccion: direccionCompleta,
        calle: form.calle,
        numero: form.numero,
        localidad: form.localidad,
        codigoPostal: form.codigoPostal,
        ciudad: form.localidad || 'CABA',
        provincia: form.provincia || 'CABA',
        cantidadBotellas: totalItems,
      });
      const opts = res.opciones || [];
      setOpcionesEnvioRaw(opts);
      // Auto-seleccionar la mas barata
      if (opts.length > 0) {
        const agrupadas = agruparOpciones(opts);
        setOpcionElegida(agrupadas[0]);
      }
    } catch {
      setOpcionesEnvioRaw([]);
    } finally {
      setCotizando(false);
    }
  }, [entrega, form.calle, form.numero, form.localidad, form.codigoPostal, form.provincia, tieneLogistica, direccionCompleta, totalItems]);

  // Auto-cotizar con debounce cuando cambian los campos de direccion
  useEffect(() => {
    if (entrega !== 'envio' || !tieneLogistica) return;
    if (!form.codigoPostal.trim() || form.codigoPostal.trim().length < 4) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doCotizar();
    }, 900);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.codigoPostal, form.calle, form.numero, form.localidad, entrega, tieneLogistica, doCotizar]);

  // Auto-completar localidad/provincia por CP con API GeoRef Argentina
  useEffect(() => {
    const cp = form.codigoPostal.trim();
    if (cp.length < 4) return;

    if (cpLookupRef.current) clearTimeout(cpLookupRef.current);
    cpLookupRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://apis.datos.gob.ar/georef/api/localidades?codigo_postal=${cp}&campos=nombre,provincia.nombre&max=1`);
        if (!res.ok) return;
        const data = await res.json();
        const loc = data.localidades?.[0];
        if (loc) {
          setForm((prev) => ({
            ...prev,
            localidad: prev.localidad || loc.nombre || '',
            provincia: prev.provincia || loc.provincia?.nombre || '',
          }));
        }
      } catch { /* silently fail */ }
    }, 500);

    return () => { if (cpLookupRef.current) clearTimeout(cpLookupRef.current); };
  }, [form.codigoPostal]);

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
    if (entrega === 'envio' && (!form.calle.trim() || !form.numero.trim())) {
      setError('Completa calle y numero para el envio');
      return;
    }
    if (entrega === 'envio' && !form.codigoPostal.trim()) {
      setError('Completa el codigo postal');
      return;
    }

    setLoading(true);
    try {
      const clienteData = {
        ...form,
        direccion: direccionCompleta,
      };
      let opcionFinal = null;
      if (entrega === 'envio' && opcionElegida) {
        // Si es grupo de sucursales, usar la opcion original de la sucursal elegida
        if (opcionElegida.sucursales && sucursalElegida) {
          const original = opcionElegida._originales?.find((o) => o.sucursal?.id === sucursalElegida.id);
          opcionFinal = original ? { ...original } : { ...opcionElegida, meta: { ...opcionElegida.meta, postOfficeId: sucursalElegida.id } };
        } else {
          opcionFinal = { ...opcionElegida };
        }
        // Limpiar campos internos
        delete opcionFinal._originales;
        delete opcionFinal.sucursales;
      }

      const result = await crearPedido({
        items: items.map((i) => ({ productoId: i.productoId, nombre: i.nombre, cantidad: i.cantidad })),
        cliente: clienteData,
        entrega,
        opcionEnvio: opcionFinal,
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
                <label>WhatsApp *</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#888', fontSize: 14, pointerEvents: 'none' }}>+54</span>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^\d]/g, '');
                      setForm((prev) => ({ ...prev, telefono: val }));
                    }}
                    placeholder="11 5555 1234"
                    style={{ paddingLeft: 42 }}
                    maxLength={13}
                  />
                </div>
                {form.telefono && (form.telefono.length < 10 || form.telefono.length > 13) && (
                  <span style={{ color: '#f87171', fontSize: 12, marginTop: 2 }}>El numero debe tener entre 10 y 13 digitos</span>
                )}
                <span style={{ color: '#999', fontSize: 11, marginTop: 3, display: 'block' }}>
                  <i className="bi bi-whatsapp" style={{ color: '#25D366', marginRight: 4 }} />
                  Te notificaremos el estado de tu envio por WhatsApp
                </span>
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
                    <span>{tieneLogistica ? 'Cotizamos automaticamente al completar tu direccion' : 'Recibilo en tu puerta'}</span>
                  </div>
                  {!tieneLogistica && (
                    <span className={s.deliveryPrice}>{config.costoEnvio ? money(config.costoEnvio) : 'Gratis'}</span>
                  )}
                </label>
              )}
            </div>

            {entrega === 'envio' && (
              <div style={{ marginTop: 12 }}>
                <div className={s.addressGrid}>
                  <div className={s.field}>
                    <label>Codigo postal *</label>
                    <input
                      type="text"
                      value={form.codigoPostal}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^\d]/g, '');
                        setForm((prev) => ({ ...prev, codigoPostal: val, localidad: '', provincia: '' }));
                      }}
                      placeholder="8000"
                      maxLength={4}
                    />
                  </div>
                  <div className={s.field}>
                    <label>Localidad</label>
                    <input type="text" value={form.localidad} onChange={handleField('localidad')} placeholder={form.codigoPostal.length >= 4 ? 'Buscando...' : 'Se completa con el CP'} />
                  </div>
                  <div className={s.field}>
                    <label>Provincia</label>
                    <input type="text" value={form.provincia} onChange={handleField('provincia')} placeholder={form.codigoPostal.length >= 4 ? 'Buscando...' : 'Se completa con el CP'} />
                  </div>
                  <div className={s.field}>
                    <label>Calle *</label>
                    <input type="text" value={form.calle} onChange={handleField('calle')} placeholder="Av. Corrientes" />
                  </div>
                  <div className={s.field}>
                    <label>Numero *</label>
                    <input type="text" value={form.numero} onChange={handleField('numero')} placeholder="1234" />
                  </div>
                  <div className={s.field}>
                    <label>Piso / Depto</label>
                    <input type="text" value={form.pisoDepto} onChange={handleField('pisoDepto')} placeholder="3ro B" />
                  </div>
                </div>

                {tieneLogistica && (
                  <>
                    {/* Indicador de cotizacion automatica */}
                    {cotizando && (
                      <div className={s.cotizandoBar}>
                        <i className="bi bi-hourglass-split" /> Cotizando opciones de envio...
                      </div>
                    )}

                    {opcionesEnvio.length > 0 && !cotizando && (
                      <div className={s.shippingOptions}>
                        {opcionesEnvio.map((opt, i) => (
                          <label key={i} className={`${s.shippingOption} ${opcionElegida === opt ? s.shippingOptionActive : ''}`}>
                            <input
                              type="radio"
                              name="opcionEnvio"
                              checked={opcionElegida === opt}
                              onChange={() => { setOpcionElegida(opt); setSucursalElegida(null); }}
                            />
                            <div className={s.shippingOptionInfo}>
                              <div className={s.shippingOptionTop}>
                                <span className={s.shippingProvider}>
                                  {opt.transportista || (opt.proveedor === 'moova' ? 'Moova' : opt.proveedor === 'pedidosya' ? 'PedidosYa' : 'Envío')}
                                </span>
                                <span className={s.shippingService}>
                                  {opt.servicio}
                                  {opt.sucursales ? ` (${opt.sucursales.length} sucursales)` : opt.tipo === 'sucursal' ? ' (retiro en sucursal)' : ''}
                                </span>
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

                    {/* Selector de sucursal para opcion agrupada */}
                    {opcionElegida?.sucursales && opcionElegida.sucursales.length > 0 && (
                      <div className={s.sucursalSelect}>
                        <label><i className="bi bi-geo-alt" /> Elegi donde retirar:</label>
                        <div className={s.sucursalList}>
                          {opcionElegida.sucursales.map((suc) => (
                            <label
                              key={suc.id}
                              className={`${s.sucursalItem} ${sucursalElegida?.id === suc.id ? s.sucursalItemActive : ''}`}
                            >
                              <input
                                type="radio"
                                name="sucursal"
                                checked={sucursalElegida?.id === suc.id}
                                onChange={() => setSucursalElegida(suc)}
                              />
                              <div>
                                <strong>{suc.nombre}</strong>
                                <span>{suc.direccion}{suc.ciudad ? `, ${suc.ciudad}` : ''}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {!cotizando && yaCotizo && opcionesEnvio.length === 0 && (
                      <p className={s.shippingHint}>
                        <i className="bi bi-exclamation-circle" /> No encontramos opciones de envio para este codigo postal
                      </p>
                    )}

                    {!cotizando && !yaCotizo && (
                      <p className={s.shippingHint}>
                        <i className="bi bi-info-circle" /> Completa el codigo postal para ver opciones de envio
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
                <span>Envío ({opcionElegida?.transportista || (opcionElegida?.proveedor === 'moova' ? 'Moova' : opcionElegida?.proveedor === 'pedidosya' ? 'PedidosYa' : 'Domicilio')})</span>
                <span>{money(costoEnvio)}</span>
              </div>
            )}
            <div className={`${s.summaryRow} ${s.summaryTotal}`}>
              <span>Total</span>
              <span>{money(montoTotal)}</span>
            </div>

            {error && <div className={s.error}>{error}</div>}

            <button type="submit" className={s.payBtn} disabled={loading || (entrega === 'envio' && opcionElegida?.sucursales && !sucursalElegida)}>
              {loading ? (
                'Procesando...'
              ) : (
                <><i className="bi bi-credit-card" /> Pagar con MercadoPago</>
              )}
            </button>
            {entrega === 'envio' && opcionElegida?.sucursales && !sucursalElegida && (
              <span style={{ textAlign: 'center', fontSize: 12, color: '#f59e0b' }}>Selecciona una sucursal para continuar</span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
