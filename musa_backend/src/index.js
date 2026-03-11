require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const multer = require("multer");
const cors = require("cors");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const Product = require("./models/productModel");
const Venta = require("./models/venta");
const Operacion = require("./models/operacion");
const Turno = require("./models/turno");
const Flujo = require("./models/flujo");
const Degustacion = require("./models/degustacion");
const Usuario = require("./models/usuario");
const bcrypt = require("bcryptjs");
const MensajeInterno = require("./models/mensajeInterno");
const Proveedor = require("./models/proveedor");
const Evento = require("./models/evento");
const PagoMp = require("./models/pagoMp");
const OrdenCompra = require("./models/ordenCompra");
const PagoProveedor = require("./models/pagoProveedor");
const PedidoWeb = require("./models/pedidoWeb");
const ConfigTienda = require("./models/configTienda");
const { crearEnvioLogistica, cancelarEnvioLogistica, consultarEstadoEnvio, shipnowCreateWebhook, pedidosyaCrearEnvio, pedidosyaCancelarEnvio, pedidosyaGetEnvio, pedidosyaEstimar, PEDIDOSYA_ESTADO_MAP } = require("./logisticaService");
const { normalizar, NORMALIZAR_CEPAS, NORMALIZAR_REGIONES } = require("./migracionNormalizacion");
const { PlanClub, SuscripcionClub } = require("./models/suscripcionClub");
const Resena = require("./models/resena");
const Notificacion = require("./models/notificacion");
const Cliente = require("./models/cliente");
const { isCloudinaryConfigured, uploadBuffer, uploadBase64, deleteByUrl, isUrl } = require("./cloudinaryHelper");
const ValoracionVino = require("./models/valoracionVino");
const MediaTV = require("./models/mediaTV");
const FeedbackEvento = require("./models/feedbackEvento");
const SugerenciaCliente = require("./models/sugerenciaCliente");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const createTiendaRouter = require("./routes/tiendaApi");
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, BufferJSON, initAuthCreds } = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");

const cron = require("node-cron");
const AfipService = require("./AfipService");
const afipService = new AfipService({ CUIT: 20418588897 });

// Crear carpetas necesarias al iniciar (para PDFs generados por AFIP)
["src/facturas", "src/notas_de_credito"].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

const PDFDocument = require("pdfkit");
const qr = require("qr-image");
// Fallback users: solo se usan si FALLBACK_AUTH=1 (desarrollo local)
const FALLBACK_USERS = process.env.FALLBACK_AUTH === "1" ? [
  { nombre: "Administrador", username: "admin", password: "admin123", rol: "admin" },
  { nombre: "Comprador", username: "comprador", password: "comprador123", rol: "comprador" },
  { nombre: "Recepcion", username: "recepcion", password: "recepcion123", rol: "recepcion" },
  { nombre: "Vendedor", username: "vendedor", password: "vendedor123", rol: "vendedor" },
] : [];
if (FALLBACK_USERS.length > 0) console.warn("⚠ FALLBACK_AUTH activo — desactivar en produccion");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("ERROR: MONGO_URI no definido en .env — el servidor no puede iniciar sin base de datos");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB para soportar imagenes base64
  cors: {
    origin: "*", // Cambia esto al origen de tu cliente
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Conectar a MongoDB
mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("Conectado a MongoDB");
    // Migración: asegurar que todos los productos tengan campo tipo
    const sinTipo = await Product.countDocuments({ tipo: { $exists: false } });
    const tipoNull = await Product.countDocuments({ tipo: null });
    if (sinTipo > 0 || tipoNull > 0) {
      await Product.updateMany(
        { $or: [{ tipo: { $exists: false } }, { tipo: null }, { tipo: "" }] },
        { $set: { tipo: "vino" } }
      );
      console.log(`Migración: ${sinTipo + tipoNull} productos actualizados con tipo=vino`);
    }
    // Migración: normalizar cepas, bodegas y regiones
    try {
      const { migrarNormalizacion } = require("./migracionNormalizacion");
      const cambiosNorm = await migrarNormalizacion(Product);
      if (cambiosNorm > 0) console.log(`Normalización: ${cambiosNorm} productos corregidos (cepas/bodegas/regiones)`);
    } catch (err) {
      console.error("Error en migracion normalizacion:", err.message);
    }
  })
  .catch((err) => console.error("Error al conectar a MongoDB:", err));

// MercadoPago
const mpClient = process.env.MP_ACCESS_TOKEN
  ? new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
  : null;
const mpPayment = mpClient ? new Payment(mpClient) : null;

// ── MP helpers: raw → doc, sync ──
let _ownMpCollectorId = null;

async function getOwnMpCollectorId() {
  if (_ownMpCollectorId) return _ownMpCollectorId;
  const result = await PagoMp.aggregate([
    { $match: { collectorId: { $ne: null } } },
    { $group: { _id: "$collectorId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);
  if (result.length > 0) _ownMpCollectorId = result[0]._id;
  return _ownMpCollectorId;
}

function mpRawToDoc(p, ownCollectorId) {
  const fechaCreacion = p.date_created ? new Date(p.date_created) : null;
  let fecha = null;
  if (fechaCreacion) {
    fecha = moment(fechaCreacion).tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");
  }
  const bruto = p.transaction_amount || 0;
  const neto = p.transaction_details?.net_received_amount ?? null;
  const shipping = p.shipping_amount || 0;
  let comis = (p.fee_details || []).reduce((s, f) => s + (f.amount || 0), 0);
  let ret = neto != null ? Math.max(0, +(bruto - comis - (neto - shipping)).toFixed(2)) : 0;

  // Clasificar tipo de movimiento
  const desc = (p.description || "").toLowerCase();
  let tipo = "cobro";
  if (desc === "bank transfer" || (p.payment_type_id === "bank_transfer" && bruto > 0 && p.status === "approved")) {
    // Transferencias bancarias recibidas → cobro (plata que nos transfieren)
    tipo = "cobro";
  } else if (desc.startsWith("pago:") || desc.startsWith("pago :") || desc.startsWith("pago de")) {
    // Descripcion "Pago: ...", "Pago de servicio", etc → pagos que hicimos → gasto
    tipo = "gasto";
  } else if (ownCollectorId && p.payer?.id && String(p.payer.id) === String(ownCollectorId)) {
    // Nosotros somos el pagador → dinero que sale → gasto
    tipo = "gasto";
  } else if (ownCollectorId && p.collector_id) {
    // Comparar collector_id con el nuestro para determinar dirección
    tipo = (String(p.collector_id) === String(ownCollectorId)) ? "cobro" : "gasto";
  } else if (p.operation_type === "payout") {
    // Retiros/transferencias bancarias → cobro (plata que recibimos en banco)
    tipo = "cobro";
  } else if (ownCollectorId && !p.collector_id) {
    // Conocemos nuestro ID pero el pago no tiene collector → pago de servicio u otro egreso → gasto
    tipo = "gasto";
  } else if (p.operation_type === "money_transfer" && bruto > 0 && p.status === "approved") {
    // Transferencias sin collector conocido, monto positivo → cobro
    tipo = "cobro";
  } else if (p.operation_type === "money_transfer") {
    tipo = "gasto";
  }

  // Gastos no tienen comisiones ni retenciones
  if (tipo === "gasto") {
    comis = 0;
    ret = 0;
  }

  // Rechazados/cancelados/devueltos: no hay comisiones ni retenciones reales
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(p.status)) {
    comis = 0;
    ret = 0;
  }

  return {
    mpId: p.id,
    fecha,
    fechaCreacion,
    fechaAprobacion: p.date_approved ? new Date(p.date_approved) : null,
    descripcion: p.description || p.external_reference || "-",
    referenciaExterna: p.external_reference || null,
    monto: bruto,
    moneda: p.currency_id || "ARS",
    netoRecibido: neto,
    comisionMp: comis,
    retenciones: ret,
    impuestos: p.taxes_amount || 0,
    costoEnvio: p.shipping_amount || 0,
    medioPago: p.payment_type_id,
    medioPagoDetalle: p.payment_method_id,
    estado: p.status,
    estadoDetalle: p.status_detail,
    cuotas: p.installments || 1,
    feeDetails: (p.fee_details || []).map((f) => ({ tipo: f.type, pagador: f.fee_payer, monto: f.amount })),
    chargesDetalle: (p.charges_details || []).filter((c) => c.type !== "fee").map((c) => ({ nombre: c.name, tipo: c.type, monto: c.amounts?.original || 0 })),
    pagador: p.payer ? {
      id: p.payer.id || null,
      nombre: [p.payer.first_name, p.payer.last_name].filter(Boolean).join(" ") || null,
      email: p.payer.email || null,
      tipoDoc: p.payer.identification?.type || null,
      nroDoc: p.payer.identification?.number || null,
    } : null,
    tarjeta: p.card ? {
      ultimos4: p.card.last_four_digits || null,
      titular: p.card.cardholder?.name || null,
    } : null,
    operationType: p.operation_type || null,
    collectorId: p.collector_id || null,
    tipoMovimiento: tipo,
  };
}

async function syncMpPagos(fecha) {
  if (!mpPayment || !fecha) return;
  // Buscar en API de MP
  try {
    const searchParams = {
      sort: "date_created", criteria: "desc",
      range: "date_created",
      begin_date: `${fecha}T00:00:00.000-03:00`,
      end_date: `${fecha}T23:59:59.999-03:00`,
      limit: 1000, offset: 0,
    };
    const result = await mpPayment.search({ options: searchParams });
    const payments = result.results || [];
    if (payments.length === 0) return;

    // Detectar nuestro collector_id si aún no lo tenemos
    let ownId = await getOwnMpCollectorId();
    if (!ownId && payments.length > 0) {
      const freq = {};
      payments.forEach((p) => { if (p.collector_id) freq[p.collector_id] = (freq[p.collector_id] || 0) + 1; });
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
      if (top) {
        ownId = Number(top[0]);
        _ownMpCollectorId = ownId;
      }
    }

    // Detectar pagos con tipo manual para no sobreescribirlos
    const manualMpIds = new Set(
      (await PagoMp.find({ tipoManual: true }).select('mpId').lean()).map(d => d.mpId)
    );

    const ops = payments.map((p) => {
      const doc = mpRawToDoc(p, ownId);
      if (manualMpIds.has(p.id)) {
        // No sobreescribir tipo/comisiones de pagos clasificados manualmente
        const { tipoMovimiento, comisionMp, retenciones, ...rest } = doc;
        return { updateOne: { filter: { mpId: p.id }, update: { $set: rest }, upsert: true } };
      }
      return { updateOne: { filter: { mpId: p.id }, update: { $set: doc }, upsert: true } };
    });
    await PagoMp.bulkWrite(ops, { ordered: false });
  } catch (err) {
    console.error("Error syncMpPagos:", err.message);
  }
}

// Transforma doc de DB al formato que espera el frontend
function docToPagoResponse(d) {
  return {
    id: d.mpId,
    fecha: d.fechaCreacion,
    descripcion: d.descripcion,
    medioPago: d.medioPago,
    medioPagoDetalle: d.medioPagoDetalle,
    estado: d.estado,
    estadoDetalle: d.estadoDetalle,
    monto: d.monto,
    moneda: d.moneda,
    netoRecibido: d.netoRecibido,
    comisionMp: d.comisionMp,
    retenciones: d.retenciones,
    impuestos: d.impuestos,
    costoEnvio: d.costoEnvio,
    feeDetails: d.feeDetails,
    chargesDetalle: d.chargesDetalle,
    pagador: d.pagador?.nombre || null,
    pagadorEmail: d.pagador?.email || null,
    pagadorDoc: d.pagador?.tipoDoc && d.pagador?.nroDoc ? `${d.pagador.tipoDoc} ${d.pagador.nroDoc}` : null,
    tarjeta: d.tarjeta?.ultimos4 ? `****${d.tarjeta.ultimos4}` : null,
    tarjetaTitular: d.tarjeta?.titular || null,
    cuotas: d.cuotas,
    referenciaExterna: d.referenciaExterna,
    fechaAprobacion: d.fechaAprobacion,
    tipoMovimiento: d.tipoMovimiento || "cobro",
    operationType: d.operationType || null,
    fechaStr: d.fecha,
  };
}

// ── Auto-link MP payment to Venta ──
async function autoLinkMpPayment(ventaDoc) {
  if (!mpPayment) return;
  const formaPago = ventaDoc.formaPago;
  if (formaPago !== "DIGITAL" && formaPago !== "MIXTO") return;
  const expectedAmount = formaPago === "DIGITAL" ? ventaDoc.monto : ventaDoc.montoDigital;
  if (!expectedAmount || expectedAmount <= 0) return;
  const fecha = ventaDoc.fecha;
  try {
    // Sync pagos del día a DB y buscar desde ahí
    await syncMpPagos(fecha);
    const matches = await PagoMp.find({
      fecha, estado: "approved",
      monto: { $gte: expectedAmount - 0.01, $lte: expectedAmount + 0.01 },
    }).lean();
    const matchedIds = matches.map((m) => m.mpId);
    const alreadyLinked = await Venta.find({ mpPaymentIds: { $in: matchedIds } }).select("mpPaymentIds").lean();
    const linkedIds = new Set(alreadyLinked.flatMap((v) => v.mpPaymentIds));
    const available = matches.filter((m) => !linkedIds.has(m.mpId));
    if (available.length === 1) {
      ventaDoc.mpPaymentIds.push(available[0].mpId);
      ventaDoc.mpLinkedAt = new Date();
      await ventaDoc.save();
    } else if (available.length > 1) {
      const ventaCreatedAt = ventaDoc.createdAt || new Date();
      available.sort((a, b) => Math.abs(new Date(a.fechaCreacion) - ventaCreatedAt) - Math.abs(new Date(b.fechaCreacion) - ventaCreatedAt));
      const closestDiff = Math.abs(new Date(available[0].fechaCreacion) - ventaCreatedAt);
      const secondDiff = Math.abs(new Date(available[1].fechaCreacion) - ventaCreatedAt);
      if (closestDiff < 600000 && secondDiff > 600000) {
        ventaDoc.mpPaymentIds.push(available[0].mpId);
        ventaDoc.mpLinkedAt = new Date();
        await ventaDoc.save();
      }
    }
  } catch (err) {
    console.error("Error autoLinkMpPayment:", err.message);
  }
}

// ── WhatsApp (Baileys) ──
let waSocket = null;
let waQR = null;
let waStatus = "disconnected";
let waReconnectDelay = 5000;

async function useMongoAuthState() {
  const col = mongoose.connection.collection("wa_auth");

  const readData = async (id) => {
    const doc = await col.findOne({ _id: id });
    if (!doc) return null;
    return JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
  };

  const writeData = async (id, data) => {
    const val = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
    await col.updateOne({ _id: id }, { $set: { _id: id, value: val } }, { upsert: true });
  };

  const removeData = async (id) => {
    await col.deleteOne({ _id: id });
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          for (const id of ids) {
            const val = await readData(`${type}-${id}`);
            if (val) result[id] = val;
          }
          return result;
        },
        set: async (data) => {
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              if (value) await writeData(`${type}-${id}`, value);
              else await removeData(`${type}-${id}`);
            }
          }
        },
      },
    },
    saveCreds: () => writeData("creds", creds),
  };
}

async function connectWhatsApp() {
  if (waStatus === "connecting") return;
  if (waStatus === "connected" && waSocket) return;

  // Limpiar socket previo si quedó colgado
  if (waSocket) {
    try { waSocket.end(); } catch (e) { }
    waSocket = null;
  }

  waStatus = "connecting";
  waQR = null;

  try {
    const { state, saveCreds } = await useMongoAuthState();

    waSocket = makeWASocket({
      auth: state,
      logger: pino({ level: "warn" }),
      printQRInTerminal: false,
      browser: ["MUSA Palermo", "Chrome", "1.0.0"],
      connectTimeoutMs: 20000,
    });

    waSocket.ev.on("creds.update", saveCreds);

    // Safety: si en 30s no llega QR ni conexión, resetear
    const safetyTimer = setTimeout(() => {
      if (waStatus === "connecting") {
        console.warn("WhatsApp: timeout esperando QR, reseteando");
        waStatus = "disconnected";
        if (waSocket) { try { waSocket.end(); } catch (e) { } waSocket = null; }
      }
    }, 30000);

    waSocket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        waQR = await QRCode.toDataURL(qr);
        waStatus = "qr";
        clearTimeout(safetyTimer);
        console.log("WhatsApp: QR generado");
      }

      if (connection === "open") {
        waStatus = "connected";
        waQR = null;
        waReconnectDelay = 5000;
        clearTimeout(safetyTimer);
        console.log("WhatsApp conectado");
      }

      if (connection === "close") {
        clearTimeout(safetyTimer);
        waQR = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.output?.payload?.message || "";
        console.log(`WhatsApp desconectado: code=${code} reason=${reason}`);

        if (code === DisconnectReason.loggedOut || code === 401) {
          waStatus = "disconnected";
          waSocket = null;
          await mongoose.connection.collection("wa_auth").deleteMany({});
          console.log("WhatsApp: sesion cerrada, creds limpiadas");
        } else {
          waSocket = null;
          waStatus = "disconnected";
          // Solo auto-reconectar si no fue una desconexion limpia
          if (code !== DisconnectReason.connectionClosed) {
            waReconnectDelay = Math.min((waReconnectDelay || 5000) * 2, 300000);
            setTimeout(connectWhatsApp, waReconnectDelay);
          }
        }
      }
    });
  } catch (e) {
    console.error("WhatsApp error:", e.message, e.stack);
    waStatus = "disconnected";
    if (waSocket) { try { waSocket.end(); } catch (e2) { } }
    waSocket = null;
  }
}

async function disconnectWhatsApp() {
  try {
    if (waSocket) {
      await waSocket.logout();
      waSocket.end();
    }
  } catch (e) { }
  waSocket = null;
  waStatus = "disconnected";
  waQR = null;
  await mongoose.connection.collection("wa_auth").deleteMany({});
}

// Configuración de CORS para Express
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: false,
  })
);

// Multer en memoria: los archivos nunca tocan disco, se convierten directo a base64
const memStorage = multer.memoryStorage();
const upload = multer({ storage: memStorage, limits: { fileSize: 50 * 1024 * 1024 } });
const uploadComprobante = multer({ storage: memStorage, limits: { fileSize: 50 * 1024 * 1024 } });
const uploadFacturaOC = multer({ storage: memStorage, limits: { fileSize: 20 * 1024 * 1024 } });
const uploadPerfil = multer({ storage: memStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadMediaTV = multer({ storage: memStorage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para servir los archivos estáticos de la carpeta dist
app.use(express.static(path.join(__dirname, "dist")));

/*
app.use(
  "/.well-known/pki-validation/",
  express.static(path.join(__dirname, ".well-known/pki-validation"))
);
*/

// Sirviendo PDFs de AFIP (legacy filesystem, nuevos van a MongoDB)
app.use("/facturas", express.static("src/facturas"));
app.use("/notas_de_credito", express.static("src/notas_de_credito"));

// ── Servir foto de usuario (base64 → imagen binaria, con cache) ──
app.get("/api/usuario-foto/:id", async (req, res) => {
  try {
    const u = await Usuario.findById(req.params.id).select("foto").lean();
    if (!u || !u.foto) return res.status(404).send("No photo");
    // Si es URL (Cloudinary), redirigir
    if (isUrl(u.foto)) {
      res.set("Cache-Control", "public, max-age=86400");
      return res.redirect(301, u.foto);
    }
    const match = u.foto.match(/^data:(.+?);base64,(.+)$/);
    if (!match) return res.status(404).send("Bad format");
    res.set("Content-Type", match[1]);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(match[2], "base64"));
  } catch (err) {
    res.status(500).send("Error");
  }
});

// ── Servir foto de producto (base64 → imagen binaria, con cache) ──
app.get("/api/producto-foto/:id/:index?", async (req, res) => {
  try {
    const p = await Product.findById(req.params.id).select("foto fotos fotoPrincipalIdx fotoIA usarFotoIA").lean();
    if (!p) return res.status(404).send("Not found");

    let foto;
    const idx = req.params.index != null ? parseInt(req.params.index) : null;

    if (idx !== null && p.fotos && p.fotos[idx]) {
      foto = p.fotos[idx];
    } else if (p.usarFotoIA && p.fotoIA) {
      foto = p.fotoIA;
    } else if (p.fotos && p.fotos.length > 0) {
      foto = p.fotos[p.fotoPrincipalIdx || 0] || p.fotos[0];
    } else {
      foto = p.foto;
    }

    if (!foto) return res.status(404).send("No photo");

    // Si es URL (Cloudinary), redirigir
    if (isUrl(foto)) {
      res.set("Cache-Control", "public, max-age=86400");
      return res.redirect(301, foto);
    }

    // Fallback: servir base64
    const match = foto.match(/^data:(.+?);base64,(.+)$/);
    if (!match) return res.status(404).send("Bad format");
    res.set("Content-Type", match[1]);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(match[2], "base64"));
  } catch (err) {
    res.status(500).send("Error");
  }
});

// ── Servir PDFs de facturas desde MongoDB (fallback: filesystem) ──
app.get("/api/factura-pdf/:id", async (req, res) => {
  try {
    const venta = await Venta.findById(req.params.id).select("facturaPdf stringNumeroFactura").lean();
    if (!venta) return res.status(404).send("Venta no encontrada");
    if (venta.facturaPdf) {
      const buffer = Buffer.from(venta.facturaPdf, "base64");
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${venta.stringNumeroFactura || "factura"}.pdf"` });
      return res.send(buffer);
    }
    // Fallback: archivo local
    if (venta.stringNumeroFactura) {
      const filePath = path.join(__dirname, "facturas", `${venta.stringNumeroFactura}.pdf`);
      if (fs.existsSync(filePath)) return res.sendFile(filePath);
    }
    res.status(404).send("PDF no encontrado");
  } catch (err) { res.status(500).send("Error"); }
});

app.get("/api/nota-credito-pdf/:id", async (req, res) => {
  try {
    const venta = await Venta.findById(req.params.id).select("notaCreditoPdf stringNumeroNotaCredito").lean();
    if (!venta) return res.status(404).send("Venta no encontrada");
    if (venta.notaCreditoPdf) {
      const buffer = Buffer.from(venta.notaCreditoPdf, "base64");
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${venta.stringNumeroNotaCredito || "nota_credito"}.pdf"` });
      return res.send(buffer);
    }
    if (venta.stringNumeroNotaCredito) {
      const filePath = path.join(__dirname, "notas_de_credito", `${venta.stringNumeroNotaCredito}.pdf`);
      if (fs.existsSync(filePath)) return res.sendFile(filePath);
    }
    res.status(404).send("PDF no encontrado");
  } catch (err) { res.status(500).send("Error"); }
});

// ── WhatsApp API routes ──
app.get("/api/whatsapp/status", (req, res) => {
  res.json({ status: waStatus, qr: waQR });
});

app.post("/api/whatsapp/connect", async (req, res) => {
  if (waStatus === "connected" && waSocket)
    return res.json({ status: "connected", qr: null });

  await connectWhatsApp();

  // Esperar hasta 20s por QR o conexión
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (waQR || waStatus === "connected") break;
    // Si se desconectó inmediatamente (creds viejas), limpiar y reintentar
    if (waStatus === "disconnected" && i < 5) {
      console.log("WhatsApp: creds posiblemente stale, limpiando y reintentando...");
      await mongoose.connection.collection("wa_auth").deleteMany({});
      waReconnectDelay = 5000;
      await connectWhatsApp();
    }
  }

  res.json({ status: waStatus, qr: waQR });
});

app.post("/api/whatsapp/disconnect", async (req, res) => {
  await disconnectWhatsApp();
  res.json({ status: "disconnected" });
});

app.post("/api/whatsapp/send", async (req, res) => {
  try {
    if (waStatus !== "connected" || !waSocket) {
      return res.status(400).json({ error: "WhatsApp no conectado" });
    }

    const { phone, message } = req.body;
    if (!phone || !message)
      return res.status(400).json({ error: "Falta phone o message" });

    const jid = phone.replace(/\D/g, "") + "@s.whatsapp.net";
    await waSocket.sendMessage(jid, { text: message });

    res.json({ sent: true });
  } catch (e) {
    console.error("Error enviando WA:", e.message);
    res.status(500).json({ error: "Error al enviar: " + e.message });
  }
});

// ── Tienda Web API ──
app.use("/api/tienda", createTiendaRouter({ Product, PedidoWeb, ConfigTienda, PlanClub, SuscripcionClub, Resena, Cliente, Venta, ValoracionVino, SugerenciaCliente, Evento, mpClient: mpClient ? { accessToken: process.env.MP_ACCESS_TOKEN } : null, io, getWA: () => ({ waSocket, waStatus }) }));

app.post(
  "/upload_flujo",
  uploadComprobante.single("file"),
  async (req, res) => {
    const operacionData = req.body;
    const file = req.file;

    try {
      // Agregar la fecha actual a la operación si es una nueva (sin _id)
      if (!operacionData._id) {
        operacionData.fecha = moment(new Date())
          .tz("America/Argentina/Buenos_Aires")
          .format("YYYY-MM-DD");
      }

      // Convertir comprobante a base64 para persistencia en MongoDB
      if (operacionData._id && !file) {
        const existingOperacion = await Flujo.findById(operacionData._id);
        if (existingOperacion) {
          operacionData.filePath = existingOperacion.filePath;
        }
      } else if (file) {
        const mime = file.mimetype || "application/octet-stream";
        operacionData.filePath = `data:${mime};base64,${file.buffer.toString("base64")}`;
      }

      if (operacionData._id) {
        await Flujo.findByIdAndUpdate(operacionData._id, operacionData);
      } else {
        await Flujo.create(operacionData);
      }
      io.emit("cambios");
      res.json({ status: "ok", message: "Operación guardada correctamente" });
    } catch (error) {
      console.error("Error al guardar la operación:", error);
      res.status(500).json({ status: "error", message: "Error al guardar la operación" });
    }
  }
);

app.post(
  "/upload_operacion",
  uploadComprobante.single("file"),
  async (req, res) => {
    const operacionData = req.body;
    const file = req.file;

    // Limpiar campos que llegan como string "null" desde FormData
    for (const key of Object.keys(operacionData)) {
      if (operacionData[key] === "null" || operacionData[key] === "undefined") {
        delete operacionData[key];
      }
    }

    try {
      if (!operacionData._id) {
        operacionData.fecha = moment(new Date())
          .tz("America/Argentina/Buenos_Aires")
          .format("YYYY-MM-DD");
      }

      // Convertir comprobante a base64 para persistencia en MongoDB
      if (operacionData._id && !file) {
        const existingOperacion = await Operacion.findById(operacionData._id);
        if (existingOperacion) {
          operacionData.filePath = existingOperacion.filePath;
        }
      } else if (file) {
        const mime = file.mimetype || "application/octet-stream";
        operacionData.filePath = `data:${mime};base64,${file.buffer.toString("base64")}`;
      }

      let op;
      if (operacionData._id) {
        op = await Operacion.findByIdAndUpdate(operacionData._id, operacionData, { new: true });
      } else {
        op = await Operacion.create(operacionData);
      }
      io.emit("cambios");
      res.json({ status: "ok", message: "Operación guardada correctamente", operacionId: op._id });
    } catch (error) {
      console.error("Error al guardar la operación:", error);
      res.status(500).json({ status: "error", message: "Error al guardar la operación" });
    }
  }
);

app.post("/upload", upload.array("fotos", 10), async (req, res) => {
  const formData = req.body;
  const files = req.files || [];
  try {
    // Subir fotos nuevas a Cloudinary (o fallback a base64)
    let nuevasFotos;
    if (isCloudinaryConfigured()) {
      nuevasFotos = await Promise.all(files.map((file) => uploadBuffer(file.buffer, "musa/productos")));
    } else {
      nuevasFotos = files.map((file) => {
        const mime = file.mimetype || "image/jpeg";
        return `data:${mime};base64,${file.buffer.toString("base64")}`;
      });
    }

    // Indices de fotos existentes a mantener (enviados como JSON string)
    const fotosKeepIdx = formData.fotosKeepIdx ? JSON.parse(formData.fotosKeepIdx) : null;
    const fotoPrincipalIdx = formData.fotoPrincipalIdx != null ? parseInt(formData.fotoPrincipalIdx) : 0;

    if (formData._id) {
      // Buscar el producto existente
      const existingProduct = await Product.findById(formData._id);
      if (!existingProduct) {
        return res
          .status(404)
          .json({ status: "error", message: "Producto no encontrado" });
      }
      // Historial de precios: si cambio el precio, guardar el anterior
      const updateOps = {};
      if (existingProduct.venta && formData.venta && existingProduct.venta !== formData.venta) {
        updateOps.$push = { historialPrecios: { precio: existingProduct.venta, fecha: new Date() } };
      }

      // Construir array de fotos: existentes filtradas + nuevas
      let fotosArray;
      const existingFotos = existingProduct.fotos && existingProduct.fotos.length > 0
        ? existingProduct.fotos
        : (existingProduct.foto ? [existingProduct.foto] : []);

      if (fotosKeepIdx !== null) {
        // Solo mantener las fotos en los indices indicados
        fotosArray = fotosKeepIdx.map((i) => existingFotos[i]).filter(Boolean);
      } else {
        fotosArray = [...existingFotos];
      }
      fotosArray.push(...nuevasFotos);

      const product = {
        codigo: formData.codigo,
        bodega: formData.bodega ? formData.bodega.trim() : formData.bodega,
        cepa: normalizar(formData.cepa, NORMALIZAR_CEPAS),
        nombre: formData.nombre,
        year: formData.year,
        origen: normalizar(formData.origen, NORMALIZAR_REGIONES),
        costo: formData.costo,
        venta: formData.venta,
        cantidad: formData.cantidad,
        posicion: formData.posicion,
        descripcion: formData.descripcion,
        tipo: formData.tipo || "vino",
        fotos: fotosArray,
        fotoPrincipalIdx: Math.min(fotoPrincipalIdx, Math.max(0, fotosArray.length - 1)),
        foto: fotosArray[Math.min(fotoPrincipalIdx, Math.max(0, fotosArray.length - 1))] || existingProduct.foto || "",
        proveedorId: formData.proveedorId || existingProduct.proveedorId,
        proveedorNombre: formData.proveedorNombre || existingProduct.proveedorNombre,
        stockMinimo: formData.stockMinimo != null ? formData.stockMinimo : existingProduct.stockMinimo,
      };
      if (updateOps.$push) {
        await Product.findByIdAndUpdate(formData._id, { ...product, ...updateOps });
      } else {
        await Product.findByIdAndUpdate(formData._id, product);
      }
    } else {
      if (!formData.cantidad) {
        formData.cantidad = 0;
      }
      const fotosArray = [...nuevasFotos];
      const newProduct = new Product({
        codigo: formData.codigo,
        bodega: formData.bodega ? formData.bodega.trim() : formData.bodega,
        cepa: normalizar(formData.cepa, NORMALIZAR_CEPAS),
        nombre: formData.nombre,
        year: formData.year,
        origen: normalizar(formData.origen, NORMALIZAR_REGIONES),
        costo: formData.costo,
        venta: formData.venta,
        cantidad: formData.cantidad,
        posicion: formData.posicion,
        descripcion: formData.descripcion,
        tipo: formData.tipo || "vino",
        fotos: fotosArray,
        fotoPrincipalIdx: Math.min(fotoPrincipalIdx, Math.max(0, fotosArray.length - 1)),
        foto: fotosArray[0] || "",
        proveedorId: formData.proveedorId || null,
        proveedorNombre: formData.proveedorNombre || "",
        stockMinimo: formData.stockMinimo || 3,
        historialPrecios: formData.venta ? [{ precio: formData.venta, fecha: new Date() }] : [],
      });
      try {
        await newProduct.save();
      } catch (error) {
        res.json({ status: "error", message: "Codigo ya existe" });
        return;
      }
    }
    res.json({
      status: "ok",
      message: "Producto guardado y notificado a los clientes",
    });
    io.emit("cambios");
  } catch (error) {
    console.error("Error al guardar el producto:", error);
    res
      .status(500)
      .json({ status: "error", message: "Error al guardar el producto" });
  }
});

// ── Migrar fotos existentes de base64 a Cloudinary ──
app.post("/api/migrar-cloudinary", async (req, res) => {
  if (!isCloudinaryConfigured()) return res.status(400).json({ error: "Cloudinary no configurado" });
  const results = { productos: 0, usuarios: 0, mediaTV: 0, errors: [] };
  try {
    // 1. Migrar productos — uno a uno con cursor para no cargar todo en RAM
    const pIds = await Product.find({}).select("_id").lean();
    for (const { _id } of pIds) {
      try {
        const p = await Product.findById(_id).select("foto fotos fotoPrincipalIdx fotoIA").lean();
        if (!p) continue;
        const updates = {};
        if (p.fotos && p.fotos.length > 0) {
          const newFotos = [];
          for (const f of p.fotos) {
            if (f && !isUrl(f) && f.startsWith("data:")) {
              newFotos.push(await uploadBase64(f, "musa/productos"));
            } else {
              newFotos.push(f);
            }
          }
          updates.fotos = newFotos;
          updates.foto = newFotos[p.fotoPrincipalIdx || 0] || newFotos[0] || "";
        } else if (p.foto && !isUrl(p.foto) && p.foto.startsWith("data:")) {
          const url = await uploadBase64(p.foto, "musa/productos");
          updates.foto = url;
          updates.fotos = [url];
        }
        if (p.fotoIA && !isUrl(p.fotoIA) && p.fotoIA.startsWith("data:")) {
          updates.fotoIA = await uploadBase64(p.fotoIA, "musa/productos-ia");
        }
        if (Object.keys(updates).length > 0) {
          await Product.findByIdAndUpdate(_id, updates);
          results.productos++;
          console.log(`Migrado producto ${_id} (${results.productos})`);
        }
      } catch (err) {
        results.errors.push(`Producto ${_id}: ${err.message}`);
      }
    }
    // 2. Migrar fotos de usuarios — uno a uno
    const uIds = await Usuario.find({ foto: { $exists: true, $ne: "" } }).select("_id").lean();
    for (const { _id } of uIds) {
      try {
        const u = await Usuario.findById(_id).select("foto").lean();
        if (u?.foto && !isUrl(u.foto) && u.foto.startsWith("data:")) {
          const url = await uploadBase64(u.foto, "musa/usuarios");
          await Usuario.findByIdAndUpdate(_id, { foto: url });
          results.usuarios++;
          console.log(`Migrado usuario ${_id}`);
        }
      } catch (err) {
        results.errors.push(`Usuario ${_id}: ${err.message}`);
      }
    }
    // 3. Migrar media TV — uno a uno
    const mIds = await MediaTV.find({}).select("_id").lean();
    for (const { _id } of mIds) {
      try {
        const m = await MediaTV.findById(_id).select("archivo").lean();
        if (m?.archivo && !isUrl(m.archivo) && m.archivo.startsWith("data:")) {
          const url = await uploadBase64(m.archivo, "musa/tv");
          await MediaTV.findByIdAndUpdate(_id, { archivo: url });
          results.mediaTV++;
          console.log(`Migrado mediaTV ${_id}`);
        }
      } catch (err) {
        results.errors.push(`MediaTV ${_id}: ${err.message}`);
      }
    }
    console.log("Migración Cloudinary completada:", results);
    res.json({ ok: true, migrados: results });
  } catch (err) {
    console.error("Error migración Cloudinary:", err);
    res.status(500).json({ error: err.message, parcial: results });
  }
});

/* ============================
   Helpers AFIP / Formateo
   ============================ */
function mapTipoCmp({ factura, notaCredito }) {
  // AFIP: 1=Factura A, 3=Nota de Crédito A, 6=Factura B, 8=Nota de Crédito B
  if (notaCredito) return factura === "A" ? 3 : 8;
  return factura === "A" ? 1 : 6;
}

function pickDocTipoYNumero(data) {
  // Respetá lo que te devuelve AfipService si viene; sino inferí.
  const docTipo =
    data.docTipo ??
    data.tipoDoc ??
    (data.factura === "A"
      ? 80 // CUIT
      : data.dni
        ? 96
        : 99); // DNI o Consumidor Final

  const nroDoc = Number(
    Number(docTipo) === 99
      ? 0
      : data.cuit ?? data.dni ?? data.nroDoc ?? data.docNro ?? 0
  );

  return { docTipo: Number(docTipo), nroDoc };
}

function formatFechaCortaConHora(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return { fecha: `${dd}/${mm}/${yyyy}`, hora: `${hh}:${mi}:${ss}` };
}

function ymd(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ==========================================
   Función principal: imprimirTicket(data)
   ========================================== */
async function imprimirTicket(data) {
  const doc = new PDFDocument({
    size: "A7",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  // Cadenas con padding correcto
  const pvStr = data.puntoDeVenta.toString().padStart(6, "0");
  const nroStr = data.numeroComprobante.toString().padStart(8, "0");

  const stringNumeroComprobante = `${pvStr}-${nroStr}`;
  const nombrePath = `F${data.factura}-${pvStr}-${nroStr}`;

  // Dónde guardar
  const carpeta = data.notaCredito ? "notas_de_credito" : "facturas";
  const filePath = path.join(__dirname, carpeta, `${nombrePath}.pdf`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true }); // por si no existe

  const out = fs.createWriteStream(filePath);
  doc.pipe(out);

  // ====== ENCABEZADO ======
  doc
    .fontSize(25)
    .font("Courier-Bold")
    .text("MUSA PALERMO", { align: "center" });
  doc.fontSize(12).font("Courier");
  doc.text("---------------------------", { align: "center" });
  doc.text("Valentin Greco", { align: "center" });
  doc.text("CUIT e IIBB: 20-41858889-7", { align: "center" }); // <- tus datos
  doc.text("DIRECCIÓN: ARAOZ 2785", { align: "center" });
  doc.text("IVA RESP. INSCRIPTO", { align: "center" });
  doc.text("---------------------------", { align: "center" });

  // Tipo de comprobante visible
  if (data.factura === "A") {
    doc.text(data.notaCredito ? "NOTA DE CREDITO A" : "FACTURA A", {
      align: "center",
    });
  } else {
    doc.text(data.notaCredito ? "NOTA DE CREDITO B" : "FACTURA B", {
      align: "center",
    });
  }

  const { fecha, hora } = formatFechaCortaConHora(new Date());
  doc.text("---------------------------", { align: "center" });
  doc.text(`NRO. COMP: ${stringNumeroComprobante}`, { align: "center" });
  doc.text(`FECHA: ${fecha} ${hora}`, { align: "center" });
  doc.text("---------------------------", { align: "center" });

  // Datos del receptor
  if (data.factura === "A") {
    doc.text(data.razonSocial ?? "", { align: "left" });
    doc.text(`CUIT: ${data.cuit ?? ""}`, { align: "left" });
    doc.text("RESPONSABLE INSCRIPTO", { align: "left" });
    if (data.direccion) doc.text(data.direccion, { align: "left" });
    if (data.localidad) doc.text(data.localidad, { align: "left" });
    if (data.provincia) doc.text(data.provincia, { align: "left" });
  } else {
    if (data.dni && data.nombre && data.domicilio) {
      doc.text(data.nombre, { align: "left" });
      doc.text(`DNI: ${data.dni}`, { align: "left" });
      doc.text(data.domicilio, { align: "left" });
    } else {
      doc.text("A CONSUMIDOR FINAL", { align: "center" });
    }
  }

  doc.text("---------------------------", { align: "center" });

  // ====== CUERPO / ITEMS ======
  doc.addPage(); // como en tu versión
  doc.moveDown();
  doc.fontSize(10);

  let currentY = doc.y;
  doc.text("CANTIDAD/P. UNIT", 0, currentY, { align: "left" });
  doc.text("IMPORTE", 165, currentY);
  doc.x = 0;

  currentY = doc.y;
  doc.text("DESCRIPCION", 0, currentY, { align: "left" });
  doc.text("IVA%", 135, currentY);

  (data.productosCarrito || []).forEach((producto) => {
    doc.x = 0;
    currentY = doc.y;

    const importeLinea =
      data.factura === "A"
        ? (producto.carritoCantidad * producto.venta) / 1.21
        : producto.carritoCantidad * producto.venta;

    // Importe a la derecha
    doc.text(importeLinea.toFixed(2), 0, currentY, { align: "right" });
    // Cantidad / Precio unitario a la izquierda
    doc.text(`${producto.carritoCantidad}/$${producto.venta}`, 0, currentY);

    currentY = doc.y;

    // Descripción truncada a ancho 135
    const maxWidth = 135;
    let nombreProducto = String(producto.nombre ?? "");
    while (
      doc.widthOfString(nombreProducto) > maxWidth &&
      nombreProducto.length > 0
    ) {
      nombreProducto = nombreProducto.slice(0, -1);
    }
    doc.text(nombreProducto, 0, currentY);
    doc.text("(21%)", 135, currentY); // asumís 21% para todos los ítems
    doc.x = 0;
  });

  // ====== TOTALES ======
  doc.addPage(); // como en tu versión
  currentY = doc.y;

  const descuento = Number(data.descuento ?? 0);
  doc.text("DESCUENTO:", 0, currentY, { align: "left" });
  doc.text(`$${descuento.toFixed(2)}`, 0, currentY, { align: "right" });

  const precioTotal = Number(data.precio ?? 0);

  if (data.factura === "A") {
    const neto = precioTotal / 1.21;
    const iva = precioTotal - neto;
    doc.text(`SUBTOTAL: ${neto.toFixed(2)}`, { align: "right" });
    doc.moveDown();
    doc.text(`NETO GRAVADO: ${neto.toFixed(2)}`, { align: "right" });
    doc.text(`IVA 21%: ${iva.toFixed(2)}`, { align: "right" });
  }

  doc.moveDown();
  doc.fontSize(19);
  currentY = doc.y;
  const precioFormateado = precioTotal.toLocaleString("es-AR");
  doc.text("TOTAL:", 0, currentY, { align: "left" });
  doc.text(`$${precioFormateado}`, 0, currentY, { align: "right" });

  doc.fontSize(12);
  doc.moveDown();
  doc.text("---------------------------", { align: "center" });
  doc.text("REFERENCIA ELECTRONICA", { align: "center" });
  doc.text("DEL COMPROBANTE", { align: "center" });
  doc.moveDown();
  doc.text(`C.A.E: ${data.CAE}`, { align: "center" });
  doc.text(`Vto.: ${data.vtoCAE}`, { align: "center" });

  // ====== QR AFIP (JSON + imagen inline) ======
  const tipoCmp = mapTipoCmp({
    factura: data.factura,
    notaCredito: data.notaCredito,
  });
  const { docTipo: tipoDocRec, nroDoc: nroDocRec } = pickDocTipoYNumero(data);

  const qrPayload = {
    ver: 1,
    fecha: ymd(new Date()), // YYYY-MM-DD
    cuit: Number(data.cuit_afip), // CUIT del emisor
    ptoVta: Number(data.puntoDeVenta),
    tipoCmp, // 1/3/6/8
    nroCmp: Number(data.numeroComprobante),
    importe: Number(precioTotal.toFixed(2)),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: Number(tipoDocRec), // 80/96/99
    nroDocRec: Number(nroDocRec), // 0 si 99 (CF)
    tipoCodAut: "E",
    codAut: Number.parseInt(String(data.CAE), 10), // CAE numérico
  };

  const base64String = Buffer.from(JSON.stringify(qrPayload), "utf-8").toString(
    "base64"
  );
  const qrUrl = `https://serviciosweb.afip.gob.ar/genericos/comprobantes/cae.aspx?p=${base64String}`;

  // Genero la imagen del QR en memoria y la incrusto
  const qrBuffer = qr.imageSync(qrUrl, { type: "png", margin: 0, size: 4 });
  doc.image(qrBuffer, {
    x: 55,
    fit: [100, 100],
    align: "center",
  });

  // Cierro y espero a que se escriba todo
  const finished = new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
  doc.end();
  await finished;

  // Leer PDF como base64 para enviar al frontend (JSPM)
  const pdfBase64 = fs.readFileSync(filePath).toString("base64");
  return { filePath, base64: pdfBase64 };
}

/* ==========================================
   Generar PDF A4 profesional (para MongoDB)
   ========================================== */
async function generarFacturaA4(data) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 30, bottom: 30, left: 40, right: 40 },
  });
  const buffers = [];
  doc.on("data", (chunk) => buffers.push(chunk));
  const finished = new Promise((resolve) => doc.on("end", resolve));

  // Constantes de layout
  const ML = 40;          // margin left
  const CW = 515.28;      // content width
  const CR = 555.28;      // column right edge
  const CX = ML + CW / 2; // center X (~297.64)

  const pvStr = String(data.puntoDeVenta || 0).padStart(6, "0");
  const nroStr = String(data.numeroComprobante || 0).padStart(8, "0");
  const stringNro = `${pvStr}-${nroStr}`;
  const { fecha, hora } = formatFechaCortaConHora(new Date());
  const precioTotal = Number(data.precio ?? 0);
  const descuento = Number(data.descuento ?? 0);
  const isNC = !!data.notaCredito;
  const docType = isNC ? "NOTA DE CREDITO" : "FACTURA";
  const docLetter = data.factura || "B";

  // ── HEADER ──
  doc.lineWidth(1);
  doc.rect(ML, 30, CW, 140).stroke();
  doc.moveTo(CX, 30).lineTo(CX, 170).stroke();

  // Izquierda: datos empresa
  doc.font("Helvetica-Bold").fontSize(20).text("MUSA PALERMO", ML + 10, 42, { width: CX - ML - 20 });
  doc.font("Helvetica").fontSize(10);
  doc.text("Valentin Greco", ML + 10, 68);
  doc.fontSize(9);
  doc.text("CUIT e IIBB: 20-41858889-7", ML + 10, 83);
  doc.text("ARAOZ 2785", ML + 10, 96);
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("IVA RESP. INSCRIPTO", ML + 10, 112);

  // Derecha: tipo documento
  const rX = CX + 10;
  const rW = CW / 2 - 20;
  doc.font("Helvetica-Bold").fontSize(13).text(docType, rX, 38, { width: rW, align: "center" });
  doc.fontSize(36).text(docLetter, rX, 58, { width: rW, align: "center" });
  doc.font("Helvetica").fontSize(10);
  doc.text(`Nro: ${stringNro}`, rX, 105, { width: rW });
  doc.text(`Fecha: ${fecha} ${hora}`, rX, 119, { width: rW });
  doc.text(`C.A.E: ${data.CAE || ""}`, rX, 133, { width: rW });
  doc.text(`Vto. CAE: ${data.vtoCAE || ""}`, rX, 147, { width: rW });

  // ── DATOS CLIENTE ──
  const cY = 180;
  doc.rect(ML, cY, CW, 55).stroke();

  if (data.factura === "A") {
    doc.font("Helvetica-Bold").fontSize(10).text("Razon Social:", ML + 10, cY + 10);
    doc.font("Helvetica").text(data.razonSocial ?? "", ML + 100, cY + 10, { width: 190 });
    doc.font("Helvetica-Bold").text("CUIT:", 350, cY + 10);
    doc.font("Helvetica").text(data.cuit ?? "", 385, cY + 10);
    doc.font("Helvetica-Bold").text("Domicilio:", ML + 10, cY + 25);
    doc.font("Helvetica").text(data.direccion ?? "", ML + 80, cY + 25, { width: 210 });
    doc.font("Helvetica-Bold").text("IVA:", 350, cY + 25);
    doc.font("Helvetica").text("RESP. INSCRIPTO", 378, cY + 25);
    const locProv = [data.localidad, data.provincia].filter(Boolean).join(", ");
    if (locProv) {
      doc.font("Helvetica-Bold").text("Localidad:", ML + 10, cY + 40);
      doc.font("Helvetica").text(locProv, ML + 80, cY + 40, { width: 400 });
    }
  } else if (data.dni && data.nombre) {
    doc.font("Helvetica-Bold").fontSize(10).text("Nombre:", ML + 10, cY + 12);
    doc.font("Helvetica").text(data.nombre, ML + 70, cY + 12, { width: 250 });
    doc.font("Helvetica-Bold").text("DNI:", 350, cY + 12);
    doc.font("Helvetica").text(String(data.dni), 380, cY + 12);
    if (data.domicilio) {
      doc.font("Helvetica-Bold").text("Domicilio:", ML + 10, cY + 28);
      doc.font("Helvetica").text(data.domicilio, ML + 80, cY + 28, { width: 250 });
    }
    doc.font("Helvetica-Bold").text("IVA:", 350, cY + 28);
    doc.font("Helvetica").text("CONSUMIDOR FINAL", 378, cY + 28);
  } else {
    doc.font("Helvetica").fontSize(12).text("A CONSUMIDOR FINAL", ML, cY + 18, { width: CW, align: "center" });
  }

  // ── TABLA ITEMS ──
  const COL = [
    { x: ML,        w: 45,  label: "Cant.",       align: "center" },
    { x: ML + 45,   w: 240, label: "Descripcion", align: "left" },
    { x: ML + 285,  w: 80,  label: "P. Unit.",    align: "right" },
    { x: ML + 365,  w: 50,  label: "IVA %",       align: "center" },
    { x: ML + 415,  w: CW - 415, label: "Importe", align: "right" },
  ];
  const ROW_H = 20;
  const TABLE_Y = 250;
  const MAX_Y = 680;

  function drawHeaders(y) {
    doc.save();
    doc.rect(ML, y, CW, 22).fill("#E0E0E0");
    doc.restore();
    doc.rect(ML, y, CW, 22).stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
    COL.forEach((c) => {
      doc.text(c.label, c.x + 4, y + 6, { width: c.w - 8, align: c.align });
    });
    // Verticales header
    COL.slice(1).forEach((c) => doc.moveTo(c.x, y).lineTo(c.x, y + 22).stroke());
    return y + 22;
  }

  let tY = drawHeaders(TABLE_Y);

  (data.productosCarrito || []).forEach((prod, idx) => {
    if (tY + ROW_H > MAX_Y) {
      doc.moveTo(ML, tY).lineTo(CR, tY).stroke();
      doc.addPage();
      tY = drawHeaders(30);
    }
    // Fondo alterno
    if (idx % 2 === 1) {
      doc.save();
      doc.rect(ML, tY, CW, ROW_H).fill("#F7F7F7");
      doc.restore();
    }
    doc.font("Helvetica").fontSize(9).fillColor("#000000");

    const pv = Number(prod.venta) || 0;
    const cant = Number(prod.carritoCantidad) || 0;
    const unitPrice = pv / 1.21;
    const lineTotal = (cant * pv) / 1.21;

    doc.text(String(prod.carritoCantidad || 0), COL[0].x + 4, tY + 5, { width: COL[0].w - 8, align: "center" });
    doc.text(String(prod.nombre ?? "").substring(0, 50), COL[1].x + 4, tY + 5, { width: COL[1].w - 8, align: "left" });
    doc.text(`$${unitPrice.toFixed(2)}`, COL[2].x + 4, tY + 5, { width: COL[2].w - 8, align: "right" });
    doc.text("21%", COL[3].x + 4, tY + 5, { width: COL[3].w - 8, align: "center" });
    doc.text(`$${lineTotal.toFixed(2)}`, COL[4].x + 4, tY + 5, { width: COL[4].w - 8, align: "right" });

    // Bordes fila
    doc.moveTo(ML, tY + ROW_H).lineTo(CR, tY + ROW_H).stroke();
    doc.moveTo(ML, tY).lineTo(ML, tY + ROW_H).stroke();
    doc.moveTo(CR, tY).lineTo(CR, tY + ROW_H).stroke();
    COL.slice(1).forEach((c) => doc.moveTo(c.x, tY).lineTo(c.x, tY + ROW_H).stroke());

    tY += ROW_H;
  });

  // Cierre tabla
  doc.moveTo(ML, tY).lineTo(CR, tY).stroke();

  // ── TOTALES ──
  let totY = tY + 20;
  const TL = 350; // total label X
  const TV = 450; // total value X
  const TW = CR - TV;

  doc.font("Helvetica").fontSize(10);
  if (descuento > 0) {
    doc.text("Descuento:", TL, totY);
    doc.text(`-$${descuento.toFixed(2)}`, TV, totY, { width: TW, align: "right" });
    totY += 16;
  }
  const neto = precioTotal / 1.21;
  const iva = precioTotal - neto;
  doc.text("Subtotal Neto:", TL, totY);
  doc.text(`$${neto.toFixed(2)}`, TV, totY, { width: TW, align: "right" });
  totY += 16;
  doc.text("IVA 21%:", TL, totY);
  doc.text(`$${iva.toFixed(2)}`, TV, totY, { width: TW, align: "right" });
  totY += 16;

  doc.moveTo(TL, totY).lineTo(CR, totY).stroke();
  totY += 6;
  doc.font("Helvetica-Bold").fontSize(14);
  doc.text("TOTAL:", TL, totY);
  const precioFmt = precioTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 });
  doc.text(`$${precioFmt}`, TV, totY, { width: TW, align: "right" });
  totY += 30;

  // ── QR + REFERENCIA ELECTRÓNICA ──
  if (totY + 130 > 812) { doc.addPage(); totY = 30; }

  doc.lineWidth(0.5);
  doc.moveTo(ML, totY).lineTo(CR, totY).stroke();
  totY += 10;

  const tipoCmp = mapTipoCmp({ factura: data.factura, notaCredito: data.notaCredito });
  const { docTipo: tipoDocRec, nroDoc: nroDocRec } = pickDocTipoYNumero(data);
  const qrPayload = {
    ver: 1, fecha: ymd(new Date()), cuit: Number(data.cuit_afip),
    ptoVta: Number(data.puntoDeVenta), tipoCmp,
    nroCmp: Number(data.numeroComprobante),
    importe: Number(precioTotal.toFixed(2)), moneda: "PES", ctz: 1,
    tipoDocRec: Number(tipoDocRec), nroDocRec: Number(nroDocRec),
    tipoCodAut: "E", codAut: Number.parseInt(String(data.CAE), 10),
  };
  const b64Str = Buffer.from(JSON.stringify(qrPayload), "utf-8").toString("base64");
  const qrUrl = `https://serviciosweb.afip.gob.ar/genericos/comprobantes/cae.aspx?p=${b64Str}`;
  const qrBuffer = qr.imageSync(qrUrl, { type: "png", margin: 0, size: 6 });

  doc.image(qrBuffer, ML + 10, totY, { fit: [100, 100] });
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("REFERENCIA ELECTRONICA", ML + 130, totY + 15);
  doc.text("DEL COMPROBANTE", ML + 130, totY + 29);
  doc.font("Helvetica").fontSize(10);
  doc.text(`C.A.E: ${data.CAE || ""}`, ML + 130, totY + 50);
  doc.text(`Vto.: ${data.vtoCAE || ""}`, ML + 130, totY + 65);

  doc.end();
  await finished;
  return { base64: Buffer.concat(buffers).toString("base64") };
}

// ── OC Facturas upload ──
app.post("/api/oc/:id/factura", uploadFacturaOC.single("archivo"), async (req, res) => {
  try {
    const orden = await OrdenCompra.findById(req.params.id);
    if (!orden) return res.status(404).json({ error: "OC no encontrada" });
    let archivo = "";
    if (req.file) {
      const mime = req.file.mimetype || "application/pdf";
      archivo = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
    }
    const factura = {
      numero: req.body.tipo || req.body.numero || "",
      monto: Number(req.body.monto) || 0,
      fecha: req.body.fecha || new Date().toISOString().slice(0, 10),
      archivo,
    };
    orden.facturas.push(factura);
    orden.timeline.push({ accion: "Factura adjuntada", usuario: "Sistema", fecha: new Date() });
    await orden.save();
    io.emit("cambios");
    res.json({ ok: true, factura });
  } catch (err) {
    console.error("Error upload factura OC:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/oc/:id/factura/:idx", async (req, res) => {
  try {
    const orden = await OrdenCompra.findById(req.params.id);
    if (!orden) return res.status(404).json({ error: "OC no encontrada" });
    orden.facturas.splice(Number(req.params.idx), 1);
    orden.timeline.push({ accion: "Factura eliminada", usuario: "Sistema", fecha: new Date() });
    await orden.save();
    io.emit("cambios");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Profile photo upload ──
app.post("/upload_foto_perfil", uploadPerfil.single("foto"), async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId || !req.file) return res.status(400).json({ error: "Faltan datos" });
    let foto;
    if (isCloudinaryConfigured()) {
      foto = await uploadBuffer(req.file.buffer, "musa/usuarios");
    } else {
      const mime = req.file.mimetype || "image/jpeg";
      foto = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
    }
    await Usuario.findByIdAndUpdate(userId, { foto });
    io.emit("cambios");
    res.json({ ok: true, foto });
  } catch (err) {
    console.error("Error upload foto perfil:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Chat interno: upload imagen ──
app.post("/api/chat/upload-imagen", uploadPerfil.single("imagen"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No se envió imagen" });
    let imagen;
    if (isCloudinaryConfigured()) {
      imagen = await uploadBuffer(file.buffer, "musa/chat");
    } else {
      imagen = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    }
    res.json({ ok: true, imagen });
  } catch (err) {
    console.error("Error upload imagen chat:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Media TV endpoints ──
app.post("/api/tv/upload", uploadMediaTV.single("archivo"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No se envió archivo" });
    let archivo;
    if (isCloudinaryConfigured()) {
      archivo = await uploadBuffer(file.buffer, "musa/tv");
    } else {
      archivo = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    }
    const count = await MediaTV.countDocuments();
    const doc = await MediaTV.create({
      nombre: req.body.nombre || file.originalname,
      archivo,
      orden: count,
      subidoPor: req.body.usuario || "",
    });
    io.emit("cambios-media-tv");
    res.json({ ok: true, media: { _id: doc._id, nombre: doc.nombre, orden: doc.orden } });
  } catch (err) {
    console.error("Error upload media TV:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tv/imagen/:id", async (req, res) => {
  try {
    const doc = await MediaTV.findById(req.params.id).select("archivo");
    if (!doc || !doc.archivo) return res.status(404).send("No encontrado");
    if (isUrl(doc.archivo)) {
      res.set("Cache-Control", "public, max-age=86400");
      return res.redirect(301, doc.archivo);
    }
    const matches = doc.archivo.match(/^data:(.+);base64,(.+)$/);
    if (!matches) return res.status(500).send("Formato inválido");
    res.set("Content-Type", matches[1]);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(matches[2], "base64"));
  } catch (err) {
    res.status(500).send("Error");
  }
});

// ── Feedback de eventos (público) ──
app.get("/api/feedback-evento/:eventoId/:turnoId", async (req, res) => {
  try {
    const evento = await Evento.findById(req.params.eventoId, { nombre: 1, fecha: 1 }).lean();
    const turno = await Turno.findById(req.params.turnoId, { nombre: 1 }).lean();
    if (!evento || !turno) return res.status(404).json({ error: "No encontrado" });
    const yaRespondio = await FeedbackEvento.findOne({ eventoId: req.params.eventoId, turnoId: req.params.turnoId, tipo: "cliente" }).lean();
    res.json({ evento, turno, yaRespondio: !!yaRespondio });
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

app.post("/api/feedback-evento", async (req, res) => {
  try {
    const { eventoId, turnoId, puntaje, loPositivo, loNegativo, mejoraria, comentario } = req.body;
    if (!eventoId || !turnoId || !puntaje) return res.status(400).json({ error: "Faltan datos" });
    const existe = await FeedbackEvento.findOne({ eventoId, turnoId, tipo: "cliente" });
    if (existe) return res.status(409).json({ error: "Ya dejaste tu feedback" });
    const turno = await Turno.findById(turnoId, { nombre: 1, telefono: 1 }).lean();
    await FeedbackEvento.create({
      eventoId, turnoId, tipo: "cliente",
      nombre: turno?.nombre || "Anónimo", telefono: turno?.telefono || "",
      puntaje, loPositivo, loNegativo, mejoraria, comentario,
    });
    io.emit("cambios");
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

// Servir la aplicación principal (index.html) para cualquier ruta no-API
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "dist", "index.html"));
});

// Helper: crear notificación y emitir evento
async function crearNotificacion({ tipo, mensaje, destinatarioRol, destinatarioId, referenciaId }) {
  try {
    await Notificacion.create({ tipo, mensaje, destinatarioRol, destinatarioId, referenciaId });
    io.emit("cambios-notificaciones");
  } catch (err) {
    console.error("Error creando notificacion:", err);
  }
}

// Helper: auto-vincular venta a cliente por CUIT
async function vincularVentaCliente(ventaDoc, clienteIdExplicito) {
  try {
    // Si se pasa un clienteId explicito desde el carrito, usarlo directamente
    if (clienteIdExplicito) {
      ventaDoc.clienteId = clienteIdExplicito;
      await ventaDoc.save();
      return;
    }
    // Fallback: vincular por CUIT
    const cuit = ventaDoc.cuit;
    if (!cuit || cuit.length < 5) return;
    let cliente = await Cliente.findOne({ cuit });
    if (!cliente) {
      cliente = await Cliente.create({
        nombre: ventaDoc.razonSocial || ventaDoc.nombre || cuit,
        cuit,
        razonSocial: ventaDoc.razonSocial || "",
        domicilio: ventaDoc.domicilio || "",
        localidad: ventaDoc.localidad || "",
        provincia: ventaDoc.provincia || "",
      });
    }
    ventaDoc.clienteId = cliente._id;
    await ventaDoc.save();
  } catch (err) {
    console.error("Error vinculando venta a cliente:", err);
  }
}

// Helper: verifica que el socket esté autenticado
const requireAuth = (socket) => {
  if (!socket.usuario) return false;
  return true;
};
const requireAdmin = (socket) => {
  if (!socket.usuario) return false;
  return socket.usuario.rol === "admin";
};
const requirePermiso = (socket, permiso) => {
  if (!socket.usuario) return false;
  if (socket.usuario.rol === "admin") return true;
  if (socket.usuario.permisos?.includes("*")) return true;
  return socket.usuario.permisos?.includes(permiso) || false;
};

io.on("connection", (socket) => {
  socket.on(
    "request-productos",
    async ({
      page = 1,
      search = "",
      isCarrito = false,
      isFavorito = false,
      ordenadoCantidad = "",
      ordenadoCepa = "",
      filtroCepa = "",
      filtroBodega = "",
      filtroOrigen = "",
      filtroYear = "",
    }) => {
      const pageSize = 50;
      try {
        const query = {
          ...(search
            ? {
              $or: [
                { codigo: new RegExp(search, "i") },
                { nombre: new RegExp(search, "i") },
                { bodega: new RegExp(search, "i") },
                { cepa: new RegExp(search, "i") },
                { origen: new RegExp(search, "i") },
              ],
            }
            : {}),
          ...(isCarrito ? { carrito: true } : {}),
          ...(isFavorito ? { favorito: true } : {}),
          ...(filtroCepa ? { cepa: filtroCepa } : {}),
          ...(filtroBodega ? { bodega: filtroBodega } : {}),
          ...(filtroOrigen ? { origen: filtroOrigen } : {}),
          ...(filtroYear ? { year: filtroYear } : {}),
        };

        // Determinar el orden de los productos según los criterios seleccionados
        const sortOption = {
          ...(ordenadoCepa && { cepa: ordenadoCepa === "asc" ? 1 : -1 }),
          ...(ordenadoCantidad && { cantidad: ordenadoCantidad === "asc" ? 1 : -1 }),
          ...(!ordenadoCepa && !ordenadoCantidad && { _id: -1 }),
        };

        const [productos, totalProductos, stockTotal] = await Promise.all([
          Product.find(query)
            .select("-foto -fotos -fotoIA -descripcionGenerada")
            .sort(sortOption)
            .collation({ locale: "es", strength: 1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize),
          Product.countDocuments(query),
          Product.aggregate([
            { $match: { $and: [query, { $or: [{ tipo: "vino" }, { tipo: { $exists: false } }, { tipo: null }] }] } },
            { $group: { _id: null, total: { $sum: { $toInt: "$cantidad" } } } },
          ]).allowDiskUse(true),
        ]);

        let totalPages = Math.ceil(totalProductos / pageSize);
        if (totalPages === 0) totalPages = 1;

        socket.emit("response-productos", {
          productos,
          totalProductos,
          totalPages,
          stockTotal: stockTotal[0]?.total || 0,
        });
      } catch (error) {
        console.error("Error al obtener productos:", error);
        socket.emit("response-productos", {
          status: "error",
          message: "Error al obtener productos",
        });
      }
    }
  );
  socket.on("request-filtros-productos", async () => {
    try {
      const [cepas, bodegas, origenes, years] = await Promise.all([
        Product.distinct("cepa"),
        Product.distinct("bodega"),
        Product.distinct("origen"),
        Product.distinct("year"),
      ]);
      socket.emit("response-filtros-productos", {
        cepas: cepas.filter(Boolean).sort(),
        bodegas: bodegas.filter(Boolean).sort(),
        origenes: origenes.filter(Boolean).sort(),
        years: years.filter(Boolean).sort(),
      });
    } catch (error) {
      console.error("Error al obtener filtros:", error);
      socket.emit("response-filtros-productos", { cepas: [], bodegas: [], origenes: [], years: [] });
    }
  });

  socket.on("agregar-stock", async (id, cantidad) => {
    try {
      const producto = await Product.findById(id);
      if (!producto) return;
      const nuevaCantidad = parseInt(producto.cantidad) + parseInt(cantidad);
      producto.cantidad = nuevaCantidad.toString();
      await producto.save();
      io.emit("cambios");
    } catch (err) { console.error("Error agregar-stock:", err); }
  });
  socket.on("delete-producto", async (id) => {
    try {
      if (!requireAuth(socket)) return;
      await Product.findByIdAndDelete(id);
      io.emit("cambios");
    } catch (err) { console.error("Error delete-producto:", err); }
  });
  socket.on("scan-code", async (codigo) => {
    try {
      const producto = await Product.findOne({ codigo });
      socket.emit("producto-encontrado", producto || null);
    } catch (err) {
      console.error("Error scan-code:", err);
      socket.emit("producto-encontrado", null);
    }
  });
  socket.on("toggle-favorito", async (id) => {
    try {
      const product = await Product.findById(id);
      if (product) {
        const newFavorito = product.favorito === true ? false : true;
        product.favorito = newFavorito;
        await product.save();
        io.emit("cambios");
      } else {
        console.error("Producto no encontrado");
      }
    } catch (error) {
      console.error("Error al actualizar el favorito:", error);
    }
  });
  socket.on("toggle-carrito", async (id) => {
    try {
      const product = await Product.findById(id).select("carrito").lean();
      if (product) {
        await Product.updateOne({ _id: id }, { carrito: !product.carrito, carritoCantidad: 1 });
        io.emit("cambios");
      }
    } catch (error) {
      console.error("Error al actualizar el carrito:", error);
    }
  });
  socket.on("aprobar-descripcion-ia", async (id, cb) => {
    try {
      await Product.findByIdAndUpdate(id, { descripcionIA: false });
      io.emit("cambios");
      if (cb) cb({ ok: true });
    } catch (err) {
      console.error("Error aprobar-descripcion-ia:", err);
      if (cb) cb({ error: err.message });
    }
  });

  // ── Generar descripcion con IA ──
  socket.on("generar-descripcion-ia", async (id, cb) => {
    const AI_KEY_ANTHROPIC = process.env.ANTHROPIC_API_KEY;
    const AI_KEY_OPENAI = process.env.OPENAI_API_KEY;
    const TEXT_KEY = AI_KEY_ANTHROPIC || AI_KEY_OPENAI;
    if (!TEXT_KEY) {
      if (cb) cb({ error: "No hay API key de IA configurada" });
      return;
    }
    try {
      const producto = await Product.findById(id);
      if (!producto) {
        if (cb) cb({ error: "Producto no encontrado" });
        return;
      }

      const prompt = `Sos un sommelier argentino experto y periodista de vinos. Genera una descripcion detallada y con research para este vino. Investiga y aporta datos reales sobre la bodega, el terroir, la region, la altitud de los viñedos, el enólogo, y el estilo del vino. Incluye notas de cata (aroma, boca, final), temperatura de servicio, maridaje sugerido y tiempo de decantacion si aplica. Entre 80 y 150 palabras. No uses markdown ni comillas. Escribe en español argentino, con tono profesional pero accesible. Si no conoces el vino exacto, inferi con precision en base a la cepa, bodega y origen, pero no inventes datos falsos.

Vino: ${producto.nombre || ""}
Bodega: ${producto.bodega || ""}
Cepa: ${producto.cepa || ""}
Año: ${producto.year || ""}
Origen: ${producto.origen || ""}`;

      let descripcion = "";
      if (AI_KEY_ANTHROPIC) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": AI_KEY_ANTHROPIC,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 400,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data = await res.json();
        descripcion = data.content?.[0]?.text || "";
      } else {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AI_KEY_OPENAI}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            max_tokens: 400,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data = await res.json();
        descripcion = data.choices?.[0]?.message?.content || "";
      }

      if (descripcion) {
        await Product.findByIdAndUpdate(id, { descripcionGenerada: descripcion.trim() });
        io.emit("cambios");
        if (cb) cb({ ok: true, descripcionGenerada: descripcion.trim() });
      } else {
        if (cb) cb({ error: "No se pudo generar la descripcion" });
      }
    } catch (err) {
      console.error("Error generar-descripcion-ia:", err.message);
      if (cb) cb({ error: err.message });
    }
  });

  // ── Toggle usar descripcion IA ──
  socket.on("toggle-descripcion-ia", async (id, cb) => {
    try {
      const producto = await Product.findById(id);
      if (!producto) {
        if (cb) cb({ error: "Producto no encontrado" });
        return;
      }
      producto.usarDescripcionIA = !producto.usarDescripcionIA;
      await producto.save();
      io.emit("cambios");
      if (cb) cb({ ok: true, usarDescripcionIA: producto.usarDescripcionIA });
    } catch (err) {
      console.error("Error toggle-descripcion-ia:", err);
      if (cb) cb({ error: err.message });
    }
  });

  // ── Mejorar foto con IA (gpt-image-1 edit) ──
  socket.on("mejorar-foto-ia", async (id, cb) => {
    const AI_KEY_OPENAI = process.env.OPENAI_API_KEY;
    if (!AI_KEY_OPENAI) {
      if (cb) cb({ error: "No hay API key de OpenAI configurada" });
      return;
    }
    try {
      const producto = await Product.findById(id);
      if (!producto) {
        if (cb) cb({ error: "Producto no encontrado" });
        return;
      }
      if (!producto.foto) {
        if (cb) cb({ error: "Este producto no tiene foto" });
        return;
      }

      // Si la foto es una URL de Cloudinary, descargarla y convertir a base64
      let mimeType, base64Image;
      if (isUrl(producto.foto)) {
        const imgFetch = await fetch(producto.foto);
        const buf = Buffer.from(await imgFetch.arrayBuffer());
        mimeType = imgFetch.headers.get("content-type") || "image/jpeg";
        base64Image = buf.toString("base64");
      } else {
        const match = producto.foto.match(/^data:(image\/[\w+]+);base64,(.+)$/);
        if (!match) {
          if (cb) cb({ error: "Formato de foto invalido" });
          return;
        }
        mimeType = match[1];
        base64Image = match[2];
      }

      const imgRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AI_KEY_OPENAI}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_image",
                  image_url: `data:${mimeType};base64,${base64Image}`,
                },
                {
                  type: "input_text",
                  text: "Look at this wine bottle product photo very carefully. Generate an improved version of this EXACT same wine bottle as a professional studio product photo. The bottle, label, text, colors, design and every detail must be reproduced as faithfully as possible. Only improve the background (clean white/light gradient studio background) and lighting (professional studio lighting with soft shadows and elegant highlights on the glass). Make it look like a high-end commercial e-commerce product photo.",
                },
              ],
            },
          ],
          tools: [{ type: "image_generation", size: "1024x1024" }],
        }),
      });

      const imgData = await imgRes.json();
      console.log("Responses API status:", imgRes.status, imgData.error ? JSON.stringify(imgData.error) : "OK");

      // Buscar la imagen generada en el output
      const imageOutput = imgData.output?.find((o) => o.type === "image_generation_call");
      if (imageOutput?.result) {
        let fotoIA;
        if (isCloudinaryConfigured()) {
          fotoIA = await uploadBase64(`data:image/png;base64,${imageOutput.result}`, "musa/productos-ia");
        } else {
          fotoIA = `data:image/png;base64,${imageOutput.result}`;
        }
        await Product.findByIdAndUpdate(id, { fotoIA });
        io.emit("cambios");
        if (cb) cb({ ok: true, fotoIA });
      } else {
        console.error("Responses API no retorno imagen:", JSON.stringify(imgData).substring(0, 500));
        if (cb) cb({ error: "No se pudo generar la imagen" });
      }
    } catch (err) {
      console.error("Error mejorar-foto-ia:", err.message);
      if (cb) cb({ error: err.message });
    }
  });

  // ── Toggle usar foto IA ──
  socket.on("toggle-foto-ia", async (id, cb) => {
    try {
      const producto = await Product.findById(id);
      if (!producto) {
        if (cb) cb({ error: "Producto no encontrado" });
        return;
      }
      producto.usarFotoIA = !producto.usarFotoIA;
      await producto.save();
      io.emit("cambios");
      if (cb) cb({ ok: true, usarFotoIA: producto.usarFotoIA });
    } catch (err) {
      console.error("Error toggle-foto-ia:", err);
      if (cb) cb({ error: err.message });
    }
  });

  // ── Obtener fotos de un producto (para edicion) ──
  socket.on("request-producto-fotos", async (id, cb) => {
    try {
      const p = await Product.findById(id).select("fotos fotoPrincipalIdx foto").lean();
      if (!p) { if (cb) cb({ error: "Producto no encontrado" }); return; }
      // Backward compat: si no tiene fotos array pero si foto, usarla
      const fotos = (p.fotos && p.fotos.length > 0) ? p.fotos : (p.foto ? [p.foto] : []);
      if (cb) cb({ fotos, fotoPrincipalIdx: p.fotoPrincipalIdx || 0 });
    } catch (err) {
      if (cb) cb({ error: err.message });
    }
  });

  // ── Cambiar foto principal ──
  socket.on("set-foto-principal", async (id, idx, cb) => {
    try {
      const p = await Product.findById(id);
      if (!p) { if (cb) cb({ error: "Producto no encontrado" }); return; }
      const fotos = (p.fotos && p.fotos.length > 0) ? p.fotos : (p.foto ? [p.foto] : []);
      if (idx < 0 || idx >= fotos.length) { if (cb) cb({ error: "Indice invalido" }); return; }
      p.fotoPrincipalIdx = idx;
      p.foto = fotos[idx];
      if (!p.fotos || p.fotos.length === 0) p.fotos = fotos;
      await p.save();
      io.emit("cambios");
      if (cb) cb({ ok: true });
    } catch (err) {
      if (cb) cb({ error: err.message });
    }
  });

  // ── Eliminar una foto por indice ──
  socket.on("delete-foto-producto", async (id, idx, cb) => {
    try {
      const p = await Product.findById(id);
      if (!p) { if (cb) cb({ error: "Producto no encontrado" }); return; }
      const fotos = (p.fotos && p.fotos.length > 0) ? p.fotos : (p.foto ? [p.foto] : []);
      if (idx < 0 || idx >= fotos.length) { if (cb) cb({ error: "Indice invalido" }); return; }
      fotos.splice(idx, 1);
      p.fotos = fotos;
      // Ajustar indice principal
      if (p.fotoPrincipalIdx >= fotos.length) p.fotoPrincipalIdx = Math.max(0, fotos.length - 1);
      p.foto = fotos[p.fotoPrincipalIdx] || "";
      await p.save();
      io.emit("cambios");
      if (cb) cb({ ok: true, fotos, fotoPrincipalIdx: p.fotoPrincipalIdx });
    } catch (err) {
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("reset-fav-carrito", async () => {
    try {
      await Product.updateMany(
        { $or: [{ favorito: true }, { carrito: true }] },
        { $set: { favorito: false, carrito: false } }
      );
      io.emit("cambios");
    } catch (err) { console.error("Error reset-fav-carrito:", err); }
  });
  socket.on("productos-carrito", async () => {
    try {
      const productosCarrito = await Product.find({ carrito: true }).select("-foto -fotos -fotoIA -descripcionGenerada");
      socket.emit("productos-carrito", productosCarrito);
    } catch (err) { console.error("Error productos-carrito:", err); }
  });
  socket.on("actualizar-cantidad-carrito", async ({ id, cantidad }) => {
    try {
      await Product.updateOne({ _id: id }, { carritoCantidad: cantidad });
    } catch (error) {
      console.error("Error al actualizar carritoCantidad:", error);
    }
  });
  socket.on("finalizar-compra", async (datosCompra) => {
    try {
      // Obtenemos todos los productos que están en el carrito (sin fotos para no guardarlas en la venta)
      const productosCarritoRaw = await Product.find({ carrito: true });
      const productosCarrito = productosCarritoRaw.map(p => {
        const obj = p.toObject();
        delete obj.foto;
        delete obj.fotoIA;
        delete obj.descripcionGenerada;
        return obj;
      });

      // Calculamos el total de la venta
      let ventaCreada1, ventaCreada2, ventaCreada3;
      let totalVenta = 0;
      productosCarrito.forEach((producto) => {
        totalVenta += producto.carritoCantidad * parseFloat(producto.venta);
      });

      // Aplicamos el descuento si lo hay
      totalVenta = totalVenta - datosCompra.descuento;

      // NUEVO: Obtenemos los montos de pago mixto (si vienen desde el frontend).
      // Si no, se dejan como 0.
      const montoEfectivo = datosCompra.efectivoMixto || 0;
      const montoDigital = datosCompra.digitalMixto || 0;

      // Factura A
      if (datosCompra.factura === "A") {
        const data_factura = await afipService.facturaA(
          totalVenta,
          datosCompra.cuit
        );
        let data = {};
        let persona;
        try {
          persona = await afipService.getPersona(datosCompra.cuit);
        } catch (error) {
          socket.emit("error-cuit-invalido");
          return;
        }
        if (persona.personaReturn.errorConstancia) {
          socket.emit("error-no-cuit");
          return;
        }
        data.cuit = datosCompra.cuit;
        data.factura = datosCompra.factura;
        data.razonSocial = persona.personaReturn.datosGenerales.razonSocial;
        data.localidad =
          persona.personaReturn.datosGenerales.domicilioFiscal.localidad;
        data.direccion =
          persona.personaReturn.datosGenerales.domicilioFiscal.direccion;
        data.provincia =
          persona.personaReturn.datosGenerales.domicilioFiscal.descripcionProvincia;
        data.numeroComprobante = data_factura.numeroComprobante;
        data.puntoDeVenta = afipService.ptoVta;
        data.cuit_afip = afipService.CUIT;
        data.precio = totalVenta;
        data.descuento = datosCompra.descuento;
        data.CAE = data_factura.CAE;
        data.vtoCAE = data_factura.vtoCAE;
        data.tipoDoc = data_factura.docTipo;
        data.productosCarrito = productosCarrito;

        // Generamos ticket térmico + PDF A4 en paralelo
        const [ticketA, a4A] = await Promise.all([
          imprimirTicket(data),
          generarFacturaA4(data),
        ]);
        socket.emit("ticket-listo", { base64: ticketA.base64 });

        // Creación de la venta en la base de datos
        const venta = {
          productos: productosCarrito,
          tipoFactura: datosCompra.factura,
          stringNumeroFactura:
            `F${datosCompra.factura}-0000${data.puntoDeVenta.toString()}-` +
            data.numeroComprobante.toString().padStart(8, "0"),
          numeroFactura: data.numeroComprobante,
          cuit: datosCompra.cuit,
          monto: totalVenta,
          formaPago: datosCompra.formaPago,
          domicilio: data.direccion,
          provincia: data.provincia,
          localidad: data.localidad,
          razonSocial: data.razonSocial,
          fecha: moment(new Date())
            .tz("America/Argentina/Buenos_Aires")
            .format("YYYY-MM-DD"),
          descuento: datosCompra.descuento,
          detalle: datosCompra.detalle,

          // NUEVOS CAMPOS
          montoEfectivo,
          montoDigital,
          facturaPdf: a4A.base64,
        };
        ventaCreada1 = await Venta.create(venta);
        autoLinkMpPayment(ventaCreada1);
        vincularVentaCliente(ventaCreada1, datosCompra.clienteId);

        // Factura B
      } else if (datosCompra.factura === "B") {
        let data_factura;
        if (datosCompra.dni) {
          data_factura = await afipService.facturaB(
            totalVenta,
            datosCompra.dni
          );
        } else {
          data_factura = await afipService.facturaB(totalVenta, 0);
        }
        let data = {};
        data.dni = datosCompra.dni;
        data.nombre = datosCompra.nombre;
        data.domicilio = datosCompra.domicilio;
        data.factura = datosCompra.factura;
        data.numeroComprobante = data_factura.numeroComprobante;
        data.puntoDeVenta = afipService.ptoVta;
        data.cuit_afip = afipService.CUIT;
        data.precio = totalVenta;
        data.descuento = datosCompra.descuento;
        data.CAE = data_factura.CAE;
        data.vtoCAE = data_factura.vtoCAE;
        data.tipoDoc = data_factura.docTipo;
        data.productosCarrito = productosCarrito;

        // Generamos ticket térmico + PDF A4 en paralelo
        const [ticketB, a4B] = await Promise.all([
          imprimirTicket(data),
          generarFacturaA4(data),
        ]);
        socket.emit("ticket-listo", { base64: ticketB.base64 });

        // Creación de la venta en la base de datos
        const venta = {
          productos: productosCarrito,
          tipoFactura: datosCompra.factura,
          stringNumeroFactura:
            `F${datosCompra.factura}-0000${data.puntoDeVenta.toString()}-` +
            data.numeroComprobante.toString().padStart(8, "0"),
          numeroFactura: data.numeroComprobante,
          cuit: datosCompra.dni, // En caso de usar DNI como identificador
          monto: totalVenta,
          formaPago: datosCompra.formaPago,
          domicilio: datosCompra.domicilio,
          nombre: datosCompra.nombre,
          fecha: moment(new Date())
            .tz("America/Argentina/Buenos_Aires")
            .format("YYYY-MM-DD"),
          descuento: datosCompra.descuento,
          detalle: datosCompra.detalle,

          // NUEVOS CAMPOS
          montoEfectivo,
          montoDigital,
          facturaPdf: a4B.base64,
        };
        ventaCreada2 = await Venta.create(venta);
        autoLinkMpPayment(ventaCreada2);
        vincularVentaCliente(ventaCreada2, datosCompra.clienteId);

        // Sin factura
      } else {
        // Creación de la venta en la base de datos sin factura A/B
        const venta = {
          productos: productosCarrito,
          monto: totalVenta,
          formaPago: datosCompra.formaPago,
          fecha: moment(new Date())
            .tz("America/Argentina/Buenos_Aires")
            .format("YYYY-MM-DD"),
          descuento: datosCompra.descuento,
          detalle: datosCompra.detalle,

          // NUEVOS CAMPOS
          montoEfectivo,
          montoDigital,
        };
        ventaCreada3 = await Venta.create(venta);
        autoLinkMpPayment(ventaCreada3);
        vincularVentaCliente(ventaCreada3, datosCompra.clienteId);
      }

      // Actualizamos el stock de los productos en el carrito
      for (const producto of productosCarrito) {
        await Product.findByIdAndUpdate(producto._id, {
          $inc: { cantidad: -producto.carritoCantidad },
        });
      }

      // Reiniciamos carrito y favoritos
      await Product.updateMany(
        { $or: [{ carrito: true }, { favorito: true }] },
        { carrito: false, favorito: false }
      );

      // Emitimos los eventos pertinentes
      io.emit("cambios");

      // Determinamos cuál venta se creó para enviar info al frontend
      const ventaFinal = ventaCreada1 || ventaCreada2 || ventaCreada3 || null;
      socket.emit("compra-finalizada", {
        ventaId: ventaFinal?._id,
        formaPago: datosCompra.formaPago,
        monto: totalVenta,
        fecha: ventaFinal?.fecha,
        stringNumeroFactura: ventaFinal?.stringNumeroFactura,
        numeroVenta: ventaFinal?.numeroVenta,
      });
    } catch (error) {
      console.error("Error al finalizar la compra:", error);
      socket.emit("error-finalizar-compra", {
        message: "Hubo un error al finalizar la compra.",
      });
    }
  });
  socket.on(
    "request-ventas",
    async ({ fecha, page, filtroPago, filtroTipo, filtroNotaCredito }) => {
      const pageSize = 50;
      try {
        // Construir el query dinámicamente
        const query = {
          ...(fecha ? { fecha: fecha } : {}),
          ...(filtroPago && filtroPago !== "todos"
            ? { formaPago: filtroPago.toUpperCase() }
            : {}),
          ...(filtroTipo && filtroTipo !== "todos"
            ? filtroTipo === "vino"
              ? { idTurno: { $exists: false } } // "vino" implica que no hay idTurno
              : { idTurno: { $exists: true } } // "reserva" implica que sí hay idTurno
            : {}),
          ...(filtroNotaCredito ? { notaCredito: true } : {}),
        };

        // Consultar las ventas aplicando los filtros
        const ventas = await Venta.find(query)
          .select("-facturaPdf -notaCreditoPdf")
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize);

        // Enriquecer ventas de reserva con info del turno (fecha/turno/nombre)
        const turnoIds = [
          ...new Set(
            ventas
              .map((venta) => (venta.idTurno ? String(venta.idTurno) : ""))
              .filter(Boolean)
          ),
        ];
        let turnosById = new Map();
        if (turnoIds.length > 0) {
          const turnos = await Turno.find({ _id: { $in: turnoIds } })
            .select("_id nombre fecha turno")
            .lean();
          turnosById = new Map(turnos.map((turno) => [String(turno._id), turno]));
        }
        // Enriquecer con montos de pagos MP vinculados
        const allMpIds = ventas.flatMap((v) => v.mpPaymentIds || []);
        let mpMontoMap = new Map();
        if (allMpIds.length > 0) {
          const pagos = await PagoMp.find({ mpId: { $in: allMpIds } }).select("mpId monto").lean();
          pagos.forEach((p) => mpMontoMap.set(p.mpId, p.monto || 0));
        }

        const ventasEnriquecidas = ventas.map((venta) => {
          const ventaObj = venta.toObject();

          // Calcular monto total de pagos MP vinculados
          if (ventaObj.mpPaymentIds?.length) {
            ventaObj.mpMontoVinculado = ventaObj.mpPaymentIds.reduce((sum, id) => sum + (mpMontoMap.get(id) || 0), 0);
          }

          if (!ventaObj.idTurno) return ventaObj;

          const turno = turnosById.get(String(ventaObj.idTurno));
          if (!turno) return ventaObj;

          return {
            ...ventaObj,
            nombreTurno: ventaObj.nombreTurno || turno.nombre || "",
            reservaFecha: ventaObj.reservaFecha || turno.fecha || "",
            reservaTurno: ventaObj.reservaTurno || turno.turno || "",
          };
        });

        // Calcular el total de ventas con los mismos filtros
        const totalVentas = await Venta.countDocuments(query);
        let totalPages = Math.ceil(totalVentas / pageSize);
        if (totalPages === 0) {
          totalPages = 1;
        }

        // Emitir los datos filtrados
        socket.emit("response-ventas", {
          ventas: ventasEnriquecidas,
          totalVentas,
          totalPages,
        });
      } catch (error) {
        console.error("Error fetching ventas:", error);
        socket.emit("response-ventas", {
          status: "error",
          message: "Error fetching ventas",
        });
      }
    }
  );
  socket.on("nota-credito", async (venta) => {
    if (!requireAuth(socket)) return;
    let data;
    if (venta.tipoFactura === "A") {
      // Nota de crédito tipo A
      data = await afipService.notaCreditoA(
        venta.monto,
        venta.cuit,
        venta.numeroFactura
      );
      data = {
        ...data,
        cuit: venta.cuit,
        numeroComprobante: data.numeroComprobante,
        puntoDeVenta: afipService.ptoVta,
        factura: venta.tipoFactura,
        precio: venta.monto,
        tipoDoc: data.docTipo,
        cuit_afip: afipService.CUIT,
        productosCarrito: venta.productos,
        razonSocial: venta.razonSocial,
        localidad: venta.localidad,
        direccion: venta.domicilio,
        provincia: venta.provincia,
        notaCredito: true,
        descuento: venta.descuento,
      };
    } else if (venta.tipoFactura === "B") {
      // Nota de crédito tipo B
      data = await afipService.notaCreditoB(
        venta.monto,
        venta.cuit,
        venta.numeroFactura
      );
      data = {
        ...data,
        dni: venta.cuit,
        nombre: venta.nombre,
        domicilio: venta.domicilio,
        factura: venta.tipoFactura,
        numeroComprobante: data.numeroComprobante,
        puntoDeVenta: afipService.ptoVta,
        cuit_afip: afipService.CUIT,
        precio: venta.monto,
        tipoDoc: data.docTipo,
        productosCarrito: venta.productos,
        notaCredito: true,
        descuento: venta.descuento,
      };
    }
    if (venta.idTurno) {
      data.productosCarrito = [
        { nombre: "RESERVA", carritoCantidad: 1, venta: venta.monto },
      ];
      const turno = await Turno.findById(venta.idTurno);
      if (turno) {
        const nuevoCobrado = turno.cobrado - venta.monto;
        await Turno.findByIdAndUpdate(venta.idTurno, {
          cobrado: nuevoCobrado,
        });
      }
    }
    // Generar ticket térmico + PDF A4 en paralelo
    const [ticketNC, a4NC] = await Promise.all([
      imprimirTicket(data),
      generarFacturaA4(data),
    ]);
    socket.emit("ticket-listo", { base64: ticketNC.base64 });
    const ptoVtaStr = String(data.puntoDeVenta || 0).padStart(6, "0");
    const nroNcStr = String(data.numeroComprobante || 0).padStart(8, "0");
    const stringNumeroNotaCredito = `F${venta.tipoFactura}-${ptoVtaStr}-${nroNcStr}`;
    await Venta.findByIdAndUpdate(venta._id, {
      notaCredito: true,
      numeroNotaCredito: String(data.numeroComprobante || ""),
      stringNumeroNotaCredito,
      notaCreditoPdf: a4NC.base64,
    });
    if (!venta.idTurno) {
      await Promise.all(data.productosCarrito.map((producto) =>
        Product.findByIdAndUpdate(producto._id, { $inc: { cantidad: producto.carritoCantidad } })
      ));
    }
    // Emitir cambios
    io.emit("cambios");
  });
  socket.on("devolucion", async (venta) => {
    try {
      if (venta.idTurno) {
        const turno = await Turno.findById(venta.idTurno);
        if (turno) {
          const nuevoCobrado = turno.cobrado - venta.monto;
          await Turno.findByIdAndUpdate(venta.idTurno, { cobrado: nuevoCobrado });
        }
      }
      await Venta.findByIdAndUpdate(venta._id, { notaCredito: true });
      await Promise.all(venta.productos.map((producto) =>
        Product.findByIdAndUpdate(producto._id, { $inc: { cantidad: producto.carritoCantidad } })
      ));
      io.emit("cambios");
    } catch (err) { console.error("Error devolucion:", err); }
  });
  socket.on("request-totales", async (fecha) => {
    try {
      const filtroFecha = fecha ? { fecha } : {};
      // Una sola query con $group para todas las formas de pago
      const ventaTotales = await Venta.aggregate([
        { $match: { ...filtroFecha, notaCredito: { $ne: true } } },
        { $group: {
          _id: null,
          efectivo: { $sum: { $cond: [{ $eq: ["$formaPago", "EFECTIVO"] }, "$monto", 0] } },
          digital: { $sum: { $cond: [{ $eq: ["$formaPago", "DIGITAL"] }, "$monto", 0] } },
          mixtoEfectivo: { $sum: { $cond: [{ $eq: ["$formaPago", "MIXTO"] }, { $ifNull: ["$montoEfectivo", 0] }, 0] } },
          mixtoDigital: { $sum: { $cond: [{ $eq: ["$formaPago", "MIXTO"] }, { $ifNull: ["$montoDigital", 0] }, 0] } },
        }},
      ]);

      let efectivo = 0, digital = 0;
      if (ventaTotales.length > 0) {
        efectivo = ventaTotales[0].efectivo + ventaTotales[0].mixtoEfectivo;
        digital = ventaTotales[0].digital + ventaTotales[0].mixtoDigital;
      }

      // Agregar totales de operaciones via aggregate (no cargar todo en memoria)
      const opTotales = await Operacion.aggregate([
        { $match: filtroFecha },
        { $group: {
          _id: null,
          efectivo: { $sum: { $cond: [{ $eq: ["$formaPago", "EFECTIVO"] }, "$monto", 0] } },
          digital: { $sum: { $cond: [{ $eq: ["$formaPago", "DIGITAL"] }, "$monto", 0] } },
          mixtoEfectivo: { $sum: { $cond: [{ $eq: ["$formaPago", "MIXTO"] }, { $ifNull: ["$montoEfectivo", 0] }, 0] } },
          mixtoDigital: { $sum: { $cond: [{ $eq: ["$formaPago", "MIXTO"] }, { $ifNull: ["$montoDigital", 0] }, 0] } },
        }},
      ]);
      if (opTotales.length > 0) {
        efectivo += opTotales[0].efectivo + opTotales[0].mixtoEfectivo;
        digital += opTotales[0].digital + opTotales[0].mixtoDigital;
      }

      socket.emit("response-totales", { efectivo, digital });
    } catch (err) { console.error("Error request-totales:", err); }
  });
  socket.on("request-nombres", async () => {
    try {
      const nombres = await Operacion.distinct("nombre");
      socket.emit("response-nombres", nombres);
    } catch (err) { console.error("Error request-nombres:", err); }
  });
  socket.on("guardar-operacion", async (operacion) => {
    try {
      if (operacion._id) {
        await Operacion.findByIdAndUpdate(operacion._id, operacion);
      } else {
        operacion.fecha = moment(new Date())
          .tz("America/Argentina/Buenos_Aires")
          .format("YYYY-MM-DD");
        await Operacion.create(operacion);
      }
      io.emit("cambios");
    } catch (err) { console.error("Error guardar-operacion:", err); }
  });
  socket.on("borrar-operacion", async (id) => {
    try {
      if (!requireAuth(socket)) return;
      await Operacion.findByIdAndDelete(id);
      io.emit("cambios");
    } catch (err) {
      console.error("Error al borrar operacion:", err);
    }
  });
  socket.on("request-operaciones", async ({ fecha, fechaDesde, fechaHasta, tipoOperacion, search, page }) => {
    const pageSize = 50;
    const pageNumber = page || 1;
    let filter = {};
    if (fechaDesde && fechaHasta) {
      filter.fecha = { $gte: fechaDesde, $lte: fechaHasta };
    } else if (fechaDesde) {
      filter.fecha = { $gte: fechaDesde };
    } else if (fechaHasta) {
      filter.fecha = { $lte: fechaHasta };
    } else if (fecha) {
      filter.fecha = fecha;
    }
    if (tipoOperacion) {
      filter.tipoOperacion = tipoOperacion;
    }
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      filter.$or = [
        { descripcion: searchRegex },
        { tipoOperacion: searchRegex },
        { nombre: searchRegex },
      ];
    }
    try {
      const operaciones = await Operacion.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize);
      const totalOperaciones = await Operacion.countDocuments(filter);
      let totalPages = Math.ceil(totalOperaciones / pageSize);
      if (totalPages === 0) {
        totalPages = 1;
      }
      socket.emit("response-operaciones", {
        operaciones,
        totalOperaciones,
        totalPages,
      });
    } catch (error) {
      socket.emit("error", { message: "Error retrieving operations", error });
    }
  });
  socket.on("request-tipo-operacion", async (tipo, filtro) => {
    try {
      const q = { tipoOperacion: tipo };
      if (typeof filtro === "object" && filtro?.desde && filtro?.hasta) {
        q.fecha = { $gte: filtro.desde, $lte: filtro.hasta };
      } else {
        const mes = typeof filtro === "string" ? filtro : "";
        if (mes) q.fecha = { $regex: `^${mes}` };
      }
      const operaciones = await Operacion.find(q).sort({ createdAt: -1 });

      let operacionesPorNombre = {};
      operaciones.forEach((operacion) => {
        if (operacionesPorNombre[operacion.nombre]) {
          operacionesPorNombre[operacion.nombre].monto += operacion.monto;
        } else {
          operacionesPorNombre[operacion.nombre] = {
            ...operacion._doc,
            monto: operacion.monto,
          };
        }
      });

      const operacionesAgrupadas = Object.values(operacionesPorNombre);
      socket.emit("response-tipo-operacion", operacionesAgrupadas);
    } catch (error) {
      console.error("Error al obtener operaciones:", error);
      socket.emit("error", { message: "Error al obtener operaciones." });
    }
  });
  socket.on("request-facturado", async (filtro) => {
    try {
      let fechaQ;
      if (typeof filtro === "object" && filtro?.desde && filtro?.hasta) {
        fechaQ = { $gte: filtro.desde, $lte: filtro.hasta };
      } else {
        const mes = typeof filtro === "string" ? filtro : "";
        fechaQ = mes ? { $regex: `^${mes}` } : {};
      }
      const ventas = await Venta.find({ fecha: fechaQ }).select("-facturaPdf -notaCreditoPdf").lean();

      let totalFacturado = 0;
      let totalNoFacturado = 0;

      ventas.forEach((venta) => {
        if (venta.notaCredito) {
          return; // Si es nota de crédito, se salta a la siguiente iteración
        }
        if (venta.tipoFactura === "A" || venta.tipoFactura === "B") {
          totalFacturado += venta.monto;
        } else {
          totalNoFacturado += venta.monto;
        }
      });
      socket.emit("response-facturado", { totalFacturado, totalNoFacturado });
    } catch (error) {
      console.error("Error al obtener las ventas y sumar los montos:", error);
      socket.emit("error", {
        message: "Error al obtener las ventas y sumar los montos.",
      });
    }
  });
  socket.on("request-gastos", async (filtro) => {
    try {
      let fechaQ;
      if (typeof filtro === "object" && filtro?.desde && filtro?.hasta) {
        fechaQ = { $gte: filtro.desde, $lte: filtro.hasta };
      } else {
        const mes = typeof filtro === "string" ? filtro : "";
        fechaQ = mes ? { $regex: `^${mes}` } : {};
      }
      const operaciones = await Operacion.find({ fecha: fechaQ });
      let totalGastoFacturado = 0;
      let totalGastoFacturadoA = 0;
      operaciones.forEach((operacion) => {
        if (operacion.factura) {
          totalGastoFacturado += parseFloat(operacion.monto);
          if (operacion.factura === "A") {
            totalGastoFacturadoA += parseFloat(operacion.monto);
          }
        }
      });
      totalGastoFacturado = totalGastoFacturado * -1;
      let ivaCompra = (totalGastoFacturadoA - totalGastoFacturadoA / 1.21) * -1;
      socket.emit("response-gastos", totalGastoFacturado, ivaCompra);
    } catch (err) { console.error("Error request-gastos:", err); }
  });

  // ── Estadísticas avanzadas de ventas ──
  socket.on("request-estadisticas-ventas", async (filtro) => {
    try {
      const tz = "America/Argentina/Buenos_Aires";
      let matchStage = { notaCredito: { $ne: true } };
      let mes = "";
      if (typeof filtro === "object" && filtro?.desde && filtro?.hasta) {
        matchStage.fecha = { $gte: filtro.desde, $lte: filtro.hasta };
      } else {
        mes = typeof filtro === "string" ? filtro : (filtro || "");
        if (mes) matchStage.fecha = { $regex: `^${mes}` };
      }

      // 1. Ventas por hora del día
      const ventasPorHora = await Venta.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $hour: { date: "$createdAt", timezone: tz } },
            cantidad: { $sum: 1 },
            monto: { $sum: "$monto" },
          }
        },
        { $sort: { _id: 1 } },
      ]);

      // 2. Ventas por día de semana (1=dom, 7=sáb)
      const ventasPorDiaSemana = await Venta.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dayOfWeek: { date: "$createdAt", timezone: tz } },
            cantidad: { $sum: 1 },
            monto: { $sum: "$monto" },
          }
        },
        { $sort: { _id: 1 } },
      ]);

      // 3. Ventas por cepa (top 10)
      const ventasPorCepa = await Venta.aggregate([
        { $match: matchStage },
        { $unwind: "$productos" },
        {
          $group: {
            _id: "$productos.cepa",
            cantidad: { $sum: { $ifNull: ["$productos.carritoCantidad", 1] } },
            monto: {
              $sum: {
                $multiply: [
                  { $toDouble: { $ifNull: ["$productos.venta", "0"] } },
                  { $ifNull: ["$productos.carritoCantidad", 1] },
                ]
              }
            },
          }
        },
        { $match: { _id: { $nin: [null, ""] } } },
        { $sort: { cantidad: -1 } },
        { $limit: 10 },
      ]);

      // 4. Ventas por bodega (top 10)
      const ventasPorBodega = await Venta.aggregate([
        { $match: matchStage },
        { $unwind: "$productos" },
        {
          $group: {
            _id: "$productos.bodega",
            cantidad: { $sum: { $ifNull: ["$productos.carritoCantidad", 1] } },
            monto: {
              $sum: {
                $multiply: [
                  { $toDouble: { $ifNull: ["$productos.venta", "0"] } },
                  { $ifNull: ["$productos.carritoCantidad", 1] },
                ]
              }
            },
          }
        },
        { $match: { _id: { $nin: [null, ""] } } },
        { $sort: { monto: -1 } },
        { $limit: 10 },
      ]);

      // 5. Evolución diaria de ventas
      const ventasPorDia = await Venta.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$fecha",
            cantidad: { $sum: 1 },
            monto: { $sum: "$monto" },
          }
        },
        { $sort: { _id: 1 } },
      ]);

      // 6. Descuentos (total + separado vinos vs reservas)
      const descGroupFields = {
        _id: null,
        totalDescuento: { $sum: { $ifNull: ["$descuento", 0] } },
        cantidadConDescuento: { $sum: { $cond: [{ $gt: [{ $ifNull: ["$descuento", 0] }, 0] }, 1, 0] } },
        cantidadTotal: { $sum: 1 },
        montoTotal: { $sum: "$monto" },
      };
      const matchVinos = { ...matchStage, $or: [{ idTurno: { $exists: false } }, { idTurno: null }] };
      const matchReservas = { ...matchStage, idTurno: { $exists: true, $ne: null } };
      const [descuentos, descuentosVinos, descuentosReservas] = await Promise.all([
        Venta.aggregate([{ $match: matchStage }, { $group: descGroupFields }]),
        Venta.aggregate([{ $match: matchVinos }, { $group: descGroupFields }]),
        Venta.aggregate([{ $match: matchReservas }, { $group: descGroupFields }]),
      ]);

      // 7. Top 10 productos
      const topProductos = await Venta.aggregate([
        { $match: matchStage },
        { $unwind: "$productos" },
        {
          $group: {
            _id: { nombre: "$productos.nombre", codigo: "$productos.codigo", bodega: "$productos.bodega" },
            cantidad: { $sum: { $ifNull: ["$productos.carritoCantidad", 1] } },
            monto: {
              $sum: {
                $multiply: [
                  { $toDouble: { $ifNull: ["$productos.venta", "0"] } },
                  { $ifNull: ["$productos.carritoCantidad", 1] },
                ]
              }
            },
          }
        },
        { $sort: { cantidad: -1 } },
        { $limit: 10 },
      ]);

      // 8. Forma de pago
      const ventasPorFormaPago = await Venta.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$formaPago",
            cantidad: { $sum: 1 },
            monto: { $sum: "$monto" },
          }
        },
        { $sort: { monto: -1 } },
      ]);

      // 9. Eventos en esos días (para marcar en el gráfico)
      let eventosFilter = {};
      if (mes) eventosFilter.fecha = { $regex: `^${mes}` };
      const eventosDias = await Evento.find(eventosFilter, { fecha: 1 }).lean();
      const diasConEvento = new Set(eventosDias.map((e) => e.fecha));

      const DIAS_SEMANA = ["", "Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

      socket.emit("response-estadisticas-ventas", {
        ventasPorHora: ventasPorHora.map((h) => ({
          hora: `${h._id}:00`, cantidad: h.cantidad, monto: h.monto,
        })),
        ventasPorDiaSemana: ventasPorDiaSemana.map((d) => ({
          dia: DIAS_SEMANA[d._id] || d._id, cantidad: d.cantidad, monto: d.monto,
        })),
        ventasPorCepa: ventasPorCepa.map((c) => ({
          cepa: c._id || "Sin cepa", cantidad: c.cantidad, monto: Math.round(c.monto),
        })),
        ventasPorBodega: ventasPorBodega.map((b) => ({
          bodega: b._id || "Sin bodega", cantidad: b.cantidad, monto: Math.round(b.monto),
        })),
        ventasPorDia: ventasPorDia.map((d) => ({
          fecha: d._id, cantidad: d.cantidad, monto: d.monto,
          conEvento: diasConEvento.has(d._id),
        })),
        descuentos: descuentos[0] || { totalDescuento: 0, cantidadConDescuento: 0, cantidadTotal: 0, montoTotal: 0 },
        descuentosVinos: descuentosVinos[0] || { totalDescuento: 0, cantidadConDescuento: 0, cantidadTotal: 0, montoTotal: 0 },
        descuentosReservas: descuentosReservas[0] || { totalDescuento: 0, cantidadConDescuento: 0, cantidadTotal: 0, montoTotal: 0 },
        topProductos: topProductos.map((p) => ({
          nombre: p._id.nombre, codigo: p._id.codigo, bodega: p._id.bodega,
          cantidad: p.cantidad, monto: Math.round(p.monto),
        })),
        ventasPorFormaPago: ventasPorFormaPago.map((f) => ({
          formaPago: f._id || "Sin especificar", cantidad: f.cantidad, monto: f.monto,
        })),
      });
    } catch (err) {
      console.error("Error request-estadisticas-ventas:", err);
      socket.emit("response-estadisticas-ventas", null);
    }
  });

  socket.on("request-inicio", async (payload) => {
    try {
      // Accept serialized JSON credentials if a string arrives.
      if (typeof payload === "string") {
        if (payload.trim().startsWith("{")) {
          try {
            payload = JSON.parse(payload);
          } catch {
            socket.emit("response-inicio", {
              success: false,
              error: "Credenciales invalidas",
            });
            return;
          }
        } else {
          socket.emit("response-inicio", {
            success: false,
            error: "Credenciales invalidas",
          });
          return;
        }
      }

      const username = String(payload?.username || "").trim().toLowerCase();
      const password = String(payload?.password || "");
      if (!username || !password) {
        socket.emit("response-inicio", {
          success: false,
          error: "Completa usuario y contrasena",
        });
        return;
      }

      // 1) Fast local/dev fallback first.
      const fallback = FALLBACK_USERS.find(
        (u) => u.username === username && u.password === password
      );
      if (fallback) {
        const usr = {
          _id: `fallback-${fallback.username}`,
          nombre: fallback.nombre,
          username: fallback.username,
          rol: fallback.rol,
          permisos: fallback.rol === "admin" ? ["*"] : [],
        };
        socket.usuario = usr;
        socket.emit("response-inicio", { success: true, usuario: usr });
        return;
      }

      // 2) Then try DB user.
      let dbUser = null;
      try {
        dbUser = await Usuario.findOne({ username, activo: { $ne: false } }).lean();
      } catch (error) {
        console.error("Error consultando usuarios:", error.message);
      }

      if (dbUser) {
        const hash = String(dbUser.password || "");
        const matches =
          hash.startsWith("$2") ? await bcrypt.compare(password, hash) : hash === password;
        if (matches) {
          const usr = {
            _id: dbUser._id,
            nombre: dbUser.nombre,
            username: dbUser.username,
            rol: dbUser.rol,
            permisos: dbUser.rol === "admin" ? ["*"] : (dbUser.permisos || []),
            foto: dbUser.foto || "",
          };
          socket.usuario = usr;
          socket.emit("response-inicio", { success: true, usuario: usr });
          return;
        }
      }

      socket.emit("response-inicio", {
        success: false,
        error: "Usuario o contrasena incorrectos",
      });
    } catch (error) {
      console.error("Error en request-inicio:", error);
      socket.emit("response-inicio", {
        success: false,
        error: "Error interno de autenticacion",
      });
    }
  });
  socket.on("guardar-turno", async (turno) => {
    try {
      turno.fecha = turno.fecha.split("T")[0];
      if (!turno.total) turno.total = 0;
      if (turno._id) {
        await Turno.findByIdAndUpdate(turno._id, turno);
      } else {
        turno.cobrado = 0;
        await Turno.create(turno);
      }
      io.emit("cambios");
    } catch (err) { console.error("Error guardar-turno:", err); }
  });
  socket.on("request-turnos", async (todos, search, page) => {
    const pageSize = 50; // Definir tamaño de página
    const pageNumber = page || 1;
    let filter = {};
    // Si hay un término de búsqueda, creamos un regex para aplicarlo a los campos

    if (search) {
      const searchRegex = { $regex: search, $options: "i" }; // 'i' para ignorar mayúsculas/minúsculas
      filter.$or = [{ nombre: searchRegex }, { fecha: searchRegex }];
    }

    // Filtrar por turnos a partir de hoy (solo considerando la fecha sin la hora)
    if (!todos) {
      const today = moment().startOf("day").format("YYYY-MM-DD"); // Obtener la fecha de hoy sin la parte de la hora
      filter.fecha = { $gte: today }; // Filtrar turnos a partir de hoy, ignorando la hora
    }

    try {
      // Realizar la búsqueda con paginación
      const turnos = await Turno.find(filter)
        .sort({ createdAt: -1 }) // Ordenar por fecha de creación
        .skip((pageNumber - 1) * pageSize) // Paginación
        .limit(pageSize); // Limitar el número de resultados por página

      // Contar el número total de documentos que coinciden con el filtro
      const totalTurnos = await Turno.countDocuments(filter);
      let totalPages = Math.ceil(totalTurnos / pageSize);
      if (totalPages === 0) {
        totalPages = 1;
      }

      // Emitir los resultados al cliente
      socket.emit("response-turnos", {
        turnos,
        totalTurnos,
        totalPages,
      });
    } catch (error) {
      socket.emit("error", { message: "Error retrieving turnos", error });
    }
  });
  socket.on("request-fechas-turnos", async (turno) => {
    try {
      const turnosOcupados = await Turno.find({ turno }).lean();
      const turnosPorFecha = {};
      turnosOcupados.forEach((t) => {
        turnosPorFecha[t.fecha] = (turnosPorFecha[t.fecha] || 0) + t.cantidad;
      });
      const result = Object.entries(turnosPorFecha).map(([fecha, cantidad]) => ({ fecha, cantidad }));
      socket.emit("response-fechas-turnos", result);
    } catch (err) { console.error("Error request-fechas-turnos:", err); }
  });
  socket.on("request-cantidad", () => {
    try {
      const cantidades = JSON.parse(
        fs.readFileSync(path.join(__dirname, "cantidad_colores.json"), { encoding: "utf-8" })
      );
      socket.emit("response-cantidad", cantidades);
    } catch (err) { console.error("Error request-cantidad:", err); }
  });
  socket.on("borrar-turno", async (id) => {
    try {
      if (!requireAuth(socket)) return;
      await Turno.findByIdAndDelete(id);
      io.emit("cambios");
    } catch (err) { console.error("Error borrar-turno:", err); }
  });
  socket.on("cobrar-turno", async (id, turnoData) => {
    try {
      let turno = await Turno.findById(id);
      if (!turno) return;
      turno.cobrado = (turno.cobrado || 0) + parseFloat(turnoData.cobrado);
      turno.facturado = turnoData.facturado;
      turno.formaDeCobro = turnoData.formaDeCobro;
      if (turnoData.facturado) {
        let data_factura = "";
        data_factura = await afipService.facturaB(turnoData.cobrado, 0);
        let data = {};
        data.factura = "B";
        data.numeroComprobante = data_factura.numeroComprobante;
        data.puntoDeVenta = afipService.ptoVta;
        data.cuit_afip = afipService.CUIT;
        data.precio = turnoData.cobrado;
        data.CAE = data_factura.CAE;
        data.vtoCAE = data_factura.vtoCAE;
        data.tipoDoc = data_factura.docTipo;
        data.productosCarrito = [
          { nombre: "RESERVA", carritoCantidad: 1, venta: turnoData.cobrado },
        ];
        data.descuento = 0;
        const [ticketTurno, a4Turno] = await Promise.all([
          imprimirTicket(data),
          generarFacturaA4(data),
        ]);
        socket.emit("ticket-listo", { base64: ticketTurno.base64 });
        const venta = {
          productos: data.productosCarrito,
          tipoFactura: data.factura,
          stringNumeroFactura:
            `FB-0000${data.puntoDeVenta.toString()}-` +
            data.numeroComprobante.toString().padStart(8, "0"),
          numeroFactura: data.numeroComprobante,
          monto: turnoData.cobrado,
          formaPago: turnoData.formaDeCobro,
          fecha: moment(new Date())
            .tz("America/Argentina/Buenos_Aires")
            .format("YYYY-MM-DD"),
          idTurno: turno._id,
          nombreTurno: turno.nombre,
          reservaFecha: turno.fecha,
          reservaTurno: turno.turno,
          descuento: 0,
          facturaPdf: a4Turno.base64,
        };
        const ventaTurno1 = await Venta.create(venta);
        autoLinkMpPayment(ventaTurno1);
      } else {
        const ventaTurno2 = await Venta.create({
          idTurno: turno._id,
          nombreTurno: turno.nombre,
          reservaFecha: turno.fecha,
          reservaTurno: turno.turno,
          formaPago: turnoData.formaDeCobro,
          tipoFactura: "",
          monto: turnoData.cobrado,
          fecha: moment(new Date())
            .tz("America/Argentina/Buenos_Aires")
            .format("YYYY-MM-DD"),
          descuento: 0,
          productos: [
            {
              nombre: "RESERVA",
              carritoCantidad: 1,
              venta: turnoData.cobrado,
            },
          ],
        });
        autoLinkMpPayment(ventaTurno2);
      }
      await turno.save();
      io.emit("cambios");
    } catch (err) { console.error("Error cobrar-turno:", err); }
  });
  socket.on("cambiar-cantidad-color", (color, cantidad) => {
    try {
      let cantidades = JSON.parse(
        fs.readFileSync(path.join(__dirname, "cantidad_colores.json"), { encoding: "utf-8" })
      );
      cantidades[color] = parseFloat(cantidad);
      fs.writeFileSync(
        path.join(__dirname, "cantidad_colores.json"),
        JSON.stringify(cantidades)
      );
      io.emit("cambios");
    } catch (err) { console.error("Error cambiar-cantidad-color:", err); }
  });
  socket.on("add-carrito", async (codigo) => {
    try {
      await Product.updateOne({ codigo }, { carrito: true, carritoCantidad: 1 });
      const productosCarrito = await Product.find({ carrito: true }).select("-foto -fotoIA -descripcionGenerada").lean();
      socket.emit("productos-carrito", productosCarrito);
    } catch (err) { console.error("Error add-carrito:", err); }
  });
  socket.on("total-cantidad-productos", async () => {
    try {
      // Usamos agregación para sumar el campo "cantidad" de todos los productos
      const totalCantidad = await Product.aggregate([
        {
          $group: {
            _id: null, // No necesitamos agrupar por un campo específico
            total: { $sum: "$cantidad" }, // Sumamos el campo "cantidad"
          },
        },
      ]);
      // Si totalCantidad no está vacío, enviamos el resultado
      const total = totalCantidad.length > 0 ? totalCantidad[0].total : 0;
      socket.emit("res-total-cantidad-productos", total);
    } catch (error) {
      console.error("Error al obtener la cantidad total:", error);
      socket.emit(
        "error-total-cantidad-productos",
        "Hubo un error al calcular la cantidad total"
      );
    }
  });
  socket.on("borrar-file-operacion", async (id) => {
    try {
      await Operacion.findByIdAndUpdate(id, { filePath: null });
      io.emit("cambios");
    } catch (err) { console.error("Error borrar-file-operacion:", err); }
  });

  // ── MercadoPago ──
  socket.on("request-mp-pagos", async ({ fecha, page, search }) => {
    if (!mpPayment) {
      socket.emit("response-mp-pagos", {
        error: "MP_ACCESS_TOKEN no configurado",
        pagos: [], totalPages: 1,
        kpis: { aprobado: 0, pendiente: 0, cantidad: 0, ticketPromedio: 0 },
      });
      return;
    }
    try {
      // Sync con MP API (solo si es necesario)
      if (fecha) {
        await syncMpPagos(fecha);
      } else {
        // Sin fecha: sync hoy por defecto
        const hoy = moment().tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");
        await syncMpPagos(hoy);
      }

      // Query desde DB
      const pageSize = 20;
      const skip = ((page || 1) - 1) * pageSize;
      let filter = {};
      if (fecha) filter.fecha = fecha;
      if (search) {
        const searchRegex = { $regex: search, $options: "i" };
        filter.$or = [{ descripcion: searchRegex }, { referenciaExterna: searchRegex }, { "pagador.nombre": searchRegex }, { "pagador.email": searchRegex }];
      }

      const [docs, total] = await Promise.all([
        PagoMp.find(filter).sort({ fechaCreacion: -1 }).skip(skip).limit(pageSize).lean(),
        PagoMp.countDocuments(filter),
      ]);

      // KPIs desde DB
      const kpiDocs = await PagoMp.find(filter).lean();
      let kpis = { aprobado: 0, gastos: 0, pendiente: 0, cantidad: kpiDocs.length, ticketPromedio: 0, comisiones: 0, neto: 0, impuestos: 0 };
      kpiDocs.forEach((d) => {
        if (d.estado === "approved") {
          if (d.tipoMovimiento === "gasto") {
            kpis.gastos += d.monto || 0;
          } else {
            kpis.aprobado += d.monto || 0;
            kpis.neto += d.netoRecibido || 0;
            kpis.comisiones += d.comisionMp || 0;
            kpis.impuestos += d.retenciones || 0;
          }
        }
        if (d.estado === "pending" || d.estado === "in_process")
          kpis.pendiente += d.monto || 0;
      });
      kpis.ticketPromedio = kpis.cantidad > 0 ? (kpis.aprobado + kpis.pendiente) / kpis.cantidad : 0;

      const pagos = docs.map(docToPagoResponse);

      // Enriquecer con venta vinculada (cobros) y operacion vinculada (gastos)
      const mpIds = pagos.map((p) => p.id);
      const [linkedVentas, linkedOps] = await Promise.all([
        Venta.find({ mpPaymentIds: { $in: mpIds } })
          .select("_id mpPaymentIds monto formaPago fecha stringNumeroFactura tipoFactura createdAt").lean(),
        Operacion.find({ mpPagoId: { $in: mpIds } })
          .select("_id mpPagoId nombre monto fecha tipoOperacion").lean(),
      ]);
      const ventaByMpId = new Map();
      linkedVentas.forEach((v) => {
        (v.mpPaymentIds || []).forEach((mpId) => ventaByMpId.set(mpId, v));
      });
      const opByMpId = new Map();
      linkedOps.forEach((o) => opByMpId.set(o.mpPagoId, o));

      socket.emit("response-mp-pagos", {
        pagos: pagos.map((p) => ({
          ...p,
          ventaVinculada: ventaByMpId.get(p.id) || null,
          operacionVinculada: opByMpId.get(p.id) || null,
        })),
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        kpis,
      });
    } catch (error) {
      console.error("Error MercadoPago:", error);
      socket.emit("response-mp-pagos", {
        error: error.message,
        pagos: [], totalPages: 1,
        kpis: { aprobado: 0, pendiente: 0, cantidad: 0, ticketPromedio: 0 },
      });
    }
  });

  socket.on("request-mp-sin-vincular", async ({ fecha, monto }) => {
    try {
      // Sync día si hay fecha
      if (fecha) await syncMpPagos(fecha);

      const mapDoc = (d) => ({
        id: d.mpId, fecha: d.fechaCreacion, descripcion: d.descripcion,
        monto: d.monto || 0, medioPago: d.medioPago,
        pagador: d.pagador?.nombre || d.pagador?.email || null,
      });

      // Pagos aprobados del día + otros desde DB
      let dayDocs = [], otrosDocs = [];
      if (fecha) {
        [dayDocs, otrosDocs] = await Promise.all([
          PagoMp.find({ fecha, estado: "approved" }).sort({ fechaCreacion: -1 }).limit(100).lean(),
          PagoMp.find({ fecha: { $ne: fecha }, estado: "approved" }).sort({ fechaCreacion: -1 }).limit(100).lean(),
        ]);
      } else {
        dayDocs = await PagoMp.find({ estado: "approved" }).sort({ fechaCreacion: -1 }).limit(100).lean();
      }

      // Filtrar ya vinculados
      const allIds = [...dayDocs, ...otrosDocs].map((d) => d.mpId);
      const linkedVentas = await Venta.find({ mpPaymentIds: { $in: allIds } }).select("mpPaymentIds").lean();
      const linkedIds = new Set(linkedVentas.flatMap((v) => v.mpPaymentIds));

      const pagos = dayDocs.filter((d) => !linkedIds.has(d.mpId)).map(mapDoc);
      const pagosOtros = otrosDocs.filter((d) => !linkedIds.has(d.mpId)).map(mapDoc);

      socket.emit("response-mp-sin-vincular", { pagos, pagosOtros });
    } catch (err) {
      console.error("Error request-mp-sin-vincular:", err);
      socket.emit("response-mp-sin-vincular", { pagos: [], pagosOtros: [] });
    }
  });

  socket.on("request-mp-pago-detalle", async ({ id }) => {
    try {
      // Buscar en DB primero
      let doc = await PagoMp.findOne({ mpId: id }).lean();
      if (doc) {
        socket.emit("response-mp-pago-detalle", docToPagoResponse(doc));
        return;
      }
      // Fallback: buscar en API de MP y guardar
      if (!mpPayment) {
        socket.emit("response-mp-pago-detalle", { error: "Pago no encontrado" });
        return;
      }
      const pago = await mpPayment.get({ id });
      if (pago) {
        const ownId = await getOwnMpCollectorId();
        await PagoMp.updateOne({ mpId: pago.id }, { $set: mpRawToDoc(pago, ownId) }, { upsert: true });
        doc = await PagoMp.findOne({ mpId: id }).lean();
        socket.emit("response-mp-pago-detalle", docToPagoResponse(doc));
      }
    } catch (error) {
      console.error("Error MercadoPago detalle:", error);
      socket.emit("response-mp-pago-detalle", { error: error.message });
    }
  });

  // ── Sync manual MP (forzar re-fetch de un día) ──
  socket.on("sync-mp-manual", async ({ fecha }, callback) => {
    if (!mpPayment) {
      if (typeof callback === "function") callback({ error: "MP no configurado" });
      return;
    }
    try {
      // Forzar sync: borrar datos del día y re-fetch
      if (fecha) await PagoMp.deleteMany({ fecha });
      await syncMpPagos(fecha || moment().tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD"));
      if (typeof callback === "function") callback({ ok: true });
    } catch (err) {
      console.error("Error sync-mp-manual:", err);
      if (typeof callback === "function") callback({ error: err.message });
    }
  });

  // ── Comisiones MP acumuladas (desde último cierre) ──
  socket.on("request-mp-comisiones-acumuladas", async () => {
    try {
      const docs = await PagoMp.find({
        estado: "approved",
        tipoMovimiento: "cobro",
        $or: [{ cierreComisionesAt: null }, { cierreComisionesAt: { $exists: false } }],
      }).lean();

      let comisiones = 0, retenciones = 0, desde = null, hasta = null;
      docs.forEach((d) => {
        comisiones += d.comisionMp || 0;
        retenciones += d.retenciones || 0;
        if (d.fecha) {
          if (!desde || d.fecha < desde) desde = d.fecha;
          if (!hasta || d.fecha > hasta) hasta = d.fecha;
        }
      });

      socket.emit("response-mp-comisiones-acumuladas", {
        comisiones: +comisiones.toFixed(2),
        retenciones: +retenciones.toFixed(2),
        desde,
        hasta,
        cantidadPagos: docs.length,
      });
    } catch (err) {
      console.error("Error request-mp-comisiones-acumuladas:", err);
      socket.emit("response-mp-comisiones-acumuladas", {
        comisiones: 0, retenciones: 0, desde: null, hasta: null, cantidadPagos: 0,
      });
    }
  });

  socket.on("cerrar-comisiones-mp", async (_, callback) => {
    try {
      const docs = await PagoMp.find({
        estado: "approved",
        tipoMovimiento: "cobro",
        $or: [{ cierreComisionesAt: null }, { cierreComisionesAt: { $exists: false } }],
      }).lean();

      if (docs.length === 0) {
        if (typeof callback === "function") callback({ error: "No hay comisiones pendientes de cerrar" });
        return;
      }

      let comisiones = 0, retenciones = 0, desde = null, hasta = null;
      docs.forEach((d) => {
        comisiones += d.comisionMp || 0;
        retenciones += d.retenciones || 0;
        if (d.fecha) {
          if (!desde || d.fecha < desde) desde = d.fecha;
          if (!hasta || d.fecha > hasta) hasta = d.fecha;
        }
      });
      comisiones = +comisiones.toFixed(2);
      retenciones = +retenciones.toFixed(2);

      const hoy = moment().tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");
      const desdeStr = desde ? moment(desde).format("DD/MM") : "?";
      const hastaStr = hasta ? moment(hasta).format("DD/MM") : "?";
      const periodo = `Período ${desdeStr} al ${hastaStr} (${docs.length} pagos)`;

      const ops = [];
      if (comisiones > 0) {
        ops.push(Operacion.create({
          nombre: "Comisiones MercadoPago",
          descripcion: periodo,
          monto: -comisiones,
          tipoOperacion: "GASTO",
          formaPago: "DIGITAL",
          fecha: hoy,
        }));
      }
      if (retenciones > 0) {
        ops.push(Operacion.create({
          nombre: "Retenciones MercadoPago",
          descripcion: periodo,
          monto: -retenciones,
          tipoOperacion: "GASTO",
          formaPago: "DIGITAL",
          fecha: hoy,
        }));
      }
      await Promise.all(ops);

      // Marcar pagos como cerrados
      const ids = docs.map((d) => d._id);
      await PagoMp.updateMany({ _id: { $in: ids } }, { $set: { cierreComisionesAt: new Date() } });

      io.emit("cambios");
      if (typeof callback === "function") callback({ ok: true, comisiones, retenciones, periodo, operaciones: ops.length });
    } catch (err) {
      console.error("Error cerrar-comisiones-mp:", err);
      if (typeof callback === "function") callback({ error: err.message });
    }
  });

  // ── Vincular/desvincular MP ──
  socket.on("vincular-mp-pago", async ({ ventaId, mpPaymentId }, callback) => {
    try {
      // Verificar que este pago no esté ya vinculado a otra venta
      const existing = await Venta.findOne({ mpPaymentIds: mpPaymentId, _id: { $ne: ventaId } });
      if (existing) {
        if (typeof callback === "function") callback({ error: "Este pago MP ya esta vinculado a otra venta" });
        return;
      }
      const venta = await Venta.findByIdAndUpdate(
        ventaId,
        { $addToSet: { mpPaymentIds: mpPaymentId }, $set: { mpLinkedAt: new Date() } },
        { new: true }
      );
      if (!venta) {
        if (typeof callback === "function") callback({ error: "Venta no encontrada" });
        return;
      }
      if (typeof callback === "function") callback({ ok: true });
      io.emit("cambios");
    } catch (err) {
      console.error("Error vincular-mp-pago:", err);
      if (typeof callback === "function") callback({ error: err.message });
    }
  });

  socket.on("desvincular-mp-pago", async ({ ventaId, mpPaymentId }, callback) => {
    try {
      if (mpPaymentId) {
        // Quitar un pago específico del array
        const venta = await Venta.findByIdAndUpdate(
          ventaId,
          { $pull: { mpPaymentIds: mpPaymentId } },
          { new: true }
        );
        // Si quedó vacío, limpiar mpLinkedAt
        if (venta && (!venta.mpPaymentIds || venta.mpPaymentIds.length === 0)) {
          venta.mpLinkedAt = null;
          await venta.save();
        }
      } else {
        // Desvincular todos
        await Venta.findByIdAndUpdate(ventaId, { mpPaymentIds: [], mpLinkedAt: null });
      }
      if (typeof callback === "function") callback({ ok: true });
      io.emit("cambios");
    } catch (err) {
      console.error("Error desvincular-mp-pago:", err);
      if (typeof callback === "function") callback({ error: err.message });
    }
  });

  socket.on("request-ventas-sin-mp", async ({ fecha }) => {
    try {
      const baseQuery = {
        $or: [{ mpPaymentIds: { $size: 0 } }, { mpPaymentIds: { $exists: false } }],
        formaPago: { $in: ["DIGITAL", "MIXTO"] },
      };
      const fields = "_id monto montoDigital formaPago fecha tipoFactura stringNumeroFactura createdAt nombreTurno";
      let ventas = [], ventasCercanas = [], ventasResto = [];
      if (fecha) {
        const d = new Date(fecha + "T12:00:00");
        const prev = new Date(d); prev.setDate(d.getDate() - 1);
        const next = new Date(d); next.setDate(d.getDate() + 1);
        const pad = (n) => String(n).padStart(2, "0");
        const toLocal = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
        const fechaAnt = toLocal(prev);
        const fechaSig = toLocal(next);
        [ventas, ventasCercanas, ventasResto] = await Promise.all([
          Venta.find({ ...baseQuery, fecha }).sort({ createdAt: -1 }).limit(50).select(fields).lean(),
          Venta.find({ ...baseQuery, fecha: { $in: [fechaAnt, fechaSig] } }).sort({ createdAt: -1 }).limit(30).select(fields).lean(),
          Venta.find({ ...baseQuery, fecha: { $nin: [fecha, fechaAnt, fechaSig] } }).sort({ createdAt: -1 }).limit(20).select(fields).lean(),
        ]);
      } else {
        ventas = await Venta.find(baseQuery).sort({ createdAt: -1 }).limit(50).select(fields).lean();
      }
      socket.emit("response-ventas-sin-mp", { ventas, ventasCercanas, ventasResto });
    } catch (err) {
      console.error("Error request-ventas-sin-mp:", err);
      socket.emit("response-ventas-sin-mp", { ventas: [], ventasCercanas: [], ventasResto: [] });
    }
  });

  // ── Vincular pago MP a operación (gasto) ──
  socket.on("vincular-mp-gasto", async ({ operacionId, mpPagoId }, callback) => {
    try {
      const existing = await Operacion.findOne({ mpPagoId, _id: { $ne: operacionId } });
      if (existing) {
        if (typeof callback === "function") callback({ error: "Este pago MP ya esta vinculado a otra operacion" });
        return;
      }
      const op = await Operacion.findByIdAndUpdate(operacionId, { mpPagoId }, { new: true });
      if (!op) {
        if (typeof callback === "function") callback({ error: "Operacion no encontrada" });
        return;
      }
      if (typeof callback === "function") callback({ ok: true });
      io.emit("cambios");
    } catch (err) {
      console.error("Error vincular-mp-gasto:", err);
      if (typeof callback === "function") callback({ error: err.message });
    }
  });

  socket.on("desvincular-mp-gasto", async ({ operacionId }, callback) => {
    try {
      await Operacion.findByIdAndUpdate(operacionId, { mpPagoId: null });
      if (typeof callback === "function") callback({ ok: true });
      io.emit("cambios");
    } catch (err) {
      console.error("Error desvincular-mp-gasto:", err);
      if (typeof callback === "function") callback({ error: err.message });
    }
  });

  // ── Toggle cobro/gasto de un pago MP ──
  socket.on("toggle-tipo-mp", async ({ mpPagoId }, callback) => {
    try {
      if (!requireAuth(socket)) return;
      const doc = await PagoMp.findOne({ mpId: mpPagoId });
      if (!doc) {
        if (typeof callback === "function") callback({ error: "Pago no encontrado" });
        return;
      }
      const nuevoTipo = doc.tipoMovimiento === "cobro" ? "gasto" : "cobro";
      doc.tipoMovimiento = nuevoTipo;
      doc.tipoManual = true;
      if (nuevoTipo === "gasto") {
        doc.comisionMp = 0;
        doc.retenciones = 0;
      } else {
        // Recalcular comisiones desde feeDetails guardados
        const comis = (doc.feeDetails || []).reduce((s, f) => s + (f.monto || 0), 0);
        doc.comisionMp = comis;
        const neto = doc.netoRecibido;
        const bruto = doc.monto;
        doc.retenciones = neto != null ? Math.max(0, +(bruto - comis - neto).toFixed(2)) : 0;
      }
      // Rechazados/cancelados nunca tienen comisiones ni retenciones
      if (["rejected", "cancelled", "refunded", "charged_back"].includes(doc.estado)) {
        doc.comisionMp = 0;
        doc.retenciones = 0;
      }
      await doc.save();
      if (typeof callback === "function") callback({ ok: true, tipoMovimiento: nuevoTipo });
      io.emit("cambios-mp");
    } catch (err) {
      console.error("Error toggle-tipo-mp:", err);
      if (typeof callback === "function") callback({ error: err.message });
    }
  });

  // ── Buscar operaciones (gastos) sin vincular a MP ──
  socket.on("request-gastos-sin-mp", async ({ fecha }) => {
    try {
      const baseQuery = {
        $or: [{ mpPagoId: null }, { mpPagoId: { $exists: false } }],
        tipoOperacion: { $in: ["GASTO", "RETIRO"] },
        formaPago: "DIGITAL",
      };
      const fields = "_id nombre descripcion monto fecha beneficiario createdAt";
      let gastos = [], gastosCercanos = [], gastosResto = [];
      if (fecha) {
        const d = new Date(fecha + "T12:00:00");
        const prev = new Date(d); prev.setDate(d.getDate() - 1);
        const next = new Date(d); next.setDate(d.getDate() + 1);
        const pad = (n) => String(n).padStart(2, "0");
        const toLocal = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
        const fechaAnt = toLocal(prev);
        const fechaSig = toLocal(next);
        [gastos, gastosCercanos, gastosResto] = await Promise.all([
          Operacion.find({ ...baseQuery, fecha }).sort({ createdAt: -1 }).limit(50).select(fields).lean(),
          Operacion.find({ ...baseQuery, fecha: { $in: [fechaAnt, fechaSig] } }).sort({ createdAt: -1 }).limit(30).select(fields).lean(),
          Operacion.find({ ...baseQuery, fecha: { $nin: [fecha, fechaAnt, fechaSig] } }).sort({ createdAt: -1 }).limit(20).select(fields).lean(),
        ]);
      } else {
        gastos = await Operacion.find(baseQuery).sort({ createdAt: -1 }).limit(50).select(fields).lean();
      }
      socket.emit("response-gastos-sin-mp", { gastos, gastosCercanos, gastosResto });
    } catch (err) {
      console.error("Error request-gastos-sin-mp:", err);
      socket.emit("response-gastos-sin-mp", { gastos: [], gastosCercanos: [], gastosResto: [] });
    }
  });

  // ── Concretar gasto estimado de evento → crear operación en Caja ──
  socket.on("concretar-gasto-evento", async ({ eventoId, gastoIndex, soloMarcar, operacionId }) => {
    try {
      const evento = await Evento.findById(eventoId);
      if (!evento || !evento.gastosEstimados[gastoIndex]) return;
      const gasto = evento.gastosEstimados[gastoIndex];
      if (gasto.realizado) return;
      if (!soloMarcar) {
        // Modo legacy: crea la operacion directamente
        const op = await Operacion.create({
          nombre: evento.nombre,
          descripcion: gasto.descripcion,
          monto: gasto.monto,
          tipoOperacion: "GASTO",
          eventoId: evento._id,
          fecha: moment(new Date()).tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD"),
        });
        evento.gastosEstimados[gastoIndex].operacionId = op._id;
      } else if (operacionId) {
        evento.gastosEstimados[gastoIndex].operacionId = operacionId;
      }
      evento.gastosEstimados[gastoIndex].realizado = true;
      await evento.save();
      io.emit("cambios");
    } catch (err) {
      console.error("Error concretar-gasto-evento:", err);
    }
  });

  // ── Buscar gastos existentes en caja para vincular a gasto estimado de evento ──
  socket.on("buscar-gastos-para-vincular", async ({ search }, callback) => {
    try {
      const query = { tipoOperacion: "GASTO" };
      if (search) {
        const regex = new RegExp(search, "i");
        query.$or = [{ descripcion: regex }, { nombre: regex }, { beneficiario: regex }];
      }
      const gastos = await Operacion.find(query)
        .sort({ createdAt: -1 })
        .limit(30)
        .select("_id nombre descripcion monto fecha beneficiario createdAt")
        .lean();
      if (typeof callback === "function") callback({ gastos });
    } catch (err) {
      console.error("Error buscar-gastos-para-vincular:", err);
      if (typeof callback === "function") callback({ error: err.message, gastos: [] });
    }
  });

  // ── Vincular gasto estimado de evento a una operacion existente ──
  socket.on("vincular-gasto-evento", async ({ eventoId, gastoIndex, operacionId }, callback) => {
    try {
      const evento = await Evento.findById(eventoId);
      if (!evento || !evento.gastosEstimados[gastoIndex]) {
        if (typeof callback === "function") callback({ error: "Gasto no encontrado" });
        return;
      }
      const op = await Operacion.findById(operacionId);
      if (!op) {
        if (typeof callback === "function") callback({ error: "Operación no encontrada" });
        return;
      }
      evento.gastosEstimados[gastoIndex].realizado = true;
      evento.gastosEstimados[gastoIndex].operacionId = op._id;
      op.eventoId = eventoId;
      await Promise.all([evento.save(), op.save()]);
      io.emit("cambios");
      if (typeof callback === "function") callback({ ok: true });
    } catch (err) {
      console.error("Error vincular-gasto-evento:", err);
      if (typeof callback === "function") callback({ error: err.message });
    }
  });

  socket.on("guardar-info-pago-gasto", async ({ eventoId, gastoIndex, infoPago }) => {
    try {
      const evento = await Evento.findById(eventoId);
      if (!evento || !evento.gastosEstimados[gastoIndex]) return;
      evento.gastosEstimados[gastoIndex].infoPago = infoPago || "";
      await evento.save();
      io.emit("cambios");
    } catch (err) {
      console.error("Error guardar-info-pago-gasto:", err);
    }
  });

  socket.on("notificar-pago-gasto", async ({ eventoId, gastoIndex }) => {
    try {
      const evento = await Evento.findById(eventoId);
      if (!evento || !evento.gastosEstimados[gastoIndex]) return;
      const gasto = evento.gastosEstimados[gastoIndex];
      await crearNotificacion({
        tipo: "pago_pendiente",
        mensaje: `Pagar ${gasto.descripcion} (${evento.nombre}) — $${gasto.monto}${gasto.infoPago ? ` — ${gasto.infoPago}` : ""}`,
        destinatarioRol: "admin",
        referenciaId: evento._id,
      });
    } catch (err) {
      console.error("Error notificar-pago-gasto:", err);
    }
  });

  socket.on("request-flujos", async (ordenadoFechaPago, todos) => {
    try {
      let filter = {};

      // Si todos es falso, filtramos los flujos a partir de hoy
      if (!todos) {
        const today = moment().startOf("day").format("YYYY-MM-DD"); // Obtener la fecha de hoy sin la parte de la hora
        filter.fechaPago = { $gte: today }; // Filtrar flujos a partir de hoy, ignorando la hora
      }

      let sortCriteria;

      // Si ordenadoFechaPago es true, ordenamos por fechaPago de menor a mayor
      if (ordenadoFechaPago) {
        sortCriteria = { fechaPago: 1 }; // Orden ascendente por fechaPago
      } else {
        // Si es false, ordenamos por createdAt de forma descendente
        sortCriteria = { createdAt: -1 }; // Orden descendente por createdAt
      }

      const flujos = await Flujo.find(filter)
        .sort(sortCriteria) // Usamos el criterio de ordenación dinámico
        .exec();

      // Emitimos la respuesta con los flujos ordenados
      socket.emit("response-flujos", flujos);
    } catch (error) {
      console.error("Error al obtener flujos:", error);
      socket.emit("response-flujos", []); // Enviar un array vacío en caso de error
    }
  });
  socket.on("enviar-a-caja", async (id) => {
    try {
      const flujo = await Flujo.findByIdAndUpdate(id, { enviado: true }, { new: true });
      if (!flujo) return;
      const operacion = {
        fecha: moment(new Date()).tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD"),
        beneficiario: flujo.beneficiario,
        nombre: flujo.nombre,
        filePath: flujo.filePath,
        descripcion: flujo.descripcion,
        monto: parseFloat(flujo.importe),
        tipoOperacion: "GASTO",
        formaPago: "DIGITAL",
      };
      await Operacion.create(operacion);
      io.emit("cambios");
    } catch (err) { console.error("Error enviar-a-caja:", err); }
  });

  // ═══════════════════════════════
  // Degustaciones
  // ═══════════════════════════════
  socket.on("guardar-degustacion", async (degustacion) => {
    try {
      if (degustacion.fecha && degustacion.fecha.includes("T")) {
        degustacion.fecha = degustacion.fecha.split("T")[0];
      }

      const nuevosVinos = degustacion.vinosUsados || [];

      if (degustacion._id) {
        // Edicion: comparar vinos anteriores vs nuevos para ajustar stock
        const anterior = await Degustacion.findById(degustacion._id);
        const anteriorIds = (anterior?.vinosUsados || []).map((v) => v.productoId?.toString());
        const nuevosIds = nuevosVinos.map((v) => v.productoId?.toString());

        // Vinos que se quitaron -> reponer stock (+1 c/u)
        for (const v of anterior?.vinosUsados || []) {
          if (!nuevosIds.includes(v.productoId?.toString())) {
            await Product.findByIdAndUpdate(v.productoId, { $inc: { cantidad: 1 } });
          }
        }
        // Vinos que se agregaron -> descontar stock (-1 c/u)
        for (const v of nuevosVinos) {
          if (!anteriorIds.includes(v.productoId?.toString())) {
            await Product.findByIdAndUpdate(v.productoId, { $inc: { cantidad: -1 } });
          }
        }

        await Degustacion.findByIdAndUpdate(degustacion._id, degustacion);
      } else {
        // Nuevo: descontar stock de todos los vinos (-1 c/u)
        for (const v of nuevosVinos) {
          if (v.productoId) {
            await Product.findByIdAndUpdate(v.productoId, { $inc: { cantidad: -1 } });
          }
        }
        await Degustacion.create(degustacion);
      }
      io.emit("cambios");
    } catch (err) {
      console.error("Error guardar-degustacion:", err);
    }
  });

  socket.on("request-degustaciones", async (search, page) => {
    try {
      const pageSize = 50;
      const pageNumber = page || 1;
      let filter = {};

      if (search) {
        const searchRegex = { $regex: search, $options: "i" };
        filter.$or = [
          { nombre: searchRegex },
          { fecha: searchRegex },
          { descripcion: searchRegex },
        ];
      }

      const degustaciones = await Degustacion.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean();

      // Batch: 2 queries en vez de 2*N
      const degIds = degustaciones.map(d => d._id);
      const fechas = [...new Set(degustaciones.filter(d => d.fecha).map(d => d.fecha))];
      const [allTurnos, allOps] = await Promise.all([
        fechas.length ? Turno.find({ fecha: { $in: fechas } }).lean() : [],
        Operacion.find({ degustacionId: { $in: degIds } }).lean(),
      ]);
      const turnosByFecha = {};
      for (const t of allTurnos) { (turnosByFecha[t.fecha] ||= []).push(t); }
      const opsByDeg = {};
      for (const o of allOps) { const k = o.degustacionId.toString(); (opsByDeg[k] ||= []).push(o); }

      for (const deg of degustaciones) {
        const turnos = deg.fecha ? (turnosByFecha[deg.fecha] || []) : [];
        deg.reservas = turnos.map((t) => ({
          _id: t._id, nombre: t.nombre, cantidad: t.cantidad,
          total: t.total || 0, cobrado: t.cobrado || 0,
          turno: t.turno, formaDeCobro: t.formaDeCobro,
        }));
        deg.ingresoReservas = turnos.reduce((sum, t) => sum + (t.cobrado || 0), 0);

        const ops = opsByDeg[deg._id.toString()] || [];
        deg.operacionesVinculadas = ops.map((o) => ({
          _id: o._id, nombre: o.nombre, descripcion: o.descripcion,
          monto: o.monto, tipoOperacion: o.tipoOperacion,
          formaPago: o.formaPago, fecha: o.fecha,
        }));
        deg.totalGastosCaja = ops.filter((o) => o.tipoOperacion === "GASTO").reduce((sum, o) => sum + Math.abs(o.monto || 0), 0);
        deg.totalIngresosCaja = ops.filter((o) => o.tipoOperacion === "INGRESO").reduce((sum, o) => sum + (o.monto || 0), 0);
      }

      const totalDegustaciones = await Degustacion.countDocuments(filter);
      let totalPages = Math.ceil(totalDegustaciones / pageSize);
      if (totalPages === 0) totalPages = 1;

      socket.emit("response-degustaciones", {
        degustaciones,
        totalDegustaciones,
        totalPages,
      });
    } catch (err) {
      console.error("Error request-degustaciones:", err);
    }
  });

  // Lista simple de degustaciones para el selector en Caja
  socket.on("request-degustaciones-simple", async () => {
    try {
      const degs = await Degustacion.find({}, { nombre: 1, fecha: 1 })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      socket.emit("response-degustaciones-simple", degs);
    } catch (err) {
      console.error("Error request-degustaciones-simple:", err);
    }
  });

  socket.on("borrar-degustacion", async (id) => {
    try {
      if (!requireAuth(socket)) return;
      const deg = await Degustacion.findById(id);
      if (deg) {
        // Reponer stock de los vinos usados
        for (const v of deg.vinosUsados || []) {
          if (v.productoId) {
            await Product.findByIdAndUpdate(v.productoId, { $inc: { cantidad: 1 } });
          }
        }
        await Degustacion.findByIdAndDelete(id);
      }
      io.emit("cambios");
    } catch (err) {
      console.error("Error borrar-degustacion:", err);
    }
  });

  socket.on("buscar-producto-degustacion", async (search) => {
    try {
      const searchRegex = { $regex: search, $options: "i" };
      const productos = await Product.find({
        $or: [
          { codigo: searchRegex },
          { nombre: searchRegex },
          { bodega: searchRegex },
        ],
      }).select("-foto -fotoIA -descripcionGenerada").limit(10);
      socket.emit("response-buscar-producto-degustacion", productos);
    } catch (err) {
      console.error("Error buscar-producto-degustacion:", err);
    }
  });

  // ── Proveedores simple (para dropdown) ──
  socket.on("request-proveedores-simple", async () => {
    try {
      const proveedores = await Proveedor.find({ activo: true }).select("nombre").lean();
      socket.emit("response-proveedores-simple", proveedores);
    } catch (err) {
      console.error("Error request-proveedores-simple:", err);
      socket.emit("response-proveedores-simple", []);
    }
  });

  // ── Proveedores CRUD ──
  socket.on("request-proveedores", async (data = {}) => {
    try {
      const { page = 1, search = "" } = data;
      const limit = 20;
      const query = {};
      if (search) {
        query.$or = [
          { bodega: { $regex: search, $options: "i" } },
          { nombre: { $regex: search, $options: "i" } },
          { cuit: { $regex: search, $options: "i" } },
        ];
      }
      const total = await Proveedor.countDocuments(query);
      const proveedores = await Proveedor.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      socket.emit("response-proveedores", {
        proveedores,
        totalPages: Math.ceil(total / limit) || 1,
      });
    } catch (err) {
      console.error("Error request-proveedores:", err);
      socket.emit("response-proveedores", { proveedores: [], totalPages: 1 });
    }
  });

  socket.on("guardar-proveedor", async (data) => {
    try {
      if (data._id) {
        await Proveedor.findByIdAndUpdate(data._id, data);
      } else {
        await Proveedor.create(data);
      }
      io.emit("cambios");
    } catch (err) {
      console.error("Error guardar-proveedor:", err);
    }
  });

  socket.on("toggle-proveedor-activo", async (id) => {
    try {
      const prov = await Proveedor.findById(id);
      if (!prov) return;
      prov.activo = !prov.activo;
      await prov.save();
      io.emit("cambios");
    } catch (err) {
      console.error("Error toggle-proveedor-activo:", err);
    }
  });

  // ── Ordenes de Compra ──
  socket.on("request-ordenes-compra", async (data = {}) => {
    try {
      const { page = 1, search = "", estado = "" } = data;
      const limit = 20;
      const query = {};
      if (estado) query.estado = estado;
      if (search) {
        query.$or = [
          { numero: { $regex: search, $options: "i" } },
          { proveedorNombre: { $regex: search, $options: "i" } },
          { proveedorBodega: { $regex: search, $options: "i" } },
        ];
      }
      const total = await OrdenCompra.countDocuments(query);
      const ordenes = await OrdenCompra.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      // Enriquecer OCs antiguas sin proveedorBodega
      const sinBodega = ordenes.filter((o) => !o.proveedorBodega && o.proveedorId);
      if (sinBodega.length > 0) {
        const provIds = [...new Set(sinBodega.map((o) => o.proveedorId.toString()))];
        const provs = await Proveedor.find({ _id: { $in: provIds } }, "bodega").lean();
        const map = {};
        provs.forEach((p) => { map[p._id.toString()] = p.bodega; });
        ordenes.forEach((o) => {
          if (!o.proveedorBodega && o.proveedorId) {
            o.proveedorBodega = map[o.proveedorId.toString()] || o.proveedorNombre;
          }
        });
      }
      socket.emit("response-ordenes-compra", {
        ordenes,
        totalPages: Math.ceil(total / limit) || 1,
      });
    } catch (err) {
      console.error("Error request-ordenes-compra:", err);
      socket.emit("response-ordenes-compra", { ordenes: [], totalPages: 1 });
    }
  });

  socket.on("request-orden-compra-detalle", async (id) => {
    try {
      const orden = await OrdenCompra.findById(id).lean();
      if (!orden) return socket.emit("response-orden-compra-detalle", null);
      const proveedor = await Proveedor.findById(orden.proveedorId).lean();
      const pagos = await PagoProveedor.find({ ordenCompraId: id }).sort({ createdAt: -1 }).lean();
      const totalFletes = (orden.fletes || []).reduce((s, f) => s + (f.monto || 0), 0);
      const totalUnidades = (orden.items || []).reduce((s, it) => s + (it.cantidadSolicitada || 0), 0);
      const fletePorUnidad = totalUnidades > 0 ? Math.round((totalFletes / totalUnidades) * 100) / 100 : 0;
      socket.emit("response-orden-compra-detalle", {
        ...orden,
        proveedor,
        pagos,
        total: orden.montoTotal,
        totalPagado: orden.montoPagado,
        totalPagadoFlete: orden.montoPagadoFlete || 0,
        totalFletes,
        fletePorUnidad,
      });
    } catch (err) {
      console.error("Error request-orden-compra-detalle:", err);
      socket.emit("response-orden-compra-detalle", null);
    }
  });

  socket.on("guardar-orden-compra", async (data) => {
    try {
      const proveedor = await Proveedor.findById(data.proveedor).lean();
      if (!proveedor) return;
      const count = await OrdenCompra.countDocuments();
      const numero = `OC-${String(count + 1).padStart(4, "0")}`;
      const items = (data.items || []).map((it) => ({
        nombre: it.descripcion,
        cantidadSolicitada: it.cantidad,
        precioUnitario: it.precioUnitario,
        bonif: it.bonif || 0,
      }));
      const montoTotal = items.reduce((s, it) => {
        const subtotal = it.cantidadSolicitada * it.precioUnitario;
        return s + subtotal * (1 - (it.bonif || 0) / 100);
      }, 0);
      const nueva = await OrdenCompra.create({
        numero,
        proveedorId: proveedor._id,
        proveedorNombre: proveedor.nombre,
        proveedorBodega: proveedor.bodega || proveedor.nombre,
        items,
        montoTotal,
        notas: data.notas || "",
        facturas: [],
        timeline: [{ accion: "Orden creada", usuario: "Sistema", fecha: new Date() }],
      });
      socket.emit("response-guardar-orden-compra", { id: nueva._id.toString() });
      io.emit("cambios");
      crearNotificacion({
        tipo: "aprobacion_pendiente",
        mensaje: `Nueva ${numero} de ${proveedor.nombre} pendiente de aprobacion`,
        destinatarioRol: "admin",
        referenciaId: nueva._id,
      });
    } catch (err) {
      console.error("Error guardar-orden-compra:", err);
    }
  });

  socket.on("actualizar-orden-compra", async (data) => {
    try {
      const orden = await OrdenCompra.findById(data.id);
      if (!orden) return;
      const proveedor = await Proveedor.findById(data.proveedor).lean();
      if (!proveedor) return;
      const items = (data.items || []).map((it) => ({
        nombre: it.descripcion,
        cantidadSolicitada: it.cantidad,
        precioUnitario: it.precioUnitario,
        bonif: it.bonif || 0,
      }));
      const montoTotal = items.reduce((s, it) => {
        const subtotal = it.cantidadSolicitada * it.precioUnitario;
        return s + subtotal * (1 - (it.bonif || 0) / 100);
      }, 0);
      orden.proveedorId = proveedor._id;
      orden.proveedorNombre = proveedor.nombre;
      orden.items = items;
      orden.montoTotal = montoTotal;
      orden.notas = data.notas || '';
      if (data.factura) {
        orden.facturas = [{ numero: data.factura, fecha: data.fecha }];
      }
      orden.timeline.push({ accion: 'Orden editada', usuario: 'Sistema', fecha: new Date() });
      await orden.save();
      io.emit('cambios');
    } catch (err) {
      console.error('Error actualizar-orden-compra:', err);
    }
  });

  socket.on("cambiar-estado-oc", async (data) => {
    try {
      if (!requireAuth(socket)) return;
      const { ordenId, nuevoEstado, usuarioNombre, detalle } = data;
      const id = ordenId || data.id;
      const estado = nuevoEstado || data.estado;
      const orden = await OrdenCompra.findById(id);
      if (!orden) return;
      orden.estado = estado;
      const msg = detalle || `Estado cambiado a ${estado}`;
      orden.timeline.push({ accion: msg, usuario: usuarioNombre || "Sistema", fecha: new Date() });
      await orden.save();

      // Propagar costo al producto cuando se recibe la OC (incluye flete proporcional)
      if (estado === "recibida" || estado === "recibida_parcial") {
        const totalFletesOC = (orden.fletes || []).reduce((s, f) => s + (f.monto || 0), 0);
        const totalUnidadesOC = (orden.items || []).reduce((s, it) => s + (it.cantidadSolicitada || 0), 0);
        const fletePorUnidadOC = totalUnidadesOC > 0 ? Math.round((totalFletesOC / totalUnidadesOC) * 100) / 100 : 0;
        for (const item of orden.items || []) {
          if (item.productoId && item.precioUnitario) {
            await Product.findByIdAndUpdate(item.productoId, { costo: Math.round((item.precioUnitario + fletePorUnidadOC) * 100) / 100 });
          }
        }
      }

      io.emit("cambios");

      // Notificaciones segun nuevo estado
      if (estado === "aprobada") {
        crearNotificacion({ tipo: "orden_aprobada", mensaje: `${orden.numero} fue aprobada`, destinatarioRol: "comprador", referenciaId: orden._id });
      } else if (estado === "recibida" || estado === "recibida_parcial") {
        crearNotificacion({ tipo: "orden_recibida", mensaje: `${orden.numero} fue ${estado === "recibida" ? "recibida" : "recibida parcialmente"}`, destinatarioRol: "comprador", referenciaId: orden._id });
      }
    } catch (err) {
      console.error("Error cambiar-estado-oc:", err);
    }
  });

  socket.on("cancelar-orden-compra", async (id) => {
    try {
      const orden = await OrdenCompra.findById(id);
      if (!orden) return;
      orden.estado = "cancelada";
      orden.timeline.push({ accion: "Orden cancelada", usuario: "Sistema", fecha: new Date() });
      await orden.save();
      io.emit("cambios");
    } catch (err) {
      console.error("Error cancelar-orden-compra:", err);
    }
  });

  // ── Fletes OC ──
  socket.on("agregar-flete-oc", async (data) => {
    try {
      const orden = await OrdenCompra.findById(data.ordenCompraId);
      if (!orden) return;
      orden.fletes.push({
        descripcion: data.descripcion || "Flete",
        monto: data.monto,
        fecha: new Date().toISOString().slice(0, 10),
        registradoPor: data.usuario || "Sistema",
      });
      orden.timeline.push({ accion: `Flete agregado: $${data.monto} - ${data.descripcion || "Flete"}`, usuario: data.usuario || "Sistema", fecha: new Date() });
      await orden.save();
      io.emit("cambios");
    } catch (err) {
      console.error("Error agregar-flete-oc:", err);
    }
  });

  socket.on("eliminar-flete-oc", async (data) => {
    try {
      const orden = await OrdenCompra.findById(data.ordenCompraId);
      if (!orden) return;
      const flete = orden.fletes[data.fleteIndex];
      if (!flete) return;
      const desc = `Flete eliminado: $${flete.monto} - ${flete.descripcion || "Flete"}`;
      orden.fletes.splice(data.fleteIndex, 1);
      orden.timeline.push({ accion: desc, usuario: "Sistema", fecha: new Date() });
      await orden.save();
      io.emit("cambios");
    } catch (err) {
      console.error("Error eliminar-flete-oc:", err);
    }
  });

  // ── Pagos Proveedor ──
  socket.on("guardar-pago-proveedor", async (data) => {
    try {
      const orden = await OrdenCompra.findById(data.ordenCompra);
      if (!orden) return;
      const concepto = data.concepto === "flete" ? "flete" : "factura";
      await PagoProveedor.create({
        ordenCompraId: orden._id,
        proveedorId: orden.proveedorId,
        monto: data.monto,
        metodoPago: data.metodo || "transferencia",
        referencia: data.referencia || "",
        concepto,
        notas: data.notas || "",
        fecha: new Date().toISOString().slice(0, 10),
        registradoPor: "Sistema",
      });
      if (concepto === "flete") {
        orden.montoPagadoFlete = (orden.montoPagadoFlete || 0) + data.monto;
      } else {
        orden.montoPagado = (orden.montoPagado || 0) + data.monto;
      }
      const totalFletes = (orden.fletes || []).reduce((s, f) => s + (f.monto || 0), 0);
      const totalConIVA = Math.round(orden.montoTotal * 1.21 * 100) / 100;
      const factPagado = totalConIVA > 0 && (orden.montoPagado || 0) >= totalConIVA;
      const fletePagado = totalFletes <= 0 || (orden.montoPagadoFlete || 0) >= totalFletes;
      if (factPagado && fletePagado) {
        orden.estadoPago = "pagado";
      } else if ((orden.montoPagado || 0) > 0 || (orden.montoPagadoFlete || 0) > 0) {
        orden.estadoPago = "parcial";
      }
      const etiqueta = concepto === "flete" ? "Pago flete" : "Pago factura";
      orden.timeline.push({ accion: `${etiqueta}: $${data.monto}`, usuario: "Sistema", fecha: new Date() });
      await orden.save();
      io.emit("cambios");
      crearNotificacion({
        tipo: "pago_registrado",
        mensaje: `Pago de $${data.monto} registrado para ${orden.proveedorNombre} (${orden.numero})`,
        destinatarioRol: "admin",
        referenciaId: orden._id,
      });
    } catch (err) {
      console.error("Error guardar-pago-proveedor:", err);
    }
  });

  socket.on("request-pagos-proveedor", async (data = {}) => {
    try {
      const { page = 1, proveedorId = "" } = data;
      const limit = 20;
      const query = {};
      if (proveedorId) query.proveedorId = proveedorId;
      const total = await PagoProveedor.countDocuments(query);
      const pagos = await PagoProveedor.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("ordenCompraId", "numero")
        .populate("proveedorId", "nombre")
        .lean();
      socket.emit("response-pagos-proveedor", {
        pagos,
        totalPages: Math.ceil(total / limit) || 1,
      });
    } catch (err) {
      console.error("Error request-pagos-proveedor:", err);
      socket.emit("response-pagos-proveedor", { pagos: [], totalPages: 1 });
    }
  });

  // ── OCR Factura con IA ──
  socket.on("ocr-factura", async (data, cb) => {
    const AI_KEY_ANTHROPIC = process.env.ANTHROPIC_API_KEY;
    const AI_KEY_OPENAI = process.env.OPENAI_API_KEY;
    const AI_KEY = AI_KEY_ANTHROPIC || AI_KEY_OPENAI;
    if (!AI_KEY) {
      if (cb) cb({ error: "No hay API key de IA configurada" });
      return;
    }
    try {
      const { imageBase64, mimeType } = data;
      if (!imageBase64) {
        if (cb) cb({ error: "No se recibió imagen" });
        return;
      }
      const validMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      const resolvedMime = mimeType && validMimeTypes.includes(mimeType) ? mimeType : null;
      if (!resolvedMime) {
        if (cb) cb({ error: "Formato no soportado. Subí una imagen (JPG, PNG, WEBP)." });
        return;
      }
      const imgSizeKB = Math.round((imageBase64.length * 3) / 4 / 1024);
      console.log(`OCR: imagen recibida ${imgSizeKB}KB, tipo: ${mimeType}, usando: ${AI_KEY_ANTHROPIC ? "Anthropic" : "OpenAI"}`);

      const prompt = `Analiza esta factura/remito y extrae los datos en formato JSON exactamente asi (sin markdown, solo JSON puro):
{
  "numeroFactura": "string",
  "fecha": "YYYY-MM-DD",
  "proveedor": {
    "nombre": "string",
    "cuit": "string",
    "direccion": "string",
    "telefono": "string",
    "condicionPago": "string"
  },
  "items": [
    {
      "descripcion": "string",
      "cantidad": number,
      "precioUnitario": number
    }
  ],
  "subtotal": number,
  "iva": number,
  "total": number,
  "notas": ""
}

Reglas:
- Los precios deben ser numeros sin simbolo de moneda
- Si un campo no se encuentra, usa "" para strings y 0 para numeros
- Si hay IVA discriminado, ponelo en "iva"
- "notas" siempre debe ser "" (cadena vacia)
- En las facturas argentinas suele haber dos fechas: "Inicio de Actividades" del CUIT y la fecha de emision de la factura. Usa SOLO la fecha de emision de la factura como valor de "fecha"
- Solo responde con el JSON, nada mas`;

      let text = "";
      if (AI_KEY_ANTHROPIC) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": AI_KEY_ANTHROPIC,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: resolvedMime,
                    data: imageBase64,
                  },
                },
                { type: "text", text: prompt },
              ],
            }],
          }),
        });
        const result = await res.json();
        text = result.content?.[0]?.text || "";
      } else {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AI_KEY_OPENAI}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${resolvedMime};base64,${imageBase64}`,
                    detail: "low",
                  },
                },
                { type: "text", text: prompt },
              ],
            }],
          }),
        });
        const result = await res.json();
        console.log("OCR OpenAI full response:", JSON.stringify(result).substring(0, 800));
        if (result.error) {
          console.error("OCR OpenAI API error:", result.error);
          if (cb) cb({ error: "Error de API OpenAI: " + (result.error.message || result.error.type) });
          return;
        }
        text = result.choices?.[0]?.message?.content || "";
      }

      // Extraer JSON del texto (puede venir en ```json ... ``` o directo)
      console.log("OCR respuesta raw:", text.substring(0, 500));
      let cleanText = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (cb) cb({ ok: true, data: parsed });
        } catch (parseErr) {
          console.error("Error parseando JSON de OCR:", parseErr, "Texto:", jsonMatch[0].substring(0, 300));
          if (cb) cb({ error: "La IA devolvio datos pero no se pudieron parsear" });
        }
      } else {
        console.error("OCR: no se encontro JSON en:", text.substring(0, 500));
        if (cb) cb({ error: "No se pudo extraer datos de la factura. Proba con una foto mas clara." });
      }
    } catch (err) {
      console.error("Error ocr-factura:", err);
      if (cb) cb({ error: "Error procesando factura: " + err.message });
    }
  });

  // ── Stock Bajo ──
  socket.on("request-stock-bajo", async () => {
    try {
      const productos = await Product.find({
        tipo: "vino",
        $expr: { $lte: ["$cantidad", "$stockMinimo"] },
      }).select("codigo nombre bodega cepa cantidad stockMinimo proveedorNombre").lean();
      socket.emit("response-stock-bajo", productos);
    } catch (err) {
      console.error("Error request-stock-bajo:", err);
      socket.emit("response-stock-bajo", []);
    }
  });

  // ── Dashboard: compras KPIs ──
  socket.on("request-compras-dashboard", async () => {
    try {
      const [pendAprobacion, pendRecepcion, deudaResult] = await Promise.all([
        OrdenCompra.countDocuments({ estado: "pendiente_aprobacion" }),
        OrdenCompra.countDocuments({ estado: { $in: ["aprobada", "enviada", "en_camino", "recibida_parcial"] } }),
        OrdenCompra.aggregate([
          { $match: { estadoPago: { $in: ["pendiente", "parcial"] }, estado: { $nin: ["cancelada"] } } },
          { $group: { _id: null, total: { $sum: { $subtract: [{ $multiply: ["$montoTotal", 1.21] }, "$montoPagado"] } } } },
        ]),
      ]);
      const pendPago = await OrdenCompra.countDocuments({ estadoPago: { $in: ["pendiente", "parcial"] }, estado: { $nin: ["cancelada", "borrador"] } });
      socket.emit("response-compras-dashboard", {
        pendientesAprobacion: pendAprobacion,
        pendientesPago: pendPago,
        pendientesRecepcion: pendRecepcion,
        deudaTotal: deudaResult.length > 0 ? deudaResult[0].total : 0,
      });
    } catch (err) {
      console.error("Error request-compras-dashboard:", err);
      socket.emit("response-compras-dashboard", { pendientesAprobacion: 0, pendientesPago: 0, pendientesRecepcion: 0, deudaTotal: 0 });
    }
  });

  // ── Dashboard: datos del día (ventas + MP) ──
  socket.on("request-dashboard-data", async () => {
    try {
      const hoy = moment().tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");

      // Sincronizar pagos MP de hoy antes de consultar
      await syncMpPagos(hoy);

      const matchHoy = { fecha: hoy, notaCredito: { $ne: true } };
      const groupVentas = { _id: null, total: { $sum: "$monto" }, cantidad: { $sum: 1 } };
      const [ventasHoy, ventasVinosHoy, ventasReservasHoy, mpHoy, ultimasVentas] = await Promise.all([
        Venta.aggregate([
          { $match: matchHoy },
          { $group: groupVentas },
        ]),
        Venta.aggregate([
          { $match: { ...matchHoy, $or: [{ idTurno: { $exists: false } }, { idTurno: null }] } },
          { $group: groupVentas },
        ]),
        Venta.aggregate([
          { $match: { ...matchHoy, idTurno: { $exists: true, $ne: null } } },
          { $group: groupVentas },
        ]),
        PagoMp.aggregate([
          { $match: { fecha: hoy, estado: "approved" } },
          {
            $group: {
              _id: null,
              totalCobrado: { $sum: { $cond: [{ $eq: ["$tipoMovimiento", "cobro"] }, "$monto", 0] } },
              netoCobrado: { $sum: { $cond: [{ $eq: ["$tipoMovimiento", "cobro"] }, "$netoRecibido", 0] } },
              comisiones: { $sum: { $cond: [{ $eq: ["$tipoMovimiento", "cobro"] }, "$comisionMp", 0] } },
              retenciones: { $sum: { $cond: [{ $eq: ["$tipoMovimiento", "cobro"] }, "$retenciones", 0] } },
              totalGastos: { $sum: { $cond: [{ $eq: ["$tipoMovimiento", "gasto"] }, "$monto", 0] } },
              cantidadPagos: { $sum: 1 },
            },
          },
        ]),
        Venta.find({ fecha: hoy, notaCredito: { $ne: true } })
          .sort({ createdAt: -1 })
          .limit(5)
          .select("monto formaPago stringNumeroFactura numeroVenta nombreTurno createdAt productos")
          .lean(),
      ]);

      const v = ventasHoy[0] || { total: 0, cantidad: 0 };
      const vVinos = ventasVinosHoy[0] || { total: 0, cantidad: 0 };
      const vReservas = ventasReservasHoy[0] || { total: 0, cantidad: 0 };
      const mp = mpHoy[0] || { totalCobrado: 0, netoCobrado: 0, comisiones: 0, retenciones: 0, totalGastos: 0, cantidadPagos: 0 };

      socket.emit("response-dashboard-data", {
        ventas: {
          cantidad: v.cantidad,
          total: v.total,
          ticketPromedio: v.cantidad > 0 ? Math.round(v.total / v.cantidad) : 0,
        },
        ventasVinos: {
          cantidad: vVinos.cantidad,
          total: vVinos.total,
          ticketPromedio: vVinos.cantidad > 0 ? Math.round(vVinos.total / vVinos.cantidad) : 0,
        },
        ventasReservas: {
          cantidad: vReservas.cantidad,
          total: vReservas.total,
          ticketPromedio: vReservas.cantidad > 0 ? Math.round(vReservas.total / vReservas.cantidad) : 0,
        },
        mp: {
          totalCobrado: mp.totalCobrado,
          neto: mp.netoCobrado,
          comisiones: mp.comisiones,
          retenciones: mp.retenciones,
          gastos: mp.totalGastos,
          cantidadPagos: mp.cantidadPagos,
        },
        ultimasVentas: ultimasVentas.map((vt) => ({
          _id: vt._id,
          monto: vt.monto,
          formaPago: vt.formaPago,
          factura: vt.stringNumeroFactura || (vt.numeroVenta ? `#${vt.numeroVenta}` : "Sin factura"),
          turno: vt.nombreTurno || "",
          hora: vt.createdAt,
          cantProductos: vt.productos ? vt.productos.length : 0,
        })),
      });
    } catch (err) {
      console.error("Error request-dashboard-data:", err);
      socket.emit("response-dashboard-data", {
        ventas: { cantidad: 0, total: 0, ticketPromedio: 0 },
        mp: { totalCobrado: 0, neto: 0, comisiones: 0, retenciones: 0, gastos: 0, cantidadPagos: 0 },
        ultimasVentas: [],
      });
    }
  });

  // ── Historial de precios de un producto ──
  socket.on("request-historial-precios", async (productoId) => {
    try {
      const prod = await Product.findById(productoId).select("nombre venta historialPrecios").lean();
      socket.emit("response-historial-precios", prod);
    } catch (err) {
      console.error("Error request-historial-precios:", err);
    }
  });

  // ── Reporte mensual de degustaciones ──
  socket.on("request-reporte-degustaciones", async (mes) => {
    try {
      let filter = {};
      if (mes) {
        filter.fecha = { $regex: `^${mes}` };
      }
      const degs = await Degustacion.find(filter).lean();

      // Batch: 2 queries en vez de 2*N
      const degIds = degs.map(d => d._id);
      const fechas = [...new Set(degs.filter(d => d.fecha).map(d => d.fecha))];
      const [allTurnos, allOps] = await Promise.all([
        fechas.length ? Turno.find({ fecha: { $in: fechas } }).lean() : [],
        Operacion.find({ degustacionId: { $in: degIds } }).lean(),
      ]);
      const turnosByFecha = {};
      for (const t of allTurnos) { (turnosByFecha[t.fecha] ||= []).push(t); }
      const opsByDeg = {};
      for (const o of allOps) { const k = o.degustacionId.toString(); (opsByDeg[k] ||= []).push(o); }

      const reporte = [];
      for (const deg of degs) {
        const turnos = deg.fecha ? (turnosByFecha[deg.fecha] || []) : [];
        const ingresoReservas = turnos.reduce((sum, t) => sum + (t.cobrado || 0), 0);
        const ops = opsByDeg[deg._id.toString()] || [];
        const totalGastosCaja = ops.filter((o) => o.tipoOperacion === "GASTO").reduce((sum, o) => sum + Math.abs(o.monto || 0), 0);
        const totalIngresosCaja = ops.filter((o) => o.tipoOperacion === "INGRESO").reduce((sum, o) => sum + (o.monto || 0), 0);
        const costoVinos = (deg.vinosUsados || []).reduce((sum, v) => sum + (v.precioVenta || 0), 0);
        const ingresoTotal = ingresoReservas + totalIngresosCaja;
        const gastoTotal = costoVinos + totalGastosCaja;
        reporte.push({
          _id: deg._id, nombre: deg.nombre, fecha: deg.fecha,
          cantidadPersonas: deg.cantidadPersonas || 0,
          ingresoTotal, costoVinos, gastosCaja: totalGastosCaja,
          resultado: ingresoTotal - gastoTotal, vinosUsados: (deg.vinosUsados || []).length,
        });
      }

      const totalIngreso = reporte.reduce((s, r) => s + r.ingresoTotal, 0);
      const totalGasto = reporte.reduce((s, r) => s + r.costoVinos + r.gastosCaja, 0);
      const totalResultado = reporte.reduce((s, r) => s + r.resultado, 0);
      const totalPersonas = reporte.reduce((s, r) => s + r.cantidadPersonas, 0);

      socket.emit("response-reporte-degustaciones", {
        degustaciones: reporte,
        resumen: { totalIngreso, totalGasto, totalResultado, totalPersonas, cantidad: reporte.length },
      });
    } catch (err) {
      console.error("Error request-reporte-degustaciones:", err);
    }
  });

  // ═══════════════════════════════════════
  // ── EVENTOS (reemplaza Degustaciones + Reservas) ──
  // ═══════════════════════════════════════

  socket.on("guardar-evento", async (evento) => {
    try {
      if (evento.fecha && evento.fecha.includes("T")) {
        evento.fecha = evento.fecha.split("T")[0];
      }
      const nuevosVinos = evento.vinosUsados || [];

      if (evento._id) {
        const anterior = await Evento.findById(evento._id);
        const anteriorIds = (anterior?.vinosUsados || []).map((v) => v.productoId?.toString());
        const nuevosIds = nuevosVinos.map((v) => v.productoId?.toString());
        for (const v of anterior?.vinosUsados || []) {
          if (!nuevosIds.includes(v.productoId?.toString())) {
            await Product.findByIdAndUpdate(v.productoId, { $inc: { cantidad: 1 } });
          }
        }
        for (const v of nuevosVinos) {
          if (!anteriorIds.includes(v.productoId?.toString())) {
            await Product.findByIdAndUpdate(v.productoId, { $inc: { cantidad: -1 } });
          }
        }
        await Evento.findByIdAndUpdate(evento._id, evento);
      } else {
        for (const v of nuevosVinos) {
          if (v.productoId) {
            await Product.findByIdAndUpdate(v.productoId, { $inc: { cantidad: -1 } });
          }
        }
        await Evento.create(evento);
      }
      io.emit("cambios");
    } catch (err) {
      console.error("Error guardar-evento:", err);
    }
  });

  socket.on("request-eventos", async (search, page, filtroEstado) => {
    try {
      const pageSize = 50;
      const pageNumber = page || 1;
      let filter = {};

      if (search) {
        const searchRegex = { $regex: search, $options: "i" };
        filter.$or = [{ nombre: searchRegex }, { fecha: searchRegex }, { descripcion: searchRegex }];
      }
      if (filtroEstado && filtroEstado !== "todos") {
        filter.estado = filtroEstado;
      }

      const eventos = await Evento.find(filter)
        .sort({ fecha: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean();

      // Batch: 2 queries en vez de 2*N
      const evIds = eventos.map(ev => ev._id);
      const [allTurnos, allOps, allFeedbacks] = await Promise.all([
        Turno.find({ eventoId: { $in: evIds } }).lean(),
        Operacion.find({ $or: [{ eventoId: { $in: evIds } }, { degustacionId: { $in: evIds } }] }).lean(),
        FeedbackEvento.find({ eventoId: { $in: evIds }, tipo: "cliente" }, { eventoId: 1, puntaje: 1 }).lean(),
      ]);
      const turnosByEv = {};
      for (const t of allTurnos) { const k = t.eventoId.toString(); (turnosByEv[k] ||= []).push(t); }
      const opsByEv = {};
      for (const o of allOps) { const k = (o.eventoId || o.degustacionId).toString(); (opsByEv[k] ||= []).push(o); }
      const fbByEv = {};
      for (const f of allFeedbacks) { const k = f.eventoId.toString(); (fbByEv[k] ||= []).push(f); }

      for (const ev of eventos) {
        const id = ev._id.toString();
        const turnos = turnosByEv[id] || [];
        ev.reservas = turnos.map((t) => ({
          _id: t._id, nombre: t.nombre, cantidad: t.cantidad,
          total: t.total || 0, cobrado: t.cobrado || 0,
          turno: t.turno, formaDeCobro: t.formaDeCobro,
          telefono: t.telefono, facturado: t.facturado,
          observaciones: t.observaciones,
        }));
        ev.cantidadPersonas = turnos.reduce((sum, t) => sum + (t.cantidad || 0), 0);
        ev.ingresoReservas = turnos.reduce((sum, t) => sum + (t.cobrado || 0), 0);
        ev.totalReservas = turnos.reduce((sum, t) => sum + (t.total || 0), 0);

        const ops = opsByEv[id] || [];
        ev.operacionesVinculadas = ops.map((o) => ({
          _id: o._id, nombre: o.nombre, descripcion: o.descripcion,
          monto: o.monto, tipoOperacion: o.tipoOperacion,
          formaPago: o.formaPago, fecha: o.fecha,
        }));
        ev.totalGastosCaja = ops.filter((o) => o.tipoOperacion === "GASTO").reduce((sum, o) => sum + Math.abs(o.monto || 0), 0);
        ev.totalIngresosCaja = ops.filter((o) => o.tipoOperacion === "INGRESO").reduce((sum, o) => sum + (o.monto || 0), 0);

        const fbs = fbByEv[id] || [];
        ev.feedbackCount = fbs.length;
        ev.feedbackPromedio = fbs.length > 0 ? Math.round((fbs.reduce((s, f) => s + f.puntaje, 0) / fbs.length) * 10) / 10 : null;
      }

      const totalEventos = await Evento.countDocuments(filter);
      let totalPages = Math.ceil(totalEventos / pageSize);
      if (totalPages === 0) totalPages = 1;

      socket.emit("response-eventos", { eventos, totalEventos, totalPages });
    } catch (err) {
      console.error("Error request-eventos:", err);
    }
  });

  socket.on("request-eventos-simple", async () => {
    try {
      const evs = await Evento.find({}, { nombre: 1, fecha: 1 }).sort({ createdAt: -1 }).limit(50).lean();
      socket.emit("response-eventos-simple", evs);
    } catch (err) {
      console.error("Error request-eventos-simple:", err);
      socket.emit("response-eventos-simple", []);
    }
  });

  socket.on("borrar-evento", async (id) => {
    try {
      if (!requireAuth(socket)) return;
      const ev = await Evento.findById(id);
      if (ev) {
        for (const v of ev.vinosUsados || []) {
          if (v.productoId) {
            await Product.findByIdAndUpdate(v.productoId, { $inc: { cantidad: 1 } });
          }
        }
        await Turno.updateMany({ eventoId: id }, { $unset: { eventoId: "" } });
        await Evento.findByIdAndDelete(id);
      }
      io.emit("cambios");
    } catch (err) {
      console.error("Error borrar-evento:", err);
    }
  });

  socket.on("buscar-producto-evento", async (search) => {
    try {
      const searchRegex = { $regex: search, $options: "i" };
      const productos = await Product.find({
        $or: [{ codigo: searchRegex }, { nombre: searchRegex }, { bodega: searchRegex }],
      }).select("-foto -fotoIA -descripcionGenerada").limit(10);
      socket.emit("response-buscar-producto-evento", productos);
    } catch (err) {
      console.error("Error buscar-producto-evento:", err);
    }
  });

  socket.on("cambiar-estado-evento", async (eventoId, nuevoEstado) => {
    try {
      await Evento.findByIdAndUpdate(eventoId, { estado: nuevoEstado });
      io.emit("cambios");
    } catch (err) {
      console.error("Error cambiar-estado-evento:", err);
    }
  });

  // ── Feedback eventos ──
  socket.on("request-feedback-evento", async (eventoId) => {
    try {
      const feedbacks = await FeedbackEvento.find({ eventoId }).sort({ createdAt: -1 }).lean();
      socket.emit("response-feedback-evento", feedbacks);
    } catch (err) { console.error("Error request-feedback-evento:", err); }
  });

  socket.on("guardar-feedback-organizador", async ({ eventoId, puntaje, notasInternas }) => {
    try {
      const existe = await FeedbackEvento.findOne({ eventoId, tipo: "organizador" });
      if (existe) {
        await FeedbackEvento.findByIdAndUpdate(existe._id, { puntaje, notasInternas });
      } else {
        await FeedbackEvento.create({ eventoId, tipo: "organizador", nombre: "Organizador", puntaje, notasInternas });
      }
      io.emit("cambios");
    } catch (err) { console.error("Error guardar-feedback-organizador:", err); }
  });

  socket.on("request-reporte-eventos", async (filtro) => {
    try {
      let filter = {};
      if (typeof filtro === "object" && filtro?.desde && filtro?.hasta) {
        filter.fecha = { $gte: filtro.desde, $lte: filtro.hasta };
      } else {
        const mes = typeof filtro === "string" ? filtro : "";
        if (mes) filter.fecha = { $regex: `^${mes}` };
      }
      const evs = await Evento.find(filter).lean();

      // Batch: 2 queries en vez de 2*N
      const evIds = evs.map(ev => ev._id);
      const [allTurnos, allOps] = await Promise.all([
        Turno.find({ eventoId: { $in: evIds } }).lean(),
        Operacion.find({ $or: [{ eventoId: { $in: evIds } }, { degustacionId: { $in: evIds } }] }).lean(),
      ]);
      const turnosByEv = {};
      for (const t of allTurnos) { const k = t.eventoId.toString(); (turnosByEv[k] ||= []).push(t); }
      const opsByEv = {};
      for (const o of allOps) { const k = (o.eventoId || o.degustacionId).toString(); (opsByEv[k] ||= []).push(o); }

      const reporte = [];
      for (const ev of evs) {
        const id = ev._id.toString();
        const turnos = turnosByEv[id] || [];
        const ingresoReservas = turnos.reduce((sum, t) => sum + (t.cobrado || 0), 0);
        const cantidadPersonas = turnos.reduce((sum, t) => sum + (t.cantidad || 0), 0);

        const ops = opsByEv[id] || [];
        const totalGastosCaja = ops.filter((o) => o.tipoOperacion === "GASTO").reduce((sum, o) => sum + Math.abs(o.monto || 0), 0);
        const totalIngresosCaja = ops.filter((o) => o.tipoOperacion === "INGRESO").reduce((sum, o) => sum + (o.monto || 0), 0);

        const costoVinos = (ev.vinosUsados || []).reduce((sum, v) => sum + (v.precioVenta || 0), 0);
        const ingresoTotal = ingresoReservas + totalIngresosCaja;
        const gastoTotal = costoVinos + totalGastosCaja;

        reporte.push({
          _id: ev._id, nombre: ev.nombre, fecha: ev.fecha,
          cantidadPersonas, ingreso: ingresoTotal, gasto: gastoTotal,
          resultado: ingresoTotal - gastoTotal, vinosUsados: (ev.vinosUsados || []).length,
        });
      }

      const totalIngreso = reporte.reduce((s, r) => s + r.ingreso, 0);
      const totalGasto = reporte.reduce((s, r) => s + r.gasto, 0);
      const totalResultado = reporte.reduce((s, r) => s + r.resultado, 0);
      const totalPersonas = reporte.reduce((s, r) => s + r.cantidadPersonas, 0);

      socket.emit("response-reporte-eventos", {
        reporte,
        resumen: { totalIngreso, totalGasto, totalResultado, totalPersonas, cantidad: reporte.length },
      });
    } catch (err) {
      console.error("Error request-reporte-eventos:", err);
    }
  });

  // ── Precios / Costos ──
  socket.on("request-precios", async (data = {}) => {
    try {
      const { page = 1, search = "", tipo = "" } = data;
      const limit = 50;
      const conditions = [];
      if (search) {
        const re = { $regex: search, $options: "i" };
        conditions.push({ $or: [{ nombre: re }, { bodega: re }, { cepa: re }, { codigo: re }] });
      }
      if (tipo) {
        if (tipo === "vino") {
          conditions.push({ $or: [{ tipo: "vino" }, { tipo: { $exists: false } }, { tipo: null }] });
        } else {
          conditions.push({ tipo });
        }
      }
      const query = conditions.length > 0 ? { $and: conditions } : {};
      const total = await Product.countDocuments(query);
      const productos = await Product.find(query)
        .select("nombre bodega cepa codigo costo venta cantidad tipo proveedorNombre historialPrecios")
        .sort({ bodega: 1, nombre: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      socket.emit("response-precios", { productos, totalPages: Math.ceil(total / limit) || 1 });
    } catch (err) {
      console.error("Error request-precios:", err);
      socket.emit("response-precios", { productos: [], totalPages: 1 });
    }
  });

  socket.on("actualizar-precio", async ({ productoId, campo, valor }) => {
    try {
      const producto = await Product.findById(productoId);
      if (!producto) return;
      if (campo === "venta") {
        if (producto.venta && producto.venta !== String(valor)) {
          producto.historialPrecios.push({ precio: producto.venta, fecha: new Date() });
        }
        producto.venta = String(valor);
      } else if (campo === "costo") {
        producto.costo = Number(valor) || 0;
      }
      await producto.save();
      io.emit("cambios");
    } catch (err) {
      console.error("Error actualizar-precio:", err);
    }
  });

  socket.on("actualizar-precios-masivo", async ({ productoIds, porcentaje, campo }) => {
    try {
      const pct = Number(porcentaje);
      if (!pct || !productoIds?.length) return;
      const factor = 1 + pct / 100;
      const productos = await Product.find({ _id: { $in: productoIds } }).select("venta costo historialPrecios");
      const ops = [];
      for (const prod of productos) {
        const update = {};
        if (campo === "venta") {
          const actual = Number(prod.venta) || 0;
          const nuevo = Math.round(actual * factor);
          update.venta = String(nuevo);
          if (prod.venta) {
            update.$push = { historialPrecios: { precio: prod.venta, fecha: new Date() } };
          }
        } else if (campo === "costo") {
          const actual = prod.costo || 0;
          update.costo = Math.round(actual * factor);
        }
        if (update.$push) {
          const { $push, ...set } = update;
          ops.push({ updateOne: { filter: { _id: prod._id }, update: { $set: set, $push } } });
        } else {
          ops.push({ updateOne: { filter: { _id: prod._id }, update: { $set: update } } });
        }
      }
      if (ops.length > 0) await Product.bulkWrite(ops);
      io.emit("cambios");
    } catch (err) {
      console.error("Error actualizar-precios-masivo:", err);
    }
  });

  // ── Notificaciones ──
  socket.on("request-notificaciones", async () => {
    try {
      if (!socket.usuario) { socket.emit("response-notificaciones", []); return; }
      const { _id, rol } = socket.usuario;
      const filter = {
        $or: [
          { destinatarioId: _id },
          { destinatarioRol: rol },
          { destinatarioRol: "todos" },
        ],
      };
      const notifs = await Notificacion.find(filter).sort({ createdAt: -1 }).limit(50).lean();
      socket.emit("response-notificaciones", notifs);
    } catch (err) {
      console.error("Error request-notificaciones:", err);
      socket.emit("response-notificaciones", []);
    }
  });

  socket.on("marcar-notificacion-leida", async (id) => {
    try {
      await Notificacion.findByIdAndUpdate(id, { leida: true });
      io.emit("cambios-notificaciones");
    } catch (err) {
      console.error("Error marcar-notificacion-leida:", err);
    }
  });

  socket.on("marcar-todas-notificaciones-leidas", async () => {
    try {
      if (!socket.usuario) return;
      const { _id, rol } = socket.usuario;
      await Notificacion.updateMany(
        { leida: false, $or: [{ destinatarioId: _id }, { destinatarioRol: rol }, { destinatarioRol: "todos" }] },
        { leida: true }
      );
      io.emit("cambios-notificaciones");
    } catch (err) {
      console.error("Error marcar-todas-leidas:", err);
    }
  });

  // ── Busqueda global (Ctrl+K) ──
  socket.on("search-global", async (q) => {
    try {
      const search = String(q || "").trim();
      if (!search || search.length < 2) {
        socket.emit("response-search-global", { productos: [], ventas: [] });
        return;
      }
      const re = { $regex: search, $options: "i" };
      const [productos, ventas] = await Promise.all([
        Product.find({ $or: [{ nombre: re }, { bodega: re }, { cepa: re }, { codigo: re }] })
          .select("nombre bodega codigo tipo venta cantidad")
          .sort({ nombre: 1 })
          .limit(8)
          .lean(),
        Venta.find({
          $or: [
            { stringNumeroFactura: re },
            { nombre: re },
            { razonSocial: re },
            ...(Number(search) ? [{ numeroVenta: Number(search) }] : []),
          ],
          notaCredito: { $ne: true },
        })
          .select("stringNumeroFactura monto formaPago fecha nombre razonSocial numeroVenta")
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
      ]);
      socket.emit("response-search-global", { productos, ventas });
    } catch (err) {
      console.error("Error search-global:", err);
      socket.emit("response-search-global", { productos: [], ventas: [] });
    }
  });

  // ── CRM Clientes ──

  socket.on("request-clientes", async (params) => {
    try {
      const { search, page = 1 } = params || {};
      const pageSize = 30;
      const query = {};
      if (search) {
        const re = new RegExp(search, "i");
        query.$or = [
          { nombre: re }, { apellido: re }, { email: re }, { cuit: re },
          { razonSocial: re }, { telefono: re }, { whatsapp: re }, { dni: re },
        ];
      }
      const [clientes, total] = await Promise.all([
        Cliente.find(query).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
        Cliente.countDocuments(query),
      ]);
      socket.emit("response-clientes", { clientes, totalPages: Math.ceil(total / pageSize) || 1 });
    } catch (err) {
      console.error("Error request-clientes:", err);
      socket.emit("response-clientes", { clientes: [], totalPages: 1 });
    }
  });

  socket.on("guardar-cliente", async (data) => {
    try {
      if (data._id) {
        await Cliente.findByIdAndUpdate(data._id, data);
      } else {
        await Cliente.create(data);
      }
      io.emit("cambios-clientes");
    } catch (err) {
      console.error("Error guardar-cliente:", err);
    }
  });

  socket.on("borrar-cliente", async (id) => {
    try {
      await Cliente.findByIdAndDelete(id);
      io.emit("cambios-clientes");
    } catch (err) {
      console.error("Error borrar-cliente:", err);
    }
  });

  socket.on("request-cliente-detalle", async (id) => {
    try {
      const cliente = await Cliente.findById(id).lean();
      if (!cliente) return socket.emit("response-cliente-detalle", null);

      const [ventas, pedidos, suscripciones] = await Promise.all([
        Venta.find({ clienteId: id }).select("-facturaPdf -notaCreditoPdf").sort({ createdAt: -1 }).limit(50).lean(),
        PedidoWeb.find({ clienteId: id }).sort({ createdAt: -1 }).limit(50).lean(),
        SuscripcionClub.find({ clienteId: id }).sort({ createdAt: -1 }).lean(),
      ]);

      const totalGastado = ventas.reduce((s, v) => s + (v.monto || 0), 0)
        + pedidos.reduce((s, p) => s + (p.montoTotal || 0), 0);
      const cantCompras = ventas.length + pedidos.length;
      const ultimaCompra = ventas[0]?.createdAt || pedidos[0]?.createdAt || null;
      const ticketPromedio = cantCompras > 0 ? totalGastado / cantCompras : 0;

      socket.emit("response-cliente-detalle", {
        cliente,
        ventas,
        pedidos,
        suscripciones,
        metricas: { totalGastado, cantCompras, ultimaCompra, ticketPromedio },
      });
    } catch (err) {
      console.error("Error request-cliente-detalle:", err);
      socket.emit("response-cliente-detalle", null);
    }
  });

  socket.on("buscar-cliente", async (q) => {
    try {
      if (!q || q.length < 2) return socket.emit("response-buscar-cliente", []);
      const re = new RegExp(q, "i");
      const clientes = await Cliente.find({
        $or: [{ nombre: re }, { apellido: re }, { cuit: re }, { razonSocial: re }, { email: re }, { dni: re }, { whatsapp: re }],
      }, "_id nombre apellido cuit razonSocial dni whatsapp").limit(10).lean();
      socket.emit("response-buscar-cliente", clientes);
    } catch (err) {
      socket.emit("response-buscar-cliente", []);
    }
  });

  // ── Cliente perfil completo (fidelización) ──
  socket.on("request-cliente-perfil", async (clienteId) => {
    try {
      const cliente = await Cliente.findById(clienteId).lean();
      if (!cliente) return socket.emit("response-cliente-perfil", null);

      // Ventas del cliente con productos
      const ventas = await Venta.find({ clienteId })
        .select("-facturaPdf -notaCreditoPdf")
        .sort({ createdAt: -1 }).limit(200).lean();

      // Extraer productos consumidos (de las ventas)
      const productosComprados = [];
      const productoIdsSet = new Set();
      ventas.forEach((v) => {
        (v.productos || []).forEach((p) => {
          if (p._id) productoIdsSet.add(String(p._id));
          productosComprados.push({
            productoId: p._id || null,
            nombre: p.nombre || "—",
            cepa: p.cepa || null,
            bodega: p.bodega || null,
            cantidad: p.carritoCantidad || 1,
            fecha: v.fecha || v.createdAt,
            ventaId: v._id,
          });
        });
      });

      // Valoraciones del cliente
      const valoraciones = await ValoracionVino.find({ clienteId }).lean();
      const valoracionMap = {};
      valoraciones.forEach((val) => { valoracionMap[String(val.productoId)] = val; });

      // Todos los vinos del catálogo para colección de cepas (sin fotos base64 para no saturar el socket)
      const todosVinos = await Product.find({ tipo: "vino" })
        .select("_id nombre cepa bodega").lean();

      // Cepas únicas del catálogo
      const cepasSet = new Set();
      todosVinos.forEach((v) => { if (v.cepa) cepasSet.add(v.cepa); });
      const todasCepas = [...cepasSet].sort();

      // Cepas probadas por el cliente
      const cepasProbadas = new Set();
      const bodegasProbadas = new Set();
      productosComprados.forEach((p) => {
        if (p.cepa) cepasProbadas.add(p.cepa);
        if (p.bodega) bodegasProbadas.add(p.bodega);
      });

      // Colección de cepas
      const coleccionCepas = todasCepas.map((cepa) => ({
        cepa,
        probada: cepasProbadas.has(cepa),
        vinosDisponibles: todosVinos.filter((v) => v.cepa === cepa).length,
        vinosProbados: productosComprados.filter((p) => p.cepa === cepa).length,
      }));

      // Métricas
      const totalGastado = ventas.reduce((s, v) => s + (v.monto || 0), 0);
      const cantCompras = ventas.length;
      const vinosUnicos = productoIdsSet.size;
      const ticketPromedio = cantCompras > 0 ? totalGastado / cantCompras : 0;
      const ultimaCompra = ventas[0]?.createdAt || null;

      // Nivel del cliente
      let nivel, nivelNum;
      if (cantCompras === 0) { nivel = "Nuevo"; nivelNum = 0; }
      else if (cantCompras <= 3) { nivel = "Curioso"; nivelNum = 1; }
      else if (cantCompras <= 10) { nivel = "Explorador"; nivelNum = 2; }
      else if (cantCompras <= 25) { nivel = "Conocedor"; nivelNum = 3; }
      else if (cantCompras <= 50) { nivel = "Sommelier"; nivelNum = 4; }
      else { nivel = "Maestro"; nivelNum = 5; }

      // Preferencias (cepa y bodega más compradas)
      const cepaCount = {};
      const bodegaCount = {};
      productosComprados.forEach((p) => {
        if (p.cepa) cepaCount[p.cepa] = (cepaCount[p.cepa] || 0) + (p.cantidad || 1);
        if (p.bodega) bodegaCount[p.bodega] = (bodegaCount[p.bodega] || 0) + (p.cantidad || 1);
      });
      const cepaFav = Object.entries(cepaCount).sort((a, b) => b[1] - a[1])[0];
      const bodegaFav = Object.entries(bodegaCount).sort((a, b) => b[1] - a[1])[0];

      // Logros con premios
      const logros = [];
      if (cantCompras >= 1) logros.push({ id: "primera_compra", nombre: "Primera Compra", desc: "Realizaste tu primera compra", icono: "bi-bag-check", premio: { tipo: "descuento", valor: 5, descripcion: "5% de descuento en tu proxima compra" } });
      if (cantCompras >= 5) logros.push({ id: "cliente_frecuente", nombre: "Cliente Frecuente", desc: "5 compras realizadas", icono: "bi-arrow-repeat", premio: { tipo: "descuento", valor: 10, descripcion: "10% de descuento en tu proxima compra" } });
      if (cantCompras >= 10) logros.push({ id: "fiel", nombre: "Cliente Fiel", desc: "10 compras realizadas", icono: "bi-heart", premio: { tipo: "vino_gratis", descripcion: "Un vino de regalo a eleccion (hasta $15.000)" } });
      if (cantCompras >= 20) logros.push({ id: "vip", nombre: "VIP", desc: "20 compras realizadas", icono: "bi-star", premio: { tipo: "degustacion_gratis", descripcion: "Degustacion gratuita para 1 persona" } });
      if (vinosUnicos >= 5) logros.push({ id: "explorador_5", nombre: "Explorador", desc: "Probaste 5 vinos diferentes", icono: "bi-compass", premio: { tipo: "descuento", valor: 5, descripcion: "5% en vinos que no hayas probado" } });
      if (vinosUnicos >= 15) logros.push({ id: "explorador_15", nombre: "Gran Explorador", desc: "Probaste 15 vinos diferentes", icono: "bi-binoculars", premio: { tipo: "vino_gratis", descripcion: "Un vino sorpresa de regalo" } });
      if (vinosUnicos >= 50) logros.push({ id: "explorador_50", nombre: "Aventurero", desc: "Probaste 50 vinos diferentes", icono: "bi-globe", premio: { tipo: "degustacion_gratis", descripcion: "Degustacion gratuita para 1 persona" } });
      if (cepasProbadas.size >= 3) logros.push({ id: "cepas_3", nombre: "Multicepas", desc: "Probaste 3 cepas diferentes", icono: "bi-collection", premio: { tipo: "descuento", valor: 5, descripcion: "5% en cepas que no probaste" } });
      if (cepasProbadas.size >= 5) logros.push({ id: "cepas_5", nombre: "Conocedor de Cepas", desc: "Probaste 5 cepas diferentes", icono: "bi-grid-3x3", premio: { tipo: "descuento", valor: 10, descripcion: "10% en cepas que no probaste" } });
      if (cepasProbadas.size >= 15) logros.push({ id: "cepas_15", nombre: "Coleccionista", desc: "Probaste 15 cepas diferentes", icono: "bi-trophy", premio: { tipo: "vino_gratis", descripcion: "Un vino de regalo a eleccion (hasta $15.000)" } });
      if (cepasProbadas.size >= todasCepas.length && todasCepas.length > 0) logros.push({ id: "todas_cepas", nombre: "Maestro de Cepas", desc: "Probaste todas las cepas!", icono: "bi-mortarboard", premio: { tipo: "membresia", descripcion: "Membresia anual al plan basico de Musa" } });
      if (bodegasProbadas.size >= 3) logros.push({ id: "bodegas_3", nombre: "Viajero", desc: "Probaste 3 bodegas diferentes", icono: "bi-geo-alt", premio: { tipo: "descuento", valor: 5, descripcion: "5% en bodegas que no probaste" } });
      if (bodegasProbadas.size >= 8) logros.push({ id: "bodegas_8", nombre: "Trotamundos", desc: "Probaste 8 bodegas diferentes", icono: "bi-map", premio: { tipo: "vino_gratis", descripcion: "Vino de bodega sorpresa de regalo" } });
      if (valoraciones.length >= 1) logros.push({ id: "primera_nota", nombre: "Critico Novato", desc: "Escribiste tu primera nota de cata", icono: "bi-pencil", premio: { tipo: "descuento", valor: 5, descripcion: "5% en tu proxima compra" } });
      if (valoraciones.length >= 5) logros.push({ id: "critico", nombre: "Critico", desc: "5 vinos valorados", icono: "bi-journal-text", premio: { tipo: "descuento", valor: 10, descripcion: "10% en tu proxima compra" } });
      if (valoraciones.length >= 10) logros.push({ id: "gran_critico", nombre: "Gran Critico", desc: "10 vinos valorados", icono: "bi-award", premio: { tipo: "vino_gratis", descripcion: "Un vino a eleccion de regalo" } });

      // Logros posibles (no desbloqueados aún) para mostrar progreso
      const todosLogros = [
        { id: "primera_compra", nombre: "Primera Compra", desc: "Realiza tu primera compra", icono: "bi-bag-check", req: cantCompras >= 1, premio: { tipo: "descuento", valor: 5, descripcion: "5% de descuento en tu proxima compra" } },
        { id: "cliente_frecuente", nombre: "Cliente Frecuente", desc: "5 compras", icono: "bi-arrow-repeat", req: cantCompras >= 5, premio: { tipo: "descuento", valor: 10, descripcion: "10% de descuento en tu proxima compra" } },
        { id: "fiel", nombre: "Cliente Fiel", desc: "10 compras", icono: "bi-heart", req: cantCompras >= 10, premio: { tipo: "vino_gratis", descripcion: "Un vino de regalo a eleccion (hasta $15.000)" } },
        { id: "vip", nombre: "VIP", desc: "20 compras", icono: "bi-star", req: cantCompras >= 20, premio: { tipo: "degustacion_gratis", descripcion: "Degustacion gratuita para 1 persona" } },
        { id: "explorador_5", nombre: "Explorador", desc: "5 vinos diferentes", icono: "bi-compass", req: vinosUnicos >= 5, premio: { tipo: "descuento", valor: 5, descripcion: "5% en vinos que no hayas probado" } },
        { id: "explorador_15", nombre: "Gran Explorador", desc: "15 vinos diferentes", icono: "bi-binoculars", req: vinosUnicos >= 15, premio: { tipo: "vino_gratis", descripcion: "Un vino sorpresa de regalo" } },
        { id: "explorador_50", nombre: "Aventurero", desc: "50 vinos diferentes", icono: "bi-globe", req: vinosUnicos >= 50, premio: { tipo: "degustacion_gratis", descripcion: "Degustacion gratuita para 1 persona" } },
        { id: "cepas_3", nombre: "Multicepas", desc: "3 cepas diferentes", icono: "bi-collection", req: cepasProbadas.size >= 3, premio: { tipo: "descuento", valor: 5, descripcion: "5% en cepas que no probaste" } },
        { id: "cepas_5", nombre: "Conocedor de Cepas", desc: "5 cepas diferentes", icono: "bi-grid-3x3", req: cepasProbadas.size >= 5, premio: { tipo: "descuento", valor: 10, descripcion: "10% en cepas que no probaste" } },
        { id: "cepas_15", nombre: "Coleccionista", desc: "15 cepas diferentes", icono: "bi-trophy", req: cepasProbadas.size >= 15, premio: { tipo: "vino_gratis", descripcion: "Un vino de regalo a eleccion (hasta $15.000)" } },
        { id: "todas_cepas", nombre: "Maestro de Cepas", desc: "Todas las cepas", icono: "bi-mortarboard", req: cepasProbadas.size >= todasCepas.length && todasCepas.length > 0, premio: { tipo: "membresia", descripcion: "Membresia anual al plan basico de Musa" } },
        { id: "bodegas_3", nombre: "Viajero", desc: "3 bodegas", icono: "bi-geo-alt", req: bodegasProbadas.size >= 3, premio: { tipo: "descuento", valor: 5, descripcion: "5% en bodegas que no probaste" } },
        { id: "bodegas_8", nombre: "Trotamundos", desc: "8 bodegas", icono: "bi-map", req: bodegasProbadas.size >= 8, premio: { tipo: "vino_gratis", descripcion: "Vino de bodega sorpresa de regalo" } },
        { id: "primera_nota", nombre: "Critico Novato", desc: "Primera nota de cata", icono: "bi-pencil", req: valoraciones.length >= 1, premio: { tipo: "descuento", valor: 5, descripcion: "5% en tu proxima compra" } },
        { id: "critico", nombre: "Critico", desc: "5 valoraciones", icono: "bi-journal-text", req: valoraciones.length >= 5, premio: { tipo: "descuento", valor: 10, descripcion: "10% en tu proxima compra" } },
        { id: "gran_critico", nombre: "Gran Critico", desc: "10 valoraciones", icono: "bi-award", req: valoraciones.length >= 10, premio: { tipo: "vino_gratis", descripcion: "Un vino a eleccion de regalo" } },
      ];

      // Vinos con valoraciones públicas de otros clientes (para los vinos que el cliente aún no probó)
      const valoracionesPublicas = await ValoracionVino.aggregate([
        { $match: { publica: true } },
        { $group: { _id: "$productoId", promedio: { $avg: "$puntuacion" }, cantidad: { $sum: 1 } } },
      ]);
      const ratingMap = {};
      valoracionesPublicas.forEach((v) => { ratingMap[String(v._id)] = { promedio: Math.round(v.promedio * 10) / 10, cantidad: v.cantidad }; });

      socket.emit("response-cliente-perfil", {
        cliente,
        metricas: { totalGastado, cantCompras, vinosUnicos, ticketPromedio, ultimaCompra },
        nivel, nivelNum,
        preferencias: {
          cepaFavorita: cepaFav ? cepaFav[0] : null,
          bodegaFavorita: bodegaFav ? bodegaFav[0] : null,
          cepasProbadas: cepasProbadas.size,
          totalCepas: todasCepas.length,
        },
        historial: productosComprados.slice(0, 100),
        coleccionCepas,
        logros,
        todosLogros,
        valoraciones,
        valoracionMap,
        ratingMap,
        todosVinos: todosVinos.map((v) => ({
          _id: v._id, nombre: v.nombre, cepa: v.cepa, bodega: v.bodega,
          fotoUrl: `/api/producto-foto/${v._id}`,
          probado: productoIdsSet.has(String(v._id)),
          rating: ratingMap[String(v._id)] || null,
          miValoracion: valoracionMap[String(v._id)] || null,
        })),
      });
    } catch (err) {
      console.error("Error request-cliente-perfil:", err);
      socket.emit("response-cliente-perfil", null);
    }
  });

  // Guardar/actualizar valoración de vino de un cliente
  socket.on("guardar-valoracion-vino", async (data, cb) => {
    try {
      const { clienteId, productoId, puntuacion, notas, publica } = data;
      if (!clienteId || !productoId) return;
      const val = await ValoracionVino.findOneAndUpdate(
        { clienteId, productoId },
        { puntuacion, notas, publica: publica || false },
        { upsert: true, new: true }
      );
      if (typeof cb === "function") cb({ ok: true, valoracion: val });
    } catch (err) {
      console.error("Error guardar-valoracion-vino:", err);
      if (typeof cb === "function") cb({ error: err.message });
    }
  });

  // Obtener valoraciones públicas de un producto
  socket.on("request-valoraciones-producto", async (productoId) => {
    try {
      const vals = await ValoracionVino.find({ productoId, publica: true })
        .sort({ createdAt: -1 }).limit(50).lean();
      // Enriquecer con nombre de cliente
      const clienteIds = [...new Set(vals.map((v) => String(v.clienteId)))];
      const clientes = await Cliente.find({ _id: { $in: clienteIds } }).select("nombre apellido").lean();
      const clienteMap = {};
      clientes.forEach((c) => { clienteMap[String(c._id)] = `${c.nombre}${c.apellido ? " " + c.apellido : ""}`; });
      socket.emit("response-valoraciones-producto", vals.map((v) => ({
        ...v,
        clienteNombre: clienteMap[String(v.clienteId)] || "Anonimo",
      })));
    } catch (err) {
      socket.emit("response-valoraciones-producto", []);
    }
  });

  // ── Buscar clientes (predictivo para carrito) ──
  socket.on("buscar-clientes", async (query) => {
    try {
      if (!query || query.trim().length < 2) return socket.emit("resultado-buscar-clientes", []);
      const regex = new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const clientes = await Cliente.find({
        $or: [
          { nombre: regex },
          { apellido: regex },
          { dni: regex },
          { email: regex },
          { whatsapp: regex },
        ],
      })
        .select("nombre apellido dni whatsapp email")
        .limit(8)
        .lean();
      socket.emit("resultado-buscar-clientes", clientes);
    } catch (err) {
      console.error("Error buscar-clientes:", err);
      socket.emit("resultado-buscar-clientes", []);
    }
  });

  // ── Registrar cliente rapido solo con DNI (desde admin carrito) ──
  socket.on("registrar-cliente-dni", async (dni, callback) => {
    try {
      if (!dni || dni.trim().length < 3) return callback?.({ error: "DNI invalido" });
      const existente = await Cliente.findOne({ dni: dni.trim() }).lean();
      if (existente) return callback?.({ ok: true, cliente: existente });

      const nuevo = new Cliente({
        dni: dni.trim(),
        tags: ["auto-registro"],
        autoRegistro: true,
      });
      await nuevo.save();
      io.emit("cambios-clientes");
      callback?.({ ok: true, cliente: nuevo.toObject() });
    } catch (err) {
      console.error("Error registrar-cliente-dni:", err);
      callback?.({ error: "Error al registrar cliente" });
    }
  });

  // ── Sugerencias de clientes ──
  socket.on("request-sugerencias-clientes", async (filtro) => {
    try {
      const query = {};
      if (filtro?.estado) query.estado = filtro.estado;
      const sugerencias = await SugerenciaCliente.find(query).sort({ createdAt: -1 }).limit(100).lean();
      socket.emit("response-sugerencias-clientes", sugerencias);
    } catch (err) {
      console.error("Error request-sugerencias-clientes:", err);
      socket.emit("response-sugerencias-clientes", []);
    }
  });

  socket.on("responder-sugerencia", async (data) => {
    try {
      const { sugerenciaId, respuesta } = data;
      await SugerenciaCliente.findByIdAndUpdate(sugerenciaId, {
        respuesta,
        estado: "respondido",
        respondidoPor: socket.usuario?.nombre || "Admin",
      });
      io.emit("cambios");
    } catch (err) {
      console.error("Error responder-sugerencia:", err);
    }
  });

  socket.on("marcar-sugerencia-leida", async (sugerenciaId) => {
    try {
      await SugerenciaCliente.findByIdAndUpdate(sugerenciaId, { estado: "leido" });
    } catch (err) {
      console.error("Error marcar-sugerencia-leida:", err);
    }
  });

  // ── Estado de servicios ──
  socket.on("request-status-servicios", () => {
    const servicios = {
      mongodb: {
        nombre: "MongoDB",
        estado: mongoose.connection.readyState === 1 ? "conectado" : "desconectado",
      },
      afip: {
        nombre: "AFIP (Facturacion)",
        estado: afipService ? "configurado" : "no configurado",
      },
      mercadopago: {
        nombre: "Mercado Pago",
        estado: mpClient ? "configurado" : "no configurado",
      },
      whatsapp: {
        nombre: "WhatsApp",
        estado: waStatus,
      },
      ia: {
        nombre: "IA (Descripciones / OCR)",
        estado: process.env.ANTHROPIC_API_KEY
          ? "Anthropic"
          : process.env.OPENAI_API_KEY
          ? "OpenAI"
          : "no configurado",
      },
    };
    socket.emit("response-status-servicios", servicios);
  });

  // ── Fotos de perfil (para chat) — solo envía { nombre: userId }, las fotos se sirven por HTTP con cache ──
  socket.on("request-usuarios-fotos", async () => {
    try {
      const usuarios = await Usuario.find({}, "nombre foto").lean();
      const map = {};
      for (const u of usuarios) {
        if (u.foto) map[u.nombre] = String(u._id);
      }
      socket.emit("response-usuarios-fotos", map);
    } catch (err) {
      socket.emit("response-usuarios-fotos", {});
    }
  });

  // ── Chat Interno ──

  socket.on("request-mensajes-internos", async (params) => {
    try {
      const { search, categoria, tipo, estado, page } = params || {};
      const pageSize = 50;
      const pageNumber = page || 1;
      let filter = {};

      if (search) {
        const searchRegex = { $regex: search, $options: "i" };
        filter.$or = [
          { texto: searchRegex },
          { usuario: searchRegex },
          { asignadoA: searchRegex },
        ];
      }
      if (categoria) filter.categoria = categoria;
      if (tipo) filter.tipo = tipo;
      if (estado) filter.estado = estado;

      const mensajes = await MensajeInterno.find(filter)
        .sort({ fijado: -1, createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .lean();

      const total = await MensajeInterno.countDocuments(filter);
      let totalPages = Math.ceil(total / pageSize);
      if (totalPages === 0) totalPages = 1;

      socket.emit("response-mensajes-internos", { mensajes, total, totalPages });
    } catch (err) {
      console.error("Error request-mensajes-internos:", err);
      socket.emit("response-mensajes-internos", { mensajes: [], total: 0, totalPages: 1 });
    }
  });

  socket.on("guardar-mensaje-interno", async (data, callback) => {
    try {
      if (data._id) {
        await MensajeInterno.findByIdAndUpdate(data._id, {
          texto: data.texto,
          tipo: data.tipo,
          categoria: data.categoria,
          asignadoA: data.asignadoA,
          asignadoAId: data.asignadoAId,
        });
      } else {
        await MensajeInterno.create(data);
      }
      io.emit("cambios-chat");
      if (typeof callback === "function") callback({ ok: true });
    } catch (err) {
      console.error("Error guardar-mensaje-interno:", err.message);
      if (typeof callback === "function") callback({ error: err.message });
    }
  });

  socket.on("responder-mensaje-interno", async ({ mensajeId, respuesta }) => {
    try {
      await MensajeInterno.findByIdAndUpdate(mensajeId, {
        $push: { respuestas: respuesta },
      });
      io.emit("cambios-chat");
    } catch (err) {
      console.error("Error responder-mensaje-interno:", err);
    }
  });

  socket.on("cambiar-estado-mensaje", async ({ mensajeId, estado, usuario, usuarioId }) => {
    try {
      const update = { estado };
      if (estado === "en_proceso" && usuario) {
        update.asignadoA = usuario;
        update.asignadoAId = usuarioId;
      }
      await MensajeInterno.findByIdAndUpdate(mensajeId, update);
      io.emit("cambios-chat");
    } catch (err) {
      console.error("Error cambiar-estado-mensaje:", err);
    }
  });

  socket.on("fijar-mensaje-interno", async (mensajeId) => {
    try {
      const msg = await MensajeInterno.findById(mensajeId);
      if (msg) {
        msg.fijado = !msg.fijado;
        await msg.save();
        io.emit("cambios-chat");
      }
    } catch (err) {
      console.error("Error fijar-mensaje-interno:", err);
    }
  });

  socket.on("borrar-mensaje-interno", async (mensajeId) => {
    try {
      if (!requireAuth(socket)) return;
      await MensajeInterno.findByIdAndDelete(mensajeId);
      io.emit("cambios-chat");
    } catch (err) {
      console.error("Error borrar-mensaje-interno:", err);
    }
  });

  socket.on("borrar-respuesta-mensaje", async ({ mensajeId, respuestaId }) => {
    try {
      if (!requireAdmin(socket)) return;
      await MensajeInterno.findByIdAndUpdate(mensajeId, {
        $pull: { respuestas: { _id: respuestaId } },
      });
      io.emit("cambios-chat");
    } catch (err) {
      console.error("Error borrar-respuesta-mensaje:", err);
    }
  });

  // ── Media TV (Vidriera) handlers ──
  socket.on("request-media-tv", async () => {
    try {
      const medios = await MediaTV.find().sort({ orden: 1 }).select("-archivo");
      socket.emit("response-media-tv", medios);
    } catch (err) {
      console.error("Error request-media-tv:", err);
      socket.emit("response-media-tv", []);
    }
  });

  socket.on("request-media-tv-public", async () => {
    try {
      const medios = await MediaTV.find({ activo: true }).sort({ orden: 1 }).select("nombre orden duracion rotacion");
      socket.emit("response-media-tv-public", medios);
    } catch (err) {
      socket.emit("response-media-tv-public", []);
    }
  });

  socket.on("eliminar-media-tv", async (mediaId) => {
    try {
      if (!requireAdmin(socket)) return;
      await MediaTV.findByIdAndDelete(mediaId);
      io.emit("cambios-media-tv");
    } catch (err) {
      console.error("Error eliminar-media-tv:", err);
    }
  });

  socket.on("reordenar-media-tv", async (items) => {
    try {
      if (!requireAuth(socket)) return;
      for (const item of items) {
        await MediaTV.findByIdAndUpdate(item._id, { orden: item.orden });
      }
      io.emit("cambios-media-tv");
    } catch (err) {
      console.error("Error reordenar-media-tv:", err);
    }
  });

  socket.on("toggle-media-tv", async (mediaId) => {
    try {
      if (!requireAuth(socket)) return;
      const doc = await MediaTV.findById(mediaId);
      if (doc) {
        doc.activo = !doc.activo;
        await doc.save();
        io.emit("cambios-media-tv");
      }
    } catch (err) {
      console.error("Error toggle-media-tv:", err);
    }
  });

  socket.on("actualizar-duracion-media-tv", async ({ mediaId, duracion }) => {
    try {
      if (!requireAuth(socket)) return;
      await MediaTV.findByIdAndUpdate(mediaId, { duracion });
      io.emit("cambios-media-tv");
    } catch (err) {
      console.error("Error actualizar-duracion-media-tv:", err);
    }
  });

  socket.on("rotar-media-tv", async (mediaId) => {
    try {
      if (!requireAuth(socket)) return;
      const doc = await MediaTV.findById(mediaId);
      if (doc) {
        const ciclo = [0, 90, 180, 270];
        const idx = ciclo.indexOf(doc.rotacion || 0);
        doc.rotacion = ciclo[(idx + 1) % 4];
        await doc.save();
        io.emit("cambios-media-tv");
      }
    } catch (err) {
      console.error("Error rotar-media-tv:", err);
    }
  });

  // Config TV (destello, etc.)
  socket.on("request-config-tv", async () => {
    try {
      const cfg = await mongoose.connection.collection("tvconfig").findOne({ _id: "main" });
      socket.emit("response-config-tv", { destello: cfg?.destello ?? true });
    } catch (err) {
      socket.emit("response-config-tv", { destello: true });
    }
  });

  socket.on("toggle-destello-tv", async () => {
    try {
      const cfg = await mongoose.connection.collection("tvconfig").findOne({ _id: "main" });
      const nuevoValor = !(cfg?.destello ?? true);
      await mongoose.connection.collection("tvconfig").updateOne(
        { _id: "main" },
        { $set: { destello: nuevoValor } },
        { upsert: true }
      );
      io.emit("cambios-config-tv", { destello: nuevoValor });
    } catch (err) {
      console.error("Error toggle-destello-tv:", err);
    }
  });

  // ── Web Tienda Admin handlers ──
  socket.on("request-pedidos-web", async ({ estado, search, page = 1, limit = 20 } = {}) => {
    try {
      const query = {};
      if (estado) query.estado = estado;
      if (search) {
        const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        query.$or = [{ "cliente.nombre": re }, { "cliente.email": re }, { "cliente.telefono": re }];
      }
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(50, parseInt(limit) || 20);
      const [pedidos, total] = await Promise.all([
        PedidoWeb.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
        PedidoWeb.countDocuments(query),
      ]);
      socket.emit("response-pedidos-web", { pedidos, total, page: pageNum, totalPages: Math.ceil(total / limitNum) || 1 });
    } catch (err) {
      console.error("Error request-pedidos-web:", err);
      socket.emit("response-pedidos-web", { pedidos: [], total: 0, page: 1, totalPages: 1 });
    }
  });

  socket.on("update-estado-pedido-web", async ({ pedidoId, estado }, cb) => {
    try {
      const pedido = await PedidoWeb.findById(pedidoId);
      if (!pedido) return cb?.({ error: "Pedido no encontrado" });

      const estadoAnterior = pedido.estado;

      // Bloquear confirmacion si el pago no esta aprobado (cuando usa MP)
      if (estado === "confirmado" && estadoAnterior === "pendiente" && pedido.mpPreferenceId && pedido.mpStatus !== "approved") {
        return cb?.({ error: "No se puede confirmar: el pago no esta aprobado" });
      }

      pedido.estado = estado;

      // Si se confirma y no estaba confirmado, descontar stock
      if (estado === "confirmado" && estadoAnterior === "pendiente") {
        for (const item of pedido.items) {
          await Product.findByIdAndUpdate(item.productoId, { $inc: { cantidad: -item.cantidad } });
        }
      }

      // Si se cancela y estaba confirmado+, devolver stock
      if (estado === "cancelado" && ["confirmado", "preparando", "listo"].includes(estadoAnterior)) {
        for (const item of pedido.items) {
          await Product.findByIdAndUpdate(item.productoId, { $inc: { cantidad: item.cantidad } });
        }
      }

      // Si se cancela y tiene envio logistico, cancelar en el proveedor
      if (estado === "cancelado" && pedido.logisticaEnvioId && pedido.logisticaProveedor !== "fijo") {
        try {
          const config = await ConfigTienda.findById("main").lean();
          if (config) {
            await cancelarEnvioLogistica(config, pedido);
            pedido.logisticaEstado = "cancelled";
            console.log(`[Logistica] Cancelado envio ${pedido.logisticaEnvioId} en ${pedido.logisticaProveedor}`);
          }
        } catch (cancelErr) {
          console.error("Error cancelando envio logistica:", cancelErr.message);
        }
      }

      // Si pasa a "enviado" y tiene logistica integrada, crear envio
      if (estado === "enviado" && pedido.entrega === "envio" && pedido.opcionEnvio && !pedido.logisticaEnvioId) {
        try {
          const config = await ConfigTienda.findById("main").lean();
          if (config) {
            const resultado = await crearEnvioLogistica(config, {
              destino: {
                nombre: pedido.cliente.nombre,
                apellido: pedido.cliente.apellido || "",
                direccion: pedido.cliente.direccion,
                calle: pedido.cliente.calle,
                numero: pedido.cliente.numero,
                pisoDepto: pedido.cliente.pisoDepto,
                localidad: pedido.cliente.localidad,
                codigoPostal: pedido.cliente.codigoPostal,
                ciudad: pedido.cliente.localidad || "CABA",
                provincia: "CABA",
                email: pedido.cliente.email,
                telefono: pedido.cliente.telefono,
              },
              items: pedido.items,
              referencia: String(pedido.numeroPedido),
              opcionElegida: pedido.opcionEnvio,
            });
            pedido.logisticaEnvioId = resultado.envioId;
            pedido.logisticaTracking = resultado.tracking;
            pedido.logisticaProveedor = resultado.proveedor;
            pedido.logisticaEstado = resultado.estado;
          }
        } catch (logErr) {
          console.error("Error creando envio logistica:", logErr.message);
          // No bloquea el cambio de estado
        }
      }

      await pedido.save();
      cb?.({ ok: true, tracking: pedido.logisticaTracking, proveedor: pedido.logisticaProveedor });
      io.emit("cambios-web");
      io.emit("cambios");

      // Notificar al cliente por WhatsApp si el pedido es envio
      if (pedido.entrega === "envio" && estado !== estadoAnterior) {
        try {
          const configWA = await ConfigTienda.findById("main").lean();
          if (configWA?.notificacionesEnvioWA && waStatus === "connected" && waSocket && pedido.cliente?.telefono) {
            const WA_MSGS = {
              preparando: `Hola ${pedido.cliente.nombre}! 🍷\nTu pedido #${pedido.numeroPedido} se esta preparando para el envio.\nTe avisamos cuando el rider lo retire!`,
              enviado: `Hola ${pedido.cliente.nombre}! 🚴\nTu pedido #${pedido.numeroPedido} ya esta en camino!${pedido.logisticaTracking ? `\nSeguilo aca: ${pedido.logisticaTracking}` : "\nTe avisamos cuando este por llegar."}`,
              entregado: `Hola ${pedido.cliente.nombre}! ✅\nTu pedido #${pedido.numeroPedido} fue entregado.\nGracias por tu compra! Esperamos que lo disfrutes 🥂`,
              cancelado: `Hola ${pedido.cliente.nombre},\nTu envio del pedido #${pedido.numeroPedido} fue cancelado.\nSi tenes dudas contactanos por este medio.`,
            };
            const msg = WA_MSGS[estado];
            if (msg) {
              const jid = pedido.cliente.telefono.replace(/\D/g, "") + "@s.whatsapp.net";
              await waSocket.sendMessage(jid, { text: msg });
              console.log(`[WA Envio] Notificacion "${estado}" enviada a ${pedido.cliente.telefono} para pedido #${pedido.numeroPedido}`);
            }
          }
        } catch (waErr) {
          console.error("[WA Envio] Error enviando notificacion:", waErr.message);
        }
      }
    } catch (err) {
      console.error("Error update-estado-pedido-web:", err);
      cb?.({ error: "Error al actualizar estado" });
    }
  });

  // Consultar estado de envio en el proveedor logistico
  socket.on("consultar-estado-envio", async ({ pedidoId }, cb) => {
    try {
      const pedido = await PedidoWeb.findById(pedidoId);
      if (!pedido) return cb?.({ error: "Pedido no encontrado" });
      if (!pedido.logisticaEnvioId || pedido.logisticaProveedor === "fijo") {
        return cb?.({ error: "Este pedido no tiene envio logistico" });
      }
      const config = await ConfigTienda.findById("main").lean();
      if (!config) return cb?.({ error: "Config no encontrada" });

      const estado = await consultarEstadoEnvio(config, pedido);
      if (!estado) return cb?.({ error: "No se pudo consultar el estado" });

      // Actualizar tracking si cambio
      if (estado.tracking && estado.tracking !== pedido.logisticaTracking) {
        pedido.logisticaTracking = estado.tracking;
      }
      pedido.logisticaEstado = estado.estadoShipnow || estado.estadoPedidosYa || pedido.logisticaEstado;
      await pedido.save();

      cb?.({ ok: true, estado });
    } catch (err) {
      console.error("Error consultar-estado-envio:", err);
      cb?.({ error: "Error al consultar estado" });
    }
  });

  // Registrar webhook de ShipNow
  socket.on("registrar-shipnow-webhook", async ({ webhookUrl }, cb) => {
    try {
      const config = await ConfigTienda.findById("main").lean();
      if (!config?.shipnowToken) return cb?.({ error: "Token de Shipnow no configurado" });
      const result = await shipnowCreateWebhook(config.shipnowToken, webhookUrl);
      await ConfigTienda.findByIdAndUpdate("main", { $set: { shipnowWebhookId: String(result.id) } });
      cb?.({ ok: true, webhookId: result.id });
    } catch (err) {
      console.error("Error registrar-shipnow-webhook:", err);
      cb?.({ error: err.message });
    }
  });

  // ── PedidosYa Envios propios ──

  // Estimar envio propio (no vinculado a pedido web)
  socket.on("pedidosya-estimar", async (data, cb) => {
    try {
      const config = await ConfigTienda.findById("main").lean();
      if (!config?.pedidosyaActivo || !config.pedidosyaClientId) return cb?.({ error: "PedidosYa no esta configurado" });
      const origen = config.origenEnvio || {};
      const opciones = await pedidosyaEstimar(config, {
        origen,
        destino: data.destino,
        items: data.items || [{ cantidad: 1, precioUnitario: 0, nombre: "Paquete" }],
      });
      cb?.({ ok: true, opciones });
    } catch (err) {
      console.error("Error pedidosya-estimar:", err);
      cb?.({ error: err.message });
    }
  });

  // Crear envio propio con PedidosYa
  socket.on("pedidosya-crear-envio", async (data, cb) => {
    try {
      const config = await ConfigTienda.findById("main").lean();
      if (!config?.pedidosyaActivo || !config.pedidosyaClientId) return cb?.({ error: "PedidosYa no esta configurado" });
      const origen = config.origenEnvio || {};
      const resultado = await pedidosyaCrearEnvio(config, {
        origen,
        destino: data.destino,
        items: data.items || [],
        referencia: data.referencia || `PYA-${Date.now()}`,
      });
      cb?.({ ok: true, envio: resultado });
    } catch (err) {
      console.error("Error pedidosya-crear-envio:", err);
      cb?.({ error: err.message });
    }
  });

  // Consultar estado de envio PedidosYa
  socket.on("pedidosya-estado-envio", async ({ envioId }, cb) => {
    try {
      const config = await ConfigTienda.findById("main").lean();
      if (!config?.pedidosyaActivo || !config.pedidosyaClientId) return cb?.({ error: "PedidosYa no esta configurado" });
      const envio = await pedidosyaGetEnvio(config, envioId);
      if (!envio) return cb?.({ error: "Envio no encontrado" });
      cb?.({
        ok: true,
        envio: {
          id: envio.id,
          status: envio.status,
          estadoInterno: PEDIDOSYA_ESTADO_MAP[envio.status] || envio.status,
          trackingUrl: envio.trackingUrl || null,
          rider: envio.courier ? {
            nombre: envio.courier.name,
            telefono: envio.courier.phone,
            foto: envio.courier.pictureUrl,
          } : null,
          waypoints: envio.waypoints || [],
          createdAt: envio.createdAt,
        },
      });
    } catch (err) {
      console.error("Error pedidosya-estado-envio:", err);
      cb?.({ error: err.message });
    }
  });

  // Cancelar envio PedidosYa
  socket.on("pedidosya-cancelar-envio", async ({ envioId }, cb) => {
    try {
      const config = await ConfigTienda.findById("main").lean();
      if (!config?.pedidosyaActivo || !config.pedidosyaClientId) return cb?.({ error: "PedidosYa no esta configurado" });
      await pedidosyaCancelarEnvio(config, envioId);
      cb?.({ ok: true });
    } catch (err) {
      console.error("Error pedidosya-cancelar-envio:", err);
      cb?.({ error: err.message });
    }
  });

  socket.on("request-config-tienda", async () => {
    try {
      let config = await ConfigTienda.findById("main").lean();
      if (!config) config = (await ConfigTienda.create({ _id: "main" })).toObject();
      socket.emit("response-config-tienda", config);
    } catch (err) {
      console.error("Error request-config-tienda:", err);
      socket.emit("response-config-tienda", {});
    }
  });

  socket.on("update-config-tienda", async (data, cb) => {
    try {
      const { _id, __v, createdAt, updatedAt, ...updates } = data;
      await ConfigTienda.findByIdAndUpdate("main", { $set: updates }, { upsert: true });
      cb?.({ ok: true });
    } catch (err) {
      console.error("Error update-config-tienda:", err);
      cb?.({ error: "Error al guardar configuracion" });
    }
  });

  socket.on("upload-foto-evento-galeria", async (base64, cb) => {
    try {
      if (!base64) return cb?.({ error: "Sin imagen" });
      const url = await uploadBase64(base64, "musa/eventos-galeria");
      await ConfigTienda.findByIdAndUpdate("main", { $push: { fotosEventos: url } }, { upsert: true });
      const config = await ConfigTienda.findById("main").lean();
      cb?.({ ok: true, fotosEventos: config.fotosEventos });
    } catch (err) {
      console.error("Error upload-foto-evento-galeria:", err);
      cb?.({ error: "Error al subir foto" });
    }
  });

  socket.on("borrar-foto-evento-galeria", async (url, cb) => {
    try {
      await deleteByUrl(url);
      await ConfigTienda.findByIdAndUpdate("main", { $pull: { fotosEventos: url } });
      const config = await ConfigTienda.findById("main").lean();
      cb?.({ ok: true, fotosEventos: config.fotosEventos });
    } catch (err) {
      console.error("Error borrar-foto-evento-galeria:", err);
      cb?.({ error: "Error al borrar foto" });
    }
  });

  socket.on("request-web-dashboard", async () => {
    try {
      const hoy = moment().tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");
      const inicioHoy = new Date(hoy + "T00:00:00-03:00");

      const [totalPedidos, pendientes, pedidosHoy, ingresosTotal, ingresosHoy, ultimos] = await Promise.all([
        PedidoWeb.countDocuments({ estado: { $ne: "cancelado" } }),
        PedidoWeb.countDocuments({ estado: { $in: ["pendiente", "confirmado", "preparando", "listo"] } }),
        PedidoWeb.countDocuments({ createdAt: { $gte: inicioHoy }, estado: { $ne: "cancelado" } }),
        PedidoWeb.aggregate([
          { $match: { estado: { $nin: ["cancelado", "pendiente"] } } },
          { $group: { _id: null, total: { $sum: "$montoTotal" } } },
        ]),
        PedidoWeb.aggregate([
          { $match: { createdAt: { $gte: inicioHoy }, estado: { $nin: ["cancelado", "pendiente"] } } },
          { $group: { _id: null, total: { $sum: "$montoTotal" } } },
        ]),
        PedidoWeb.find({ estado: { $ne: "cancelado" } }).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      socket.emit("response-web-dashboard", {
        totalPedidos,
        pendientes,
        pedidosHoy,
        ingresosTotal: ingresosTotal[0]?.total || 0,
        ingresosHoy: ingresosHoy[0]?.total || 0,
        ultimos,
      });
    } catch (err) {
      console.error("Error request-web-dashboard:", err);
      socket.emit("response-web-dashboard", { totalPedidos: 0, pendientes: 0, pedidosHoy: 0, ingresosTotal: 0, ingresosHoy: 0, ultimos: [] });
    }
  });

  // ── Club de Vinos - Admin ──
  socket.on("request-planes-club", async () => {
    try {
      const planes = await PlanClub.find().sort({ orden: 1 }).lean();
      socket.emit("response-planes-club", planes);
    } catch (err) {
      console.error("Error request-planes-club:", err);
      socket.emit("response-planes-club", []);
    }
  });

  socket.on("save-plan-club", async (data, cb) => {
    try {
      if (data._id) {
        await PlanClub.findByIdAndUpdate(data._id, data);
      } else {
        await new PlanClub(data).save();
      }
      const planes = await PlanClub.find().sort({ orden: 1 }).lean();
      io.emit("response-planes-club", planes);
      if (cb) cb({ ok: true });
    } catch (err) {
      console.error("Error save-plan-club:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("delete-plan-club", async (id, cb) => {
    try {
      await PlanClub.findByIdAndDelete(id);
      const planes = await PlanClub.find().sort({ orden: 1 }).lean();
      io.emit("response-planes-club", planes);
      if (cb) cb({ ok: true });
    } catch (err) {
      console.error("Error delete-plan-club:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("request-suscripciones-club", async (filtros = {}) => {
    try {
      const query = {};
      if (filtros.estado) query.estado = filtros.estado;
      if (filtros.search) {
        const re = new RegExp(filtros.search, "i");
        query.$or = [{ "cliente.nombre": re }, { "cliente.email": re }, { planNombre: re }];
      }
      const suscripciones = await SuscripcionClub.find(query).sort({ createdAt: -1 }).lean();
      socket.emit("response-suscripciones-club", suscripciones);
    } catch (err) {
      console.error("Error request-suscripciones-club:", err);
      socket.emit("response-suscripciones-club", []);
    }
  });

  socket.on("update-estado-suscripcion", async ({ id, estado }, cb) => {
    try {
      await SuscripcionClub.findByIdAndUpdate(id, { estado });
      const suscripciones = await SuscripcionClub.find().sort({ createdAt: -1 }).lean();
      io.emit("response-suscripciones-club", suscripciones);
      if (cb) cb({ ok: true });
    } catch (err) {
      console.error("Error update-estado-suscripcion:", err);
      if (cb) cb({ error: err.message });
    }
  });

  // ── Usuarios CRUD (admin) ──
  socket.on("request-usuarios", async (data = {}) => {
    try {
      const { page = 1, search = "" } = data;
      const limit = 20;
      const query = {};
      if (search) {
        query.$or = [
          { nombre: { $regex: search, $options: "i" } },
          { username: { $regex: search, $options: "i" } },
        ];
      }
      const total = await Usuario.countDocuments(query);
      const usuarios = await Usuario.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      socket.emit("response-usuarios", { usuarios, totalPages: Math.ceil(total / limit) || 1 });
    } catch (err) {
      console.error("Error request-usuarios:", err);
      socket.emit("response-usuarios", { usuarios: [], totalPages: 1 });
    }
  });

  socket.on("guardar-usuario", async (data, cb) => {
    try {
      if (!requireAdmin(socket)) {
        if (cb) cb({ error: "No autorizado" });
        return;
      }
      if (data._id) {
        const { _id, password, ...fields } = data;
        if (password && password.trim()) {
          fields.password = await bcrypt.hash(password.trim(), 10);
        }
        await Usuario.findByIdAndUpdate(_id, fields);
      } else {
        if (!data.password) return;
        const hashed = await bcrypt.hash(data.password, 10);
        await Usuario.create({ ...data, password: hashed });
      }
      io.emit("cambios");
      if (cb) cb({ ok: true });
    } catch (err) {
      console.error("Error guardar-usuario:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("eliminar-usuario", async (id, cb) => {
    try {
      if (!requireAdmin(socket)) {
        if (cb) cb({ error: "No autorizado" });
        return;
      }
      if (socket.usuario._id.toString() === id) {
        if (cb) cb({ error: "No podes eliminarte a vos mismo" });
        return;
      }
      await Usuario.findByIdAndDelete(id);
      io.emit("cambios");
      if (cb) cb({ ok: true });
    } catch (err) {
      console.error("Error eliminar-usuario:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("toggle-usuario-activo", async (id) => {
    try {
      const u = await Usuario.findById(id);
      if (!u) return;
      u.activo = !u.activo;
      await u.save();
      io.emit("cambios");
    } catch (err) {
      console.error("Error toggle-usuario-activo:", err);
    }
  });

  socket.on("cambiar-clave-usuario", async ({ id, nuevaClave }) => {
    try {
      if (!id || !nuevaClave || !nuevaClave.trim()) return;
      const hashed = await bcrypt.hash(nuevaClave.trim(), 10);
      await Usuario.findByIdAndUpdate(id, { password: hashed });
      io.emit("cambios");
    } catch (err) {
      console.error("Error cambiar-clave-usuario:", err);
    }
  });

  // ── Cleanup al desconectar ──
  socket.on("disconnect", () => {
    socket.removeAllListeners();
  });

});

const PORT = process.env.PORT || 5000;

// Migración: borrar pagos sin collectorId para forzar re-sync, luego reclasificar
(async () => {
  try {
    const sinCollector = await PagoMp.deleteMany({ $or: [{ collectorId: null }, { collectorId: { $exists: false } }] });
    if (sinCollector.deletedCount) console.log(`Migración PagoMp: borrados ${sinCollector.deletedCount} pagos sin collectorId (se re-sincronizarán)`);
    // Borrar pagos sin pagador.id para forzar re-sync con el nuevo campo
    const sinPagadorId = await PagoMp.deleteMany({ $or: [{ "pagador.id": null }, { "pagador.id": { $exists: false } }] });
    if (sinPagadorId.deletedCount) console.log(`Migración PagoMp: borrados ${sinPagadorId.deletedCount} pagos sin pagador.id (se re-sincronizarán)`);
    // Reclasificar: payout = cobro (transferencias bancarias recibidas)
    const r1 = await PagoMp.updateMany(
      { operationType: "payout", tipoMovimiento: "gasto", tipoManual: { $ne: true } },
      { $set: { tipoMovimiento: "cobro" } },
    );
    if (r1.modifiedCount) console.log(`Migración PagoMp: ${r1.modifiedCount} payout → cobro`);
    // Reclasificar: Bank Transfer = cobro (transferencias bancarias recibidas)
    const r1b = await PagoMp.updateMany(
      { descripcion: "Bank Transfer", tipoMovimiento: "gasto", tipoManual: { $ne: true } },
      { $set: { tipoMovimiento: "cobro" } },
    );
    if (r1b.modifiedCount) console.log(`Migración PagoMp: ${r1b.modifiedCount} Bank Transfer → cobro`);
    // Reclasificar: descripcion "Pago: ..." = gasto
    const r2 = await PagoMp.updateMany(
      { descripcion: { $regex: /^Pago:/i }, tipoMovimiento: { $ne: "gasto" } },
      { $set: { tipoMovimiento: "gasto", comisionMp: 0, retenciones: 0 } },
    );
    if (r2.modifiedCount) console.log(`Migración PagoMp: ${r2.modifiedCount} "Pago:..." → gasto`);
    // Reclasificar pagos donde nosotros somos el pagador → gasto
    const ownId = await getOwnMpCollectorId();
    if (ownId) {
      const r3 = await PagoMp.updateMany(
        { "pagador.id": ownId, tipoMovimiento: { $ne: "gasto" } },
        { $set: { tipoMovimiento: "gasto", comisionMp: 0, retenciones: 0 } },
      );
      if (r3.modifiedCount) console.log(`Migración PagoMp: ${r3.modifiedCount} pagos propios → gasto`);
    }
    // Fix: rechazados/cancelados no deben tener comisiones ni retenciones
    const r4 = await PagoMp.updateMany(
      { estado: { $in: ["rejected", "cancelled", "refunded", "charged_back"] }, $or: [{ comisionMp: { $ne: 0 } }, { retenciones: { $ne: 0 } }] },
      { $set: { comisionMp: 0, retenciones: 0 } },
    );
    if (r4.modifiedCount) console.log(`Migración PagoMp: ${r4.modifiedCount} rechazados/cancelados → comisiones y retenciones = 0`);
  } catch (err) { console.error("Error migración PagoMp:", err); }
})();

// ── Sync rendimientos MP (settlement report) ──
async function syncRendimientosMp(fecha) {
  // fecha = "YYYY-MM-DD" del día a consultar
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return;

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const baseUrl = "https://api.mercadopago.com/v1/account/settlement_report";

  try {
    // 1. Generar reporte para el día
    const beginDate = `${fecha}T00:00:00Z`;
    const endDate = `${fecha}T23:59:59Z`;
    const genRes = await fetch(`${baseUrl}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ begin_date: beginDate, end_date: endDate }),
    });
    if (!genRes.ok) {
      const errText = await genRes.text();
      console.log(`[Rendimientos MP] Error generando reporte para ${fecha}: ${genRes.status} ${errText}`);
      return;
    }
    const genData = await genRes.json();
    const fileName = genData.file_name;
    if (!fileName) {
      console.log(`[Rendimientos MP] No se obtuvo file_name para ${fecha}:`, genData);
      return;
    }
    console.log(`[Rendimientos MP] Reporte solicitado: ${fileName}`);

    // 2. Esperar a que esté listo (poll cada 10s, max 5 min)
    let csvText = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      const dlRes = await fetch(`${baseUrl}/${fileName}`, { headers });
      if (dlRes.ok) {
        csvText = await dlRes.text();
        break;
      }
      if (dlRes.status !== 404 && dlRes.status !== 202) {
        console.log(`[Rendimientos MP] Error descargando ${fileName}: ${dlRes.status}`);
        return;
      }
    }
    if (!csvText) {
      console.log(`[Rendimientos MP] Timeout esperando reporte ${fileName}`);
      return;
    }

    // 3. Parsear CSV y buscar rendimientos
    const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return;
    const headerRow = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const colIdx = (name) => headerRow.indexOf(name);

    const iDesc = colIdx("DESCRIPTION");
    const iCredit = colIdx("NET_CREDIT_AMOUNT");
    const iDebit = colIdx("NET_DEBIT_AMOUNT");
    const iDate = colIdx("DATE");
    const iSourceId = colIdx("SOURCE_ID");
    const iTxType = colIdx("TRANSACTION_TYPE");

    let rendimientosTotal = 0;
    let rendimientosCount = 0;

    for (let i = 1; i < lines.length; i++) {
      // Parseo simple de CSV (los valores de MP no tienen comas internas)
      const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
      const desc = (cols[iDesc] || "").toLowerCase();
      const credit = parseFloat(cols[iCredit]) || 0;

      // Detectar rendimientos: pueden venir como "rendimiento", "yield", o similar
      if (desc.includes("rendimiento") || desc.includes("yield") || desc.includes("interest")) {
        rendimientosTotal += credit;
        rendimientosCount++;
      }
    }

    if (rendimientosTotal <= 0) {
      console.log(`[Rendimientos MP] No se encontraron rendimientos para ${fecha}`);
      return;
    }

    // 4. Verificar que no exista ya una operación de rendimientos para esta fecha
    const yaExiste = await Operacion.findOne({
      fecha,
      nombre: "Rendimientos MercadoPago",
      tipoOperacion: "INGRESO",
    });
    if (yaExiste) {
      console.log(`[Rendimientos MP] Ya existe operación de rendimientos para ${fecha} ($${yaExiste.monto})`);
      return;
    }

    // 5. Crear operación de ingreso en Caja
    await Operacion.create({
      tipoOperacion: "INGRESO",
      formaPago: "DIGITAL",
      nombre: "Rendimientos MercadoPago",
      descripcion: `Rendimientos diarios MP (${rendimientosCount} movimiento${rendimientosCount > 1 ? "s" : ""})`,
      monto: Math.round(rendimientosTotal * 100) / 100,
      fecha,
    });
    console.log(`[Rendimientos MP] Creada operación: $${rendimientosTotal} para ${fecha}`);
    io.emit("cambios");
  } catch (err) {
    console.error(`[Rendimientos MP] Error sync ${fecha}:`, err.message);
  }
}

// Cron: todos los días a las 8:00 AM (Argentina), sync rendimientos del día anterior
cron.schedule("0 8 * * *", async () => {
  const ayer = moment().tz("America/Argentina/Buenos_Aires").subtract(1, "day").format("YYYY-MM-DD");
  console.log(`[Rendimientos MP] Cron ejecutado, syncing ${ayer}`);
  await syncRendimientosMp(ayer);
}, { timezone: "America/Argentina/Buenos_Aires" });

server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
