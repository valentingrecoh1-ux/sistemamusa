const mongoose = require("mongoose");

const valoracionVinoSchema = new mongoose.Schema(
  {
    clienteId: { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", required: true },
    productoId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    puntuacion: { type: Number, min: 1, max: 5 },
    notas: { type: String },
    publica: { type: Boolean, default: false },
  },
  { timestamps: true }
);

valoracionVinoSchema.index({ clienteId: 1, productoId: 1 }, { unique: true });
valoracionVinoSchema.index({ productoId: 1, publica: 1 });

module.exports = mongoose.model("ValoracionVino", valoracionVinoSchema);
