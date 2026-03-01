const express = require("express");
const router = express.Router();
const moment = require("moment-timezone");

module.exports = function createTiendaRouter({ Product, PedidoWeb, ConfigTienda, PlanClub, SuscripcionClub, Resena, mpClient, io }) {
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
        .select("nombre bodega cepa year origen venta cantidad descripcion tipo foto codigo")
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

  // POST /api/tienda/pedido
  router.post("/pedido", async (req, res) => {
    try {
      const { items, cliente, entrega } = req.body;

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

      // Costo envio
      let costoEnvio = 0;
      if (entrega === "envio") {
        const config = await ConfigTienda.findById("main").lean();
        if (config?.envioHabilitado) costoEnvio = config.costoEnvio || 0;
      }

      const montoTotal = montoSubtotal + costoEnvio;

      const pedido = new PedidoWeb({
        items: itemsDocs,
        cliente,
        entrega: entrega || "retiro",
        montoSubtotal,
        costoEnvio,
        montoTotal,
      });

      await pedido.save();

      // Crear preferencia MercadoPago
      if (mpPreference) {
        try {
          // Usar Origin del frontend para back_urls (no el host del backend)
          const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
          const backUrl = `${origin}/tienda/checkout/resultado`;
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
        .select("nombre bodega cepa year origen venta cantidad descripcion foto _id")
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

  return router;
};
