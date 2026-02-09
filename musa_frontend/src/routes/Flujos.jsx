import React, { useState, useRef, useEffect } from "react";
import moment from "moment-timezone";
import { NumericFormat } from "react-number-format";

import { IP, socket } from "../main";

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
    <div className="container-flujos">
      <div className="formulario-fujos">
        <div className="input-flujos">
          <span>FECHA DE PAGO</span>
          <input
            value={operacion.fechaPago}
            type="date"
            onChange={handleDateChange}
          />
        </div>
        <div className="input-flujos">
          <span>NOMBRE</span>
          <input
            value={operacion.nombre}
            onChange={(e) =>
              setOperacion((prev) => ({ ...prev, nombre: e.target.value }))
            }
          />
        </div>
        <div className="input-flujos">
          <span>IMPORTE</span>
          <NumericFormat
            prefix="$"
            value={operacion.importe}
            thousandSeparator="."
            decimalSeparator=","
            onValueChange={(e) => handleChangeNumber(e.floatValue)}
          />
        </div>
        <div className="input-flujos">
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
        <div className="input-flujos">
          <span>DESCRIPCION</span>
          <input
            value={operacion.descripcion}
            onChange={(e) =>
              setOperacion((prev) => ({ ...prev, descripcion: e.target.value }))
            }
          />
        </div>
        <div className="input-flujos">
          <input ref={fileInputRef} type="file" onChange={handleFileChange} />
        </div>
        <div className="input-flujos">
          <button onClick={enviar} className="boton-flujos">
            ENVIAR
          </button>
        </div>
      </div>
      <div className="table-flujos">
        <button className="proximos" onClick={toggleTurnos}>
          {todos ? "TODOS" : "PROXIMOS"}
        </button>
        <table>
          <thead>
            <tr>
              <th>FECHA</th>
              <th>
                <span
                  onClick={handleSortFechaPago}
                  style={{ cursor: "pointer" }}
                >
                  FECHA DE PAGO
                  {ordenadoFechaPago ? " ↓" : ""}
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
                className={f.enviado ? "flujo-color" : ""}
                onClick={() => {
                  if (f.filePath) {
                    window.open(`${IP()}/${f.filePath}`);
                  }
                }}
                key={index}
              >
                <td>{f.fecha}</td>
                <td>{f.fechaPago} </td>
                <td>{f.beneficiario} </td>
                <td>
                  <NumericFormat
                    displayType="text"
                    prefix="$"
                    value={f.importe}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </td>
                <td>{f.nombre} </td>
                <td>{f.descripcion} </td>
                <td
                  onClick={(e) => {
                    e.stopPropagation(); // Evita que el clic en el botón de edición abra el archivo
                    editar(f);
                  }}
                  className="editar caja-editar"
                >
                  <i className="bi bi-pencil-square"></i>
                </td>
                <td className="editar caja-editar">
                  {f.filePath ? (
                    f.filePath.endsWith(".pdf") ? (
                      <i className="bi bi-filetype-pdf icono-caja"></i>
                    ) : (
                      <i className="bi bi-file-earmark-image icono-caja"></i>
                    )
                  ) : null}
                </td>
                <td
                  className="editar caja-editar"
                  onClick={(e) => {
                    e.stopPropagation(); // Evita que el clic en el botón de edición abra el archivo
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
  );
}

export default Flujos;
