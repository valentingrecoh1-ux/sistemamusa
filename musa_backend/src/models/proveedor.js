const mongoose = require("mongoose");

const proveedorSchema = new mongoose.Schema(
  {
    bodega: { type: String, required: true },
    nombre: { type: String },
    telefono: { type: String },
    cuit: { type: String },
    cbu: { type: String },
    alias: { type: String },
    banco: { type: String },
    condicionPago: { type: String, default: "" },
    factura: { type: Boolean, default: false },
    notas: { type: String },
    activo: { type: Boolean, default: true },
    esDistribuidor: { type: Boolean, default: false },
    distribuidorNombre: { type: String },
    distribuidorContacto: { type: String },
    distribuidorTelefono: { type: String },
    distribuidorEmail: { type: String },
  },
  { timestamps: true }
);

const Proveedor = mongoose.model("Proveedor", proveedorSchema);
module.exports = Proveedor;
