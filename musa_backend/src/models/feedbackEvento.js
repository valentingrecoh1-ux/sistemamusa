const mongoose = require("mongoose");

const feedbackEventoSchema = new mongoose.Schema(
  {
    eventoId: { type: mongoose.Schema.Types.ObjectId, ref: "Evento", required: true },
    turnoId: { type: mongoose.Schema.Types.ObjectId, ref: "Turno" },
    tipo: { type: String, enum: ["cliente", "organizador"], default: "cliente" },
    nombre: { type: String },
    telefono: { type: String },
    puntaje: { type: Number, min: 1, max: 5, required: true },
    loPositivo: { type: String },
    loNegativo: { type: String },
    mejoraria: { type: String },
    comentario: { type: String },
    // Solo para feedback organizador
    notasInternas: { type: String },
  },
  { timestamps: true }
);

feedbackEventoSchema.index({ eventoId: 1, createdAt: -1 });

module.exports = mongoose.model("FeedbackEvento", feedbackEventoSchema);
