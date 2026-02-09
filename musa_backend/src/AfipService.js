const path = require("path");
const fs = require("fs");
const { Wsaa, Wsfe, Wspci } = require("afipjs");

process.on("uncaughtException", (err) => {
  console.error("Excepción no capturada:", err);
});

class AfipService {
  constructor({ CUIT }) {
    this.CUIT = CUIT;

    this.conf = {
      prod: true,
      debug: false,
    };

    this.pem = fs.readFileSync(
      path.join(__dirname, "cert", "musaprodcert.crt"),
      "utf8"
    );
    this.key = fs.readFileSync(
      path.join(__dirname, "cert", "musaprodkey.key"),
      "utf8"
    );

    this.wsfe = null;
    this.wspci = null;

    this.pago_efectivo = 10000000;
    this.pago_electronico = 10000000;

    this.ptoVta = 21;
  }

  async initWsfe() {
    const taFile = path.join(__dirname, "wsfe_ta.xml");
    const wsaaFe = new Wsaa(this.conf);
    wsaaFe.setCertificate(this.pem);
    wsaaFe.setKey(this.key);

    if (!this.wsfe) {
      const ta = await this.getValidTA(wsaaFe, "wsfe");
      this.wsfe = new Wsfe(ta, this.conf);
    } else {
      try {
        const storedTA = wsaaFe.createTAFromString(
          fs.readFileSync(taFile, "utf8")
        );
        if (!storedTA.isValid()) {
          const newTA = await this.getValidTA(wsaaFe, "wsfe");
          this.wsfe = new Wsfe(newTA, this.conf);
        } else {
          console.log("El TA almacenado es válido.");
        }
      } catch (error) {
        console.error("Error al validar el TA almacenado:", error);
        const newTA = await this.getValidTA(wsaaFe, "wsfe");
        this.wsfe = new Wsfe(newTA, this.conf);
      }
    }
  }

  async initWspci() {
    const taFile = path.join(__dirname, "ws_sr_constancia_inscripcion_ta.xml");
    const wsaaPci = new Wsaa({
      ...this.conf,
      service: "ws_sr_constancia_inscripcion",
    });
    wsaaPci.setCertificate(this.pem);
    wsaaPci.setKey(this.key);

    if (!this.wspci) {
      const ta = await this.getValidTA(wsaaPci, "ws_sr_constancia_inscripcion");
      this.wspci = new Wspci(ta, this.conf);
    } else {
      try {
        const storedTA = wsaaPci.createTAFromString(
          fs.readFileSync(taFile, "utf8")
        );
        if (!storedTA.isValid()) {
          const newTA = await this.getValidTA(
            wsaaPci,
            "ws_sr_constancia_inscripcion"
          );
          this.wspci = new Wspci(newTA, this.conf);
        } else {
          console.log(
            "El TA almacenado para ws_sr_constancia_inscripcion es válido."
          );
        }
      } catch (error) {
        console.error(
          "Error al validar el TA almacenado para ws_sr_constancia_inscripcion:",
          error
        );
        const newTA = await this.getValidTA(
          wsaaPci,
          "ws_sr_constancia_inscripcion"
        );
        this.wspci = new Wspci(newTA, this.conf);
      }
    }
  }

  async getValidTA(wsaa, service) {
    const taFile = path.join(__dirname, `${service}_ta.xml`);

    try {
      const ta = wsaa.createTAFromString(fs.readFileSync(taFile, "utf8"));
      if (ta.isValid()) return ta;
    } catch {}

    for (let i = 0; i < 3; i++) {
      try {
        const tra = wsaa.createTRA(service);
        const ta = await tra.supplicateTA();
        fs.writeFileSync(taFile, ta.TA);
        return ta;
      } catch (err) {
        if (err.code === "ECONNRESET" && i < 2) {
          console.warn(
            `ECONNRESET al obtener TA (${service}), intento ${
              i + 1
            }, reintentando...`
          );
          await new Promise((res) => setTimeout(res, 500));
        } else {
          throw err;
        }
      }
    }
  }

  async retryIfConnReset(fn, retries = 3, label = "AFIP call") {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (err.code === "ECONNRESET" && i < retries - 1) {
          console.warn(
            `${label} falló con ECONNRESET. Reintento ${i + 1}/${retries}`
          );
          await new Promise((res) => setTimeout(res, 500));
        } else {
          throw err;
        }
      }
    }
  }

  async getTiposIva() {
    await this.initWsfe();
    const response = await this.retryIfConnReset(
      () => this.wsfe.FEParamGetTiposIva({}),
      3,
      "FEParamGetTiposIva"
    );
    console.dir(response, { depth: null });
  }

  async getPersona(cuit) {
    await this.initWspci();
    const response = await this.retryIfConnReset(
      () =>
        this.wspci.getPersona_v2({
          cuitRepresentada: this.CUIT,
          idPersona: cuit,
        }),
      3,
      "getPersona_v2"
    );
    return response;
  }

  async ultimoAutorizado(PtoVta, CbteTipo) {
    await this.initWsfe();
    const response = await this.retryIfConnReset(
      () => this.wsfe.FECompUltimoAutorizado({ PtoVta, CbteTipo }),
      3,
      "FECompUltimoAutorizado"
    );
    return response.FECompUltimoAutorizadoResult.CbteNro;
  }

  async facturaA(monto, cuit) {
    await this.initWsfe();
    const CbteTipo = 1;
    const ultimo = await this.ultimoAutorizado(this.ptoVta, CbteTipo);
    const fecha = this.getCurrentDate();
    const { importe_total, importe_gravado, importe_iva } =
      this.calculateImportes(monto);
    const factura = this.buildFactura(
      CbteTipo,
      cuit,
      ultimo,
      fecha,
      importe_total,
      importe_gravado,
      importe_iva
    );
    const response = await this.retryIfConnReset(
      () => this.wsfe.FECAESolicitar(factura),
      3,
      "FECAESolicitar (facturaA)"
    );
    console.dir(response, { depth: null });
    return {
      CAE: response.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0].CAE,
      vtoCAE:
        response.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0].CAEFchVto,
      numeroComprobante: ultimo + 1,
      docTipo: 80,
    };
  }

  async facturaB(monto, docNro) {
    await this.initWsfe();
    const CbteTipo = 6;
    const ultimo = await this.ultimoAutorizado(this.ptoVta, CbteTipo);
    const fecha = this.getCurrentDate();
    const { importe_total, importe_gravado, importe_iva } =
      this.calculateImportes(monto);
    const docTipo = docNro !== 0 ? 96 : 99;
    const factura = this.buildFactura(
      CbteTipo,
      docNro,
      ultimo,
      fecha,
      importe_total,
      importe_gravado,
      importe_iva,
      docTipo
    );
    const response = await this.retryIfConnReset(
      () => this.wsfe.FECAESolicitar(factura),
      3,
      "FECAESolicitar (facturaB)"
    );
    return {
      CAE: response.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0].CAE,
      vtoCAE:
        response.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0].CAEFchVto,
      numeroComprobante: ultimo + 1,
      docTipo,
    };
  }

  async notaCreditoA(monto, cuit, facturaNumero) {
    await this.initWsfe();
    const CbteTipo = 3;
    const ultimo = await this.ultimoAutorizado(this.ptoVta, CbteTipo);
    const fecha = this.getCurrentDate();
    const { importe_total, importe_gravado, importe_iva } =
      this.calculateImportes(monto);
    const factura = this.buildFactura(
      CbteTipo,
      cuit,
      ultimo,
      fecha,
      importe_total,
      importe_gravado,
      importe_iva,
      80,
      { Tipo: 1, PtoVta: this.ptoVta, Nro: facturaNumero }
    );
    const response = await this.retryIfConnReset(
      () => this.wsfe.FECAESolicitar(factura),
      3,
      "FECAESolicitar (notaCreditoA)"
    );
    return {
      CAE: response.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0].CAE,
      vtoCAE:
        response.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0].CAEFchVto,
      numeroComprobante: ultimo + 1,
      docTipo: 80,
    };
  }

  async notaCreditoB(monto, docNro, facturaNumero) {
    await this.initWsfe();
    const CbteTipo = 8;
    const ultimo = await this.ultimoAutorizado(this.ptoVta, CbteTipo);
    const fecha = this.getCurrentDate();
    const { importe_total, importe_gravado, importe_iva } =
      this.calculateImportes(monto);
    docNro = docNro || 0;
    const docTipo = docNro !== 0 ? 96 : 99;
    const factura = this.buildFactura(
      CbteTipo,
      docNro,
      ultimo,
      fecha,
      importe_total,
      importe_gravado,
      importe_iva,
      docTipo,
      { Tipo: 6, PtoVta: this.ptoVta, Nro: facturaNumero }
    );
    const response = await this.retryIfConnReset(
      () => this.wsfe.FECAESolicitar(factura),
      3,
      "FECAESolicitar (notaCreditoB)"
    );
    return {
      CAE: response.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0].CAE,
      vtoCAE:
        response.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0].CAEFchVto,
      numeroComprobante: ultimo + 1,
      docTipo,
    };
  }

  getCurrentDate() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
  }

  calculateImportes(monto) {
    const importe_total = parseFloat(monto).toFixed(2);
    const importe_gravado = (importe_total / 1.21).toFixed(2);
    const importe_iva = (importe_total - importe_gravado).toFixed(2);
    return { importe_total, importe_gravado, importe_iva };
  }

  buildFactura(
    CbteTipo,
    docNro,
    ultimoAutorizado,
    fecha,
    importe_total,
    importe_gravado,
    importe_iva,
    docTipo = 80,
    cbteAsoc = null
  ) {
    let condicion = null;
    // ============ Valores por defecto ============
    const Concepto = 1;
    let ImpTotal = importe_total;
    let ImpNeto = importe_gravado;
    let ImpOpEx = 0.0;
    let ImpIVA = importe_iva;
    let Iva = {
      AlicIva: [
        {
          Id: 5, // 21% de ejemplo
          BaseImp: importe_gravado,
          Importe: importe_iva,
        },
      ],
    };

    let CondicionIVAReceptorId = 5;

    // ============ Ajuste según condición ============
    if (condicion === "IVA EXENTO") {
      ImpTotal = importe_total;
      ImpNeto = 0.0;
      ImpOpEx = importe_total;
      ImpIVA = 0.0;
      Iva = null;
      CondicionIVAReceptorId = 4;
    }

    if (CbteTipo === 1) {
      CondicionIVAReceptorId = 1;
    }

    // ============ Detalle de la factura ============
    const detalle = {
      Concepto,
      DocTipo: docTipo,
      DocNro: docNro,
      CbteDesde: ultimoAutorizado + 1,
      CbteHasta: ultimoAutorizado + 1,
      CbteFch: parseInt(fecha.replace(/-/g, "")),
      ImpTotal,
      ImpTotConc: 0.0,
      ImpNeto,
      ImpOpEx,
      ImpTrib: 0.0,
      ImpIVA,
      MonId: "PES",
      MonCotiz: 1,
      CondicionIVAReceptorId,
      ...(Iva && { Iva }),
      ...(cbteAsoc && { CbtesAsoc: { CbteAsoc: [cbteAsoc] } }),
    };

    // ============ Retorno completo ============
    return {
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: this.ptoVta,
          CbteTipo,
        },
        FeDetReq: { FECAEDetRequest: detalle },
      },
    };
  }

  /*
  buildFactura(
    CbteTipo,
    docNro,
    ultimo,
    fecha,
    importe_total,
    importe_gravado,
    importe_iva,
    docTipo = 80,
    cbteAsoc = null
  ) {
    const body = {
      FeCAEReq: {
        FeCabReq: { CantReg: 1, PtoVta: this.ptoVta, CbteTipo },
        FeDetReq: {
          FECAEDetRequest: {
            Concepto: 1,
            DocTipo: docTipo,
            DocNro: docNro,
            CbteDesde: ultimo + 1,
            CbteHasta: ultimo + 1,
            CbteFch: parseInt(fecha.replace(/-/g, "")),
            ImpTotal: importe_total,
            ImpTotConc: 0.0,
            ImpNeto: importe_gravado,
            ImpOpEx: 0.0,
            ImpTrib: 0.0,
            ImpIVA: importe_iva,
            MonId: "PES",
            MonCotiz: 1,
            Iva: {
              AlicIva: [
                { Id: 5, BaseImp: importe_gravado, Importe: importe_iva },
              ],
            },
            ...(cbteAsoc && { CbtesAsoc: { CbteAsoc: [cbteAsoc] } }),
          },
        },
      },
    };
    return body;
  }
    */
}

module.exports = AfipService;
