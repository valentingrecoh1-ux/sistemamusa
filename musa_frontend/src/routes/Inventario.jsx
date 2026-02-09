import React, { useState, useEffect, useRef } from "react";
import { NumericFormat } from "react-number-format";

import { IP, socket } from "../main";

function Inventario() {
  const [formData, setFormData] = useState({
    codigo: "",
    bodega: "",
    cepa: "",
    nombre: "",
    year: "",
    origen: "",
    venta: "",
    cantidad: "",
    posicion: "",
    descripcion: "",
    foto: null,
  });
  const fileInputRef = useRef(null);
  const [productos, setProductos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [installedPrinters, setInstalledPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");

  const [totalCantidad, setTotalCantidad] = useState(0);

  const fetchProductos = () => {
    socket.emit("request-productos", { page, search });
    socket.emit("total-cantidad-productos", { page, search });
  };

  useEffect(() => {
    if (window.JSPM) {
      window.JSPM.JSPrintManager.auto_reconnect = true;
      window.JSPM.JSPrintManager.start();
      window.JSPM.JSPrintManager.WS.onStatusChanged = function () {
        if (jspmWSStatus()) {
          window.JSPM.JSPrintManager.getPrinters().then(function (myPrinters) {
            console.log(myPrinters);
            setInstalledPrinters(myPrinters);
            const godexPrinter = myPrinters.find(
              (printer) => printer === "Godex GE300"
            );
            if (godexPrinter) {
              setSelectedPrinter(godexPrinter);
            } else {
              setSelectedPrinter(myPrinters[0]);
            }
          });
        }
      };
    }
    socket.on("cambios", () => fetchProductos(page, search));
    socket.on("response-productos", (data) => {
      if (data.status === "error") {
        console.error(data.message);
        return;
      }
      setProductos(data.productos);
      setTotalPages(data.totalPages);
    });
    socket.on("res-total-cantidad-productos", (t) => setTotalCantidad(t));
    fetchProductos(page, search);
    return () => {
      socket.off("cambios");
      socket.off("response-productos");
      socket.off("res-total-cantidad-productos");
    };
  }, [page, search]);

  const jspmWSStatus = () => {
    if (
      window.JSPM.JSPrintManager.websocket_status === window.JSPM.WSStatus.Open
    ) {
      return true;
    } else if (
      window.JSPM.JSPrintManager.websocket_status ===
      window.JSPM.WSStatus.Closed
    ) {
      //alert('JSPrintManager (JSPM) no está instalado o no está ejecutándose. Descárgalo desde https://neodynamic.com/downloads/jspm');
      return false;
    } else if (
      window.JSPM.JSPrintManager.websocket_status ===
      window.JSPM.WSStatus.Blocked
    ) {
      //alert('JSPM ha bloqueado este sitio web.');
      return false;
    }
  };

  const handleChangeNumber = (value) => {
    setFormData({
      ...formData,
      venta: value,
    });
  };

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === "foto") {
      setFormData({
        ...formData,
        foto: files[0], // Guarda el archivo seleccionado en el estado
      });
    } else {
      const numericFields = ["codigo", "year", "cantidad"];
      if (numericFields.includes(name)) {
        const numericValue = value.replace(/[^0-9]/g, "");
        setFormData((prev) => ({
          ...prev,
          [name]: numericValue,
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          [name]: value,
        }));
      }
    }
  };

  const generateEAN13 = () => {
    const timestamp = Date.now().toString().slice(0, 12); // Asegúrate de que sean 12 dígitos
    const modifiedTimestamp = timestamp.replace(/^1/, "8"); // Opcionalmente, modifica según tus necesidades

    const calculateCheckDigit = (number) => {
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        const digit = parseInt(number.charAt(i));
        sum += i % 2 === 0 ? digit : digit * 3;
      }
      const remainder = sum % 10;
      return remainder === 0 ? 0 : 10 - remainder;
    };

    const checkDigit = calculateCheckDigit(modifiedTimestamp);
    const ean13Code = modifiedTimestamp + checkDigit;

    setFormData({
      ...formData,
      codigo: ean13Code,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    /*
        if (formData.codigo.length < 13) {
            alert('EL CODIGO TIENE MENOS DE 13 DIGITOS');
            return;
        };
        */
    const formDataToSend = new FormData();
    for (const key in formData) {
      formDataToSend.append(key, formData[key]);
    }
    try {
      const response = await fetch(`${IP()}/upload`, {
        method: "POST",
        body: formDataToSend,
      });
      const result = await response.json();
      console.log("Resultado del servidor:", result);
      if (result.status === "error") {
        alert(result.message);
        return;
      }
      setFormData({
        codigo: "",
        bodega: "",
        cepa: "",
        nombre: "",
        year: "",
        origen: "",
        venta: "",
        cantidad: "",
        posicion: "",
        descripcion: "",
        foto: null,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error al enviar los datos:", error);
    }
  };

  const printLabel = (codigo, cantidad) => {
    if (jspmWSStatus()) {
      var cpj = new window.JSPM.ClientPrintJob();
      cpj.clientPrinter = new window.JSPM.InstalledPrinter(selectedPrinter);
      const singleCmd = `
^XSETCUT,DOUBLECUT,0
^Q15,3
^W30
^H8
^P1
^S4
^AD
^C1
^R0
~Q+0
^O0
^D0
^E18
~R255
^L
Dy2-me-dd
Th:m:s
BE,14,13,2,5,82,0,1,${codigo}
E
`;
      const cmds = singleCmd.repeat(cantidad);
      cpj.printerCommands = cmds;
      cpj.sendToClient();
    }
  };

  const handleKeyDown = (e) => {
    if (e.target.name !== "descripcion") {
      if (e.key === "Enter") {
        e.preventDefault();
        e.target.select();
      }
    }
  };

  const editar = (producto) => {
    setFormData(producto);
  };

  const imprimir = (codigo) => {
    const cantidad = window.prompt("Cantidad a imprimir");
    printLabel(codigo, cantidad);
  };

  const deleteProducto = (producto) => {
    if (
      window.confirm(
        `Estas seguro que quieres eliminar el producto\nCodigo: ${producto.codigo}\nNombre: ${producto.nombre}`
      )
    ) {
      socket.emit("delete-producto", producto._id);
    }
  };

  const agregarStock = (producto) => {
    const cantidad = window.prompt(
      `CANTIDAD A SUMAR\nCodigo: ${producto.codigo}\nNombre: ${producto.nombre}`
    );
    if (cantidad && cantidad > 0) {
      socket.emit("agregar-stock", producto._id, cantidad);
    }
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

  return (
    <div className="inventario-container">
      <div className="formulario-container">
        <form
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          className="formulario"
        >
          <div className="form-group">
            <label>Código</label>
            <div className="input-button-group">
              <input
                type="text"
                id="codigo"
                name="codigo"
                value={formData.codigo}
                onChange={handleChange}
                autoComplete="off"
              />
              <button
                className="generar-codigo"
                type="button"
                onClick={generateEAN13}
              >
                GENERAR CODIGO
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Bodega</label>
            <input
              type="text"
              id="bodega"
              name="bodega"
              value={formData.bodega}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Cepa</label>
            <input
              type="text"
              id="cepa"
              name="cepa"
              value={formData.cepa}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Nombre</label>
            <input
              type="text"
              id="nombre"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label>Año</label>
            <input
              type="text"
              id="year"
              name="year"
              value={formData.year}
              onChange={handleChange}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label>Origen</label>
            <input
              type="text"
              id="origen"
              name="origen"
              value={formData.origen}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Precio de Venta</label>
            <NumericFormat
              prefix="$"
              value={formData.venta}
              thousandSeparator="."
              decimalSeparator=","
              onValueChange={(e) => handleChangeNumber(e.floatValue)}
            />
          </div>
          <div className="form-group">
            <label>Cantidad</label>
            <input
              type="text"
              id="cantidad"
              name="cantidad"
              value={formData.cantidad}
              onChange={handleChange}
              autoComplete="off"
              //disabled={formData._id} // Desactiva el campo si formData._id existe
              //readOnly={formData._id}
              //className={`${formData._id ? "input-disabled" : ""}`}
            />
          </div>
          <div className="form-group">
            <label>Posicion</label>
            <input
              type="text"
              id="posicion"
              name="posicion"
              value={formData.posicion}
              onChange={handleChange}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label>Descripción</label>
            <textarea
              id="descripcion"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              autoComplete="off"
            ></textarea>
          </div>
          <div className="form-group">
            <label>Foto del Producto</label>
            <input
              ref={fileInputRef}
              type="file"
              id="foto"
              name="foto"
              accept="image/*"
              onChange={handleChange}
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
          <input
            type="text"
            placeholder="Buscar productos..."
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
                <th>Código</th>
                <th>Nombre</th>
                <th>Año</th>
                <th>Bodega</th>
                <th>Cepa</th>
                <th>Posicion</th>
                <th>Origen</th>
                <th>Venta</th>
                <th>Cantidad {totalCantidad}</th>
                <th>Foto</th>
                <th colSpan={4}>Funciones</th>
              </tr>
            </thead>
            <tbody>
              {productos?.map((producto) => (
                <tr key={producto._id}>
                  <td className={`${producto.codigo.length < 13 ? "red" : ""}`}>
                    {producto.codigo}
                  </td>
                  <td>{producto.nombre}</td>
                  <td>{producto.year}</td>
                  <td>{producto.bodega}</td>
                  <td>{producto.cepa}</td>
                  <td>{producto.posicion}</td>
                  <td>{producto.origen}</td>
                  <td>
                    <NumericFormat
                      prefix="$"
                      displayType="text"
                      value={producto.venta}
                      thousandSeparator="."
                      decimalSeparator=","
                    />
                  </td>
                  <td>{producto.cantidad}</td>
                  <td>
                    <img width="40px" src={`${IP()}/${producto.foto}`} alt="" />
                  </td>
                  <td
                    onClick={() => imprimir(producto.codigo)}
                    className="editar"
                  >
                    <i className="bi bi-printer-fill"></i>
                  </td>
                  <td onClick={() => agregarStock(producto)} className="editar">
                    <i className="bi bi-plus-circle"></i>
                  </td>
                  <td onClick={() => editar(producto)} className="editar">
                    <i className="bi bi-pencil-square"></i>
                  </td>
                  <td
                    onClick={() => deleteProducto(producto)}
                    className="editar"
                  >
                    <i className="bi bi-trash3-fill"></i>
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

export default Inventario;
