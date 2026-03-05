const mongoose = require("mongoose");

const pagoProveedorSchema = new mongoose.Schema(
  {
    ordenCompraId: { type: mongoose.Schema.Types.ObjectId, ref: "OrdenCompra", required: true },
    proveedorId: { type: mongoose.Schema.Types.ObjectId, ref: "Proveedor", required: true },
    monto: { type: Number, required: true },
    metodoPago: {
      type: String,
      enum: ["transferencia", "cheque", "efectivo", "digital"],
      required: true,
    },
    referencia: { type: String },
    filePath: { type: String },
    fecha: { type: String },
    registradoPor: { type: String },
    registradoPorId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
    concepto: {
      type: String,
      enum: ["factura", "flete"],
      default: "factura",
    },
    notas: { type: String },
  },
  { timestamps: true }
);

const PagoProveedor = mongoose.model("PagoProveedor", pagoProveedorSchema);
module.exports = PagoProveedor;
