const mongoose = require("mongoose");

const planClubSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    descripcion: { type: String },
    precioMensual: { type: Number, required: true },
    cantidadVinos: { type: Number, required: true },
    beneficios: [{ type: String }],
    activo: { type: Boolean, default: true },
    orden: { type: Number, default: 0 },
    destacado: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const suscripcionClubSchema = new mongoose.Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "PlanClub", required: true },
    planNombre: { type: String },
    cliente: {
      nombre: { type: String, required: true },
      email: { type: String, required: true },
      telefono: { type: String, required: true },
      direccion: { type: String },
    },
    estado: {
      type: String,
      enum: ["pendiente", "activa", "pausada", "cancelada"],
      default: "pendiente",
    },
    precioMensual: { type: Number },
    preferencias: { type: String },
    notas: { type: String },
    clienteId: { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", default: null },
  },
  { timestamps: true }
);

const PlanClub = mongoose.model("PlanClub", planClubSchema);
const SuscripcionClub = mongoose.model("SuscripcionClub", suscripcionClubSchema);

module.exports = { PlanClub, SuscripcionClub };
