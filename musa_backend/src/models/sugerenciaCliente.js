const mongoose = require("mongoose");

const sugerenciaClienteSchema = new mongoose.Schema(
  {
    clienteId: { type: mongoose.Schema.Types.ObjectId, ref: "Cliente" },
    clienteNombre: { type: String },
    tipo: { type: String, enum: ["sugerencia", "mejora", "reclamo", "otro"], default: "sugerencia" },
    mensaje: { type: String, required: true },
    estado: { type: String, enum: ["pendiente", "leido", "respondido"], default: "pendiente" },
    respuesta: { type: String },
    respondidoPor: { type: String },
  },
  { timestamps: true }
);

const SugerenciaCliente = mongoose.model("SugerenciaCliente", sugerenciaClienteSchema);
module.exports = SugerenciaCliente;
