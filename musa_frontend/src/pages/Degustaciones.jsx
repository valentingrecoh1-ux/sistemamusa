import React, { useState, useEffect } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale/es";
import { NumericFormat } from "react-number-format";
import { socket } from "../main";
import Pagination from "../components/shared/Pagination";
import { dialog } from "../components/shared/dialog";
import s from "./Degustaciones.module.css";

import "react-datepicker/dist/react-datepicker.css";

registerLocale("es", es);

function Degustaciones() {
  const emptyForm = {
    fecha: null,
    nombre: "",
    descripcion: "",
    cantidadPersonas: "",
    vinosUsados: [],
    observaciones: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [degustaciones, setDegustaciones] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);

  // Vino search
  const [vinoBusqueda, setVinoBusqueda] = useState("");
  const [vinoResultados, setVinoResultados] = useState([]);

  // Stats
  const [totalPersonas, setTotalPersonas] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);

  const calcCostoVinos = (vinos) =>
    (vinos || []).reduce((sum, v) => sum + (parseFloat(v.precioVenta) || 0), 0);

  // Calculo de profit con datos vinculados
  const calcProfit = (d) => {
    const ingreso = (d.ingresoReservas || 0) + (d.totalIngresosCaja || 0);
    const costoVinos = calcCostoVinos(d.vinosUsados);
    const gastos = d.totalGastosCaja || 0;
    return ingreso - costoVinos - gastos;
  };

  const calcTotalIngreso = (d) => (d.ingresoReservas || 0) + (d.totalIngresosCaja || 0);
  const calcTotalGastos = (d) => (d.totalGastosCaja || 0);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "cantidadPersonas") {
      setForm((prev) => ({ ...prev, [name]: value.replace(/[^0-9]/g, "") }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFecha = (date) => {
    setForm((prev) => ({ ...prev, fecha: date }));
  };

  const buscarVino = (val) => {
    setVinoBusqueda(val);
    if (val.length >= 2) {
      socket.emit("buscar-producto-degustacion", val);
    } else {
      setVinoResultados([]);
    }
  };

  const agregarVino = (prod) => {
    const yaExiste = form.vinosUsados.some((v) => v.codigo === prod.codigo);
    if (yaExiste) return;
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
    setVinoBusqueda("");
    setVinoResultados([]);
  };

  const quitarVino = (idx) => {
    setForm((prev) => ({
      ...prev,
      vinosUsados: prev.vinosUsados.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    socket.emit("guardar-degustacion", form);
    setForm(emptyForm);
    setEditingId(null);
  };

  const cancelarEdicion = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const editar = (d, e) => {
    e.stopPropagation();
    const fecha = d.fecha ? new Date(`${d.fecha}T00:00:00-03:00`) : null;
    setForm({
      _id: d._id,
      fecha,
      nombre: d.nombre,
      descripcion: d.descripcion,
      cantidadPersonas: d.cantidadPersonas,
      vinosUsados: d.vinosUsados || [],
      observaciones: d.observaciones,
    });
    setEditingId(d._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminar = async (d, e) => {
    e.stopPropagation();
    if (await dialog.confirm(`Eliminar la degustacion "${d.nombre}"?`)) {
      socket.emit("borrar-degustacion", d._id);
    }
  };

  const verDetalle = (d) => {
    setModalData(d);
    setShowModal(true);
  };

  const formatFecha = (fecha) => {
    if (!fecha) return "";
    const parts = fecha.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return fecha;
  };

  const fetchDegustaciones = () => {
    socket.emit("request-degustaciones", search, page);
  };

  useEffect(() => {
    socket.on("cambios", () => fetchDegustaciones());
    socket.on("response-degustaciones", (data) => {
      setDegustaciones(data.degustaciones);
      setTotalPages(data.totalPages);
      const personas = data.degustaciones.reduce(
        (sum, d) => sum + (parseInt(d.cantidadPersonas) || 0),
        0
      );
      const profit = data.degustaciones.reduce(
        (sum, d) => sum + calcProfit(d),
        0
      );
      setTotalPersonas(personas);
      setTotalProfit(profit);
    });
    socket.on("response-buscar-producto-degustacion", (productos) => {
      setVinoResultados(productos);
    });

    fetchDegustaciones();

    return () => {
      socket.off("cambios");
      socket.off("response-degustaciones");
      socket.off("response-buscar-producto-degustacion");
    };
  }, [page, search]);

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

  const profitBadge = (d) => {
    const p = calcProfit(d);
    if (p > 0) return <span className={`${s.profitBadge} ${s.profitPositive}`}>+<NumericFormat prefix="$" displayType="text" value={p} thousandSeparator="." decimalSeparator="," /></span>;
    if (p < 0) return <span className={`${s.profitBadge} ${s.profitNegative}`}><NumericFormat prefix="-$" displayType="text" value={Math.abs(p)} thousandSeparator="." decimalSeparator="," /></span>;
    return <span className={`${s.profitBadge} ${s.profitZero}`}>$0</span>;
  };

  return (
    <div className={s.container}>
      {/* ── Form card ── */}
      <div className={s.formCard}>
        <div className={s.formHeader}>
          <i className={`bi ${editingId ? "bi-pencil-square" : "bi-cup-straw"}`}></i>
          <span>{editingId ? "Editar degustacion" : "Nueva degustacion"}</span>
          {editingId && (
            <button className={s.cancelEditBtn} onClick={cancelarEdicion} title="Cancelar edicion">
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
              <input
                type="text"
                name="nombre"
                value={form.nombre}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
            <div className={s.formGroup}>
              <label>Personas</label>
              <input
                type="text"
                name="cantidadPersonas"
                value={form.cantidadPersonas}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
            <div className={s.formGroupBtn}>
              <button className={s.saveBtn} type="submit">
                <i className={`bi ${editingId ? "bi-check-lg" : "bi-plus-lg"}`}></i>
                {editingId ? "Guardar cambios" : "Agregar"}
              </button>
            </div>
          </div>
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label>Descripcion</label>
              <input
                type="text"
                name="descripcion"
                value={form.descripcion}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
            <div className={s.formGroup}>
              <label>Observaciones</label>
              <input
                type="text"
                name="observaciones"
                value={form.observaciones}
                onChange={handleChange}
                autoComplete="off"
              />
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
                placeholder="Buscar vino por nombre, codigo o bodega..."
                value={vinoBusqueda}
                onChange={(e) => buscarVino(e.target.value)}
              />
              {vinoResultados.length > 0 && (
                <div className={s.vinoDropdown}>
                  {vinoResultados.map((prod) => (
                    <div
                      key={prod._id}
                      className={s.vinoDropdownItem}
                      onClick={() => agregarVino(prod)}
                    >
                      <span className={s.vinoDropdownName}>{prod.nombre}</span>
                      <span className={s.vinoDropdownDetail}>
                        {prod.bodega} — {prod.cepa}
                      </span>
                      <span className={s.vinoDropdownCode}>
                        <i className="bi bi-upc-scan"></i> {prod.codigo}
                      </span>
                      <span className={s.vinoDropdownPrice}>
                        <NumericFormat prefix="$" displayType="text" value={prod.venta} thousandSeparator="." decimalSeparator="," />
                      </span>
                    </div>
                  ))}
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
                  Costo vinos: <NumericFormat prefix="$" displayType="text" value={calcCostoVinos(form.vinosUsados)} thousandSeparator="." decimalSeparator="," />
                </div>
              </div>
            )}
          </div>

          {/* Info: gastos e ingresos se vinculan desde caja */}
          <div className={s.linkInfo}>
            <i className="bi bi-link-45deg"></i>
            Los ingresos se toman automaticamente de las reservas del mismo dia. Los gastos se vinculan desde Caja.
          </div>
        </form>
      </div>

      {/* ── Stats bar ── */}
      <div className={s.statsBar}>
        <div className={s.statItem}>
          <i className="bi bi-cup-straw"></i>
          <span className={s.statValue}>{degustaciones.length}</span>
          <span className={s.statLabel}>eventos</span>
        </div>
        <div className={s.statItem}>
          <i className="bi bi-people"></i>
          <span className={s.statValue}>{totalPersonas}</span>
          <span className={s.statLabel}>personas</span>
        </div>
        <div className={s.statItem}>
          <i className={`bi ${totalProfit >= 0 ? "bi-graph-up-arrow" : "bi-graph-down-arrow"}`}></i>
          <span className={`${s.statValue} ${totalProfit >= 0 ? s.statPositive : s.statNegative}`}>
            <NumericFormat prefix="$" displayType="text" value={Math.abs(totalProfit)} thousandSeparator="." decimalSeparator="," />
          </span>
          <span className={s.statLabel}>{totalProfit >= 0 ? "ganancia" : "perdida"}</span>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className={s.searchBar}>
        <div className={s.searchWrap}>
          <i className={`bi bi-search ${s.searchIcon}`}></i>
          <input
            className={s.searchInput}
            type="text"
            placeholder="Buscar por nombre, fecha o descripcion..."
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
              <th className={s.thNombre}>Evento</th>
              <th>Personas</th>
              <th>Ingreso</th>
              <th>Costo vinos</th>
              <th>Gastos</th>
              <th>Resultado</th>
              <th className={s.thActions}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {degustaciones?.map((d) => (
              <tr key={d._id} className={s.clickableRow} onClick={() => verDetalle(d)}>
                <td>
                  <span className={s.fechaBadge}>
                    <i className="bi bi-calendar3"></i>
                    {formatFecha(d.fecha)}
                  </span>
                </td>
                <td className={s.nombreCell}>
                  <div className={s.nombreInfo}>
                    <span className={s.nombreText}>{d.nombre}</span>
                    {d.descripcion && <span className={s.descripcionText}>{d.descripcion}</span>}
                  </div>
                </td>
                <td>
                  <span className={s.cantidadBadge}>{d.cantidadPersonas || 0}</span>
                </td>
                <td className={s.montoCell}>
                  <NumericFormat prefix="$" displayType="text" value={calcTotalIngreso(d)} thousandSeparator="." decimalSeparator="," />
                </td>
                <td className={s.montoCell}>
                  <NumericFormat prefix="$" displayType="text" value={calcCostoVinos(d.vinosUsados)} thousandSeparator="." decimalSeparator="," />
                </td>
                <td className={s.montoCell}>
                  <NumericFormat prefix="$" displayType="text" value={calcTotalGastos(d)} thousandSeparator="." decimalSeparator="," />
                </td>
                <td>{profitBadge(d)}</td>
                <td className={s.actionsCell}>
                  <button
                    className={`${s.actionBtn} ${s.actionEditBtn}`}
                    onClick={(e) => editar(d, e)}
                    title="Editar"
                  >
                    <i className="bi bi-pencil-square"></i>
                  </button>
                  <button
                    className={`${s.actionBtn} ${s.actionDeleteBtn}`}
                    onClick={(e) => eliminar(d, e)}
                    title="Eliminar"
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

      {/* ── Modal detalle ── */}
      {showModal && modalData && (
        <div className={s.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={s.modalBody} onClick={(e) => e.stopPropagation()}>
            <button className={s.closeBtn} onClick={() => setShowModal(false)}>
              <i className="bi bi-x-lg"></i>
            </button>
            <div className={s.modalInfo}>
              <div className={s.modalTitle}>
                <i className="bi bi-cup-straw"></i>
                {modalData.nombre}
              </div>
              <div className={s.modalMeta}>
                <span><i className="bi bi-calendar3"></i> {formatFecha(modalData.fecha)}</span>
                <span><i className="bi bi-people"></i> {modalData.cantidadPersonas || 0} personas</span>
              </div>

              {modalData.descripcion && (
                <div className={s.modalDescripcion}>
                  <strong>Descripcion:</strong> {modalData.descripcion}
                </div>
              )}

              {modalData.observaciones && (
                <div className={s.modalDescripcion}>
                  <strong>Observaciones:</strong> {modalData.observaciones}
                </div>
              )}

              {/* Reservas vinculadas (ingreso) */}
              {modalData.reservas?.length > 0 && (
                <div className={s.modalSection}>
                  <div className={s.modalSectionTitle}>
                    <i className="bi bi-calendar-event"></i> Reservas del dia ({modalData.reservas.length})
                  </div>
                  <div className={s.modalList}>
                    {modalData.reservas.map((r, i) => (
                      <div key={i} className={s.modalListItem}>
                        <span>{r.nombre} <span className={s.modalListDetail}>({r.cantidad} pers. — {r.turno === "PRIMER TURNO" ? "1er turno" : "2do turno"})</span></span>
                        <NumericFormat prefix="$" displayType="text" value={r.cobrado} thousandSeparator="." decimalSeparator="," />
                      </div>
                    ))}
                    <div className={s.modalListTotal}>
                      <span>Total reservas</span>
                      <NumericFormat prefix="$" displayType="text" value={modalData.ingresoReservas || 0} thousandSeparator="." decimalSeparator="," />
                    </div>
                  </div>
                </div>
              )}

              {/* Ingresos extra de caja */}
              {modalData.totalIngresosCaja > 0 && (
                <div className={s.modalSection}>
                  <div className={s.modalSectionTitle}>
                    <i className="bi bi-cash-stack"></i> Ingresos extra (desde Caja)
                  </div>
                  <div className={s.modalList}>
                    {modalData.operacionesVinculadas?.filter(o => o.tipoOperacion === "INGRESO").map((o, i) => (
                      <div key={i} className={s.modalListItem}>
                        <span>{o.nombre || o.descripcion || "Ingreso"}</span>
                        <NumericFormat prefix="$" displayType="text" value={o.monto} thousandSeparator="." decimalSeparator="," />
                      </div>
                    ))}
                    <div className={s.modalListTotal}>
                      <span>Total ingresos extra</span>
                      <NumericFormat prefix="$" displayType="text" value={modalData.totalIngresosCaja} thousandSeparator="." decimalSeparator="," />
                    </div>
                  </div>
                </div>
              )}

              {/* Vinos */}
              {modalData.vinosUsados?.length > 0 && (
                <div className={s.modalSection}>
                  <div className={s.modalSectionTitle}>
                    <i className="bi bi-droplet"></i> Vinos usados ({modalData.vinosUsados.length})
                  </div>
                  <div className={s.modalList}>
                    {modalData.vinosUsados.map((v, i) => (
                      <div key={i} className={s.modalListItem}>
                        <span>{v.nombre} <span className={s.modalListDetail}>({v.bodega} — {v.cepa})</span></span>
                        <NumericFormat prefix="$" displayType="text" value={v.precioVenta} thousandSeparator="." decimalSeparator="," />
                      </div>
                    ))}
                    <div className={s.modalListTotal}>
                      <span>Costo vinos</span>
                      <NumericFormat prefix="$" displayType="text" value={calcCostoVinos(modalData.vinosUsados)} thousandSeparator="." decimalSeparator="," />
                    </div>
                  </div>
                </div>
              )}

              {/* Gastos vinculados desde caja */}
              {modalData.operacionesVinculadas?.filter(o => o.tipoOperacion === "GASTO").length > 0 && (
                <div className={s.modalSection}>
                  <div className={s.modalSectionTitle}>
                    <i className="bi bi-receipt"></i> Gastos (desde Caja)
                  </div>
                  <div className={s.modalList}>
                    {modalData.operacionesVinculadas.filter(o => o.tipoOperacion === "GASTO").map((o, i) => (
                      <div key={i} className={s.modalListItem}>
                        <span>{o.nombre || o.descripcion || "Gasto"}</span>
                        <NumericFormat prefix="$" displayType="text" value={Math.abs(o.monto)} thousandSeparator="." decimalSeparator="," />
                      </div>
                    ))}
                    <div className={s.modalListTotal}>
                      <span>Total gastos</span>
                      <NumericFormat prefix="$" displayType="text" value={modalData.totalGastosCaja} thousandSeparator="." decimalSeparator="," />
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen */}
              <div className={s.modalResumen}>
                <div className={s.modalResumenRow}>
                  <span>Ingreso total</span>
                  <NumericFormat prefix="$" displayType="text" value={calcTotalIngreso(modalData)} thousandSeparator="." decimalSeparator="," />
                </div>
                <div className={s.modalResumenRow}>
                  <span>Costo vinos</span>
                  <NumericFormat prefix="$" displayType="text" value={calcCostoVinos(modalData.vinosUsados)} thousandSeparator="." decimalSeparator="," />
                </div>
                <div className={s.modalResumenRow}>
                  <span>Gastos caja</span>
                  <NumericFormat prefix="$" displayType="text" value={calcTotalGastos(modalData)} thousandSeparator="." decimalSeparator="," />
                </div>
                <div className={`${s.modalResumenRow} ${s.modalResumenFinal} ${calcProfit(modalData) >= 0 ? s.profitPositive : s.profitNegative}`}>
                  <span>Resultado</span>
                  <span>
                    {calcProfit(modalData) >= 0 ? "+" : "-"}
                    <NumericFormat prefix="$" displayType="text" value={Math.abs(calcProfit(modalData))} thousandSeparator="." decimalSeparator="," />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Degustaciones;
