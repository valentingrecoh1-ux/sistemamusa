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
  },
  { timestamps: true }
);

const Product = mongoose.model("Operacion", operacion);

module.exports = Product;
