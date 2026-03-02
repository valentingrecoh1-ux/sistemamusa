import React, { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IP, socket } from "../main";
import { NumericFormat } from "react-number-format";
import moment from "moment-timezone";
import DatePicker from "react-datepicker";
import { es } from "date-fns/locale/es";
import Modal from "../components/shared/Modal";
import Pagination from "../components/shared/Pagination";
import { tienePermiso } from "../lib/permisos";
import s from "./Ventas.module.css";

function Ventas({ usuario }) {
  const location = useLocation();
  const navegar = useNavigate();
  const hoyArgentina = () =>
    moment(new Date()).tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");
  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };
  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("es-AR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };
  const formatText = (value, fallback = "-") => {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text.length > 0 ? text : fallback;
  };
  const formatReservaDate = (value) => {
    if (!value) return "-";
    const parsed = moment(
      value,
      ["YYYY-MM-DD", "DD-MM-YYYY", moment.ISO_8601],
      true
    );
    if (parsed.isValid()) return parsed.format("DD/MM/YYYY");
    return formatText(value, "-");
  };
  const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");
  const formatCuit = (value) => {
    const digits = onlyDigits(value);
    if (digits.length !== 11) return formatText(value, "CUIT no informado");
    return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
  };
  const formatDni = (value) => {
    const digits = onlyDigits(value);
    if (!digits) return "DNI no informado";
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };
  const getDocInfo = (ventaItem) => {
    const tipoFacturaItem = formatText(ventaItem?.tipoFactura, "");
    const raw = formatText(ventaItem?.cuit, "");
    const rawDigits = onlyDigits(raw);
    if (!raw) {
      return {
        cardLabel: tipoFacturaItem === "A" ? "CUIT" : tipoFacturaItem === "B" ? "DNI" : "Documento",
        detailLabel: "Documento informado",
        value: "Sin documento informado",
      };
    }
    if (tipoFacturaItem === "A") {
      return {
        cardLabel: "CUIT",
        detailLabel: "CUIT de la venta",
        value: formatCuit(raw),
      };
    }
    if (tipoFacturaItem === "B") {
      return {
        cardLabel: "DNI",
        detailLabel: "DNI informado",
        value: formatDni(raw),
      };
    }
    if (rawDigits.length === 11) {
      return {
        cardLabel: "CUIT",
        detailLabel: "CUIT de la venta",
        value: formatCuit(raw),
      };
    }
    return {
      cardLabel: "DNI",
      detailLabel: "DNI informado",
      value: formatDni(raw),
    };
  };
  const [ventas, setVentas] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fecha, setFecha] = useState(hoyArgentina());
  const [alreadyClicked, setAlreadyClicked] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [venta, setVenta] = useState({});
  const [filtroPago, setFiltroPago] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroNotaCredito, setFiltroNotaCredito] = useState(false);
  const [totalMonto, setTotalMonto] = useState(0);
  const [totalDescuento, setTotalDescuento] = useState(0);
  const [mpLinkModal, setMpLinkModal] = useState(false);
  const [mpLinkVenta, setMpLinkVenta] = useState(null);
  const [mpPagosSinVincular, setMpPagosSinVincular] = useState([]);
  const [mpPagosOtros, setMpPagosOtros] = useState([]);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const filtrosPago = [
    { value: "todos", label: "Todos" },
    { value: "efectivo", label: "Efectivo" },
    { value: "digital", label: "Digital" },
  ];
  const filtrosTipo = [
    { value: "todos", label: "Todos" },
    { value: "vino", label: "Vino" },
    { value: "reserva", label: "Reserva" },
  ];
  const pagoIndex = filtrosPago.findIndex((option) => option.value === filtroPago);
  const tipoIndex = filtrosTipo.findIndex((option) => option.value === filtroTipo);
  const totalNeto = Math.max(totalMonto - totalDescuento, 0);
  const ventaMonto = toNumber(venta.monto);
  const ventaDescuento = toNumber(venta.descuento);
  const ventaNeto = Math.max(ventaMonto - ventaDescuento, 0);
  const productosVenta = Array.isArray(venta.productos) ? venta.productos : [];
  const montoEfectivo = toNumber(venta.montoEfectivo);
  const montoDigital = toNumber(venta.montoDigital);
  const mostrarPagoMixto =
    formatText(venta.formaPago, "") === "MIXTO" ||
    montoEfectivo > 0 ||
    montoDigital > 0;
  const clienteNombre = formatText(
    venta.razonSocial || venta.nombre,
    "Consumidor final"
  );
  const clienteUbicacion = [
    formatText(venta.domicilio, ""),
    formatText(venta.localidad, ""),
    formatText(venta.provincia, ""),
  ]
    .filter(Boolean)
    .join(", ");
  const esReserva = Boolean(venta.idTurno);
  const docInfo = getDocInfo(venta);
  const titularReserva = formatText(venta.nombreTurno, "-");
  const fechaReserva = formatReservaDate(venta.reservaFecha);
  const turnoReserva = formatText(venta.reservaTurno, "-");

  const fetchVentas = (
    fecha,
    page,
    filtroPago,
    filtroTipo,
    filtroNotaCredito
  ) => {
    setAlreadyClicked(false);
    socket.emit("request-ventas", {
      fecha,
      page,
      filtroPago,
      filtroTipo,
      filtroNotaCredito,
    });
  };

  const notaCredito = (venta) => {
    if (!venta.tipoFactura) {
      if (
        window.confirm(
          "NO HAY FACTURA PARA HACER NOTA DE CREDITO\n\n\u00bfDesea cancelar la compra?"
        )
      ) {
        socket.emit("devolucion", venta);
      }
      return;
    }
    if (
      window.confirm("\u00bfESTAS SEGURO QUE QUIERES HACER UNA NOTA DE CREDITO?")
    ) {
      if (alreadyClicked) {
        alert("NOTA DE CREDITO EN PROCESO");
        return;
      }
      setAlreadyClicked(true);
      socket.emit("nota-credito", venta);
    }
  };

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

  const ventaClick = (venta) => {
    setVenta(venta);
    setOpenModal(true);
  };

  const openPdfModal = async (url, label) => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        alert(`No se pudo cargar ${label}: ${txt || res.status}`);
        return;
      }
      const blob = await res.blob();
      setPreviewPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      alert(`Error al cargar ${label}: ${err.message}`);
    }
  };

  const openFacturaPdf = (venta) => {
    if (!venta?.stringNumeroFactura) {
      alert("La venta no tiene factura para visualizar.");
      return;
    }
    openPdfModal(`${IP()}/api/factura-pdf/${venta._id}`, "la factura");
  };

  const openNotaCreditoPdf = (venta) => {
    if (!venta?.stringNumeroNotaCredito) {
      alert("No hay archivo de nota de credito disponible para esta venta.");
      return;
    }
    openPdfModal(`${IP()}/api/nota-credito-pdf/${venta._id}`, "la nota de credito");
  };

  const changeFiltroPago = (value) => {
    setPage(1);
    setFiltroPago(value);
  };

  const changeFiltroTipo = (value) => {
    setPage(1);
    setFiltroTipo(value);
  };

  const toggleFiltroNotaCredito = () => {
    setPage(1);
    setFiltroNotaCredito((prev) => !prev);
  };

  const pagoPillClass = (formaPago) => {
    if (formaPago === "EFECTIVO") return `${s.pill} ${s.pillCash}`;
    if (formaPago === "DIGITAL") return `${s.pill} ${s.pillDigital}`;
    if (formaPago === "MIXTO") return `${s.pill} ${s.pillMixed}`;
    return `${s.pill} ${s.pillNeutral}`;
  };

  const facturaPillClass = (tipoFactura) => {
    if (tipoFactura === "A") return `${s.pill} ${s.pillFacturaA}`;
    if (tipoFactura === "B") return `${s.pill} ${s.pillFacturaB}`;
    return `${s.pill} ${s.pillNeutral}`;
  };

  const abrirMpLink = (v) => {
    setMpLinkVenta(v);
    setMpLinkModal(true);
    socket.emit("request-mp-sin-vincular", { fecha: v.fecha });
  };

  const cerrarMpLink = () => {
    setMpLinkModal(false);
    setMpLinkVenta(null);
    setMpPagosSinVincular([]);
    setMpPagosOtros([]);
  };

  const vincularMp = (ventaId, mpPaymentId) => {
    socket.emit("vincular-mp-pago", { ventaId, mpPaymentId });
    cerrarMpLink();
  };

  const desvincularMp = (ventaId, mpPaymentId) => {
    socket.emit("desvincular-mp-pago", { ventaId, mpPaymentId });
  };

  const money = (n) =>
    "$" + (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  useEffect(() => {
    socket.on("cambios", () =>
      fetchVentas(fecha, page, filtroPago, filtroTipo, filtroNotaCredito)
    );
    socket.on("response-ventas", (data) => {
      if (data.status === "error") {
        console.error(data.message);
        return;
      }
      const ventasData = Array.isArray(data.ventas) ? data.ventas : [];
      setVentas(ventasData);
      setTotalPages(data.totalPages || 1);
      const total = ventasData.reduce((acc, venta) => {
        if (!venta || typeof venta !== "object" || venta.notaCredito) return acc;
        return acc + toNumber(venta.monto);
      }, 0);
      const totalDescuento = ventasData.reduce((acc, venta) => {
        if (!venta || typeof venta !== "object" || venta.notaCredito) return acc;
        return acc + toNumber(venta.descuento);
      }, 0);
      setTotalMonto(total);
      setTotalDescuento(totalDescuento);
    });
    fetchVentas(fecha, page, filtroPago, filtroTipo, filtroNotaCredito);
    socket.on("response-mp-sin-vincular", (data) => {
      setMpPagosSinVincular(data?.pagos || []);
      setMpPagosOtros(data?.pagosOtros || []);
    });

    return () => {
      socket.off("cambios");
      socket.off("response-ventas");
      socket.off("response-mp-sin-vincular");
    };
  }, [fecha, page, filtroPago, filtroTipo, filtroNotaCredito]);

  // Si venimos del Carrito con una venta DIGITAL/MIXTO, abrir modal MP
  useEffect(() => {
    const info = location.state?.mpLinkVenta;
    if (info?.ventaId) {
      setMpLinkVenta({ _id: info.ventaId, monto: info.monto, fecha: info.fecha, stringNumeroFactura: info.stringNumeroFactura, numeroVenta: info.numeroVenta });
      setMpLinkModal(true);
      socket.emit("request-mp-sin-vincular", { fecha: info.fecha || hoyArgentina() });
      navegar(location.pathname, { replace: true, state: null });
    }
  }, [location.state]);

  return (
    <div className={s.container}>
      <div className={s.kpiRow}>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Monto bruto</div>
          <div className={s.kpiValue}>
            <NumericFormat
              prefix="$"
              displayType="text"
              value={totalMonto.toFixed(2)}
              thousandSeparator="."
              decimalSeparator=","
            />
          </div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Descuentos</div>
          <div className={s.kpiValue}>
            <NumericFormat
              prefix="$"
              displayType="text"
              value={totalDescuento.toFixed(2)}
              thousandSeparator="."
              decimalSeparator=","
            />
          </div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiLabel}>Neto del periodo</div>
          <div className={s.kpiValue}>
            <NumericFormat
              prefix="$"
              displayType="text"
              value={totalNeto.toFixed(2)}
              thousandSeparator="."
              decimalSeparator=","
            />
          </div>
          <div className={s.kpiHint}>{ventas.length} ventas en pagina</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className={s.toolbar}>
        <div className={s.dateNav}>
          <button
            type="button"
            className={`${s.dateShiftBtn} ${s.dateShiftPrev}`}
            onClick={() => shiftDate(-1)}
            aria-label="Dia anterior"
          >
            <i className="bi bi-chevron-left"></i>
          </button>
          <DatePicker
            className={s.dateInput}
            wrapperClassName={s.datePickerWrap}
            popperClassName={s.datePopper}
            selected={fechaSeleccionada}
            locale={es}
            dateFormat="dd/MM/yyyy"
            placeholderText="Todas las fechas"
            isClearable
            clearButtonTitle="Quitar fecha"
            onChange={handleDateChange}
            popperPlacement="bottom-start"
            showPopperArrow={false}
            popperProps={{ strategy: "fixed", placement: "bottom-start" }}
          />
          <button
            type="button"
            className={`${s.dateShiftBtn} ${s.dateShiftNext}`}
            onClick={() => shiftDate(1)}
            aria-label="Dia siguiente"
          >
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
        <div className={s.filtersWrap}>
          <div className={s.filterBlock}>
            <span className={s.filterLabel}>Pago</span>
            <div
              className={s.segmented}
              style={{ "--active-index": pagoIndex >= 0 ? pagoIndex : 0 }}
            >
              <span className={s.segmentThumb} aria-hidden="true"></span>
              {filtrosPago.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${s.segmentBtn} ${filtroPago === option.value ? s.segmentBtnActive : ""}`}
                  onClick={() => changeFiltroPago(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className={s.filterBlock}>
            <span className={s.filterLabel}>Tipo</span>
            <div
              className={s.segmented}
              style={{ "--active-index": tipoIndex >= 0 ? tipoIndex : 0 }}
            >
              <span className={s.segmentThumb} aria-hidden="true"></span>
              {filtrosTipo.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${s.segmentBtn} ${filtroTipo === option.value ? s.segmentBtnActive : ""}`}
                  onClick={() => changeFiltroTipo(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={s.paginationTools}>
          <button
            type="button"
            className={`${s.creditFilterBtn} ${
              filtroNotaCredito ? s.creditFilterBtnActive : ""
            }`}
            onClick={toggleFiltroNotaCredito}
            aria-pressed={filtroNotaCredito}
          >
            <i className="bi bi-file-earmark-break-fill"></i>
            Notas de credito
          </button>
          <Pagination
            className={s.paginationDock}
            page={page}
            totalPages={totalPages}
            onChange={handlePageChange}
          />
        </div>
      </div>

      {/* Sales list */}
      <div className={s.tableWrapper}>
        {ventas?.length > 0 ? (
          <div className={s.salesList}>
            {ventas
              .filter((venta) => venta && typeof venta === "object")
              .map((venta, index) => {
              const netoVenta = Math.max(
                toNumber(venta.monto) - toNumber(venta.descuento),
                0
              );

              return (
                <article
                  className={`${s.saleCard} ${venta.notaCredito ? s.saleCardCredito : ""}`}
                  onClick={() => ventaClick(venta)}
                  key={venta._id || index}
                >
                  <div className={s.saleHead}>
                    <div className={s.saleDate}>
                      {formatDateTime(venta.createdAt)}
                    </div>
                    <div className={s.saleHeadCenter}>
                      {venta.stringNumeroFactura ? (
                        <button
                          type="button"
                          className={`${s.saleActionBtn} ${s.saleActionDoc}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openFacturaPdf(venta);
                          }}
                        >
                          <i className="bi bi-receipt"></i>
                          Ver factura
                        </button>
                      ) : (
                        <span
                          aria-hidden="true"
                          className={`${s.saleActionBtn} ${s.saleActionDoc} ${s.saleActionGhost}`}
                        >
                          <i className="bi bi-receipt"></i>
                          Ver factura
                        </span>
                      )}
                      {venta.notaCredito && (
                        <button
                          type="button"
                          className={`${s.saleActionBtn} ${s.saleActionCreditDoc}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openNotaCreditoPdf(venta);
                          }}
                        >
                          <i className="bi bi-file-earmark-text"></i>
                          Ver nota
                        </button>
                      )}
                      {!venta.notaCredito && tienePermiso(usuario, 'anular_venta') && (
                        <button
                          type="button"
                          className={`${s.saleActionBtn} ${s.saleActionDanger}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            notaCredito(venta);
                          }}
                        >
                          <i className="bi bi-file-earmark-break-fill"></i>
                          Nota de credito
                        </button>
                      )}
                    </div>
                    <div className={s.saleBadges}>
                      <span className={facturaPillClass(venta.tipoFactura || "")}>
                        {venta.tipoFactura ? venta.tipoFactura : "SF"}
                      </span>
                      <span className={pagoPillClass(venta.formaPago)}>
                        {venta.formaPago}
                      </span>
                      {(venta.formaPago === "DIGITAL" || venta.formaPago === "MIXTO") && (
                        <span
                          className={`${s.pill} ${venta.mpPaymentIds?.length ? s.pillMpLinked : s.pillMpUnlinked} ${!venta.mpPaymentIds?.length ? s.pillClickable : ""}`}
                          onClick={(e) => {
                            if (!venta.mpPaymentIds?.length) {
                              e.stopPropagation();
                              abrirMpLink(venta);
                            }
                          }}
                        >
                          {venta.mpPaymentIds?.length ? `MP ✓${venta.mpPaymentIds.length > 1 ? ` (${venta.mpPaymentIds.length})` : ""}` : "MP ?"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={s.saleGrid}>
                    <div className={s.saleItem}>
                      <span className={s.saleItemLabel}>Comprobante</span>
                      <span className={s.saleItemValue}>
                        {venta.numeroFactura ? venta.numeroFactura : "-"}
                      </span>
                    </div>
                    <div className={s.saleItem}>
                      <span className={s.saleItemLabel}>Monto</span>
                      <span className={s.saleItemValue}>
                        <NumericFormat
                          prefix="$"
                          displayType="text"
                          value={toNumber(venta.monto).toFixed(2)}
                          thousandSeparator="."
                          decimalSeparator=","
                        />
                      </span>
                    </div>
                    <div className={s.saleItem}>
                      <span className={s.saleItemLabel}>Descuento</span>
                      <span className={s.saleItemValue}>
                        <NumericFormat
                          prefix="$"
                          displayType="text"
                          value={toNumber(venta.descuento).toFixed(2)}
                          thousandSeparator="."
                          decimalSeparator=","
                        />
                      </span>
                    </div>
                    <div className={s.saleItem}>
                      <div className={s.saleItemHeadWithDetail}>
                        <span className={s.saleItemLabel}>Neto</span>
                        <span aria-hidden="true" className={s.saleDetailInlineMobile}>
                          <i className="bi bi-info-circle"></i>
                          Detalle
                        </span>
                      </div>
                      <span className={s.saleItemValueStrong}>
                        <NumericFormat
                          prefix="$"
                          displayType="text"
                          value={netoVenta.toFixed(2)}
                          thousandSeparator="."
                          decimalSeparator=","
                        />
                      </span>
                    </div>
                    <div className={`${s.saleGridAction} ${s.saleGridActionDesktop}`}>
                      <button
                        type="button"
                        className={s.saleActionBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          ventaClick(venta);
                        }}
                      >
                        <i className="bi bi-info-circle"></i>
                        Detalle
                      </button>
                    </div>
                  </div>

                </article>
              );
            })}
          </div>
        ) : (
          <div className={s.emptyRow}>
            No hay ventas disponibles
          </div>
        )}
      </div>

      {/* Modal */}
      {openModal && (
        <Modal
          title={
            <div className={s.modalTitleWrap}>
              <span className={s.modalTitleTag}>
                {venta.notaCredito ? "NOTA DE CREDITO" : "DETALLE DE VENTA"}
              </span>
              <span className={s.modalTitleAmount}>
                <NumericFormat
                  prefix="$"
                  displayType="text"
                  value={ventaMonto.toFixed(2)}
                  thousandSeparator="."
                  decimalSeparator=","
                />
              </span>
            </div>
          }
          onClose={() => setOpenModal(false)}
          footer={
            <button
              className={s.modalCloseBtn}
              onClick={() => setOpenModal(false)}
            >
              Cerrar
            </button>
          }
        >
          <div
            className={`${s.modalBody} ${venta.notaCredito ? s.modalBodyCredito : ""}`}
          >
            {venta.notaCredito && (
              <div className={s.modalCancelledStamp}>VENTA CANCELADA</div>
            )}
            <div className={s.modalSummaryGrid}>
              <div className={s.modalSummaryItem}>
                <span className={s.modalSummaryLabel}>Monto bruto</span>
                <span className={s.modalSummaryValue}>
                  <NumericFormat
                    prefix="$"
                    displayType="text"
                    value={ventaMonto.toFixed(2)}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </span>
              </div>
              <div className={s.modalSummaryItem}>
                <span className={s.modalSummaryLabel}>Descuento</span>
                <span className={s.modalSummaryValue}>
                  <NumericFormat
                    prefix="$"
                    displayType="text"
                    value={ventaDescuento.toFixed(2)}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </span>
              </div>
              <div className={`${s.modalSummaryItem} ${s.modalSummaryStrong}`}>
                <span className={s.modalSummaryLabel}>Neto</span>
                <span className={s.modalSummaryValue}>
                  <NumericFormat
                    prefix="$"
                    displayType="text"
                    value={ventaNeto.toFixed(2)}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </span>
              </div>
            </div>

            <div className={s.modalSection}>
              <h4 className={s.modalSectionTitle}>Comercial</h4>
              <div className={s.modalInfoGrid}>
                <div className={s.modalInfoItem}>
                  <span className={s.modalInfoLabel}>Fecha</span>
                  <span className={s.modalInfoValue}>
                    {formatDateTime(venta.createdAt)}
                  </span>
                </div>
                <div className={s.modalInfoItem}>
                  <span className={s.modalInfoLabel}>Forma de pago</span>
                  <span className={s.modalInfoValue}>
                    {formatText(venta.formaPago)}
                  </span>
                </div>
                <div className={s.modalInfoItem}>
                  <span className={s.modalInfoLabel}>Tipo factura</span>
                  <span className={s.modalInfoValue}>
                    {formatText(venta.tipoFactura, "SF")}
                  </span>
                </div>
                <div className={s.modalInfoItem}>
                  <span className={s.modalInfoLabel}>Comprobante</span>
                  <span className={s.modalInfoValue}>
                    {formatText(
                      venta.stringNumeroFactura || venta.numeroFactura,
                      "-"
                    )}
                  </span>
                </div>
                <div className={s.modalInfoItem}>
                  <span className={s.modalInfoLabel}>Tipo de venta</span>
                  <span className={s.modalInfoValue}>
                    {venta.idTurno ? "Reserva" : "Vino"}
                  </span>
                </div>
                <div className={s.modalInfoItem}>
                  <span className={s.modalInfoLabel}>Referencia</span>
                  <span className={s.modalInfoValue}>
                    {formatText(
                      esReserva ? venta.reservaTurno || venta.nombreTurno : venta.numeroVenta,
                      "-"
                    )}
                  </span>
                </div>
                {(venta.formaPago === "DIGITAL" || venta.formaPago === "MIXTO") && (
                  <div className={s.modalInfoItem}>
                    <span className={s.modalInfoLabel}>MercadoPago</span>
                    <span className={`${s.modalInfoValue} ${venta.mpPaymentIds?.length ? s.modalMpLinked : s.modalMpUnlinked}`}>
                      {venta.mpPaymentIds?.length ? (
                        <span className={s.mpLinkInfo}>
                          {venta.mpPaymentIds.map((mpId) => (
                            <span key={mpId} className={s.mpLinkChip}>
                              ID: {mpId}
                              <button
                                className={s.mpUnlinkBtn}
                                onClick={() => desvincularMp(venta._id, mpId)}
                              >
                                <i className="bi bi-x-circle"></i>
                              </button>
                            </span>
                          ))}
                          <button className={s.mpLinkBtn} onClick={() => { setOpenModal(false); abrirMpLink(venta); }}>
                            + Agregar pago
                          </button>
                        </span>
                      ) : (
                        <button className={s.mpLinkBtn} onClick={() => { setOpenModal(false); abrirMpLink(venta); }}>
                          Vincular
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {esReserva && (
              <div className={s.modalSection}>
                <h4 className={s.modalSectionTitle}>Datos de reserva</h4>
                <div className={s.modalInfoGrid}>
                  <div className={s.modalInfoItem}>
                    <span className={s.modalInfoLabel}>Titular de reserva</span>
                    <span className={s.modalInfoValue}>{titularReserva}</span>
                  </div>
                  <div className={s.modalInfoItem}>
                    <span className={s.modalInfoLabel}>Fecha de reserva</span>
                    <span className={s.modalInfoValue}>{fechaReserva}</span>
                  </div>
                  <div className={s.modalInfoItem}>
                    <span className={s.modalInfoLabel}>Turno de reserva</span>
                    <span className={s.modalInfoValue}>{turnoReserva}</span>
                  </div>
                </div>
              </div>
            )}

            <div className={s.modalSection}>
              <h4 className={s.modalSectionTitle}>Cliente</h4>
              <div className={s.modalInfoGrid}>
                <div className={s.modalInfoItem}>
                  <span className={s.modalInfoLabel}>Nombre / Razon social</span>
                  <span className={s.modalInfoValue}>{clienteNombre}</span>
                </div>
                <div className={s.modalInfoItem}>
                  <span className={s.modalInfoLabel}>{docInfo.detailLabel}</span>
                  <span className={s.modalInfoValue}>{docInfo.value}</span>
                </div>
                <div className={s.modalInfoItem}>
                  <span className={s.modalInfoLabel}>Domicilio</span>
                  <span className={s.modalInfoValue}>
                    {formatText(clienteUbicacion, "-")}
                  </span>
                </div>
              </div>
            </div>

            {ventaDescuento > 0 && (
              <div className={s.modalSection}>
                <h4 className={s.modalSectionTitle}>Detalle del descuento</h4>
                <p className={s.modalDetailText}>
                  {formatText(venta.detalle, "Sin descripcion cargada")}
                </p>
              </div>
            )}

            {mostrarPagoMixto && (
              <div className={s.modalSection}>
                <h4 className={s.modalSectionTitle}>Desglose de cobro</h4>
                <div className={s.modalSplitGrid}>
                  <div className={s.modalSplitItem}>
                    <span className={s.modalSplitLabel}>Efectivo</span>
                    <span className={s.modalSplitValue}>
                      <NumericFormat
                        prefix="$"
                        displayType="text"
                        value={montoEfectivo.toFixed(2)}
                        thousandSeparator="."
                        decimalSeparator=","
                      />
                    </span>
                  </div>
                  <div className={s.modalSplitItem}>
                    <span className={s.modalSplitLabel}>Digital</span>
                    <span className={s.modalSplitValue}>
                      <NumericFormat
                        prefix="$"
                        displayType="text"
                        value={montoDigital.toFixed(2)}
                        thousandSeparator="."
                        decimalSeparator=","
                      />
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className={s.modalSection}>
              <h4 className={s.modalSectionTitle}>
                Productos ({productosVenta.length})
              </h4>
              {productosVenta.length > 0 ? (
                <div className={s.modalProductsList}>
                  {productosVenta.map((prod, index) => {
                    const cantidad = Math.max(
                      toNumber(prod?.carritoCantidad || prod?.cantidad || 1),
                      1
                    );
                    const precioUnitario = toNumber(
                      prod?.venta ?? prod?.precioVenta ?? prod?.precio ?? 0
                    );
                    const subtotal = cantidad * precioUnitario;
                    const cepa = formatText(prod?.cepa, "");
                    const year = formatText(prod?.year || prod?.anio, "");
                    const bodega = formatText(prod?.bodega, "");
                    const meta = [cepa, year, bodega].filter(Boolean).join(" | ");

                    return (
                      <div className={s.modalProduct} key={prod?._id || index}>
                        <div className={s.modalProductMain}>
                          <div className={s.modalProductName}>
                            {formatText(prod?.nombre, "Producto sin nombre")}
                          </div>
                          {meta && <div className={s.modalProductMeta}>{meta}</div>}
                        </div>
                        <div className={s.modalProductAmounts}>
                          <span className={s.modalProductQty}>x{cantidad}</span>
                          <span className={s.modalProductPrice}>
                            <NumericFormat
                              prefix="$"
                              displayType="text"
                              value={subtotal.toFixed(2)}
                              thousandSeparator="."
                              decimalSeparator=","
                            />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={s.modalEmptyProducts}>
                  Esta venta no tiene productos asociados.
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* MP Link modal */}
      {mpLinkModal && mpLinkVenta && (
        <div className={s.mpOverlay} onClick={cerrarMpLink}>
          <div className={s.mpModal} onClick={(e) => e.stopPropagation()}>
            <div className={s.mpModalHeader}>
              <h3>Vincular con pago MP</h3>
              <button className={s.mpModalClose} onClick={cerrarMpLink}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className={s.mpModalBody}>
              <div className={s.mpLinkVentaInfo}>
                <div>
                  <span>{mpLinkVenta.stringNumeroFactura || `Venta #${mpLinkVenta.numeroVenta}`}</span>
                  {mpLinkVenta.createdAt && (
                    <div style={{fontSize:'0.75rem',opacity:0.6,marginTop:2}}>
                      {new Date(mpLinkVenta.createdAt).toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"2-digit"})}
                      {" "}
                      {new Date(mpLinkVenta.createdAt).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}
                    </div>
                  )}
                </div>
                <span className={s.mpLinkVentaMonto}>{money(mpLinkVenta.monto)}</span>
              </div>
              {mpPagosSinVincular.length === 0 && mpPagosOtros.length === 0 ? (
                <div className={s.mpLinkEmpty}>
                  No hay pagos MP aprobados sin vincular
                </div>
              ) : (
                <div className={s.mpLinkList}>
                  {mpPagosSinVincular.map((p) => (
                    <div
                      key={p.id}
                      className={`${s.mpLinkItem} ${p.monto === mpLinkVenta.monto ? s.mpLinkItemMatch : ""}`}
                      onClick={() => vincularMp(mpLinkVenta._id, p.id)}
                    >
                      <div className={s.mpLinkItemInfo}>
                        <span>Pago #{p.id}</span>
                        <span className={s.mpLinkItemSub}>
                          {p.pagador || p.descripcion}
                          {" — "}
                          {new Date(p.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <span className={s.mpLinkItemMonto}>{money(p.monto)}</span>
                    </div>
                  ))}
                  {mpPagosOtros.length > 0 && (
                    <>
                      <div className={s.mpLinkSeparator}>Otros días</div>
                      {mpPagosOtros.map((p) => (
                        <div
                          key={p.id}
                          className={`${s.mpLinkItem} ${p.monto === mpLinkVenta.monto ? s.mpLinkItemMatch : ""}`}
                          onClick={() => vincularMp(mpLinkVenta._id, p.id)}
                        >
                          <div className={s.mpLinkItemInfo}>
                            <span>Pago #{p.id}</span>
                            <span className={s.mpLinkItemSub}>
                              {p.pagador || p.descripcion}
                              {" — "}
                              {new Date(p.fecha).toLocaleDateString("es-AR")} {new Date(p.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <span className={s.mpLinkItemMonto}>{money(p.monto)}</span>
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
      {/* Modal preview PDF factura/nota credito */}
      {previewPdfUrl && (
        <div className={s.previewOverlay} onClick={() => { URL.revokeObjectURL(previewPdfUrl); setPreviewPdfUrl(null); }}>
          <div className={s.previewModal} onClick={(e) => e.stopPropagation()}>
            <button className={s.previewClose} onClick={() => { URL.revokeObjectURL(previewPdfUrl); setPreviewPdfUrl(null); }}>
              <i className="bi bi-x-lg" />
            </button>
            <iframe src={previewPdfUrl} className={s.previewFrame} title="Preview PDF" />
          </div>
        </div>
      )}
    </div>
  );
}

export default Ventas;
