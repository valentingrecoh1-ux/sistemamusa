const mongoose = require("mongoose");

const usuarioSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rol: {
      type: String,
      required: true,
      enum: ["admin", "comprador", "recepcion", "vendedor"],
    },
    permisos: { type: [String], default: [] },
    foto: { type: String, default: "" },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Usuario = mongoose.model("Usuario", usuarioSchema);
module.exports = Usuario;
