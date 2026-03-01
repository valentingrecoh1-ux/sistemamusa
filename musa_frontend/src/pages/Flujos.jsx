import React, { useState, useRef, useEffect } from "react";
import moment from "moment-timezone";
import { NumericFormat } from "react-number-format";
import { IP, socket } from "../main";
import s from "./Flujos.module.css";

function Flujos() {
  const fileInputRef = useRef(null);

  const [flujos, setFlujos] = useState([]);

  const [operacion, setOperacion] = useState({
    fechaPago: moment(new Date())
      .tz("America/Argentina/Buenos_Aires")
      .format("YYYY-MM-DD"),
    nombre: "",
    importe: "",
    beneficiario: "",
    descripcion: "",
  });
  const [file, setFile] = useState(null);
  const [todos, setTodos] = useState(false);

  const [ordenadoFechaPago, setOrdenadoFechaPago] = useState(false); // 'false' para ascendente, 'true' para descendente

  const handleDateChange = (e) =>
    setOperacion((prev) => ({ ...prev, fechaPago: e.target.value }));

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const borrarFile = (id) => {
    if (id) {
      socket.emit("borrar-file-operacion", id);
    }
  };

  const handleChangeNumber = (value) => {
    setOperacion((prev) => ({ ...prev, importe: value }));
  };

  const enviar = async () => {
    const formDataToSend = new FormData();
    for (const key in operacion) {
      formDataToSend.append(key, operacion[key]);
    }
    if (file) {
      formDataToSend.append("file", file);
    }
    try {
      const response = await fetch(`${IP()}/upload_flujo`, {
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
        fechaPago: moment(new Date())
          .tz("America/Argentina/Buenos_Aires")
          .format("YYYY-MM-DD"),
        nombre: "",
        importe: "",
        beneficiario: "",
        descripcion: "",
      });
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error al enviar los datos:", error);
    }
  };

  const editar = (f) => {
    setOperacion(f);
  };

  const fetchFlujos = (o, t) => {
    socket.emit("request-flujos", o, t); // Enviar el valor de ordenadoFechaPago
  };

  const handleSortFechaPago = () => {
    setOrdenadoFechaPago((prev) => !prev); // Cambia entre ascendente y descendente
  };

  const toggleTurnos = () => {
    setTodos((prev) => !prev);
  };

  const enviarCaja = (id) => {
    socket.emit("enviar-a-caja", id);
  };

  useEffect(() => {
    socket.on("cambios", () => {
      fetchFlujos(ordenadoFechaPago, todos);
    });
    socket.on("response-flujos", (f) => {
      setFlujos(f);
    });
    fetchFlujos(ordenadoFechaPago, todos);
  }, [ordenadoFechaPago, todos]);

  return (
    <div className={s.container}>
      {/* Left: Form card */}
      <div className={s.formCard}>
        <div className={s.inputGroup}>
          <span>FECHA DE PAGO</span>
          <input
            value={operacion.fechaPago}
            type="date"
            onChange={handleDateChange}
          />
        </div>
        <div className={s.inputGroup}>
          <span>NOMBRE</span>
          <input
            value={operacion.nombre}
            onChange={(e) =>
              setOperacion((prev) => ({ ...prev, nombre: e.target.value }))
            }
          />
        </div>
        <div className={s.inputGroup}>
          <span>IMPORTE</span>
          <NumericFormat
            prefix="$"
            value={operacion.importe}
            thousandSeparator="."
            decimalSeparator=","
            onValueChange={(e) => handleChangeNumber(e.floatValue)}
          />
        </div>
        <div className={s.inputGroup}>
          <span>BENEFICIARIO</span>
          <input
            value={operacion.beneficiario}
            onChange={(e) =>
              setOperacion((prev) => ({
                ...prev,
                beneficiario: e.target.value,
              }))
            }
          />
        </div>
        <div className={s.inputGroup}>
          <span>DESCRIPCION</span>
          <input
            value={operacion.descripcion}
            onChange={(e) =>
              setOperacion((prev) => ({ ...prev, descripcion: e.target.value }))
            }
          />
        </div>
        <div className={s.inputGroup}>
          <span>ARCHIVO</span>
          <div
            className={s.fileInputWrap}
            onClick={() => fileInputRef.current?.click()}
          >
            <i className="bi bi-cloud-arrow-up"></i>
            <span>{file ? file.name : "Elegir archivo..."}</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className={s.fileInputHidden}
          />
        </div>
        <button onClick={enviar} className={s.submitBtn}>
          ENVIAR
        </button>
      </div>

      {/* Right: Table section */}
      <div className={s.tableSection}>
        <button className={s.toggleBtn} onClick={toggleTurnos}>
          {todos ? "TODOS" : "PROXIMOS"}
        </button>
        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>FECHA</th>
                <th>
                  <span
                    className={s.sortable}
                    onClick={handleSortFechaPago}
                  >
                    FECHA DE PAGO
                    {ordenadoFechaPago ? " \u2193" : ""}
                  </span>
                </th>
                <th>BENEFICIARIO</th>
                <th>IMPORTE</th>
                <th>NOMBRE</th>
                <th>DESCRIPCION</th>
                <th></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {flujos?.map((f, index) => (
                <tr
                  className={`${s.clickableRow} ${f.enviado ? s.sentRow : ""}`}
                  onClick={() => {
                    if (f.filePath) {
                      if (f.filePath.startsWith('data:')) {
                        const w = window.open();
                        if (w) { w.document.write(`<iframe src="${f.filePath}" style="width:100%;height:100%;border:none"></iframe>`); }
                      } else {
                        window.open(`${IP()}/${f.filePath}`);
                      }
                    }
                  }}
                  key={index}
                >
                  <td>{f.fecha}</td>
                  <td>{f.fechaPago}</td>
                  <td>{f.beneficiario}</td>
                  <td>
                    <NumericFormat
                      displayType="text"
                      prefix="$"
                      value={f.importe}
                      thousandSeparator="."
                      decimalSeparator=","
                    />
                  </td>
                  <td>{f.nombre}</td>
                  <td>{f.descripcion}</td>
                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                      editar(f);
                    }}
                    className={s.actionCell}
                  >
                    <i className="bi bi-pencil-square"></i>
                  </td>
                  <td className={s.actionCell}>
                    {f.filePath ? (
                      (f.filePath.includes("pdf") || f.filePath.includes("application/pdf")) ? (
                        <i className="bi bi-filetype-pdf"></i>
                      ) : (
                        <i className="bi bi-file-earmark-image"></i>
                      )
                    ) : null}
                  </td>
                  <td
                    className={s.actionCell}
                    onClick={(e) => {
                      e.stopPropagation();
                      enviarCaja(f._id);
                    }}
                  >
                    <i className="bi bi-send"></i>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Flujos;
