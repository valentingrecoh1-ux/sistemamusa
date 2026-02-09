const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const multer = require("multer");
const cors = require("cors");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const Product = require("./models/productModel");
const Venta = require("./models/venta");
const Operacion = require("./models/operacion");
const Turno = require("./models/turno");
const Flujo = require("./models/flujo");

const AfipService = require("./AfipService");
const afipService = new AfipService({ CUIT: 20418588897 });

const PDFDocument = require("pdfkit");
const qr = require("qr-image");
const { print } = require("pdf-to-printer");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Cambia esto al origen de tu cliente
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Conectar a MongoDB
mongoose
  .connect("mongodb://127.0.0.1:27017/inventario")
  .then(() => console.log("Conectado a MongoDB"))
  .catch((err) => console.error("Error al conectar a MongoDB:", err));

// Configuración de CORS para Express
app.use(
  cors({
    origin: "*", // Cambia esto al origen de tu cliente
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// Configuración de multer para almacenar los archivos en la carpeta 'uploads'
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + "-" + file.originalname);
  },
});

const comprobantesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "comprobantes/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + "-" + file.originalname);
  },
});

const uploadComprobante = multer({
  storage: comprobantesStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para servir los archivos estáticos de la carpeta dist
app.use(express.static(path.join(__dirname, "dist")));

/*
app.use(
  "/.well-known/pki-validation/",
  express.static(path.join(__dirname, ".well-known/pki-validation"))
);
*/

// Sirviendo la carpeta 'uploads' de forma estática
app.use("/uploads", express.static("uploads"));
app.use("/comprobantes", express.static("comprobantes"));
app.use("/facturas", express.static("src/facturas"));

// Servir la aplicación principal (index.html) para cualquier ruta
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "dist", "index.html"));
});

app.post(
  "/upload_flujo",
  uploadComprobante.single("file"),
  async (req, res) => {
    const operacionData = req.body;
    const file = req.file;

    try {
      // Agregar la fecha actual a la operación si es una nueva (sin _id)
      if (!operacionData._id) {
        operacionData.fecha = moment(new Date())
          .tz("America/Argentina/Buenos_Aires")
          .format("YYYY-MM-DD");
      }

      // Si estamos editando (operacionData._id existe) y no hay un archivo nuevo, conservar el filePath existente
      if (operacionData._id && !file) {
        const existingOperacion = await Flujo.findById(operacionData._id);
        if (existingOperacion) {
          operacionData.filePath = existingOperacion.filePath; // Conservar el filePath existente
        }
      } else if (file) {
        // Si hay un archivo nuevo, actualizar filePath con el nuevo archivo
        operacionData.filePath = file.path;
      }

      // Crear o actualizar la operación
      if (operacionData._id) {
        await Flujo.findByIdAndUpdate(operacionData._id, operacionData);
      } else {
        await Flujo.create(operacionData);
      }

      // Emitir cambios a todos los clientes conectados
      io.emit("cambios");

      res.json({ status: "ok", message: "Operación guardada correctamente" });
    } catch (error) {
      console.error("Error al guardar la operación:", error);
      res
        .status(500)
        .json({ status: "error", message: "Error al guardar la operación" });
    }
  }
);

app.post(
  "/upload_operacion",
  uploadComprobante.single("file"),
  async (req, res) => {
    const operacionData = req.body;
    const file = req.file;

    try {
      // Agregar la fecha actual a la operación si es una nueva (sin _id)
      if (!operacionData._id) {
        operacionData.fecha = moment(new Date())
          .tz("America/Argentina/Buenos_Aires")
          .format("YYYY-MM-DD");
      }

      // Si estamos editando (operacionData._id existe) y no hay un archivo nuevo, conservar el filePath existente
      if (operacionData._id && !file) {
        const existingOperacion = await Operacion.findById(operacionData._id);
        if (existingOperacion) {
          operacionData.filePath = existingOperacion.filePath; // Conservar el filePath existente
        }
      } else if (file) {
        // Si hay un archivo nuevo, actualizar filePath con el nuevo archivo
        operacionData.filePath = file.path;
      }

      // Crear o actualizar la operación
      if (operacionData._id) {
        await Operacion.findByIdAndUpdate(operacionData._id, operacionData);
      } else {
        await Operacion.create(operacionData);
      }

      // Emitir cambios a todos los clientes conectados
      io.emit("cambios");

      res.json({ status: "ok", message: "Operación guardada correctamente" });
    } catch (error) {
      console.error("Error al guardar la operación:", error);
      res
        .status(500)
        .json({ status: "error", message: "Error al guardar la operación" });
    }
  }
);

app.post("/upload", upload.single("foto"), async (req, res) => {
  const formData = req.body;
  const file = req.file;
  try {
    if (formData._id) {
      // Buscar el producto existente
      const existingProduct = await Product.findById(formData._id);
      if (!existingProduct) {
        return res
          .status(404)
          .json({ status: "error", message: "Producto no encontrado" });
      }
      const product = {
        codigo: formData.codigo,
        bodega: formData.bodega,
        cepa: formData.cepa,
        nombre: formData.nombre,
        year: formData.year,
        origen: formData.origen,
        costo: formData.costo,
        venta: formData.venta,
        cantidad: formData.cantidad,
        posicion: formData.posicion,
        descripcion: formData.descripcion,
        foto: file ? file.path : existingProduct.foto,
      };
      await Product.findByIdAndUpdate(formData._id, product);
    } else {
      if (!formData.cantidad) {
        formData.cantidad = 0;
      }
      const newProduct = new Product({
        codigo: formData.codigo,
        bodega: formData.bodega,
        cepa: formData.cepa,
        nombre: formData.nombre,
        year: formData.year,
        origen: formData.origen,
        costo: formData.costo,
        venta: formData.venta,
        cantidad: formData.cantidad,
        posicion: formData.posicion,
        descripcion: formData.descripcion,
        foto: file ? file.path : "", // Usar una cadena vacía si no hay archivo
      });
      try {
        await newProduct.save();
      } catch (error) {
        res.json({ status: "error", message: "Codigo ya existe" });
        return;
      }
    }
    res.json({
      status: "ok",
      message: "Producto guardado y notificado a los clientes",
    });
    io.emit("cambios");
    // Emitir un evento a todos los clientes conectados con el nuevo producto
  } catch (error) {
    console.error("Error al guardar el producto:", error);
    res
      .status(500)
      .json({ status: "error", message: "Error al guardar el producto" });
  }
});

/* ============================
   Helpers AFIP / Formateo
   ============================ */
function mapTipoCmp({ factura, notaCredito }) {
  // AFIP: 1=Factura A, 3=Nota de Crédito A, 6=Factura B, 8=Nota de Crédito B
  if (notaCredito) return factura === "A" ? 3 : 8;
  return factura === "A" ? 1 : 6;
}

function pickDocTipoYNumero(data) {
  // Respetá lo que te devuelve AfipService si viene; sino inferí.
  const docTipo =
    data.docTipo ??
    data.tipoDoc ??
    (data.factura === "A"
      ? 80 // CUIT
      : data.dni
      ? 96
      : 99); // DNI o Consumidor Final

  const nroDoc = Number(
    Number(docTipo) === 99
      ? 0
      : data.cuit ?? data.dni ?? data.nroDoc ?? data.docNro ?? 0
  );

  return { docTipo: Number(docTipo), nroDoc };
}

function formatFechaCortaConHora(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return { fecha: `${dd}/${mm}/${yyyy}`, hora: `${hh}:${mi}:${ss}` };
}

function ymd(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ==========================================
   Función principal: imprimirTicket(data)
   ========================================== */
async function imprimirTicket(data) {
  const doc = new PDFDocument({
    size: "A7",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  // Cadenas con padding correcto
  const pvStr = data.puntoDeVenta.toString().padStart(6, "0");
  const nroStr = data.numeroComprobante.toString().padStart(8, "0");

  const stringNumeroComprobante = `${pvStr}-${nroStr}`;
  const nombrePath = `F${data.factura}-${pvStr}-${nroStr}`;

  // Dónde guardar
  const carpeta = data.notaCredito ? "notas_de_credito" : "facturas";
  const filePath = path.join(__dirname, carpeta, `${nombrePath}.pdf`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true }); // por si no existe

  const out = fs.createWriteStream(filePath);
  doc.pipe(out);

  // ====== ENCABEZADO ======
  doc
    .fontSize(25)
    .font("Courier-Bold")
    .text("MUSA PALERMO", { align: "center" });
  doc.fontSize(12).font("Courier");
  doc.text("---------------------------", { align: "center" });
  doc.text("Valentin Greco", { align: "center" });
  doc.text("CUIT e IIBB: 20-41858889-7", { align: "center" }); // <- tus datos
  doc.text("DIRECCIÓN: ARAOZ 2785", { align: "center" });
  doc.text("IVA RESP. INSCRIPTO", { align: "center" });
  doc.text("---------------------------", { align: "center" });

  // Tipo de comprobante visible
  if (data.factura === "A") {
    doc.text(data.notaCredito ? "NOTA DE CREDITO A" : "FACTURA A", {
      align: "center",
    });
  } else {
    doc.text(data.notaCredito ? "NOTA DE CREDITO B" : "FACTURA B", {
      align: "center",
    });
  }

  const { fecha, hora } = formatFechaCortaConHora(new Date());
  doc.text("---------------------------", { align: "center" });
  doc.text(`NRO. COMP: ${stringNumeroComprobante}`, { align: "center" });
  doc.text(`FECHA: ${fecha} ${hora}`, { align: "center" });
  doc.text("---------------------------", { align: "center" });

  // Datos del receptor
  if (data.factura === "A") {
    doc.text(data.razonSocial ?? "", { align: "left" });
    doc.text(`CUIT: ${data.cuit ?? ""}`, { align: "left" });
    doc.text("RESPONSABLE INSCRIPTO", { align: "left" });
    if (data.direccion) doc.text(data.direccion, { align: "left" });
    if (data.localidad) doc.text(data.localidad, { align: "left" });
    if (data.provincia) doc.text(data.provincia, { align: "left" });
  } else {
    if (data.dni && data.nombre && data.domicilio) {
      doc.text(data.nombre, { align: "left" });
      doc.text(`DNI: ${data.dni}`, { align: "left" });
      doc.text(data.domicilio, { align: "left" });
    } else {
      doc.text("A CONSUMIDOR FINAL", { align: "center" });
    }
  }

  doc.text("---------------------------", { align: "center" });

  // ====== CUERPO / ITEMS ======
  doc.addPage(); // como en tu versión
  doc.moveDown();
  doc.fontSize(10);

  let currentY = doc.y;
  doc.text("CANTIDAD/P. UNIT", 0, currentY, { align: "left" });
  doc.text("IMPORTE", 165, currentY);
  doc.x = 0;

  currentY = doc.y;
  doc.text("DESCRIPCION", 0, currentY, { align: "left" });
  doc.text("IVA%", 135, currentY);

  (data.productosCarrito || []).forEach((producto) => {
    doc.x = 0;
    currentY = doc.y;

    const importeLinea =
      data.factura === "A"
        ? (producto.carritoCantidad * producto.venta) / 1.21
        : producto.carritoCantidad * producto.venta;

    // Importe a la derecha
    doc.text(importeLinea.toFixed(2), 0, currentY, { align: "right" });
    // Cantidad / Precio unitario a la izquierda
    doc.text(`${producto.carritoCantidad}/$${producto.venta}`, 0, currentY);

    currentY = doc.y;

    // Descripción truncada a ancho 135
    const maxWidth = 135;
    let nombreProducto = String(producto.nombre ?? "");
    while (
      doc.widthOfString(nombreProducto) > maxWidth &&
      nombreProducto.length > 0
    ) {
      nombreProducto = nombreProducto.slice(0, -1);
    }
    doc.text(nombreProducto, 0, currentY);
    doc.text("(21%)", 135, currentY); // asumís 21% para todos los ítems
    doc.x = 0;
  });

  // ====== TOTALES ======
  doc.addPage(); // como en tu versión
  currentY = doc.y;

  const descuento = Number(data.descuento ?? 0);
  doc.text("DESCUENTO:", 0, currentY, { align: "left" });
  doc.text(`$${descuento.toFixed(2)}`, 0, currentY, { align: "right" });

  const precioTotal = Number(data.precio ?? 0);

  if (data.factura === "A") {
    const neto = precioTotal / 1.21;
    const iva = precioTotal - neto;
    doc.text(`SUBTOTAL: ${neto.toFixed(2)}`, { align: "right" });
    doc.moveDown();
    doc.text(`NETO GRAVADO: ${neto.toFixed(2)}`, { align: "right" });
    doc.text(`IVA 21%: ${iva.toFixed(2)}`, { align: "right" });
  }

  doc.moveDown();
  doc.fontSize(19);
  currentY = doc.y;
  const precioFormateado = precioTotal.toLocaleString("es-AR");
  doc.text("TOTAL:", 0, currentY, { align: "left" });
  doc.text(`$${precioFormateado}`, 0, currentY, { align: "right" });

  doc.fontSize(12);
  doc.moveDown();
  doc.text("---------------------------", { align: "center" });
  doc.text("REFERENCIA ELECTRONICA", { align: "center" });
  doc.text("DEL COMPROBANTE", { align: "center" });
  doc.moveDown();
  doc.text(`C.A.E: ${data.CAE}`, { align: "center" });
  doc.text(`Vto.: ${data.vtoCAE}`, { align: "center" });

  // ====== QR AFIP (JSON + imagen inline) ======
  const tipoCmp = mapTipoCmp({
    factura: data.factura,
    notaCredito: data.notaCredito,
  });
  const { docTipo: tipoDocRec, nroDoc: nroDocRec } = pickDocTipoYNumero(data);

  const qrPayload = {
    ver: 1,
    fecha: ymd(new Date()), // YYYY-MM-DD
    cuit: Number(data.cuit_afip), // CUIT del emisor
    ptoVta: Number(data.puntoDeVenta),
    tipoCmp, // 1/3/6/8
    nroCmp: Number(data.numeroComprobante),
    importe: Number(precioTotal.toFixed(2)),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: Number(tipoDocRec), // 80/96/99
    nroDocRec: Number(nroDocRec), // 0 si 99 (CF)
    tipoCodAut: "E",
    codAut: Number.parseInt(String(data.CAE), 10), // CAE numérico
  };

  const base64String = Buffer.from(JSON.stringify(qrPayload), "utf-8").toString(
    "base64"
  );
  const qrUrl = `https://serviciosweb.afip.gob.ar/genericos/comprobantes/cae.aspx?p=${base64String}`;

  // Genero la imagen del QR en memoria y la incrusto
  const qrBuffer = qr.imageSync(qrUrl, { type: "png", margin: 0, size: 4 });
  doc.image(qrBuffer, {
    x: 55,
    fit: [100, 100],
    align: "center",
  });

  // Cierro y espero a que se escriba todo antes de imprimir
  const finished = new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
  doc.end();
  await finished;

  // Enviá a imprimir como hacías
  if (typeof print === "function") {
    if (data.notaCredito) {
      print(path.join(__dirname, "notas_de_credito", `${nombrePath}.pdf`));
    } else {
      print(path.join(__dirname, "facturas", `${nombrePath}.pdf`));
    }
  }
}

io.on("connection", (socket) => {
  socket.on(
    "request-productos",
    async ({
      page = 1,
      search = "",
      isCarrito = false,
      isFavorito = false,
      ordenadoCantidad = false,
      ordenadoCepa = false,
    }) => {
      const pageSize = 50;
      try {
        const query = {
          ...(search
            ? {
                $or: [
                  { codigo: new RegExp(search, "i") },
                  { nombre: new RegExp(search, "i") },
                  { bodega: new RegExp(search, "i") },
                  { cepa: new RegExp(search, "i") },
                  { origen: new RegExp(search, "i") },
                ],
              }
            : {}),
          ...(isCarrito ? { carrito: true } : {}),
          ...(isFavorito ? { favorito: true } : {}),
        };

        // Determinar el orden de los productos según los criterios seleccionados
        const sortOption = {
          ...(ordenadoCepa && { cepa: 1 }),
          ...(ordenadoCantidad && { cantidad: 1 }),
          ...(!ordenadoCepa && !ordenadoCantidad && { _id: -1 }),
        };

        const productos = await Product.find(query)
          .sort(sortOption) // Ordena según la configuración
          .skip((page - 1) * pageSize)
          .limit(pageSize);

        const totalProductos = await Product.countDocuments(query);
        let totalPages = Math.ceil(totalProductos / pageSize);
        if (totalPages === 0) {
          totalPages = 1;
        }
        socket.emit("response-productos", {
          productos,
          totalProductos,
          totalPages,
        });
      } catch (error) {
        console.error("Error al obtener productos:", error);
        socket.emit("response-productos", {
          status: "error",
          message: "Error al obtener productos",
        });
      }
    }
  );
  socket.on("agregar-stock", async (id, cantidad) => {
    const producto = await Product.findById(id);
    const nuevaCantidad = parseInt(producto.cantidad) + parseInt(cantidad);
    producto.cantidad = nuevaCantidad.toString();
    await producto.save();
    io.emit("cambios");
  });
  socket.on("delete-producto", async (id) => {
    await Product.findByIdAndDelete(id);
    io.emit("cambios");
  });
  socket.on("scan-code", async (codigo) => {
    let producto = await Product.findOne({ codigo });
    if (!producto) {
      producto = "error";
    }
    socket.emit("producto-encontrado", producto);
  });
  socket.on("toggle-favorito", async (id) => {
    try {
      const product = await Product.findById(id);
      if (product) {
        const newFavorito = product.favorito === true ? false : true;
        product.favorito = newFavorito;
        await product.save();
        io.emit("cambios");
      } else {
        console.error("Producto no encontrado");
      }
    } catch (error) {
      console.error("Error al actualizar el favorito:", error);
    }
  });
  socket.on("toggle-carrito", async (id) => {
    try {
      const product = await Product.findById(id);
      if (product) {
        const newCarrito = product.carrito === true ? false : true;
        product.carrito = newCarrito;
        product.carritoCantidad = 1;
        await product.save();
        io.emit("cambios");
      } else {
        console.error("Producto no encontrado");
      }
    } catch (error) {
      console.error("Error al actualizar el carrito:", error);
    }
  });
  socket.on("reset-fav-carrito", async () => {
    await Product.updateMany(
      { $or: [{ favorito: true }, { carrito: true }] },
      { $set: { favorito: false, carrito: false } }
    );
    io.emit("cambios");
  });
  socket.on("productos-carrito", async () => {
    const productosCarrito = await Product.find({ carrito: true });
    socket.emit("productos-carrito", productosCarrito);
  });
  socket.on("actualizar-cantidad-carrito", async ({ id, cantidad }) => {
    try {
      const product = await Product.findById(id);
      if (product) {
        product.carritoCantidad = cantidad;
        await product.save();
        io.emit("cambios");
      } else {
        console.error("Producto no encontrado");
      }
    } catch (error) {
      console.error("Error al actualizar carritoCantidad:", error);
    }
  });
  socket.on("finalizar-compra", async (datosCompra) => {
    try {
      // Obtenemos todos los productos que están en el carrito
      const productosCarrito = await Product.find({ carrito: true });

      // Calculamos el total de la venta
      let totalVenta = 0;
      productosCarrito.forEach((producto) => {
        totalVenta += producto.carritoCantidad * parseFloat(producto.venta);
      });

      // Aplicamos el descuento si lo hay
      totalVenta = totalVenta - datosCompra.descuento;

      // NUEVO: Obtenemos los montos de pago mixto (si vienen desde el frontend).
      // Si no, se dejan como 0.
      const montoEfectivo = datosCompra.efectivoMixto || 0;
      const montoDigital = datosCompra.digitalMixto || 0;

      // Factura A
      if (datosCompra.factura === "A") {
        const data_factura = await afipService.facturaA(
          totalVenta,
          datosCompra.cuit
        );
        let data = {};
        let persona;
        try {
          persona = await afipService.getPersona(datosCompra.cuit);
        } catch (error) {
          socket.emit("error-cuit-invalido");
          return;
        }
        if (persona.personaReturn.errorConstancia) {
          socket.emit("error-no-cuit");
          return;
        }
        data.cuit = datosCompra.cuit;
        data.factura = datosCompra.factura;
        data.razonSocial = persona.personaReturn.datosGenerales.razonSocial;
        data.localidad =
          persona.personaReturn.datosGenerales.domicilioFiscal.localidad;
        data.direccion =
          persona.personaReturn.datosGenerales.domicilioFiscal.direccion;
        data.provincia =
          persona.personaReturn.datosGenerales.domicilioFiscal.descripcionProvincia;
        data.numeroComprobante = data_factura.numeroComprobante;
        data.puntoDeVenta = afipService.ptoVta;
        data.cuit_afip = afipService.CUIT;
        data.precio = totalVenta;
        data.descuento = datosCompra.descuento;
        data.CAE = data_factura.CAE;
        data.vtoCAE = data_factura.vtoCAE;
        data.tipoDoc = data_factura.docTipo;
        data.productosCarrito = productosCarrito;

        // Imprimimos o procesamos el ticket (si tienes esta función)
        await imprimirTicket(data);

        // Creación de la venta en la base de datos
        const venta = {
          productos: productosCarrito,
          tipoFactura: datosCompra.factura,
          stringNumeroFactura:
            `F${datosCompra.factura}-0000${data.puntoDeVenta.toString()}-` +
            data.numeroComprobante.toString().padStart(8, "0"),
          numeroFactura: data.numeroComprobante,
          cuit: datosCompra.cuit,
          monto: totalVenta,
          formaPago: datosCompra.formaPago,
          domicilio: data.direccion,
          provincia: data.provincia,
          localidad: data.localidad,
          razonSocial: data.razonSocial,
          fecha: moment(new Date())
            .tz("America/Argentina/Buenos_Aires")
            .format("YYYY-MM-DD"),
          descuento: datosCompra.descuento,
          detalle: datosCompra.detalle,

          // NUEVOS CAMPOS
          montoEfectivo,
          montoDigital,
        };
        await Venta.create(venta);

        // Factura B
      } else if (datosCompra.factura === "B") {
        let data_factura;
        if (datosCompra.dni) {
          data_factura = await afipService.facturaB(
            totalVenta,
            datosCompra.dni
          );
        } else {
          data_factura = await afipService.facturaB(totalVenta, 0);
        }
        let data = {};
        data.dni = datosCompra.dni;
        data.nombre = datosCompra.nombre;
        data.domicilio = datosCompra.domicilio;
        data.factura = datosCompra.factura;
        data.numeroComprobante = data_factura.numeroComprobante;
        data.puntoDeVenta = afipService.ptoVta;
        data.cuit_afip = afipService.CUIT;
        data.precio = totalVenta;
        data.descuento = datosCompra.descuento;
        data.CAE = data_factura.CAE;
        data.vtoCAE = data_factura.vtoCAE;
        data.tipoDoc = data_factura.docTipo;
        data.productosCarrito = productosCarrito;

        // Imprimimos o procesamos el ticket (si tienes esta función)
        await imprimirTicket(data);

        // Creación de la venta en la base de datos
        const venta = {
          productos: productosCarrito,
          tipoFactura: datosCompra.factura,
          stringNumeroFactura:
            `F${datosCompra.factura}-0000${data.puntoDeVenta.toString()}-` +
            data.numeroComprobante.toString().padStart(8, "0"),
          numeroFactura: data.numeroComprobante,
          cuit: datosCompra.dni, // En caso de usar DNI como identificador
          monto: totalVenta,
          formaPago: datosCompra.formaPago,
          domicilio: datosCompra.domicilio,
          nombre: datosCompra.nombre,
          fecha: moment(new Date())
            .tz("America/Argentina/Buenos_Aires")
            .format("YYYY-MM-DD"),
          descuento: datosCompra.descuento,
          detalle: datosCompra.detalle,

          // NUEVOS CAMPOS
          montoEfectivo,
          montoDigital,
        };
        await Venta.create(venta);

        // Sin factura
      } else {
        // Creación de la venta en la base de datos sin factura A/B
        const venta = {
          productos: productosCarrito,
          monto: totalVenta,
          formaPago: datosCompra.formaPago,
          fecha: moment(new Date())
            .tz("America/Argentina/Buenos_Aires")
            .format("YYYY-MM-DD"),
          descuento: datosCompra.descuento,
          detalle: datosCompra.detalle,

          // NUEVOS CAMPOS
          montoEfectivo,
          montoDigital,
        };
        await Venta.create(venta);
      }

      // Actualizamos el stock de los productos en el carrito
      for (const producto of productosCarrito) {
        await Product.findByIdAndUpdate(producto._id, {
          $inc: { cantidad: -producto.carritoCantidad },
        });
      }

      // Reiniciamos carrito y favoritos
      await Product.updateMany(
        { $or: [{ carrito: true }, { favorito: true }] },
        { carrito: false, favorito: false }
      );

      // Emitimos los eventos pertinentes
      io.emit("cambios");
      socket.emit("compra-finalizada");
    } catch (error) {
      console.error("Error al finalizar la compra:", error);
      socket.emit("error-finalizar-compra", {
        message: "Hubo un error al finalizar la compra.",
      });
    }
  });
  socket.on(
    "request-ventas",
    async ({ fecha, page, filtroPago, filtroTipo }) => {
      const pageSize = 50;
      try {
        // Construir el query dinámicamente
        const query = {
          ...(fecha ? { fecha: fecha } : {}),
          ...(filtroPago && filtroPago !== "todos"
            ? { formaPago: filtroPago.toUpperCase() }
            : {}),
          ...(filtroTipo && filtroTipo !== "todos"
            ? filtroTipo === "vino"
              ? { idTurno: { $exists: false } } // "vino" implica que no hay idTurno
              : { idTurno: { $exists: true } } // "reserva" implica que sí hay idTurno
            : {}),
        };

        // Consultar las ventas aplicando los filtros
        const ventas = await Venta.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize);

        // Calcular el total de ventas con los mismos filtros
        const totalVentas = await Venta.countDocuments(query);
        let totalPages = Math.ceil(totalVentas / pageSize);
        if (totalPages === 0) {
          totalPages = 1;
        }

        // Emitir los datos filtrados
        socket.emit("response-ventas", {
          ventas,
          totalVentas,
          totalPages,
        });
      } catch (error) {
        console.error("Error fetching ventas:", error);
        socket.emit("response-ventas", {
          status: "error",
          message: "Error fetching ventas",
        });
      }
    }
  );
  socket.on("nota-credito", async (venta) => {
    let data;
    if (venta.tipoFactura === "A") {
      // Nota de crédito tipo A
      data = await afipService.notaCreditoA(
        venta.monto,
        venta.cuit,
        venta.numeroFactura
      );
      data = {
        ...data,
        cuit: venta.cuit,
        numeroComprobante: data.numeroComprobante,
        puntoDeVenta: afipService.ptoVta,
        factura: venta.tipoFactura,
        precio: venta.monto,
        tipoDoc: data.docTipo,
        cuit_afip: afipService.CUIT,
        productosCarrito: venta.productos,
        razonSocial: venta.razonSocial,
        localidad: venta.localidad,
        direccion: venta.domicilio,
        provincia: venta.provincia,
        notaCredito: true,
        descuento: venta.descuento,
      };
    } else if (venta.tipoFactura === "B") {
      // Nota de crédito tipo B
      data = await afipService.notaCreditoB(
        venta.monto,
        venta.cuit,
        venta.numeroFactura
      );
      data = {
        ...data,
        dni: venta.cuit,
        nombre: venta.nombre,
        domicilio: venta.domicilio,
        factura: venta.tipoFactura,
        numeroComprobante: data.numeroComprobante,
        puntoDeVenta: afipService.ptoVta,
        cuit_afip: afipService.CUIT,
        precio: venta.monto,
        tipoDoc: data.docTipo,
        productosCarrito: venta.productos,
        notaCredito: true,
        descuento: venta.descuento,
      };
    }
    if (venta.idTurno) {
      data.productosCarrito = [
        { nombre: "RESERVA", carritoCantidad: 1, venta: venta.monto },
      ];
      const turno = await Turno.findById(venta.idTurno);
      if (turno) {
        const nuevoCobrado = turno.cobrado - venta.monto;
        await Turno.findByIdAndUpdate(venta.idTurno, {
          cobrado: nuevoCobrado,
        });
      }
    }
    // Imprimir ticket y actualizar la venta
    await imprimirTicket(data);
    await Venta.findByIdAndUpdate(venta._id, { notaCredito: true });
    if (!venta.idTurno) {
      data.productosCarrito.forEach(async (producto) => {
        await Product.findByIdAndUpdate(producto._id, {
          $inc: { cantidad: producto.carritoCantidad },
        });
      });
    }
    // Emitir cambios
    io.emit("cambios");
  });
  socket.on("devolucion", async (venta) => {
    if (venta.idTurno) {
      const turno = await Turno.findById(venta.idTurno);
      if (turno) {
        const nuevoCobrado = turno.cobrado - venta.monto;
        await Turno.findByIdAndUpdate(venta.idTurno, {
          cobrado: nuevoCobrado,
        });
      }
    }
    await Venta.findByIdAndUpdate(venta._id, { notaCredito: true });
    venta.productos.forEach(async (producto) => {
      await Product.findByIdAndUpdate(producto._id, {
        $inc: { cantidad: producto.carritoCantidad },
      });
    });
    io.emit("cambios");
  });
  socket.on("request-totales", async () => {
    // 1. SUMAR EFECTIVO (formaPago = "EFECTIVO")
    const totalEfectivoResult = await Venta.aggregate([
      {
        $match: {
          formaPago: "EFECTIVO",
          notaCredito: { $ne: true }, // Excluir ventas con notaCredito == true
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$monto" },
        },
      },
    ]);

    // 2. SUMAR DIGITAL (formaPago = "DIGITAL")
    const totalDigitalResult = await Venta.aggregate([
      {
        $match: {
          formaPago: "DIGITAL",
          notaCredito: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$monto" },
        },
      },
    ]);

    // 3. SUMAR MIXTO (formaPago = "MIXTO")
    //    Aquí debemos sumar "montoEfectivo" y "montoDigital" por separado
    const totalMixtoResult = await Venta.aggregate([
      {
        $match: {
          formaPago: "MIXTO",
          notaCredito: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          totalEfectivoMixto: { $sum: "$montoEfectivo" },
          totalDigitalMixto: { $sum: "$montoDigital" },
        },
      },
    ]);

    // Obtenemos los valores o 0 si no hay resultados
    let efectivo =
      totalEfectivoResult.length > 0 ? totalEfectivoResult[0].total : 0;
    let digital =
      totalDigitalResult.length > 0 ? totalDigitalResult[0].total : 0;

    let efectivoMixto =
      totalMixtoResult.length > 0 ? totalMixtoResult[0].totalEfectivoMixto : 0;
    let digitalMixto =
      totalMixtoResult.length > 0 ? totalMixtoResult[0].totalDigitalMixto : 0;

    // Sumamos los mixtos a cada tipo de total
    efectivo += efectivoMixto;
    digital += digitalMixto;

    // 4. SUMAR OPERACIONES
    //    Si tus Operaciones también incluyen MIXTO, puedes sumarlas de forma similar:
    const operaciones = await Operacion.find();

    operaciones.forEach((operacion) => {
      if (operacion.formaPago === "EFECTIVO") {
        efectivo += operacion.monto;
      } else if (operacion.formaPago === "DIGITAL") {
        digital += operacion.monto;
      } else if (operacion.formaPago === "MIXTO") {
        // Asumiendo que tu 'Operacion' en modo MIXTO también
        // tenga campos tipo 'montoEfectivo' y 'montoDigital'
        efectivo += operacion.montoEfectivo || 0;
        digital += operacion.montoDigital || 0;
      }
    });

    // 5. Armamos la respuesta
    const totales = {
      efectivo,
      digital,
    };

    // 6. Enviamos al cliente
    socket.emit("response-totales", totales);
  });
  socket.on("request-nombres", async () => {
    let nombres = await Operacion.find();
    nombres = [...new Set(nombres.map((operacion) => operacion.nombre))];
    socket.emit("response-nombres", nombres);
  });
  socket.on("guardar-operacion", async (operacion) => {
    if (operacion._id) {
      await Operacion.findByIdAndUpdate(operacion._id, operacion);
    } else {
      operacion.fecha = moment(new Date())
        .tz("America/Argentina/Buenos_Aires")
        .format("YYYY-MM-DD");
      await Operacion.create(operacion);
    }
    io.emit("cambios");
  });
  socket.on("request-operaciones", async ({ fecha, search, page }) => {
    const pageSize = 50;
    const pageNumber = page || 1;
    let filter = {};
    if (fecha) {
      filter.fecha = fecha;
    }
    const searchRegex = { $regex: search, $options: "i" };
    filter.$or = [
      { descripcion: searchRegex },
      { tipoOperacion: searchRegex },
      { nombre: searchRegex },
    ];
    try {
      const operaciones = await Operacion.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize);
      const totalOperaciones = await Operacion.countDocuments(filter);
      let totalPages = Math.ceil(totalOperaciones / pageSize);
      if (totalPages === 0) {
        totalPages = 1;
      }
      socket.emit("response-operaciones", {
        operaciones,
        totalOperaciones,
        totalPages,
      });
    } catch (error) {
      socket.emit("error", { message: "Error retrieving operations", error });
    }
  });
  socket.on("request-tipo-operacion", async (tipo, mes) => {
    try {
      const operaciones = await Operacion.find({
        tipoOperacion: tipo,
        fecha: { $regex: `^${mes}` }, // Filtrar operaciones por mes
      }).sort({ createdAt: -1 });

      let operacionesPorNombre = {};
      operaciones.forEach((operacion) => {
        if (operacionesPorNombre[operacion.nombre]) {
          operacionesPorNombre[operacion.nombre].monto += operacion.monto;
        } else {
          operacionesPorNombre[operacion.nombre] = {
            ...operacion._doc,
            monto: operacion.monto,
          };
        }
      });

      const operacionesAgrupadas = Object.values(operacionesPorNombre);
      socket.emit("response-tipo-operacion", operacionesAgrupadas);
    } catch (error) {
      console.error("Error al obtener operaciones:", error);
      socket.emit("error", { message: "Error al obtener operaciones." });
    }
  });
  socket.on("request-facturado", async (mes) => {
    try {
      // Filtrar las ventas por el mes exacto (comparando las primeras 7 posiciones de la fecha)
      const ventas = await Venta.find({
        fecha: {
          $regex: `^${mes}`, // Filtrar donde la fecha empiece con el valor de 'mes' (YYYY-MM)
        },
      });

      let totalFacturado = 0;
      let totalNoFacturado = 0;

      ventas.forEach((venta) => {
        if (venta.notaCredito) {
          return; // Si es nota de crédito, se salta a la siguiente iteración
        }
        if (venta.tipoFactura === "A" || venta.tipoFactura === "B") {
          totalFacturado += venta.monto;
        } else {
          totalNoFacturado += venta.monto;
        }
      });
      socket.emit("response-facturado", { totalFacturado, totalNoFacturado });
    } catch (error) {
      console.error("Error al obtener las ventas y sumar los montos:", error);
      socket.emit("error", {
        message: "Error al obtener las ventas y sumar los montos.",
      });
    }
  });
  socket.on("request-gastos", async (mes) => {
    const operaciones = await Operacion.find({
      fecha: {
        $regex: `^${mes}`, // Filtrar donde la fecha empiece con el valor de 'mes' (YYYY-MM)
      },
    });
    let totalGastoFacturado = 0;
    let totalGastoFacturadoA = 0;
    operaciones.forEach((operacion) => {
      if (operacion.factura) {
        totalGastoFacturado += parseFloat(operacion.monto);
        if (operacion.factura === "A") {
          totalGastoFacturadoA += parseFloat(operacion.monto);
        }
      }
    });
    totalGastoFacturado = totalGastoFacturado * -1;
    let ivaCompra = (totalGastoFacturadoA - totalGastoFacturadoA / 1.21) * -1;
    socket.emit("response-gastos", totalGastoFacturado, ivaCompra);
  });
  socket.on("request-inicio", (code) => {
    if (code === "0510") {
      socket.emit("response-inicio", true);
    } else {
      socket.emit("response-inicio", false);
    }
  });
  socket.on("guardar-turno", async (turno) => {
    turno.fecha = turno.fecha.split("T")[0];
    if (!turno.total) {
      turno.total = 0;
    }
    if (turno._id) {
      await Turno.findByIdAndUpdate(turno._id, turno);
    } else {
      turno.cobrado = 0;
      await Turno.create(turno);
    }
    io.emit("cambios");
  });
  socket.on("request-turnos", async (todos, search, page) => {
    const pageSize = 50; // Definir tamaño de página
    const pageNumber = page || 1;
    let filter = {};
    // Si hay un término de búsqueda, creamos un regex para aplicarlo a los campos

    if (search) {
      const searchRegex = { $regex: search, $options: "i" }; // 'i' para ignorar mayúsculas/minúsculas
      filter.$or = [{ nombre: searchRegex }, { fecha: searchRegex }];
    }

    // Filtrar por turnos a partir de hoy (solo considerando la fecha sin la hora)
    if (!todos) {
      const today = moment().startOf("day").format("YYYY-MM-DD"); // Obtener la fecha de hoy sin la parte de la hora
      filter.fecha = { $gte: today }; // Filtrar turnos a partir de hoy, ignorando la hora
    }

    try {
      // Realizar la búsqueda con paginación
      const turnos = await Turno.find(filter)
        .sort({ createdAt: -1 }) // Ordenar por fecha de creación
        .skip((pageNumber - 1) * pageSize) // Paginación
        .limit(pageSize); // Limitar el número de resultados por página

      // Contar el número total de documentos que coinciden con el filtro
      const totalTurnos = await Turno.countDocuments(filter);
      let totalPages = Math.ceil(totalTurnos / pageSize);
      if (totalPages === 0) {
        totalPages = 1;
      }

      // Emitir los resultados al cliente
      socket.emit("response-turnos", {
        turnos,
        totalTurnos,
        totalPages,
      });
    } catch (error) {
      socket.emit("error", { message: "Error retrieving turnos", error });
    }
  });
  socket.on("request-fechas-turnos", async (turno) => {
    const turnosOcupados = await Turno.find({ turno });
    let dummyArr = [];
    // Crear un mapa para agrupar las cantidades por fecha
    const turnosPorFecha = {};
    turnosOcupados.forEach((t) => {
      if (turnosPorFecha[t.fecha]) {
        // Si ya existe la fecha, sumamos la cantidad
        turnosPorFecha[t.fecha] += t.cantidad;
      } else {
        // Si no existe la fecha, la inicializamos
        turnosPorFecha[t.fecha] = t.cantidad;
      }
    });
    // Convertir el mapa en un array de objetos con la fecha y la suma de cantidades
    for (const fecha in turnosPorFecha) {
      dummyArr.push({ fecha, cantidad: turnosPorFecha[fecha] });
    }
    // Emitir el array procesado
    socket.emit("response-fechas-turnos", dummyArr);
  });
  socket.on("request-cantidad", () => {
    let cantidades = JSON.parse(
      fs.readFileSync(path.join(__dirname, "cantidad_colores.json"), {
        encoding: "utf-8",
      })
    );
    socket.emit("response-cantidad", cantidades);
  });
  socket.on("borrar-turno", async (id) => {
    await Turno.findByIdAndDelete(id);
    io.emit("cambios");
  });
  socket.on("cobrar-turno", async (id, turnoData) => {
    let turno = await Turno.findById(id);
    turno.cobrado = (turno.cobrado || 0) + parseFloat(turnoData.cobrado);
    turno.facturado = turnoData.facturado;
    turno.formaDeCobro = turnoData.formaDeCobro;
    if (turnoData.facturado) {
      let data_factura = "";
      data_factura = await afipService.facturaB(turnoData.cobrado, 0);
      let data = {};
      data.factura = "B";
      data.numeroComprobante = data_factura.numeroComprobante;
      data.puntoDeVenta = afipService.ptoVta;
      data.cuit_afip = afipService.CUIT;
      data.precio = turnoData.cobrado;
      data.CAE = data_factura.CAE;
      data.vtoCAE = data_factura.vtoCAE;
      data.tipoDoc = data_factura.docTipo;
      data.productosCarrito = [
        { nombre: "RESERVA", carritoCantidad: 1, venta: turnoData.cobrado },
      ];
      data.descuento = 0;
      await imprimirTicket(data);
      const venta = {
        productos: data.productosCarrito,
        tipoFactura: data.factura,
        stringNumeroFactura:
          `FB-0000${data.puntoDeVenta.toString()}-` +
          data.numeroComprobante.toString().padStart(8, "0"),
        numeroFactura: data.numeroComprobante,
        monto: turnoData.cobrado,
        formaPago: turnoData.formaDeCobro,
        fecha: moment(new Date())
          .tz("America/Argentina/Buenos_Aires")
          .format("YYYY-MM-DD"),
        idTurno: turno._id,
        nombreTurno: turno.nombre,
        descuento: 0,
      };
      await Venta.create(venta);
    } else {
      await Venta.create({
        idTurno: turno._id,
        nombreTurno: turno.nombre,
        formaPago: turnoData.formaDeCobro,
        tipoFactura: "",
        monto: turnoData.cobrado,
        fecha: moment(new Date())
          .tz("America/Argentina/Buenos_Aires")
          .format("YYYY-MM-DD"),
        descuento: 0,
        productos: [
          {
            nombre: "RESERVA",
            carritoCantidad: 1,
            venta: turnoData.cobrado,
          },
        ],
      });
    }
    await turno.save();
    io.emit("cambios");
  });
  socket.on("cambiar-cantidad-color", (color, cantidad) => {
    let cantidades = JSON.parse(
      fs.readFileSync(path.join(__dirname, "cantidad_colores.json"), {
        encoding: "utf-8",
      })
    );
    cantidades[color] = parseFloat(cantidad);
    fs.writeFileSync(
      path.join(__dirname, "cantidad_colores.json"),
      JSON.stringify(cantidades)
    );
    io.emit("cambios");
  });
  socket.on("add-carrito", async (codigo) => {
    await Product.findOneAndUpdate({ codigo }, { carrito: true });
    io.emit("cambios");
  });
  socket.on("total-cantidad-productos", async () => {
    try {
      // Usamos agregación para sumar el campo "cantidad" de todos los productos
      const totalCantidad = await Product.aggregate([
        {
          $group: {
            _id: null, // No necesitamos agrupar por un campo específico
            total: { $sum: "$cantidad" }, // Sumamos el campo "cantidad"
          },
        },
      ]);
      // Si totalCantidad no está vacío, enviamos el resultado
      const total = totalCantidad.length > 0 ? totalCantidad[0].total : 0;
      socket.emit("res-total-cantidad-productos", total);
    } catch (error) {
      console.error("Error al obtener la cantidad total:", error);
      socket.emit(
        "error-total-cantidad-productos",
        "Hubo un error al calcular la cantidad total"
      );
    }
  });
  socket.on("borrar-file-operacion", async (id) => {
    await Operacion.findByIdAndUpdate(id, { filePath: null });
    io.emit("cambios");
  });
  socket.on("request-flujos", async (ordenadoFechaPago, todos) => {
    try {
      let filter = {};

      // Si todos es falso, filtramos los flujos a partir de hoy
      if (!todos) {
        const today = moment().startOf("day").format("YYYY-MM-DD"); // Obtener la fecha de hoy sin la parte de la hora
        filter.fechaPago = { $gte: today }; // Filtrar flujos a partir de hoy, ignorando la hora
      }

      let sortCriteria;

      // Si ordenadoFechaPago es true, ordenamos por fechaPago de menor a mayor
      if (ordenadoFechaPago) {
        sortCriteria = { fechaPago: 1 }; // Orden ascendente por fechaPago
      } else {
        // Si es false, ordenamos por createdAt de forma descendente
        sortCriteria = { createdAt: -1 }; // Orden descendente por createdAt
      }

      const flujos = await Flujo.find(filter)
        .sort(sortCriteria) // Usamos el criterio de ordenación dinámico
        .exec();

      // Emitimos la respuesta con los flujos ordenados
      socket.emit("response-flujos", flujos);
    } catch (error) {
      console.error("Error al obtener flujos:", error);
      socket.emit("response-flujos", []); // Enviar un array vacío en caso de error
    }
  });
  socket.on("enviar-a-caja", async (id) => {
    const flujo = await Flujo.findByIdAndUpdate(
      id,
      { enviado: true },
      { new: true } // ← aquí le indicas que te devuelva el documento actualizado
    );
    const operacion = {
      fecha: moment(new Date())
        .tz("America/Argentina/Buenos_Aires")
        .format("YYYY-MM-DD"),
      beneficiario: flujo.beneficiario,
      nombre: flujo.nombre,
      filePath: flujo.filePath,
      descripcion: flujo.descripcion,
      monto: parseFloat(flujo.importe),
      tipoOperacion: "GASTO",
      formaPago: "DIGITAL",
    };
    await Operacion.create(operacion);
    io.emit("cambios");
  });
});

const PORT = 5000;

server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

async function vinoMasVendido() {
  // 1. Obtenemos todas las ventas
  const ventas = await Venta.find();

  // 2. Creamos un objeto para acumular cantidades por código
  const cantidadesPorCodigo = {};

  // 3. Recorremos cada venta y cada producto
  ventas.forEach((venta) => {
    venta.productos.forEach((producto) => {
      const codigo = producto.codigo;
      // Inicializamos el registro en caso de que no exista
      if (!cantidadesPorCodigo[codigo]) {
        cantidadesPorCodigo[codigo] = {
          nombre: producto.nombre,
          totalCantidad: 0,
        };
      }
      // Sumamos la cantidad vendida de este producto
      cantidadesPorCodigo[codigo].totalCantidad += producto.carritoCantidad;
    });
  });

  // 4. Convertimos el objeto en un array para poder ordenarlo o mostrarlo
  const resultado = Object.entries(cantidadesPorCodigo).map(
    ([codigo, data]) => ({
      codigo,
      nombre: data.nombre,
      totalCantidad: data.totalCantidad,
    })
  );

  // 5. (Opcional) Ordenamos por cantidad vendida descendente
  resultado.sort((a, b) => b.totalCantidad - a.totalCantidad);

  // 6. Mostramos el resultado
  console.log("Cantidad vendida por código:", resultado);
}

// Llamamos a la función
//vinoMasVendido();
