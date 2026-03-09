const mongoose = require("mongoose");
const crypto = require("crypto");

const clienteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    apellido: { type: String },
    dni: { type: String },
    whatsapp: { type: String },
    email: { type: String },
    telefono: { type: String },
    cuit: { type: String },
    razonSocial: { type: String },
    domicilio: { type: String },
    localidad: { type: String },
    provincia: { type: String },
    notas: { type: String },
    tags: [String],
    tokenAcceso: { type: String, unique: true, sparse: true },
    estadoPerfil: { type: String, enum: ["aprobado", "pendiente"], default: "aprobado" },
    autoRegistro: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Auto-generate access token on save if not present
clienteSchema.pre("save", function (next) {
  if (!this.tokenAcceso) {
    this.tokenAcceso = crypto.randomBytes(16).toString("hex");
  }
  next();
});

const Cliente = mongoose.model("Cliente", clienteSchema);
module.exports = Cliente;
