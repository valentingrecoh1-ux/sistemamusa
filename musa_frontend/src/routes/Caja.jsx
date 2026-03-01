import React, { useState, useEffect, useRef } from "react";
import { socket } from "../main";
import { NumericFormat } from "react-number-format";
import DatalistInput from "react-datalist-input";
import moment from "moment-timezone";

import { IP } from "../main";

function Caja() {
  const [operacion, setOperacion] = useState({
    descripcion: "",
    monto: 0,
    nombre: "",
    formaPago: null,
    tipoOperacion: null,
    factura: null,
  });
  const [nombres, setNombres] = useState([]);
  const [totales, setTotales] = useState({});
  const [operaciones, setOperaciones] = useState([]);
  const [file, setFile] = useState(null);
  const [otroDia, setOtroDia] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fecha, setFecha] = useState(
    moment(new Date()).tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD")
  );
  const [search, setSearch] = useState("");
  const fileInputRef = useRef(null);

  const fetchTotales = () => socket.emit("request-totales");
  const fetchNombres = () => socket.emit("request-nombres");
  const fetchOperaciones = (fecha, search, page) =>
    socket.emit("request-operaciones", { fecha, search, page });

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handleDateChange = (e) => setFecha(e.target.value);

  useEffect(() => {
    socket.on("cambios", () => {
      fetchNombres();
      fetchTotales();
      fetchOperaciones(fecha, search, page);
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
    fetchNombres();
    fetchTotales();
    fetchOperaciones(fecha, search, page);
    return () => {
      socket.off("cambios");
      socket.off("response-totales");
      socket.off("response-nombres");
    };
  }, [fecha, search, page]);

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
      alert("FALTA MONTO");
      return;
    }
    if (
      (operacion.tipoOperacion === "GASTO" ||
        operacion.tipoOperacion === "RETIRO") &&
      operacion.monto > 0
    ) {
      alert("Para GASTO o RETIRO el monto debe ser negativo");
      return;
    }
    if (
      (operacion.tipoOperacion === "INGRESO" ||
        operacion.tipoOperacion === "APORTE") &&
      operacion.monto < 0
    ) {
      alert("Para INGRESO o APORTE el monto debe ser positivo");
      return;
    }
    if (!operacion.formaPago) {
      alert("FALTA FORMA DE PAGO");
      return;
    }
    if (!operacion.tipoOperacion) {
      alert("FALTA TIPO DE OPERACION");
      return;
    }

    const formDataToSend = new FormData();
    for (const key in operacion) {
      formDataToSend.append(key, operacion[key]);
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
      console.log("Resultado del servidor:", result);

      if (result.status === "error") {
        alert(result.message);
        return;
      }

      setOperacion({
        descripcion: "",
        monto: 0,
        nombre: "",
        formaPago: null,
        tipoOperacion: null,
      });
      setFile(null);
      setOtroDia(false); // Resetea el estado de otroDia a false después de enviar
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
  };

  const editar = async (op) => {
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

  return (
    <div className="div-caja">
      <div className="inputs-caja">
        <NumericFormat
          placeholder="MONTO"
          prefix="$"
          value={operacion.monto}
          thousandSeparator="."
          decimalSeparator=","
          onValueChange={(e) => handleChangeNumber(e.floatValue)}
          disabled={otroDia} // Deshabilitado si otroDia es true
        />
        <div className="botones-caja">
          <button
            onClick={() => handlePaymentButtonClick("EFECTIVO")}
            className={operacion.formaPago === "EFECTIVO" ? "boton-activo" : ""}
            disabled={otroDia} // Deshabilitado si otroDia es true
          >
            EFECTIVO
          </button>
          <button
            onClick={() => handlePaymentButtonClick("DIGITAL")}
            className={operacion.formaPago === "DIGITAL" ? "boton-activo" : ""}
            disabled={otroDia} // Deshabilitado si otroDia es true
          >
            DIGITAL
          </button>
        </div>
        <textarea
          value={operacion.descripcion}
          placeholder="DESCRIPCION"
          onChange={(e) =>
            setOperacion((prev) => ({ ...prev, descripcion: e.target.value }))
          }
          disabled={otroDia} // Deshabilitado si otroDia es true
        ></textarea>
        <div className="botones-caja">
          <button
            onClick={() => handleTransactionButtonClick("APORTE")}
            className={
              operacion.tipoOperacion === "APORTE" ? "boton-activo" : ""
            }
            disabled={otroDia} // Deshabilitado si otroDia es true
          >
            APORTE
          </button>
          <button
            onClick={() => handleTransactionButtonClick("RETIRO")}
            className={
              operacion.tipoOperacion === "RETIRO" ? "boton-activo" : ""
            }
            disabled={otroDia} // Deshabilitado si otroDia es true
          >
            RETIRO
          </button>
          <button
            onClick={() => handleTransactionButtonClick("GASTO")}
            className={
              operacion.tipoOperacion === "GASTO" ? "boton-activo" : ""
            }
            disabled={otroDia} // Deshabilitado si otroDia es true
          >
            GASTO
          </button>
          <button
            onClick={() => handleTransactionButtonClick("INGRESO")}
            className={
              operacion.tipoOperacion === "INGRESO" ? "boton-activo" : ""
            }
            disabled={otroDia} // Deshabilitado si otroDia es true
          >
            INGRESO
          </button>
        </div>
        <div className="boton-cierre-caja">
          <button
            onClick={() => handleTransactionButtonClick("CIERRE DE CAJA")}
            className={
              operacion.tipoOperacion === "CIERRE DE CAJA" ? "boton-activo" : ""
            }
            disabled={otroDia} // Deshabilitado si otroDia es true
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
            disabled: otroDia, // Deshabilitado si otroDia es true
          }}
          onSelect={(e) =>
            setOperacion((prev) => ({ ...prev, nombre: e.value }))
          }
          items={nombres}
        />
        <div className="botones-caja">
          <input ref={fileInputRef} type="file" onChange={handleFileChange} />
          <button onClick={() => borrarFile(operacion._id)}>X</button>
        </div>
        <div className="botones-caja">
          <button
            className={operacion.factura === "A" ? "boton-activo" : ""}
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
            className={operacion.factura === "C" ? "boton-activo" : ""}
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
        <div className="botones-caja">
          <button onClick={() => enviar()}>ENVIAR</button>
        </div>
      </div>
      <div className="div-tablas-caja">
        <table>
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
        <div className="buscador-ventas">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input value={fecha} type="date" onChange={handleDateChange} />
          <div className="paginacion">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
            >
              <i className="bi bi-arrow-left"></i>
            </button>
            <span>
              {page} de {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
            >
              <i className="bi bi-arrow-right"></i>
            </button>
          </div>
        </div>
        <table>
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
            </tr>
          </thead>
          <tbody>
            {operaciones?.map((operacion, index) => (
              <tr
                className="tr-cursor-pointer"
                onClick={() => {
                  if (operacion.filePath) {
                    const w = window.open();
                    if (w) { w.document.write(`<iframe src="${operacion.filePath}" style="width:100%;height:100%;border:none"></iframe>`); }
                  }
                }}
                key={index}
              >
                <td
                  onClick={(e) => {
                    e.stopPropagation(); // Evita que el clic en el botón de edición abra el archivo
                    editar(operacion);
                  }}
                  className="editar caja-editar"
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
                <td style={{ color: operacion.monto < 0 ? "red" : "" }}>
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
                    operacion.filePath.endsWith(".pdf") ? (
                      <i className="bi bi-filetype-pdf icono-caja"></i>
                    ) : (
                      <i className="bi bi-file-earmark-image icono-caja"></i>
                    )
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Caja;
