const mongoose = require("mongoose");

const configTiendaSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "main" },
    bannerTexto: { type: String, default: "Bienvenido a MUSA Vinoteca" },
    bannerSubtexto: { type: String, default: "Los mejores vinos seleccionados para vos" },
    bannerImagen: { type: String },
    whatsappNumero: { type: String, default: "" },
    aboutTexto: { type: String, default: "" },
    envioHabilitado: { type: Boolean, default: false },
    costoEnvio: { type: Number, default: 0 },
    retiroEnLocal: { type: Boolean, default: true },
    direccionLocal: { type: String, default: "" },
    // Logistica integrada
    shipnowToken: { type: String, default: "" },
    shipnowActivo: { type: Boolean, default: false },
    moovaAppId: { type: String, default: "" },
    moovaApiKey: { type: String, default: "" },
    moovaActivo: { type: Boolean, default: false },
    origenEnvio: {
      direccion: { type: String, default: "" },
      codigoPostal: { type: String, default: "" },
      ciudad: { type: String, default: "CABA" },
      provincia: { type: String, default: "CABA" },
      contactoNombre: { type: String, default: "" },
      contactoTelefono: { type: String, default: "" },
    },
    horarios: { type: String, default: "" },
    instagramUrl: { type: String, default: "" },
    tiendaActiva: { type: Boolean, default: true },
    fotosEventos: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ConfigTienda", configTiendaSchema);
