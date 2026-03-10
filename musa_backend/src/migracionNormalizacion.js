/**
 * Migracion: normalizar cepas, bodegas y regiones
 * - Corrige productos tipo "articulo" que tienen cepa/bodega/origen cuando no deberian
 * - Unifica variantes de nombre (mayusculas, acentos, espacios, typos)
 * - Limpia cepas que en realidad son nombres de producto o blends mal cargados
 */

// Items que NO son cepas de uva - son nombres de producto, tipos de bebida, etc.
const NO_SON_CEPAS = [
  /^aceite/i,
  /^agua/i,
  /^american\s*(ipa|pale|lager|amber|stout|wheat)/i,
  /^ipa$/i,
  /^lager$/i,
  /^stout$/i,
  /^porter$/i,
  /^pilsner$/i,
  /^cerveza/i,
  /^bitter$/i,
  /^gin$/i,
  /^vodka$/i,
  /^whisky/i,
  /^fernet/i,
  /^espumante$/i,
  /^champagne$/i,
  /^sidra/i,
  /^licor/i,
  /^vermouth/i,
  /^aperitivo/i,
  /^balsamina/i,
];

// Mapa de normalizacion de cepas (variantes → nombre correcto)
const NORMALIZAR_CEPAS = {
  // Malbec
  "malbec": "Malbec",
  "malbeck": "Malbec",
  "mal bec": "Malbec",
  // Cabernet Sauvignon
  "cabernet sauvignon": "Cabernet Sauvignon",
  "cab sauvignon": "Cabernet Sauvignon",
  "cabernet sauv": "Cabernet Sauvignon",
  "cab. sauvignon": "Cabernet Sauvignon",
  "cabernet sauvgnon": "Cabernet Sauvignon",
  // Cabernet Franc
  "cabernet franc": "Cabernet Franc",
  "cab franc": "Cabernet Franc",
  "cab. franc": "Cabernet Franc",
  // Merlot
  "merlot": "Merlot",
  // Pinot Noir
  "pinot noir": "Pinot Noir",
  "pinot negro": "Pinot Noir",
  // Syrah / Shiraz
  "syrah": "Syrah",
  "shiraz": "Syrah",
  // Bonarda
  "bonarda": "Bonarda",
  // Tempranillo
  "tempranillo": "Tempranillo",
  // Tannat
  "tannat": "Tannat",
  // Petit Verdot
  "petit verdot": "Petit Verdot",
  "petite verdot": "Petit Verdot",
  // Chardonnay
  "chardonnay": "Chardonnay",
  "chardonay": "Chardonnay",
  "chardonney": "Chardonnay",
  // Sauvignon Blanc
  "sauvignon blanc": "Sauvignon Blanc",
  "sauvignon blanco": "Sauvignon Blanc",
  // Torrontes
  "torrontes": "Torrontés",
  "torrontés": "Torrontés",
  "torrontes riojano": "Torrontés",
  // Viognier
  "viognier": "Viognier",
  // Semillon
  "semillon": "Sémillon",
  "sémillon": "Sémillon",
  "semillón": "Sémillon",
  // Chenin
  "chenin": "Chenin",
  "chenin blanc": "Chenin",
  // Gewurztraminer
  "gewurztraminer": "Gewürztraminer",
  "gewürztraminer": "Gewürztraminer",
  // Riesling
  "riesling": "Riesling",
  // Pinot Gris / Grigio
  "pinot gris": "Pinot Gris",
  "pinot grigio": "Pinot Gris",
  // Moscatel
  "moscatel": "Moscatel",
  "moscato": "Moscatel",
  // Criolla
  "criolla": "Criolla",
  // Sangiovese
  "sangiovese": "Sangiovese",
  // Ancellotta
  "ancellotta": "Ancellotta",
  // Barbera
  "barbera": "Barbera",
  // Marselan
  "marselan": "Marselan",
  // Garnacha / Grenache
  "garnacha": "Garnacha",
  "grenache": "Garnacha",
  // Carmenere
  "carmenere": "Carménère",
  "carménère": "Carménère",
  // Touriga Nacional
  "touriga nacional": "Touriga Nacional",
  "touriga": "Touriga Nacional",
  // Aglianico
  "aglianico": "Aglianico",
  // Aspirant Bouchet
  "aspirant bouchet": "Aspirant Bouchet",
  // Bequignol
  "bequignol": "Bequignol",
};

// Mapa de normalizacion de regiones
const NORMALIZAR_REGIONES = {
  "mendoza": "Mendoza",
  "valle de uco": "Valle de Uco",
  "valle de uco, mendoza": "Valle de Uco",
  "uco valley": "Valle de Uco",
  "lujan de cuyo": "Luján de Cuyo",
  "luján de cuyo": "Luján de Cuyo",
  "lujan": "Luján de Cuyo",
  "maipu": "Maipú",
  "maipú": "Maipú",
  "san rafael": "San Rafael",
  "san martin": "San Martín",
  "san martín": "San Martín",
  "la consulta": "La Consulta",
  "tupungato": "Tupungato",
  "tunuyan": "Tunuyán",
  "tunuyán": "Tunuyán",
  "san carlos": "San Carlos",
  "cafayate": "Cafayate",
  "salta": "Salta",
  "calchaqui": "Valles Calchaquíes",
  "valles calchaquies": "Valles Calchaquíes",
  "valles calchaquíes": "Valles Calchaquíes",
  "patagonia": "Patagonia",
  "rio negro": "Río Negro",
  "río negro": "Río Negro",
  "neuquen": "Neuquén",
  "neuquén": "Neuquén",
  "san juan": "San Juan",
  "la rioja": "La Rioja",
  "catamarca": "Catamarca",
  "buenos aires": "Buenos Aires",
  "chapadmalal": "Chapadmalal",
  "sierra de la ventana": "Sierra de la Ventana",
  "entre rios": "Entre Ríos",
  "entre ríos": "Entre Ríos",
  "cordoba": "Córdoba",
  "córdoba": "Córdoba",
};

function normalizar(valor, mapa) {
  if (!valor) return valor;
  const trimmed = valor.trim();
  const key = trimmed.toLowerCase();
  return mapa[key] || trimmed;
}

function esCepaInvalida(cepa) {
  if (!cepa) return false;
  return NO_SON_CEPAS.some((regex) => regex.test(cepa.trim()));
}

async function migrarNormalizacion(Product) {
  let cambios = 0;

  // 1. Productos tipo "articulo" o "servicio" que tienen cepa/bodega/origen → limpiar
  const noVinos = await Product.find({
    tipo: { $in: ["articulo", "servicio"] },
    $or: [
      { cepa: { $ne: null, $ne: "" } },
    ],
  });
  for (const prod of noVinos) {
    // Los articulos no tienen cepa vinícola
    // Pero si la cepa describe el producto (ej "Aceite de oliva"), moverla a descripcion si no tiene
    const update = {};
    if (prod.cepa && esCepaInvalida(prod.cepa)) {
      update.cepa = "";
    }
    if (Object.keys(update).length > 0) {
      await Product.updateOne({ _id: prod._id }, { $set: update });
      cambios++;
    }
  }

  // 2. Vinos cuya "cepa" no es realmente una cepa
  const vinosConCepaRara = await Product.find({
    $or: [{ tipo: "vino" }, { tipo: { $exists: false } }, { tipo: null }],
    cepa: { $ne: null, $ne: "" },
  });
  for (const prod of vinosConCepaRara) {
    if (esCepaInvalida(prod.cepa)) {
      // Probablemente es un articulo mal categorizado → cambiar tipo
      await Product.updateOne({ _id: prod._id }, { $set: { tipo: "articulo", cepa: "" } });
      cambios++;
      continue;
    }
    // Normalizar nombre de cepa
    const cepaNorm = normalizar(prod.cepa, NORMALIZAR_CEPAS);
    const origenNorm = prod.origen ? normalizar(prod.origen, NORMALIZAR_REGIONES) : prod.origen;
    const bodegaNorm = prod.bodega ? prod.bodega.trim() : prod.bodega;
    const update = {};
    if (cepaNorm !== prod.cepa) update.cepa = cepaNorm;
    if (origenNorm !== prod.origen) update.origen = origenNorm;
    if (bodegaNorm !== prod.bodega) update.bodega = bodegaNorm;
    if (Object.keys(update).length > 0) {
      await Product.updateOne({ _id: prod._id }, { $set: update });
      cambios++;
    }
  }

  // 3. Normalizar bodegas (trim espacios)
  const conBodega = await Product.find({ bodega: { $ne: null, $ne: "" } });
  for (const prod of conBodega) {
    const trimmed = prod.bodega.trim();
    if (trimmed !== prod.bodega) {
      await Product.updateOne({ _id: prod._id }, { $set: { bodega: trimmed } });
      cambios++;
    }
  }

  // 4. Normalizar regiones
  const conOrigen = await Product.find({ origen: { $ne: null, $ne: "" } });
  for (const prod of conOrigen) {
    const norm = normalizar(prod.origen, NORMALIZAR_REGIONES);
    if (norm !== prod.origen) {
      await Product.updateOne({ _id: prod._id }, { $set: { origen: norm } });
      cambios++;
    }
  }

  return cambios;
}

module.exports = { migrarNormalizacion, normalizar, NORMALIZAR_CEPAS, NORMALIZAR_REGIONES };
