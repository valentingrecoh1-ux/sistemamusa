import React, { useEffect, useState } from "react";
import { IP, socket } from "../main";
import { NumericFormat } from "react-number-format";
import moment from "moment-timezone";
import { dialog } from '../components/shared/dialog';

function Ventas() {
  const [ventas, setVentas] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fecha, setFecha] = useState(
    moment(new Date()).tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD")
  );
  const [alreadyClicked, setAlreadyClicked] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [venta, setVenta] = useState({});
  const [filtroPago, setFiltroPago] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [totalMonto, setTotalMonto] = useState(0);
  const [totalDescuento, setTotalDescuento] = useState(0);

  const fetchVentas = (fecha, page, filtroPago, filtroTipo) => {
    setAlreadyClicked(false);
    socket.emit("request-ventas", { fecha, page, filtroPago, filtroTipo });
  };

  const notaCredito = async (venta) => {
    if (!venta.tipoFactura) {
      if (
        await dialog.confirm(
          "NO HAY FACTURA PARA HACER NOTA DE CREDITO\n\n¿Desea cancelar la compra?"
        )
      ) {
        socket.emit("devolucion", venta);
      }
      return;
    }
    if (
      await dialog.confirm("¿ESTAS SEGURO QUE QUIERES HACER UNA NOTA DE CREDITO?")
    ) {
      if (alreadyClicked) {
        await dialog.alert("NOTA DE CREDITO EN PROCESO");
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

  const handleDateChange = (e) => setFecha(e.target.value);

  const ventaClick = (venta) => {
    setVenta(venta);
    setOpenModal(true);
  };

  const toggleFiltroPago = () => {
    const nuevoFiltro =
      filtroPago === "todos"
        ? "efectivo"
        : filtroPago === "efectivo"
        ? "digital"
        : "todos";
    setFiltroPago(nuevoFiltro);
  };

  const toggleFiltroTipo = () => {
    const nuevoFiltro =
      filtroTipo === "todos"
        ? "vino"
        : filtroTipo === "vino"
        ? "reserva"
        : "todos";
    setFiltroTipo(nuevoFiltro);
  };

  useEffect(() => {
    socket.on("cambios", () =>
      fetchVentas(fecha, page, filtroPago, filtroTipo)
    );
    socket.on("response-ventas", (data) => {
      if (data.status === "error") {
        console.error(data.message);
        return;
      }
      setVentas(data.ventas);
      setTotalPages(data.totalPages);
      const total = data.ventas.reduce((acc, venta) => {
        return venta.notaCredito ? acc : acc + venta.monto;
      }, 0);
      const totalDescuento = data.ventas.reduce((acc, venta) => {
        return venta.notaCredito ? acc : acc + venta.descuento;
      }, 0);
      setTotalMonto(total);
      setTotalDescuento(totalDescuento);
    });
    fetchVentas(fecha, page, filtroPago, filtroTipo);
    return () => {
      socket.off("cambios");
      socket.off("response-ventas");
    };
  }, [fecha, page, filtroPago, filtroTipo]);

  return (
    <div>
      <div className="buscador-ventas">
        <input value={fecha} type="date" onChange={handleDateChange} />
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
        <div className="botones-filtro">
          <button onClick={toggleFiltroPago}>
            {filtroPago === "todos"
              ? "TODOS"
              : filtroPago === "efectivo"
              ? "EFECTIVO"
              : "DIGITAL"}
          </button>
          <button onClick={toggleFiltroTipo}>
            {filtroTipo === "todos"
              ? "TODOS"
              : filtroTipo === "vino"
              ? "VINO"
              : "RESERVA"}
          </button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Fecha de Creación</th>
            <th>Tipo de Factura</th>
            <th>Número de Factura</th>
            <th>CUIT/DNI</th>
            <th>
              Monto
              <br />
              <NumericFormat
                prefix="$"
                displayType="text"
                value={totalMonto.toFixed(2)}
                thousandSeparator="."
                decimalSeparator=","
              />
            </th>
            <th>
              Descuento
              <br />
              <NumericFormat
                prefix="$"
                displayType="text"
                value={totalDescuento.toFixed(2)}
                thousandSeparator="."
                decimalSeparator=","
              />
            </th>
            <th>Forma de Pago</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ventas?.length > 0 ? (
            ventas.map((venta, index) => (
              <tr
                className="tr-cursor-pointer"
                onClick={() => {
                  if (venta.numeroFactura) {
                    window.open(
                      `${IP()}/api/factura-pdf/${venta._id}`
                    );
                  } else {
                    ventaClick(venta);
                  }
                }}
                key={index}
              >
                <td style={{ backgroundColor: venta.notaCredito && "#e55959" }}>
                  {new Date(venta.createdAt).toLocaleString("es-AR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </td>
                <td style={{ backgroundColor: venta.notaCredito && "#e55959" }}>
                  {venta.tipoFactura ? venta.tipoFactura : "-"}
                </td>
                <td style={{ backgroundColor: venta.notaCredito && "#e55959" }}>
                  {venta.numeroFactura ? venta.numeroFactura : "-"}
                </td>
                <td style={{ backgroundColor: venta.notaCredito && "#e55959" }}>
                  {venta.cuit ? venta.cuit : "FINAL"}
                </td>
                <td style={{ backgroundColor: venta.notaCredito && "#e55959" }}>
                  <NumericFormat
                    prefix="$"
                    displayType="text"
                    value={venta.monto.toFixed(2)}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </td>
                <td style={{ backgroundColor: venta.notaCredito && "#e55959" }}>
                  <NumericFormat
                    prefix="$"
                    displayType="text"
                    value={venta.descuento.toFixed(2)}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </td>
                <td style={{ backgroundColor: venta.notaCredito && "#e55959" }}>
                  {venta.formaPago}
                </td>
                <td
                  className="editar nafta"
                  onClick={(e) => {
                    e.stopPropagation();
                    ventaClick(venta);
                  }}
                >
                  <i className="bi bi-info-circle"></i>
                </td>
                <td
                  className="editar nafta"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (venta.notaCredito) {
                      await dialog.alert("YA SE HIZO UNA NOTA DE CREDITO DE ESA FACTURA");
                      return;
                    }
                    notaCredito(venta);
                  }}
                >
                  <i className="bi bi-file-earmark-break-fill"></i>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="7">No hay ventas disponibles</td>
            </tr>
          )}
        </tbody>
      </table>
      {openModal && (
        <div className="modal" tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <NumericFormat
                    prefix="VENTA - $"
                    displayType="text"
                    value={venta.monto.toFixed(2)}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </h5>
              </div>
              <div>
                <NumericFormat
                  prefix="DESCUENTO: $"
                  displayType="text"
                  value={venta.descuento.toFixed(2)}
                  thousandSeparator="."
                  decimalSeparator=","
                />
              </div>
              <div>DETALLE: {venta.detalle}</div>
              {venta.productos.map((prod, index) => (
                <div key={index}>
                  {prod.carritoCantidad} x {prod.nombre}
                  {venta.nombreTurno && ` de ${venta.nombreTurno}`}
                </div>
              ))}
              <div className="modal-footer">
                <button
                  onClick={() => setOpenModal(false)}
                  type="button"
                  className="btn btn-secondary"
                  data-bs-dismiss="modal"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Ventas;
