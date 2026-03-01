const mongoose = require("mongoose");

const itemPedidoSchema = new mongoose.Schema(
  {
    productoId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    nombre: { type: String, required: true },
    bodega: { type: String },
    cepa: { type: String },
    foto: { type: String },
    precioUnitario: { type: Number, required: true },
    cantidad: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const pedidoWebSchema = new mongoose.Schema(
  {
    numeroPedido: { type: Number, unique: true },
    items: [itemPedidoSchema],
    cliente: {
      nombre: { type: String, required: true },
      email: { type: String, required: true },
      telefono: { type: String, required: true },
      direccion: { type: String },
      notas: { type: String },
    },
    entrega: { type: String, enum: ["envio", "retiro"], default: "retiro" },
    estado: {
      type: String,
      enum: ["pendiente", "confirmado", "preparando", "listo", "enviado", "entregado", "cancelado"],
      default: "pendiente",
    },
    montoSubtotal: { type: Number, required: true },
    costoEnvio: { type: Number, default: 0 },
    montoTotal: { type: Number, required: true },
    mpPreferenceId: { type: String },
    mpPaymentId: { type: Number },
    mpStatus: { type: String },
    clienteId: { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", default: null },
  },
  { timestamps: true }
);

pedidoWebSchema.pre("save", async function (next) {
  if (this.isNew && !this.numeroPedido) {
    const last = await this.constructor.findOne({}, {}, { sort: { numeroPedido: -1 } });
    this.numeroPedido = (last?.numeroPedido || 1000) + 1;
  }
  next();
});

module.exports = mongoose.model("PedidoWeb", pedidoWebSchema);
