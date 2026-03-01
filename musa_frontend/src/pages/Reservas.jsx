import React, { useState, useEffect } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale/es";
import { NumericFormat } from "react-number-format";
import { socket } from "../main";
import Pagination from "../components/shared/Pagination";
import s from "./Reservas.module.css";

import "react-datepicker/dist/react-datepicker.css";

registerLocale("es", es);

function Reservas() {
  const [turno, setTurno] = useState({
    fecha: null,
    turno: "PRIMER TURNO",
    nombre: "",
    cantidad: "",
    telefono: "",
    observaciones: "",
    total: 0,
  });
  const [turnos, setTurnos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [turnoClicked, setTurnoClicked] = useState(null);
  const [turnoData, setTurnoData] = useState({
    cobrado: 0,
    formaDeCobro: "EFECTIVO",
    facturado: false,
  });
  const [turnosOcupados, setTurnosOcupados] = useState([]);
  const [cantidad, setCantidad] = useState({ rojo: 12, amarillo: 8 });
  const [openModal, setOpenModal] = useState(false);
  const [todos, setTodos] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [sumaCantidad, setSumaCantidad] = useState(0);
  const [sumaMonto, setSumaMonto] = useState(0);

  const handleKeyDown = (e) => {
    if (e.target.name !== "observaciones") {
      if (e.key === "Enter") {
        e.preventDefault();
        e.target.select();
      }
    }
  };

  const handleChange = (e) => {
    if (e.target.name === "cantidad" || e.target.name === "telefono") {
      const numericValue = e.target.value.replace(/[^0-9]/g, "");
      setTurno((prev) => ({
        ...prev,
        [e.target.name]: numericValue,
      }));
    } else {
      setTurno((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    }
  };

  const handleTotalChange = (value) => {
    setTurno((prev) => ({
      ...prev,
      total: value,
    }));
  };

  const handleFecha = (e) => {
    setTurno((prev) => ({ ...prev, fecha: e }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    socket.emit("guardar-turno", turno);
    setTurno({
      fecha: null,
      turno: "PRIMER TURNO",
      nombre: "",
      cantidad: "",
      telefono: "",
      observaciones: "",
      total: 0,
    });
    setEditingId(null);
  };

  const cancelarEdicion = () => {
    setTurno({
      fecha: null,
      turno: "PRIMER TURNO",
      nombre: "",
      cantidad: "",
      telefono: "",
      observaciones: "",
      total: 0,
    });
    setEditingId(null);
  };

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const cambiarCantidadColor = (color) => {
    const cant = window.prompt(`Nueva cantidad para el color ${color}`);
    if (cant) socket.emit("cambiar-cantidad-color", color, cant);
  };

  const fetchTurnos = () => {
    socket.emit("request-turnos", todos, search, page);
    socket.emit("request-fechas-turnos", turno.turno);
    socket.emit("request-cantidad");
  };

  const editar = (t, e) => {
    e.stopPropagation();
    const fecha = new Date(`${t.fecha}T00:00:00-03:00`);
    setTurno({ ...t, fecha });
    setEditingId(t._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const vender = () => {
    socket.emit("cobrar-turno", turnoClicked._id, turnoData);
    setOpenModal(false);
  };

  const deleteTurno = (t, e) => {
    e.stopPropagation();
    if (
      window.confirm(
        `¿Estas seguro que quieres borrar el turno de ${t.nombre}?`
      )
    ) {
      socket.emit("borrar-turno", t._id);
    }
  };

  const changeHandler = (value) => {
    setTurnoData((prev) => ({
      ...prev,
      cobrado: value,
    }));
  };

  const turnoClickeado = (t, e) => {
    e.stopPropagation();
    setTurnoClicked(t);
    setTurnoData({
      cobrado: 0,
      formaDeCobro: "EFECTIVO",
      facturado: false,
    });
    setOpenModal(true);
  };

  const toggleTurnos = () => {
    setTodos((prev) => !prev);
  };

  const formatFecha = (fecha) => {
    if (!fecha) return "";
    const parts = fecha.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return fecha;
  };

  useEffect(() => {
    socket.on("cambios", () => fetchTurnos());
    socket.on("response-fechas-turnos", (to) => {
      setTurnosOcupados(to);
    });
    socket.on("response-turnos", (data) => {
      setTurnos(data.turnos);
      setTotalPages(data.totalPages);
      const totalCantidad = data.turnos.reduce(
        (sum, t) => sum + (parseInt(t.cantidad) || 0),
        0
      );
      const totalMonto = data.turnos.reduce(
        (sum, t) => sum + (parseFloat(t.total) || 0),
        0
      );
      setSumaCantidad(totalCantidad);
      setSumaMonto(totalMonto);
    });
    socket.on("response-cantidad", (cant) => {
      setCantidad(cant);
    });
    fetchTurnos();
    return () => {
      socket.off("cambios");
      socket.off("response-fechas-turnos");
      socket.off("response-turnos");
      socket.off("response-cantidad");
    };
  }, [turno.turno, page, search, todos]);

  const getRowClass = (t) => {
    if (t.cobrado && t.cobrado >= t.total && t.total > 0) return s.rowPaid;
    if (t.cobrado > 0) return s.rowPartial;
    return "";
  };

  const getStatusBadge = (t) => {
    if (t.cobrado && t.cobrado >= t.total && t.total > 0)
      return <span className={`${s.statusBadge} ${s.statusPaid}`}>Pagado</span>;
    if (t.cobrado > 0)
      return <span className={`${s.statusBadge} ${s.statusPartial}`}>Parcial</span>;
    if (t.total > 0)
      return <span className={`${s.statusBadge} ${s.statusPending}`}>Pendiente</span>;
    return <span className={`${s.statusBadge} ${s.statusNone}`}>—</span>;
  };

  return (
    <div className={s.container}>
      {/* ── Form card ── */}
      <div className={s.formCard}>
        <div className={s.formHeader}>
          <i className={`bi ${editingId ? "bi-pencil-square" : "bi-calendar-plus"}`}></i>
          <span>{editingId ? "Editar reserva" : "Nueva reserva"}</span>
          {editingId && (
            <button className={s.cancelEditBtn} onClick={cancelarEdicion} title="Cancelar edición">
              <i className="bi bi-x-lg"></i>
            </button>
          )}
          <div className={s.colorSquares}>
            <button
              className={s.colorSquareRojo}
              onClick={() => cambiarCantidadColor("rojo")}
              title="Límite rojo (lleno)"
            >
              {cantidad.rojo}
            </button>
            <button
              className={s.colorSquareAmarillo}
              onClick={() => cambiarCantidadColor("amarillo")}
              title="Límite amarillo (casi lleno)"
            >
              {cantidad.amarillo}
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className={s.form}>
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label>Turno</label>
              <select
                value={turno.turno}
                onChange={handleChange}
                name="turno"
              >
                <option value="PRIMER TURNO">PRIMER TURNO</option>
                <option value="SEGUNDO TURNO">SEGUNDO TURNO</option>
              </select>
            </div>
            <div className={s.formGroup}>
              <label>Fecha</label>
              <DatePicker
                placeholderText="DD-MM-YYYY"
                dateFormat="dd-MM-yyyy"
                selected={turno.fecha}
                onChange={(date) => handleFecha(date)}
                className={s.dateInput}
                locale="es"
                calendarStartDay={1}
                dayClassName={(date) => {
                  const turnoEncontrado = turnosOcupados.find((t) => {
                    return (
                      new Date(
                        `${t.fecha}T03:00:00.000Z`
                      ).toLocaleDateString() === date.toLocaleDateString()
                    );
                  });
                  if (turnoEncontrado) {
                    if (turnoEncontrado.cantidad >= cantidad.rojo) return "rojo";
                    if (turnoEncontrado.cantidad >= cantidad.amarillo) return "amarillo";
                    return "verde";
                  }
                  return "";
                }}
              />
            </div>
            <div className={s.formGroup}>
              <label>Nombre</label>
              <input
                type="text"
                name="nombre"
                value={turno.nombre}
                onChange={handleChange}
                autoCapitalize="words"
                autoComplete="off"
              />
            </div>
            <div className={s.formGroup}>
              <label>Cantidad</label>
              <input
                type="text"
                name="cantidad"
                value={turno.cantidad}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
          </div>
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label>Telefono</label>
              <input
                type="text"
                name="telefono"
                value={turno.telefono}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
            <div className={s.formGroup}>
              <label>Monto a pagar</label>
              <NumericFormat
                className={s.priceInput}
                prefix="$"
                value={turno.total}
                thousandSeparator="."
                decimalSeparator=","
                onValueChange={(e) => handleTotalChange(e.floatValue)}
              />
            </div>
            <div className={s.formGroup}>
              <label>Observaciones</label>
              <input
                type="text"
                name="observaciones"
                value={turno.observaciones}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
            <div className={s.formGroupBtn}>
              <button className={s.saveBtn} type="submit">
                <i className={`bi ${editingId ? "bi-check-lg" : "bi-plus-lg"}`}></i>
                {editingId ? "Guardar cambios" : "Agregar reserva"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Stats bar ── */}
      <div className={s.statsBar}>
        <div className={s.statItem}>
          <i className="bi bi-people"></i>
          <span className={s.statValue}>{sumaCantidad}</span>
          <span className={s.statLabel}>personas</span>
        </div>
        <div className={s.statItem}>
          <i className="bi bi-cash-stack"></i>
          <span className={s.statValue}>
            <NumericFormat
              prefix="$"
              displayType="text"
              value={sumaMonto}
              thousandSeparator="."
              decimalSeparator=","
            />
          </span>
          <span className={s.statLabel}>monto total</span>
        </div>
      </div>

      {/* ── Search + controls ── */}
      <div className={s.searchBar}>
        <button
          className={`${s.toggleBtn} ${todos ? s.toggleActive : ""}`}
          onClick={toggleTurnos}
          title={todos ? "Mostrando todos" : "Mostrando próximos"}
        >
          <i className={`bi ${todos ? "bi-calendar-range" : "bi-calendar-check"}`}></i>
          {todos ? "Todos" : "Próximos"}
        </button>
        <div className={s.searchWrap}>
          <i className={`bi bi-search ${s.searchIcon}`}></i>
          <input
            className={s.searchInput}
            type="text"
            placeholder="Buscar por nombre o fecha..."
            value={search}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Pagination
          className={s.paginationDock}
          page={page}
          totalPages={totalPages}
          onChange={handlePageChange}
        />
      </div>

      {/* ── Table ── */}
      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Turno</th>
              <th className={s.thNombre}>Nombre</th>
              <th>Cant.</th>
              <th>Telefono</th>
              <th>Observaciones</th>
              <th>Monto</th>
              <th>Cobrado</th>
              <th>Estado</th>
              <th className={s.thActions}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {turnos?.map((t) => (
              <tr key={t._id} className={getRowClass(t)}>
                <td>
                  <span className={s.fechaBadge}>
                    <i className="bi bi-calendar3"></i>
                    {formatFecha(t.fecha)}
                  </span>
                </td>
                <td>
                  <span className={`${s.turnoBadge} ${t.turno === "PRIMER TURNO" ? s.turno1 : s.turno2}`}>
                    {t.turno === "PRIMER TURNO" ? "1er turno" : "2do turno"}
                  </span>
                </td>
                <td className={s.nombreCell}>{t.nombre}</td>
                <td>
                  <span className={s.cantidadBadge}>{t.cantidad}</span>
                </td>
                <td>
                  {t.telefono ? (
                    <button
                      className={s.telefonoBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`https://wa.me/549${t.telefono}`, "_blank");
                      }}
                      title="Abrir WhatsApp"
                    >
                      <i className="bi bi-whatsapp"></i>
                      {t.telefono}
                    </button>
                  ) : (
                    <span className={s.textMuted}>—</span>
                  )}
                </td>
                <td className={s.obsCell}>{t.observaciones || <span className={s.textMuted}>—</span>}</td>
                <td className={s.montoCell}>
                  {t.total ? (
                    <NumericFormat
                      prefix="$"
                      displayType="text"
                      value={t.total}
                      thousandSeparator="."
                      decimalSeparator=","
                    />
                  ) : (
                    <span className={s.textMuted}>$0</span>
                  )}
                </td>
                <td className={s.montoCell}>
                  {t.cobrado ? (
                    <NumericFormat
                      prefix="$"
                      displayType="text"
                      value={t.cobrado}
                      thousandSeparator="."
                      decimalSeparator=","
                    />
                  ) : (
                    <span className={s.textMuted}>$0</span>
                  )}
                </td>
                <td>{getStatusBadge(t)}</td>
                <td className={s.actionsCell}>
                  <button
                    className={`${s.actionBtn} ${s.actionEditBtn}`}
                    onClick={(e) => editar(t, e)}
                    title="Editar reserva"
                  >
                    <i className="bi bi-pencil-square"></i>
                  </button>
                  <button
                    className={`${s.actionBtn} ${s.actionChargeBtn}`}
                    onClick={(e) => turnoClickeado(t, e)}
                    title="Cobrar turno"
                  >
                    <i className="bi bi-cash-coin"></i>
                  </button>
                  <button
                    className={`${s.actionBtn} ${s.actionDeleteBtn}`}
                    onClick={(e) => deleteTurno(t, e)}
                    title="Eliminar reserva"
                  >
                    <i className="bi bi-trash3-fill"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        className={s.paginationBottom}
        page={page}
        totalPages={totalPages}
        onChange={handlePageChange}
      />

      {/* ── Modal cobrar turno ── */}
      {openModal && turnoClicked && (
        <div className={s.modalOverlay} onClick={() => setOpenModal(false)}>
          <div className={s.modalBody} onClick={(e) => e.stopPropagation()}>
            <button className={s.closeBtn} onClick={() => setOpenModal(false)}>
              <i className="bi bi-x-lg"></i>
            </button>

            <div className={s.modalInfo}>
              <div className={s.modalTitle}>
                <i className="bi bi-cash-coin"></i>
                Cobrar turno
              </div>
              <div className={s.modalClientInfo}>
                <span className={s.modalClientName}>{turnoClicked.nombre}</span>
                <span className={s.modalClientDetail}>
                  {formatFecha(turnoClicked.fecha)} — {turnoClicked.turno === "PRIMER TURNO" ? "1er turno" : "2do turno"}
                </span>
              </div>

              {turnoClicked.total > 0 && (
                <div className={s.modalMontoInfo}>
                  <div className={s.modalMontoRow}>
                    <span>Total</span>
                    <NumericFormat
                      prefix="$"
                      displayType="text"
                      value={turnoClicked.total}
                      thousandSeparator="."
                      decimalSeparator=","
                    />
                  </div>
                  <div className={s.modalMontoRow}>
                    <span>Cobrado</span>
                    <NumericFormat
                      prefix="$"
                      displayType="text"
                      value={turnoClicked.cobrado || 0}
                      thousandSeparator="."
                      decimalSeparator=","
                    />
                  </div>
                  {turnoClicked.total - (turnoClicked.cobrado || 0) > 0 && (
                    <div className={`${s.modalMontoRow} ${s.modalMontoRestante}`}>
                      <span>Restante</span>
                      <NumericFormat
                        prefix="$"
                        displayType="text"
                        value={turnoClicked.total - (turnoClicked.cobrado || 0)}
                        thousandSeparator="."
                        decimalSeparator=","
                      />
                    </div>
                  )}
                </div>
              )}

              <div className={s.modalFormGroup}>
                <label>Forma de pago</label>
                <select
                  value={turnoData.formaDeCobro}
                  onChange={(e) => {
                    if (e.target.value === "EFECTIVO") {
                      setTurnoData((prev) => ({
                        ...prev,
                        formaDeCobro: e.target.value,
                        facturado: false,
                      }));
                    } else if (e.target.value === "DIGITAL") {
                      setTurnoData((prev) => ({
                        ...prev,
                        formaDeCobro: e.target.value,
                        facturado: true,
                      }));
                    }
                  }}
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="DIGITAL">Digital</option>
                </select>
              </div>

              {turnoData.formaDeCobro === "EFECTIVO" && (
                <label className={s.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={turnoData.facturado}
                    onChange={(e) =>
                      setTurnoData((prev) => ({
                        ...prev,
                        facturado: e.target.checked,
                      }))
                    }
                  />
                  <span>Facturar</span>
                  <div className={s.toggleTrack} />
                </label>
              )}

              <div className={s.modalFormGroup}>
                <label>Monto a cobrar</label>
                <NumericFormat
                  onValueChange={(e) => changeHandler(e.floatValue)}
                  className={s.modalMontoInput}
                  prefix="$"
                  value={turnoData.cobrado}
                  thousandSeparator="."
                  decimalSeparator=","
                  autoFocus
                />
              </div>

              <div className={s.modalActions}>
                <button
                  onClick={() => setOpenModal(false)}
                  type="button"
                  className={s.modalBtnSecondary}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => vender()}
                  type="button"
                  className={s.modalBtnPrimary}
                >
                  <i className="bi bi-check-lg"></i>
                  Cobrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reservas;
