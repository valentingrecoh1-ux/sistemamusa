const mongoose = require("mongoose");

const gastoSchema = new mongoose.Schema({
  concepto: { type: String },
  monto: { type: Number, default: 0 },
});

const vinoUsadoSchema = new mongoose.Schema({
  productoId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  codigo: { type: String },
  nombre: { type: String },
  bodega: { type: String },
  cepa: { type: String },
  precioVenta: { type: Number, default: 0 },
});

const degustacionSchema = new mongoose.Schema(
  {
    fecha: { type: String },
    nombre: { type: String },
    descripcion: { type: String },
    cantidadPersonas: { type: Number, default: 0 },
    ingreso: { type: Number, default: 0 },
    gastos: [gastoSchema],
    vinosUsados: [vinoUsadoSchema],
    observaciones: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Degustacion", degustacionSchema);
