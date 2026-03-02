import React, { useEffect, useState, useCallback } from "react";
import { IP, socket, fotoSrc } from "../main";
import { NumericFormat, PatternFormat } from "react-number-format";

const LIMITE_EFECTIVO = 10000000;
const LIMITE_DIGITAL = 10000000;

const Carrito = () => {
  const [productos, setProductos] = useState([]);
  const [total, setTotal] = useState(0);

  const [totalFinal, setTotalFinal] = useState(0);

  const [inputBuffer, setInputBuffer] = useState("");

  const [descuento, setDescuento] = useState(0);
  const [detalle, setDetalle] = useState("");

  const [formaPago, setFormaPago] = useState(null);
  const [factura, setFactura] = useState(null);

  const [pedirData, setPedirData] = useState(false);
  const [pedirCuit, setPedirCuit] = useState(false);

  const [cuit, setCUIT] = useState("");
  const [dni, setDNI] = useState("");
  const [nombre, setNombre] = useState("");
  const [domicilio, setDomicilio] = useState("");

  const [todoOK, setTodoOK] = useState(false);

  const [compraEnProceso, setCompraEnProceso] = useState(false);

  // NUEVOS ESTADOS para manejo de montos en pago mixto
  const [efectivoMixto, setEfectivoMixto] = useState(0);
  const [digitalMixto, setDigitalMixto] = useState(0);

  const fetchProductosCarrito = () => socket.emit("productos-carrito");

  const calcularTotal = useCallback(() => {
    return productos.reduce(
      (total, producto) => total + producto.venta * producto.carritoCantidad,
      0
    );
  }, [productos]);

  useEffect(() => {
    if (descuento !== undefined) {
      setTotalFinal(total - descuento);
    }
  }, [total, descuento]);

  const handleInputChange = useCallback((id, value, maxCantidad) => {
    const cantidadNumerica = parseInt(value.replace(/\D/g, ""));
    const cantidad = isNaN(cantidadNumerica)
      ? 1
      : Math.min(Math.max(1, cantidadNumerica), maxCantidad);
    socket.emit("actualizar-cantidad-carrito", { id, cantidad });
  }, []);

  const handleFormaPagoClick = useCallback((tipo) => {
    setFormaPago(tipo);
    // Si es DIGITAL, auto-seleccionamos factura B (como en tu código original).
    // Si es MIXTO o EFECTIVO, inicialmente dejamos factura en null.
    setFactura(tipo === "DIGITAL" ? "B" : null);
  }, []);

  const handleFacturaClick = useCallback(
    (tipo) => {
      // Si la forma de pago no es DIGITAL, permitimos togglear la factura.
      // Mantiene la lógica existente.
      setFactura(factura === tipo && formaPago !== "DIGITAL" ? null : tipo);
    },
    [factura, formaPago]
  );

  const handleCantidad = useCallback(
    (id, delta, maxCantidad) => {
      const producto = productos.find((prod) => prod._id === id);
      const nuevaCantidad = Math.min(
        Math.max(1, producto.carritoCantidad + delta),
        maxCantidad
      );
      socket.emit("actualizar-cantidad-carrito", {
        id,
        cantidad: nuevaCantidad,
      });
    },
    [productos]
  );

  const finalizar = () => {
    if (compraEnProceso) return;
    setCompraEnProceso(true);

    const datosCompra = {
      descuento,
      detalle,
      formaPago,
      factura,
      ...(pedirCuit && { cuit }),
      ...(pedirData && { dni, nombre, domicilio }),
      // Si la forma de pago es MIXTO, incluimos los montos
      ...(formaPago === "MIXTO" && {
        efectivoMixto,
        digitalMixto,
      }),
    };

    console.log("FINALIZANDO COMPRA", datosCompra);
    socket.emit("finalizar-compra", datosCompra);
  };

  const handleGlobalKeyDown = (e) => {
    setInputBuffer((prevBuffer) => {
      if (e.key === "Enter") {
        console.log("Enviando código al backend:", prevBuffer);
        socket.emit("add-carrito", prevBuffer);
        return "";
      }
      const newBuffer = prevBuffer + e.key;
      return newBuffer;
    });
  };

  useEffect(() => {
    if (formaPago) {
      const limite =
        formaPago === "EFECTIVO" ? LIMITE_EFECTIVO : LIMITE_DIGITAL;
      setPedirCuit(factura === "A");
      setPedirData(factura === "B" && total >= limite);

      let dataComplete =
        productos.length > 0 && // Verifica que haya productos en el carrito
        (!pedirCuit || (cuit && cuit.length === 11)) && // CUIT válido si es requerido
        (!pedirData || (dni && nombre && domicilio)); // Datos completos si son requeridos

      // Si hay un descuento distinto de 0, exigimos que `detalle` NO esté vacío
      if (descuento !== 0) {
        dataComplete = dataComplete && detalle.trim() !== "";
      }

      // Si el pago es MIXTO, también validamos la suma de efectivoMixto + digitalMixto
      if (formaPago === "MIXTO") {
        dataComplete =
          dataComplete && efectivoMixto + digitalMixto === totalFinal;
      }

      setTodoOK(dataComplete);
    }
  }, [
    factura,
    formaPago,
    total,
    productos,
    pedirCuit,
    cuit,
    pedirData,
    dni,
    nombre,
    domicilio,
    efectivoMixto,
    digitalMixto,
    totalFinal,
    descuento,
    detalle,
  ]);

  useEffect(() => {
    setTotal(calcularTotal());
  }, [productos, calcularTotal]);

  useEffect(() => {
    socket.on("cambios", fetchProductosCarrito);
    socket.on("productos-carrito", setProductos);
    socket.on("error-cuit-invalido", () =>
      alert("PROBABLEMENTE EL CUIT INGRESADO ESTA MAL ESCRITO")
    );
    socket.on("error-no-cuit", () => alert("PROBABLEMENTE NO ES CUIT"));
    socket.on("compra-finalizada", () => {
      setFormaPago(null);
      setFactura(null);
      setPedirData(false);
      setPedirCuit(false);
      setCUIT("");
      setDNI("");
      setNombre("");
      setDomicilio("");
      setDescuento(0);
      setDetalle("");
      setCompraEnProceso(false);
      setTodoOK(false);
      // Limpiamos los montos mixtos
      setEfectivoMixto(0);
      setDigitalMixto(0);
    });
    fetchProductosCarrito();
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      socket.off("cambios", fetchProductosCarrito);
      socket.off("error-cuit-invalido");
      socket.off("error-no-cuit");
      socket.off("compra-finalizada");
      socket.off("productos-carrito", setProductos);
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  return (
    <div className="ventas-container">
      <div className="productos-section">
        <div className="productos-list">
          {productos.map((producto) => (
            <ProductoItem
              key={producto._id}
              producto={producto}
              borrarCarrito={() => socket.emit("toggle-carrito", producto._id)}
              handleCantidad={(delta) =>
                handleCantidad(producto._id, delta, producto.cantidad)
              }
              handleInputChange={(value) =>
                handleInputChange(producto._id, value, producto.cantidad)
              }
            />
          ))}
        </div>
      </div>
      <ResumenCompra
        total={total}
        formaPago={formaPago}
        handleFormaPagoClick={handleFormaPagoClick}
        factura={factura}
        handleFacturaClick={handleFacturaClick}
        pedirCuit={pedirCuit}
        cuit={cuit}
        setCUIT={setCUIT}
        pedirData={pedirData}
        dni={dni}
        setDNI={setDNI}
        nombre={nombre}
        setNombre={setNombre}
        domicilio={domicilio}
        setDomicilio={setDomicilio}
        todoOK={todoOK}
        finalizar={finalizar}
        descuento={descuento}
        detalle={detalle}
        setDetalle={setDetalle}
        setDescuento={setDescuento}
        totalFinal={totalFinal}
        compraEnProceso={compraEnProceso}
        // Pasamos también los montos mixtos y sus setters
        efectivoMixto={efectivoMixto}
        setEfectivoMixto={setEfectivoMixto}
        digitalMixto={digitalMixto}
        setDigitalMixto={setDigitalMixto}
      />
    </div>
  );
};

const ProductoItem = ({
  producto,
  borrarCarrito,
  handleCantidad,
  handleInputChange,
}) => (
  <div className="div-eliminar">
    <div className="producto-acciones div-boton-venta">
      <button onClick={borrarCarrito} className="boton-venta">
        <i className="bi bi-x-circle-fill"></i>
      </button>
    </div>
    <div className="producto-item">
      <div className="producto-imagen">
        <img src={fotoSrc(producto.foto, producto._id)} alt={producto.nombre} />
      </div>
      <div className="producto-detalle">
        <div className="producto-detalle-div">
          <div className="titulo-precio">
            <p className="producto-nombre">{producto.nombre}</p>
          </div>
          <p className="producto-cantidad">
            <button
              onClick={() => handleCantidad(-1)}
              className="boton-venta boton-cantidad"
            >
              <i className="bi bi-dash-circle"></i>
            </button>
            <input
              type="text"
              value={producto.carritoCantidad}
              onChange={(e) => handleInputChange(e.target.value)}
              pattern="[0-9]*"
            />
            <button
              onClick={() => handleCantidad(1)}
              className="boton-venta boton-cantidad"
            >
              <i className="bi bi-plus-circle"></i>
            </button>
          </p>
          <p className="producto-cantidad disponibles">
            {producto.cantidad} disponibles
          </p>
        </div>
        <div>
          <div className="producto-precio subtotal-carrito">
            <NumericFormat
              displayType="text"
              prefix="$"
              value={producto.venta}
              thousandSeparator="."
              decimalSeparator=","
            />
            <p className="negrita">x {producto.carritoCantidad} = </p>
            <NumericFormat
              displayType="text"
              prefix="$"
              value={producto.venta * producto.carritoCantidad}
              thousandSeparator="."
              decimalSeparator=","
            />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ResumenCompra = ({
  totalFinal,
  detalle,
  setDetalle,
  descuento,
  setDescuento,
  total,
  formaPago,
  handleFormaPagoClick,
  factura,
  handleFacturaClick,
  pedirCuit,
  cuit,
  setCUIT,
  pedirData,
  dni,
  setDNI,
  nombre,
  setNombre,
  domicilio,
  setDomicilio,
  todoOK,
  finalizar,
  compraEnProceso,
  // Recibimos los montos para pago mixto
  efectivoMixto,
  setEfectivoMixto,
  digitalMixto,
  setDigitalMixto,
}) => (
  <div className="resumen-section">
    <div>
      <h2>RESUMEN DE COMPRA</h2>
      <div className="div-total">
        <NumericFormat
          displayType="text"
          prefix="SUBTOTAL: $"
          value={total}
          thousandSeparator="."
          decimalSeparator=","
        />
      </div>
      <div className="descuento-div">
        <span>DESCUENTO</span>
        <NumericFormat
          prefix="$"
          className="input-cuit"
          value={descuento}
          thousandSeparator="."
          decimalSeparator=","
          isAllowed={(values) => {
            const { floatValue } = values;
            return floatValue === undefined || floatValue <= total;
          }}
          onValueChange={(values) => {
            setDescuento(values.floatValue || 0);
          }}
        />
      </div>
      <div className="descuento-div">
        <span>DETALLE</span>
        <input
          type="text"
          className="input-cuit"
          value={detalle}
          onChange={(e) => {
            setDetalle(e.target.value);
          }}
        />
      </div>
      <div className="div-total">
        <NumericFormat
          displayType="text"
          prefix="TOTAL: $"
          value={totalFinal}
          thousandSeparator="."
          decimalSeparator=","
        />
      </div>
    </div>
    <div>
      <h2>FORMA DE PAGO</h2>
      <div className="formapago-buttons">
        <button
          className={`button-formpago ${
            formaPago === "EFECTIVO" ? "active" : ""
          }`}
          onClick={() => handleFormaPagoClick("EFECTIVO")}
        >
          EFECTIVO
        </button>
        <button
          className={`button-formpago ${
            formaPago === "DIGITAL" ? "active" : ""
          }`}
          onClick={() => handleFormaPagoClick("DIGITAL")}
        >
          DIGITAL
        </button>
        {/* Nuevo botón MIXTO */}
        <button
          className={`button-formpago ${formaPago === "MIXTO" ? "active" : ""}`}
          onClick={() => handleFormaPagoClick("MIXTO")}
        >
          MIXTO
        </button>
      </div>
      {/* Inputs para pago mixto, solo si formaPago === "MIXTO" */}
      {formaPago === "MIXTO" && (
        <div style={{ marginTop: "1rem" }}>
          <div className="div-cuit">
            <span>EFECTIVO</span>
            <NumericFormat
              prefix="$"
              className="input-cuit"
              value={efectivoMixto}
              thousandSeparator="."
              decimalSeparator=","
              onValueChange={(values) => {
                setEfectivoMixto(values.floatValue || 0);
              }}
            />
          </div>
          <div className="div-cuit">
            <span>DIGITAL</span>
            <NumericFormat
              prefix="$"
              className="input-cuit"
              value={digitalMixto}
              thousandSeparator="."
              decimalSeparator=","
              onValueChange={(values) => {
                setDigitalMixto(values.floatValue || 0);
              }}
            />
          </div>
        </div>
      )}
    </div>
    <div>
      <h2>FACTURA</h2>
      <div className="formapago-buttons">
        <button
          className={`button-formpago ${factura === "A" ? "active" : ""}`}
          onClick={() => handleFacturaClick("A")}
        >
          A
        </button>
        <button
          className={`button-formpago ${factura === "B" ? "active" : ""}`}
          onClick={() => handleFacturaClick("B")}
        >
          B
        </button>
      </div>
    </div>
    {pedirData && (
      <DatosCompra
        dni={dni}
        setDNI={setDNI}
        nombre={nombre}
        setNombre={setNombre}
        domicilio={domicilio}
        setDomicilio={setDomicilio}
      />
    )}
    {pedirCuit && <CUITInput cuit={cuit} setCUIT={setCUIT} />}
    {todoOK && (
      <div className="div-boton-finalizar">
        <button
          onClick={finalizar}
          className="boton-finalizar"
          disabled={compraEnProceso}
        >
          {compraEnProceso ? "Procesando..." : "FINALIZAR"}
        </button>
      </div>
    )}
  </div>
);

const DatosCompra = ({
  dni,
  setDNI,
  nombre,
  setNombre,
  domicilio,
  setDomicilio,
}) => {
  return (
    <>
      <div className="div-cuit">
        <span>DNI</span>
        <NumericFormat
          className="input-cuit"
          value={dni}
          thousandSeparator="."
          decimalSeparator=","
          onValueChange={(e) => setDNI(e.floatValue)}
        />
      </div>
      <div className="div-cuit">
        <span>NOMBRE</span>
        <input
          className="input-cuit"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value.toUpperCase())}
        />
      </div>
      <div className="div-cuit">
        <span>DOMICILIO</span>
        <input
          className="input-cuit"
          type="text"
          value={domicilio}
          onChange={(e) => setDomicilio(e.target.value.toUpperCase())}
        />
      </div>
    </>
  );
};

const CUITInput = ({ cuit, setCUIT }) => (
  <div className="div-cuit">
    <span>CUIT</span>
    <PatternFormat
      className="input-cuit"
      format="##-##.###.###-#"
      mask="_"
      allowEmptyFormatting
      value={cuit}
      onValueChange={(e) => setCUIT(e.value)}
    />
  </div>
);

export default Carrito;
