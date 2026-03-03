import React, { useState, useEffect } from "react";
import { socket } from "../main";
import { NumericFormat } from "react-number-format";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  AreaChart, Area, ReferenceDot,
} from "recharts";
import s from "./Estadisticas.module.css";

const money = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(n || 0);

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={s.chartTooltip}>
      <div className={s.tooltipLabel}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className={s.tooltipRow}>
          <span style={{ color: p.color }}>{p.name}:</span>
          <span>{p.dataKey === "monto" ? money(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// Helpers para presets de período
const todayStr = () => new Date().toISOString().slice(0, 10);
const offsetDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const lunesEstaSemana = () => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
};

function Estadisticas() {
  const [tipoOperacion, setTipoOperacion] = useState("APORTE");
  const [operaciones, setOperaciones] = useState([]);
  const [totalFacturado, setTotalFacturado] = useState(0);
  const [totalNoFacturado, setTotalNoFacturado] = useState(0);
  const [totalGastoFacturado, setTotalGastoFacturado] = useState(0);
  const [ivaCompra, setIvaCompra] = useState(0);
  const [reporteEventos, setReporteEventos] = useState(null);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [analytics, setAnalytics] = useState(null);

  const [periodo, setPeriodo] = useState("mes");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const buildFiltro = () => {
    if (periodo === "hoy") return { desde: todayStr(), hasta: todayStr() };
    if (periodo === "semana") return { desde: lunesEstaSemana(), hasta: todayStr() };
    if (periodo === "7dias") return { desde: offsetDate(-6), hasta: todayStr() };
    if (periodo === "30dias") return { desde: offsetDate(-29), hasta: todayStr() };
    if (periodo === "rango" && desde && hasta) return { desde, hasta };
    return mes || new Date().toISOString().slice(0, 7);
  };

  const filtro = buildFiltro();

  const getGastos = (f) => socket.emit("request-gastos", f);
  const getOperaciones = (tipo, f) => socket.emit("request-tipo-operacion", tipo, f);
  const getTotalFacturado = (f) => socket.emit("request-facturado", f);
  const getAnalytics = (f) => socket.emit("request-estadisticas-ventas", f);

  useEffect(() => {
    socket.on("response-tipo-operacion", (ap) => setOperaciones(ap));
    socket.on("response-facturado", (total) => {
      setTotalFacturado(total.totalFacturado);
      setTotalNoFacturado(total.totalNoFacturado);
    });
    socket.on("response-gastos", (tgf, ic) => {
      setTotalGastoFacturado(tgf);
      setIvaCompra(ic);
    });
    socket.on("response-reporte-eventos", (data) => setReporteEventos(data));
    socket.on("response-estadisticas-ventas", (data) => setAnalytics(data));
    socket.on("cambios", () => {
      getOperaciones(tipoOperacion, filtro);
      getTotalFacturado(filtro);
      getAnalytics(filtro);
      socket.emit("request-reporte-eventos", filtro);
    });
    getOperaciones(tipoOperacion, filtro);
    getTotalFacturado(filtro);
    getGastos(filtro);
    getAnalytics(filtro);
    socket.emit("request-reporte-eventos", filtro);
    return () => {
      socket.off("response-tipo-operacion");
      socket.off("response-facturado");
      socket.off("response-gastos");
      socket.off("response-reporte-eventos");
      socket.off("response-estadisticas-ventas");
      socket.off("cambios");
    };
  }, [tipoOperacion, mes, periodo, desde, hasta]);

  const totalMonto = operaciones.reduce((total, ap) => total + ap.monto, 0);

  const desc = analytics?.descuentos || {};
  const descVinos = analytics?.descuentosVinos || {};
  const descReservas = analytics?.descuentosReservas || {};
  const ticketPromedio = desc.cantidadTotal > 0 ? desc.montoTotal / desc.cantidadTotal : 0;
  const ticketVinos = descVinos.cantidadTotal > 0 ? descVinos.montoTotal / descVinos.cantidadTotal : 0;
  const ticketReservas = descReservas.cantidadTotal > 0 ? descReservas.montoTotal / descReservas.cantidadTotal : 0;
  const bestHour = analytics?.ventasPorHora?.length
    ? analytics.ventasPorHora.reduce((best, h) => (h.monto > best.monto ? h : best), { monto: 0 })
    : null;
  const bestDay = analytics?.ventasPorDiaSemana?.length
    ? analytics.ventasPorDiaSemana.reduce((best, d) => (d.monto > best.monto ? d : best), { monto: 0 })
    : null;

  return (
    <div className={s.container}>
      {/* Toolbar */}
      <div className={s.toolbar}>
        <div className={s.periodBtns}>
          {[
            { key: "mes", label: "Mes" },
            { key: "semana", label: "Semana" },
            { key: "hoy", label: "Hoy" },
            { key: "7dias", label: "7 dias" },
            { key: "30dias", label: "30 dias" },
            { key: "rango", label: "Rango" },
          ].map((p) => (
            <button
              key={p.key}
              className={`${s.periodBtn} ${periodo === p.key ? s.periodActive : ""}`}
              onClick={() => setPeriodo(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodo === "mes" && (
          <input
            className={s.monthInput}
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        )}
        {periodo === "rango" && (
          <div className={s.rangoInputs}>
            <input className={s.monthInput} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <span className={s.rangoSep}>a</span>
            <input className={s.monthInput} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        )}
      </div>

      {/* Financial stats */}
      <div className={s.statsRow}>
        <div className={s.statCard}>
          <span className={s.statLabel}>Total Ventas</span>
          <span className={s.statValue}>{money(totalFacturado + totalNoFacturado)}</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statLabel}>Facturado</span>
          <span className={s.statValue}>{money(totalFacturado)}</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statLabel}>No Facturado</span>
          <span className={s.statValue}>{money(totalNoFacturado)}</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statLabel}>IVA Ventas</span>
          <span className={s.statValue}>{money(totalFacturado - totalFacturado / 1.21)}</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statLabel}>Gasto Facturado</span>
          <span className={s.statValue}>{money(totalGastoFacturado)}</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statLabel}>IVA Compra</span>
          <span className={s.statValue}>{money(ivaCompra)}</span>
        </div>
      </div>

      {/* ═══ Sales Analytics ═══ */}
      {analytics && (
        <>
          <div className={s.sectionTitle}>
            <i className="bi bi-graph-up"></i> Analiticas de ventas
          </div>

          <div className={s.statsRow}>
            <div className={s.statCard}>
              <span className={s.statLabel}>Ventas Vinos</span>
              <span className={s.statValue}>{descVinos.cantidadTotal || 0}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statLabel}>Ticket Vinos</span>
              <span className={s.statValue}>{money(ticketVinos)}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statLabel}>Ventas Reservas</span>
              <span className={s.statValue}>{descReservas.cantidadTotal || 0}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statLabel}>Ticket Reservas</span>
              <span className={s.statValue}>{money(ticketReservas)}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statLabel}>Total Ventas</span>
              <span className={s.statValue}>{desc.cantidadTotal || 0}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statLabel}>Ticket Promedio</span>
              <span className={s.statValue}>{money(ticketPromedio)}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statLabel}>Total Descuentos</span>
              <span className={s.statValue}>{money(desc.totalDescuento)}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statLabel}>Ventas c/ Descuento</span>
              <span className={s.statValue}>
                {desc.cantidadConDescuento || 0}
                <span className={s.statSub}> / {desc.cantidadTotal || 0}</span>
              </span>
            </div>
            {bestHour && (
              <div className={s.statCard}>
                <span className={s.statLabel}>Mejor Horario</span>
                <span className={s.statValue}>{bestHour.hora}</span>
              </div>
            )}
            {bestDay && (
              <div className={s.statCard}>
                <span className={s.statLabel}>Mejor Dia</span>
                <span className={s.statValue}>{bestDay.dia}</span>
              </div>
            )}
          </div>

          {/* Charts row 1: hora + día semana */}
          <div className={s.chartsRow}>
            <div className={s.chartCard}>
              <div className={s.chartTitle}>
                <i className="bi bi-clock"></i> Ventas por hora del dia
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.ventasPorHora}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="hora" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="cantidad" name="Ventas" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className={s.chartCard}>
              <div className={s.chartTitle}>
                <i className="bi bi-calendar-week"></i> Ventas por dia de la semana
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.ventasPorDiaSemana}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="monto" name="Monto" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Charts row 2: cepa + evolución diaria */}
          <div className={s.chartsRow}>
            <div className={s.chartCard}>
              <div className={s.chartTitle}>
                <i className="bi bi-cup-straw"></i> Ventas por cepa
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.ventasPorCepa} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <YAxis type="category" dataKey="cepa" tick={{ fontSize: 11 }} stroke="var(--text-muted)" width={90} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="cantidad" name="Unidades" fill="#ec4899" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className={s.chartCard}>
              <div className={s.chartTitle}>
                <i className="bi bi-graph-up-arrow"></i> Evolucion diaria
                <span className={s.chartLegend}>
                  <span className={s.legendDot} style={{ background: "#6366f1" }}></span> Ventas
                  <span className={s.legendDot} style={{ background: "#f97316" }}></span> Con evento
                </span>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={analytics.ventasPorDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fontSize: 10 }}
                    stroke="var(--text-muted)"
                    tickFormatter={(f) => (f ? f.slice(8) : "")}
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className={s.chartTooltip}>
                          <div className={s.tooltipLabel}>{d.fecha}</div>
                          <div className={s.tooltipRow}>
                            <span>Ventas:</span>
                            <span>{d.cantidad}</span>
                          </div>
                          <div className={s.tooltipRow}>
                            <span>Monto:</span>
                            <span>{money(d.monto)}</span>
                          </div>
                          {d.conEvento && (
                            <div className={s.tooltipEvent}>
                              <i className="bi bi-calendar-event"></i> Dia con evento
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="monto"
                    stroke="#6366f1"
                    fill="rgba(99, 102, 241, 0.15)"
                    strokeWidth={2}
                  />
                  {analytics.ventasPorDia
                    .filter((d) => d.conEvento)
                    .map((d) => (
                      <ReferenceDot
                        key={d.fecha}
                        x={d.fecha}
                        y={d.monto}
                        r={5}
                        fill="#f97316"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Charts row 3: forma pago + bodega */}
          <div className={s.chartsRow}>
            <div className={s.chartCard}>
              <div className={s.chartTitle}>
                <i className="bi bi-credit-card"></i> Forma de pago
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={analytics.ventasPorFormaPago}
                    dataKey="monto"
                    nameKey="formaPago"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ formaPago, percent }) =>
                      `${formaPago} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {analytics.ventasPorFormaPago.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => money(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className={s.chartCard}>
              <div className={s.chartTitle}>
                <i className="bi bi-building"></i> Ventas por bodega
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={analytics.ventasPorBodega} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                  <YAxis type="category" dataKey="bodega" tick={{ fontSize: 11 }} stroke="var(--text-muted)" width={90} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="monto" name="Monto" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top 10 productos */}
          {analytics.topProductos?.length > 0 && (
            <div className={s.chartCard}>
              <div className={s.chartTitle}>
                <i className="bi bi-trophy"></i> Top 10 productos mas vendidos
              </div>
              <div className={s.tableWrapper} style={{ boxShadow: "none", border: "none" }}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th style={{ textAlign: "left" }}>Producto</th>
                      <th>Bodega</th>
                      <th>Unidades</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topProductos.map((p, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td style={{ textAlign: "left", fontWeight: 600 }}>{p.nombre}</td>
                        <td>{p.bodega || "-"}</td>
                        <td>{p.cantidad}</td>
                        <td>{money(p.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ Operations table ═══ */}
      <div className={s.sectionTitle}>
        <i className="bi bi-cash-stack"></i> Operaciones
      </div>
      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.summaryTh}>
                <NumericFormat
                  prefix=""
                  displayType="text"
                  value={operaciones.length}
                  thousandSeparator="."
                  decimalSeparator=","
                  decimalScale={2}
                />
              </th>
              <th>
                <div className={s.selectWrapper}>
                  <select
                    className={s.select}
                    onChange={(e) => setTipoOperacion(e.target.value)}
                    value={tipoOperacion}
                  >
                    <option value="APORTE">APORTE</option>
                    <option value="RETIRO">RETIRO</option>
                    <option value="GASTO">GASTO</option>
                    <option value="INGRESO">INGRESO</option>
                    <option value="CIERRE DE CAJA">CIERRE DE CAJA</option>
                  </select>
                </div>
              </th>
              <th className={s.summaryTh}>
                <NumericFormat
                  prefix="$"
                  displayType="text"
                  value={totalMonto}
                  thousandSeparator="."
                  decimalSeparator=","
                  decimalScale={2}
                />
              </th>
            </tr>
            <tr>
              <th>NOMBRE</th>
              <th></th>
              <th>MONTO</th>
            </tr>
          </thead>
          <tbody>
            {operaciones?.map((ap, index) => (
              <tr key={index}>
                <td>{ap.nombre}</td>
                <td></td>
                <td>
                  <NumericFormat
                    prefix="$"
                    displayType="text"
                    value={ap.monto}
                    thousandSeparator="."
                    decimalSeparator=","
                    decimalScale={2}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ Reporte Eventos ═══ */}
      {reporteEventos && reporteEventos.reporte?.length > 0 && (
        <div className={s.degSection}>
          <div className={s.degTitle}>
            <i className="bi bi-calendar-event"></i> Eventos
            <span className={s.degCount}>{reporteEventos.resumen.cantidad}</span>
          </div>

          <div className={s.statsRow}>
            <div className={s.statCard}>
              <span className={s.statLabel}>Ingreso Total</span>
              <span className={s.statValue}>{money(reporteEventos.resumen.totalIngreso)}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statLabel}>Gasto Total</span>
              <span className={s.statValue}>{money(reporteEventos.resumen.totalGasto)}</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statLabel}>Resultado</span>
              <span className={`${s.statValue} ${reporteEventos.resumen.totalResultado >= 0 ? s.positive : s.negative}`}>
                {money(reporteEventos.resumen.totalResultado)}
              </span>
            </div>
            <div className={s.statCard}>
              <span className={s.statLabel}>Personas</span>
              <span className={s.statValue}>{reporteEventos.resumen.totalPersonas}</span>
            </div>
          </div>

          <div className={s.tableWrapper}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Nombre</th>
                  <th>Personas</th>
                  <th>Ingreso</th>
                  <th>Gasto</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {reporteEventos.reporte.map((d) => (
                  <tr key={d._id}>
                    <td>{d.fecha}</td>
                    <td>{d.nombre}</td>
                    <td>{d.cantidadPersonas}</td>
                    <td>{money(d.ingreso)}</td>
                    <td>{money(d.gasto)}</td>
                    <td className={d.resultado >= 0 ? s.positive : s.negative}>
                      {money(d.resultado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Estadisticas;
