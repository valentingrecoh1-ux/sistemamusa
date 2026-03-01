const mongoose = require("mongoose");

const resenaSchema = new mongoose.Schema(
  {
    productoId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productoNombre: { type: String },
    cliente: {
      nombre: { type: String, required: true },
      email: { type: String, required: true },
    },
    puntuacion: { type: Number, required: true, min: 1, max: 5 },
    titulo: { type: String },
    comentario: { type: String, required: true },
    verificada: { type: Boolean, default: false },
    aprobada: { type: Boolean, default: true },
  },
  { timestamps: true }
);

resenaSchema.index({ productoId: 1, createdAt: -1 });
resenaSchema.index({ "cliente.email": 1, productoId: 1 });

module.exports = mongoose.model("Resena", resenaSchema);
