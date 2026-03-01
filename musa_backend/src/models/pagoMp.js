const mongoose = require("mongoose");

const pagoMpSchema = new mongoose.Schema(
  {
    mpId: { type: Number, required: true, unique: true, index: true },
    fecha: { type: String, index: true },
    fechaCreacion: { type: Date },
    fechaAprobacion: { type: Date },
    descripcion: { type: String },
    referenciaExterna: { type: String },
    monto: { type: Number },
    moneda: { type: String },
    netoRecibido: { type: Number },
    comisionMp: { type: Number },
    retenciones: { type: Number },
    impuestos: { type: Number },
    costoEnvio: { type: Number },
    medioPago: { type: String },
    medioPagoDetalle: { type: String },
    estado: { type: String, index: true },
    estadoDetalle: { type: String },
    cuotas: { type: Number },
    feeDetails: { type: mongoose.Schema.Types.Mixed },
    chargesDetalle: { type: mongoose.Schema.Types.Mixed },
    pagador: { type: mongoose.Schema.Types.Mixed },
    tarjeta: { type: mongoose.Schema.Types.Mixed },
    operationType: { type: String },
    collectorId: { type: Number },
    tipoMovimiento: { type: String, enum: ["cobro", "gasto"], default: "cobro" },
    cierreComisionesAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PagoMp", pagoMpSchema);
