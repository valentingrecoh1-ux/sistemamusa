import React, { useState, useEffect } from "react";
import { socket, IP, fotoSrc } from "../main";
import { NumericFormat } from "react-number-format";

function Info() {
  const [productos, setProductos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [producto, setProducto] = useState({
    codigo: "",
    bodega: "",
    cepa: "",
    nombre: "",
    year: "",
    origen: "",
    venta: "",
    cantidad: "",
    descripcion: "",
    foto: null,
    carrito: false,
    favorito: false,
  });
  const [showModal, setShowModal] = useState(false);
  const [inputBuffer, setInputBuffer] = useState("");

  const [isFavorito, setIsFavorito] = useState(false);
  const [isCarrito, setIsCarrito] = useState(false);

  const [ordenadoCantidad, setOrdenadoCantidad] = useState(false);
  const [ordenadoCepa, setOrdenadoCepa] = useState(false);

  const toggleFavorito = (event) => {
    setIsFavorito(!isFavorito);
    event.currentTarget.blur(); // Quita el enfoque del botón después de hacer clic
    // Aquí puedes agregar la lógica para enviar el estado actualizado al backend, si es necesario
  };

  const toggleCarrito = (event) => {
    setIsCarrito(!isCarrito);
    event.currentTarget.blur(); // Quita el enfoque del botón después de hacer clic
    // Aquí puedes agregar la lógica para enviar el estado actualizado al backend, si es necesario
  };

  const fetchProductos = (
    page,
    search,
    isCarrito,
    isFavorito,
    ordenadoCantidad,
    ordenadoCepa
  ) =>
    socket.emit("request-productos", {
      page,
      search,
      isCarrito,
      isFavorito,
      ordenadoCantidad,
      ordenadoCepa,
    });

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.select();
    }
  };

  const handleGlobalKeyDown = (e) => {
    setInputBuffer((prevBuffer) => {
      if (e.key === "Enter") {
        console.log("Enviando código al backend:", prevBuffer);
        socket.emit("scan-code", prevBuffer);
        return "";
      }
      const newBuffer = prevBuffer + e.key;
      return newBuffer;
    });

    setTimeout(() => {
      setInputBuffer("");
    }, 3000);
  };

  const productoEncontrado = (prod) => {
    if (prod === "error") {
      alert("No se encontró ningún producto con ese código");
    } else {
      setProducto(prod);
      setShowModal(true);
    }
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const productoClickeado = (codigo) => {
    socket.emit("scan-code", codigo);
  };

  const toggleFavorite = () => {
    socket.emit("toggle-favorito", producto._id);
  };

  const toggleCarritoMini = () => {
    socket.emit("toggle-carrito", producto._id);
  };

  const agregarCarrito = (id) => {
    socket.emit("toggle-carrito", id);
  };

  const agregarFavorito = (id) => {
    socket.emit("toggle-favorito", id);
  };

  const resetTable = () => {
    socket.emit("reset-fav-carrito");
    setIsCarrito(false);
    setIsFavorito(false);
  };

  useEffect(() => {
    socket.on("cambios", () => {
      if (showModal) {
        socket.emit("scan-code", producto.codigo);
      }
      fetchProductos(
        page,
        search,
        isCarrito,
        isFavorito,
        ordenadoCantidad,
        ordenadoCepa
      );
    });
    socket.on("producto-encontrado", (prod) => {
      productoEncontrado(prod);
    });
    socket.on("response-productos", (data) => {
      if (data.status === "error") {
        console.error(data.message);
        return;
      }
      setProductos(data.productos);
      setTotalPages(data.totalPages);
    });

    fetchProductos(
      page,
      search,
      isCarrito,
      isFavorito,
      ordenadoCantidad,
      ordenadoCepa
    );

    document.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      socket.off("cambios");
      socket.off("producto-encontrado");
      socket.off("response-productos");
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [
    page,
    search,
    producto,
    showModal,
    isCarrito,
    isFavorito,
    ordenadoCantidad,
    ordenadoCepa,
  ]);

  return (
    <div className="tabla-container-info">
      <div className="buscador">
        <button className={`toggle-reload toggle-button`} onClick={resetTable}>
          <i className="bi bi-arrow-counterclockwise"></i>
        </button>
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
        <div className="buscar-favorito">
          <button
            className={`toggle-button ${isFavorito ? "active" : ""}`}
            onClick={toggleFavorito}
          >
            <i className="bi bi-heart-fill"></i>
          </button>
          <button
            className={`toggle-carrito toggle-button ${
              isCarrito ? "active" : ""
            }`}
            onClick={toggleCarrito}
          >
            <i className="carrito-toggle bi bi-cart4"></i>
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
              <th
                className="th-cantidad"
                onClick={() => setOrdenadoCepa((prev) => !prev)}
              >
                Cepa {ordenadoCepa && <i className="bi bi-arrow-bar-down"></i>}
              </th>
              <th>Posicion</th>
              <th>Origen</th>
              <th>Venta</th>
              <th
                className="th-cantidad"
                onClick={() => setOrdenadoCantidad((prev) => !prev)}
              >
                Cantidad{" "}
                {ordenadoCantidad && <i className="bi bi-arrow-bar-down"></i>}
              </th>
              <th>Foto</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productos?.map((producto) => (
              <tr className="tr-info" key={producto._id}>
                <td onClick={() => productoClickeado(producto.codigo)}>
                  {producto.codigo}
                </td>
                <td onClick={() => productoClickeado(producto.codigo)}>
                  {producto.nombre}
                </td>
                <td onClick={() => productoClickeado(producto.codigo)}>
                  {producto.year}
                </td>
                <td onClick={() => productoClickeado(producto.codigo)}>
                  {producto.bodega}
                </td>
                <td onClick={() => productoClickeado(producto.codigo)}>
                  {producto.cepa}
                </td>
                <td onClick={() => productoClickeado(producto.codigo)}>
                  {producto.posicion}
                </td>
                <td onClick={() => productoClickeado(producto.codigo)}>
                  {producto.origen}
                </td>
                <td onClick={() => productoClickeado(producto.codigo)}>
                  <NumericFormat
                    prefix="$"
                    displayType="text"
                    value={producto.venta}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </td>
                <td onClick={() => productoClickeado(producto.codigo)}>
                  {producto.cantidad}
                </td>
                <td
                  onClick={() => productoClickeado(producto.codigo)}
                  className="foto-fav"
                >
                  <img width="40px" src={fotoSrc(producto.foto)} alt="" />
                  <span
                    className="fav"
                    style={{ color: producto.favorito && "red" }}
                  >
                    <i
                      className={producto.favorito ? "bi bi-heart-fill" : ""}
                    ></i>
                  </span>
                  <span className="carrito-foto">
                    <i className={producto.carrito ? "bi bi-cart4" : ""}></i>
                  </span>
                </td>
                <td
                  onClick={() => agregarCarrito(producto._id)}
                  className="carrito"
                >
                  <span>
                    <i className="bi bi-cart4"></i>
                  </span>
                </td>
                <td
                  onClick={() => agregarFavorito(producto._id)}
                  className="td-fav"
                >
                  <span>
                    <i className="bi bi-heart-fill"></i>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

      {/* Modal */}
      {showModal && (
        <div className="modal">
          <div className="modal-body">
            <span className="close" onClick={closeModal}>
              <i className="bi bi-x-circle-fill"></i>
            </span>
            <div className="modal-image">
              <img src={fotoSrc(producto.foto)} alt={producto.nombre} />
            </div>
            <div className="modal-info">
              <div className="nombre-anio">
                <span className="nombre">{producto.nombre.toUpperCase()}</span>
                <span className="año">{producto.year}</span>
              </div>
              <div className="cepa">
                <span>
                  {producto.cepa} de {producto.origen}
                </span>
              </div>
              <div className="descripcion">
                <span>{producto.descripcion}</span>
              </div>
              <div className="modal-precios">
                <div className="modal-precios-stock">
                  <span>
                    <i className="bi bi-tags"></i>{" "}
                    <NumericFormat
                      prefix="$"
                      displayType="text"
                      value={producto.venta}
                      thousandSeparator="."
                      decimalSeparator=","
                    />
                  </span>
                  <span>
                    <i className="bi bi-box-seam"></i> {producto.cantidad}
                  </span>
                </div>
                <span className="producto-posicion-modal">
                  {producto.posicion}
                </span>
                <span className="carrito-mini" onClick={toggleCarritoMini}>
                  <i
                    className={
                      producto.carrito ? "bi bi-cart-check-fill" : "bi bi-cart"
                    }
                  ></i>
                </span>
                <span
                  className="fav"
                  onClick={toggleFavorite}
                  style={{ color: producto.favorito ? "red" : "black" }}
                >
                  <i
                    className={
                      producto.favorito ? "bi bi-heart-fill" : "bi bi-heart"
                    }
                  ></i>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Info;
