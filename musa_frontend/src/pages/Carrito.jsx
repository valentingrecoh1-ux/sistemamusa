import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { IP, socket, fotoSrc } from "../main";
import { NumericFormat } from "react-number-format";
import s from "./Carrito.module.css";

const LIMITE_EFECTIVO = 10000000;
const LIMITE_DIGITAL = 10000000;
const DETALLE_STORAGE_KEY = "musa.carrito.detalle_descuento_historial";
const MAX_DETALLES_GUARDADOS = 15;
const PORCENTAJES_DESCUENTO = [5, 10, 15, 20];

const normalizarDetalle = (texto = "") => texto.trim().replace(/\s+/g, " ");
const calcularDescuentoPorcentaje = (subtotal, porcentaje) =>
  Math.round(subtotal * porcentaje) / 100;
const formatearCUIT = (digitos = "") => {
  const limpio = String(digitos).replace(/\D/g, "").slice(0, 11);
  if (limpio.length <= 2) return limpio;
  if (limpio.length <= 10) return `${limpio.slice(0, 2)}-${limpio.slice(2)}`;
  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10)}`;
};
const redondearMoneda = (valor = 0) =>
  Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
const limitarMonto = (valor, maximo) => {
  const max = Math.max(0, redondearMoneda(maximo));
  return Math.min(Math.max(0, redondearMoneda(valor || 0)), max);
};

const Carrito = () => {
  const navegar = useNavigate();
  const [productos, setProductos] = useState([]);
  const [total, setTotal] = useState(0);

  const [totalFinal, setTotalFinal] = useState(0);

  const [inputBuffer, setInputBuffer] = useState("");

  const [descuento, setDescuento] = useState(0);
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(null);
  const [detalle, setDetalle] = useState("");
  const [detalleHistorial, setDetalleHistorial] = useState([]);

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

  const guardarDetalleEnHistorial = useCallback((texto) => {
    const detalleNormalizado = normalizarDetalle(texto);
    if (!detalleNormalizado) return;

    setDetalleHistorial((prevHistorial) => {
      const nuevoHistorial = [
        detalleNormalizado,
        ...prevHistorial.filter(
          (item) => item.toLowerCase() !== detalleNormalizado.toLowerCase()
        ),
      ].slice(0, MAX_DETALLES_GUARDADOS);

      localStorage.setItem(DETALLE_STORAGE_KEY, JSON.stringify(nuevoHistorial));
      return nuevoHistorial;
    });
  }, []);

  useEffect(() => {
    try {
      const historialGuardado = localStorage.getItem(DETALLE_STORAGE_KEY);
      if (!historialGuardado) return;

      const parsed = JSON.parse(historialGuardado);
      if (!Array.isArray(parsed)) return;

      const historialNormalizado = [];
      parsed.forEach((item) => {
        if (typeof item !== "string") return;
        const limpio = normalizarDetalle(item);
        if (!limpio) return;

        const yaExiste = historialNormalizado.some(
          (actual) => actual.toLowerCase() === limpio.toLowerCase()
        );

        if (!yaExiste) historialNormalizado.push(limpio);
      });

      setDetalleHistorial(historialNormalizado.slice(0, MAX_DETALLES_GUARDADOS));
    } catch {
      // Si hay basura en localStorage, ignoramos para no romper la pantalla.
    }
  }, []);

  useEffect(() => {
    if (descuento !== undefined) {
      setTotalFinal(total - descuento);
    }
  }, [total, descuento]);

  useEffect(() => {
    if (descuentoPorcentaje === null) return;

    setDescuento(calcularDescuentoPorcentaje(total, descuentoPorcentaje));
  }, [total, descuentoPorcentaje]);

  const handleInputChange = useCallback((id, value, maxCantidad) => {
    const cantidadNumerica = parseInt(value.replace(/\D/g, ""));
    const cantidad = isNaN(cantidadNumerica)
      ? 1
      : Math.min(Math.max(1, cantidadNumerica), maxCantidad);
    setProductos((prev) => prev.map((p) => p._id === id ? { ...p, carritoCantidad: cantidad } : p));
    socket.emit("actualizar-cantidad-carrito", { id, cantidad });
  }, []);

  const handleFormaPagoClick = useCallback(
    (tipo) => {
      setFormaPago(tipo);
      // En DIGITAL y MIXTO se fija factura B por defecto.
      // En EFECTIVO se mantiene sin seleccion inicial.
      setFactura(tipo === "DIGITAL" || tipo === "MIXTO" ? "B" : null);

      if (tipo === "MIXTO") {
        const totalMixto = Math.max(0, redondearMoneda(totalFinal));
        setEfectivoMixto(0);
        setDigitalMixto(totalMixto);
      }
    },
    [totalFinal]
  );

  const handleFacturaClick = useCallback(
    (tipo) => {
      // En DIGITAL y MIXTO no permitimos destildar: siempre queda A o B.
      if (formaPago === "DIGITAL" || formaPago === "MIXTO") {
        setFactura(tipo);
        return;
      }

      // En otros casos mantenemos toggle libre.
      setFactura(factura === tipo ? null : tipo);
    },
    [factura, formaPago]
  );

  const handleCantidad = useCallback(
    (id, delta, maxCantidad) => {
      setProductos((prev) => {
        const producto = prev.find((p) => p._id === id);
        if (!producto) return prev;
        const nuevaCantidad = Math.min(Math.max(1, producto.carritoCantidad + delta), maxCantidad);
        socket.emit("actualizar-cantidad-carrito", { id, cantidad: nuevaCantidad });
        return prev.map((p) => p._id === id ? { ...p, carritoCantidad: nuevaCantidad } : p);
      });
    },
    []
  );

  const finalizar = () => {
    if (compraEnProceso) return;
    setCompraEnProceso(true);
    guardarDetalleEnHistorial(detalle);

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

  const detalleBusqueda = detalle.trim().toLowerCase();
  const detalleSugerencias = detalleHistorial
    .filter(
      (item) =>
        !detalleBusqueda || item.toLowerCase().includes(detalleBusqueda)
    )
    .slice(0, 8);

  const handleGlobalKeyDown = (e) => {
    setInputBuffer((prevBuffer) => {
      if (e.key === "Enter") {
        console.log("Enviando codigo al backend:", prevBuffer);
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
        (!pedirCuit || (cuit && cuit.length === 11)) && // CUIT valido si es requerido
        (!pedirData || (dni && nombre && domicilio)); // Datos completos si son requeridos

      // Si hay un descuento distinto de 0, exigimos que `detalle` NO este vacio
      if (descuento !== 0) {
        dataComplete = dataComplete && detalle.trim() !== "";
      }

      // Si el pago es MIXTO, tambien validamos la suma de efectivoMixto + digitalMixto
      if (formaPago === "MIXTO") {
        const sumaMixto = redondearMoneda(efectivoMixto + digitalMixto);
        const totalMixto = Math.max(0, redondearMoneda(totalFinal));
        dataComplete = dataComplete && Math.abs(sumaMixto - totalMixto) <= 0.01;
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

  const borrarDelCarrito = useCallback((id) => {
    setProductos((prev) => prev.filter((p) => p._id !== id));
    socket.emit("toggle-carrito", id);
  }, []);

  useEffect(() => {
    socket.on("productos-carrito", setProductos);
    socket.on("error-cuit-invalido", () =>
      alert("PROBABLEMENTE EL CUIT INGRESADO ESTA MAL ESCRITO")
    );
    socket.on("error-no-cuit", () => alert("PROBABLEMENTE NO ES CUIT"));
    socket.on("compra-finalizada", (info) => {
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
      setDescuentoPorcentaje(null);
      setCompraEnProceso(false);
      setTodoOK(false);
      setEfectivoMixto(0);
      setDigitalMixto(0);
      // Si pago digital/mixto, navegar a Ventas para vincular MP
      if (info?.ventaId && (info.formaPago === "DIGITAL" || info.formaPago === "MIXTO")) {
        navegar("/ventas", { state: { mpLinkVenta: info } });
      }
    });
    fetchProductosCarrito();
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      socket.off("error-cuit-invalido");
      socket.off("error-no-cuit");
      socket.off("compra-finalizada");
      socket.off("productos-carrito", setProductos);
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  return (
    <div className={s.container}>
      <div className={s.productosSection}>
        <div className={s.productosList}>
          {productos.map((producto) => (
            <ProductoItem
              key={producto._id}
              producto={producto}
              borrarCarrito={() => borrarDelCarrito(producto._id)}
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
        hayProductos={productos.length > 0}
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
        descuentoPorcentaje={descuentoPorcentaje}
        setDescuentoPorcentaje={setDescuentoPorcentaje}
        porcentajesDescuento={PORCENTAJES_DESCUENTO}
        onSeleccionarPorcentajeDescuento={(porcentaje) => {
          if (descuentoPorcentaje === porcentaje) {
            setDescuentoPorcentaje(null);
            setDescuento(0);
            return;
          }

          setDescuentoPorcentaje(porcentaje);
          setDescuento(calcularDescuentoPorcentaje(total, porcentaje));
        }}
        detalle={detalle}
        setDetalle={setDetalle}
        detalleSugerencias={detalleSugerencias}
        guardarDetalleEnHistorial={guardarDetalleEnHistorial}
        setDescuento={setDescuento}
        totalFinal={totalFinal}
        compraEnProceso={compraEnProceso}
        // Pasamos tambien los montos mixtos y sus setters
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
  <div className={s.productoCard}>
    <div className={s.productoImagen}>
      <img src={fotoSrc(producto.foto, producto._id)} alt={producto.nombre} />
    </div>
    <div className={s.productoDetalle}>
      <div className={s.precioSection}>
        <span className={s.subtotalTotal}>
          <NumericFormat
            displayType="text"
            prefix="$"
            value={producto.venta * producto.carritoCantidad}
            thousandSeparator="."
            decimalSeparator=","
          />
        </span>
        <span className={s.precioUnit}>
          <NumericFormat
            displayType="text"
            prefix="$"
            value={producto.venta}
            thousandSeparator="."
            decimalSeparator=","
          />
          <span> x{producto.carritoCantidad}</span>
        </span>
      </div>
      <div className={s.productoTop}>
        <p className={s.productoNombre}>{producto.nombre}</p>
        {producto.bodega && <p className={s.productoBodega}>{producto.bodega}</p>}
        <p className={s.productoMeta}>
          {producto.cepa && <span>{producto.cepa}</span>}
          {producto.cepa && producto.year && <span> · </span>}
          {producto.year && <span>{producto.year}</span>}
        </p>
      </div>
      <div className={s.productoBottom}>
        <div className={s.cantidadControls}>
          <button
            onClick={() => handleCantidad(-1)}
            className={s.cantidadBtn}
          >
            <i className="bi bi-dash"></i>
          </button>
          <input
            type="text"
            className={s.cantidadInput}
            value={producto.carritoCantidad}
            onChange={(e) => handleInputChange(e.target.value)}
            pattern="[0-9]*"
          />
          <button
            onClick={() => handleCantidad(1)}
            className={s.cantidadBtn}
          >
            <i className="bi bi-plus"></i>
          </button>
        </div>
        <button onClick={borrarCarrito} className={s.removeBtn}>
          <i className="bi bi-trash3"></i>
        </button>
        <p className={s.productoStock}>{producto.cantidad} en stock</p>
      </div>
    </div>
  </div>
);

const ResumenCompra = ({
  hayProductos,
  totalFinal,
  detalle,
  descuentoPorcentaje,
  setDescuentoPorcentaje,
  porcentajesDescuento,
  onSeleccionarPorcentajeDescuento,
  setDetalle,
  detalleSugerencias,
  guardarDetalleEnHistorial,
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
  <div className={s.resumenSection}>
    <h2 className={s.resumenTitle}>RESUMEN DE COMPRA</h2>

    {/* Subtotal */}
    <div className={s.totalRow}>
      <span className={s.totalLabel}>Subtotal</span>
      <NumericFormat
        displayType="text"
        className={s.subtotalValue}
        prefix="$"
        value={total}
        thousandSeparator="."
        decimalSeparator=","
      />
    </div>

    {/* Descuento */}
    <div className={s.fieldGroup}>
      <span className={s.fieldLabel}>Descuento</span>
      <NumericFormat
        prefix="-$"
        className={s.fieldInput}
        value={descuento}
        thousandSeparator="."
        decimalSeparator=","
        allowNegative={false}
        isAllowed={(values) => {
          const { floatValue } = values;
          return (
            floatValue === undefined ||
            (floatValue >= 0 && floatValue <= total)
          );
        }}
        onValueChange={(values, sourceInfo) => {
          if (sourceInfo?.source === "event") {
            setDescuentoPorcentaje(null);
          }
          setDescuento(values.floatValue || 0);
        }}
      />
      <div className={s.descuentoButtons}>
        {porcentajesDescuento.map((porcentaje) => (
          <button
            key={porcentaje}
            type="button"
            className={
              descuentoPorcentaje === porcentaje
                ? s.descuentoButtonActive
                : s.descuentoButton
            }
            onClick={() => onSeleccionarPorcentajeDescuento(porcentaje)}
          >
            {porcentaje}%
          </button>
        ))}
      </div>
    </div>

    {/* Detalle */}
    {descuento > 0 && (
      <div className={s.fieldGroup}>
        <span className={s.fieldLabel}>Detalle del descuento</span>
        <input
          type="text"
          className={s.fieldInput}
          value={detalle}
          list="detalle-descuento-historial"
          autoComplete="off"
          placeholder="Ej: descuento por pago en efectivo"
          onChange={(e) => {
            setDetalle(e.target.value);
          }}
          onBlur={() => guardarDetalleEnHistorial(detalle)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardarDetalleEnHistorial(detalle);
          }}
        />
        <datalist id="detalle-descuento-historial">
          {detalleSugerencias.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </div>
    )}

    {/* Total */}
    <div className={s.totalRowFinal}>
      <span className={s.totalFinalLabel}>Total</span>
      <NumericFormat
        displayType="text"
        className={s.totalFinalValue}
        prefix="$"
        value={totalFinal}
        thousandSeparator="."
        decimalSeparator=","
      />
    </div>

    {/* Forma de Pago */}
    <div className={s.choiceSection}>
      <h2 className={s.sectionLabel}>FORMA DE PAGO</h2>
      <div className={s.buttonGroup}>
        <button
          className={formaPago === "EFECTIVO" ? s.optionBtnActive : s.optionBtn}
          onClick={() => handleFormaPagoClick("EFECTIVO")}
        >
          EFECTIVO
        </button>
        <button
          className={formaPago === "DIGITAL" ? s.optionBtnActive : s.optionBtn}
          onClick={() => handleFormaPagoClick("DIGITAL")}
        >
          DIGITAL
        </button>
        {/* Boton MIXTO */}
        <button
          className={formaPago === "MIXTO" ? s.optionBtnActive : s.optionBtn}
          onClick={() => handleFormaPagoClick("MIXTO")}
        >
          MIXTO
        </button>
      </div>
      {/* Inputs para pago mixto, solo si formaPago === "MIXTO" */}
      {formaPago === "MIXTO" && (
        <div className={s.mixtoGroup}>
          <div className={s.mixtoRow}>
            <span className={s.mixtoLabel}>Efectivo</span>
            <NumericFormat
              prefix="$"
              className={s.mixtoInput}
              value={efectivoMixto}
              thousandSeparator="."
              decimalSeparator=","
              allowNegative={false}
              isAllowed={(values) => {
                const { floatValue } = values;
                const totalMixto = Math.max(0, redondearMoneda(totalFinal));
                return (
                  floatValue === undefined ||
                  (floatValue >= 0 && floatValue <= totalMixto)
                );
              }}
              onValueChange={(values) => {
                const totalMixto = Math.max(0, redondearMoneda(totalFinal));
                const efectivo = limitarMonto(values.floatValue, totalMixto);
                setEfectivoMixto(efectivo);
                setDigitalMixto(redondearMoneda(totalMixto - efectivo));
              }}
            />
          </div>
          <div className={s.mixtoRow}>
            <span className={s.mixtoLabel}>Digital</span>
            <NumericFormat
              prefix="$"
              className={s.mixtoInput}
              value={digitalMixto}
              thousandSeparator="."
              decimalSeparator=","
              allowNegative={false}
              isAllowed={(values) => {
                const { floatValue } = values;
                const totalMixto = Math.max(0, redondearMoneda(totalFinal));
                return (
                  floatValue === undefined ||
                  (floatValue >= 0 && floatValue <= totalMixto)
                );
              }}
              onValueChange={(values) => {
                const totalMixto = Math.max(0, redondearMoneda(totalFinal));
                const digital = limitarMonto(values.floatValue, totalMixto);
                setDigitalMixto(digital);
                setEfectivoMixto(redondearMoneda(totalMixto - digital));
              }}
            />
          </div>
        </div>
      )}
    </div>

    {/* Factura */}
    <div className={s.choiceSection}>
      <h2 className={s.sectionLabel}>FACTURA</h2>
      <div className={s.buttonGroup}>
        <button
          className={factura === "A" ? s.optionBtnActive : s.optionBtn}
          onClick={() => handleFacturaClick("A")}
          disabled={!formaPago}
        >
          A
        </button>
        <button
          className={factura === "B" ? s.optionBtnActive : s.optionBtn}
          onClick={() => handleFacturaClick("B")}
          disabled={!formaPago}
        >
          B
        </button>
      </div>
    </div>

    {/* Datos Compra */}
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

    {/* CUIT */}
    {pedirCuit && <CUITInput cuit={cuit} setCUIT={setCUIT} />}

    {/* Finalizar / Observacion */}
    <div className={s.finalizarWrapper}>
      {todoOK ? (
        <button
          onClick={finalizar}
          className={s.finalizarBtn}
          disabled={compraEnProceso}
        >
          {compraEnProceso ? "Procesando..." : "FINALIZAR"}
        </button>
      ) : (
        <div className={s.finalizarHint}>
          <span className={s.finalizarHintTitle}>
            ! Falta completar:
          </span>
          <span className={s.finalizarHintText}>
            {[
              !hayProductos && "Agregar al menos un producto",
              !formaPago && "Elegir forma de pago",
              descuento > 0 &&
                !detalle.trim() &&
                "Completar detalle del descuento",
              pedirCuit &&
                (!cuit || cuit.length !== 11) &&
                "Cargar CUIT valido (11 digitos)",
              pedirData &&
                (!dni || !nombre || !domicilio) &&
                "Completar DNI, nombre y domicilio",
              formaPago === "MIXTO" &&
                Math.abs(
                  redondearMoneda(efectivoMixto + digitalMixto) -
                    Math.max(0, redondearMoneda(totalFinal))
                ) > 0.01 &&
                "En MIXTO, efectivo + digital debe igualar el total",
            ]
              .filter(Boolean)
              .join(" | ")}
          </span>
        </div>
      )}
    </div>
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
      <div className={s.dataField}>
        <span className={s.dataLabel}>DNI</span>
        <NumericFormat
          className={s.dataInput}
          value={dni}
          thousandSeparator="."
          decimalSeparator=","
          onValueChange={(e) => setDNI(e.floatValue)}
        />
      </div>
      <div className={s.dataField}>
        <span className={s.dataLabel}>NOMBRE</span>
        <input
          className={s.dataInput}
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value.toUpperCase())}
        />
      </div>
      <div className={s.dataField}>
        <span className={s.dataLabel}>DOMICILIO</span>
        <input
          className={s.dataInput}
          type="text"
          value={domicilio}
          onChange={(e) => setDomicilio(e.target.value.toUpperCase())}
        />
      </div>
    </>
  );
};

const CUITInput = ({ cuit, setCUIT }) => (
  <div className={s.dataField}>
    <span className={s.dataLabel}>CUIT</span>
    <input
      className={`${s.dataInput} ${s.cuitInput}`}
      placeholder="00-00000000-0"
      inputMode="numeric"
      value={formatearCUIT(cuit)}
      onChange={(e) => {
        const soloDigitos = e.target.value.replace(/\D/g, "").slice(0, 11);
        setCUIT(soloDigitos);
      }}
    />
  </div>
);

export default Carrito;
