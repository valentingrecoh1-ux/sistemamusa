const mongoose = require("mongoose");

const venta = new mongoose.Schema(
  {
    productos: { type: Array },
    tipoFactura: { type: String },
    numeroFactura: { type: String },
    stringNumeroFactura: { type: String },
    numeroNotaCredito: { type: String },
    stringNumeroNotaCredito: { type: String },
    cuit: { type: String },
    monto: { type: Number },
    formaPago: { type: String },
    domicilio: { type: String },
    nombre: { type: String },
    razonSocial: { type: String },
    localidad: { type: String },
    provincia: { type: String },
    notaCredito: { type: Boolean },
    fecha: { type: String },
    idTurno: { type: String },
    nombreTurno: { type: String },
    reservaFecha: { type: String },
    reservaTurno: { type: String },
    descuento: { type: Number },
    detalle: { type: String },
    numeroVenta: { type: Number },
    montoEfectivo: { type: Number },
    montoDigital: { type: Number },
    mpPaymentIds: { type: [Number], default: [] },
    mpLinkedAt: { type: Date, default: null },
    clienteId: { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", default: null },
    facturaPdf: { type: String, default: null },
    notaCreditoPdf: { type: String, default: null },
  },
  { timestamps: true }
);

const Venta = mongoose.model("Venta", venta);

module.exports = Venta;
