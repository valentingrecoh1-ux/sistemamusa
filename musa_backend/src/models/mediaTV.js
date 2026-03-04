const mongoose = require("mongoose");

const mediaTVSchema = new mongoose.Schema(
  {
    nombre: { type: String },
    tipo: { type: String, enum: ["imagen"], default: "imagen" },
    archivo: { type: String },
    orden: { type: Number, default: 0 },
    activo: { type: Boolean, default: true },
    duracion: { type: Number, default: 8 },
    rotacion: { type: Number, default: 0 },
    subidoPor: { type: String },
  },
  { timestamps: true }
);

const MediaTV = mongoose.model("MediaTV", mediaTVSchema);
module.exports = MediaTV;
