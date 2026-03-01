const mongoose = require("mongoose");

const Flujo = new mongoose.Schema(
  {
    fecha: { type: String },
    fechaPago: { type: String },
    nombre: { type: String },
    importe: { type: Number }, //ESTABA COMO STRING
    beneficiario: { type: String },
    descripcion: { type: String },
    filePath: { type: String },
    enviado: { type: Boolean },
  },
  { timestamps: true }
);

const FlujoModel = mongoose.model("Flujo", Flujo);

module.exports = FlujoModel;
