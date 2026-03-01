require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://valentingrecoh1_db_user:musa@musa.wpsxszq.mongodb.net/?appName=musa";

mongoose.connect(MONGO_URI).then(async () => {
  const PagoMp = mongoose.connection.collection("pagomps");

  // Clasificar money_transfer como gasto
  const fix = await PagoMp.updateMany(
    { operationType: "money_transfer", tipoMovimiento: { $ne: "gasto" } },
    { $set: { tipoMovimiento: "gasto" } }
  );
  console.log("money_transfer → gasto:", fix.modifiedCount);

  // Verificar
  const cobros = await PagoMp.countDocuments({ tipoMovimiento: "cobro" });
  const gastos = await PagoMp.countDocuments({ tipoMovimiento: "gasto" });
  console.log("cobros:", cobros, "| gastos:", gastos);

  await mongoose.disconnect();
});
