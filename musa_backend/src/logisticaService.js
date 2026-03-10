/**
 * Servicio de logistica integrada: Shipnow + Moova
 */

// ── Shipnow ──
const SHIPNOW_BASE = "https://api.shipnow.com.ar";

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
    servicio: r.shipping_service?.name || "Shipnow",
    precio: r.price || 0,
    entregaMin: r.minimum_delivery,
    entregaMax: r.maximum_delivery,
    meta: {
      serviceCode: r.shipping_service?.code,
      carrierCode: r.shipping_contract?.carrier?.code,
    },
  }));
}

async function shipnowCrearEnvio(token, { referencia, destino, items, opcionElegida }) {
  const body = {
    external_reference: referencia,
    ship_to: {
      name: destino.nombre,
      last_name: destino.apellido || "",
      zip_code: parseInt(destino.codigoPostal, 10),
      address_line: destino.direccion,
      city: destino.ciudad || "CABA",
      state: destino.provincia || "CABA",
      email: destino.email || "",
      phone: destino.telefono || "",
    },
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
      weight: 1.5,
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

// ── Servicio unificado ──

async function cotizarEnvio(config, destino) {
  const opciones = [];
  const origen = config.origenEnvio || {};

  // Shipnow
  if (config.shipnowActivo && config.shipnowToken && destino.codigoPostal) {
    try {
      const shipnowOpts = await shipnowCotizar(config.shipnowToken, {
        codigoPostalDestino: destino.codigoPostal,
        pesoGramos: destino.pesoGramos || 2000,
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

  // Si no hay integraciones activas pero envio habilitado, usar costo fijo
  if (opciones.length === 0 && config.envioHabilitado) {
    opciones.push({
      proveedor: "fijo",
      servicio: "Envio a domicilio",
      precio: config.costoEnvio || 0,
      entregaMin: null,
      entregaMax: null,
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

  // Envio fijo - no hay tracking
  return { proveedor: "fijo", envioId: null, tracking: null, estado: "manual" };
}

module.exports = { cotizarEnvio, crearEnvioLogistica };
