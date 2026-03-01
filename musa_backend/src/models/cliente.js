const mongoose = require("mongoose");

const clienteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    email: { type: String },
    telefono: { type: String },
    cuit: { type: String },
    razonSocial: { type: String },
    domicilio: { type: String },
    localidad: { type: String },
    provincia: { type: String },
    notas: { type: String },
    tags: [String],
  },
  { timestamps: true }
);

const Cliente = mongoose.model("Cliente", clienteSchema);
module.exports = Cliente;
