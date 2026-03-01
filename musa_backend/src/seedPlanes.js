const mongoose = require("mongoose");
const { PlanClub } = require("./models/suscripcionClub");

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://valentingrecoh1_db_user:musa@musa.wpsxszq.mongodb.net/?appName=musa";

const PLANES = [
  {
    nombre: "Paladar Curioso",
    descripcion:
      "Ideal para quienes se inician en el mundo del vino. Cada mes recibis 2 varietales distintos con una guia de cata para que aprendas a reconocer aromas, sabores y las diferencias entre cada cepa. Tu viaje enologico empieza aca.",
    precioMensual: 15000,
    cantidadVinos: 2,
    beneficios: [
      "2 vinos de diferentes cepas cada mes",
      "Guia de cata impresa con cada envio",
      "Acceso a degustaciones virtuales mensuales",
      "10% de descuento en la tienda online",
    ],
    activo: true,
    orden: 1,
    destacado: false,
  },
  {
    nombre: "Nariz Fina",
    descripcion:
      "Para los que ya conocen lo basico y quieren afinar su paladar. Recibis 3 vinos cuidadosamente seleccionados que te desafian a distinguir matices, terroirs y estilos de vinificacion. Cada envio viene con notas del sommelier para guiar tu experiencia.",
    precioMensual: 25000,
    cantidadVinos: 3,
    beneficios: [
      "3 vinos seleccionados por nuestro sommelier",
      "Notas de cata detalladas del sommelier",
      "Maridajes sugeridos para cada vino",
      "Invitacion a catas presenciales bimestrales",
      "15% de descuento en la tienda online",
    ],
    activo: true,
    orden: 2,
    destacado: true,
  },
  {
    nombre: "Sommelier",
    descripcion:
      "La seleccion premium para paladares entrenados. 4 etiquetas de bodegas reconocidas y de autor, incluyendo ediciones limitadas y cosechas especiales. Aprende como un profesional con fichas tecnicas completas y acceso directo a nuestro sommelier.",
    precioMensual: 40000,
    cantidadVinos: 4,
    beneficios: [
      "4 vinos premium y de edicion limitada",
      "Fichas tecnicas profesionales",
      "Canal directo con el sommelier por WhatsApp",
      "Acceso prioritario a vinos exclusivos",
      "Invitacion a todas las catas y eventos",
      "20% de descuento en la tienda online",
    ],
    activo: true,
    orden: 3,
    destacado: false,
  },
  {
    nombre: "Paladar Experto",
    descripcion:
      "La experiencia mas completa para verdaderos apasionados. 6 vinos de alta gama, incluyendo grandes reservas, vinos de guarda y joyas enologicas dificiles de conseguir. Con asesoramiento personalizado para armar tu propia cava.",
    precioMensual: 65000,
    cantidadVinos: 6,
    beneficios: [
      "6 vinos de alta gama y gran reserva",
      "Vinos de guarda y ediciones de coleccion",
      "Asesoramiento personalizado para tu cava",
      "Sommelier exclusivo para consultas ilimitadas",
      "Acceso VIP a todos los eventos y lanzamientos",
      "Prioridad en preventa de etiquetas limitadas",
      "25% de descuento en la tienda online",
    ],
    activo: true,
    orden: 4,
    destacado: false,
  },
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Conectado a MongoDB");

    // Verificar si ya existen planes
    const existentes = await PlanClub.countDocuments();
    if (existentes > 0) {
      console.log(`Ya existen ${existentes} planes. Eliminando para reemplazar...`);
      await PlanClub.deleteMany({});
    }

    const result = await PlanClub.insertMany(PLANES);
    console.log(`${result.length} planes creados:`);
    result.forEach((p) => console.log(`  - ${p.nombre}: $${p.precioMensual}/mes (${p.cantidadVinos} vinos)`));

    await mongoose.disconnect();
    console.log("Listo!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

seed();
