const mongoose = require("mongoose");

const vinoUsadoSchema = new mongoose.Schema({
  productoId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  codigo: { type: String },
  nombre: { type: String },
  bodega: { type: String },
  cepa: { type: String },
  precioVenta: { type: Number, default: 0 },
});

const gastoEstimadoSchema = new mongoose.Schema({
  descripcion: { type: String },
  monto: { type: Number, default: 0 },
  realizado: { type: Boolean, default: false },
  operacionId: { type: mongoose.Schema.Types.ObjectId, ref: "Operacion" },
  infoPago: { type: String, default: "" },
});

const eventoSchema = new mongoose.Schema(
  {
    fecha: { type: String },
    nombre: { type: String },
    descripcion: { type: String },
    capacidadMaxima: { type: Number, default: 0 },
    precioPorPersona: { type: Number, default: 0 },
    estado: {
      type: String,
      enum: ["proximo", "en_curso", "finalizado", "cancelado"],
      default: "proximo",
    },
    vinosUsados: [vinoUsadoSchema],
    gastosEstimados: [gastoEstimadoSchema],
    observaciones: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Evento", eventoSchema);
