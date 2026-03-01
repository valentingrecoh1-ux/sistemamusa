import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import { NumericFormat } from "react-number-format";
import { socket } from "../main";
import moment from "moment";

import "react-datepicker/dist/react-datepicker.css";

function Reservas() {
  const [turno, setTurno] = useState({
    fecha: null,
    turno: "PRIMER TURNO",
    nombre: "",
    cantidad: "",
    telefono: "",
    observaciones: "",
  });
  const [turnos, setTurnos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [turnoClicked, setTurnoClicked] = useState({
    fecha: null,
    turno: "PRIMER TURNO",
    nombre: "",
    cantidad: "",
    observaciones: "",
    total: 0,
  });
  const [turnoData, setTurnoData] = useState({
    cobrado: 0,
    formaDeCobro: "EFECTIVO",
    facturado: false,
  });
  const [turnosOcupados, setTurnosOcupados] = useState([]);
  const [cantidad, setCantidad] = useState(12);
  const [openModal, setOpenModal] = useState(false);
  const [todos, setTodos] = useState(false);

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
    const cantidad = window.prompt(`Nueva cantidad para el color ${color}`);
    socket.emit("cambiar-cantidad-color", color, cantidad);
  };

  const fetchTurnos = (tod, t, s, p) => {
    socket.emit("request-turnos", tod, s, p);
    socket.emit("request-fechas-turnos", t);
    socket.emit("request-cantidad");
  };

  const editar = (t) => {
    const fecha = new Date(`${t.fecha}T00:00:00-03:00`);
    setTurno({
      ...t,
      fecha,
    });
  };

  const vender = () => {
    socket.emit("cobrar-turno", turnoClicked._id, turnoData);
    setOpenModal(false);
  };

  const deleteTurno = (t) => {
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

  const turnoClickeado = (t) => {
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

  useEffect(() => {
    socket.on("cambios", () => fetchTurnos(todos, turno.turno, search, page));
    socket.on("response-fechas-turnos", (to) => {
      setTurnosOcupados(to);
    });
    socket.on("response-turnos", (data) => {
      setTurnos(data.turnos);
      setTotalPages(data.totalPages);
      const totalCantidad = data.turnos.reduce(
        (sum, turno) => sum + (parseInt(turno.cantidad) || 0),
        0
      );
      const totalMonto = data.turnos.reduce(
        (sum, turno) => sum + (parseFloat(turno.total) || 0),
        0
      );
      setSumaCantidad(totalCantidad);
      setSumaMonto(totalMonto);
    });
    socket.on("response-cantidad", (cant) => {
      setCantidad(cant);
    });
    fetchTurnos(todos, turno.turno, search, page);
    return () => {
      socket.off("cambios");
      socket.off("response-fechas-turnos");
      socket.off("response-turnos");
      socket.off("response-cantidad");
    };
  }, [turno, page, search, todos]);

  return (
    <div className="inventario-container">
      <div
        onClick={() => cambiarCantidadColor("rojo")}
        className="cuadrado-rojo"
      >
        {cantidad.rojo}
      </div>
      <div
        onClick={() => cambiarCantidadColor("amarillo")}
        className="cuadrado-amarillo"
      >
        {cantidad.amarillo}
      </div>
      <div className="formulario-container">
        <form
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          className="formulario"
        >
          <div className="form-group">
            <label>Turno</label>
            <select
              value={turno.turno}
              onChange={handleChange}
              name="turno"
              id="turno"
            >
              <option value="PRIMER TURNO">PRIMER TURNO</option>
              <option value="SEGUNDO TURNO">SEGUNDO TURNO</option>
            </select>
          </div>
          <div className="form-group">
            <label>Fecha</label>
            <DatePicker
              placeholderText="DD-MM-YYYY"
              dateFormat="dd-MM-yyyy"
              selected={turno.fecha}
              onChange={(date) => handleFecha(date)}
              dayClassName={(date) => {
                const turnoEncontrado = turnosOcupados.find((t) => {
                  return (
                    new Date(
                      `${t.fecha}T03:00:00.000Z`
                    ).toLocaleDateString() === date.toLocaleDateString()
                  );
                });
                if (turnoEncontrado) {
                  // Aplicar la lógica de cantidad
                  if (turnoEncontrado.cantidad >= cantidad.rojo) {
                    return "rojo";
                  } else if (turnoEncontrado.cantidad >= cantidad.amarillo) {
                    return "amarillo";
                  } else {
                    return "verde";
                  }
                }
                return ""; // Si no se encuentra ningún turno coincidente
              }}
            />
          </div>
          <div className="form-group">
            <label>Nombre</label>
            <input
              type="text"
              id="nombre"
              name="nombre"
              value={turno.nombre}
              onChange={handleChange}
              autoCapitalize="words"
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label>Cantidad</label>
            <input
              type="text"
              id="cantidad"
              name="cantidad"
              value={turno.cantidad}
              onChange={handleChange}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label>Telefono</label>
            <input
              type="text"
              id="telefono"
              name="telefono"
              value={turno.telefono}
              onChange={handleChange}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label>Observaciones</label>
            <textarea
              id="observaciones"
              name="observaciones"
              value={turno.observaciones}
              onChange={handleChange}
              autoComplete="off"
            ></textarea>
          </div>
          <div className="form-group">
            <label>Monto a pagar</label>
            <NumericFormat
              prefix="$"
              value={turno.total}
              thousandSeparator="."
              decimalSeparator=","
              onValueChange={(e) => handleTotalChange(e.floatValue)}
            />
          </div>
          <div className="form-group">
            <button className="generar-codigo" type="submit">
              Guardar
            </button>
          </div>
        </form>
      </div>
      <div className="tabla-container">
        <div className="buscador">
          <button className="proximos" onClick={toggleTurnos}>
            {todos ? "TODOS" : "PROXIMOS"}
          </button>
          <input
            type="text"
            placeholder="Buscar reserva..."
            value={search}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
          />
          <div className="paginacion">
            <button
              className="flechas-paginacion"
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
            >
              <i className="bi bi-arrow-left-circle"></i>
            </button>
            <span>
              {page} de {totalPages}
            </span>
            <button
              className="flechas-paginacion"
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
            >
              <i className="bi bi-arrow-right-circle"></i>
            </button>
          </div>
        </div>
        <div className="tabla-productos">
          <table>
            <thead>
              <tr className="titulos-tabla">
                <th>Fecha</th>
                <th>Turno</th>
                <th>Nombre</th>
                <th>
                  Cantidad <br />({sumaCantidad})
                </th>
                <th>Telefono</th>
                <th>Observaciones</th>
                <th>
                  Monto a pagar <br />
                  (${sumaMonto.toLocaleString("es-AR")})
                </th>
                <th>Cobrado</th>
                <th></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {turnos?.map((turno) => (
                <tr key={turno._id}>
                  <td
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde"
                        : turno.cobrado
                        ? "fila-amarilla"
                        : ""
                    }
                  >
                    {turno.fecha}
                  </td>
                  <td
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde"
                        : turno.cobrado
                        ? "fila-amarilla"
                        : ""
                    }
                  >
                    {turno.turno}
                  </td>
                  <td
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde"
                        : turno.cobrado
                        ? "fila-amarilla"
                        : ""
                    }
                  >
                    {turno.nombre}
                  </td>
                  <td
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde"
                        : turno.cobrado
                        ? "fila-amarilla"
                        : ""
                    }
                  >
                    {turno.cantidad}
                  </td>
                  <td
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde"
                        : turno.cobrado
                        ? "fila-amarilla"
                        : ""
                    }
                    onClick={() =>
                      window.open(
                        `https://wa.me/549${turno.telefono}`,
                        "_blank"
                      )
                    }
                  >
                    {turno.telefono}
                  </td>
                  <td
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde"
                        : turno.cobrado
                        ? "fila-amarilla"
                        : ""
                    }
                  >
                    {turno.observaciones}
                  </td>
                  <td
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde"
                        : turno.cobrado
                        ? "fila-amarilla"
                        : ""
                    }
                  >
                    {!turno.total ? (
                      "$0"
                    ) : (
                      <NumericFormat
                        prefix="$"
                        displayType="text"
                        value={turno.total}
                        thousandSeparator="."
                        decimalSeparator=","
                      />
                    )}
                  </td>
                  <td
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde"
                        : turno.cobrado
                        ? "fila-amarilla"
                        : ""
                    }
                  >
                    {!turno.cobrado ? (
                      "$0"
                    ) : (
                      <NumericFormat
                        prefix="$"
                        displayType="text"
                        value={turno.cobrado}
                        thousandSeparator="."
                        decimalSeparator=","
                      />
                    )}
                  </td>
                  <td
                    onClick={() => editar(turno)}
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde editar"
                        : turno.cobrado
                        ? "fila-amarilla editar"
                        : "editar"
                    }
                  >
                    <i className="bi bi-pencil-square"></i>
                  </td>
                  <td
                    onClick={() => turnoClickeado(turno)}
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde editar"
                        : turno.cobrado
                        ? "fila-amarilla editar"
                        : "editar"
                    }
                  >
                    <i className="bi bi-cash-coin"></i>
                  </td>
                  <td
                    onClick={() => deleteTurno(turno)}
                    className={
                      turno.cobrado === turno.total
                        ? "fila-verde editar"
                        : turno.cobrado
                        ? "fila-amarilla editar"
                        : "editar"
                    }
                  >
                    <i className="bi bi-trash3-fill"></i>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {openModal && (
        <div className="modal" tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  COBRAR TURNO - {turnoClicked.nombre}
                </h5>
              </div>
              <div className="modal-body">
                <div>
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
                    name="formapago"
                    id="formapago"
                  >
                    <option value="EFECTIVO">EFECTIVO</option>
                    <option value="DIGITAL">DIGITAL</option>
                  </select>
                </div>
                {turnoData.formaDeCobro === "EFECTIVO" && (
                  <label className="toggle-switch-label">
                    <input
                      onChange={(e) =>
                        setTurnoData((prev) => ({
                          ...prev,
                          facturado: e.target.checked,
                        }))
                      }
                      checked={turnoData.facturado}
                      type="checkbox"
                    />
                    <span>Facturar</span>
                    <div className="toggle-switch-track" />
                  </label>
                )}
                <div>
                  <NumericFormat
                    onValueChange={(e) => changeHandler(e.floatValue)}
                    className="input-turno"
                    prefix="$"
                    value={turnoData.cobrado}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  onClick={() => setOpenModal(false)}
                  type="button"
                  className="btn btn-secondary"
                  data-bs-dismiss="modal"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => vender()}
                  type="button"
                  className="btn btn-primary"
                >
                  Guardar
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
