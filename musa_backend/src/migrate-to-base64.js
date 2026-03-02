/**
 * Script de migración: convierte rutas de archivo a base64 en MongoDB.
 *
 * Uso: node src/migrate-to-base64.js [ruta_uploads] [ruta_comprobantes]
 *
 * Por defecto busca las carpetas en:
 *   - ../uploads  y  ../../uploads
 *   - ../comprobantes  y  ../../comprobantes
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Product = require("./models/productModel");
const Operacion = require("./models/operacion");
const Flujo = require("./models/flujo");
const PagoProveedor = require("./models/pagoProveedor");
const OrdenCompra = require("./models/ordenCompra");
const Venta = require("./models/venta");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("ERROR: MONGO_URI no definido en .env");
  process.exit(1);
}

// Carpetas donde buscar archivos (el usuario las dejó en el root del proyecto)
const SEARCH_DIRS = [
  path.resolve(__dirname, ".."),          // musa_backend/
  path.resolve(__dirname, "..", ".."),     // root del proyecto (musa/)
];

function findFile(filePath) {
  if (!filePath) return null;

  // Si es ruta absoluta y existe
  if (path.isAbsolute(filePath) && fs.existsSync(filePath)) return filePath;

  // Buscar en cada directorio base
  for (const dir of SEARCH_DIRS) {
    const full = path.join(dir, filePath);
    if (fs.existsSync(full)) return full;
  }

  // Intentar solo con el nombre del archivo
  const basename = path.basename(filePath);
  for (const dir of SEARCH_DIRS) {
    // buscar en uploads/
    const inUploads = path.join(dir, "uploads", basename);
    if (fs.existsSync(inUploads)) return inUploads;
    // buscar en comprobantes/
    const inComp = path.join(dir, "comprobantes", basename);
    if (fs.existsSync(inComp)) return inComp;
  }

  return null;
}

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimes = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".pdf": "application/pdf", ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return mimes[ext] || "application/octet-stream";
}

function toBase64(filePath) {
  const resolved = findFile(filePath);
  if (!resolved) return null;
  const buffer = fs.readFileSync(resolved);
  const mime = getMime(resolved);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function migrateCollection(Model, field, label) {
  // Buscar docs donde el campo existe, no está vacío, y NO empieza con "data:"
  const docs = await Model.find({
    [field]: { $exists: true, $ne: null, $ne: "", $not: /^data:/ },
  }).select(`_id ${field}`).lean();

  let migrated = 0, failed = 0, skipped = 0;
  console.log(`\n${label}: ${docs.length} registros con rutas de archivo`);

  for (const doc of docs) {
    const val = doc[field];
    if (!val || val.startsWith("data:") || val.startsWith("http")) {
      skipped++;
      continue;
    }

    const base64 = toBase64(val);
    if (base64) {
      await Model.findByIdAndUpdate(doc._id, { [field]: base64 });
      migrated++;
    } else {
      console.warn(`  ✗ No encontrado: ${val}`);
      failed++;
    }
  }

  console.log(`  ✓ Migrados: ${migrated} | ✗ No encontrados: ${failed} | Omitidos: ${skipped}`);
  return { migrated, failed, skipped };
}

async function main() {
  console.log("Conectando a MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("Conectado.\n");

  const totals = { migrated: 0, failed: 0, skipped: 0 };

  // 1. Productos: campo "foto"
  const r1 = await migrateCollection(Product, "foto", "Productos (foto)");
  totals.migrated += r1.migrated; totals.failed += r1.failed;

  // 2. Operaciones: campo "filePath"
  const r2 = await migrateCollection(Operacion, "filePath", "Operaciones (filePath)");
  totals.migrated += r2.migrated; totals.failed += r2.failed;

  // 3. Flujos: campo "filePath"
  const r3 = await migrateCollection(Flujo, "filePath", "Flujos (filePath)");
  totals.migrated += r3.migrated; totals.failed += r3.failed;

  // 4. PagosProveedor: campo "filePath"
  const r4 = await migrateCollection(PagoProveedor, "filePath", "PagosProveedor (filePath)");
  totals.migrated += r4.migrated; totals.failed += r4.failed;

  // 5. OrdenCompra: facturas[].archivo (subdocumentos embebidos)
  {
    const ordenes = await OrdenCompra.find({ "facturas.archivo": { $exists: true, $ne: "" } });
    let migrated = 0, failed = 0;
    console.log(`\nOrdenCompra facturas (archivo): ${ordenes.length} ordenes con facturas`);
    for (const orden of ordenes) {
      let changed = false;
      for (const factura of orden.facturas) {
        if (!factura.archivo || factura.archivo.startsWith("data:") || factura.archivo.startsWith("http")) continue;
        const base64 = toBase64(factura.archivo);
        if (base64) {
          factura.archivo = base64;
          changed = true;
          migrated++;
        } else {
          console.warn(`  ✗ No encontrado: ${factura.archivo}`);
          failed++;
        }
      }
      if (changed) await orden.save();
    }
    console.log(`  ✓ Migrados: ${migrated} | ✗ No encontrados: ${failed}`);
    totals.migrated += migrated; totals.failed += failed;
  }

  // 6. Ventas: facturaPdf desde archivos locales en src/facturas/
  {
    const ventas = await Venta.find({
      stringNumeroFactura: { $exists: true, $ne: null, $ne: "" },
      $or: [{ facturaPdf: null }, { facturaPdf: { $exists: false } }],
    }).select("_id stringNumeroFactura").lean();
    let migrated = 0, failed = 0;
    console.log(`\nVentas facturaPdf: ${ventas.length} ventas sin PDF en base64`);
    for (const v of ventas) {
      const fileName = `${v.stringNumeroFactura}.pdf`;
      const candidates = [
        path.join(__dirname, "facturas", fileName),
        ...SEARCH_DIRS.map(d => path.join(d, "facturas", fileName)),
      ];
      const found = candidates.find(p => fs.existsSync(p));
      if (found) {
        const buffer = fs.readFileSync(found);
        await Venta.findByIdAndUpdate(v._id, { facturaPdf: buffer.toString("base64") });
        migrated++;
      } else {
        console.warn(`  ✗ No encontrado: ${fileName}`);
        failed++;
      }
    }
    console.log(`  ✓ Migrados: ${migrated} | ✗ No encontrados: ${failed}`);
    totals.migrated += migrated; totals.failed += failed;
  }

  // 7. Ventas: notaCreditoPdf desde archivos locales en src/notas_de_credito/
  {
    const ventas = await Venta.find({
      stringNumeroNotaCredito: { $exists: true, $ne: null, $ne: "" },
      $or: [{ notaCreditoPdf: null }, { notaCreditoPdf: { $exists: false } }],
    }).select("_id stringNumeroNotaCredito").lean();
    let migrated = 0, failed = 0;
    console.log(`\nVentas notaCreditoPdf: ${ventas.length} ventas sin nota de crédito PDF en base64`);
    for (const v of ventas) {
      const fileName = `${v.stringNumeroNotaCredito}.pdf`;
      // Buscar en src/notas_de_credito/ y en carpetas alternativas
      const candidates = [
        path.join(__dirname, "notas_de_credito", fileName),
        ...SEARCH_DIRS.map(d => path.join(d, "notas_de_credito", fileName)),
      ];
      const found = candidates.find(p => fs.existsSync(p));
      if (found) {
        const buffer = fs.readFileSync(found);
        await Venta.findByIdAndUpdate(v._id, { notaCreditoPdf: buffer.toString("base64") });
        migrated++;
      } else {
        console.warn(`  ✗ No encontrado: ${fileName}`);
        failed++;
      }
    }
    console.log(`  ✓ Migrados: ${migrated} | ✗ No encontrados: ${failed}`);
    totals.migrated += migrated; totals.failed += failed;
  }

  console.log("\n══════════════════════════════════════");
  console.log(`TOTAL: ${totals.migrated} migrados, ${totals.failed} no encontrados`);
  console.log("══════════════════════════════════════");

  if (totals.failed > 0) {
    console.log("\n⚠ Algunos archivos no se encontraron. Verifica que las carpetas uploads/ y comprobantes/ estén en el root del proyecto.");
  }

  await mongoose.disconnect();
  console.log("\nDesconectado de MongoDB. Migración completada.");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
