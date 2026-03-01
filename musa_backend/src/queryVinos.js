const mongoose = require("mongoose");
const Product = require("./models/productModel");

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://valentingrecoh1_db_user:musa@musa.wpsxszq.mongodb.net/?appName=musa";

async function query() {
  await mongoose.connect(MONGO_URI);
  const vinos = await Product.find({ tipo: "vino" })
    .select("nombre bodega cepa year origen descripcion cantidad venta _id")
    .sort({ bodega: 1, nombre: 1 })
    .lean();

  console.log(`Total vinos: ${vinos.length}`);
  console.log("---");
  vinos.forEach((v) => {
    const hasDesc = v.descripcion && v.descripcion.trim().length > 0;
    console.log(`ID: ${v._id}`);
    console.log(`  Nombre: ${v.nombre || '-'}`);
    console.log(`  Bodega: ${v.bodega || '-'}`);
    console.log(`  Cepa: ${v.cepa || '-'}`);
    console.log(`  Año: ${v.year || '-'}`);
    console.log(`  Origen: ${v.origen || '-'}`);
    console.log(`  Precio: ${v.venta || '-'}`);
    console.log(`  Stock: ${v.cantidad}`);
    console.log(`  Desc: ${hasDesc ? v.descripcion.substring(0, 80) + '...' : '(sin descripcion)'}`);
    console.log("---");
  });

  await mongoose.disconnect();
}

query();
