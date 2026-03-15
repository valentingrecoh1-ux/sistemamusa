import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../main";
import s from "./Asistencia.module.css";

const API = "/api/asistencia";
const AREA_FILTER = "MUSA PALERMO";
const CRISTIAN_ID = "emp018";
const PRECIO_HORA = 9000;

const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Feriados nacionales Argentina 2026
const FERIADOS_2026 = {
  "2026-01-01": "Año Nuevo",
  "2026-02-16": "Carnaval",
  "2026-02-17": "Carnaval",
  "2026-03-23": "Puente turístico",
  "2026-03-24": "Día de la Memoria",
  "2026-04-02": "Día del Veterano",
  "2026-04-03": "Viernes Santo",
  "2026-05-01": "Día del Trabajador",
  "2026-05-25": "Revolución de Mayo",
  "2026-06-15": "Güemes",
  "2026-06-20": "Día de la Bandera",
  "2026-07-09": "Día de la Independencia",
  "2026-07-10": "Puente turístico",
  "2026-08-17": "San Martín",
  "2026-10-12": "Diversidad Cultural",
  "2026-11-23": "Soberanía Nacional",
  "2026-12-07": "Puente turístico",
  "2026-12-08": "Inmaculada Concepción",
  "2026-12-25": "Navidad",
};

// Colores para empleados (distinguibles entre sí)
const EMP_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#a855f7", // purple
  "#64748b", // slate
  "#e11d48", // rose
];

const fmtHours = (h) => {
  if (!h) return "0hs";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}hs`;
};

// Full name for display
const displayName = (name) => name || "";

export default function Asistencia() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [report, setReport] = useState(null);
  const [daily, setDaily] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState("all");
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastLiquidacion, setLastLiquidacion] = useState(null);
  const [liqHours, setLiqHours] = useState(0);
  const [liqFrom, setLiqFrom] = useState(null);
  const [liqTo, setLiqTo] = useState(null);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);

  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const [repRes, empRes] = await Promise.all([
        fetch(`${API}/schedules/report?month=${monthStr}`),
        fetch(`${API}/employees`),
      ]);
      const repData = await repRes.json();
      const empData = await empRes.json();
      const allEmps = empData.employees || [];
      const areaEmps = allEmps.filter((e) => e.position === AREA_FILTER);
      const areaIds = new Set(areaEmps.map((e) => e.employeeId));
      // Filter report employees to only show MUSA PALERMO
      if (repData.employees) {
        repData.employees = repData.employees.filter((e) => areaIds.has(e.employeeId));
      }
      setReport(repData);
      setEmployees(areaEmps);
    } catch (err) {
      console.error("Error fetching report:", err);
    }
    setLoading(false);
  }, [monthStr]);

  useEffect(() => {
    fetchReport();
    setSelectedDay(null);
    setDaily(null);
  }, [fetchReport]);

  // Fetch last liquidation date from config
  useEffect(() => {
    const handleConfig = (cfg) => {
      if (cfg?.lastLiquidacionDate) {
        setLastLiquidacion(cfg.lastLiquidacionDate);
      }
    };
    socket.on("response-config-tienda", handleConfig);
    socket.emit("request-config-tienda");
    return () => socket.off("response-config-tienda", handleConfig);
  }, []);

  // Calculate Cristian's hours since last liquidation (fetch all needed months)
  useEffect(() => {
    if (lastLiquidacion === null && !report) return;
    const calcHours = async () => {
      const fromDate = lastLiquidacion || null;
      // Determine which months to fetch (from lastLiquidacion to today)
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      const months = new Set([todayStr]);
      if (fromDate) {
        // Add months between last liquidation and today
        const [fy, fm] = fromDate.split("-").map(Number);
        let y = fy, m = fm;
        while (`${y}-${String(m).padStart(2, "0")}` <= todayStr) {
          months.add(`${y}-${String(m).padStart(2, "0")}`);
          m++;
          if (m > 12) { m = 1; y++; }
        }
      }
      // Fetch all needed month reports
      let totalH = 0;
      let firstDate = null;
      let lastDate = null;
      for (const mo of [...months].sort()) {
        try {
          const res = await fetch(`${API}/schedules/report?month=${mo}`);
          const data = await res.json();
          const cristian = data.employees?.find((e) => e.employeeId === CRISTIAN_ID);
          if (!cristian?.dailyDetails) continue;
          Object.entries(cristian.dailyDetails).forEach(([dateStr, dd]) => {
            if (fromDate && dateStr <= fromDate) return;
            if (dd.totalHours > 0) {
              totalH += dd.totalHours;
              if (!firstDate || dateStr < firstDate) firstDate = dateStr;
              if (!lastDate || dateStr > lastDate) lastDate = dateStr;
            }
          });
        } catch {}
      }
      setLiqHours(totalH);
      setLiqFrom(firstDate);
      setLiqTo(lastDate);
    };
    calcHours();
  }, [report, lastLiquidacion]);

  const handleLiquidar = () => {
    if (!liqTo || liqHours <= 0) return;
    const monto = Math.round(liqHours * PRECIO_HORA);
    const fromFmt = liqFrom ? new Date(liqFrom + "T12:00:00").toLocaleDateString("es-AR") : "";
    const toFmt = liqTo ? new Date(liqTo + "T12:00:00").toLocaleDateString("es-AR") : "";

    // Save last liquidation date
    socket.emit("update-config-tienda", { lastLiquidacionDate: liqTo });
    setLastLiquidacion(liqTo);

    // Navigate to Caja with prefill
    navigate("/caja", {
      state: {
        prefill: {
          descripcion: `Sueldo Cristian Baldovino ${fromFmt} a ${toFmt}`,
          monto: -(Math.abs(monto)),
          nombre: "SUELDO",
          tipoOperacion: "GASTO",
        },
      },
    });
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchDaily = async (dateStr) => {
    try {
      const [dailyRes, empRes] = await Promise.all([
        fetch(`${API}/schedules/daily?date=${dateStr}`),
        fetch(`${API}/employees`),
      ]);
      const data = await dailyRes.json();
      const empData = await empRes.json();
      const areaIds = new Set((empData.employees || []).filter((e) => e.position === AREA_FILTER).map((e) => e.employeeId));
      if (data.present) data.present = data.present.filter((p) => areaIds.has(p.employeeId));
      if (data.absent) data.absent = data.absent.filter((a) => areaIds.has(a.employeeId));
      data.totalPresent = data.present?.length || 0;
      data.totalAbsent = data.absent?.length || 0;
      setDaily(data);
    } catch (err) {
      console.error("Error fetching daily:", err);
    }
  };

  const handleDayClick = (dateStr) => {
    if (selectedDay === dateStr) {
      setSelectedDay(null);
      setDaily(null);
    } else {
      setSelectedDay(dateStr);
      fetchDaily(dateStr);
    }
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay() - 1; // Monday = 0
  if (startDow < 0) startDow = 6;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < startDow; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  // Build employee color map
  const empColorMap = {};
  (report?.employees || []).forEach((emp, idx) => {
    empColorMap[emp.employeeId] = EMP_COLORS[idx % EMP_COLORS.length];
  });

  // Get employee data for calendar
  const filteredEmployees = report?.employees?.filter(
    (e) => selectedEmp === "all" || e.employeeId === selectedEmp
  ) || [];

  const getDayData = (day) => {
    if (!day) return null;
    const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
    let totalHours = 0;
    let worked = 0;
    const empDetails = [];
    filteredEmployees.forEach((emp) => {
      const dd = emp.dailyDetails?.[dateStr];
      if (dd && dd.totalHours > 0) {
        totalHours += dd.totalHours;
        worked++;
        const sessions = dd.sessions || [];
        const firstIn = sessions[0]?.in || null;
        const lastOut = sessions[sessions.length - 1]?.out || null;
        empDetails.push({
          name: emp.employeeName,
          id: emp.employeeId,
          hours: dd.totalHours,
          firstIn,
          lastOut,
        });
      }
    });
    // Store open/close = earliest in, latest out across all employees
    let storeOpen = null;
    let storeClose = null;
    empDetails.forEach((e) => {
      if (e.firstIn && (!storeOpen || e.firstIn < storeOpen)) storeOpen = e.firstIn;
      if (e.lastOut && (!storeClose || e.lastOut > storeClose)) storeClose = e.lastOut;
    });
    return { totalHours, worked, dateStr, empDetails, storeOpen, storeClose };
  };

  const isFeriado = (day) => {
    const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
    return FERIADOS_2026[dateStr] || null;
  };

  const isToday = (day) => {
    return day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  };

  const isPast = (day) => {
    const d = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

  return (
    <div className={s.container}>
      <h2 className={s.title}>
        <i className="bi bi-clock-history"></i> Asistencia
      </h2>

      {/* Toolbar */}
      <div className={s.toolbar}>
        <div className={s.monthNav}>
          <button onClick={prevMonth} className={s.navBtn}>
            <i className="bi bi-chevron-left"></i>
          </button>
          <span className={s.monthLabel}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className={s.navBtn}>
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
        <div className={s.empDrop} ref={dropRef}>
          <button className={`${s.empDropBtn} ${dropOpen ? s.empDropOpen : ""}`} onClick={() => setDropOpen(!dropOpen)}>
            <span className={s.empDropIcon}>
              {selectedEmp === "all" ? (
                <i className="bi bi-people-fill"></i>
              ) : (
                <span className={s.empDropDot} style={{ background: empColorMap[selectedEmp] }} />
              )}
            </span>
            <span>{selectedEmp === "all" ? "Ambos" : employees.find((e) => e.employeeId === selectedEmp)?.name}</span>
            <i className={`bi bi-chevron-down ${s.empDropArrow}`}></i>
          </button>
          {dropOpen && (
            <div className={s.empDropMenu}>
              <div
                className={`${s.empDropItem} ${selectedEmp === "all" ? s.empDropActive : ""}`}
                onClick={() => { setSelectedEmp("all"); setDropOpen(false); }}
              >
                <i className="bi bi-people-fill"></i>
                <span>Ambos</span>
              </div>
              {employees.map((emp) => (
                <div
                  key={emp.employeeId}
                  className={`${s.empDropItem} ${selectedEmp === emp.employeeId ? s.empDropActive : ""}`}
                  onClick={() => { setSelectedEmp(emp.employeeId); setDropOpen(false); }}
                >
                  <span className={s.empDropDot} style={{ background: empColorMap[emp.employeeId] }} />
                  <span>{emp.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Employee color legend */}
      {!loading && report && selectedEmp === "all" && (
        <div className={s.legend}>
          {(report.employees || []).map((emp, idx) => (
            <div key={emp.employeeId} className={s.legendItem}>
              <span
                className={s.legendDot}
                style={{ background: EMP_COLORS[idx % EMP_COLORS.length] }}
              />
              <span className={s.legendName}>{displayName(emp.employeeName)}</span>
            </div>
          ))}
          <div className={s.legendItem}>
            <span className={`${s.legendDot} ${s.legendFeriado}`} />
            <span className={s.legendName}>Feriado</span>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {!loading && report && (
        <div className={s.summaryRow}>
          {filteredEmployees.map((emp) => (
            <div key={emp.employeeId} className={s.summaryCard} style={{ borderTop: `3px solid ${empColorMap[emp.employeeId]}` }}>
              <div className={s.summaryName}>{emp.employeeName}</div>
              <div className={s.summaryStats}>
                <div className={s.summaryStat}>
                  <span className={s.summaryValue}>{emp.daysWorked}</span>
                  <span className={s.summaryLabel}>dias</span>
                </div>
                <div className={s.summaryStat}>
                  <span className={s.summaryValue}>{fmtHours(emp.totalHours)}</span>
                  <span className={s.summaryLabel}>total</span>
                </div>
                <div className={s.summaryStat}>
                  <span className={s.summaryValue}>{fmtHours(emp.avgDailyHours)}</span>
                  <span className={s.summaryLabel}>promedio</span>
                </div>
                {emp.extraMinutes > 0 && (
                  <div className={s.summaryStat}>
                    <span className={`${s.summaryValue} ${s.extra}`}>{fmtHours(emp.extraMinutes / 60)}</span>
                    <span className={s.summaryLabel}>extra</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Liquidar sueldo Cristian */}
      {!loading && report && (
        <div className={s.liqCard}>
          <div className={s.liqHeader}>
            <i className="bi bi-cash-coin"></i>
            <span>Liquidar sueldo — Cristian Baldovino</span>
          </div>
          {lastLiquidacion && (
            <div className={s.liqInfo}>
              Liquidado hasta: <strong>{new Date(lastLiquidacion + "T12:00:00").toLocaleDateString("es-AR")}</strong>
            </div>
          )}
          {liqHours > 0 ? (
            <div className={s.liqBody}>
              <div className={s.liqStats}>
                <div className={s.liqStat}>
                  <span className={s.liqValue}>{fmtHours(liqHours)}</span>
                  <span className={s.liqLabel}>horas</span>
                </div>
                <div className={s.liqStat}>
                  <span className={s.liqValue}>${PRECIO_HORA.toLocaleString("es-AR")}</span>
                  <span className={s.liqLabel}>por hora</span>
                </div>
                <div className={s.liqStat}>
                  <span className={`${s.liqValue} ${s.liqTotal}`}>${Math.round(liqHours * PRECIO_HORA).toLocaleString("es-AR")}</span>
                  <span className={s.liqLabel}>total</span>
                </div>
              </div>
              <div className={s.liqPeriod}>
                Periodo: {liqFrom && new Date(liqFrom + "T12:00:00").toLocaleDateString("es-AR")} — {liqTo && new Date(liqTo + "T12:00:00").toLocaleDateString("es-AR")}
              </div>
              <button className={s.liqBtn} onClick={handleLiquidar}>
                <i className="bi bi-check2-circle"></i> Liquidar y enviar a Caja
              </button>
            </div>
          ) : (
            <div className={s.liqEmpty}>No hay horas pendientes de liquidar</div>
          )}
        </div>
      )}

      {/* Calendar */}
      <div className={s.calendarCard}>
        {loading ? (
          <div className={s.loading}>Cargando...</div>
        ) : (
          <>
            <div className={s.calendarHeader}>
              {DAYS.map((d) => (
                <div key={d} className={s.dayHeader}>{d}</div>
              ))}
            </div>
            <div className={s.calendarGrid}>
              {calendarDays.map((day, i) => {
                if (!day) return <div key={i} className={s.dayEmpty}></div>;
                const data = getDayData(day);
                const dateStr = data?.dateStr;
                const hasWork = data && data.worked > 0;
                const today = isToday(day);
                const past = isPast(day);
                const selected = selectedDay === dateStr;
                const feriado = isFeriado(day);

                // Build diagonal gradient when 2 employees work same day
                let cellBg = undefined;
                if (hasWork && data.empDetails.length === 2) {
                  const c1 = empColorMap[data.empDetails[0].id] || "#6366f1";
                  const c2 = empColorMap[data.empDetails[1].id] || "#f59e0b";
                  cellBg = `linear-gradient(135deg, ${c1}22 0%, ${c1}22 50%, ${c2}22 50%, ${c2}22 100%)`;
                } else if (hasWork && data.empDetails.length === 1) {
                  const c = empColorMap[data.empDetails[0].id] || "#6366f1";
                  cellBg = `${c}18`;
                }

                return (
                  <div
                    key={i}
                    className={`${s.dayCell} ${today ? s.today : ""} ${selected ? s.selected : ""} ${!hasWork && past ? s.noWork : ""} ${feriado ? s.feriado : ""}`}
                    style={cellBg ? { background: cellBg } : undefined}
                    onClick={() => dateStr && handleDayClick(dateStr)}
                    title={feriado || ""}
                  >
                    <div className={s.dayTopRow}>
                      <span className={s.dayNum}>{day}</span>
                      {feriado && (
                        <span className={s.feriadoTag}>
                          <i className="bi bi-flag-fill"></i>
                        </span>
                      )}
                    </div>
                    {hasWork && (
                      <>
                        <div className={s.storeBar}>
                          <i className="bi bi-shop"></i>
                          <span>{data.storeOpen?.slice(0, 5)} — {data.storeClose?.slice(0, 5)}</span>
                        </div>
                        <div className={s.empRows}>
                          {data.empDetails.map((emp) => (
                            <div key={emp.id} className={s.empRow}>
                              <span className={s.empTag} style={{ background: empColorMap[emp.id], color: "#fff" }}>
                                {emp.name.split(" ")[0]}
                              </span>
                              <span className={s.empHrs} style={{ color: empColorMap[emp.id] }}>
                                {emp.firstIn?.slice(0, 5)}-{emp.lastOut?.slice(0, 5)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Daily detail */}
      {selectedDay && daily && (
        <div className={s.dailyCard}>
          <div className={s.dailyHeader}>
            <h3>
              <i className="bi bi-calendar-date"></i>{" "}
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
              {FERIADOS_2026[selectedDay] && (
                <span className={s.feriadoBadge}>
                  <i className="bi bi-flag-fill"></i> {FERIADOS_2026[selectedDay]}
                </span>
              )}
            </h3>
            <div className={s.dailyBadges}>
              <span className={s.badgePresent}>{daily.totalPresent} presentes</span>
              <span className={s.badgeAbsent}>{daily.totalAbsent} ausentes</span>
            </div>
          </div>

          {daily.present?.length > 0 && (
            <div className={s.dailySection}>
              <div className={s.dailySectionTitle}>Presentes</div>
              <div className={s.dailyList}>
                {daily.present
                  .filter((p) => selectedEmp === "all" || p.employeeId === selectedEmp)
                  .map((p) => (
                    <div key={p.employeeId} className={s.dailyRow} style={{ borderLeft: `3px solid ${empColorMap[p.employeeId] || "var(--accent)"}` }}>
                      <span className={s.dailyName}>
                        <i className="bi bi-check-circle-fill" style={{ color: empColorMap[p.employeeId] || "var(--success)" }}></i>{" "}
                        {p.employeeName}
                      </span>
                      <span className={s.dailyHours}>{fmtHours(p.hoursWorked)}</span>
                      <div className={s.dailyTimes}>
                        {p.records?.map((r, idx) => (
                          <span key={idx} className={`${s.timeBadge} ${r.type === "in" ? s.timeIn : s.timeOut}`}>
                            {r.type === "in" ? "Entrada" : "Salida"} {r.time?.slice(0, 5)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {daily.absent?.length > 0 && selectedEmp === "all" && (
            <div className={s.dailySection}>
              <div className={s.dailySectionTitle}>Ausentes</div>
              <div className={s.dailyList}>
                {daily.absent.map((a) => (
                  <div key={a.employeeId} className={s.dailyRow} style={{ borderLeft: `3px solid ${empColorMap[a.employeeId] || "var(--danger)"}` }}>
                    <span className={s.dailyName}>
                      <i className="bi bi-x-circle-fill" style={{ color: "var(--danger)" }}></i>{" "}
                      {a.employeeName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
