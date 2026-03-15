import { useState, useEffect, useCallback } from "react";
import s from "./Asistencia.module.css";

const API = "https://asistencia.musavinos.com/api/musa";

const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const fmtHours = (h) => {
  if (!h) return "0hs";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}hs`;
};

export default function Asistencia() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [report, setReport] = useState(null);
  const [daily, setDaily] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState("all");
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(false);

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
      setReport(repData);
      setEmployees(empData.employees || []);
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

  const fetchDaily = async (dateStr) => {
    try {
      const res = await fetch(`${API}/schedules/daily?date=${dateStr}`);
      const data = await res.json();
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

  // Get employee data for calendar
  const filteredEmployees = report?.employees?.filter(
    (e) => selectedEmp === "all" || e.employeeId === selectedEmp
  ) || [];

  const getDayData = (day) => {
    if (!day) return null;
    const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
    let totalHours = 0;
    let worked = 0;
    filteredEmployees.forEach((emp) => {
      const dd = emp.dailyDetails?.[dateStr];
      if (dd && dd.totalHours > 0) {
        totalHours += dd.totalHours;
        worked++;
      }
    });
    return { totalHours, worked, dateStr };
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
        <select
          className={s.empSelect}
          value={selectedEmp}
          onChange={(e) => setSelectedEmp(e.target.value)}
        >
          <option value="all">Todos los empleados</option>
          {employees.map((emp) => (
            <option key={emp.employeeId} value={emp.employeeId}>
              {emp.name}
            </option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      {!loading && report && (
        <div className={s.summaryRow}>
          {filteredEmployees.map((emp) => (
            <div key={emp.employeeId} className={s.summaryCard}>
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

                return (
                  <div
                    key={i}
                    className={`${s.dayCell} ${today ? s.today : ""} ${selected ? s.selected : ""} ${hasWork ? s.worked : past ? s.noWork : ""}`}
                    onClick={() => dateStr && handleDayClick(dateStr)}
                  >
                    <span className={s.dayNum}>{day}</span>
                    {hasWork && (
                      <div className={s.dayInfo}>
                        <span className={s.dayHours}>{fmtHours(data.totalHours)}</span>
                        {selectedEmp === "all" && data.worked > 0 && (
                          <span className={s.dayCount}>{data.worked} emp</span>
                        )}
                      </div>
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
                    <div key={p.employeeId} className={s.dailyRow}>
                      <span className={s.dailyName}>
                        <i className="bi bi-check-circle-fill" style={{ color: "var(--success)" }}></i>{" "}
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
                  <div key={a.employeeId} className={s.dailyRow}>
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
