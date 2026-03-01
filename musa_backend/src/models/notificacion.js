const mongoose = require("mongoose");

const notificacionSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ["aprobacion_pendiente", "orden_aprobada", "diferencia_recepcion", "pago_pendiente", "orden_recibida", "pago_registrado", "general"],
      required: true,
    },
    mensaje: { type: String, required: true },
    destinatarioRol: { type: String },
    destinatarioId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
    referenciaId: { type: mongoose.Schema.Types.ObjectId },
    leida: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Notificacion = mongoose.model("Notificacion", notificacionSchema);
module.exports = Notificacion;
