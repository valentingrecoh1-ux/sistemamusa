import React, { useState, useEffect } from "react";
import { socket } from "../main";
import { NumericFormat } from "react-number-format";

function Estadisticas() {
  const [tipoOperacion, setTipoOperacion] = useState("APORTE");
  const [operaciones, setOperaciones] = useState([]);
  const [totalFacturado, setTotalFacturado] = useState(0);
  const [totalNoFacturado, setTotalNoFacturado] = useState(0);
  const [totalGastoFacturado, setTotalGastoFacturado] = useState(0);
  const [ivaCompra, setIvaCompra] = useState(0);

  const [mes, setMes] = useState("");

  const getGastos = (m) => socket.emit("request-gastos", m);
  const getOperaciones = (tipo, m) =>
    socket.emit("request-tipo-operacion", tipo, m);
  const getTotalFacturado = (m) => socket.emit("request-facturado", m);

  useEffect(() => {
    socket.on("response-tipo-operacion", (ap) => {
      setOperaciones(ap);
    });
    socket.on("response-facturado", (total) => {
      setTotalFacturado(total.totalFacturado);
      setTotalNoFacturado(total.totalNoFacturado);
    });
    socket.on("response-gastos", (totalGastoFacturado, ivaCompra) => {
      setTotalGastoFacturado(totalGastoFacturado);
      setIvaCompra(ivaCompra);
    });
    socket.on("cambios", () => {
      getOperaciones(tipoOperacion, mes);
      getTotalFacturado(mes);
    });
    getOperaciones(tipoOperacion, mes);
    getTotalFacturado(mes);
    getGastos(mes);
    return () => {
      socket.off("response-tipo-operacion");
      socket.off("response-facturado");
      socket.off("cambios");
    };
  }, [tipoOperacion, mes]);

  // Calcular la suma de los montos
  const totalMonto = operaciones.reduce((total, ap) => total + ap.monto, 0);

  return (
    <div className="table-estadisticas">
      <div className="estadisticas">
        <input
          type="month"
          id="mes"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
        />
        <div>
          <div className="totales">
            <NumericFormat
              prefix="TOTAL: $"
              displayType="text"
              value={totalFacturado + totalNoFacturado}
              thousandSeparator="."
              decimalSeparator=","
              decimalScale={2}
            />
            /
            <NumericFormat
              prefix="FACTURADO: $"
              displayType="text"
              value={totalFacturado}
              thousandSeparator="."
              decimalSeparator=","
              decimalScale={2}
            />
            /
            <NumericFormat
              prefix="B: $"
              displayType="text"
              value={totalNoFacturado}
              thousandSeparator="."
              decimalSeparator=","
              decimalScale={2}
            />
            /
            <NumericFormat
              prefix="IVA: $"
              displayType="text"
              value={totalFacturado - totalFacturado / 1.21}
              thousandSeparator="."
              decimalSeparator=","
              decimalScale={2}
            />
          </div>
          <div className="totales">
            <NumericFormat
              prefix="GASTO FACTURADO: $"
              displayType="text"
              value={totalGastoFacturado}
              thousandSeparator="."
              decimalSeparator=","
              decimalScale={2}
            />
            /
            <NumericFormat
              prefix="IVA COMPRA: $"
              displayType="text"
              value={ivaCompra}
              thousandSeparator="."
              decimalSeparator=","
              decimalScale={2}
            />
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>
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
              <div className="div-select-estadisticas">
                <select
                  className="select-estadisticas"
                  onChange={(e) => setTipoOperacion(e.target.value)}
                  value={tipoOperacion}
                  name=""
                  id=""
                >
                  <option value="APORTE">APORTE</option>
                  <option value="RETIRO">RETIRO</option>
                  <option value="GASTO">GASTO</option>
                  <option value="INGRESO">INGRESO</option>
                  <option value="CIERRE DE CAJA">CIERRE DE CAJA</option>
                </select>
              </div>
            </th>
            <th>
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
  );
}

export default Estadisticas;
