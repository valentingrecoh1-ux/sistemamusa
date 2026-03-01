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
const { PlanClub, SuscripcionClub } = require("./models/suscripcionClub");
const Resena = require("./models/resena");
const Notificacion = require("./models/notificacion");
const Cliente = require("./models/cliente");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const createTiendaRouter = require("./routes/tiendaApi");
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, BufferJSON, initAuthCreds } = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");

const AfipService = require("./AfipService");
const afipService = new AfipService({ CUIT: 20418588897 });

// Crear carpetas necesarias al iniciar (para Render y deploys frescos)
["uploads/perfiles", "uploads/facturas_oc", "src/facturas", "src/notas_de_credito", "comprobantes"].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

const PDFDocument = require("pdfkit");
const qr = require("qr-image");
const { print } = require("pdf-to-printer");

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
    const d = new Date(fechaCreacion.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const bruto = p.transaction_amount || 0;
  const neto = p.transaction_details?.net_received_amount ?? null;
  const comis = (p.fee_details || []).reduce((s, f) => s + (f.amount || 0), 0);
  const ret = neto != null ? Math.max(0, +(bruto - comis - neto).toFixed(2)) : 0;

  // Clasificar por tipo de operacion: money_transfer = gasto, resto = cobro
  let tipo = "cobro";
  if (p.operation_type === "money_transfer") {
    tipo = "gasto";
  } else if (ownCollectorId && p.collector_id) {
    tipo = (String(p.collector_id) === String(ownCollectorId)) ? "cobro" : "gasto";
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
  const hoy = moment().tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");
  const esHoy = fecha === hoy;
  // Si no es hoy, ver si ya tenemos datos de ese día
  if (!esHoy) {
    const count = await PagoMp.countDocuments({ fecha });
    if (count > 0) return;
  }
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

    const ops = payments.map((p) => ({
      updateOne: {
        filter: { mpId: p.id },
        update: { $set: mpRawToDoc(p, ownId) },
        upsert: true,
      },
    }));
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

  waStatus = "connecting";
  waQR = null;

  try {
    const { state, saveCreds } = await useMongoAuthState();

    waSocket = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["MUSA Palermo", "Chrome", "1.0.0"],
    });

    waSocket.ev.on("creds.update", saveCreds);

    waSocket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        waQR = await QRCode.toDataURL(qr);
        waStatus = "qr";
      }

      if (connection === "open") {
        waStatus = "connected";
        waQR = null;
        waReconnectDelay = 5000;
        console.log("WhatsApp conectado");
      }

      if (connection === "close") {
        waQR = null;
        const code = lastDisconnect?.error?.output?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          waStatus = "disconnected";
          waSocket = null;
          await mongoose.connection.collection("wa_auth").deleteMany({});
          console.log("WhatsApp deslogueado");
        } else {
          waSocket = null;
          waStatus = "disconnected";
          waReconnectDelay = Math.min((waReconnectDelay || 5000) * 2, 300000);
          setTimeout(connectWhatsApp, waReconnectDelay);
        }
      }
    });
  } catch (e) {
    console.error("WhatsApp error:", e.message);
    waStatus = "disconnected";
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

// Configuración de multer para almacenar los archivos en la carpeta 'uploads'
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + "-" + file.originalname);
  },
});

const comprobantesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "comprobantes/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + "-" + file.originalname);
  },
});

const uploadComprobante = multer({
  storage: comprobantesStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const facturasOCStorage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, "uploads/facturas_oc/"); },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `factura-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const uploadFacturaOC = multer({ storage: facturasOCStorage, limits: { fileSize: 20 * 1024 * 1024 } });

const perfilStorage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, "uploads/perfiles/"); },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `perfil-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const uploadPerfil = multer({ storage: perfilStorage, limits: { fileSize: 5 * 1024 * 1024 } });

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

// Sirviendo la carpeta 'uploads' de forma estática
app.use("/uploads", express.static("uploads"));
app.use("/uploads/facturas_oc", express.static("uploads/facturas_oc"));
app.use("/uploads/perfiles", express.static("uploads/perfiles"));
app.use("/comprobantes", express.static("comprobantes"));
app.use("/facturas", express.static("src/facturas"));
app.use("/notas_de_credito", express.static("src/notas_de_credito"));

// ── WhatsApp API routes ──
app.get("/api/whatsapp/status", (req, res) => {
  res.json({ status: waStatus, qr: waQR });
});

app.post("/api/whatsapp/connect", async (req, res) => {
  if (waStatus === "connected" && waSocket)
    return res.json({ status: "connected", qr: null });

  connectWhatsApp();

  // Esperar hasta 15s por QR o conexión
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (waQR || waStatus === "connected") break;
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
app.use("/api/tienda", createTiendaRouter({ Product, PedidoWeb, ConfigTienda, PlanClub, SuscripcionClub, Resena, mpClient: mpClient ? { accessToken: process.env.MP_ACCESS_TOKEN } : null, io }));

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

      // Si estamos editando (operacionData._id existe) y no hay un archivo nuevo, conservar el filePath existente
      if (operacionData._id && !file) {
        const existingOperacion = await Flujo.findById(operacionData._id);
        if (existingOperacion) {
          operacionData.filePath = existingOperacion.filePath; // Conservar el filePath existente
        }
      } else if (file) {
        // Si hay un archivo nuevo, actualizar filePath con el nuevo archivo
        operacionData.filePath = file.path;
      }

      // Crear o actualizar la operación
      if (operacionData._id) {
        await Flujo.findByIdAndUpdate(operacionData._id, operacionData);
      } else {
        await Flujo.create(operacionData);
      }

      // Emitir cambios a todos los clientes conectados
      io.emit("cambios");

      res.json({ status: "ok", message: "Operación guardada correctamente" });
    } catch (error) {
      console.error("Error al guardar la operación:", error);
      res
        .status(500)
        .json({ status: "error", message: "Error al guardar la operación" });
    }
  }
);

app.post(
  "/upload_operacion",
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

      // Si estamos editando (operacionData._id existe) y no hay un archivo nuevo, conservar el filePath existente
      if (operacionData._id && !file) {
        const existingOperacion = await Operacion.findById(operacionData._id);
        if (existingOperacion) {
          operacionData.filePath = existingOperacion.filePath; // Conservar el filePath existente
        }
      } else if (file) {
        // Si hay un archivo nuevo, actualizar filePath con el nuevo archivo
        operacionData.filePath = file.path;
      }

      // Crear o actualizar la operación
      if (operacionData._id) {
        await Operacion.findByIdAndUpdate(operacionData._id, operacionData);
      } else {
        await Operacion.create(operacionData);
      }

      // Emitir cambios a todos los clientes conectados
      io.emit("cambios");

      res.json({ status: "ok", message: "Operación guardada correctamente" });
    } catch (error) {
      console.error("Error al guardar la operación:", error);
      res
        .status(500)
        .json({ status: "error", message: "Error al guardar la operación" });
    }
  }
);

app.post("/upload", upload.single("foto"), async (req, res) => {
  const formData = req.body;
  const file = req.file;
  try {
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

      const product = {
        codigo: formData.codigo,
        bodega: formData.bodega,
        cepa: formData.cepa,
        nombre: formData.nombre,
        year: formData.year,
        origen: formData.origen,
        costo: formData.costo,
        venta: formData.venta,
        cantidad: formData.cantidad,
        posicion: formData.posicion,
        descripcion: formData.descripcion,
        tipo: formData.tipo || "vino",
        foto: file ? file.path : existingProduct.foto,
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
      const newProduct = new Product({
        codigo: formData.codigo,
        bodega: formData.bodega,
        cepa: formData.cepa,
        nombre: formData.nombre,
        year: formData.year,
        origen: formData.origen,
        costo: formData.costo,
        venta: formData.venta,
        cantidad: formData.cantidad,
        posicion: formData.posicion,
        descripcion: formData.descripcion,
        tipo: formData.tipo || "vino",
        foto: file ? file.path : "",
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
    // Emitir un evento a todos los clientes conectados con el nuevo producto
  } catch (error) {
    console.error("Error al guardar el producto:", error);
    res
      .status(500)
      .json({ status: "error", message: "Error al guardar el producto" });
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

// ── OC Facturas upload ──
app.post("/api/oc/:id/factura", uploadFacturaOC.single("archivo"), async (req, res) => {
  try {
    const orden = await OrdenCompra.findById(req.params.id);
    if (!orden) return res.status(404).json({ error: "OC no encontrada" });
    const factura = {
      numero: req.body.tipo || req.body.numero || "",
      monto: Number(req.body.monto) || 0,
      fecha: req.body.fecha || new Date().toISOString().slice(0, 10),
      archivo: req.file ? `/uploads/facturas_oc/${req.file.filename}` : "",
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

// ── Profile photo upload (base64 en MongoDB) ──
app.post("/upload_foto_perfil", uploadPerfil.single("foto"), async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId || !req.file) return res.status(400).json({ error: "Faltan datos" });
    const base64 = fs.readFileSync(req.file.path).toString("base64");
    const mime = req.file.mimetype || "image/jpeg";
    const foto = `data:${mime};base64,${base64}`;
    await Usuario.findByIdAndUpdate(userId, { foto });
    // Limpiar archivo temporal
    fs.unlink(req.file.path, () => {});
    io.emit("cambios");
    res.json({ ok: true, foto });
  } catch (err) {
    console.error("Error upload foto perfil:", err);
    res.status(500).json({ error: err.message });
  }
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
async function vincularVentaCliente(ventaDoc) {
  try {
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
            .sort(sortOption)
            .skip((page - 1) * pageSize)
            .limit(pageSize),
          Product.countDocuments(query),
          Product.aggregate([
            { $match: { $and: [query, { $or: [{ tipo: "vino" }, { tipo: { $exists: false } }, { tipo: null }] }] } },
            { $group: { _id: null, total: { $sum: { $toInt: "$cantidad" } } } },
          ]),
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
      const product = await Product.findById(id);
      if (product) {
        const newCarrito = product.carrito === true ? false : true;
        product.carrito = newCarrito;
        product.carritoCantidad = 1;
        await product.save();
        io.emit("cambios");
      } else {
        console.error("Producto no encontrado");
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

      const imgPath = path.resolve(producto.foto);
      if (!fs.existsSync(imgPath)) {
        if (cb) cb({ error: "No se encontro el archivo de foto" });
        return;
      }

      // Usar GPT-4o con vision + image_generation tool via Responses API
      const imgBuffer = fs.readFileSync(imgPath);
      const base64Image = imgBuffer.toString("base64");
      const mimeType = imgPath.endsWith(".png") ? "image/png" : "image/jpeg";

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
        const filename = `foto_ia_${Date.now()}.png`;
        const dir = path.join("uploads", "fotos_ia");
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, filename);
        fs.writeFileSync(filePath, Buffer.from(imageOutput.result, "base64"));

        await Product.findByIdAndUpdate(id, { fotoIA: filePath });
        io.emit("cambios");
        if (cb) cb({ ok: true, fotoIA: filePath });
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
      const productosCarrito = await Product.find({ carrito: true });
      socket.emit("productos-carrito", productosCarrito);
    } catch (err) { console.error("Error productos-carrito:", err); }
  });
  socket.on("actualizar-cantidad-carrito", async ({ id, cantidad }) => {
    try {
      const product = await Product.findById(id);
      if (product) {
        product.carritoCantidad = cantidad;
        await product.save();
        io.emit("cambios");
      } else {
        console.error("Producto no encontrado");
      }
    } catch (error) {
      console.error("Error al actualizar carritoCantidad:", error);
    }
  });
  socket.on("finalizar-compra", async (datosCompra) => {
    try {
      // Obtenemos todos los productos que están en el carrito
      const productosCarrito = await Product.find({ carrito: true });

      // Calculamos el total de la venta
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

        // Generamos el ticket y enviamos al frontend para imprimir via JSPM
        const ticketA = await imprimirTicket(data);
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
        };
        const ventaCreada1 = await Venta.create(venta);
        autoLinkMpPayment(ventaCreada1);
        vincularVentaCliente(ventaCreada1);

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

        // Generamos el ticket y enviamos al frontend para imprimir via JSPM
        const ticketB = await imprimirTicket(data);
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
        };
        const ventaCreada2 = await Venta.create(venta);
        autoLinkMpPayment(ventaCreada2);
        vincularVentaCliente(ventaCreada2);

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
        const ventaCreada3 = await Venta.create(venta);
        autoLinkMpPayment(ventaCreada3);
        vincularVentaCliente(ventaCreada3);
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
      socket.emit("compra-finalizada");
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
        const ventasEnriquecidas = ventas.map((venta) => {
          const ventaObj = venta.toObject();
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
    // Generar ticket y enviar al frontend para imprimir via JSPM
    const ticketNC = await imprimirTicket(data);
    socket.emit("ticket-listo", { base64: ticketNC.base64 });
    const ptoVtaStr = String(data.puntoDeVenta || 0).padStart(6, "0");
    const nroNcStr = String(data.numeroComprobante || 0).padStart(8, "0");
    const stringNumeroNotaCredito = `F${venta.tipoFactura}-${ptoVtaStr}-${nroNcStr}`;
    await Venta.findByIdAndUpdate(venta._id, {
      notaCredito: true,
      numeroNotaCredito: String(data.numeroComprobante || ""),
      stringNumeroNotaCredito,
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
  socket.on("request-totales", async () => {
    try {
      const hoy = moment().tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");
      const [totalEfectivoResult, totalDigitalResult, totalMixtoResult] = await Promise.all([
        Venta.aggregate([
          { $match: { fecha: hoy, formaPago: "EFECTIVO", notaCredito: { $ne: true } } },
          { $group: { _id: null, total: { $sum: "$monto" } } },
        ]),
        Venta.aggregate([
          { $match: { fecha: hoy, formaPago: "DIGITAL", notaCredito: { $ne: true } } },
          { $group: { _id: null, total: { $sum: "$monto" } } },
        ]),
        Venta.aggregate([
          { $match: { fecha: hoy, formaPago: "MIXTO", notaCredito: { $ne: true } } },
          { $group: { _id: null, totalEfectivoMixto: { $sum: "$montoEfectivo" }, totalDigitalMixto: { $sum: "$montoDigital" } } },
        ]),
      ]);

      let efectivo = totalEfectivoResult.length > 0 ? totalEfectivoResult[0].total : 0;
      let digital = totalDigitalResult.length > 0 ? totalDigitalResult[0].total : 0;
      efectivo += totalMixtoResult.length > 0 ? totalMixtoResult[0].totalEfectivoMixto : 0;
      digital += totalMixtoResult.length > 0 ? totalMixtoResult[0].totalDigitalMixto : 0;

      const operaciones = await Operacion.find({ fecha: hoy }).lean();
      operaciones.forEach((operacion) => {
        if (operacion.formaPago === "EFECTIVO") {
          efectivo += operacion.monto;
        } else if (operacion.formaPago === "DIGITAL") {
          digital += operacion.monto;
        } else if (operacion.formaPago === "MIXTO") {
          efectivo += operacion.montoEfectivo || 0;
          digital += operacion.montoDigital || 0;
        }
      });

      socket.emit("response-totales", { efectivo, digital });
    } catch (err) { console.error("Error request-totales:", err); }
  });
  socket.on("request-nombres", async () => {
    try {
      const ops = await Operacion.find({}, { nombre: 1 }).lean();
      const nombres = [...new Set(ops.map((o) => o.nombre))];
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
  socket.on("request-operaciones", async ({ fecha, search, page }) => {
    const pageSize = 50;
    const pageNumber = page || 1;
    let filter = {};
    if (fecha) {
      filter.fecha = fecha;
    }
    const searchRegex = { $regex: search, $options: "i" };
    filter.$or = [
      { descripcion: searchRegex },
      { tipoOperacion: searchRegex },
      { nombre: searchRegex },
    ];
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
  socket.on("request-tipo-operacion", async (tipo, mes) => {
    try {
      const operaciones = await Operacion.find({
        tipoOperacion: tipo,
        fecha: { $regex: `^${mes}` }, // Filtrar operaciones por mes
      }).sort({ createdAt: -1 });

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
  socket.on("request-facturado", async (mes) => {
    try {
      // Filtrar las ventas por el mes exacto (comparando las primeras 7 posiciones de la fecha)
      const ventas = await Venta.find({
        fecha: {
          $regex: `^${mes}`, // Filtrar donde la fecha empiece con el valor de 'mes' (YYYY-MM)
        },
      });

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
  socket.on("request-gastos", async (mes) => {
    try {
      const operaciones = await Operacion.find({ fecha: { $regex: `^${mes}` } });
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
  socket.on("request-estadisticas-ventas", async (mes) => {
    try {
      const tz = "America/Argentina/Buenos_Aires";
      let matchStage = { notaCredito: { $ne: true } };
      if (mes) matchStage.fecha = { $regex: `^${mes}` };

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

      // 6. Descuentos
      const descuentos = await Venta.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalDescuento: { $sum: { $ifNull: ["$descuento", 0] } },
            cantidadConDescuento: { $sum: { $cond: [{ $gt: [{ $ifNull: ["$descuento", 0] }, 0] }, 1, 0] } },
            cantidadTotal: { $sum: 1 },
            montoTotal: { $sum: "$monto" },
          }
        },
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
        const ticketTurno = await imprimirTicket(data);
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
      await Product.findOneAndUpdate({ codigo }, { carrito: true });
      io.emit("cambios");
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

  // ── Buscar operaciones (gastos) sin vincular a MP ──
  socket.on("request-gastos-sin-mp", async ({ fecha }) => {
    try {
      const baseQuery = {
        $or: [{ mpPagoId: null }, { mpPagoId: { $exists: false } }],
        tipoOperacion: "GASTO",
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
  socket.on("concretar-gasto-evento", async ({ eventoId, gastoIndex, soloMarcar }) => {
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
      }
      evento.gastosEstimados[gastoIndex].realizado = true;
      await evento.save();
      io.emit("cambios");
    } catch (err) {
      console.error("Error concretar-gasto-evento:", err);
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
      }).limit(10);
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
          { nombre: { $regex: search, $options: "i" } },
          { cuit: { $regex: search, $options: "i" } },
          { contacto: { $regex: search, $options: "i" } },
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
        ];
      }
      const total = await OrdenCompra.countDocuments(query);
      const ordenes = await OrdenCompra.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
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
      socket.emit("response-orden-compra-detalle", {
        ...orden,
        proveedor,
        pagos,
        total: orden.montoTotal,
        totalPagado: orden.montoPagado,
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

      // Propagar costo al producto cuando se recibe la OC
      if (estado === "recibida" || estado === "recibida_parcial") {
        for (const item of orden.items || []) {
          if (item.productoId && item.precioUnitario) {
            await Product.findByIdAndUpdate(item.productoId, { costo: item.precioUnitario });
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

  // ── Pagos Proveedor ──
  socket.on("guardar-pago-proveedor", async (data) => {
    try {
      const orden = await OrdenCompra.findById(data.ordenCompra);
      if (!orden) return;
      await PagoProveedor.create({
        ordenCompraId: orden._id,
        proveedorId: orden.proveedorId,
        monto: data.monto,
        metodoPago: data.metodo || "transferencia",
        referencia: data.referencia || "",
        notas: data.notas || "",
        fecha: new Date().toISOString().slice(0, 10),
        registradoPor: "Sistema",
      });
      orden.montoPagado = (orden.montoPagado || 0) + data.monto;
      if (orden.montoPagado >= orden.montoTotal) {
        orden.estadoPago = "pagado";
      } else if (orden.montoPagado > 0) {
        orden.estadoPago = "parcial";
      }
      orden.timeline.push({ accion: `Pago registrado: $${data.monto}`, usuario: "Sistema", fecha: new Date() });
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

      const [ventasHoy, mpHoy, ultimasVentas] = await Promise.all([
        Venta.aggregate([
          { $match: { fecha: hoy, notaCredito: { $ne: true } } },
          { $group: { _id: null, total: { $sum: "$monto" }, cantidad: { $sum: 1 } } },
        ]),
        PagoMp.aggregate([
          { $match: { fecha: hoy, estado: "approved" } },
          {
            $group: {
              _id: null,
              totalCobrado: { $sum: { $cond: [{ $eq: ["$tipoMovimiento", "cobro"] }, "$monto", 0] } },
              netoCobrado: { $sum: { $cond: [{ $eq: ["$tipoMovimiento", "cobro"] }, "$netoRecibido", 0] } },
              comisiones: { $sum: { $cond: [{ $eq: ["$tipoMovimiento", "cobro"] }, "$comisionMp", 0] } },
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
      const mp = mpHoy[0] || { totalCobrado: 0, netoCobrado: 0, comisiones: 0, totalGastos: 0, cantidadPagos: 0 };

      socket.emit("response-dashboard-data", {
        ventas: {
          cantidad: v.cantidad,
          total: v.total,
          ticketPromedio: v.cantidad > 0 ? Math.round(v.total / v.cantidad) : 0,
        },
        mp: {
          totalCobrado: mp.totalCobrado,
          neto: mp.netoCobrado,
          comisiones: mp.comisiones,
          gastos: mp.totalGastos,
          cantidadPagos: mp.cantidadPagos,
        },
        ultimasVentas: ultimasVentas.map((vt) => ({
          _id: vt._id,
          monto: vt.monto,
          formaPago: vt.formaPago,
          factura: vt.stringNumeroFactura || `#${vt.numeroVenta}`,
          turno: vt.nombreTurno || "",
          hora: vt.createdAt,
          cantProductos: vt.productos ? vt.productos.length : 0,
        })),
      });
    } catch (err) {
      console.error("Error request-dashboard-data:", err);
      socket.emit("response-dashboard-data", {
        ventas: { cantidad: 0, total: 0, ticketPromedio: 0 },
        mp: { totalCobrado: 0, neto: 0, comisiones: 0, gastos: 0, cantidadPagos: 0 },
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
      const [allTurnos, allOps] = await Promise.all([
        Turno.find({ eventoId: { $in: evIds } }).lean(),
        Operacion.find({ $or: [{ eventoId: { $in: evIds } }, { degustacionId: { $in: evIds } }] }).lean(),
      ]);
      const turnosByEv = {};
      for (const t of allTurnos) { const k = t.eventoId.toString(); (turnosByEv[k] ||= []).push(t); }
      const opsByEv = {};
      for (const o of allOps) { const k = (o.eventoId || o.degustacionId).toString(); (opsByEv[k] ||= []).push(o); }

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
      }).limit(10);
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

  socket.on("request-reporte-eventos", async (mes) => {
    try {
      let filter = {};
      if (mes) filter.fecha = { $regex: `^${mes}` };
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
      const productos = await Product.find({ _id: { $in: productoIds } });
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
          { nombre: re }, { email: re }, { cuit: re },
          { razonSocial: re }, { telefono: re },
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
        Venta.find({ clienteId: id }).sort({ createdAt: -1 }).limit(50).lean(),
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
        $or: [{ nombre: re }, { cuit: re }, { razonSocial: re }, { email: re }],
      }, "_id nombre cuit razonSocial").limit(10).lean();
      socket.emit("response-buscar-cliente", clientes);
    } catch (err) {
      socket.emit("response-buscar-cliente", []);
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

  // ── Fotos de perfil (para chat) ──
  socket.on("request-usuarios-fotos", async () => {
    try {
      const usuarios = await Usuario.find({}, "nombre foto").lean();
      const map = {};
      for (const u of usuarios) {
        if (u.foto) map[u.nombre] = u.foto;
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

      await pedido.save();
      cb?.({ ok: true });
      io.emit("cambios-web");
      io.emit("cambios");
    } catch (err) {
      console.error("Error update-estado-pedido-web:", err);
      cb?.({ error: "Error al actualizar estado" });
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

  socket.on("guardar-usuario", async (data) => {
    try {
      if (!requireAdmin(socket)) return;
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
    } catch (err) {
      console.error("Error guardar-usuario:", err);
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

});

const PORT = process.env.PORT || 5000;

// Migración: borrar pagos sin collectorId para forzar re-sync, luego reclasificar
(async () => {
  try {
    const sinCollector = await PagoMp.deleteMany({ $or: [{ collectorId: null }, { collectorId: { $exists: false } }] });
    if (sinCollector.deletedCount) console.log(`Migración PagoMp: borrados ${sinCollector.deletedCount} pagos sin collectorId (se re-sincronizarán)`);
    // Reclasificar: money_transfer = gasto, resto = cobro
    const [r1, r2] = await Promise.all([
      PagoMp.updateMany(
        { operationType: "money_transfer", tipoMovimiento: { $ne: "gasto" } },
        { $set: { tipoMovimiento: "gasto" } },
      ),
      PagoMp.updateMany(
        { operationType: { $ne: "money_transfer" }, tipoMovimiento: { $ne: "cobro" } },
        { $set: { tipoMovimiento: "cobro" } },
      ),
    ]);
    if (r1.modifiedCount) console.log(`Migración PagoMp: ${r1.modifiedCount} → gasto`);
    if (r2.modifiedCount) console.log(`Migración PagoMp: ${r2.modifiedCount} → cobro`);
  } catch (err) { console.error("Error migración PagoMp:", err); }
})();

server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
