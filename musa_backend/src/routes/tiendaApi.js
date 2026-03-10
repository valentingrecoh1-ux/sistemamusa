const express = require("express");
const router = express.Router();
const moment = require("moment-timezone");
const multer = require("multer");
const uploadAudio = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const { cotizarEnvio, crearEnvioLogistica } = require("../logisticaService");

module.exports = function createTiendaRouter({ Product, PedidoWeb, ConfigTienda, PlanClub, SuscripcionClub, Resena, Cliente, Venta, ValoracionVino, SugerenciaCliente, Evento, mpClient, io }) {
  let mpPreference = null;
  let mpPayment = null;
  if (mpClient) {
    const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
    const client = new MercadoPagoConfig(mpClient);
    mpPreference = new Preference(client);
    mpPayment = new Payment(client);
  }

  // GET /api/tienda/productos
  router.get("/productos", async (req, res) => {
    try {
      const { search, bodega, cepa, tipo, page = 1, limit = 20 } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

      const query = { cantidad: { $gt: 0 }, venta: { $ne: null } };
      if (search) {
        // Expandir busquedas de categoria a cepas comunes
        const CEPA_MAP = {
          tinto: "malbec|cabernet|merlot|syrah|bonarda|tempranillo|pinot noir|tinto|blend tinto|tannat|petit verdot|sangiovese",
          blanco: "chardonnay|sauvignon blanc|torrontes|riesling|viognier|semillon|blanco|blend blanco|chenin|gewurztraminer",
          rosado: "rosado|rose|rosé",
          espumante: "espumante|champagne|brut|extra brut|sparkling|cava|prosecco",
        };
        const expanded = CEPA_MAP[search.toLowerCase()];
        const re = expanded
          ? new RegExp(expanded, "i")
          : new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        query.$or = [{ nombre: re }, { bodega: re }, { cepa: re }, { descripcion: re }, { origen: re }];
      }
      if (bodega) query.bodega = bodega;
      if (cepa) query.cepa = cepa;
      if (tipo) query.tipo = tipo;

      const [productos, total] = await Promise.all([
        Product.find(query)
          .select("nombre bodega cepa year origen venta cantidad descripcion tipo foto codigo")
          .sort({ nombre: 1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        Product.countDocuments(query),
      ]);

      res.json({ productos, total, page: pageNum, totalPages: Math.ceil(total / limitNum) || 1 });
    } catch (err) {
      console.error("Error tienda productos:", err.message);
      res.status(500).json({ error: "Error al obtener productos" });
    }
  });

  // GET /api/tienda/producto/:id
  router.get("/producto/:id", async (req, res) => {
    try {
      const p = await Product.findById(req.params.id)
        .select("nombre bodega cepa year origen venta cantidad descripcion tipo foto fotos fotoPrincipalIdx codigo")
        .lean();
      if (!p) return res.status(404).json({ error: "Producto no encontrado" });

      // Productos relacionados (misma bodega o cepa, excluyendo este)
      const related = await Product.find({
        _id: { $ne: p._id },
        cantidad: { $gt: 0 },
        venta: { $ne: null },
        $or: [{ bodega: p.bodega }, { cepa: p.cepa }].filter((f) => Object.values(f)[0]),
      })
        .select("nombre bodega cepa year venta foto")
        .limit(4)
        .lean();

      res.json({ producto: p, relacionados: related });
    } catch (err) {
      console.error("Error tienda producto:", err.message);
      res.status(500).json({ error: "Error al obtener producto" });
    }
  });

  // GET /api/tienda/filtros
  router.get("/filtros", async (req, res) => {
    try {
      const baseQuery = { cantidad: { $gt: 0 }, venta: { $ne: null } };
      const [bodegas, cepas, origenes] = await Promise.all([
        Product.distinct("bodega", { ...baseQuery, bodega: { $ne: null, $ne: "" } }),
        Product.distinct("cepa", { ...baseQuery, cepa: { $ne: null, $ne: "" } }),
        Product.distinct("origen", { ...baseQuery, origen: { $ne: null, $ne: "" } }),
      ]);
      res.json({
        bodegas: bodegas.filter(Boolean).sort(),
        cepas: cepas.filter(Boolean).sort(),
        origenes: origenes.filter(Boolean).sort(),
      });
    } catch (err) {
      res.status(500).json({ error: "Error al obtener filtros" });
    }
  });

  // GET /api/tienda/config
  router.get("/config", async (req, res) => {
    try {
      let config = await ConfigTienda.findById("main").lean();
      if (!config) {
        const newConfig = await ConfigTienda.create({ _id: "main" });
        config = newConfig.toObject();
      }
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: "Error al obtener configuracion" });
    }
  });

  // POST /api/tienda/cotizar-envio - Cotizar opciones de envio
  router.post("/cotizar-envio", async (req, res) => {
    try {
      const config = await ConfigTienda.findById("main").lean();
      if (!config) return res.status(500).json({ error: "Config no encontrada" });

      const { direccion, calle, numero, localidad, codigoPostal, ciudad, provincia } = req.body;
      if (!direccion && !codigoPostal && !calle) return res.status(400).json({ error: "Direccion o codigo postal requerido" });

      const destino = { direccion, calle, numero, localidad, codigoPostal, ciudad: ciudad || localidad || "CABA", provincia: provincia || "CABA" };
      const opciones = await cotizarEnvio(config, destino);
      res.json({ opciones });
    } catch (err) {
      console.error("Error cotizar-envio:", err.message);
      res.status(500).json({ error: "Error al cotizar envio" });
    }
  });

  // POST /api/tienda/pedido
  router.post("/pedido", async (req, res) => {
    try {
      const { items, cliente, entrega, opcionEnvio } = req.body;

      if (!items?.length) return res.status(400).json({ error: "El pedido debe tener al menos un producto" });
      if (!cliente?.nombre || !cliente?.email || !cliente?.telefono) {
        return res.status(400).json({ error: "Nombre, email y telefono son obligatorios" });
      }

      // Validar stock y armar items
      const itemsDocs = [];
      for (const item of items) {
        const prod = await Product.findById(item.productoId).lean();
        if (!prod) return res.status(400).json({ error: `Producto no encontrado: ${item.nombre || item.productoId}` });
        if (prod.cantidad < item.cantidad) {
          return res.status(400).json({ error: `Stock insuficiente para ${prod.nombre}. Disponible: ${prod.cantidad}` });
        }
        const precio = parseFloat(prod.venta) || 0;
        itemsDocs.push({
          productoId: prod._id,
          nombre: prod.nombre,
          bodega: prod.bodega,
          cepa: prod.cepa,
          foto: prod.foto,
          precioUnitario: precio,
          cantidad: item.cantidad,
          subtotal: precio * item.cantidad,
        });
      }

      const montoSubtotal = itemsDocs.reduce((s, i) => s + i.subtotal, 0);

      // Costo envio - usar opcion elegida o costo fijo
      let costoEnvio = 0;
      let logisticaProveedor = null;
      if (entrega === "envio") {
        if (opcionEnvio?.precio != null) {
          costoEnvio = opcionEnvio.precio;
          logisticaProveedor = opcionEnvio.proveedor;
        } else {
          const config = await ConfigTienda.findById("main").lean();
          if (config?.envioHabilitado) costoEnvio = config.costoEnvio || 0;
        }
      }

      const montoTotal = montoSubtotal + costoEnvio;

      const pedido = new PedidoWeb({
        items: itemsDocs,
        cliente,
        entrega: entrega || "retiro",
        montoSubtotal,
        costoEnvio,
        montoTotal,
        logisticaProveedor: logisticaProveedor || null,
        opcionEnvio: opcionEnvio || null,
      });

      await pedido.save();

      // Crear preferencia MercadoPago
      if (mpPreference) {
        try {
          // Usar Origin del frontend para back_urls (no el host del backend)
          const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
          // Si el origin es el dominio de tienda (no sistema.*), usar ruta sin /tienda
          const isTiendaDomain = origin && !origin.includes('sistema.') && !origin.includes('localhost');
          const backUrl = isTiendaDomain ? `${origin}/checkout/resultado` : `${origin}/tienda/checkout/resultado`;
          // Para webhook necesitamos la URL del backend
          const apiBase = `${req.protocol}://${req.get("host")}`;

          const preference = await mpPreference.create({
            body: {
              items: itemsDocs.map((i) => ({
                title: i.nombre,
                quantity: i.cantidad,
                unit_price: Number(i.precioUnitario),
                currency_id: "ARS",
              })),
              ...(costoEnvio > 0 && {
                shipments: { cost: Number(costoEnvio) },
              }),
              payer: {
                name: cliente.nombre,
                email: cliente.email,
                phone: { number: cliente.telefono },
              },
              back_urls: {
                success: backUrl,
                failure: backUrl,
                pending: backUrl,
              },
              auto_return: "approved",
              external_reference: pedido._id.toString(),
              notification_url: `${apiBase}/api/tienda/checkout/webhook`,
            },
          });

          pedido.mpPreferenceId = preference.id;
          await pedido.save();

          const initPoint = preference.init_point || preference.sandbox_init_point;
          console.log(`MP Preference creada: ${preference.id}, initPoint: ${initPoint ? 'OK' : 'NULL'}`);

          return res.json({
            pedidoId: pedido._id,
            numeroPedido: pedido.numeroPedido,
            initPoint,
          });
        } catch (mpErr) {
          console.error("Error creando preferencia MP:", mpErr.message, mpErr);
          // Pedido creado pero sin MP - devolver sin link
          return res.json({
            pedidoId: pedido._id,
            numeroPedido: pedido.numeroPedido,
            initPoint: null,
            warning: "No se pudo crear el link de pago. Contacta por WhatsApp.",
          });
        }
      }

      // Sin MP configurado
      res.json({
        pedidoId: pedido._id,
        numeroPedido: pedido.numeroPedido,
        initPoint: null,
        warning: "Pago online no disponible. Contacta por WhatsApp para coordinar.",
      });
    } catch (err) {
      console.error("Error creando pedido:", err.message);
      res.status(500).json({ error: "Error al crear el pedido" });
    }
  });

  // POST /api/tienda/checkout/webhook (MP IPN)
  router.post("/checkout/webhook", async (req, res) => {
    try {
      res.sendStatus(200); // Responder rapido a MP

      const { type, data } = req.body;
      if (type !== "payment" || !data?.id) return;

      if (!mpPayment) return;

      const payment = await mpPayment.get({ id: data.id });
      if (!payment || !payment.external_reference) return;

      const pedido = await PedidoWeb.findById(payment.external_reference);
      if (!pedido) return;

      pedido.mpPaymentId = payment.id;
      pedido.mpStatus = payment.status;

      if (payment.status === "approved" && pedido.estado === "pendiente") {
        pedido.estado = "confirmado";

        // Descontar stock
        for (const item of pedido.items) {
          await Product.findByIdAndUpdate(item.productoId, { $inc: { cantidad: -item.cantidad } });
        }

        io.emit("cambios");
      }

      await pedido.save();
    } catch (err) {
      console.error("Error webhook MP tienda:", err.message);
    }
  });

  // GET /api/tienda/pedido/:id/estado
  router.get("/pedido/:id/estado", async (req, res) => {
    try {
      const pedido = await PedidoWeb.findById(req.params.id)
        .select("numeroPedido estado mpStatus montoTotal items cliente.nombre")
        .lean();
      if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
      res.json(pedido);
    } catch (err) {
      res.status(500).json({ error: "Error al obtener estado del pedido" });
    }
  });

  // POST /api/tienda/sommelier - Recomendacion de vinos con IA
  router.post("/sommelier", async (req, res) => {
    try {
      const { mensaje } = req.body;
      if (!mensaje || !mensaje.trim()) return res.status(400).json({ error: "Envia un mensaje para recibir recomendaciones" });

      // Obtener catalogo disponible
      const productos = await Product.find({ cantidad: { $gt: 0 }, venta: { $ne: null }, tipo: "vino" })
        .select("nombre bodega cepa year origen venta cantidad descripcion _id")
        .lean();

      if (productos.length === 0) {
        return res.json({ respuesta: "No tenemos vinos disponibles en este momento.", recomendados: [] });
      }

      const catalogoTexto = productos.map((p) =>
        `ID:${p._id} | ${p.nombre} | Bodega: ${p.bodega || '-'} | Cepa: ${p.cepa || '-'} | Año: ${p.year || '-'} | Origen: ${p.origen || '-'} | Precio: $${p.venta} | Stock: ${p.cantidad} | Desc: ${p.descripcion || '-'}`
      ).join("\n");

      const AI_KEY = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
      const AI_PROVIDER = process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.OPENAI_API_KEY ? "openai" : null;

      if (AI_KEY && AI_PROVIDER) {
        // Llamar a la IA
        let respuestaIA = "";
        try {
          if (AI_PROVIDER === "anthropic") {
            const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": AI_KEY,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 1024,
                system: `Sos el sommelier virtual de MUSA Vinoteca. Tu trabajo es recomendar vinos del catalogo basandote en lo que el cliente pide. Responde en español argentino, de forma amigable y concisa. Al final de tu respuesta, en una linea separada, pone EXACTAMENTE "IDS:" seguido de los IDs de los productos recomendados separados por coma (maximo 6). Ejemplo: "IDS:abc123,def456". Si no encontras vinos que encajen, recomenda los mas populares igualmente.\n\nCatalogo disponible:\n${catalogoTexto}`,
                messages: [{ role: "user", content: mensaje }],
              }),
            });
            const aiData = await aiRes.json();
            respuestaIA = aiData.content?.[0]?.text || "";
          } else {
            const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${AI_KEY}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                max_tokens: 1024,
                messages: [
                  {
                    role: "system",
                    content: `Sos el sommelier virtual de MUSA Vinoteca. Tu trabajo es recomendar vinos del catalogo basandote en lo que el cliente pide. Responde en español argentino, de forma amigable y concisa. Al final de tu respuesta, en una linea separada, pone EXACTAMENTE "IDS:" seguido de los IDs de los productos recomendados separados por coma (maximo 6). Ejemplo: "IDS:abc123,def456". Si no encontras vinos que encajen, recomenda los mas populares igualmente.\n\nCatalogo disponible:\n${catalogoTexto}`,
                  },
                  { role: "user", content: mensaje },
                ],
              }),
            });
            const aiData = await aiRes.json();
            respuestaIA = aiData.choices?.[0]?.message?.content || "";
          }
        } catch (aiErr) {
          console.error("Error IA sommelier:", aiErr.message);
        }

        if (respuestaIA) {
          // Extraer IDs de la respuesta
          const idsMatch = respuestaIA.match(/IDS?:\s*(.+)/i);
          let recomendados = [];
          let respuestaLimpia = respuestaIA.replace(/\n?IDS?:\s*.+/i, "").trim();

          if (idsMatch) {
            const ids = idsMatch[1].split(",").map((id) => id.trim()).filter(Boolean);
            recomendados = productos.filter((p) => ids.includes(p._id.toString()));
          }

          // Si no extrajo IDs, buscar nombres mencionados
          if (recomendados.length === 0) {
            recomendados = productos.filter((p) =>
              respuestaLimpia.toLowerCase().includes(p.nombre.toLowerCase())
            ).slice(0, 6);
          }

          return res.json({ respuesta: respuestaLimpia, recomendados });
        }
      }

      // Fallback: matching inteligente por keywords
      const msg = mensaje.toLowerCase();
      const keywords = msg.split(/\s+/).filter((w) => w.length > 2);

      const scored = productos.map((p) => {
        let score = 0;
        const text = `${p.nombre} ${p.bodega} ${p.cepa} ${p.descripcion} ${p.origen}`.toLowerCase();
        keywords.forEach((kw) => { if (text.includes(kw)) score += 2; });

        // Bonus por tipo de vino mencionado
        if (msg.includes("tinto") && /malbec|cabernet|merlot|syrah|bonarda|tinto/i.test(p.cepa)) score += 5;
        if (msg.includes("blanco") && /chardonnay|sauvignon|torrontes|blanco/i.test(p.cepa)) score += 5;
        if (msg.includes("espumante") && /espumante|brut|champagne/i.test(p.cepa)) score += 5;
        if (msg.includes("rosado") && /rosado|rose/i.test(p.cepa)) score += 5;

        // Contexto de ocasion
        if (msg.includes("asado") || msg.includes("carne")) {
          if (/malbec|cabernet|bonarda|tinto/i.test(p.cepa)) score += 4;
        }
        if (msg.includes("pescado") || msg.includes("mariscos") || msg.includes("sushi")) {
          if (/chardonnay|sauvignon|torrontes|blanco/i.test(p.cepa)) score += 4;
        }
        if (msg.includes("postre") || msg.includes("dulce")) {
          if (/tardio|dulce|cosecha/i.test(text)) score += 4;
        }
        if (msg.includes("regalo") || msg.includes("especial")) {
          const precio = parseFloat(p.venta) || 0;
          if (precio > 5000) score += 3;
        }
        if (msg.includes("barato") || msg.includes("economico") || msg.includes("accesible")) {
          const precio = parseFloat(p.venta) || 0;
          if (precio < 3000) score += 3;
        }

        return { ...p, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const recomendados = scored.slice(0, 6).filter((p) => p.score > 0);

      // Si no matcheo nada, devolver los primeros 4
      const final = recomendados.length > 0 ? recomendados : scored.slice(0, 4);

      // Generar respuesta de texto
      let respuesta = "";
      if (recomendados.length > 0) {
        respuesta = `Basandome en lo que me contas, te recomiendo estos vinos:\n\n${final.map((p) => `• **${p.nombre}** (${p.bodega || ''} - ${p.cepa || ''}) — $${p.venta}`).join("\n")}\n\nCualquiera de estos va a estar genial. Si queres mas detalles de alguno, hacele click!`;
      } else {
        respuesta = `Te cuento algunas opciones que tenemos disponibles:\n\n${final.map((p) => `• **${p.nombre}** (${p.bodega || ''} - ${p.cepa || ''}) — $${p.venta}`).join("\n")}\n\nContame mas sobre la ocasion o que tipo de vino buscas y te puedo afinar la recomendacion.`;
      }

      res.json({ respuesta, recomendados: final });
    } catch (err) {
      console.error("Error sommelier:", err.message);
      res.status(500).json({ error: "Error al procesar tu consulta" });
    }
  });

  // POST /api/tienda/transcribir-audio - Whisper STT
  router.post("/transcribir-audio", uploadAudio.single("audio"), async (req, res) => {
    try {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return res.status(500).json({ error: "API key no configurada" });
      if (!req.file) return res.status(400).json({ error: "Sin archivo de audio" });

      const FormData = (await import("form-data")).default;
      const form = new FormData();
      form.append("file", req.file.buffer, { filename: "audio.webm", contentType: req.file.mimetype });
      form.append("model", "whisper-1");
      form.append("language", "es");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, ...form.getHeaders() },
        body: form,
      });

      if (!whisperRes.ok) {
        const err = await whisperRes.text();
        console.error("Whisper error:", err);
        return res.status(500).json({ error: "Error al transcribir" });
      }

      const data = await whisperRes.json();
      res.json({ texto: data.text || "" });
    } catch (err) {
      console.error("Error transcribir-audio:", err.message);
      res.status(500).json({ error: "Error al transcribir audio" });
    }
  });

  // ── Club de Vinos ──

  // GET /api/tienda/club/planes
  router.get("/club/planes", async (req, res) => {
    try {
      const planes = await PlanClub.find({ activo: true }).sort({ orden: 1 }).lean();
      res.json(planes);
    } catch (err) {
      res.status(500).json({ error: "Error al obtener planes" });
    }
  });

  // POST /api/tienda/club/suscribir
  router.post("/club/suscribir", async (req, res) => {
    try {
      const { planId, cliente, preferencias } = req.body;

      if (!planId || !cliente?.nombre || !cliente?.email || !cliente?.telefono) {
        return res.status(400).json({ error: "Completa todos los campos obligatorios" });
      }

      const plan = await PlanClub.findById(planId).lean();
      if (!plan || !plan.activo) return res.status(400).json({ error: "Plan no disponible" });

      const suscripcion = new SuscripcionClub({
        planId: plan._id,
        planNombre: plan.nombre,
        cliente,
        precioMensual: plan.precioMensual,
        preferencias,
      });

      await suscripcion.save();
      io.emit("cambios-web");

      res.json({ ok: true, suscripcionId: suscripcion._id, mensaje: "Suscripcion registrada! Te contactaremos para coordinar la entrega." });
    } catch (err) {
      console.error("Error suscribir club:", err.message);
      res.status(500).json({ error: "Error al registrar la suscripcion" });
    }
  });

  // ── Reseñas de Productos ──

  // GET /api/tienda/resenas/:productoId
  router.get("/resenas/:productoId", async (req, res) => {
    try {
      const resenas = await Resena.find({ productoId: req.params.productoId, aprobada: true })
        .sort({ createdAt: -1 })
        .lean();

      // Calcular estadisticas
      const total = resenas.length;
      const promedio = total > 0 ? resenas.reduce((sum, r) => sum + r.puntuacion, 0) / total : 0;
      const distribucion = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      resenas.forEach((r) => { distribucion[r.puntuacion]++; });

      res.json({
        resenas,
        stats: { total, promedio: Math.round(promedio * 10) / 10, distribucion },
      });
    } catch (err) {
      res.status(500).json({ error: "Error al obtener reseñas" });
    }
  });

  // POST /api/tienda/resenas
  router.post("/resenas", async (req, res) => {
    try {
      const { productoId, nombre, email, puntuacion, titulo, comentario } = req.body;

      if (!productoId || !nombre || !email || !puntuacion || !comentario) {
        return res.status(400).json({ error: "Completa todos los campos obligatorios" });
      }

      if (puntuacion < 1 || puntuacion > 5) {
        return res.status(400).json({ error: "Puntuacion debe ser entre 1 y 5" });
      }

      // Verificar si ya dejo reseña para este producto
      const existente = await Resena.findOne({ productoId, "cliente.email": email });
      if (existente) {
        return res.status(400).json({ error: "Ya dejaste una reseña para este vino" });
      }

      const producto = await Product.findById(productoId).select("nombre").lean();
      if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

      const resena = new Resena({
        productoId,
        productoNombre: producto.nombre,
        cliente: { nombre, email },
        puntuacion: Math.round(puntuacion),
        titulo: titulo || "",
        comentario,
      });

      await resena.save();
      res.json({ ok: true, resena });
    } catch (err) {
      console.error("Error creando reseña:", err.message);
      res.status(500).json({ error: "Error al crear la reseña" });
    }
  });

  // GET /api/tienda/analisis/:productoId - Analisis IA basado en reseñas
  router.get("/analisis/:productoId", async (req, res) => {
    try {
      const producto = await Product.findById(req.params.productoId)
        .select("nombre bodega cepa year origen venta descripcion")
        .lean();
      if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

      const resenas = await Resena.find({ productoId: req.params.productoId, aprobada: true })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const total = resenas.length;
      const promedio = total > 0 ? resenas.reduce((sum, r) => sum + r.puntuacion, 0) / total : 0;

      // Info del vino
      const vinoInfo = `${producto.nombre} - Bodega: ${producto.bodega || '-'}, Cepa: ${producto.cepa || '-'}, Año: ${producto.year || '-'}, Origen: ${producto.origen || '-'}, Precio: $${producto.venta}`;

      const AI_KEY = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
      const AI_PROVIDER = process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.OPENAI_API_KEY ? "openai" : null;

      if (AI_KEY && AI_PROVIDER && total >= 1) {
        const resenasTexto = resenas.map((r) =>
          `★${"★".repeat(r.puntuacion - 1)} (${r.puntuacion}/5) - ${r.cliente.nombre}: ${r.titulo ? r.titulo + ". " : ""}${r.comentario}`
        ).join("\n");

        const systemPrompt = `Sos un sommelier experto y critico de vinos. Te dan un vino con sus datos tecnicos y reseñas de clientes. Genera un analisis breve y profesional en español argentino que incluya:
1. **Opinion general** (1-2 oraciones sobre el vino basandote en las reseñas)
2. **Lo mejor** (que destacan los clientes, 1-2 puntos)
3. **Para mejorar** (si hay criticas, mencionarlas sutilmente; si son todas positivas, omitir esta seccion)
4. **Ideal para** (ocasiones/maridajes recomendados segun las opiniones)
5. **Puntuacion sommelier** (tu valoracion X/10 basada en las reseñas y el perfil del vino)

Se conciso y amigable. Usa maximo 150 palabras. No inventes datos que no estan en las reseñas.`;

        let analisisIA = "";
        try {
          if (AI_PROVIDER === "anthropic") {
            const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": AI_KEY,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 512,
                system: systemPrompt,
                messages: [{ role: "user", content: `Vino: ${vinoInfo}\n\nReseñas (${total}, promedio ${promedio.toFixed(1)}/5):\n${resenasTexto}` }],
              }),
            });
            const aiData = await aiRes.json();
            analisisIA = aiData.content?.[0]?.text || "";
          } else {
            const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${AI_KEY}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                max_tokens: 512,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: `Vino: ${vinoInfo}\n\nReseñas (${total}, promedio ${promedio.toFixed(1)}/5):\n${resenasTexto}` },
                ],
              }),
            });
            const aiData = await aiRes.json();
            analisisIA = aiData.choices?.[0]?.message?.content || "";
          }
        } catch (aiErr) {
          console.error("Error IA analisis:", aiErr.message);
        }

        if (analisisIA) {
          return res.json({ analisis: analisisIA, fuente: "ia", totalResenas: total, promedio: Math.round(promedio * 10) / 10 });
        }
      }

      // Fallback: analisis basico sin IA
      if (total === 0) {
        return res.json({
          analisis: `**${producto.nombre}** es un ${producto.cepa || 'vino'} de ${producto.bodega || 'bodega artesanal'}${producto.year ? ` cosecha ${producto.year}` : ''}. Aun no tiene reseñas de clientes. Se el primero en probarlo y compartir tu experiencia!`,
          fuente: "auto",
          totalResenas: 0,
          promedio: 0,
        });
      }

      // Generar analisis basico basado en stats
      const mejorComentario = resenas.find((r) => r.puntuacion >= 4);
      let analisis = `**${producto.nombre}** tiene una puntuacion promedio de **${promedio.toFixed(1)}/5** basada en ${total} ${total === 1 ? 'reseña' : 'reseñas'} de clientes.\n\n`;

      if (promedio >= 4) {
        analisis += `Los clientes lo valoran muy positivamente.`;
      } else if (promedio >= 3) {
        analisis += `Los clientes tienen opiniones mixtas sobre este vino.`;
      } else {
        analisis += `Algunos clientes encontraron aspectos a mejorar.`;
      }

      if (mejorComentario) {
        analisis += ` "${mejorComentario.comentario.substring(0, 100)}${mejorComentario.comentario.length > 100 ? '...' : ''}" - ${mejorComentario.cliente.nombre}`;
      }

      res.json({ analisis, fuente: "auto", totalResenas: total, promedio: Math.round(promedio * 10) / 10 });
    } catch (err) {
      console.error("Error analisis:", err.message);
      res.status(500).json({ error: "Error al generar analisis" });
    }
  });

  // ── Etiqueta Personalizada con IA ──

  // POST /api/tienda/etiqueta/generar
  router.post("/etiqueta/generar", async (req, res) => {
    try {
      const { ocasion, destinatario, mensaje, estiloVino, estiloVisual, conImagen, imagenDescripcion } = req.body;

      if (!ocasion || !destinatario || !mensaje) {
        return res.status(400).json({ error: "Completa la ocasion, destinatario y mensaje" });
      }

      const AI_KEY_ANTHROPIC = process.env.ANTHROPIC_API_KEY;
      const AI_KEY_OPENAI = process.env.OPENAI_API_KEY;
      const TEXT_KEY = AI_KEY_ANTHROPIC || AI_KEY_OPENAI;
      const TEXT_PROVIDER = AI_KEY_ANTHROPIC ? "anthropic" : AI_KEY_OPENAI ? "openai" : null;

      // Paso 1: Generar texto creativo para la etiqueta
      let textoEtiqueta = "";
      const textPrompt = `Sos un diseñador de etiquetas de vino premium. Genera el texto creativo para una etiqueta de vino personalizada para regalo con estos datos:
- Ocasion: ${ocasion}
- Destinatario: ${destinatario}
- Mensaje personal del remitente: ${mensaje}
- Tipo de vino: ${estiloVino || "tinto"}

Genera EXACTAMENTE este formato JSON (sin markdown, sin backticks, solo JSON puro):
{
  "titulo": "nombre creativo del vino (3-5 palabras, elegante)",
  "subtitulo": "frase corta poetica o evocadora (max 8 palabras)",
  "dedicatoria": "version refinada y elegante del mensaje personal (max 20 palabras)",
  "year": "${new Date().getFullYear()}",
  "detalle": "nota de cata ficticia breve y elegante (max 15 palabras)"
}`;

      if (TEXT_KEY && TEXT_PROVIDER) {
        try {
          if (TEXT_PROVIDER === "anthropic") {
            const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": TEXT_KEY,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 512,
                system: "Respondes solo con JSON valido, sin markdown ni explicaciones.",
                messages: [{ role: "user", content: textPrompt }],
              }),
            });
            const aiData = await aiRes.json();
            textoEtiqueta = aiData.content?.[0]?.text || "";
          } else {
            const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${TEXT_KEY}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                max_tokens: 512,
                messages: [
                  { role: "system", content: "Respondes solo con JSON valido, sin markdown ni explicaciones." },
                  { role: "user", content: textPrompt },
                ],
              }),
            });
            const aiData = await aiRes.json();
            textoEtiqueta = aiData.choices?.[0]?.message?.content || "";
          }
        } catch (aiErr) {
          console.error("Error IA texto etiqueta:", aiErr.message);
        }
      }

      // Parsear respuesta de IA
      let labelData;
      try {
        const cleaned = textoEtiqueta.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        labelData = JSON.parse(cleaned);
      } catch {
        // Nombres creativos de fallback segun ocasion
        const TITULOS_FALLBACK = {
          cumpleanos: "Cosecha de Vida",
          aniversario: "Reserva del Amor",
          navidad: "Brindis de Navidad",
          casamiento: "Union Eterna",
          "dia-del-padre": "Gran Reserva Paternal",
          "dia-de-la-madre": "Alma de Madre",
          agradecimiento: "Gratitud Infinita",
          otro: "Momento Especial",
        };
        labelData = {
          titulo: TITULOS_FALLBACK[ocasion] || "Edicion Especial",
          subtitulo: `Dedicado a ${destinatario}`,
          dedicatoria: mensaje.substring(0, 80),
          year: new Date().getFullYear().toString(),
          detalle: "Un vino tan unico como quien lo recibe",
        };
      }

      // Paso 2: Generar ilustracion con DALL-E 3 (solo si el usuario lo pidio)
      let ilustracionUrl = null;
      if (conImagen && AI_KEY_OPENAI) {
        const STYLE_MAP = {
          clasico: "classic vintage engraving style, elegant, sepia tones",
          moderno: "modern minimalist vector art, clean lines, flat design",
          artistico: "hand-painted watercolor, bohemian, soft organic shapes",
          romantico: "soft floral illustration, delicate, warm pink and gold tones",
          divertido: "colorful pop art, playful, vibrant cartoon style",
        };

        const styleDesc = STYLE_MAP[estiloVisual] || STYLE_MAP.clasico;

        const subject = imagenDescripcion
          ? imagenDescripcion
          : "elegant wine-themed motif with grapes and vines";

        const dallePrompt = `Create a small decorative illustration for a wine label. The subject is: ${subject}.

Style: ${styleDesc}.
Wine type: ${estiloVino || "red wine"}.

IMPORTANT RULES:
- This is ONLY the illustration/drawing, NOT a full label. No text, no title, no words at all.
- Square format, centered composition.
- Transparent or plain white background.
- The illustration should work as a decorative element inside a wine label.
- Elegant, high quality, detailed artwork.
- No wine bottle, no glass, no full label design — ONLY the illustration/artwork.`;

        try {
          const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${AI_KEY_OPENAI}`,
            },
            body: JSON.stringify({
              model: "dall-e-3",
              prompt: dallePrompt,
              n: 1,
              size: "1024x1024",
              quality: "standard",
              response_format: "b64_json",
            }),
          });

          const imgData = await imgRes.json();

          if (imgData.data?.[0]?.b64_json) {
            ilustracionUrl = `data:image/png;base64,${imgData.data[0].b64_json}`;
          }
        } catch (imgErr) {
          console.error("Error DALL-E ilustracion:", imgErr.message);
        }
      }

      res.json({ ok: true, labelData, ilustracionUrl });
    } catch (err) {
      console.error("Error generar etiqueta:", err.message);
      res.status(500).json({ error: "Error al generar la etiqueta" });
    }
  });

  // ── Perfil Publico del Cliente ──

  // Helper: compute client profile data (reused by token and search endpoints)
  async function computeClientProfile(cliente) {
    const ventas = await Venta.find({ clienteId: cliente._id }).select("-facturaPdf -notaCreditoPdf").sort({ createdAt: -1 }).limit(200).lean();
    const productosComprados = [];
    const productoIdsSet = new Set();
    const cepasProbadas = new Set();
    const bodegasProbadas = new Set();

    ventas.forEach((v) => {
      (v.productos || []).forEach((p) => {
        productosComprados.push({ ...p, fecha: v.createdAt });
        if (p.productoId) productoIdsSet.add(String(p.productoId));
        if (p.cepa) cepasProbadas.add(p.cepa);
        if (p.bodega) bodegasProbadas.add(p.bodega);
      });
    });

    const totalGastado = ventas.reduce((s, v) => s + (v.monto || 0), 0);
    const cantCompras = ventas.length;
    const vinosUnicos = productoIdsSet.size;

    let nivel, nivelNum;
    if (cantCompras === 0) { nivel = "Nuevo"; nivelNum = 0; }
    else if (cantCompras <= 3) { nivel = "Curioso"; nivelNum = 1; }
    else if (cantCompras <= 10) { nivel = "Explorador"; nivelNum = 2; }
    else if (cantCompras <= 25) { nivel = "Conocedor"; nivelNum = 3; }
    else if (cantCompras <= 50) { nivel = "Sommelier"; nivelNum = 4; }
    else { nivel = "Maestro"; nivelNum = 5; }

    const cepaCount = {};
    const bodegaCount = {};
    productosComprados.forEach((p) => {
      if (p.cepa) cepaCount[p.cepa] = (cepaCount[p.cepa] || 0) + (p.cantidad || 1);
      if (p.bodega) bodegaCount[p.bodega] = (bodegaCount[p.bodega] || 0) + (p.cantidad || 1);
    });
    const cepaFav = Object.entries(cepaCount).sort((a, b) => b[1] - a[1])[0];
    const bodegaFav = Object.entries(bodegaCount).sort((a, b) => b[1] - a[1])[0];

    // Solo productos tipo vino para colecciones (excluir cerveza, agua tonica, aceite, etc.)
    const filtroVino = { cantidad: { $gt: 0 }, $or: [{ tipo: "vino" }, { tipo: { $exists: false } }, { tipo: null }] };
    const todasCepas = (await Product.distinct("cepa", { ...filtroVino, cepa: { $ne: null, $ne: "" } })).filter(Boolean);
    const todasBodegas = (await Product.distinct("bodega", { ...filtroVino, bodega: { $ne: null, $ne: "" } })).filter(Boolean);
    const todasRegiones = (await Product.distinct("origen", { ...filtroVino, origen: { $ne: null, $ne: "" } })).filter(Boolean);
    const valoraciones = ValoracionVino ? await ValoracionVino.find({ clienteId: cliente._id }).lean() : [];

    // Filtrar cepas/bodegas/regiones probadas solo de productos tipo vino
    const origenProbado = new Set();
    for (const p of productosComprados) {
      if (p.origen) origenProbado.add(p.origen);
    }

    // Logros con premios
    const logros = [];
    if (cantCompras >= 1) logros.push({ id: "primera_compra", nombre: "Primera Compra", desc: "Realizaste tu primera compra", icono: "bi-bag-check", premio: { tipo: "descuento", valor: 5, descripcion: "5% de descuento en tu proxima compra" } });
    if (cantCompras >= 5) logros.push({ id: "cliente_frecuente", nombre: "Cliente Frecuente", desc: "5 compras realizadas", icono: "bi-arrow-repeat", premio: { tipo: "descuento", valor: 10, descripcion: "10% de descuento en tu proxima compra" } });
    if (cantCompras >= 10) logros.push({ id: "fiel", nombre: "Cliente Fiel", desc: "10 compras realizadas", icono: "bi-heart", premio: { tipo: "vino_gratis", descripcion: "Un vino de regalo a eleccion (hasta $15.000)" } });
    if (cantCompras >= 25) logros.push({ id: "vip", nombre: "VIP", desc: "25 compras realizadas", icono: "bi-star", premio: { tipo: "degustacion_gratis", descripcion: "Degustacion gratuita para 2 personas" } });
    if (vinosUnicos >= 5) logros.push({ id: "explorador_5", nombre: "Explorador", desc: "Probaste 5 vinos diferentes", icono: "bi-compass", premio: { tipo: "descuento", valor: 5, descripcion: "5% en vinos que no hayas probado" } });
    if (vinosUnicos >= 15) logros.push({ id: "explorador_15", nombre: "Gran Explorador", desc: "Probaste 15 vinos diferentes", icono: "bi-binoculars", premio: { tipo: "vino_gratis", descripcion: "Un vino sorpresa de regalo" } });
    if (vinosUnicos >= 30) logros.push({ id: "explorador_30", nombre: "Aventurero", desc: "Probaste 30 vinos diferentes", icono: "bi-globe", premio: { tipo: "degustacion_gratis", descripcion: "Degustacion premium gratuita para 2 personas" } });
    if (cepasProbadas.size >= 3) logros.push({ id: "cepas_3", nombre: "Multicepas", desc: "Probaste 3 cepas diferentes", icono: "bi-collection", premio: { tipo: "descuento", valor: 5, descripcion: "5% en cepas que no probaste" } });
    if (cepasProbadas.size >= 5) logros.push({ id: "cepas_5", nombre: "Conocedor de Cepas", desc: "Probaste 5 cepas diferentes", icono: "bi-grid-3x3", premio: { tipo: "descuento", valor: 10, descripcion: "10% en cepas que no probaste" } });
    if (cepasProbadas.size >= todasCepas.length && todasCepas.length > 0) logros.push({ id: "todas_cepas", nombre: "Coleccionista", desc: "Probaste todas las cepas!", icono: "bi-trophy", premio: { tipo: "vino_gratis", descripcion: "Botella premium de regalo" } });
    if (bodegasProbadas.size >= 3) logros.push({ id: "bodegas_3", nombre: "Viajero", desc: "Probaste 3 bodegas diferentes", icono: "bi-geo-alt", premio: { tipo: "descuento", valor: 5, descripcion: "5% en bodegas que no probaste" } });
    if (bodegasProbadas.size >= 8) logros.push({ id: "bodegas_8", nombre: "Trotamundos", desc: "Probaste 8 bodegas diferentes", icono: "bi-map", premio: { tipo: "vino_gratis", descripcion: "Vino de bodega sorpresa de regalo" } });
    if (valoraciones.length >= 1) logros.push({ id: "primera_nota", nombre: "Critico Novato", desc: "Escribiste tu primera nota de cata", icono: "bi-pencil", premio: { tipo: "descuento", valor: 5, descripcion: "5% en tu proxima compra" } });
    if (valoraciones.length >= 5) logros.push({ id: "critico", nombre: "Critico", desc: "5 vinos valorados", icono: "bi-journal-text", premio: { tipo: "descuento", valor: 10, descripcion: "10% en tu proxima compra" } });
    if (valoraciones.length >= 10) logros.push({ id: "gran_critico", nombre: "Gran Critico", desc: "10 vinos valorados", icono: "bi-award", premio: { tipo: "vino_gratis", descripcion: "Un vino a eleccion de regalo" } });
    if (totalGastado >= 50000) logros.push({ id: "gastador", nombre: "Gran Inversor", desc: "Invertiste mas de $50.000 en vinos", icono: "bi-cash-coin", premio: { tipo: "descuento", valor: 15, descripcion: "15% en tu proxima compra" } });
    if (totalGastado >= 200000) logros.push({ id: "mecenas", nombre: "Mecenas", desc: "Invertiste mas de $200.000 en vinos", icono: "bi-gem", premio: { tipo: "degustacion_gratis", descripcion: "Degustacion exclusiva para 4 personas + vino de regalo" } });

    const todosLogros = [
      { id: "primera_compra", nombre: "Primera Compra", desc: "Realiza tu primera compra", icono: "bi-bag-check", req: cantCompras >= 1, premio: { tipo: "descuento", valor: 5, descripcion: "5% de descuento en tu proxima compra" } },
      { id: "cliente_frecuente", nombre: "Cliente Frecuente", desc: "5 compras", icono: "bi-arrow-repeat", req: cantCompras >= 5, premio: { tipo: "descuento", valor: 10, descripcion: "10% de descuento en tu proxima compra" } },
      { id: "fiel", nombre: "Cliente Fiel", desc: "10 compras", icono: "bi-heart", req: cantCompras >= 10, premio: { tipo: "vino_gratis", descripcion: "Un vino de regalo a eleccion (hasta $15.000)" } },
      { id: "vip", nombre: "VIP", desc: "25 compras", icono: "bi-star", req: cantCompras >= 25, premio: { tipo: "degustacion_gratis", descripcion: "Degustacion gratuita para 2 personas" } },
      { id: "explorador_5", nombre: "Explorador", desc: "5 vinos diferentes", icono: "bi-compass", req: vinosUnicos >= 5, premio: { tipo: "descuento", valor: 5, descripcion: "5% en vinos que no hayas probado" } },
      { id: "explorador_15", nombre: "Gran Explorador", desc: "15 vinos diferentes", icono: "bi-binoculars", req: vinosUnicos >= 15, premio: { tipo: "vino_gratis", descripcion: "Un vino sorpresa de regalo" } },
      { id: "explorador_30", nombre: "Aventurero", desc: "30 vinos diferentes", icono: "bi-globe", req: vinosUnicos >= 30, premio: { tipo: "degustacion_gratis", descripcion: "Degustacion premium gratuita para 2 personas" } },
      { id: "cepas_3", nombre: "Multicepas", desc: "3 cepas diferentes", icono: "bi-collection", req: cepasProbadas.size >= 3, premio: { tipo: "descuento", valor: 5, descripcion: "5% en cepas que no probaste" } },
      { id: "cepas_5", nombre: "Conocedor de Cepas", desc: "5 cepas diferentes", icono: "bi-grid-3x3", req: cepasProbadas.size >= 5, premio: { tipo: "descuento", valor: 10, descripcion: "10% en cepas que no probaste" } },
      { id: "todas_cepas", nombre: "Coleccionista", desc: "Todas las cepas", icono: "bi-trophy", req: cepasProbadas.size >= todasCepas.length && todasCepas.length > 0, premio: { tipo: "vino_gratis", descripcion: "Botella premium de regalo" } },
      { id: "bodegas_3", nombre: "Viajero", desc: "3 bodegas", icono: "bi-geo-alt", req: bodegasProbadas.size >= 3, premio: { tipo: "descuento", valor: 5, descripcion: "5% en bodegas que no probaste" } },
      { id: "bodegas_8", nombre: "Trotamundos", desc: "8 bodegas", icono: "bi-map", req: bodegasProbadas.size >= 8, premio: { tipo: "vino_gratis", descripcion: "Vino de bodega sorpresa de regalo" } },
      { id: "primera_nota", nombre: "Critico Novato", desc: "Primera nota de cata", icono: "bi-pencil", req: valoraciones.length >= 1, premio: { tipo: "descuento", valor: 5, descripcion: "5% en tu proxima compra" } },
      { id: "critico", nombre: "Critico", desc: "5 valoraciones", icono: "bi-journal-text", req: valoraciones.length >= 5, premio: { tipo: "descuento", valor: 10, descripcion: "10% en tu proxima compra" } },
      { id: "gran_critico", nombre: "Gran Critico", desc: "10 valoraciones", icono: "bi-award", req: valoraciones.length >= 10, premio: { tipo: "vino_gratis", descripcion: "Un vino a eleccion de regalo" } },
      { id: "gastador", nombre: "Gran Inversor", desc: "Mas de $50.000 invertidos", icono: "bi-cash-coin", req: totalGastado >= 50000, premio: { tipo: "descuento", valor: 15, descripcion: "15% en tu proxima compra" } },
      { id: "mecenas", nombre: "Mecenas", desc: "Mas de $200.000 invertidos", icono: "bi-gem", req: totalGastado >= 200000, premio: { tipo: "degustacion_gratis", descripcion: "Degustacion exclusiva para 4 personas + vino de regalo" } },
    ];

    // Colecciones
    const coleccionCepas = todasCepas.sort((a, b) => a.localeCompare(b, "es")).map((cepa) => ({
      cepa, probada: cepasProbadas.has(cepa),
    }));
    const coleccionBodegas = todasBodegas.sort((a, b) => a.localeCompare(b, "es")).map((bodega) => ({
      bodega, probada: bodegasProbadas.has(bodega),
    }));
    const coleccionRegiones = todasRegiones.sort((a, b) => a.localeCompare(b, "es")).map((region) => ({
      region, probada: origenProbado.has(region),
    }));

    return {
      cliente: { _id: cliente._id, nombre: cliente.nombre, apellido: cliente.apellido, estadoPerfil: cliente.estadoPerfil || "aprobado", tokenAcceso: cliente.tokenAcceso },
      metricas: { totalGastado, cantCompras, vinosUnicos },
      nivel, nivelNum,
      preferencias: {
        cepaFavorita: cepaFav ? cepaFav[0] : null,
        bodegaFavorita: bodegaFav ? bodegaFav[0] : null,
        cepasProbadas: cepasProbadas.size,
        totalCepas: todasCepas.length,
        bodegasProbadas: bodegasProbadas.size,
        totalBodegas: todasBodegas.length,
        regionesProbadas: origenProbado.size,
        totalRegiones: todasRegiones.length,
      },
      coleccionCepas,
      coleccionBodegas,
      coleccionRegiones,
      logros,
      todosLogros,
    };
  }

  // Normalize AR phone: strip non-digits, remove 54, leading 0, embedded 15
  function normalizeWhatsapp(raw) {
    if (!raw) return "";
    let d = raw.replace(/\D/g, "");
    if (d.startsWith("54")) d = d.slice(2);
    if (d.startsWith("0")) d = d.slice(1);
    const m15 = d.match(/^(\d{2,4})15(\d+)$/);
    if (m15) d = m15[1] + m15[2];
    return d.slice(0, 10);
  }

  // POST /api/tienda/perfil/registrar - Self-registration
  router.post("/perfil/registrar", async (req, res) => {
    try {
      const { nombre, apellido, dni, whatsapp } = req.body;
      if (!nombre || !nombre.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
      if (!dni || !dni.trim()) return res.status(400).json({ error: "Ingresa tu DNI" });

      // Check if already exists by DNI
      const existente = await Cliente.findOne({ dni: dni.trim() }).lean();
      if (existente) {
        // If already registered, return their token so they can access their profile
        if (existente.tokenAcceso) {
          return res.json({ ok: true, token: existente.tokenAcceso, yaExiste: true, mensaje: "Ya tenes un perfil! Te redirigimos." });
        }
        // Generate token for existing client without one
        const cli = await Cliente.findById(existente._id);
        const crypto = require("crypto");
        cli.tokenAcceso = crypto.randomBytes(16).toString("hex");
        await cli.save();
        return res.json({ ok: true, token: cli.tokenAcceso, yaExiste: true, mensaje: "Ya tenes un perfil! Te redirigimos." });
      }

      // Create new client with pending status
      const nuevoCliente = new Cliente({
        nombre: nombre.trim(),
        apellido: apellido?.trim() || "",
        dni: dni.trim(),
        whatsapp: normalizeWhatsapp(whatsapp),
        estadoPerfil: "aprobado",
        autoRegistro: true,
        tags: ["auto-registro"],
      });
      await nuevoCliente.save();
      io.emit("cambios-clientes");

      res.json({ ok: true, token: nuevoCliente.tokenAcceso, yaExiste: false, mensaje: "Registro exitoso! Te redirigimos a tu perfil." });
    } catch (err) {
      console.error("Error registro cliente:", err.message);
      res.status(500).json({ error: "Error al registrarte" });
    }
  });

  // GET /api/tienda/perfil/:token - Public profile by unique token (for QR)
  router.get("/perfil/:token", async (req, res) => {
    try {
      const cliente = await Cliente.findOne({ tokenAcceso: req.params.token }).lean();
      if (!cliente) return res.status(404).json({ error: "Perfil no encontrado" });
      const profile = await computeClientProfile(cliente);
      res.json(profile);
    } catch (err) {
      console.error("Error perfil publico:", err.message);
      res.status(500).json({ error: "Error al obtener perfil" });
    }
  });

  // POST /api/tienda/perfil/buscar - Search client by DNI or email
  router.post("/perfil/buscar", async (req, res) => {
    try {
      const { busqueda } = req.body;
      if (!busqueda || busqueda.trim().length < 3) return res.status(400).json({ error: "Ingresa al menos 3 caracteres" });

      const q = busqueda.trim();
      const cliente = await Cliente.findOne({
        $or: [
          { dni: q },
          { email: new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        ],
      }).lean();

      if (!cliente) return res.status(404).json({ error: "No encontramos un perfil con esos datos. Consulta en la vinoteca." });

      const profile = await computeClientProfile(cliente);
      res.json(profile);
    } catch (err) {
      console.error("Error buscar perfil:", err.message);
      res.status(500).json({ error: "Error al buscar perfil" });
    }
  });

  // POST /api/tienda/perfil/login-dni - Login or register by DNI
  router.post("/perfil/login-dni", async (req, res) => {
    try {
      const { dni } = req.body;
      if (!dni || dni.trim().length < 3) return res.status(400).json({ error: "Ingresa tu DNI" });

      const cliente = await Cliente.findOne({ dni: dni.trim() });
      if (cliente) {
        // Existing client - ensure they have a token
        if (!cliente.tokenAcceso) {
          const crypto = require("crypto");
          cliente.tokenAcceso = crypto.randomBytes(16).toString("hex");
          await cliente.save();
        }
        return res.json({
          ok: true,
          yaExiste: true,
          token: cliente.tokenAcceso,
          cliente: {
            nombre: cliente.nombre || "",
            apellido: cliente.apellido || "",
            whatsapp: cliente.whatsapp || "",
            dni: cliente.dni,
          },
        });
      }

      // Not found - client needs to register
      return res.json({ ok: true, yaExiste: false });
    } catch (err) {
      console.error("Error login-dni:", err.message);
      res.status(500).json({ error: "Error al buscar cliente" });
    }
  });

  // PUT /api/tienda/perfil/:token/datos - Update client profile data
  router.put("/perfil/:token/datos", async (req, res) => {
    try {
      const cliente = await Cliente.findOne({ tokenAcceso: req.params.token });
      if (!cliente) return res.status(404).json({ error: "Perfil no encontrado" });

      const { nombre, apellido, whatsapp } = req.body;
      if (nombre && nombre.trim()) cliente.nombre = nombre.trim();
      if (apellido !== undefined) cliente.apellido = apellido.trim();
      if (whatsapp !== undefined) cliente.whatsapp = normalizeWhatsapp(whatsapp);
      await cliente.save();
      io.emit("cambios-clientes");

      res.json({ ok: true, mensaje: "Datos actualizados" });
    } catch (err) {
      console.error("Error actualizar datos:", err.message);
      res.status(500).json({ error: "Error al actualizar datos" });
    }
  });

  // POST /api/tienda/perfil/:token/sugerencia - Submit client suggestion
  router.post("/perfil/:token/sugerencia", async (req, res) => {
    try {
      const cliente = await Cliente.findOne({ tokenAcceso: req.params.token }).lean();
      if (!cliente) return res.status(404).json({ error: "Perfil no encontrado" });

      const { tipo, mensaje } = req.body;
      if (!mensaje || mensaje.trim().length < 5) return res.status(400).json({ error: "El mensaje debe tener al menos 5 caracteres" });

      const sugerencia = new SugerenciaCliente({
        clienteId: cliente._id,
        clienteNombre: `${cliente.nombre}${cliente.apellido ? ' ' + cliente.apellido : ''}`,
        tipo: tipo || "sugerencia",
        mensaje: mensaje.trim(),
      });
      await sugerencia.save();
      io.emit("cambios");

      res.json({ ok: true, mensaje: "Gracias por tu comentario! Lo vamos a tener en cuenta." });
    } catch (err) {
      console.error("Error sugerencia:", err.message);
      res.status(500).json({ error: "Error al enviar sugerencia" });
    }
  });

  // POST /api/tienda/perfil/buscar/sugerencia - Submit suggestion via search (DNI/email)
  router.post("/perfil/buscar/sugerencia", async (req, res) => {
    try {
      const { busqueda, tipo, mensaje } = req.body;
      if (!mensaje || mensaje.trim().length < 5) return res.status(400).json({ error: "El mensaje debe tener al menos 5 caracteres" });

      let cliente = null;
      if (busqueda) {
        const q = busqueda.trim();
        cliente = await Cliente.findOne({
          $or: [
            { dni: q },
            { email: new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
          ],
        }).lean();
      }

      const sugerencia = new SugerenciaCliente({
        clienteId: cliente?._id || null,
        clienteNombre: cliente ? `${cliente.nombre}${cliente.apellido ? ' ' + cliente.apellido : ''}` : "Anonimo",
        tipo: tipo || "sugerencia",
        mensaje: mensaje.trim(),
      });
      await sugerencia.save();
      io.emit("cambios");

      res.json({ ok: true, mensaje: "Gracias por tu comentario! Lo vamos a tener en cuenta." });
    } catch (err) {
      console.error("Error sugerencia busqueda:", err.message);
      res.status(500).json({ error: "Error al enviar sugerencia" });
    }
  });

  // GET /api/tienda/perfil/:token/token-info - Get token for generating QR link
  router.get("/perfil/token/:clienteId", async (req, res) => {
    try {
      let cliente = await Cliente.findById(req.params.clienteId);
      if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });

      // Generate token if not present
      if (!cliente.tokenAcceso) {
        const crypto = require("crypto");
        cliente.tokenAcceso = crypto.randomBytes(16).toString("hex");
        await cliente.save();
      }

      res.json({ token: cliente.tokenAcceso });
    } catch (err) {
      console.error("Error token cliente:", err.message);
      res.status(500).json({ error: "Error al obtener token" });
    }
  });

  // GET /api/tienda/eventos - Eventos publicos (proximos y en_curso)
  router.get("/eventos", async (req, res) => {
    try {
      const eventos = await Evento.find({
        estado: { $in: ["proximo", "en_curso"] },
      })
        .select("nombre descripcion fecha capacidadMaxima precioPorPersona estado")
        .sort({ fecha: 1 })
        .limit(20)
        .lean();
      res.json(eventos);
    } catch (err) {
      console.error("Error fetch eventos publicos:", err.message);
      res.json([]);
    }
  });

  return router;
};
