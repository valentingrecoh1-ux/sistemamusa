import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DatePicker, { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale/es";
import { NumericFormat } from "react-number-format";
import { toPng } from "html-to-image";
import { socket } from "../main";
import { tienePermiso } from "../lib/permisos";
import Pagination from "../components/shared/Pagination";
import { dialog } from "../components/shared/dialog";
import s from "./Eventos.module.css";

import "react-datepicker/dist/react-datepicker.css";

registerLocale("es", es);

const money = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(n || 0);

const ESTADOS = ["todos", "proximo", "en_curso", "finalizado", "cancelado"];
const ESTADO_LABEL = { todos: "Todos", proximo: "Próximo", en_curso: "En curso", finalizado: "Finalizado", cancelado: "Cancelado" };
const ESTADO_ICON = { proximo: "bi-clock", en_curso: "bi-play-circle", finalizado: "bi-check-circle", cancelado: "bi-x-circle" };

function Eventos({ usuario }) {
  const navigate = useNavigate();
  const emptyForm = {
    fecha: null,
    nombre: "",
    descripcion: "",
    capacidadMaxima: "",
    precioPorPersona: "",
    estado: "proximo",
    vinosUsados: [],
    observaciones: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [eventos, setEventos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [editingId, setEditingId] = useState(null);

  // Vino search (form)
  const [vinoBusqueda, setVinoBusqueda] = useState("");
  const [vinoResultados, setVinoResultados] = useState([]);

  // Vino search (modal)
  const [modalVinoBusqueda, setModalVinoBusqueda] = useState("");
  const [modalVinoResultados, setModalVinoResultados] = useState([]);
  const vinoSearchSource = useRef("form");

  // Detail modal
  const [showDetail, setShowDetail] = useState(false);
  const [detailData, setDetailData] = useState(null);

  // Add reserva mini form
  const [newReserva, setNewReserva] = useState({
    nombre: "",
    cantidad: "",
    telefono: "",
    total: 0,
    turno: "PRIMER TURNO",
  });

  // Cobrar modal
  const [showCobrar, setShowCobrar] = useState(false);
  const [cobrarTarget, setCobrarTarget] = useState(null);
  const [cobrarData, setCobrarData] = useState({
    cobrado: 0,
    formaDeCobro: "EFECTIVO",
    facturado: false,
  });

  // Gastos estimados
  const [newGasto, setNewGasto] = useState({ descripcion: "", monto: "" });
  const [editingGastoIdx, setEditingGastoIdx] = useState(null);
  const [editGastoData, setEditGastoData] = useState({ descripcion: "", monto: 0 });
  const [infoOpenIdx, setInfoOpenIdx] = useState(null);
  const [infoPagoEdit, setInfoPagoEdit] = useState("");

  // Feedback
  const [feedbacks, setFeedbacks] = useState([]);
  const [orgFeedback, setOrgFeedback] = useState({ puntaje: 0, notasInternas: "" });

  // Vincular gasto modal
  const [showVincularModal, setShowVincularModal] = useState(false);
  const [vincularGastoIdx, setVincularGastoIdx] = useState(null);
  const [vincularSearch, setVincularSearch] = useState("");
  const [vincularGastos, setVincularGastos] = useState([]);
  const [vincularLoading, setVincularLoading] = useState(false);

  // Stats
  const [totalPersonas, setTotalPersonas] = useState(0);
  const [totalIngreso, setTotalIngreso] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);

  // Presupuesto modal
  const presModalRef = useRef(null);
  const [showPresupuesto, setShowPresupuesto] = useState(false);
  const emptyPres = {
    nombre: "",
    cantPersonas: "",
    costoComidaXPersona: "",
    costoEmpleado: "",
    costoSommelier: "",
    costoMarketing: "",
    otrosGastos: "",
    ganancia: "30",
  };
  const [presForm, setPresForm] = useState(emptyPres);
  const [presVinos, setPresVinos] = useState([]);
  const [presVinoBusqueda, setPresVinoBusqueda] = useState("");
  const [presVinoResultados, setPresVinoResultados] = useState([]);

  // Ref for stale closure fix
  const fetchRef = useRef();

  // ── Calc helpers ──
  const calcCostoVinos = (vinos) =>
    (vinos || []).reduce((sum, v) => sum + (parseFloat(v.precioVenta) || 0), 0);

  const calcIngreso = (ev) => (ev.ingresoReservas || 0) + (ev.totalIngresosCaja || 0);
  const calcGastos = (ev) => calcCostoVinos(ev.vinosUsados) + (ev.totalGastosCaja || 0);
  const calcGastosEstimados = (ev) =>
    calcGastos(ev) + ((ev.gastosEstimados || []).filter((g) => !g.realizado).reduce((sum, g) => sum + (g.monto || 0), 0));
  const calcProfit = (ev) => calcIngreso(ev) - calcGastos(ev);
  const calcProfitEstimado = (ev) => (ev.totalReservas || calcIngreso(ev)) - calcGastosEstimados(ev);

  const capacityPct = (ev) => {
    if (!ev.capacidadMaxima || ev.capacidadMaxima <= 0) return 0;
    return Math.min(((ev.cantidadPersonas || 0) / ev.capacidadMaxima) * 100, 100);
  };

  const capacityClass = (ev) => {
    const pct = capacityPct(ev);
    if (pct >= 100) return "Full";
    if (pct >= 75) return "Warn";
    return "Ok";
  };

  // ── Emit helper for updating evento from modal ──
  const emitGuardarEvento = (updates) => {
    if (!detailData) return;
    socket.emit("guardar-evento", {
      _id: detailData._id,
      fecha: detailData.fecha ? new Date(`${detailData.fecha}T00:00:00-03:00`) : null,
      nombre: detailData.nombre,
      descripcion: detailData.descripcion,
      capacidadMaxima: detailData.capacidadMaxima,
      precioPorPersona: detailData.precioPorPersona,
      estado: detailData.estado,
      vinosUsados: detailData.vinosUsados,
      gastosEstimados: detailData.gastosEstimados,
      observaciones: detailData.observaciones,
      ...updates,
    });
  };

  // ── Handlers ──
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "capacidadMaxima" || name === "precioPorPersona") {
      setForm((prev) => ({ ...prev, [name]: value.replace(/[^0-9]/g, "") }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFecha = (date) => setForm((prev) => ({ ...prev, fecha: date }));

  const buscarVino = (val) => {
    setVinoBusqueda(val);
    if (val.length >= 2) {
      vinoSearchSource.current = "form";
      socket.emit("buscar-producto-evento", val);
    } else {
      setVinoResultados([]);
    }
  };

  const agregarVino = (prod) => {
    if (form.vinosUsados.some((v) => v.codigo === prod.codigo)) return;
    setForm((prev) => ({
      ...prev,
      vinosUsados: [
        ...prev.vinosUsados,
        {
          productoId: prod._id,
          codigo: prod.codigo,
          nombre: prod.nombre,
          bodega: prod.bodega,
          cepa: prod.cepa,
          precioVenta: parseFloat(prod.venta) || 0,
        },
      ],
    }));
  };

  const quitarVino = (idx) => {
    setForm((prev) => ({
      ...prev,
      vinosUsados: prev.vinosUsados.filter((_, i) => i !== idx),
    }));
  };

  // ── Modal vino search ──
  const buscarVinoModal = (val) => {
    setModalVinoBusqueda(val);
    if (val.length >= 2) {
      vinoSearchSource.current = "modal";
      socket.emit("buscar-producto-evento", val);
    } else {
      setModalVinoResultados([]);
    }
  };

  const agregarVinoModal = (prod) => {
    if (!detailData) return;
    const vinosActuales = detailData.vinosUsados || [];
    if (vinosActuales.some((v) => v.codigo === prod.codigo)) return;
    const nuevosVinos = [
      ...vinosActuales,
      {
        productoId: prod._id,
        codigo: prod.codigo,
        nombre: prod.nombre,
        bodega: prod.bodega,
        cepa: prod.cepa,
        precioVenta: parseFloat(prod.venta) || 0,
      },
    ];
    emitGuardarEvento({ vinosUsados: nuevosVinos });
  };

  const quitarVinoModal = (idx) => {
    if (!detailData) return;
    const nuevosVinos = (detailData.vinosUsados || []).filter((_, i) => i !== idx);
    emitGuardarEvento({ vinosUsados: nuevosVinos });
  };

  // ── Presupuesto ──
  const buscarVinoPresupuesto = (val) => {
    setPresVinoBusqueda(val);
    if (val.length >= 2) {
      vinoSearchSource.current = "presupuesto";
      socket.emit("buscar-producto-evento", val);
    } else {
      setPresVinoResultados([]);
    }
  };

  const agregarVinoPresupuesto = (prod) => {
    if (presVinos.some((v) => v.codigo === prod.codigo)) return;
    setPresVinos((prev) => [
      ...prev,
      {
        productoId: prod._id,
        codigo: prod.codigo,
        nombre: prod.nombre,
        bodega: prod.bodega,
        cepa: prod.cepa,
        precioVenta: parseFloat(prod.venta) || 0,
        cantidad: 1,
      },
    ]);
    setPresVinoBusqueda("");
    setPresVinoResultados([]);
  };

  const quitarVinoPresupuesto = (idx) =>
    setPresVinos((prev) => prev.filter((_, i) => i !== idx));

  const updateCantVinoPresupuesto = (idx, cant) =>
    setPresVinos((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, cantidad: Math.max(1, parseInt(cant) || 1) } : v))
    );

  const calcPresupuesto = () => {
    const personas = parseInt(presForm.cantPersonas) || 0;
    const comida = personas * (parseFloat(presForm.costoComidaXPersona) || 0);
    const empleados = parseFloat(presForm.costoEmpleado) || 0;
    const vinos = presVinos.reduce((sum, v) => sum + v.precioVenta * (v.cantidad || 1), 0);
    const sommelier = parseFloat(presForm.costoSommelier) || 0;
    const marketing = parseFloat(presForm.costoMarketing) || 0;
    const otros = parseFloat(presForm.otrosGastos) || 0;
    const base = comida + empleados + vinos + sommelier + marketing + otros;
    const gananciaAmt = base * ((parseFloat(presForm.ganancia) || 0) / 100);
    const neto = base + gananciaAmt;
    const conFactura = neto * 1.25;
    const efectivo = neto;
    return { comida, empleados, vinos, sommelier, marketing, otros, base, gananciaAmt, neto, conFactura, efectivo };
  };

  const descargarPresupuesto = async () => {
    const el = presModalRef.current;
    if (!el) return;
    try {
      // Quitar overflow para captura completa
      const saved = [];
      [el, ...el.querySelectorAll('*')].forEach((node) => {
        const cs = getComputedStyle(node);
        if (cs.overflow !== 'visible' || cs.maxHeight !== 'none') {
          saved.push({ node, mh: node.style.maxHeight, ov: node.style.overflow, ovy: node.style.overflowY });
          node.style.maxHeight = 'none';
          node.style.overflow = 'visible';
          node.style.overflowY = 'visible';
        }
      });

      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        filter: (node) => !(node instanceof HTMLElement && node.hasAttribute('data-html2canvas-ignore')),
      });

      // Restaurar
      saved.forEach(({ node, mh, ov, ovy }) => {
        node.style.maxHeight = mh;
        node.style.overflow = ov;
        node.style.overflowY = ovy;
      });

      const link = document.createElement('a');
      link.download = `presupuesto${presForm.nombre ? '-' + presForm.nombre.replace(/\s+/g, '-') : ''}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error al descargar presupuesto:', err);
    }
  };

  // ── Gastos estimados ──
  const agregarGasto = () => {
    if (!newGasto.descripcion || !newGasto.monto) return;
    const gastosActuales = detailData.gastosEstimados || [];
    const nuevosGastos = [
      ...gastosActuales,
      { descripcion: newGasto.descripcion, monto: parseFloat(newGasto.monto) || 0, realizado: false },
    ];
    emitGuardarEvento({ gastosEstimados: nuevosGastos });
    setNewGasto({ descripcion: "", monto: "" });
  };

  const startEditGasto = (idx) => {
    const g = detailData.gastosEstimados[idx];
    setEditingGastoIdx(idx);
    setEditGastoData({ descripcion: g.descripcion, monto: g.monto });
  };

  const saveEditGasto = () => {
    const gastosActuales = [...(detailData.gastosEstimados || [])];
    gastosActuales[editingGastoIdx] = {
      ...gastosActuales[editingGastoIdx],
      descripcion: editGastoData.descripcion,
      monto: parseFloat(editGastoData.monto) || 0,
    };
    emitGuardarEvento({ gastosEstimados: gastosActuales });
    setEditingGastoIdx(null);
  };

  const eliminarGasto = (idx) => {
    const gastosActuales = (detailData.gastosEstimados || []).filter((_, i) => i !== idx);
    emitGuardarEvento({ gastosEstimados: gastosActuales });
  };

  const concretarGasto = (idx) => {
    setVincularGastoIdx(idx);
    setShowVincularModal(true);
    setVincularSearch("");
    setVincularGastos([]);
  };

  const concretarGastoNuevo = () => {
    const idx = vincularGastoIdx;
    const gasto = detailData.gastosEstimados[idx];
    setShowVincularModal(false);
    navigate("/caja", {
      state: {
        prefill: {
          descripcion: gasto.descripcion,
          monto: -(Math.abs(gasto.monto)),
          nombre: detailData.nombre,
          tipoOperacion: "GASTO",
          eventoId: detailData._id,
        },
        gastoEvento: { eventoId: detailData._id, gastoIndex: idx },
      },
    });
  };

  const buscarGastosParaVincular = (search) => {
    setVincularSearch(search);
    setVincularLoading(true);
    socket.emit("buscar-gastos-para-vincular", { search }, (res) => {
      setVincularGastos(res?.gastos || []);
      setVincularLoading(false);
    });
  };

  const vincularGastoExistente = (operacionId) => {
    socket.emit("vincular-gasto-evento", {
      eventoId: detailData._id,
      gastoIndex: vincularGastoIdx,
      operacionId,
    }, (res) => {
      if (res?.error) {
        dialog.alert("Error: " + res.error);
      }
      setShowVincularModal(false);
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    socket.emit("guardar-evento", form);
    setForm(emptyForm);
    setEditingId(null);
  };

  const cancelarEdicion = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const editar = (ev, e) => {
    e.stopPropagation();
    const fecha = ev.fecha ? new Date(`${ev.fecha}T00:00:00-03:00`) : null;
    setForm({
      _id: ev._id,
      fecha,
      nombre: ev.nombre,
      descripcion: ev.descripcion || "",
      capacidadMaxima: ev.capacidadMaxima || "",
      precioPorPersona: ev.precioPorPersona || "",
      estado: ev.estado || "proximo",
      vinosUsados: ev.vinosUsados || [],
      observaciones: ev.observaciones || "",
    });
    setEditingId(ev._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminar = async (ev, e) => {
    e.stopPropagation();
    if (await dialog.confirm(`Eliminar el evento "${ev.nombre}"?`)) {
      socket.emit("borrar-evento", ev._id);
    }
  };

  const cambiarEstado = (ev, nuevoEstado, e) => {
    if (e) e.stopPropagation();
    socket.emit("cambiar-estado-evento", ev._id, nuevoEstado);
  };

  // ── Detail modal ──
  const verDetalle = (ev) => {
    setDetailData(ev);
    setShowDetail(true);
    setNewReserva({ nombre: "", cantidad: "", telefono: "", total: 0, turno: "PRIMER TURNO" });
    setNewGasto({ descripcion: "", monto: "" });
    setEditingGastoIdx(null);
    setModalVinoBusqueda("");
    setModalVinoResultados([]);
    socket.emit("request-feedback-evento", ev._id);
  };

  const cerrarDetalle = () => {
    setShowDetail(false);
    setDetailData(null);
  };

  // ── Reserva mini-form ──
  const handleNewReservaChange = (e) => {
    const { name, value } = e.target;
    if (name === "cantidad" || name === "telefono") {
      const cleanVal = value.replace(/[^0-9]/g, "");
      if (name === "cantidad" && detailData?.precioPorPersona) {
        const total = (parseInt(cleanVal) || 0) * detailData.precioPorPersona;
        setNewReserva((prev) => ({ ...prev, cantidad: cleanVal, total }));
      } else {
        setNewReserva((prev) => ({ ...prev, [name]: cleanVal }));
      }
    } else {
      setNewReserva((prev) => ({ ...prev, [name]: value }));
    }
  };

  const agregarReserva = () => {
    if (!newReserva.nombre) return;
    const turnoPayload = {
      fecha: detailData.fecha ? new Date(`${detailData.fecha}T00:00:00-03:00`) : null,
      turno: newReserva.turno,
      nombre: newReserva.nombre,
      cantidad: newReserva.cantidad,
      telefono: newReserva.telefono,
      total: newReserva.total,
      observaciones: "",
      eventoId: detailData._id,
    };
    socket.emit("guardar-turno", turnoPayload);
    setNewReserva({ nombre: "", cantidad: "", telefono: "", total: 0, turno: "PRIMER TURNO" });
  };

  const borrarReserva = async (turnoId) => {
    if (await dialog.confirm("¿Eliminar esta reserva?")) {
      socket.emit("borrar-turno", turnoId);
    }
  };

  // ── Cobrar ──
  const abrirCobrar = (reserva) => {
    setCobrarTarget(reserva);
    setCobrarData({ cobrado: 0, formaDeCobro: "EFECTIVO", facturado: false });
    setShowCobrar(true);
  };

  const ejecutarCobro = () => {
    socket.emit("cobrar-turno", cobrarTarget._id, cobrarData);
    setShowCobrar(false);
    setCobrarTarget(null);
  };

  // ── Format ──
  const formatFecha = (fecha) => {
    if (!fecha) return "";
    const parts = fecha.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return fecha;
  };

  const profitBadge = (ev) => {
    const p = calcProfit(ev);
    if (p > 0)
      return (
        <span className={`${s.profitBadge} ${s.profitPositive}`}>
          +<NumericFormat prefix="$" displayType="text" value={p} thousandSeparator="." decimalSeparator="," />
        </span>
      );
    if (p < 0)
      return (
        <span className={`${s.profitBadge} ${s.profitNegative}`}>
          <NumericFormat prefix="-$" displayType="text" value={Math.abs(p)} thousandSeparator="." decimalSeparator="," />
        </span>
      );
    return <span className={`${s.profitBadge} ${s.profitZero}`}>$0</span>;
  };

  const pagoBadge = (r) => {
    if (r.cobrado && r.cobrado >= r.total && r.total > 0)
      return <span className={`${s.pagoBadge} ${s.pagoPagado}`}>Pagado</span>;
    if (r.cobrado > 0)
      return <span className={`${s.pagoBadge} ${s.pagoParcial}`}>Parcial</span>;
    if (r.total > 0)
      return <span className={`${s.pagoBadge} ${s.pagoPendiente}`}>Pendiente</span>;
    return null;
  };

  // ── Fetch ──
  const fetchEventos = () => {
    socket.emit("request-eventos", search, page, filtroEstado);
  };

  fetchRef.current = fetchEventos;

  useEffect(() => {
    const cambiosHandler = () => fetchRef.current();

    socket.on("cambios", cambiosHandler);
    socket.on("response-eventos", (data) => {
      setEventos(data.eventos);
      setTotalPages(data.totalPages);
      const personas = data.eventos.reduce((sum, ev) => sum + (ev.cantidadPersonas || 0), 0);
      const ingreso = data.eventos.reduce((sum, ev) => sum + calcIngreso(ev), 0);
      const profit = data.eventos.reduce((sum, ev) => sum + calcProfit(ev), 0);
      setTotalPersonas(personas);
      setTotalIngreso(ingreso);
      setTotalProfit(profit);

      // refresh detail modal if open
      if (showDetail && detailData) {
        const updated = data.eventos.find((ev) => ev._id === detailData._id);
        if (updated) setDetailData(updated);
      }
    });
    socket.on("response-buscar-producto-evento", (productos) => {
      if (vinoSearchSource.current === "modal") {
        setModalVinoResultados(productos);
      } else if (vinoSearchSource.current === "presupuesto") {
        setPresVinoResultados(productos);
      } else {
        setVinoResultados(productos);
      }
    });
    socket.on("response-feedback-evento", (data) => {
      const clientFbs = data.filter((f) => f.tipo === "cliente");
      const orgFb = data.find((f) => f.tipo === "organizador");
      setFeedbacks(clientFbs);
      setOrgFeedback(orgFb ? { puntaje: orgFb.puntaje, notasInternas: orgFb.notasInternas || "" } : { puntaje: 0, notasInternas: "" });
    });

    fetchEventos();

    return () => {
      socket.off("cambios", cambiosHandler);
      socket.off("response-eventos");
      socket.off("response-buscar-producto-evento");
      socket.off("response-feedback-evento");
    };
  }, [page, search, filtroEstado]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.select();
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) setPage(newPage);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className={s.container}>
      {/* ═══ Form card ═══ */}
      <div className={s.formCard}>
        <div className={s.formHeader}>
          <i className={`bi ${editingId ? "bi-pencil-square" : "bi-calendar-event"}`}></i>
          <span>{editingId ? "Editar evento" : "Nuevo evento"}</span>
          {editingId && (
            <button className={s.cancelEditBtn} onClick={cancelarEdicion} title="Cancelar edición">
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className={s.form}>
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label>Fecha</label>
              <DatePicker
                placeholderText="DD-MM-YYYY"
                dateFormat="dd-MM-yyyy"
                selected={form.fecha}
                onChange={handleFecha}
                className={s.dateInput}
                locale="es"
                calendarStartDay={1}
              />
            </div>
            <div className={s.formGroup}>
              <label>Nombre del evento</label>
              <input type="text" name="nombre" value={form.nombre} onChange={handleChange} autoComplete="off" />
            </div>
            <div className={s.formGroup}>
              <label>Capacidad máxima</label>
              <input type="text" name="capacidadMaxima" value={form.capacidadMaxima} onChange={handleChange} autoComplete="off" placeholder="ej: 20" />
            </div>
            <div className={s.formGroup}>
              <label>Precio por persona</label>
              <input type="text" name="precioPorPersona" value={form.precioPorPersona} onChange={handleChange} autoComplete="off" placeholder="ej: 5000" />
            </div>
          </div>
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label>Estado</label>
              <select name="estado" value={form.estado} onChange={handleChange}>
                <option value="proximo">Próximo</option>
                <option value="en_curso">En curso</option>
                <option value="finalizado">Finalizado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className={s.formGroup}>
              <label>Descripción</label>
              <input type="text" name="descripcion" value={form.descripcion} onChange={handleChange} autoComplete="off" />
            </div>
            <div className={s.formGroup}>
              <label>Observaciones</label>
              <input type="text" name="observaciones" value={form.observaciones} onChange={handleChange} autoComplete="off" />
            </div>
            <div className={s.formGroupBtn}>
              <button className={s.saveBtn} type="submit">
                <i className={`bi ${editingId ? "bi-check-lg" : "bi-plus-lg"}`}></i>
                {editingId ? "Guardar cambios" : "Crear evento"}
              </button>
            </div>
          </div>

          {/* Vinos usados */}
          <div className={s.subSection}>
            <div className={s.subSectionHeader}>
              <i className="bi bi-droplet"></i> Vinos usados (abiertos) — se descuentan del stock
            </div>
            <div className={s.vinoSearchWrap}>
              <i className={`bi bi-search ${s.vinoSearchIcon}`}></i>
              <input
                className={s.vinoSearchInput}
                type="text"
                placeholder="Buscar vino por nombre, código o bodega..."
                value={vinoBusqueda}
                onChange={(e) => buscarVino(e.target.value)}
              />
              {vinoResultados.length > 0 && (
                <div className={s.vinoDropdown}>
                  {vinoResultados.map((prod) => {
                    const yaAgregado = form.vinosUsados.some((v) => v.codigo === prod.codigo);
                    return (
                      <div
                        key={prod._id}
                        className={`${s.vinoDropdownItem} ${yaAgregado ? s.vinoDropdownItemAdded : ""}`}
                        onClick={() => agregarVino(prod)}
                      >
                        <span className={s.vinoDropdownName}>
                          {yaAgregado && <i className="bi bi-check-lg"></i>} {prod.nombre}
                        </span>
                        <span className={s.vinoDropdownDetail}>{prod.bodega} — {prod.cepa}</span>
                        <span className={s.vinoDropdownCode}>
                          <i className="bi bi-upc-scan"></i> {prod.codigo}
                        </span>
                        <span className={s.vinoDropdownPrice}>
                          <NumericFormat prefix="$" displayType="text" value={prod.venta} thousandSeparator="." decimalSeparator="," />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {form.vinosUsados.length > 0 && (
              <div className={s.chipList}>
                {form.vinosUsados.map((v, i) => (
                  <div key={i} className={s.chip}>
                    <span className={s.chipName}>{v.nombre}</span>
                    <span className={s.chipDetail}>{v.bodega} — <i className="bi bi-upc-scan"></i> {v.codigo}</span>
                    <span className={s.chipPrice}>
                      <NumericFormat prefix="$" displayType="text" value={v.precioVenta} thousandSeparator="." decimalSeparator="," />
                    </span>
                    <button className={s.chipRemove} onClick={() => quitarVino(i)} type="button">
                      <i className="bi bi-x"></i>
                    </button>
                  </div>
                ))}
                <div className={s.chipTotal}>
                  Costo vinos:{" "}
                  <NumericFormat prefix="$" displayType="text" value={calcCostoVinos(form.vinosUsados)} thousandSeparator="." decimalSeparator="," />
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* ═══ Stats bar ═══ */}
      <div className={s.statsBar}>
        <div className={s.statItem}>
          <i className="bi bi-calendar-event"></i>
          <span className={s.statValue}>{eventos.length}</span>
          <span className={s.statLabel}>eventos</span>
        </div>
        <div className={s.statItem}>
          <i className="bi bi-people"></i>
          <span className={s.statValue}>{totalPersonas}</span>
          <span className={s.statLabel}>personas</span>
        </div>
        <div className={s.statItem}>
          <i className="bi bi-cash-stack"></i>
          <span className={s.statValue}>
            <NumericFormat prefix="$" displayType="text" value={totalIngreso} thousandSeparator="." decimalSeparator="," />
          </span>
          <span className={s.statLabel}>ingreso</span>
        </div>
        <div className={s.statItem}>
          <i className={`bi ${totalProfit >= 0 ? "bi-graph-up-arrow" : "bi-graph-down-arrow"}`}></i>
          <span className={`${s.statValue} ${totalProfit >= 0 ? s.statPositive : s.statNegative}`}>
            <NumericFormat prefix="$" displayType="text" value={Math.abs(totalProfit)} thousandSeparator="." decimalSeparator="," />
          </span>
          <span className={s.statLabel}>{totalProfit >= 0 ? "ganancia" : "pérdida"}</span>
        </div>
      </div>

      {/* ═══ Search + filters ═══ */}
      <div className={s.searchBar}>
        <div className={s.filterGroup}>
          {ESTADOS.map((est) => (
            <button
              key={est}
              className={`${s.filterBtn} ${filtroEstado === est ? s.filterActive : ""}`}
              onClick={() => { setFiltroEstado(est); setPage(1); }}
            >
              {est !== "todos" && <i className={`bi ${ESTADO_ICON[est]}`}></i>}
              {ESTADO_LABEL[est]}
            </button>
          ))}
        </div>
        <div className={s.searchWrap}>
          <i className={`bi bi-search ${s.searchIcon}`}></i>
          <input
            className={s.searchInput}
            type="text"
            placeholder="Buscar por nombre, fecha o descripción..."
            value={search}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button className={s.presupuestoBtn} onClick={() => setShowPresupuesto(true)}>
          <i className="bi bi-calculator"></i>
          Presupuestar evento
        </button>
        <Pagination className={s.paginationDock} page={page} totalPages={totalPages} onChange={handlePageChange} />
      </div>

      {/* ═══ Table ═══ */}
      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Evento</th>
              <th>Capacidad</th>
              <th>Cobrado <span className={s.subHeaderHint}>cobrado / total</span></th>
              <th>Costo <span className={s.subHeaderHint}>real / estimado</span></th>
              <th>Resultado <span className={s.subHeaderHint}>real / estimado</span></th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {eventos?.map((ev) => (
              <tr key={ev._id} className={s.clickableRow} onClick={() => verDetalle(ev)}>
                <td>
                  <span className={s.fechaBadge}>
                    <i className="bi bi-calendar3"></i>
                    {formatFecha(ev.fecha)}
                  </span>
                </td>
                <td>
                  {ev.nombre}
                  {ev.feedbackPromedio && (
                    <span className={s.puntajeBadge} title={`${ev.feedbackCount} feedback${ev.feedbackCount > 1 ? "s" : ""}`}>
                      <i className="bi bi-star-fill"></i> {ev.feedbackPromedio}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`${s.capacityBadge} ${s["capacity" + capacityClass(ev)]}`}>
                    <i className="bi bi-people"></i>
                    {ev.cantidadPersonas || 0}
                    {ev.capacidadMaxima ? `/${ev.capacidadMaxima}` : ""}
                  </span>
                </td>
                <td className={s.montoCell}>
                  <span className={s.ingresoText}>
                    {money(ev.ingresoReservas || 0)}
                    <span className={s.ingresoSep}>/</span>
                    {money(ev.totalReservas || 0)}
                  </span>
                </td>
                <td className={s.montoCell}>
                  <span className={s.ingresoText}>
                    {money(calcGastos(ev))}
                    {calcGastosEstimados(ev) !== calcGastos(ev) && (
                      <>
                        <span className={s.ingresoSep}>/</span>
                        {money(calcGastosEstimados(ev))}
                      </>
                    )}
                  </span>
                </td>
                <td className={s.montoCell}>
                  <span className={s.ingresoText}>
                    <span className={calcProfit(ev) >= 0 ? s.profitPositive : s.profitNegative}>
                      {money(calcProfit(ev))}
                    </span>
                    {calcProfitEstimado(ev) !== calcProfit(ev) && (
                      <>
                        <span className={s.ingresoSep}>/</span>
                        <span className={calcProfitEstimado(ev) >= 0 ? s.profitPositive : s.profitNegative}>
                          {money(calcProfitEstimado(ev))}
                        </span>
                      </>
                    )}
                  </span>
                </td>
                <td>
                  <span className={`${s.estadoBadge} ${s["estado" + ev.estado.charAt(0).toUpperCase() + ev.estado.slice(1)]}`}>
                    <i className={`bi ${ESTADO_ICON[ev.estado]}`}></i>
                    {ESTADO_LABEL[ev.estado]}
                  </span>
                </td>
                <td>
                  <div className={s.actionsCell}>
                    <button className={`${s.actionBtn} ${s.actionEditBtn}`} onClick={(e) => editar(ev, e)} title="Editar">
                      <i className="bi bi-pencil-square"></i>
                    </button>
                    {tienePermiso(usuario, 'borrar_evento') && <button className={`${s.actionBtn} ${s.actionDeleteBtn}`} onClick={(e) => eliminar(ev, e)} title="Eliminar">
                      <i className="bi bi-trash3-fill"></i>
                    </button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination className={s.paginationBottom} page={page} totalPages={totalPages} onChange={handlePageChange} />

      {/* ═══ Detail Modal ═══ */}
      {showDetail && detailData && (
        <div className={s.modalOverlay} onClick={cerrarDetalle}>
          <div className={s.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={s.closeBtn} onClick={cerrarDetalle}>
              <i className="bi bi-x-lg"></i>
            </button>
            <div className={s.modalInfo}>
              <div className={s.modalTitle}>
                <i className="bi bi-calendar-event"></i>
                {detailData.nombre}
              </div>
              <div className={s.modalMeta}>
                <span><i className="bi bi-calendar3"></i> {formatFecha(detailData.fecha)}</span>
                <span><i className="bi bi-people"></i> {detailData.cantidadPersonas || 0} personas</span>
                <span className={`${s.estadoBadge} ${s["estado" + detailData.estado.charAt(0).toUpperCase() + detailData.estado.slice(1)]}`}>
                  <i className={`bi ${ESTADO_ICON[detailData.estado]}`}></i>
                  {ESTADO_LABEL[detailData.estado]}
                </span>
              </div>

              {/* Capacity bar */}
              {detailData.capacidadMaxima > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                    Capacidad: {detailData.cantidadPersonas || 0} / {detailData.capacidadMaxima}
                  </div>
                  <div className={s.capacityBar}>
                    <div
                      className={`${s.capacityFill} ${s["capacityFill" + capacityClass(detailData)]}`}
                      style={{ width: `${capacityPct(detailData)}%` }}
                    />
                  </div>
                </div>
              )}

              {detailData.descripcion && (
                <div className={s.modalDescripcion}>
                  <strong>Descripción:</strong> {detailData.descripcion}
                </div>
              )}
              {detailData.observaciones && (
                <div className={s.modalDescripcion}>
                  <strong>Observaciones:</strong> {detailData.observaciones}
                </div>
              )}

              {/* ── Reservas ── */}
              <div className={s.modalSection}>
                <div className={s.modalSectionTitle}>
                  <i className="bi bi-people"></i> Reservas ({detailData.reservas?.length || 0})
                  {detailData.precioPorPersona > 0 && (
                    <span className={s.precioPersonaHint}>
                      — {money(detailData.precioPorPersona)}/pers.
                    </span>
                  )}
                </div>

                {/* Cobrado / Total indicator */}
                {(detailData.totalReservas > 0 || detailData.ingresoReservas > 0) && (
                  <div className={s.ingresoIndicator}>
                    <div className={s.ingresoBarLabel}>
                      <span>Cobrado: {money(detailData.ingresoReservas || 0)}</span>
                      <span>Total: {money(detailData.totalReservas || 0)}</span>
                    </div>
                    <div className={s.ingresoBar}>
                      <div
                        className={s.ingresoBarFill}
                        style={{
                          width: `${detailData.totalReservas > 0
                            ? Math.min(((detailData.ingresoReservas || 0) / detailData.totalReservas) * 100, 100)
                            : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Mini form to add reserva */}
                <div className={s.miniForm}>
                  <input
                    className={s.miniInput}
                    type="text"
                    placeholder="Nombre"
                    name="nombre"
                    value={newReserva.nombre}
                    onChange={handleNewReservaChange}
                    style={{ flex: 2 }}
                  />
                  <input
                    className={s.miniInput}
                    type="text"
                    placeholder="Cant."
                    name="cantidad"
                    value={newReserva.cantidad}
                    onChange={handleNewReservaChange}
                    style={{ width: 60 }}
                  />
                  <input
                    className={s.miniInput}
                    type="text"
                    placeholder="Teléfono"
                    name="telefono"
                    value={newReserva.telefono}
                    onChange={handleNewReservaChange}
                    style={{ flex: 1 }}
                  />
                  <NumericFormat
                    className={s.miniInput}
                    prefix="$"
                    placeholder="Monto"
                    value={newReserva.total}
                    thousandSeparator="."
                    decimalSeparator=","
                    onValueChange={(e) => setNewReserva((prev) => ({ ...prev, total: e.floatValue || 0 }))}
                    style={{ width: 100 }}
                  />
                  <select
                    className={s.miniSelect}
                    value={newReserva.turno}
                    onChange={(e) => setNewReserva((prev) => ({ ...prev, turno: e.target.value }))}
                  >
                    <option value="PRIMER TURNO">1er turno</option>
                    <option value="SEGUNDO TURNO">2do turno</option>
                  </select>
                  <button className={s.miniAddBtn} type="button" onClick={agregarReserva}>
                    <i className="bi bi-plus-lg"></i> Agregar
                  </button>
                </div>

                {/* Reservas list */}
                {detailData.reservas?.length > 0 && (
                  <div className={s.modalList}>
                    {detailData.reservas.map((r) => (
                      <div key={r._id} className={s.reservaRow}>
                        <div className={s.reservaInfo}>
                          <span className={s.reservaNombre}>
                            {r.nombre}
                            {r.telefono && (
                              <>
                                <button
                                  style={{ marginLeft: 6, background: "none", border: "none", color: "var(--success)", cursor: "pointer", fontSize: 13 }}
                                  onClick={() => window.open(`https://wa.me/549${r.telefono}`, "_blank")}
                                  title="WhatsApp"
                                >
                                  <i className="bi bi-whatsapp"></i>
                                </button>
                                <button
                                  style={{ marginLeft: 4, background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13 }}
                                  onClick={() => {
                                    const link = `${window.location.origin}/feedback/${detailData._id}/${r._id}`;
                                    const msg = `Hola ${r.nombre}! 🍷 Gracias por haber venido a "${detailData.nombre}". Nos encantaría saber qué te pareció la degustación. Tu opinión nos importa mucho para seguir mejorando! Podés dejarnos tu feedback acá: ${link}`;
                                    window.open(`https://wa.me/549${r.telefono}?text=${encodeURIComponent(msg)}`, "_blank");
                                  }}
                                  title="Pedir reseña"
                                >
                                  <i className="bi bi-star"></i>
                                </button>
                              </>
                            )}
                          </span>
                          <span className={s.reservaDetail}>
                            {r.cantidad} pers. — {r.turno === "PRIMER TURNO" ? "1er turno" : "2do turno"}
                            {r.total > 0 && <> — Total: {money(r.total)}</>}
                            {r.cobrado > 0 && <> — Cobrado: {money(r.cobrado)}</>}
                          </span>
                        </div>
                        {pagoBadge(r)}
                        <button className={s.cobrarBtn} onClick={() => abrirCobrar(r)}>
                          <i className="bi bi-cash-coin"></i> Cobrar
                        </button>
                        <button className={s.borrarReservaBtn} onClick={() => borrarReserva(r._id)} title="Eliminar reserva">
                          <i className="bi bi-trash3"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Vinos usados ── */}
              <div className={s.modalSection}>
                <div className={s.modalSectionTitle}>
                  <i className="bi bi-droplet"></i> Vinos usados ({detailData.vinosUsados?.length || 0})
                </div>

                {/* Buscador de vinos en modal */}
                <div className={s.vinoSearchWrap}>
                  <i className={`bi bi-search ${s.vinoSearchIcon}`}></i>
                  <input
                    className={s.vinoSearchInput}
                    type="text"
                    placeholder="Buscar vino para agregar..."
                    value={modalVinoBusqueda}
                    onChange={(e) => buscarVinoModal(e.target.value)}
                  />
                  {modalVinoResultados.length > 0 && (
                    <div className={s.vinoDropdown}>
                      {modalVinoResultados.map((prod) => {
                        const yaAgregado = (detailData.vinosUsados || []).some((v) => v.codigo === prod.codigo);
                        return (
                          <div
                            key={prod._id}
                            className={`${s.vinoDropdownItem} ${yaAgregado ? s.vinoDropdownItemAdded : ""}`}
                            onClick={() => agregarVinoModal(prod)}
                          >
                            <span className={s.vinoDropdownName}>
                              {yaAgregado && <i className="bi bi-check-lg"></i>} {prod.nombre}
                            </span>
                            <span className={s.vinoDropdownDetail}>{prod.bodega} — {prod.cepa}</span>
                            <span className={s.vinoDropdownPrice}>
                              <NumericFormat prefix="$" displayType="text" value={prod.venta} thousandSeparator="." decimalSeparator="," />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {detailData.vinosUsados?.length > 0 && (
                  <div className={s.modalList}>
                    {detailData.vinosUsados.map((v, i) => (
                      <div key={i} className={s.modalListItem}>
                        <span>
                          {v.nombre} <span className={s.modalListDetail}>({v.bodega} — {v.cepa})</span>
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <NumericFormat prefix="$" displayType="text" value={v.precioVenta} thousandSeparator="." decimalSeparator="," />
                          <button className={s.borrarReservaBtn} onClick={() => quitarVinoModal(i)} title="Quitar vino">
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className={s.modalListTotal}>
                      <span>Costo vinos</span>
                      <NumericFormat prefix="$" displayType="text" value={calcCostoVinos(detailData.vinosUsados)} thousandSeparator="." decimalSeparator="," />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Ingresos extra de caja ── */}
              {detailData.totalIngresosCaja > 0 && (
                <div className={s.modalSection}>
                  <div className={s.modalSectionTitle}>
                    <i className="bi bi-cash-stack"></i> Ingresos extra (desde Caja)
                  </div>
                  <div className={s.modalList}>
                    {detailData.operacionesVinculadas
                      ?.filter((o) => o.tipoOperacion === "INGRESO")
                      .map((o, i) => (
                        <div key={i} className={s.modalListItem}>
                          <span>{o.nombre || o.descripcion || "Ingreso"}</span>
                          <NumericFormat prefix="$" displayType="text" value={o.monto} thousandSeparator="." decimalSeparator="," />
                        </div>
                      ))}
                    <div className={s.modalListTotal}>
                      <span>Total ingresos extra</span>
                      <NumericFormat prefix="$" displayType="text" value={detailData.totalIngresosCaja} thousandSeparator="." decimalSeparator="," />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Gastos de caja ── */}
              {detailData.operacionesVinculadas?.filter((o) => o.tipoOperacion === "GASTO").length > 0 && (
                <div className={s.modalSection}>
                  <div className={s.modalSectionTitle}>
                    <i className="bi bi-receipt"></i> Gastos (desde Caja)
                  </div>
                  <div className={s.modalList}>
                    {detailData.operacionesVinculadas
                      .filter((o) => o.tipoOperacion === "GASTO")
                      .map((o, i) => (
                        <div key={i} className={s.modalListItem}>
                          <span>{o.nombre || o.descripcion || "Gasto"}</span>
                          <NumericFormat prefix="$" displayType="text" value={Math.abs(o.monto)} thousandSeparator="." decimalSeparator="," />
                        </div>
                      ))}
                    <div className={s.modalListTotal}>
                      <span>Total gastos</span>
                      <NumericFormat prefix="$" displayType="text" value={detailData.totalGastosCaja} thousandSeparator="." decimalSeparator="," />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Gastos estimados ── */}
              <div className={s.modalSection}>
                <div className={s.modalSectionTitle}>
                  <i className="bi bi-calculator"></i> Gastos estimados
                </div>

                {/* Mini form */}
                <div className={s.miniForm}>
                  <input
                    className={s.miniInput}
                    type="text"
                    placeholder="Descripción del gasto"
                    value={newGasto.descripcion}
                    onChange={(e) => setNewGasto((prev) => ({ ...prev, descripcion: e.target.value }))}
                    style={{ flex: 2 }}
                  />
                  <NumericFormat
                    className={s.miniInput}
                    prefix="$"
                    placeholder="Monto"
                    value={newGasto.monto}
                    thousandSeparator="."
                    decimalSeparator=","
                    onValueChange={(e) => setNewGasto((prev) => ({ ...prev, monto: e.floatValue || "" }))}
                    style={{ width: 120 }}
                  />
                  <button className={s.miniAddBtn} type="button" onClick={agregarGasto}>
                    <i className="bi bi-plus-lg"></i> Agregar
                  </button>
                </div>

                {/* Lista de gastos */}
                {(detailData.gastosEstimados?.length > 0) && (
                  <div className={s.modalList}>
                    {detailData.gastosEstimados.map((g, idx) => (
                      <div key={idx} className={s.gastoRow}>
                        {editingGastoIdx === idx ? (
                          <>
                            <input
                              className={s.miniInput}
                              type="text"
                              value={editGastoData.descripcion}
                              onChange={(e) => setEditGastoData((prev) => ({ ...prev, descripcion: e.target.value }))}
                              style={{ flex: 2 }}
                            />
                            <NumericFormat
                              className={s.miniInput}
                              prefix="$"
                              value={editGastoData.monto}
                              thousandSeparator="."
                              decimalSeparator=","
                              onValueChange={(e) => setEditGastoData((prev) => ({ ...prev, monto: e.floatValue || 0 }))}
                              style={{ width: 100 }}
                            />
                            <button className={s.miniAddBtn} type="button" onClick={saveEditGasto}>
                              <i className="bi bi-check-lg"></i>
                            </button>
                            <button className={s.borrarReservaBtn} onClick={() => setEditingGastoIdx(null)}>
                              <i className="bi bi-x-lg"></i>
                            </button>
                          </>
                        ) : (
                          <>
                            <div className={s.gastoInfo}>
                              <span className={s.gastoDesc}>{g.descripcion}</span>
                              <span className={s.gastoMonto}>{money(g.monto)}</span>
                            </div>
                            {g.realizado ? (
                              <span className={s.gastoBadgeRealizado}>
                                <i className="bi bi-check-circle"></i> En caja
                              </span>
                            ) : (
                              <div className={s.gastoActions}>
                                <button className={s.gastoIconBtn} onClick={() => {
                                  socket.emit("notificar-pago-gasto", { eventoId: detailData._id, gastoIndex: idx });
                                }} title="Notificar para pagar">
                                  <i className="bi bi-bell"></i>
                                </button>
                                <button className={`${s.gastoIconBtn} ${g.infoPago ? s.gastoIconBtnActive : ''}`} onClick={() => {
                                  if (infoOpenIdx === idx) { setInfoOpenIdx(null); } else { setInfoOpenIdx(idx); setInfoPagoEdit(g.infoPago || ""); }
                                }} title="Info de pago">
                                  <i className="bi bi-info-circle"></i>
                                </button>
                                <button className={s.gastoConcretarBtn} onClick={() => concretarGasto(idx)} title="Enviar a caja">
                                  <i className="bi bi-send"></i> Enviar a caja
                                </button>
                                <button className={s.borrarReservaBtn} onClick={() => startEditGasto(idx)} title="Editar">
                                  <i className="bi bi-pencil"></i>
                                </button>
                                <button className={s.borrarReservaBtn} onClick={() => eliminarGasto(idx)} title="Eliminar">
                                  <i className="bi bi-trash3"></i>
                                </button>
                              </div>
                            )}
                            {infoOpenIdx === idx && !g.realizado && (
                              <div className={s.infoPagoPanel}>
                                <textarea
                                  className={s.infoPagoInput}
                                  placeholder="Datos de pago (CBU, alias, etc.)"
                                  value={infoPagoEdit}
                                  onChange={(e) => setInfoPagoEdit(e.target.value)}
                                  rows={2}
                                />
                                <div className={s.infoPagoBtns}>
                                  <button className={s.miniAddBtn} onClick={() => {
                                    socket.emit("guardar-info-pago-gasto", { eventoId: detailData._id, gastoIndex: idx, infoPago: infoPagoEdit });
                                    setInfoOpenIdx(null);
                                  }}>
                                    <i className="bi bi-check-lg"></i> Guardar
                                  </button>
                                  <button className={s.borrarReservaBtn} onClick={() => setInfoOpenIdx(null)}>
                                    <i className="bi bi-x-lg"></i>
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                    <div className={s.modalListTotal}>
                      <span>Estimado: {money(detailData.gastosEstimados.reduce((acc, g) => acc + (g.monto || 0), 0))}</span>
                      <span>Realizado: {money(detailData.gastosEstimados.filter((g) => g.realizado).reduce((acc, g) => acc + (g.monto || 0), 0))}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Feedback clientes ── */}
              <div className={s.modalSection}>
                <div className={s.modalSectionTitle}>
                  <i className="bi bi-chat-heart"></i> Feedback clientes ({feedbacks.length})
                </div>
                {feedbacks.length > 0 ? (
                  <div className={s.modalList}>
                    {feedbacks.map((fb) => (
                      <div key={fb._id} className={s.feedbackItem}>
                        <div className={s.feedbackHeader}>
                          <span className={s.feedbackNombre}>{fb.nombre}</span>
                          <span className={s.feedbackStars}>
                            {[1,2,3,4,5].map((n) => <span key={n} style={{ color: n <= fb.puntaje ? "#f5a623" : "#555" }}>{n <= fb.puntaje ? "\u2605" : "\u2606"}</span>)}
                          </span>
                        </div>
                        {fb.loPositivo && <div className={s.feedbackLine}><i className="bi bi-hand-thumbs-up" style={{ color: "var(--success)" }}></i> {fb.loPositivo}</div>}
                        {fb.loNegativo && <div className={s.feedbackLine}><i className="bi bi-hand-thumbs-down" style={{ color: "var(--danger)" }}></i> {fb.loNegativo}</div>}
                        {fb.mejoraria && <div className={s.feedbackLine}><i className="bi bi-lightbulb" style={{ color: "var(--accent)" }}></i> {fb.mejoraria}</div>}
                        {fb.comentario && <div className={s.feedbackLine} style={{ opacity: 0.7, fontStyle: "italic" }}>{fb.comentario}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={s.emptyHint}>Sin feedback todavía</div>
                )}
              </div>

              {/* ── Feedback organizador ── */}
              <div className={s.modalSection}>
                <div className={s.modalSectionTitle}>
                  <i className="bi bi-clipboard2-check"></i> Feedback organizador
                </div>
                <div className={s.orgFeedbackForm}>
                  <div className={s.orgFeedbackRow}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Puntaje:</span>
                    <div className={s.feedbackStars}>
                      {[1,2,3,4,5].map((n) => (
                        <button key={n} onClick={() => setOrgFeedback((p) => ({ ...p, puntaje: n }))} className={s.starBtn} style={{ color: n <= orgFeedback.puntaje ? "#f5a623" : "#555" }}>
                          {n <= orgFeedback.puntaje ? "\u2605" : "\u2606"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    className={s.miniInput}
                    style={{ width: "100%", minHeight: 60, resize: "vertical" }}
                    placeholder="Notas internas: cómo salió el evento, qué mejorar para la próxima..."
                    value={orgFeedback.notasInternas}
                    onChange={(e) => setOrgFeedback((p) => ({ ...p, notasInternas: e.target.value }))}
                  />
                  <button
                    className={s.miniAddBtn}
                    style={{ alignSelf: "flex-end", marginTop: 6 }}
                    onClick={() => {
                      if (!orgFeedback.puntaje) return;
                      socket.emit("guardar-feedback-organizador", { eventoId: detailData._id, ...orgFeedback });
                    }}
                  >
                    <i className="bi bi-check-lg"></i> Guardar
                  </button>
                </div>
              </div>

              {/* ── Resumen financiero ── */}
              <div className={s.modalResumen}>
                {(detailData.totalReservas || 0) > 0 && (
                  <div className={`${s.modalResumenRow} ${s.resumenEstimado}`}>
                    <span>Ingreso estimado (reservas)</span>
                    <span>{money(detailData.totalReservas || 0)}</span>
                  </div>
                )}
                <div className={s.modalResumenRow}>
                  <span>Ingreso reservas (cobrado)</span>
                  <span>{money(detailData.ingresoReservas || 0)}</span>
                </div>
                {detailData.totalIngresosCaja > 0 && (
                  <div className={s.modalResumenRow}>
                    <span>Ingresos caja</span>
                    <span>{money(detailData.totalIngresosCaja)}</span>
                  </div>
                )}
                <div className={s.modalResumenRow}>
                  <span>Costo vinos</span>
                  <span>{money(calcCostoVinos(detailData.vinosUsados))}</span>
                </div>
                {detailData.totalGastosCaja > 0 && (
                  <div className={s.modalResumenRow}>
                    <span>Gastos caja</span>
                    <span>{money(detailData.totalGastosCaja)}</span>
                  </div>
                )}
                {(() => {
                  const pendientes = (detailData.gastosEstimados || []).filter((g) => !g.realizado);
                  const montoPendiente = pendientes.reduce((sum, g) => sum + (g.monto || 0), 0);
                  return montoPendiente > 0 ? (
                    <div className={`${s.modalResumenRow} ${s.gastoPendienteRow}`}>
                      <span>Gastos estimados (pendientes)</span>
                      <span>{money(montoPendiente)}</span>
                    </div>
                  ) : null;
                })()}
                <div
                  className={`${s.modalResumenRow} ${s.modalResumenFinal} ${
                    calcProfit(detailData) >= 0 ? s.profitPositive : s.profitNegative
                  }`}
                >
                  <span>Resultado</span>
                  <span>
                    {calcProfit(detailData) >= 0 ? "+" : "-"}
                    {money(Math.abs(calcProfit(detailData)))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Cobrar Modal ═══ */}
      {showCobrar && cobrarTarget && (
        <div className={s.cobrarOverlay} onClick={() => setShowCobrar(false)}>
          <div className={s.cobrarModal} onClick={(e) => e.stopPropagation()}>
            <div className={s.cobrarTitle}>
              <i className="bi bi-cash-coin"></i> Cobrar reserva
            </div>
            <div className={s.cobrarInfo}>
              <span><strong>{cobrarTarget.nombre}</strong></span>
              <span>{cobrarTarget.cantidad} personas — {cobrarTarget.turno === "PRIMER TURNO" ? "1er turno" : "2do turno"}</span>
              {cobrarTarget.total > 0 && <span>Total: {money(cobrarTarget.total)} — Cobrado: {money(cobrarTarget.cobrado || 0)}</span>}
            </div>

            <div className={s.cobrarField}>
              <label>Forma de pago</label>
              <select
                value={cobrarData.formaDeCobro}
                onChange={(e) => {
                  if (e.target.value === "EFECTIVO") {
                    setCobrarData((prev) => ({ ...prev, formaDeCobro: "EFECTIVO", facturado: false }));
                  } else {
                    setCobrarData((prev) => ({ ...prev, formaDeCobro: "DIGITAL", facturado: true }));
                  }
                }}
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="DIGITAL">Digital</option>
              </select>
            </div>

            {cobrarData.formaDeCobro === "EFECTIVO" && (
              <label className={s.cobrarCheckbox}>
                <input
                  type="checkbox"
                  checked={cobrarData.facturado}
                  onChange={(e) => setCobrarData((prev) => ({ ...prev, facturado: e.target.checked }))}
                />
                <span>Facturar</span>
                <div className={s.toggleTrack} />
              </label>
            )}

            <div className={s.cobrarField}>
              <label>Monto a cobrar</label>
              <NumericFormat
                prefix="$"
                value={cobrarData.cobrado}
                thousandSeparator="."
                decimalSeparator=","
                onValueChange={(e) => setCobrarData((prev) => ({ ...prev, cobrado: e.floatValue || 0 }))}
                autoFocus
              />
            </div>

            <div className={s.cobrarActions}>
              <button className={s.cobrarCancelBtn} onClick={() => setShowCobrar(false)}>
                Cancelar
              </button>
              <button className={s.cobrarSubmitBtn} onClick={ejecutarCobro}>
                <i className="bi bi-check-lg"></i> Cobrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Presupuesto Modal ═══ */}
      {showPresupuesto && (() => {
        const c = calcPresupuesto();
        const personas = parseInt(presForm.cantPersonas) || 0;
        return (
          <div className={s.modalOverlay} onClick={(e) => e.target === e.currentTarget && setShowPresupuesto(false)}>
            <div className={s.presModal} ref={presModalRef}>
              <button className={s.closeBtn} onClick={() => setShowPresupuesto(false)} data-html2canvas-ignore>
                <i className="bi bi-x-lg"></i>
              </button>

              <div className={s.presHeader}>
                <i className="bi bi-calculator"></i>
                <span>Presupuesto de Evento</span>
                {presForm.nombre && <span className={s.presHeaderNombre}>— {presForm.nombre}</span>}
              </div>

              <div className={s.presBody}>
                {/* ── Columna izquierda: inputs ── */}
                <div className={s.presInputs}>

                  {/* Referencia */}
                  <div className={s.presSection}>
                    <div className={s.presSectionTitle}><i className="bi bi-tag"></i> Referencia</div>
                    <div className={s.presRow}>
                      <div className={s.presField}>
                        <label>Nombre del evento (opcional)</label>
                        <input
                          type="text"
                          className={s.presInput}
                          placeholder="ej: Cena maridaje enero"
                          value={presForm.nombre}
                          onChange={(e) => setPresForm((p) => ({ ...p, nombre: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Personas y catering */}
                  <div className={s.presSection}>
                    <div className={s.presSectionTitle}><i className="bi bi-people"></i> Personas y catering</div>
                    <div className={s.presRow}>
                      <div className={s.presField}>
                        <label>Cantidad de personas</label>
                        <input
                          type="text"
                          className={s.presInput}
                          placeholder="ej: 20"
                          value={presForm.cantPersonas}
                          onChange={(e) => setPresForm((p) => ({ ...p, cantPersonas: e.target.value.replace(/[^0-9]/g, "") }))}
                        />
                      </div>
                      <div className={s.presField}>
                        <label>Costo comida / persona</label>
                        <NumericFormat
                          className={s.presInput}
                          prefix="$"
                          thousandSeparator="."
                          decimalSeparator=","
                          value={presForm.costoComidaXPersona || ""}
                          onValueChange={(v) => setPresForm((p) => ({ ...p, costoComidaXPersona: v.floatValue || "" }))}
                          placeholder="$0"
                        />
                      </div>
                    </div>
                    {c.comida > 0 && (
                      <div className={s.presSubtotal}>
                        <span>Subtotal catering:</span>
                        <strong>
                          <NumericFormat prefix="$" displayType="text" value={c.comida} thousandSeparator="." decimalSeparator="," />
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Personal */}
                  <div className={s.presSection}>
                    <div className={s.presSectionTitle}><i className="bi bi-person-badge"></i> Personal</div>
                    <div className={s.presRow}>
                      <div className={s.presField}>
                        <label>Costo implícito del personal (total)</label>
                        <NumericFormat
                          className={s.presInput}
                          prefix="$"
                          thousandSeparator="."
                          decimalSeparator=","
                          value={presForm.costoEmpleado || ""}
                          onValueChange={(v) => setPresForm((p) => ({ ...p, costoEmpleado: v.floatValue || "" }))}
                          placeholder="$0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Vinos */}
                  <div className={s.presSection}>
                    <div className={s.presSectionTitle}><i className="bi bi-droplet"></i> Vinos del evento</div>
                    <div className={s.vinoSearchWrap}>
                      <i className={`bi bi-search ${s.vinoSearchIcon}`}></i>
                      <input
                        className={s.vinoSearchInput}
                        type="text"
                        placeholder="Buscar vino por nombre, código o bodega..."
                        value={presVinoBusqueda}
                        onChange={(e) => buscarVinoPresupuesto(e.target.value)}
                      />
                      {presVinoResultados.length > 0 && (
                        <div className={s.vinoDropdown}>
                          {presVinoResultados.map((prod) => {
                            const yaAgregado = presVinos.some((v) => v.codigo === prod.codigo);
                            return (
                              <div
                                key={prod._id}
                                className={`${s.vinoDropdownItem} ${yaAgregado ? s.vinoDropdownItemAdded : ""}`}
                                onClick={() => agregarVinoPresupuesto(prod)}
                              >
                                <span className={s.vinoDropdownName}>
                                  {yaAgregado && <i className="bi bi-check-lg"></i>} {prod.nombre}
                                </span>
                                <span className={s.vinoDropdownDetail}>{prod.bodega} — {prod.cepa}</span>
                                <span className={s.vinoDropdownCode}><i className="bi bi-upc-scan"></i> {prod.codigo}</span>
                                <span className={s.vinoDropdownPrice}>
                                  <NumericFormat prefix="$" displayType="text" value={prod.venta} thousandSeparator="." decimalSeparator="," />
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {presVinos.length > 0 && (
                      <div className={s.presVinoList}>
                        {presVinos.map((v, i) => (
                          <div key={i} className={s.presVinoRow}>
                            <div className={s.presVinoInfo}>
                              <span className={s.presVinoNombre}>{v.nombre}</span>
                              <span className={s.presVinoDetail}>
                                {v.bodega}{v.cepa ? ` — ${v.cepa}` : ""} ·{" "}
                                <NumericFormat prefix="$" displayType="text" value={v.precioVenta} thousandSeparator="." decimalSeparator="," /> c/u
                              </span>
                            </div>
                            <div className={s.presVinoControls}>
                              <span className={s.presVinoQtyLabel}>Botellas</span>
                              <input
                                type="text"
                                className={s.presVinoQty}
                                value={v.cantidad}
                                onChange={(e) => updateCantVinoPresupuesto(i, e.target.value.replace(/[^0-9]/g, ""))}
                              />
                              <span className={s.presVinoSubtotal}>
                                = <NumericFormat prefix="$" displayType="text" value={v.precioVenta * (v.cantidad || 1)} thousandSeparator="." decimalSeparator="," />
                              </span>
                              <button className={s.chipRemove} onClick={() => quitarVinoPresupuesto(i)} type="button">
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className={s.presVinoTotal}>
                          Total vinos:{" "}
                          <NumericFormat prefix="$" displayType="text" value={presVinos.reduce((sum, v) => sum + v.precioVenta * (v.cantidad || 1), 0)} thousandSeparator="." decimalSeparator="," />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Otros costos */}
                  <div className={s.presSection}>
                    <div className={s.presSectionTitle}><i className="bi bi-plus-circle"></i> Otros costos</div>
                    <div className={s.presRow}>
                      <div className={s.presField}>
                        <label>Sommelier</label>
                        <NumericFormat
                          className={s.presInput}
                          prefix="$"
                          thousandSeparator="."
                          decimalSeparator=","
                          value={presForm.costoSommelier || ""}
                          onValueChange={(v) => setPresForm((p) => ({ ...p, costoSommelier: v.floatValue || "" }))}
                          placeholder="$0"
                        />
                      </div>
                      <div className={s.presField}>
                        <label>Marketing (redes, diseño, etc.)</label>
                        <NumericFormat
                          className={s.presInput}
                          prefix="$"
                          thousandSeparator="."
                          decimalSeparator=","
                          value={presForm.costoMarketing || ""}
                          onValueChange={(v) => setPresForm((p) => ({ ...p, costoMarketing: v.floatValue || "" }))}
                          placeholder="$0"
                        />
                      </div>
                      <div className={s.presField}>
                        <label>Otros (alquiler, decoración, etc.)</label>
                        <NumericFormat
                          className={s.presInput}
                          prefix="$"
                          thousandSeparator="."
                          decimalSeparator=","
                          value={presForm.otrosGastos || ""}
                          onValueChange={(v) => setPresForm((p) => ({ ...p, otrosGastos: v.floatValue || "" }))}
                          placeholder="$0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ganancia */}
                  <div className={s.presSection}>
                    <div className={s.presSectionTitle}><i className="bi bi-percent"></i> Ganancia deseada</div>
                    <div className={s.presRow}>
                      <div className={s.presField} style={{ maxWidth: 160 }}>
                        <label>Porcentaje de ganancia</label>
                        <div className={s.presGananciaWrap}>
                          <input
                            type="text"
                            className={s.presGananciaInput}
                            value={presForm.ganancia}
                            onChange={(e) => setPresForm((p) => ({ ...p, ganancia: e.target.value.replace(/[^0-9.]/g, "") }))}
                            placeholder="30"
                          />
                          <span className={s.presGananciaSuffix}>%</span>
                        </div>
                      </div>
                      {c.base > 0 && (
                        <div className={s.presSubtotal} style={{ alignSelf: "flex-end", marginBottom: 2 }}>
                          <span>Ganancia:</span>
                          <strong>
                            <NumericFormat prefix="$" displayType="text" value={c.gananciaAmt} thousandSeparator="." decimalSeparator="," />
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      className={s.presResetBtn}
                      onClick={descargarPresupuesto}
                      type="button"
                      data-html2canvas-ignore
                    >
                      <i className="bi bi-download"></i> Descargar imagen
                    </button>
                    <button
                      className={s.presResetBtn}
                      onClick={() => { setPresForm(emptyPres); setPresVinos([]); setPresVinoBusqueda(""); setPresVinoResultados([]); }}
                      type="button"
                      data-html2canvas-ignore
                    >
                      <i className="bi bi-arrow-counterclockwise"></i> Limpiar formulario
                    </button>
                  </div>
                </div>

                {/* ── Columna derecha: resumen ── */}
                <div className={s.presResumen}>
                  <div className={s.presResumenTitle}><i className="bi bi-receipt"></i> Resumen</div>

                  {c.base > 0 ? (
                    <>
                      <div className={s.presResumenDesglose}>
                        {c.comida > 0 && (
                          <div className={s.presResumenRow}>
                            <span>Catering{presForm.cantPersonas ? ` (${presForm.cantPersonas} pers.)` : ""}</span>
                            <NumericFormat prefix="$" displayType="text" value={c.comida} thousandSeparator="." decimalSeparator="," />
                          </div>
                        )}
                        {c.empleados > 0 && (
                          <div className={s.presResumenRow}>
                            <span>Personal</span>
                            <NumericFormat prefix="$" displayType="text" value={c.empleados} thousandSeparator="." decimalSeparator="," />
                          </div>
                        )}
                        {c.vinos > 0 && (
                          <div className={s.presResumenRow}>
                            <span>Vinos ({presVinos.length} tipo{presVinos.length !== 1 ? "s" : ""})</span>
                            <NumericFormat prefix="$" displayType="text" value={c.vinos} thousandSeparator="." decimalSeparator="," />
                          </div>
                        )}
                        {c.sommelier > 0 && (
                          <div className={s.presResumenRow}>
                            <span>Sommelier</span>
                            <NumericFormat prefix="$" displayType="text" value={c.sommelier} thousandSeparator="." decimalSeparator="," />
                          </div>
                        )}
                        {c.marketing > 0 && (
                          <div className={s.presResumenRow}>
                            <span>Marketing</span>
                            <NumericFormat prefix="$" displayType="text" value={c.marketing} thousandSeparator="." decimalSeparator="," />
                          </div>
                        )}
                        {c.otros > 0 && (
                          <div className={s.presResumenRow}>
                            <span>Otros gastos</span>
                            <NumericFormat prefix="$" displayType="text" value={c.otros} thousandSeparator="." decimalSeparator="," />
                          </div>
                        )}
                        <div className={s.presResumenDivider}></div>
                        <div className={`${s.presResumenRow} ${s.presResumenBase}`}>
                          <span>Costo base</span>
                          <NumericFormat prefix="$" displayType="text" value={c.base} thousandSeparator="." decimalSeparator="," />
                        </div>
                        <div className={s.presResumenRow}>
                          <span>Ganancia ({presForm.ganancia || 0}%)</span>
                          <span style={{ color: "var(--success)" }}>
                            + <NumericFormat prefix="$" displayType="text" value={c.gananciaAmt} thousandSeparator="." decimalSeparator="," />
                          </span>
                        </div>
                        <div className={s.presResumenDivider}></div>
                        <div className={`${s.presResumenRow} ${s.presResumenNeto}`}>
                          <span>Precio neto</span>
                          <NumericFormat prefix="$" displayType="text" value={c.neto} thousandSeparator="." decimalSeparator="," />
                        </div>
                      </div>

                      <div className={s.presResumenPrecioCard}>
                        {/* Con factura */}
                        <div className={s.presPrecioFactura}>
                          <div className={s.presPrecioLabel}>
                            <i className="bi bi-receipt-cutoff"></i>
                            Con factura
                            <span className={s.presPrecioTag}>+25% contable</span>
                          </div>
                          <div className={s.presPrecioMonto}>
                            <NumericFormat prefix="$" displayType="text" value={Math.round(c.conFactura)} thousandSeparator="." decimalSeparator="," />
                          </div>
                          {personas > 0 && (
                            <div className={s.presPrecioPorPersona}>
                              <NumericFormat prefix="$" displayType="text" value={Math.round(c.conFactura / personas)} thousandSeparator="." decimalSeparator="," />
                              {" "}por persona
                            </div>
                          )}
                        </div>

                        {/* En efectivo */}
                        <div className={s.presPrecioEfectivo}>
                          <div className={s.presPrecioLabel}>
                            <i className="bi bi-cash-coin"></i>
                            En efectivo
                            <span className={s.presPrecioTagEfectivo}>20% menos</span>
                          </div>
                          <div className={s.presPrecioMontoEfectivo}>
                            <NumericFormat prefix="$" displayType="text" value={Math.round(c.efectivo)} thousandSeparator="." decimalSeparator="," />
                          </div>
                          {personas > 0 && (
                            <div className={s.presPrecioPorPersona}>
                              <NumericFormat prefix="$" displayType="text" value={Math.round(c.efectivo / personas)} thousandSeparator="." decimalSeparator="," />
                              {" "}por persona
                            </div>
                          )}
                        </div>
                      </div>

                      {personas > 0 && (
                        <div className={s.presAhorro}>
                          <i className="bi bi-lightning-charge-fill"></i>
                          Ahorro en efectivo:{" "}
                          <strong>
                            <NumericFormat prefix="$" displayType="text" value={Math.round(c.conFactura - c.efectivo)} thousandSeparator="." decimalSeparator="," />
                          </strong>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={s.presResumenEmpty}>
                      <i className="bi bi-calculator"></i>
                      <span>Completá los costos para ver el presupuesto</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Modal vincular gasto */}
      {showVincularModal && (
        <div className={s.vincularOverlay} onClick={() => setShowVincularModal(false)}>
          <div className={s.vincularModal} onClick={(e) => e.stopPropagation()}>
            <button className={s.vincularClose} onClick={() => setShowVincularModal(false)}>
              <i className="bi bi-x-lg"></i>
            </button>
            <h3 className={s.vincularTitle}>Enviar a caja</h3>
            <p className={s.vincularSub}>
              {detailData?.gastosEstimados?.[vincularGastoIdx]?.descripcion} — {money(detailData?.gastosEstimados?.[vincularGastoIdx]?.monto)}
            </p>
            <div className={s.vincularOptions}>
              <button className={s.vincularOptionBtn} onClick={concretarGastoNuevo}>
                <i className="bi bi-plus-circle"></i>
                <span>Crear nuevo gasto en caja</span>
              </button>
              <button className={`${s.vincularOptionBtn} ${s.vincularOptionBtnAlt}`} onClick={() => buscarGastosParaVincular("")}>
                <i className="bi bi-link-45deg"></i>
                <span>Vincular a gasto existente</span>
              </button>
            </div>
            {vincularGastos.length > 0 || vincularLoading ? (
              <div className={s.vincularListWrap}>
                <div className={s.vincularSearchWrap}>
                  <i className="bi bi-search"></i>
                  <input
                    className={s.vincularSearchInput}
                    type="text"
                    placeholder="Buscar gasto..."
                    value={vincularSearch}
                    onChange={(e) => buscarGastosParaVincular(e.target.value)}
                    autoFocus
                  />
                </div>
                {vincularLoading ? (
                  <div className={s.vincularLoading}><i className="bi bi-hourglass-split"></i> Buscando...</div>
                ) : (
                  <div className={s.vincularList}>
                    {vincularGastos.map((g) => (
                      <button key={g._id} className={s.vincularItem} onClick={() => vincularGastoExistente(g._id)}>
                        <div className={s.vincularItemTop}>
                          <span className={s.vincularItemDesc}>{g.descripcion || g.nombre}</span>
                          <span className={s.vincularItemMonto}>{money(g.monto)}</span>
                        </div>
                        <div className={s.vincularItemBottom}>
                          <span>{g.nombre && g.descripcion ? g.nombre : ''}</span>
                          <span>{g.fecha}</span>
                        </div>
                      </button>
                    ))}
                    {vincularGastos.length === 0 && (
                      <div className={s.vincularEmpty}>No se encontraron gastos</div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default Eventos;
