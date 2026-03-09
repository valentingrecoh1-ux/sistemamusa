import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../main";
import { NumericFormat } from "react-number-format";
import DatalistInput from "react-datalist-input";
import moment from "moment-timezone";
import DatePicker from "react-datepicker";
import { es } from "date-fns/locale/es";
import Pagination from "../components/shared/Pagination";
import { dialog } from "../components/shared/dialog";

import { IP } from "../main";
import s from "./Caja.module.css";

function dataUriToBlobUrl(dataUri) {
  if (!dataUri || !dataUri.startsWith('data:')) return dataUri;
  try {
    const [header, b64] = dataUri.split(',');
    const mime = header.match(/data:(.*?);/)?.[1] || 'application/octet-stream';
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mime }));
  } catch { return dataUri; }
}

const ESTADO_LABELS = {
  approved: "Aprobado",
  pending: "Pendiente",
  in_process: "En proceso",
  rejected: "Rechazado",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
  charged_back: "Contracargo",
};

const MEDIO_PAGO_LABELS = {
  credit_card: "Tarjeta de crédito",
  debit_card: "Tarjeta de débito",
  bank_transfer: "Transferencia",
  account_money: "Dinero en cuenta",
  ticket: "Efectivo",
  atm: "ATM",
  digital_currency: "Moneda digital",
  digital_wallet: "Billetera digital",
};

const IMPUESTO_LABELS = {
  IVA: "IVA",
  IIBB: "Ingresos Brutos",
  "IVA CF": "IVA CF",
  "IVA RG": "IVA RG",
};

function Caja({ usuario }) {
  const isAdmin = usuario?.rol === "admin";
  const puedeBorrarOp = isAdmin || (usuario?.permisos || []).includes("borrar_operacion");
  const location = useLocation();
  const navegar = useNavigate();
  const hoyArgentina = () =>
    moment(new Date()).tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");

  // ── Tab state ──
  const [tab, setTab] = useState("operaciones");

  // ── Prefill from Eventos (gasto estimado) ──
  const [gastoEvento, setGastoEvento] = useState(null);

  // ── Operaciones state (existing) ──
  const [operacion, setOperacion] = useState({
    descripcion: "",
    monto: 0,
    nombre: "",
    formaPago: null,
    tipoOperacion: null,
    factura: null,
    eventoId: null,
  });
  const [nombres, setNombres] = useState([]);
  const [eventosSimple, setEventosSimple] = useState([]);
  const [totales, setTotales] = useState({});
  const [operaciones, setOperaciones] = useState([]);
  const [file, setFile] = useState(null);
  const [previewArchivo, setPreviewArchivo] = useState(null);
  const [otroDia, setOtroDia] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fecha, setFecha] = useState(hoyArgentina());
  const [search, setSearch] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const fileInputRef = useRef(null);

  // ── MercadoPago state ──
  const [mpPagos, setMpPagos] = useState([]);
  const [mpKpis, setMpKpis] = useState({ aprobado: 0, gastos: 0, pendiente: 0, cantidad: 0, ticketPromedio: 0, comisiones: 0, neto: 0, impuestos: 0 });
  const [mpPage, setMpPage] = useState(1);
  const [mpTotalPages, setMpTotalPages] = useState(1);
  const [mpFecha, setMpFecha] = useState(hoyArgentina());
  const [mpSearch, setMpSearch] = useState("");
  const [mpDetalle, setMpDetalle] = useState(null);
  const [mpLoading, setMpLoading] = useState(false);
  const [mpError, setMpError] = useState(null);
  const [mpLinkModal, setMpLinkModal] = useState(false);
  const [mpLinkTarget, setMpLinkTarget] = useState(null);
  const [ventasSinMp, setVentasSinMp] = useState([]);
  const [ventasSinMpCercanas, setVentasSinMpCercanas] = useState([]);
  const [ventasSinMpResto, setVentasSinMpResto] = useState([]);
  const [mpGastoModal, setMpGastoModal] = useState(false);
  const [mpGastoTarget, setMpGastoTarget] = useState(null);
  const [gastosSinMp, setGastosSinMp] = useState([]);
  const [gastosSinMpCercanos, setGastosSinMpCercanos] = useState([]);
  const [gastosSinMpResto, setGastosSinMpResto] = useState([]);

  // ── Prefill effect ──
  useEffect(() => {
    if (location.state?.prefill) {
      const pf = location.state.prefill;
      setOperacion((prev) => ({
        ...prev,
        descripcion: pf.descripcion || "",
        monto: pf.monto || 0,
        nombre: pf.nombre || "",
        tipoOperacion: pf.tipoOperacion || null,
        eventoId: pf.eventoId || null,
      }));
      if (location.state.gastoEvento) {
        setGastoEvento(location.state.gastoEvento);
      }
      setTab("operaciones");
      navegar(location.pathname, { replace: true, state: null });
    } else if (location.state?.tab) {
      setTab(location.state.tab);
      navegar(location.pathname, { replace: true, state: null });
    }
  }, []);

  // ── Operaciones fetchers ──
  const fetchTotales = () => socket.emit("request-totales", null);
  const fetchNombres = () => socket.emit("request-nombres");
  const fetchOperaciones = (_fecha, search, page, _fechaDesde, _fechaHasta, _filtroTipo) =>
    socket.emit("request-operaciones", {
      fecha: null,
      search,
      page,
      fechaDesde: _fechaDesde || undefined,
      fechaHasta: _fechaHasta || undefined,
      tipoOperacion: _filtroTipo || undefined,
    });

  // ── MercadoPago fetchers ──
  const fetchMpPagos = (fecha, page, search, silent) => {
    if (!silent) setMpLoading(true);
    setMpError(null);
    socket.emit("request-mp-pagos", { fecha, page, search });
  };

  // ── Operaciones handlers ──
  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handleDateChange = (date) => {
    setPage(1);
    if (!date) {
      setFecha(null);
      return;
    }
    setFecha(moment(date).format("YYYY-MM-DD"));
  };

  const shiftDate = (delta) => {
    setPage(1);
    setFecha((prev) =>
      moment(prev || hoyArgentina(), "YYYY-MM-DD")
        .add(delta, "day")
        .format("YYYY-MM-DD")
    );
  };

  const fechaSeleccionada = fecha
    ? moment(fecha, "YYYY-MM-DD").toDate()
    : null;

  // ── MercadoPago handlers ──
  const handleMpPageChange = (newPage) => {
    if (newPage > 0 && newPage <= mpTotalPages) {
      setMpPage(newPage);
    }
  };

  const handleMpDateChange = (date) => {
    setMpPage(1);
    if (!date) {
      setMpFecha(null);
      return;
    }
    setMpFecha(moment(date).format("YYYY-MM-DD"));
  };

  const shiftMpDate = (delta) => {
    setMpPage(1);
    setMpFecha((prev) =>
      moment(prev || hoyArgentina(), "YYYY-MM-DD")
        .add(delta, "day")
        .format("YYYY-MM-DD")
    );
  };

  const mpFechaSeleccionada = mpFecha
    ? moment(mpFecha, "YYYY-MM-DD").toDate()
    : null;

  // ── Operaciones effects ──
  useEffect(() => {
    socket.on("cambios", () => {
      fetchNombres();
      fetchTotales();
      fetchOperaciones(fecha, search, page, fechaDesde, fechaHasta, filtroTipo);
    });
    socket.on("response-totales", (data) => {
      if (data.status === "error") {
        console.error(data.message);
        return;
      }
      setTotales(data);
    });
    socket.on("response-nombres", (data) => {
      let arr = [];
      for (let i = 0; i < data.length; i++) {
        arr.push(data[i]);
        arr = [...new Set(arr)];
      }
      for (let i = 0; i < arr.length; i++) {
        arr[i] = {
          id: i,
          value: arr[i],
        };
      }
      setNombres(arr);
    });
    socket.on("response-operaciones", (data) => {
      setOperaciones(data.operaciones);
      setTotalPages(data.totalPages);
    });
    socket.on("response-eventos-simple", (data) => {
      setEventosSimple(data || []);
    });

    // ── MercadoPago listeners ──
    socket.on("response-mp-pagos", (data) => {
      setMpLoading(false);
      if (data.error) {
        setMpError(data.error);
        setMpPagos([]);
        setMpKpis({ aprobado: 0, pendiente: 0, cantidad: 0, ticketPromedio: 0, comisiones: 0, neto: 0, impuestos: 0 });
        setMpTotalPages(1);
        return;
      }
      setMpPagos(data.pagos || []);
      setMpKpis(data.kpis || { aprobado: 0, pendiente: 0, cantidad: 0, ticketPromedio: 0, comisiones: 0, neto: 0, impuestos: 0 });
      setMpTotalPages(data.totalPages || 1);
    });
    socket.on("response-mp-pago-detalle", (data) => {
      if (data.error) return;
      setMpDetalle(data);
    });
    socket.on("response-ventas-sin-mp", (data) => {
      setVentasSinMp(data?.ventas || []);
      setVentasSinMpCercanas(data?.ventasCercanas || []);
      setVentasSinMpResto(data?.ventasResto || []);
    });
    socket.on("response-gastos-sin-mp", (data) => {
      setGastosSinMp(data?.gastos || []);
      setGastosSinMpCercanos(data?.gastosCercanos || []);
      setGastosSinMpResto(data?.gastosResto || []);
    });

    fetchNombres();
    fetchTotales();
    fetchOperaciones(fecha, search, page, fechaDesde, fechaHasta, filtroTipo);
    socket.emit("request-eventos-simple");

    return () => {
      socket.off("cambios");
      socket.off("response-totales");
      socket.off("response-nombres");
      socket.off("response-operaciones");
      socket.off("response-eventos-simple");
      socket.off("response-mp-pagos");
      socket.off("response-mp-pago-detalle");
      socket.off("response-ventas-sin-mp");
      socket.off("response-gastos-sin-mp");
    };
  }, [fecha, search, page, fechaDesde, fechaHasta, filtroTipo]);

  // ── MercadoPago data fetch ──
  useEffect(() => {
    if (tab === "mercadopago") {
      fetchMpPagos(mpFecha, mpPage, mpSearch);
    }
  }, [tab, mpFecha, mpPage, mpSearch]);

  // ── Operaciones functions ──
  const handlePaymentButtonClick = (button) => {
    setOperacion((prev) => ({ ...prev, formaPago: button }));
  };

  const handleTransactionButtonClick = (button) => {
    setOperacion((prev) => ({ ...prev, tipoOperacion: button }));
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const enviar = async () => {
    if (!operacion.monto || operacion.monto === 0) {
      await dialog.alert("FALTA MONTO");
      return;
    }
    if (
      (operacion.tipoOperacion === "GASTO" ||
        operacion.tipoOperacion === "RETIRO") &&
      operacion.monto > 0
    ) {
      await dialog.alert("Para GASTO o RETIRO el monto debe ser negativo");
      return;
    }
    if (
      (operacion.tipoOperacion === "INGRESO" ||
        operacion.tipoOperacion === "APORTE") &&
      operacion.monto < 0
    ) {
      await dialog.alert("Para INGRESO o APORTE el monto debe ser positivo");
      return;
    }
    if (!operacion.formaPago) {
      await dialog.alert("FALTA FORMA DE PAGO");
      return;
    }
    if (!operacion.tipoOperacion) {
      await dialog.alert("FALTA TIPO DE OPERACION");
      return;
    }

    const formDataToSend = new FormData();
    for (const key in operacion) {
      if (operacion[key] !== null && operacion[key] !== undefined) {
        formDataToSend.append(key, operacion[key]);
      }
    }

    if (file) {
      formDataToSend.append("file", file);
    }

    try {
      const response = await fetch(`${IP()}/upload_operacion`, {
        method: "POST",
        body: formDataToSend,
      });
      const result = await response.json();
      if (result.status === "error") {
        await dialog.alert(result.message);
        return;
      }

      // Si viene de un gasto estimado de Eventos, marcarlo como realizado y vincular
      if (gastoEvento) {
        socket.emit("concretar-gasto-evento", {
          eventoId: gastoEvento.eventoId,
          gastoIndex: gastoEvento.gastoIndex,
          soloMarcar: true,
          operacionId: result.operacionId,
        });
        setGastoEvento(null);
      }

      setOperacion({
        descripcion: "",
        monto: 0,
        nombre: "",
        formaPago: null,
        tipoOperacion: null,
        eventoId: null,
      });
      setFile(null);
      setOtroDia(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error al enviar los datos:", error);
    }
  };

  const handleChangeFactura = (value) => {
    setOperacion((prev) => ({ ...prev, factura: value }));
  };

  const handleChangeNumber = (value) => {
    setOperacion((prev) => ({ ...prev, monto: value }));
  };

  const borrarFile = (id) => {
    if (id) {
      socket.emit("borrar-file-operacion", id);
    }
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const eliminarOperacion = async (id) => {
    if (!puedeBorrarOp) return;
    if (!await dialog.confirm("¿Eliminar esta operacion?")) return;
    socket.emit("borrar-operacion", id);
  };

  const editar = async (op) => {
    if (isAdmin) {
      setOtroDia(false);
      setOperacion(op);
      return;
    }
    try {
      const response = await fetch(
        "https://worldtimeapi.org/api/timezone/America/Argentina/Buenos_Aires"
      );
      if (!response.ok) {
        throw new Error("Fallo la API, usando la hora local");
      }
      const data = await response.json();
      const fechaArgentina = moment(data.datetime).format("YYYY-MM-DD");
      if (op.fecha !== fechaArgentina) {
        setOtroDia(true);
      }
      setOperacion(op);
    } catch (error) {
      const fechaLocal = moment(new Date())
        .tz("America/Argentina/Buenos_Aires")
        .format("YYYY-MM-DD");
      if (op.fecha !== fechaLocal) {
        setOtroDia(true);
      }
      setOperacion(op);
    }
  };

  // ── MercadoPago detail modal ──
  const abrirDetalleMp = (pago) => {
    setMpDetalle(pago);
  };

  const cerrarDetalleMp = () => {
    setMpDetalle(null);
  };

  const abrirLinkModal = (pago) => {
    setMpLinkTarget(pago);
    setMpLinkModal(true);
    let fechaPago = mpFecha;
    if (pago.fecha) {
      const d = new Date(pago.fecha);
      fechaPago = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    socket.emit("request-ventas-sin-mp", { fecha: fechaPago });
  };

  const cerrarLinkModal = () => {
    setMpLinkModal(false);
    setMpLinkTarget(null);
    setVentasSinMp([]);
    setVentasSinMpCercanas([]);
    setVentasSinMpResto([]);
  };

  const vincularPago = (ventaId, mpPaymentId) => {
    cerrarLinkModal();
    socket.emit("vincular-mp-pago", { ventaId, mpPaymentId }, () => {
      fetchMpPagos(mpFecha, mpPage, mpSearch, true);
    });
  };

  const desvincularPago = (ventaId, mpPaymentId) => {
    socket.emit("desvincular-mp-pago", { ventaId, mpPaymentId }, () => {
      fetchMpPagos(mpFecha, mpPage, mpSearch, true);
    });
  };

  const money = (n) =>
    "$" + (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const abrirGastoModal = (pago) => {
    setMpGastoTarget(pago);
    setMpGastoModal(true);
    const fechaPago = pago.fechaStr || mpFecha;
    socket.emit("request-gastos-sin-mp", { fecha: fechaPago });
  };

  const cerrarGastoModal = () => {
    setMpGastoModal(false);
    setMpGastoTarget(null);
    setGastosSinMp([]);
    setGastosSinMpCercanos([]);
    setGastosSinMpResto([]);
  };

  const vincularGasto = (operacionId, mpPagoId) => {
    cerrarGastoModal();
    socket.emit("vincular-mp-gasto", { operacionId, mpPagoId }, () => {
      fetchMpPagos(mpFecha, mpPage, mpSearch, true);
    });
  };

  const crearGastoDesdeMp = (pago) => {
    cerrarGastoModal();
    setTab("operaciones");
    setOperacion({
      nombre: pago.descripcion || "",
      descripcion: `Pago MP #${pago.id}`,
      monto: -(Math.abs(pago.monto || 0)),
      tipoOperacion: "GASTO",
      formaPago: "DIGITAL",
      fecha: pago.fechaStr || fecha,
      mpPagoId: pago.id,
    });
  };

  const sinVincular = mpPagos.filter(
    (p) => p.estado === "approved" && p.tipoMovimiento === "cobro" && !p.ventaVinculada
  ).length;

  // ── Render ──
  return (
    <div>
      {/* Tabs */}
      <div className={s.tabs}>
        <button
          className={`${s.tab} ${tab === "operaciones" ? s.tabActive : ""}`}
          onClick={() => setTab("operaciones")}
        >
          Operaciones
        </button>
        <button
          className={`${s.tab} ${tab === "mercadopago" ? s.tabActive : ""}`}
          onClick={() => setTab("mercadopago")}
        >
          MercadoPago
        </button>
      </div>

      {tab === "operaciones" && (
        <div className={s.container}>
          <div className={s.formCard}>
            <NumericFormat
              className={s.montoInput}
              placeholder="MONTO"
              prefix="$"
              value={operacion.monto}
              thousandSeparator="."
              decimalSeparator=","
              onValueChange={(e) => handleChangeNumber(e.floatValue)}
              disabled={otroDia}
            />
            <div className={s.btnRow}>
              <button
                onClick={() => handlePaymentButtonClick("EFECTIVO")}
                className={operacion.formaPago === "EFECTIVO" ? s.active : ""}
                disabled={otroDia}
              >
                EFECTIVO
              </button>
              <button
                onClick={() => handlePaymentButtonClick("DIGITAL")}
                className={operacion.formaPago === "DIGITAL" ? s.active : ""}
                disabled={otroDia}
              >
                DIGITAL
              </button>
            </div>
            <textarea
              className={s.textarea}
              value={operacion.descripcion}
              placeholder="DESCRIPCION"
              onChange={(e) =>
                setOperacion((prev) => ({ ...prev, descripcion: e.target.value }))
              }
              disabled={otroDia}
            ></textarea>
            <div className={s.btnRow}>
              <button
                onClick={() => handleTransactionButtonClick("APORTE")}
                className={
                  operacion.tipoOperacion === "APORTE" ? s.active : ""
                }
                disabled={otroDia}
              >
                APORTE
              </button>
              <button
                onClick={() => handleTransactionButtonClick("RETIRO")}
                className={
                  operacion.tipoOperacion === "RETIRO" ? s.active : ""
                }
                disabled={otroDia}
              >
                RETIRO
              </button>
              <button
                onClick={() => handleTransactionButtonClick("GASTO")}
                className={
                  operacion.tipoOperacion === "GASTO" ? s.active : ""
                }
                disabled={otroDia}
              >
                GASTO
              </button>
              <button
                onClick={() => handleTransactionButtonClick("INGRESO")}
                className={
                  operacion.tipoOperacion === "INGRESO" ? s.active : ""
                }
                disabled={otroDia}
              >
                INGRESO
              </button>
            </div>
            <div>
              <button
                onClick={() => handleTransactionButtonClick("CIERRE DE CAJA")}
                className={`${s.cierreBtn} ${
                  operacion.tipoOperacion === "CIERRE DE CAJA" ? s.cierreActive : ""
                }`}
                disabled={otroDia}
              >
                CIERRE DE CAJA
              </button>
            </div>
            <DatalistInput
              placeholder="NOMBRE"
              value={operacion.nombre}
              inputProps={{
                value: operacion.nombre,
                onChange: (e) =>
                  setOperacion((prev) => ({ ...prev, nombre: e.target.value })),
                disabled: otroDia,
              }}
              onSelect={(e) =>
                setOperacion((prev) => ({ ...prev, nombre: e.value }))
              }
              items={nombres}
            />
            <div className={s.fileRow}>
              <div
                className={s.fileInputWrap}
                onClick={() => fileInputRef.current?.click()}
              >
                <i className="bi bi-cloud-arrow-up"></i>
                <span>
                  {file ? file.name : "Adjuntar comprobante..."}
                </span>
              </div>
              <input ref={fileInputRef} type="file" onChange={handleFileChange} className={s.fileInputHidden} />
              <button className={s.deleteFileBtn} onClick={() => borrarFile(operacion._id)} title="Borrar comprobante">
                <i className="bi bi-trash3"></i>
              </button>
            </div>
            <div className={s.btnRow}>
              <button
                className={operacion.factura === "A" ? s.active : ""}
                onClick={() => {
                  if (operacion.factura === "A") {
                    handleChangeFactura(null);
                  } else {
                    handleChangeFactura("A");
                  }
                }}
              >
                A
              </button>
              <button
                className={operacion.factura === "C" ? s.active : ""}
                onClick={() => {
                  if (operacion.factura === "C") {
                    handleChangeFactura(null);
                  } else {
                    handleChangeFactura("C");
                  }
                }}
              >
                C
              </button>
            </div>
            {(operacion.tipoOperacion === "GASTO" || operacion.tipoOperacion === "INGRESO") && eventosSimple.length > 0 && (
              <div className={s.degustacionSelect}>
                <select
                  value={operacion.eventoId || ""}
                  onChange={(e) => setOperacion((prev) => ({ ...prev, eventoId: e.target.value || null }))}
                  disabled={otroDia}
                >
                  <option value="">Sin vincular a evento</option>
                  {eventosSimple.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.nombre} ({d.fecha ? `${d.fecha.split("-")[2]}/${d.fecha.split("-")[1]}` : "sin fecha"})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className={s.submitBtn} onClick={() => enviar()}>ENVIAR</button>
          </div>
          <div className={s.tableSection}>
            <div className={s.totalesWrapper}>
              <table className={s.totalesTable}>
                <thead>
                  <tr>
                    <th>TOTAL EFECTIVO</th>
                    <th>TOTAL DIGITAL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <NumericFormat
                        prefix="$"
                        displayType="text"
                        value={parseFloat(totales.efectivo).toFixed(2)}
                        thousandSeparator="."
                        decimalSeparator=","
                      />
                    </td>
                    <td>
                      <NumericFormat
                        prefix="$"
                        displayType="text"
                        value={parseFloat(totales.digital).toFixed(2)}
                        thousandSeparator="."
                        decimalSeparator=","
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={s.filterBar}>
              <div className={s.filterGroup}>
                <label>Desde</label>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }}
                  className={s.filterDate}
                />
              </div>
              <div className={s.filterGroup}>
                <label>Hasta</label>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }}
                  className={s.filterDate}
                />
              </div>
              <div className={s.filterGroup}>
                <label>Tipo</label>
                <select
                  value={filtroTipo}
                  onChange={(e) => { setFiltroTipo(e.target.value); setPage(1); }}
                  className={s.filterSelect}
                >
                  <option value="">Todos</option>
                  <option value="APORTE">Aporte</option>
                  <option value="RETIRO">Retiro</option>
                  <option value="GASTO">Gasto</option>
                  <option value="INGRESO">Ingreso</option>
                  <option value="CIERRE DE CAJA">Cierre de Caja</option>
                </select>
              </div>
              <div className={s.filterGroup}>
                <label>Buscar</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Nombre, descripcion..."
                  className={s.filterSearch}
                />
              </div>
              {(fechaDesde || fechaHasta || filtroTipo || search) && (
                <button
                  className={s.filterClear}
                  onClick={() => { setFechaDesde(""); setFechaHasta(""); setFiltroTipo(""); setSearch(""); setPage(1); }}
                  title="Limpiar filtros"
                >
                  <i className="bi bi-x-lg" />
                </button>
              )}
              <Pagination
                className={s.paginationDock}
                page={page}
                totalPages={totalPages}
                onChange={handlePageChange}
              />
            </div>
            <div className={s.tableWrapper}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th></th>
                    <th>FECHA</th>
                    <th>NOMBRE</th>
                    <th>TIPO OPERACION</th>
                    <th>FORMA DE PAGO</th>
                    <th>FACTURA</th>
                    <th>MONTO</th>
                    <th>DESCRIPCION</th>
                    <th></th>
                    {puedeBorrarOp && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {operaciones?.map((operacion, index) => (
                    <tr
                      className={s.clickableRow}
                      onClick={() => {
                        if (operacion.filePath) setPreviewArchivo(operacion.filePath);
                      }}
                      key={index}
                    >
                      <td
                        onClick={(e) => {
                          e.stopPropagation();
                          editar(operacion);
                        }}
                        className={s.editCell}
                      >
                        <i className="bi bi-pencil-square"></i>
                      </td>
                      <td>
                        {new Date(operacion.createdAt).toLocaleString("es-AR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </td>
                      <td>{operacion.nombre}</td>
                      <td>{operacion.tipoOperacion}</td>
                      <td>{operacion.formaPago}</td>
                      <td>
                        {operacion.factura && operacion.factura !== "null"
                          ? operacion.factura
                          : ""}
                      </td>
                      <td className={operacion.monto < 0 ? s.negative : ""}>
                        <NumericFormat
                          prefix="$"
                          displayType="text"
                          value={operacion.monto}
                          thousandSeparator="."
                          decimalSeparator=","
                        />
                      </td>
                      <td>{operacion.descripcion}</td>
                      <td>
                        {operacion.filePath ? (
                          (operacion.filePath.includes("pdf") || operacion.filePath.includes("application/pdf")) ? (
                            <i className={`bi bi-filetype-pdf ${s.fileIcon}`}></i>
                          ) : (
                            <i className={`bi bi-file-earmark-image ${s.fileIcon}`}></i>
                          )
                        ) : null}
                      </td>
                      {puedeBorrarOp && (
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            eliminarOperacion(operacion._id);
                          }}
                          className={s.deleteCell}
                        >
                          <i className="bi bi-trash3"></i>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "mercadopago" && (
        <div className={s.mpContainer}>
          {/* KPIs - principales */}
          <div className={s.mpKpiMainRow}>
            <div className={s.mpKpiCard}>
              <span className={s.mpKpiLabel}>Cobrado</span>
              <span className={`${s.mpKpiValue} ${s.mpKpiAprobado}`}>
                <NumericFormat
                  prefix="$"
                  displayType="text"
                  value={mpKpis.aprobado.toFixed(2)}
                  thousandSeparator="."
                  decimalSeparator=","
                />
              </span>
            </div>
            <div className={s.mpKpiCard}>
              <span className={s.mpKpiLabel}>Neto recibido</span>
              <span className={`${s.mpKpiValue} ${s.mpKpiNeto}`}>
                <NumericFormat
                  prefix="$"
                  displayType="text"
                  value={mpKpis.neto.toFixed(2)}
                  thousandSeparator="."
                  decimalSeparator=","
                />
              </span>
            </div>
            <div className={s.mpKpiCard}>
              <span className={s.mpKpiLabel}>Comisiones y Retenciones</span>
              <span className={`${s.mpKpiValue} ${s.mpKpiComision}`}>
                <NumericFormat
                  prefix="-$"
                  displayType="text"
                  value={(mpKpis.comisiones + mpKpis.impuestos).toFixed(2)}
                  thousandSeparator="."
                  decimalSeparator=","
                />
              </span>
            </div>
          </div>

          {/* KPIs - detalle */}
          <div className={s.mpKpiMainRow}>
            <div className={s.mpKpiCard}>
              <span className={s.mpKpiLabel}>Pagos procesados</span>
              <span className={s.mpKpiValue}>{mpKpis.cantidad}</span>
            </div>
            <div className={s.mpKpiCard}>
              <span className={s.mpKpiLabel}>Gastos MP</span>
              <span className={`${s.mpKpiValue} ${s.mpKpiComision}`}>
                <NumericFormat
                  prefix="-$"
                  displayType="text"
                  value={(mpKpis.gastos || 0).toFixed(2)}
                  thousandSeparator="."
                  decimalSeparator=","
                />
              </span>
            </div>
            <div className={s.mpKpiSplitCell}>
              <div className={s.mpKpiCardHalf}>
                <span className={s.mpKpiLabel}>Comisiones</span>
                <span className={`${s.mpKpiValue} ${s.mpKpiComision}`}>
                  <NumericFormat
                    prefix="-$"
                    displayType="text"
                    value={mpKpis.comisiones.toFixed(2)}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </span>
              </div>
              <div className={s.mpKpiCardHalf}>
                <span className={s.mpKpiLabel}>Retenciones</span>
                <span className={`${s.mpKpiValue} ${s.mpKpiComision}`}>
                  <NumericFormat
                    prefix="-$"
                    displayType="text"
                    value={mpKpis.impuestos.toFixed(2)}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </span>
              </div>
            </div>
          </div>

          {/* KPIs - extra */}
          <div className={s.mpKpiMainRow}>
            <div className={s.mpKpiCard}>
              <span className={s.mpKpiLabel}>Pendiente</span>
              <span className={`${s.mpKpiValue} ${s.mpKpiPendiente}`}>
                <NumericFormat
                  prefix="$"
                  displayType="text"
                  value={mpKpis.pendiente.toFixed(2)}
                  thousandSeparator="."
                  decimalSeparator=","
                />
              </span>
            </div>
            <div className={s.mpKpiCard}>
              <span className={s.mpKpiLabel}>Ticket promedio</span>
              <span className={s.mpKpiValue}>
                <NumericFormat
                  prefix="$"
                  displayType="text"
                  value={mpKpis.ticketPromedio.toFixed(2)}
                  thousandSeparator="."
                  decimalSeparator=","
                />
              </span>
            </div>
            <div className={s.mpKpiCard}>
              <span className={s.mpKpiLabel}>Sin vincular</span>
              <span className={`${s.mpKpiValue} ${sinVincular > 0 ? s.mpKpiPendiente : ""}`}>
                {sinVincular}
              </span>
            </div>
          </div>

          {/* Toolbar */}
          <div className={s.toolbar}>
            <input
              type="text"
              value={mpSearch}
              placeholder="Buscar referencia..."
              onChange={(e) => { setMpPage(1); setMpSearch(e.target.value); }}
            />
            <div className={s.dateNav}>
              <button
                type="button"
                className={`${s.dateShiftBtn} ${s.dateShiftPrev}`}
                onClick={() => shiftMpDate(-1)}
                aria-label="Dia anterior"
              >
                <i className="bi bi-chevron-left"></i>
              </button>
              <DatePicker
                className={s.dateInput}
                wrapperClassName={s.datePickerWrap}
                popperClassName={s.datePopper}
                selected={mpFechaSeleccionada}
                locale={es}
                dateFormat="dd/MM/yyyy"
                placeholderText="Todas las fechas"
                isClearable
                clearButtonTitle="Quitar fecha"
                onChange={handleMpDateChange}
                popperPlacement="bottom-start"
                showPopperArrow={false}
                popperProps={{ strategy: "fixed", placement: "bottom-start" }}
              />
              <button
                type="button"
                className={`${s.dateShiftBtn} ${s.dateShiftNext}`}
                onClick={() => shiftMpDate(1)}
                aria-label="Dia siguiente"
              >
                <i className="bi bi-chevron-right"></i>
              </button>
            </div>
            <Pagination
              className={s.paginationDock}
              page={mpPage}
              totalPages={mpTotalPages}
              onChange={handleMpPageChange}
            />
          </div>

          {/* Error message */}
          {mpError && (
            <div className={s.mpError}>
              <i className="bi bi-exclamation-triangle"></i> {mpError}
            </div>
          )}

          {/* Loading */}
          {mpLoading && <div className={s.mpLoading}>Cargando pagos...</div>}

          {/* Table */}
          {!mpLoading && (
            <div className={s.tableWrapper}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>FECHA</th>
                    <th>DESCRIPCION</th>
                    <th>MEDIO DE PAGO</th>
                    <th>ESTADO</th>
                    <th>BRUTO</th>
                    <th>COMISION</th>
                    <th>RETENCIONES</th>
                    <th>NETO</th>
                    <th>TIPO</th>
                    <th>VINCULADO</th>
                  </tr>
                </thead>
                <tbody>
                  {mpPagos.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                        No hay pagos para esta fecha
                      </td>
                    </tr>
                  )}
                  {mpPagos.map((pago) => (
                    <tr
                      key={pago.id}
                      className={s.clickableRow}
                      onClick={() => abrirDetalleMp(pago)}
                    >
                      <td>
                        {new Date(pago.fecha).toLocaleString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </td>
                      <td>{pago.descripcion}</td>
                      <td>{MEDIO_PAGO_LABELS[pago.medioPago] || pago.medioPago}</td>
                      <td>
                        <span className={`${s.mpBadge} ${s[`mpBadge_${pago.estado}`] || ""}`}>
                          {ESTADO_LABELS[pago.estado] || pago.estado}
                        </span>
                      </td>
                      <td>
                        <NumericFormat
                          prefix="$"
                          displayType="text"
                          value={pago.monto}
                          thousandSeparator="."
                          decimalSeparator=","
                        />
                      </td>
                      <td className={s.mpComisionCell}>
                        {pago.tipoMovimiento === "gasto" ? "-" : pago.comisionMp > 0 ? (
                          <NumericFormat
                            prefix="-$"
                            displayType="text"
                            value={pago.comisionMp}
                            thousandSeparator="."
                            decimalSeparator=","
                          />
                        ) : "-"}
                      </td>
                      <td className={s.mpComisionCell}>
                        {pago.tipoMovimiento === "gasto" ? "-" : pago.retenciones > 0 ? (
                          <NumericFormat
                            prefix="-$"
                            displayType="text"
                            value={pago.retenciones}
                            thousandSeparator="."
                            decimalSeparator=","
                          />
                        ) : "-"}
                      </td>
                      <td className={s.mpNetoCell}>
                        {pago.tipoMovimiento === "gasto" ? "-" : pago.netoRecibido != null ? (
                          <NumericFormat
                            prefix="$"
                            displayType="text"
                            value={pago.netoRecibido}
                            thousandSeparator="."
                            decimalSeparator=","
                          />
                        ) : "-"}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span
                          className={`${s.mpTipoPill} ${pago.tipoMovimiento === "gasto" ? s.mpTipoPillGasto : s.mpTipoPillCobro} ${s.mpTipoPillClick}`}
                          title="Click para cambiar cobro/gasto"
                          onClick={() => {
                            socket.emit("toggle-tipo-mp", { mpPagoId: pago.id }, (res) => {
                              if (res?.ok) {
                                setMpPagos(prev => prev.map(p => p.id === pago.id ? {
                                  ...p,
                                  tipoMovimiento: res.tipoMovimiento,
                                  comisionMp: res.tipoMovimiento === "gasto" ? 0 : p.comisionMp,
                                  retenciones: res.tipoMovimiento === "gasto" ? 0 : p.retenciones,
                                } : p));
                              }
                            });
                          }}
                        >
                          {pago.tipoMovimiento === "gasto" ? "Gasto" : "Cobro"}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {pago.tipoMovimiento === "cobro" ? (
                          pago.ventaVinculada ? (
                            <span className={s.mpLinkBadge}>
                              <i className="bi bi-link-45deg"></i>{" "}
                              {pago.ventaVinculada.stringNumeroFactura || `#${pago.ventaVinculada.numeroVenta}`}
                            </span>
                          ) : pago.estado === "approved" ? (
                            <button className={s.mpLinkBtn} onClick={() => abrirLinkModal(pago)}>
                              Vincular
                            </button>
                          ) : (
                            <span className={s.mpNoLink}>—</span>
                          )
                        ) : (
                          pago.operacionVinculada ? (
                            <span className={s.mpLinkBadge}>
                              <i className="bi bi-link-45deg"></i>{" "}
                              {pago.operacionVinculada.nombre || pago.operacionVinculada.descripcion || "Gasto"}
                            </span>
                          ) : pago.estado === "approved" ? (
                            <button className={s.mpLinkBtn} onClick={() => abrirGastoModal(pago)}>
                              Vincular
                            </button>
                          ) : (
                            <span className={s.mpNoLink}>—</span>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detail modal */}
          {mpDetalle && (
            <div className={s.mpOverlay} onClick={cerrarDetalleMp}>
              <div className={s.mpModal} onClick={(e) => e.stopPropagation()}>
                <div className={s.mpModalHeader}>
                  <h3>Detalle del pago</h3>
                  <button className={s.mpModalClose} onClick={cerrarDetalleMp}>
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
                <div className={s.mpModalBody}>
                  <div className={s.mpDetailRow}>
                    <span className={s.mpDetailLabel}>ID</span>
                    <span>{mpDetalle.id}</span>
                  </div>
                  <div className={s.mpDetailRow}>
                    <span className={s.mpDetailLabel}>Estado</span>
                    <span className={`${s.mpBadge} ${s[`mpBadge_${mpDetalle.estado}`] || ""}`}>
                      {ESTADO_LABELS[mpDetalle.estado] || mpDetalle.estado}
                    </span>
                  </div>
                  {mpDetalle.estadoDetalle && (
                    <div className={s.mpDetailRow}>
                      <span className={s.mpDetailLabel}>Detalle estado</span>
                      <span>{mpDetalle.estadoDetalle}</span>
                    </div>
                  )}
                  <div className={s.mpDetailRow}>
                    <span className={s.mpDetailLabel}>{mpDetalle.tipoMovimiento === "gasto" ? "Monto" : "Monto bruto"}</span>
                    <span className={s.mpDetailMonto} style={mpDetalle.tipoMovimiento === "gasto" ? { color: "var(--danger)" } : undefined}>
                      <NumericFormat
                        prefix="$"
                        displayType="text"
                        value={mpDetalle.monto}
                        thousandSeparator="."
                        decimalSeparator=","
                      />
                    </span>
                  </div>

                  {/* Desglose de cargos (solo para cobros) */}
                  {mpDetalle.tipoMovimiento !== "gasto" && mpDetalle.feeDetails && mpDetalle.feeDetails.length > 0 && (
                    <div className={s.mpDetailSection}>
                      <span className={s.mpDetailSectionTitle}>Cargos y comisiones</span>
                      {mpDetalle.feeDetails.map((fee, i) => (
                        <div className={s.mpDetailRow} key={i}>
                          <span className={s.mpDetailLabel}>
                            {fee.tipo === "mercadopago_fee" ? "Comision MP" :
                             fee.tipo === "financing_fee" ? "Costo financiamiento" :
                             fee.tipo === "shipping_fee" ? "Costo envio" :
                             fee.tipo === "application_fee" ? "Comision aplicacion" :
                             fee.tipo === "discount_fee" ? "Descuento" :
                             fee.tipo || "Cargo"}
                          </span>
                          <span className={s.mpDetailComision}>
                            <NumericFormat
                              prefix="-$"
                              displayType="text"
                              value={fee.monto}
                              thousandSeparator="."
                              decimalSeparator=","
                            />
                          </span>
                        </div>
                      ))}
                      {mpDetalle.impuestosDetalle && mpDetalle.impuestosDetalle.length > 0 ? (
                        mpDetalle.impuestosDetalle.map((tax, i) => (
                          <div className={s.mpDetailRow} key={`tax-${i}`}>
                            <span className={s.mpDetailLabel}>
                              {IMPUESTO_LABELS[tax.tipo] || tax.tipo || "Impuesto"}
                            </span>
                            <span className={s.mpDetailComision}>
                              <NumericFormat
                                prefix="-$"
                                displayType="text"
                                value={tax.valor}
                                thousandSeparator="."
                                decimalSeparator=","
                              />
                            </span>
                          </div>
                        ))
                      ) : mpDetalle.impuestos > 0 ? (
                        <div className={s.mpDetailRow}>
                          <span className={s.mpDetailLabel}>Impuestos</span>
                          <span className={s.mpDetailComision}>
                            <NumericFormat
                              prefix="-$"
                              displayType="text"
                              value={mpDetalle.impuestos}
                              thousandSeparator="."
                              decimalSeparator=","
                            />
                          </span>
                        </div>
                      ) : null}
                      {mpDetalle.costoEnvio > 0 && (
                        <div className={s.mpDetailRow}>
                          <span className={s.mpDetailLabel}>Envio</span>
                          <span className={s.mpDetailComision}>
                            <NumericFormat
                              prefix="$"
                              displayType="text"
                              value={mpDetalle.costoEnvio}
                              thousandSeparator="."
                              decimalSeparator=","
                            />
                          </span>
                        </div>
                      )}
                      {mpDetalle.netoRecibido != null && (
                        <div className={`${s.mpDetailRow} ${s.mpDetailNetoRow}`}>
                          <span className={s.mpDetailLabel}>Neto recibido</span>
                          <span className={s.mpDetailNeto}>
                            <NumericFormat
                              prefix="$"
                              displayType="text"
                              value={mpDetalle.netoRecibido}
                              thousandSeparator="."
                              decimalSeparator=","
                            />
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={s.mpDetailRow}>
                    <span className={s.mpDetailLabel}>Medio de pago</span>
                    <span>{MEDIO_PAGO_LABELS[mpDetalle.medioPago] || mpDetalle.medioPago}</span>
                  </div>
                  {mpDetalle.medioPagoDetalle && (
                    <div className={s.mpDetailRow}>
                      <span className={s.mpDetailLabel}>Metodo</span>
                      <span>{mpDetalle.medioPagoDetalle}</span>
                    </div>
                  )}
                  {mpDetalle.cuotas > 1 && (
                    <div className={s.mpDetailRow}>
                      <span className={s.mpDetailLabel}>Cuotas</span>
                      <span>{mpDetalle.cuotas}</span>
                    </div>
                  )}
                  {mpDetalle.tarjeta && (
                    <>
                      {mpDetalle.tarjeta.ultimos4 && (
                        <div className={s.mpDetailRow}>
                          <span className={s.mpDetailLabel}>Tarjeta</span>
                          <span>**** **** **** {mpDetalle.tarjeta.ultimos4}</span>
                        </div>
                      )}
                      {mpDetalle.tarjeta.titular && (
                        <div className={s.mpDetailRow}>
                          <span className={s.mpDetailLabel}>Titular</span>
                          <span>{mpDetalle.tarjeta.titular}</span>
                        </div>
                      )}
                    </>
                  )}
                  {mpDetalle.pagador && (
                    <>
                      {mpDetalle.pagador.nombre && (
                        <div className={s.mpDetailRow}>
                          <span className={s.mpDetailLabel}>Pagador</span>
                          <span>{mpDetalle.pagador.nombre}</span>
                        </div>
                      )}
                      {mpDetalle.pagador.email && (
                        <div className={s.mpDetailRow}>
                          <span className={s.mpDetailLabel}>Email</span>
                          <span>{mpDetalle.pagador.email}</span>
                        </div>
                      )}
                      {mpDetalle.pagador.identificacion && (
                        <div className={s.mpDetailRow}>
                          <span className={s.mpDetailLabel}>Identificacion</span>
                          <span>{mpDetalle.pagador.identificacion}</span>
                        </div>
                      )}
                    </>
                  )}
                  {mpDetalle.referenciaExterna && (
                    <div className={s.mpDetailRow}>
                      <span className={s.mpDetailLabel}>Ref. externa</span>
                      <span>{mpDetalle.referenciaExterna}</span>
                    </div>
                  )}
                  <div className={s.mpDetailRow}>
                    <span className={s.mpDetailLabel}>Fecha creacion</span>
                    <span>
                      {new Date(mpDetalle.fecha).toLocaleString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </span>
                  </div>
                  {mpDetalle.fechaAprobacion && (
                    <div className={s.mpDetailRow}>
                      <span className={s.mpDetailLabel}>Fecha aprobacion</span>
                      <span>
                        {new Date(mpDetalle.fechaAprobacion).toLocaleString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })}
                      </span>
                    </div>
                  )}
                  <div className={s.mpDetailRow}>
                    <span className={s.mpDetailLabel}>Descripcion</span>
                    <span>{mpDetalle.descripcion}</span>
                  </div>

                  {/* Tipo de movimiento */}
                  <div className={`${s.mpDetailRow} ${s.mpDetailVentaRow}`}>
                    <span className={s.mpDetailLabel}>Tipo</span>
                    <span className={`${s.mpTipoPill} ${mpDetalle.tipoMovimiento === "gasto" ? s.mpTipoPillGasto : s.mpTipoPillCobro}`}>
                      {mpDetalle.tipoMovimiento === "gasto" ? "Gasto" : "Cobro"}
                    </span>
                  </div>

                  {/* Vinculación */}
                  {mpDetalle.tipoMovimiento === "cobro" ? (
                    <div className={s.mpDetailRow}>
                      <span className={s.mpDetailLabel}>Venta vinculada</span>
                      {mpDetalle.ventaVinculada ? (
                        <span className={s.mpLinkInfo}>
                          <span className={s.mpLinkBadge}>
                            <i className="bi bi-link-45deg"></i>{" "}
                            {mpDetalle.ventaVinculada.stringNumeroFactura || `#${mpDetalle.ventaVinculada.numeroVenta}`}
                          </span>
                          <button
                            className={s.mpUnlinkBtn}
                            onClick={() => {
                              desvincularPago(mpDetalle.ventaVinculada._id, mpDetalle.id);
                              cerrarDetalleMp();
                            }}
                          >
                            <i className="bi bi-x-circle"></i>
                          </button>
                        </span>
                      ) : mpDetalle.estado === "approved" ? (
                        <button
                          className={s.mpLinkBtn}
                          onClick={() => {
                            cerrarDetalleMp();
                            abrirLinkModal(mpDetalle);
                          }}
                        >
                          Vincular
                        </button>
                      ) : (
                        <span className={s.mpNoLink}>—</span>
                      )}
                    </div>
                  ) : (
                    <div className={s.mpDetailRow}>
                      <span className={s.mpDetailLabel}>Gasto vinculado</span>
                      {mpDetalle.operacionVinculada ? (
                        <span className={s.mpLinkInfo}>
                          <span className={s.mpLinkBadge}>
                            <i className="bi bi-link-45deg"></i>{" "}
                            {mpDetalle.operacionVinculada.nombre || mpDetalle.operacionVinculada.descripcion || "Gasto"}
                          </span>
                          <button
                            className={s.mpUnlinkBtn}
                            onClick={() => {
                              socket.emit("desvincular-mp-gasto", { operacionId: mpDetalle.operacionVinculada._id }, () => {
                                fetchMpPagos(mpFecha, mpPage, mpSearch, true);
                              });
                              cerrarDetalleMp();
                            }}
                          >
                            <i className="bi bi-x-circle"></i>
                          </button>
                        </span>
                      ) : mpDetalle.estado === "approved" ? (
                        <button
                          className={s.mpLinkBtn}
                          onClick={() => {
                            cerrarDetalleMp();
                            abrirGastoModal(mpDetalle);
                          }}
                        >
                          Vincular
                        </button>
                      ) : (
                        <span className={s.mpNoLink}>—</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Nota sobre limitaciones */}
          <div className={s.mpNota}>
            <i className="bi bi-info-circle"></i>
            Solo se muestran pagos procesados por MercadoPago. Las transferencias bancarias salientes, débitos automáticos externos y movimientos fuera de MP no aparecen acá.
          </div>

          {/* Linking modal (cobros → ventas) */}
          {mpLinkModal && mpLinkTarget && (
            <div className={s.mpOverlay} onClick={cerrarLinkModal}>
              <div className={s.mpModal} onClick={(e) => e.stopPropagation()}>
                <div className={s.mpModalHeader}>
                  <h3>Vincular pago con venta</h3>
                  <button className={s.mpModalClose} onClick={cerrarLinkModal}>
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
                <div className={s.mpModalBody}>
                  <div className={s.mpLinkPaymentInfo}>
                    <span>Pago MP #{mpLinkTarget.id}{mpLinkTarget.fecha && <span className={s.mpLinkItemHora}>{new Date(mpLinkTarget.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })} {new Date(mpLinkTarget.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}</span>
                    <span className={s.mpDetailMonto}>{money(mpLinkTarget.monto)}</span>
                  </div>
                  {ventasSinMp.length === 0 && ventasSinMpCercanas.length === 0 && ventasSinMpResto.length === 0 ? (
                    <div className={s.mpLinkEmpty}>
                      No hay ventas digitales sin vincular
                    </div>
                  ) : (
                    <div className={s.mpLinkList}>
                      {ventasSinMp.length > 0 && (
                        <>
                          <div className={s.mpLinkSeparator}>Mismo día</div>
                          {ventasSinMp.map((v) => (
                            <div key={v._id} className={`${s.mpLinkItem} ${v.monto === mpLinkTarget.monto ? s.mpLinkItemMatch : ""}`} onClick={() => vincularPago(v._id, mpLinkTarget.id)}>
                              <div className={s.mpLinkItemInfo}>
                                <span>
                                  {v.stringNumeroFactura || `Venta #${v.numeroVenta}`}
                                  {v.createdAt && <span className={s.mpLinkItemHora}>{new Date(v.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })} {new Date(v.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}
                                </span>
                                <span className={s.mpLinkItemSub}>{v.nombreTurno || v.formaPago}</span>
                              </div>
                              <span className={s.mpLinkItemMonto}>{money(v.monto)}</span>
                            </div>
                          ))}
                        </>
                      )}
                      {ventasSinMpCercanas.length > 0 && (
                        <>
                          <div className={s.mpLinkSeparator}>Día anterior / siguiente</div>
                          {ventasSinMpCercanas.map((v) => (
                            <div key={v._id} className={`${s.mpLinkItem} ${v.monto === mpLinkTarget.monto ? s.mpLinkItemMatch : ""}`} onClick={() => vincularPago(v._id, mpLinkTarget.id)}>
                              <div className={s.mpLinkItemInfo}>
                                <span>
                                  {v.stringNumeroFactura || `Venta #${v.numeroVenta}`}
                                  {v.createdAt && <span className={s.mpLinkItemHora}>{new Date(v.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })} {new Date(v.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}
                                </span>
                                <span className={s.mpLinkItemSub}>{v.nombreTurno || v.formaPago}</span>
                              </div>
                              <span className={s.mpLinkItemMonto}>{money(v.monto)}</span>
                            </div>
                          ))}
                        </>
                      )}
                      {ventasSinMpResto.length > 0 && (
                        <>
                          <div className={s.mpLinkSeparator}>Otros días</div>
                          {ventasSinMpResto.map((v) => (
                            <div key={v._id} className={`${s.mpLinkItem} ${v.monto === mpLinkTarget.monto ? s.mpLinkItemMatch : ""}`} onClick={() => vincularPago(v._id, mpLinkTarget.id)}>
                              <div className={s.mpLinkItemInfo}>
                                <span>
                                  {v.stringNumeroFactura || `Venta #${v.numeroVenta}`}
                                  {v.createdAt && <span className={s.mpLinkItemHora}>{new Date(v.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })} {new Date(v.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}
                                </span>
                                <span className={s.mpLinkItemSub}>{v.nombreTurno || v.formaPago}</span>
                              </div>
                              <span className={s.mpLinkItemMonto}>{money(v.monto)}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Gasto linking modal (gastos → operaciones) */}
          {mpGastoModal && mpGastoTarget && (
            <div className={s.mpOverlay} onClick={cerrarGastoModal}>
              <div className={s.mpModal} onClick={(e) => e.stopPropagation()}>
                <div className={s.mpModalHeader}>
                  <h3>Vincular gasto MP con operación</h3>
                  <button className={s.mpModalClose} onClick={cerrarGastoModal}>
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
                <div className={s.mpModalBody}>
                  <div className={s.mpLinkPaymentInfo}>
                    <span>Gasto MP #{mpGastoTarget.id}{mpGastoTarget.fecha && <span className={s.mpLinkItemHora}>{new Date(mpGastoTarget.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })} {new Date(mpGastoTarget.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}</span>
                    <span className={s.mpDetailMonto} style={{ color: "var(--danger)" }}>{money(mpGastoTarget.monto)}</span>
                  </div>
                  {mpGastoTarget.descripcion && (
                    <div className={s.mpGastoDesc}>{mpGastoTarget.descripcion}</div>
                  )}
                  {gastosSinMp.length === 0 && gastosSinMpCercanos.length === 0 && gastosSinMpResto.length === 0 ? (
                    <div className={s.mpLinkEmpty}>
                      No hay gastos sin vincular
                      <button className={s.mpCrearGastoBtn} onClick={() => crearGastoDesdeMp(mpGastoTarget)}>
                        <i className="bi bi-plus-circle"></i> Crear gasto en Caja
                      </button>
                    </div>
                  ) : (
                    <div className={s.mpLinkList}>
                      {gastosSinMp.length > 0 && (
                        <>
                          <div className={s.mpLinkSeparator}>Mismo día</div>
                          {gastosSinMp.map((g) => (
                            <div key={g._id} className={`${s.mpLinkItem} ${Math.abs(g.monto) === Math.abs(mpGastoTarget.monto) ? s.mpLinkItemMatch : ""}`} onClick={() => vincularGasto(g._id, mpGastoTarget.id)}>
                              <div className={s.mpLinkItemInfo}>
                                <span>
                                  {g.nombre || g.descripcion || "Gasto"}
                                  {g.createdAt && <span className={s.mpLinkItemHora}>{new Date(g.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })} {new Date(g.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}
                                </span>
                                {g.descripcion && g.nombre && <span className={s.mpLinkItemSub}>{g.descripcion}</span>}
                              </div>
                              <span className={s.mpLinkItemMonto}>{money(g.monto)}</span>
                            </div>
                          ))}
                        </>
                      )}
                      {gastosSinMpCercanos.length > 0 && (
                        <>
                          <div className={s.mpLinkSeparator}>Día anterior / siguiente</div>
                          {gastosSinMpCercanos.map((g) => (
                            <div key={g._id} className={`${s.mpLinkItem} ${Math.abs(g.monto) === Math.abs(mpGastoTarget.monto) ? s.mpLinkItemMatch : ""}`} onClick={() => vincularGasto(g._id, mpGastoTarget.id)}>
                              <div className={s.mpLinkItemInfo}>
                                <span>
                                  {g.nombre || g.descripcion || "Gasto"}
                                  {g.createdAt && <span className={s.mpLinkItemHora}>{new Date(g.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })} {new Date(g.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}
                                </span>
                                {g.descripcion && g.nombre && <span className={s.mpLinkItemSub}>{g.descripcion}</span>}
                              </div>
                              <span className={s.mpLinkItemMonto}>{money(g.monto)}</span>
                            </div>
                          ))}
                        </>
                      )}
                      {gastosSinMpResto.length > 0 && (
                        <>
                          <div className={s.mpLinkSeparator}>Otros días</div>
                          {gastosSinMpResto.map((g) => (
                            <div key={g._id} className={`${s.mpLinkItem} ${Math.abs(g.monto) === Math.abs(mpGastoTarget.monto) ? s.mpLinkItemMatch : ""}`} onClick={() => vincularGasto(g._id, mpGastoTarget.id)}>
                              <div className={s.mpLinkItemInfo}>
                                <span>
                                  {g.nombre || g.descripcion || "Gasto"}
                                  {g.createdAt && <span className={s.mpLinkItemHora}>{new Date(g.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" })} {new Date(g.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}
                                </span>
                                {g.descripcion && g.nombre && <span className={s.mpLinkItemSub}>{g.descripcion}</span>}
                              </div>
                              <span className={s.mpLinkItemMonto}>{money(g.monto)}</span>
                            </div>
                          ))}
                        </>
                      )}
                      <div className={s.mpLinkSeparator}></div>
                      <button className={s.mpCrearGastoBtn} onClick={() => crearGastoDesdeMp(mpGastoTarget)}>
                        <i className="bi bi-plus-circle"></i> Crear gasto nuevo en Caja
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Modal preview comprobante */}
      {previewArchivo && (
        <PreviewModal archivo={previewArchivo} onClose={() => setPreviewArchivo(null)} />
      )}
    </div>
  );
}

function PreviewModal({ archivo, onClose }) {
  const blobUrl = useMemo(() => dataUriToBlobUrl(archivo), [archivo]);
  const isImage = archivo?.match(/^data:image\//);

  useEffect(() => {
    return () => { if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={s.previewOverlay} onClick={onClose}>
      <div className={s.previewModal} onClick={(e) => e.stopPropagation()}>
        <button className={s.previewClose} onClick={onClose}>
          <i className="bi bi-x-lg" />
        </button>
        {isImage
          ? <img src={archivo} alt="Preview" className={s.previewImg} />
          : <iframe src={blobUrl} className={s.previewFrame} title="Preview" />
        }
      </div>
    </div>
  );
}

export default Caja;
