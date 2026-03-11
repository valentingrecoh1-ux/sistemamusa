import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { crearPedido, fetchConfig, cotizarEnvio, buscarClienteCheckout } from '../../lib/tiendaApi';
import { tiendaPath } from '../../tiendaConfig';
import s from './TiendaCheckout.module.css';

const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

const STORAGE_KEY = 'musa_checkout_profile';

function saveProfile(form) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nombre: form.nombre, apellido: form.apellido, email: form.email, telefono: form.telefono, dni: form.dni,
      calle: form.calle, numero: form.numero, pisoDepto: form.pisoDepto,
      localidad: form.localidad, provincia: form.provincia, codigoPostal: form.codigoPostal,
    }));
  } catch { /* quota exceeded */ }
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

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
  const [form, setForm] = useState({ nombre: '', apellido: '', email: '', telefono: '', dni: '', calle: '', numero: '', pisoDepto: '', localidad: '', provincia: '', codigoPostal: '', notas: '' });
  const [entrega, setEntrega] = useState('retiro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [perfilCargado, setPerfilCargado] = useState(false);
  const [buscandoPerfil, setBuscandoPerfil] = useState(false);

  // Opciones de envio dinamicas
  const [opcionesEnvioRaw, setOpcionesEnvioRaw] = useState([]);
  const [opcionElegida, setOpcionElegida] = useState(null);
  const [sucursalElegida, setSucursalElegida] = useState(null);
  const [cotizando, setCotizando] = useState(false);
  const [yaCotizo, setYaCotizo] = useState(false);
  const tieneLogistica = config.shipnowActivo || config.moovaActivo || config.pedidosyaActivo;
  const [buscandoCP, setBuscandoCP] = useState(false);
  const debounceRef = useRef(null);
  const cpLookupRef = useRef(null);
  const perfilLookupRef = useRef(null);

  // Opciones agrupadas
  const opcionesEnvio = useMemo(() => agruparOpciones(opcionesEnvioRaw), [opcionesEnvioRaw]);

  // ¿La opcion elegida es a domicilio? (necesita calle/numero)
  const esDomicilio = opcionElegida ? (opcionElegida.tipo === 'domicilio' || (!opcionElegida.sucursales && opcionElegida.tipo !== 'sucursal')) : true;

  // Cargar perfil guardado en localStorage al montar
  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
    const saved = loadProfile();
    if (saved) {
      setForm((prev) => ({ ...prev, ...saved }));
      setPerfilCargado(true);
    }
  }, []);

  useEffect(() => {
    if (items.length === 0) navigate(tiendaPath('/carrito'));
  }, [items, navigate]);

  const direccionCompleta = [form.calle, form.numero, form.pisoDepto, form.localidad].filter(Boolean).join(' ');

  // Buscar perfil en backend
  const buscarPerfilRemoto = useCallback(async (campo, valor) => {
    if (!valor || valor.length < 5) return;
    if (perfilCargado) return;

    setBuscandoPerfil(true);
    try {
      const res = await buscarClienteCheckout(valor);
      if (res.cliente) {
        // Separar nombre completo en nombre+apellido si viene junto
        let cNombre = res.cliente.nombre || '';
        let cApellido = '';
        if (cNombre.includes(' ')) {
          const parts = cNombre.split(' ');
          cNombre = parts[0];
          cApellido = parts.slice(1).join(' ');
        }
        setForm((prev) => ({
          ...prev,
          nombre: prev.nombre || cNombre,
          apellido: prev.apellido || cApellido,
          email: prev.email || res.cliente.email || '',
          telefono: prev.telefono || res.cliente.telefono || '',
          dni: prev.dni || res.cliente.dni || '',
          localidad: prev.localidad || res.cliente.localidad || '',
          provincia: prev.provincia || res.cliente.provincia || '',
        }));
        setPerfilCargado(true);
      }
    } catch { /* silently fail */ }
    setBuscandoPerfil(false);
  }, [perfilCargado]);

  // Debounced profile lookups
  useEffect(() => {
    const val = form.email.trim();
    if (val.length < 5 || !val.includes('@') || perfilCargado) return;
    if (perfilLookupRef.current) clearTimeout(perfilLookupRef.current);
    perfilLookupRef.current = setTimeout(() => buscarPerfilRemoto('email', val), 800);
    return () => { if (perfilLookupRef.current) clearTimeout(perfilLookupRef.current); };
  }, [form.email, perfilCargado, buscarPerfilRemoto]);

  useEffect(() => {
    const val = form.telefono.trim();
    if (val.length < 10 || perfilCargado) return;
    if (perfilLookupRef.current) clearTimeout(perfilLookupRef.current);
    perfilLookupRef.current = setTimeout(() => buscarPerfilRemoto('telefono', val), 800);
    return () => { if (perfilLookupRef.current) clearTimeout(perfilLookupRef.current); };
  }, [form.telefono, perfilCargado, buscarPerfilRemoto]);

  useEffect(() => {
    const val = form.dni.trim();
    if (val.length < 7 || perfilCargado) return;
    if (perfilLookupRef.current) clearTimeout(perfilLookupRef.current);
    perfilLookupRef.current = setTimeout(() => buscarPerfilRemoto('dni', val), 800);
    return () => { if (perfilLookupRef.current) clearTimeout(perfilLookupRef.current); };
  }, [form.dni, perfilCargado, buscarPerfilRemoto]);

  // Cotizar envio
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

  // Auto-cotizar con debounce
  useEffect(() => {
    if (entrega !== 'envio' || !tieneLogistica) return;
    if (!form.codigoPostal.trim() || form.codigoPostal.trim().length < 4) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { doCotizar(); }, 900);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.codigoPostal, form.calle, form.numero, form.localidad, entrega, tieneLogistica, doCotizar]);

  // Auto-completar localidad/provincia por CP
  useEffect(() => {
    const cp = form.codigoPostal.trim();
    if (cp.length < 4) { setBuscandoCP(false); return; }
    if (cpLookupRef.current) clearTimeout(cpLookupRef.current);
    setBuscandoCP(true);
    cpLookupRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://apis.datos.gob.ar/georef/api/localidades?codigo_postal=${cp}&campos=nombre,provincia.nombre&max=1`);
        if (!res.ok) { setBuscandoCP(false); return; }
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
      setBuscandoCP(false);
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

  const handleField = (field) => (e) => {
    const val = e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
    if (['email', 'telefono', 'dni'].includes(field)) setPerfilCargado(false);
  };

  // Validacion: ¿se puede pagar?
  const datosOk = form.dni.trim().length >= 7 && form.nombre.trim() && form.apellido.trim() && form.email.trim() && form.telefono.trim();
  const direccionOk = entrega !== 'envio' || !esDomicilio || (form.calle.trim() && form.numero.trim());
  const cpOk = entrega !== 'envio' || form.codigoPostal.trim().length >= 4;
  const sucursalOk = !opcionElegida?.sucursales || sucursalElegida;
  const opcionOk = entrega !== 'envio' || !tieneLogistica || opcionElegida;
  const puedeComprar = datosOk && direccionOk && cpOk && sucursalOk && opcionOk;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!datosOk) { setError('Completa documento, nombre, apellido, email y WhatsApp'); return; }
    if (entrega === 'envio' && !cpOk) { setError('Completa el codigo postal'); return; }
    if (entrega === 'envio' && esDomicilio && !direccionOk) { setError('Completa calle y numero para envio a domicilio'); return; }
    if (entrega === 'envio' && !sucursalOk) { setError('Selecciona una sucursal de retiro'); return; }

    setLoading(true);
    try {
      const clienteData = { ...form, direccion: direccionCompleta };
      let opcionFinal = null;
      if (entrega === 'envio' && opcionElegida) {
        if (opcionElegida.sucursales && sucursalElegida) {
          const original = opcionElegida._originales?.find((o) => o.sucursal?.id === sucursalElegida.id);
          opcionFinal = original ? { ...original } : { ...opcionElegida, meta: { ...opcionElegida.meta, postOfficeId: sucursalElegida.id } };
        } else {
          opcionFinal = { ...opcionElegida };
        }
        delete opcionFinal._originales;
        delete opcionFinal.sucursales;
      }

      const result = await crearPedido({
        items: items.map((i) => ({ productoId: i.productoId, nombre: i.nombre, cantidad: i.cantidad })),
        cliente: clienteData,
        entrega,
        opcionEnvio: opcionFinal,
      });

      saveProfile(form);

      if (result.error) { setError(result.error); setLoading(false); return; }

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

            {perfilCargado && form.nombre && (
              <div className={s.perfilBanner}>
                <i className="bi bi-check-circle-fill" />
                <span>Hola <strong>{form.nombre.split(' ')[0]}</strong>! Completamos tus datos.</span>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ nombre: '', apellido: '', email: '', telefono: '', dni: '', calle: '', numero: '', pisoDepto: '', localidad: '', provincia: '', codigoPostal: '', notas: '' });
                    setPerfilCargado(false);
                    localStorage.removeItem(STORAGE_KEY);
                  }}
                  className={s.perfilClear}
                >
                  No soy yo
                </button>
              </div>
            )}

            {buscandoPerfil && (
              <div className={s.perfilBuscando}>
                <i className="bi bi-search" /> Buscando tus datos...
              </div>
            )}

            <div className={s.datosGrid}>
              <div className={`${s.field} ${s.fieldFull}`}>
                <label>Documento (DNI) *</label>
                <input
                  type="text"
                  value={form.dni}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setForm((prev) => ({ ...prev, dni: val }));
                    setPerfilCargado(false);
                  }}
                  placeholder="12345678"
                  maxLength={8}
                  inputMode="numeric"
                />
              </div>
              <div className={s.field}>
                <label>Nombre *</label>
                <input type="text" value={form.nombre} onChange={handleField('nombre')} placeholder="Juan" />
              </div>
              <div className={s.field}>
                <label>Apellido *</label>
                <input type="text" value={form.apellido} onChange={handleField('apellido')} placeholder="Perez" />
              </div>
              <div className={s.field}>
                <label>Email *</label>
                <input type="email" value={form.email} onChange={handleField('email')} placeholder="tu@email.com" />
              </div>
              <div className={s.field}>
                <label>WhatsApp *</label>
                <div className={s.phoneWrap}>
                  <span className={s.phonePrefix}>+54</span>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^\d]/g, '');
                      setForm((prev) => ({ ...prev, telefono: val }));
                      setPerfilCargado(false);
                    }}
                    placeholder="11 5555 1234"
                    className={s.phoneInput}
                    maxLength={13}
                  />
                </div>
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
                    <strong><i className="bi bi-shop" /> Retiro en local</strong>
                    {config.direccionLocal && <span>{config.direccionLocal}</span>}
                  </div>
                  <span className={s.deliveryPrice}>Gratis</span>
                </label>
              )}
              {(config.envioHabilitado || tieneLogistica) && (
                <label className={`${s.deliveryOption} ${entrega === 'envio' ? s.deliveryActive : ''}`}>
                  <input type="radio" name="entrega" value="envio" checked={entrega === 'envio'} onChange={() => setEntrega('envio')} />
                  <div>
                    <strong><i className="bi bi-truck" /> Envio</strong>
                    <span>{tieneLogistica ? 'A domicilio o retiro en sucursal' : 'Recibilo en tu puerta'}</span>
                  </div>
                  {!tieneLogistica && (
                    <span className={s.deliveryPrice}>{config.costoEnvio ? money(config.costoEnvio) : 'Gratis'}</span>
                  )}
                </label>
              )}
            </div>

            {entrega === 'envio' && (
              <div className={s.envioSection}>
                {/* Paso 1: Codigo postal */}
                <div className={s.cpRow}>
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
                    <input type="text" value={form.localidad} onChange={handleField('localidad')} placeholder={buscandoCP ? 'Buscando...' : 'Se completa con el CP'} />
                  </div>
                  <div className={s.field}>
                    <label>Provincia</label>
                    <input type="text" value={form.provincia} onChange={handleField('provincia')} placeholder={buscandoCP ? 'Buscando...' : 'Se completa con el CP'} />
                  </div>
                </div>

                {/* Paso 2: Opciones de envio */}
                {tieneLogistica && (
                  <>
                    {cotizando && (
                      <div className={s.cotizandoBar}>
                        <i className="bi bi-hourglass-split" /> Cotizando opciones de envio...
                      </div>
                    )}

                    {opcionesEnvio.length > 0 && !cotizando && (
                      <div className={s.shippingOptions}>
                        {opcionesEnvio.map((opt, i) => {
                          const esSuc = opt.sucursales || opt.tipo === 'sucursal';
                          return (
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
                                    {esSuc
                                      ? `Retiro en sucursal${opt.sucursales ? ` (${opt.sucursales.length} puntos)` : ''}`
                                      : 'Envio a domicilio'
                                    }
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
                          );
                        })}
                      </div>
                    )}

                    {/* Selector de sucursal */}
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

                    {/* Paso 3: Dirección completa (solo si es domicilio) */}
                    {opcionElegida && esDomicilio && (
                      <div className={s.addressSection}>
                        <label className={s.addressLabel}><i className="bi bi-house-door" /> Direccion de entrega</label>
                        <div className={s.addressRow}>
                          <div className={`${s.field} ${s.fieldWide}`}>
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

                {/* Sin logistica: campos de direccion siempre visibles */}
                {!tieneLogistica && (
                  <div className={s.addressSection}>
                    <div className={s.addressRow}>
                      <div className={`${s.field} ${s.fieldWide}`}>
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
                  </div>
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
          {/* Detalle de productos */}
          <div className={s.summaryProducts}>
            <h3 className={s.summaryTitle}>Tu pedido ({totalItems} {totalItems === 1 ? 'producto' : 'productos'})</h3>
            {items.map((item) => (
              <div key={item.productoId} className={s.productCard}>
                <div className={s.productInfo}>
                  <span className={s.productName}>{item.nombre}</span>
                  <div className={s.productMeta}>
                    {item.bodega && <span><i className="bi bi-building" /> {item.bodega}</span>}
                    {item.cepa && <span><i className="bi bi-droplet" /> {item.cepa}</span>}
                  </div>
                </div>
                <div className={s.productRight}>
                  <span className={s.productQty}>x{item.cantidad}</span>
                  <span className={s.productPrice}>{money(item.precioUnitario * item.cantidad)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Totales y pago */}
          <div className={s.summary}>
            <div className={s.summaryRow}>
              <span>Subtotal</span>
              <span>{money(totalPrice)}</span>
            </div>
            {costoEnvio > 0 && (
              <div className={s.summaryRow}>
                <span>Envío{opcionElegida?.transportista ? ` (${opcionElegida.transportista})` : ''}</span>
                <span>{money(costoEnvio)}</span>
              </div>
            )}
            <div className={`${s.summaryRow} ${s.summaryTotal}`}>
              <span>Total</span>
              <span>{money(montoTotal)}</span>
            </div>

            {error && <div className={s.error}>{error}</div>}

            <button type="submit" className={s.payBtn} disabled={loading || !puedeComprar}>
              {loading ? (
                'Procesando...'
              ) : (
                <><i className="bi bi-credit-card" /> Pagar con MercadoPago</>
              )}
            </button>
            {!puedeComprar && !loading && (
              <span className={s.payHint}>
                {!datosOk ? 'Completa tu documento y datos personales'
                  : !cpOk ? 'Ingresa tu codigo postal'
                  : !opcionOk ? 'Espera la cotizacion del envio'
                  : !sucursalOk ? 'Selecciona una sucursal'
                  : !direccionOk ? 'Completa calle y numero'
                  : ''}
              </span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
