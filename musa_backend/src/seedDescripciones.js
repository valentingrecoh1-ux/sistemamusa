const mongoose = require("mongoose");
const Product = require("./models/productModel");

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://valentingrecoh1_db_user:musa@musa.wpsxszq.mongodb.net/?appName=musa";

const DESCRIPCIONES = {
  // Memoria de Elefante - Merlot 2023
  "69727e636936ed90b565ce1f":
    `Merlot del Valle de Pedernal, San Juan, elaborado por Elefante Wines, el proyecto familiar de Juli Rauek y Felipe Azcona que nacio en 2013 con apenas 1.000 kg de uva en un garaje. Hoy producen 40.000 botellas al año repartidas en 18 etiquetas. Este Merlot pertenece a la linea premium "Memoria de Elefante" (Capitulo V): pasa por maceracion en frio y fermentacion en tanques de acero, seguido de 12 meses en barrica usada. En nariz ofrece notas de madera especiada, con recuerdos a palo santo. En boca tiene acidez media, taninos moderados y un final de largo medio, muy agradable. Un vino de autor con identidad sanjuanina.`,

  // La Mala María y los Brujos - Vermut tipo francés
  "6967db0a1fd25be8b4ed13bb":
    `Vermut estilo frances artesanal creado por Maria Celeste Alvaro, enologa mendocina que fundo La Mala Maria en 2016. Lo que empezo con 1.000 botellas hoy supera las 80.000 unidades que se venden en todo el pais y se exportan a Brasil e Inglaterra. "Los Brujos Botanistas" es su linea de vermut, elaborada con base de uva Criolla Blanca del sur de Mendoza y una infusion de 11 botanicos que incluyen cascara de naranja, canela, ajenjo, pimienta de Jamaica, hibiscus, pimienta blanca, tomillo, salvia y lavanda. Es la primera fabrica oficial de vermut de Mendoza. El nombre "La Mala Maria" juega con el prejuicio social contra las mujeres con caracter: Celeste defiende el espacio femenino en la enologia con actitud y arte, con etiquetas ilustradas por la muralista Federica del Olmo.`,

  // Barro vino - Lucas Niven - Criolla
  "6967e1691fd25be8b4ed14f8":
    `Vino de uva Criolla elaborado por Lucas Niven en Junin, Mendoza, una de las zonas historicas de la viticultura argentina. La bodega familiar tiene raices desde 1920 en tierras que pertenecieron al General San Martin, conocidas como "Chacra de los Barriales" porque cuando llovia el barro hacia el camino intransitable, de ahi el nombre de este vino. Lucas Niven es uno de los enologos mas audaces del pais: empezo en 2012 con 2.700 botellas y hoy produce 250.000. Es un defensor de las cepas Criollas, las variedades mas antiguas de Argentina traidas por los misioneros españoles en el siglo XVI. Su trabajo en bodega es de minima intervencion, logrando vinos brillantes, con caracter y gran bebibilidad. Un homenaje al terroir y a la historia vitivinicola del este mendocino.`,

  // Corazón Valiente - Lucas Niven - Malbec - Jujuy
  "6967e2801fd25be8b4ed1572":
    `Malbec de altura extrema elaborado por Lucas Niven con uvas de viñedos de Purmamarca y Tumbaya, en la Quebrada de Humahuaca, Jujuy, a 2.380 metros sobre el nivel del mar. Es el primer vino de Niven Wines producido fuera de Mendoza, una apuesta valiente (como su nombre) por una de las regiones vitivinicolas mas altas del mundo. La altitud le da un perfil aromatico exotico, con notas herbales, vegetales, florales y recuerdos a pimiento fresco. En boca es intenso, con acidez vibrante y taninos firmes que piden decantacion de al menos una hora. Se recomienda servir entre 16 y 18°C. Un vino que refleja el espiritu inquieto de Lucas Niven, quien desde su bodega familiar en Junin, Mendoza, busca los terroirs mas extremos de Argentina.`,
};

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Conectado a MongoDB");

    for (const [id, descripcion] of Object.entries(DESCRIPCIONES)) {
      const result = await Product.findByIdAndUpdate(
        id,
        { descripcion, descripcionIA: true },
        { new: true }
      );
      if (result) {
        console.log(`Actualizado: ${result.nombre} (descripcionIA: true)`);
      } else {
        console.log(`No encontrado: ID ${id}`);
      }
    }

    await mongoose.disconnect();
    console.log("\nListo! Descripciones actualizadas con flag descripcionIA.");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

seed();
