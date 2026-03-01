const mongoose = require("mongoose");

const operacion = new mongoose.Schema(
  {
    tipoOperacion: { type: String },
    formaPago: { type: String },
    descripcion: { type: String },
    nombre: { type: String },
    monto: { type: Number },
    filePath: { type: String },
    beneficiario: { type: String },
    fecha: { type: String },
    factura: { type: String },
    degustacionId: { type: mongoose.Schema.Types.ObjectId, ref: "Degustacion" },
    eventoId: { type: mongoose.Schema.Types.ObjectId, ref: "Evento" },
    mpPagoId: { type: Number, default: null },
  },
  { timestamps: true }
);

const Operacion = mongoose.model("Operacion", operacion);

module.exports = Operacion;
