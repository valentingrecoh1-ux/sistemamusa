const mongoose = require("mongoose");

const proveedorSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    contacto: { type: String },
    telefono: { type: String },
    email: { type: String },
    direccion: { type: String },
    cuit: { type: String },
    cbu: { type: String },
    alias: { type: String },
    banco: { type: String },
    condicionPago: { type: String, default: "" },
    notas: { type: String },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Proveedor = mongoose.model("Proveedor", proveedorSchema);
module.exports = Proveedor;
