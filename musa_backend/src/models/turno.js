const mongoose = require("mongoose");

const turno = new mongoose.Schema(
  {
    fecha: { type: String },
    turno: { type: String },
    nombre: { type: String },
    cantidad: { type: Number },
    observaciones: { type: String },
    cobrado: { type: Number },
    formaDeCobro: { type: String },
    total: { type: Number },
    facturado: { type: Boolean },
    telefono: { type: String },
    eventoId: { type: mongoose.Schema.Types.ObjectId, ref: "Evento", default: null },
  },
  { timestamps: true }
);

const Turno = mongoose.model("Turno", turno);

module.exports = Turno;
