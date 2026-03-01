const mongoose = require("mongoose");

const respuestaSchema = new mongoose.Schema({
  texto: { type: String, required: true },
  usuario: { type: String, required: true },
  usuarioId: { type: String },
  fecha: { type: Date, default: Date.now },
});

const mensajeInternoSchema = new mongoose.Schema(
  {
    texto: { type: String, required: true },
    usuario: { type: String, required: true },
    usuarioId: { type: String },
    tipo: {
      type: String,
      enum: ["nota", "tarea", "aviso"],
      default: "nota",
    },
    categoria: {
      type: String,
      enum: ["vinos", "pedidos", "faltantes", "general"],
      default: "general",
    },
    estado: {
      type: String,
      enum: ["pendiente", "en_proceso", "resuelto"],
      default: "pendiente",
    },
    asignadoA: { type: String },
    asignadoAId: { type: String },
    respuestas: [respuestaSchema],
    fijado: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const MensajeInterno = mongoose.model("MensajeInterno", mensajeInternoSchema);
module.exports = MensajeInterno;
