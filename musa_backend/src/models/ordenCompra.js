const mongoose = require("mongoose");

const itemOCSchema = new mongoose.Schema({
  productoId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  nombre: { type: String },
  codigo: { type: String },
  cantidadSolicitada: { type: Number, required: true },
  cantidadRecibida: { type: Number, default: 0 },
  precioUnitario: { type: Number, required: true },
  bonif: { type: Number, default: 0 },
});

const timelineEntrySchema = new mongoose.Schema({
  accion: { type: String, required: true },
  usuario: { type: String, required: true },
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  fecha: { type: Date, default: Date.now },
  detalle: { type: String },
});

const facturaOCSchema = new mongoose.Schema({
  numero: { type: String },
  monto: { type: Number },
  fecha: { type: String },
  archivo: { type: String },
});

const fleteOCSchema = new mongoose.Schema({
  descripcion: { type: String },
  monto: { type: Number, required: true },
  fecha: { type: String },
  registradoPor: { type: String },
});

const ordenCompraSchema = new mongoose.Schema(
  {
    numero: { type: String, unique: true },
    proveedorId: { type: mongoose.Schema.Types.ObjectId, ref: "Proveedor", required: true },
    proveedorNombre: { type: String },
    estado: {
      type: String,
      enum: ["borrador", "pendiente_aprobacion", "aprobada", "enviada", "en_camino", "recibida_parcial", "recibida", "cerrada", "cancelada"],
      default: "borrador",
    },
    estadoPago: {
      type: String,
      enum: ["pendiente", "parcial", "pagado"],
      default: "pendiente",
    },
    items: [itemOCSchema],
    facturas: [facturaOCSchema],
    fletes: [fleteOCSchema],
    montoTotal: { type: Number, default: 0 },
    bonificacion: {
      tipo: { type: String },
      valor: { type: Number, default: 0 },
      monto: { type: Number, default: 0 },
    },
    montoPagado: { type: Number, default: 0 },
    fechaEntrega: { type: String },
    notas: { type: String },
    creadoPor: { type: String },
    creadoPorId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
    timeline: [timelineEntrySchema],
  },
  { timestamps: true }
);

const OrdenCompra = mongoose.model("OrdenCompra", ordenCompraSchema);
module.exports = OrdenCompra;
