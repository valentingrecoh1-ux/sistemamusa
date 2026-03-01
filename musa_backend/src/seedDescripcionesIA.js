require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Product = require("./models/productModel");

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://valentingrecoh1_db_user:musa@musa.wpsxszq.mongodb.net/?appName=musa";

const AI_KEY_ANTHROPIC = process.env.ANTHROPIC_API_KEY;
const AI_KEY_OPENAI = process.env.OPENAI_API_KEY;
const TEXT_KEY = AI_KEY_ANTHROPIC || AI_KEY_OPENAI;
const TEXT_PROVIDER = AI_KEY_ANTHROPIC ? "anthropic" : AI_KEY_OPENAI ? "openai" : null;

// Parametros: node seedDescripcionesIA.js --skip 0 --limit 50
const args = process.argv.slice(2);
const skipIdx = args.indexOf("--skip");
const limitIdx = args.indexOf("--limit");
const SKIP = skipIdx !== -1 ? parseInt(args[skipIdx + 1]) || 0 : 0;
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || 50 : 50;

async function generarDescripcion(producto) {
  const esVino = producto.tipo === "vino";
  const prompt = esVino
    ? `Sos un sommelier argentino experto con profundo conocimiento de bodegas y terroirs. Genera una descripcion comercial premium para este vino. Investiga y mencioná datos reales: terroir, altitud de viñedos si aplica, notas de cata (aroma, sabor, final), temperatura de servicio, y maridaje ideal. Entre 80 y 150 palabras. No uses markdown, comillas ni formato especial. Escribi en español rioplatense natural.

Vino: ${producto.nombre || ""}
Bodega: ${producto.bodega || ""}
Cepa: ${producto.cepa || ""}
Año: ${producto.year || ""}
Origen: ${producto.origen || ""}

Responde SOLO con la descripcion, sin comillas ni formato.`
    : `Genera una descripcion comercial atractiva para este producto de vinoteca. Entre 40 y 80 palabras. No uses markdown, comillas ni formato especial. Escribi en español rioplatense natural.

Producto: ${producto.nombre || ""}
Tipo: ${producto.tipo || ""}
${producto.bodega ? `Marca/Bodega: ${producto.bodega}` : ""}

Responde SOLO con la descripcion, sin comillas ni formato.`;

  if (TEXT_PROVIDER === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": TEXT_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || null;
  } else {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEXT_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  if (!TEXT_KEY) {
    console.error("No hay API key de IA disponible (ANTHROPIC_API_KEY o OPENAI_API_KEY)");
    process.exit(1);
  }

  console.log(`Usando proveedor: ${TEXT_PROVIDER} | skip: ${SKIP} | limit: ${LIMIT}`);

  await mongoose.connect(MONGO_URI);
  console.log("Conectado a MongoDB");

  const total = await Product.countDocuments({});
  const productos = await Product.find({}).sort({ _id: 1 }).skip(SKIP).limit(LIMIT).lean();

  console.log(`Procesando ${productos.length} de ${total} productos (desde ${SKIP})`);

  let ok = 0;
  let errores = 0;

  for (let i = 0; i < productos.length; i++) {
    const p = productos[i];
    const info = `${p.nombre || "?"} - ${p.bodega || "?"} - ${p.cepa || "?"}`;

    try {
      const desc = await generarDescripcion(p);
      if (desc && desc.length > 10) {
        await Product.findByIdAndUpdate(p._id, {
          descripcionGenerada: desc,
          usarDescripcionIA: true,
        });
        ok++;
        console.log(`[${SKIP + i + 1}/${total}] OK: ${info}`);
      } else {
        errores++;
        console.log(`[${SKIP + i + 1}/${total}] SIN RESULTADO: ${info}`);
      }
    } catch (err) {
      errores++;
      console.error(`[${SKIP + i + 1}/${total}] ERROR: ${info} - ${err.message}`);
    }

    if (i < productos.length - 1) {
      await sleep(TEXT_PROVIDER === "anthropic" ? 300 : 200);
    }
  }

  console.log(`\nTanda completada: ${ok} OK, ${errores} errores`);
  if (SKIP + LIMIT < total) {
    console.log(`Siguiente tanda: node src/seedDescripcionesIA.js --skip ${SKIP + LIMIT} --limit ${LIMIT}`);
  } else {
    console.log("Todas las tandas completadas!");
  }
  await mongoose.disconnect();
  process.exit(0);
}

run();
