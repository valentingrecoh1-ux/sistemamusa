/**
 * Servicio de logistica integrada: Shipnow + Moova
 */

const PESO_BOTELLA_GRAMOS = 1300; // Botella de vino ~1.3kg (750ml + vidrio)

// ── Shipnow ──
const SHIPNOW_BASE = "https://api.shipnow.com.ar";

// Mapa de estados ShipNow -> estados internos de pedido
const SHIPNOW_ESTADO_MAP = {
  new: "confirmado",
  ready_to_pick: "preparando",
  picking_list: "preparando",
  packing_slip: "preparando",
  ready_to_ship: "listo",
  shipped: "enviado",
  delivered: "entregado",
  not_delivered: "enviado", // fallo entrega pero sigue en transito
  cancelled: "cancelado",
};

async function shipnowCotizar(token, { codigoPostalDestino, pesoGramos }) {
  const params = new URLSearchParams({
    to_zip_code: codigoPostalDestino,
    weight: pesoGramos || 2000, // default 2kg (botella promedio)
    types: "ship_pap,ship_pas",
  });
  const res = await fetch(`${SHIPNOW_BASE}/shipping_options?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Shipnow cotizar error:", res.status, txt);
    return [];
  }
  const data = await res.json();
  return (data.results || []).map((r) => ({
    proveedor: "shipnow",
    servicio: r.shipping_service?.name || "Envío",
    precio: r.price || 0,
    entregaMin: r.minimum_delivery,
    entregaMax: r.maximum_delivery,
    tipo: r.shipping_service?.code?.includes("pas") ? "sucursal" : "domicilio",
    transportista: r.shipping_contract?.carrier?.name || null,
    meta: {
      serviceCode: r.shipping_service?.code,
      carrierCode: r.shipping_contract?.carrier?.code,
    },
  }));
}

async function shipnowCrearEnvio(token, { referencia, destino, items, opcionElegida }) {
  const shipTo = {
    name: destino.nombre,
    last_name: destino.apellido || "",
    zip_code: parseInt(destino.codigoPostal, 10),
    address_line: destino.direccion,
    city: destino.ciudad || destino.localidad || "CABA",
    state: destino.provincia || "CABA",
    email: destino.email || "",
    phone: destino.telefono || "",
  };
  // Campos separados si estan disponibles
  if (destino.calle) shipTo.street_name = destino.calle;
  if (destino.numero) shipTo.street_number = destino.numero;
  if (destino.pisoDepto) {
    const match = destino.pisoDepto.match(/^(\d+)\s*(.*)/);
    if (match) {
      shipTo.floor = match[1];
      shipTo.unit = match[2] || "";
    } else {
      shipTo.unit = destino.pisoDepto;
    }
  }
  // Sucursal de retiro
  if (opcionElegida.meta?.postOfficeId) {
    shipTo.post_office_id = opcionElegida.meta.postOfficeId;
  }

  const body = {
    external_reference: referencia,
    ship_to: shipTo,
    shipping_option: {
      service_code: opcionElegida.meta?.serviceCode,
      carrier_code: opcionElegida.meta?.carrierCode,
    },
    items: items.map((it, i) => ({
      id: i + 1,
      quantity: it.cantidad || 1,
      unit_price: it.precioUnitario || 0,
    })),
  };

  const res = await fetch(`${SHIPNOW_BASE}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Shipnow crear envio error:", res.status, txt);
    throw new Error("Error al crear envio en Shipnow");
  }
  const data = await res.json();
  return {
    proveedor: "shipnow",
    envioId: String(data.id),
    tracking: data.shipments?.[0]?.tracking_number || null,
    estado: data.status || "created",
  };
}

async function shipnowGetOrder(token, orderId) {
  const res = await fetch(`${SHIPNOW_BASE}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Shipnow getOrder error:", res.status, txt);
    return null;
  }
  return res.json();
}

async function shipnowGetShipments(token, orderId) {
  const res = await fetch(`${SHIPNOW_BASE}/orders/${orderId}/shipments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Shipnow getShipments error:", res.status, txt);
    return [];
  }
  const data = await res.json();
  return data.results || [];
}

async function shipnowCancelOrder(token, orderId) {
  const res = await fetch(`${SHIPNOW_BASE}/orders/${orderId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Shipnow cancel error:", res.status, txt);
    throw new Error("Error al cancelar envio en Shipnow");
  }
  return res.json();
}

async function shipnowGetPostOffices(token) {
  const res = await fetch(`${SHIPNOW_BASE}/post_offices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Shipnow postOffices error:", res.status, txt);
    return [];
  }
  const data = await res.json();
  return data.results || [];
}

async function shipnowCreateWebhook(token, url) {
  // Primero verificar si ya existe un webhook para esta URL
  try {
    const listRes = await fetch(`${SHIPNOW_BASE}/webhooks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      const existing = (listData.results || listData || []).find((w) => w.url === url);
      if (existing) {
        console.log(`[Shipnow] Webhook ya existe para ${url}, id=${existing.id}`);
        return existing;
      }
    }
  } catch (listErr) {
    console.error("Shipnow listWebhooks error:", listErr.message);
  }

  const res = await fetch(`${SHIPNOW_BASE}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      active: true,
      filters: { topics: ["orders/update", "shipments/update", "shipments/create"] },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Shipnow createWebhook error:", res.status, txt);
    throw new Error(`Shipnow (${res.status}): ${txt || "Error desconocido"}`);
  }
  return res.json();
}

// ── Moova ──
const MOOVA_BASE = "https://api.moova.io/b2b";

function parseAddress(obj) {
  // Si tiene calle y numero separados, usar esos
  if (obj.calle) return { street: obj.calle, number: obj.numero || "" };
  // Sino parsear de direccion completa
  const dir = obj.direccion || "";
  return { street: dir.replace(/\s+\d.*$/, "") || dir, number: dir.match(/\d+/)?.[0] || "" };
}

async function moovaCotizar(appId, apiKey, { origen, destino }) {
  const fromAddr = parseAddress(origen);
  const toAddr = parseAddress(destino);
  const body = {
    from: {
      street: fromAddr.street,
      number: fromAddr.number,
      city: origen.ciudad || origen.localidad || "CABA",
      state: origen.provincia || "CABA",
      postalCode: origen.codigoPostal || "",
      country: "AR",
    },
    to: {
      street: toAddr.street,
      number: toAddr.number,
      city: destino.ciudad || destino.localidad || "CABA",
      state: destino.provincia || "CABA",
      postalCode: destino.codigoPostal || "",
      country: "AR",
    },
  };

  const res = await fetch(`${MOOVA_BASE}/v2/budgets?appId=${appId}`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Moova cotizar error:", res.status, txt);
    return [];
  }
  const data = await res.json();
  // Moova puede devolver un array o un objeto con price
  const opciones = Array.isArray(data) ? data : [data];
  return opciones
    .filter((o) => o.price != null)
    .map((o) => ({
      proveedor: "moova",
      servicio: o.shippingTypeName || "Moova Express",
      precio: o.price || 0,
      entregaMin: o.estimatedDeliveryDate || null,
      entregaMax: null,
      tipo: "domicilio",
      meta: { shippingTypeId: o.shippingTypeId },
    }));
}

async function moovaCrearEnvio(appId, apiKey, { origen, destino, items, referencia }) {
  const fromAddr = parseAddress(origen);
  const toAddr = parseAddress(destino);
  const body = {
    scheduledDate: null,
    currency: "ARS",
    type: "regular",
    flow: "manual",
    from: {
      street: fromAddr.street,
      number: fromAddr.number,
      floor: origen.pisoDepto || "",
      city: origen.ciudad || origen.localidad || "CABA",
      state: origen.provincia || "CABA",
      postalCode: origen.codigoPostal || "",
      country: "AR",
      contact: {
        firstName: origen.contactoNombre || "MUSA",
        phone: origen.contactoTelefono || "",
      },
    },
    to: {
      street: toAddr.street,
      number: toAddr.number,
      floor: destino.pisoDepto || "",
      city: destino.ciudad || destino.localidad || "CABA",
      state: destino.provincia || "CABA",
      postalCode: destino.codigoPostal || "",
      country: "AR",
      contact: {
        firstName: destino.nombre || "",
        phone: destino.telefono || "",
        email: destino.email || "",
      },
    },
    items: items.map((it) => ({
      description: it.nombre || "Vino",
      quantity: it.cantidad || 1,
      price: it.precioUnitario || 0,
      weight: PESO_BOTELLA_GRAMOS / 1000,
    })),
    externalCode: referencia,
  };

  const res = await fetch(`${MOOVA_BASE}/shippings?appId=${appId}`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Moova crear envio error:", res.status, txt);
    throw new Error("Error al crear envio en Moova");
  }
  const data = await res.json();
  return {
    proveedor: "moova",
    envioId: String(data.id),
    tracking: data.trackingNumber || null,
    estado: data.statusCode || "created",
  };
}

// ── PedidosYa Envios ──
const PEDIDOSYA_AUTH_BASE = "https://auth-api.pedidosya.com/v1";
const PEDIDOSYA_API_BASE = "https://courier-api.pedidosya.com/v1";

// Cache de tokens (expiran a los 45 min)
const pedidosyaTokenCache = { token: null, expiresAt: 0 };

const PEDIDOSYA_ESTADO_MAP = {
  CONFIRMED: "confirmado",
  PREPARING: "preparando",
  PICKING_UP: "preparando",
  ONGOING: "enviado",
  NEAR_DROP_OFF: "enviado",
  DELIVERED: "entregado",
  CANCELLED: "cancelado",
  RETURNED: "cancelado",
};

async function pedidosyaGetToken(config) {
  // Reusar token si aun no expiro
  if (pedidosyaTokenCache.token && Date.now() < pedidosyaTokenCache.expiresAt) {
    return pedidosyaTokenCache.token;
  }
  const params = new URLSearchParams({
    client_id: config.pedidosyaClientId,
    client_secret: config.pedidosyaClientSecret,
    username: config.pedidosyaUsername,
    password: config.pedidosyaPassword,
    grant_type: "password",
  });
  const res = await fetch(`${PEDIDOSYA_AUTH_BASE}/token?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("PedidosYa auth error:", res.status, txt);
    throw new Error("Error al autenticar con PedidosYa");
  }
  const data = await res.json();
  pedidosyaTokenCache.token = data.access_token;
  pedidosyaTokenCache.expiresAt = Date.now() + 40 * 60 * 1000; // 40 min para tener margen
  return data.access_token;
}

async function pedidosyaEstimar(config, { origen, destino, items }) {
  const token = await pedidosyaGetToken(config);
  const pesoTotal = items.reduce((acc, it) => acc + (it.cantidad || 1) * PESO_BOTELLA_GRAMOS / 1000, 0);
  const body = {
    referenceId: `est_${Date.now()}`,
    isTest: false,
    weight: pesoTotal,
    items: items.map((it) => ({
      value: it.precioUnitario || 0,
      description: it.nombre || "Vino",
      quantity: it.cantidad || 1,
      weight: PESO_BOTELLA_GRAMOS / 1000,
    })),
    waypoints: [
      {
        type: "PICK_UP",
        addressStreet: origen.direccion || "",
        city: origen.ciudad || origen.localidad || "CABA",
        phone: origen.contactoTelefono || "",
        name: origen.contactoNombre || "MUSA",
        order: 1,
      },
      {
        type: "DROP_OFF",
        addressStreet: destino.direccion || "",
        city: destino.ciudad || destino.localidad || "CABA",
        phone: destino.telefono || "",
        name: destino.nombre || "",
        order: 2,
      },
    ],
  };
  const res = await fetch(`${PEDIDOSYA_API_BASE}/shippings/estimates`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("PedidosYa estimar error:", res.status, txt);
    return [];
  }
  const data = await res.json();
  const offers = data.deliveryOffers || [data];
  return offers
    .filter((o) => o.pricing?.total != null || o.price?.total != null)
    .map((o) => ({
      proveedor: "pedidosya",
      servicio: "PedidosYa Envios",
      precio: o.pricing?.total || o.price?.total || 0,
      entregaMin: o.estimatedDeliveryTime || null,
      entregaMax: null,
      tipo: "domicilio",
      meta: { deliveryOfferId: o.deliveryOfferId || null, estimateData: body },
    }));
}

async function pedidosyaCrearEnvio(config, { origen, destino, items, referencia }) {
  const token = await pedidosyaGetToken(config);
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30); // 30 min de preparacion
  const body = {
    referenceId: `#${referencia}`,
    isTest: false,
    notificationMail: destino.email || "",
    deliveryTime: now.toISOString(),
    weight: items.reduce((acc, it) => acc + (it.cantidad || 1) * PESO_BOTELLA_GRAMOS / 1000, 0),
    items: items.map((it) => ({
      value: it.precioUnitario || 0,
      description: it.nombre || "Vino",
      quantity: it.cantidad || 1,
      weight: PESO_BOTELLA_GRAMOS / 1000,
    })),
    waypoints: [
      {
        type: "PICK_UP",
        addressStreet: origen.direccion || "",
        city: origen.ciudad || origen.localidad || "CABA",
        phone: (origen.contactoTelefono || "").replace(/\D/g, ""),
        name: origen.contactoNombre || "MUSA",
        order: 1,
      },
      {
        type: "DROP_OFF",
        addressStreet: destino.direccion || "",
        city: destino.ciudad || destino.localidad || "CABA",
        phone: (destino.telefono || "").replace(/\D/g, ""),
        name: destino.nombre || "",
        order: 2,
      },
    ],
  };
  const res = await fetch(`${PEDIDOSYA_API_BASE}/shippings`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("PedidosYa crear envio error:", res.status, txt);
    throw new Error("Error al crear envio en PedidosYa");
  }
  const data = await res.json();
  return {
    proveedor: "pedidosya",
    envioId: String(data.id),
    tracking: data.trackingUrl || null,
    estado: data.status || "CONFIRMED",
  };
}

async function pedidosyaConfirmarEnvio(config, shippingId) {
  const token = await pedidosyaGetToken(config);
  const res = await fetch(`${PEDIDOSYA_API_BASE}/shippings/${shippingId}/confirm`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: shippingId }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("PedidosYa confirmar error:", res.status, txt);
    throw new Error("Error al confirmar envio en PedidosYa");
  }
  return res.json();
}

async function pedidosyaCancelarEnvio(config, shippingId) {
  const token = await pedidosyaGetToken(config);
  const res = await fetch(`${PEDIDOSYA_API_BASE}/shippings/${shippingId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Cancelado por el comercio" }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("PedidosYa cancelar error:", res.status, txt);
    throw new Error("Error al cancelar envio en PedidosYa");
  }
  return res.json();
}

async function pedidosyaGetEnvio(config, shippingId) {
  const token = await pedidosyaGetToken(config);
  const res = await fetch(`${PEDIDOSYA_API_BASE}/shippings/${shippingId}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("PedidosYa getEnvio error:", res.status, txt);
    return null;
  }
  return res.json();
}

// ── Servicio unificado ──

async function cotizarEnvio(config, destino, { cantidadBotellas = 1 } = {}) {
  const opciones = [];
  const origen = config.origenEnvio || {};
  const pesoTotal = cantidadBotellas * PESO_BOTELLA_GRAMOS;

  // Shipnow
  if (config.shipnowActivo && config.shipnowToken && destino.codigoPostal) {
    try {
      const shipnowOpts = await shipnowCotizar(config.shipnowToken, {
        codigoPostalDestino: destino.codigoPostal,
        pesoGramos: pesoTotal,
      });
      opciones.push(...shipnowOpts);
    } catch (err) {
      console.error("Error cotizando Shipnow:", err.message);
    }
  }

  // Moova
  if (config.moovaActivo && config.moovaAppId && config.moovaApiKey) {
    try {
      const moovaOpts = await moovaCotizar(config.moovaAppId, config.moovaApiKey, {
        origen,
        destino,
      });
      opciones.push(...moovaOpts);
    } catch (err) {
      console.error("Error cotizando Moova:", err.message);
    }
  }

  // PedidosYa
  if (config.pedidosyaActivo && config.pedidosyaClientId && config.pedidosyaClientSecret) {
    try {
      const pyaOpts = await pedidosyaEstimar(config, {
        origen,
        destino,
        items: [{ cantidad: cantidadBotellas, precioUnitario: 0, nombre: "Vino" }],
      });
      opciones.push(...pyaOpts);
    } catch (err) {
      console.error("Error cotizando PedidosYa:", err.message);
    }
  }

  // Si no hay integraciones activas pero envio habilitado, usar costo fijo
  if (opciones.length === 0 && config.envioHabilitado) {
    opciones.push({
      proveedor: "fijo",
      servicio: "Envio a domicilio",
      precio: config.costoEnvio || 0,
      entregaMin: null,
      entregaMax: null,
      tipo: "domicilio",
      meta: {},
    });
  }

  return opciones.sort((a, b) => a.precio - b.precio);
}

async function crearEnvioLogistica(config, { destino, items, referencia, opcionElegida }) {
  const origen = config.origenEnvio || {};

  if (opcionElegida.proveedor === "shipnow" && config.shipnowToken) {
    return shipnowCrearEnvio(config.shipnowToken, {
      referencia,
      destino,
      items,
      opcionElegida,
    });
  }

  if (opcionElegida.proveedor === "moova" && config.moovaAppId && config.moovaApiKey) {
    return moovaCrearEnvio(config.moovaAppId, config.moovaApiKey, {
      origen,
      destino,
      items,
      referencia,
    });
  }

  if (opcionElegida.proveedor === "pedidosya" && config.pedidosyaClientId) {
    return pedidosyaCrearEnvio(config, {
      origen,
      destino,
      items,
      referencia,
    });
  }

  // Envio fijo - no hay tracking
  return { proveedor: "fijo", envioId: null, tracking: null, estado: "manual" };
}

async function cancelarEnvioLogistica(config, pedido) {
  if (pedido.logisticaProveedor === "shipnow" && pedido.logisticaEnvioId && config.shipnowToken) {
    return shipnowCancelOrder(config.shipnowToken, pedido.logisticaEnvioId);
  }
  if (pedido.logisticaProveedor === "pedidosya" && pedido.logisticaEnvioId && config.pedidosyaClientId) {
    return pedidosyaCancelarEnvio(config, pedido.logisticaEnvioId);
  }
  // Moova y fijo no tienen cancelacion automatica
  return null;
}

async function consultarEstadoEnvio(config, pedido) {
  if (pedido.logisticaProveedor === "shipnow" && pedido.logisticaEnvioId && config.shipnowToken) {
    const order = await shipnowGetOrder(config.shipnowToken, pedido.logisticaEnvioId);
    if (!order) return null;
    const shipments = await shipnowGetShipments(config.shipnowToken, pedido.logisticaEnvioId);
    return {
      proveedor: "shipnow",
      estadoShipnow: order.status,
      estadoInterno: SHIPNOW_ESTADO_MAP[order.status] || null,
      tracking: shipments[0]?.tracking_number || order.shipments?.[0]?.tracking_number || null,
      shipments: shipments.map((s) => ({
        id: s.id,
        tracking: s.tracking_number,
        carrier: s.carrier?.name,
        status: s.status,
      })),
    };
  }
  if (pedido.logisticaProveedor === "pedidosya" && pedido.logisticaEnvioId && config.pedidosyaClientId) {
    const envio = await pedidosyaGetEnvio(config, pedido.logisticaEnvioId);
    if (!envio) return null;
    return {
      proveedor: "pedidosya",
      estadoPedidosYa: envio.status,
      estadoInterno: PEDIDOSYA_ESTADO_MAP[envio.status] || null,
      tracking: envio.trackingUrl || null,
      rider: envio.courier ? {
        nombre: envio.courier.name,
        telefono: envio.courier.phone,
        foto: envio.courier.pictureUrl,
      } : null,
    };
  }
  return null;
}

module.exports = {
  cotizarEnvio,
  crearEnvioLogistica,
  cancelarEnvioLogistica,
  consultarEstadoEnvio,
  shipnowGetPostOffices,
  shipnowCreateWebhook,
  SHIPNOW_ESTADO_MAP,
  PEDIDOSYA_ESTADO_MAP,
  pedidosyaCrearEnvio,
  pedidosyaCancelarEnvio,
  pedidosyaConfirmarEnvio,
  pedidosyaGetEnvio,
  pedidosyaEstimar,
  pedidosyaGetToken,
};
