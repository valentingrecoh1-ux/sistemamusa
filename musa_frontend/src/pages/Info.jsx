import React, { useState, useEffect } from "react";
import { socket, IP, fotoSrc } from "../main";
import { NumericFormat } from "react-number-format";
import Pagination from "../components/shared/Pagination";
import s from "./Info.module.css";

function Info() {
  const [productos, setProductos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProductos, setTotalProductos] = useState(0);
  const [stockTotal, setStockTotal] = useState(0);
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
  const [generandoFotoIA, setGenerandoFotoIA] = useState(false);
  const [generandoDescIA, setGenerandoDescIA] = useState(false);

  const [isFavorito, setIsFavorito] = useState(false);
  const [isCarrito, setIsCarrito] = useState(false);

  // "" = sin orden, "asc" = ascendente, "desc" = descendente
  const [ordenadoCantidad, setOrdenadoCantidad] = useState("");
  const [ordenadoCepa, setOrdenadoCepa] = useState("");

  const cycleSort = (setter) => {
    setter((prev) => (prev === "" ? "asc" : prev === "asc" ? "desc" : ""));
  };

  const sortIcon = (val) =>
    val === "asc" ? "bi-sort-up" : val === "desc" ? "bi-sort-down" : "bi-chevron-expand";

  // ── Filtros por columna ──
  const [filtroCepa, setFiltroCepa] = useState("");
  const [filtroBodega, setFiltroBodega] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState("");
  const [filtroYear, setFiltroYear] = useState("");
  const [filtrosOpciones, setFiltrosOpciones] = useState({ cepas: [], bodegas: [], origenes: [], years: [] });
  const [brokenImgs, setBrokenImgs] = useState(new Set());

  const hayFiltros = filtroCepa || filtroBodega || filtroOrigen || filtroYear;

  const limpiarFiltros = () => {
    setFiltroCepa("");
    setFiltroBodega("");
    setFiltroOrigen("");
    setFiltroYear("");
    setPage(1);
  };

  const toggleFavorito = (event) => {
    setIsFavorito(!isFavorito);
    event.currentTarget.blur();
  };

  const toggleCarrito = (event) => {
    setIsCarrito(!isCarrito);
    event.currentTarget.blur();
  };

  const fetchProductos = () =>
    socket.emit("request-productos", {
      page,
      search,
      isCarrito,
      isFavorito,
      ordenadoCantidad,
      ordenadoCepa,
      filtroCepa,
      filtroBodega,
      filtroOrigen,
      filtroYear,
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

  const agregarCarrito = (id, e) => {
    e.stopPropagation();
    socket.emit("toggle-carrito", id);
  };

  const agregarFavorito = (id, e) => {
    e.stopPropagation();
    socket.emit("toggle-favorito", id);
  };

  const resetTable = () => {
    socket.emit("reset-fav-carrito");
    setIsCarrito(false);
    setIsFavorito(false);
    limpiarFiltros();
  };

  const mejorarFotoIA = () => {
    if (generandoFotoIA || !producto?._id) return;
    setGenerandoFotoIA(true);
    socket.emit("mejorar-foto-ia", producto._id, (res) => {
      setGenerandoFotoIA(false);
      if (res.error) alert("Error: " + res.error);
    });
  };

  const toggleFotoIA = () => {
    if (!producto?._id) return;
    socket.emit("toggle-foto-ia", producto._id, (res) => {
      if (res.error) alert("Error: " + res.error);
    });
  };

  const generarDescIA = () => {
    if (generandoDescIA || !producto?._id) return;
    setGenerandoDescIA(true);
    socket.emit("generar-descripcion-ia", producto._id, (res) => {
      setGenerandoDescIA(false);
      if (res.error) alert("Error: " + res.error);
    });
  };

  const toggleDescIA = () => {
    if (!producto?._id) return;
    socket.emit("toggle-descripcion-ia", producto._id, (res) => {
      if (res.error) alert("Error: " + res.error);
    });
  };

  const stockColor = (cant) => {
    const n = parseInt(cant) || 0;
    if (n <= 0) return s.stockOut;
    if (n <= 3) return s.stockLow;
    if (n <= 10) return s.stockMid;
    return s.stockOk;
  };

  // Click en una celda de columna filtrable → setea el filtro con ese valor
  const filtrarPor = (setter, valor, e) => {
    e.stopPropagation();
    setter((prev) => (prev === valor ? "" : valor));
    setPage(1);
  };

  useEffect(() => {
    socket.on("cambios", () => {
      if (showModal) {
        socket.emit("scan-code", producto.codigo);
      }
      fetchProductos();
      socket.emit("request-filtros-productos");
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
      setTotalProductos(data.totalProductos || 0);
      setStockTotal(data.stockTotal || 0);
    });
    socket.on("response-filtros-productos", (data) => {
      setFiltrosOpciones(data);
    });

    fetchProductos();
    socket.emit("request-filtros-productos");

    document.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      socket.off("cambios");
      socket.off("producto-encontrado");
      socket.off("response-productos");
      socket.off("response-filtros-productos");
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
    filtroCepa,
    filtroBodega,
    filtroOrigen,
    filtroYear,
  ]);

  return (
    <div className={s.container}>
      {/* Stats bar */}
      <div className={s.statsBar}>
        <div className={s.statItem}>
          <i className="bi bi-box-seam"></i>
          <span className={s.statValue}>{stockTotal}</span>
          <span className={s.statLabel}>botellas en stock</span>
        </div>
        <div className={s.statItem}>
          <i className="bi bi-list-ul"></i>
          <span className={s.statValue}>{totalProductos}</span>
          <span className={s.statLabel}>productos</span>
        </div>
      </div>

      {/* Search + controls */}
      <div className={s.searchBar}>
        <button className={s.resetBtn} onClick={resetTable} title="Resetear filtros, favoritos y carrito">
          <i className="bi bi-arrow-counterclockwise"></i>
        </button>
        <div className={s.searchWrap}>
          <i className={`bi bi-search ${s.searchIcon}`}></i>
          <input
            className={s.searchInput}
            type="text"
            placeholder="Buscar por nombre, codigo, bodega, cepa..."
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
        <div className={s.toggleGroup}>
          <button
            className={`${s.toggleBtn} ${s.toggleFav} ${isFavorito ? s.toggleFavActive : ""}`}
            onClick={toggleFavorito}
            title="Filtrar favoritos"
          >
            <i className="bi bi-heart-fill"></i>
          </button>
          <button
            className={`${s.toggleBtn} ${s.toggleCart} ${isCarrito ? s.toggleCartActive : ""}`}
            onClick={toggleCarrito}
            title="Filtrar carrito"
          >
            <i className="bi bi-cart4"></i>
          </button>
        </div>
      </div>

      {/* Active filters */}
      {hayFiltros && (
        <div className={s.activeFilters}>
          <span className={s.activeFiltersLabel}>Filtros:</span>
          {filtroCepa && (
            <button className={s.filterChip} onClick={() => { setFiltroCepa(""); setPage(1); }}>
              Cepa: {filtroCepa} <i className="bi bi-x"></i>
            </button>
          )}
          {filtroBodega && (
            <button className={s.filterChip} onClick={() => { setFiltroBodega(""); setPage(1); }}>
              Bodega: {filtroBodega} <i className="bi bi-x"></i>
            </button>
          )}
          {filtroOrigen && (
            <button className={s.filterChip} onClick={() => { setFiltroOrigen(""); setPage(1); }}>
              Origen: {filtroOrigen} <i className="bi bi-x"></i>
            </button>
          )}
          {filtroYear && (
            <button className={s.filterChip} onClick={() => { setFiltroYear(""); setPage(1); }}>
              Año: {filtroYear} <i className="bi bi-x"></i>
            </button>
          )}
          <button className={s.filterClearAll} onClick={limpiarFiltros}>
            Limpiar todo
          </button>
        </div>
      )}

      {/* Table */}
      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.thProducto}>Producto</th>
              <th
                className={`${s.sortable} ${ordenadoCepa ? s.sortActive : ""}`}
                onClick={() => cycleSort(setOrdenadoCepa)}
              >
                Cepa
                <i className={`bi ${sortIcon(ordenadoCepa)} ${s.sortIcon}`}></i>
              </th>
              <th>Bodega</th>
              <th>Origen</th>
              <th>Posicion</th>
              <th>Precio</th>
              <th
                className={`${s.sortable} ${ordenadoCantidad ? s.sortActive : ""}`}
                onClick={() => cycleSort(setOrdenadoCantidad)}
              >
                Stock
                <i className={`bi ${sortIcon(ordenadoCantidad)} ${s.sortIcon}`}></i>
              </th>
              <th className={s.thActions}></th>
            </tr>
          </thead>
          <tbody>
            {productos?.map((prod) => (
              <tr
                className={s.clickableRow}
                key={prod._id}
                onClick={() => productoClickeado(prod.codigo)}
              >
                {/* Producto: foto + nombre + codigo + year */}
                <td className={s.productCell}>
                  {!brokenImgs.has(prod._id) ? (
                    <img
                      className={s.thumbnail}
                      src={fotoSrc(prod.foto, prod._id)}
                      alt=""
                      loading="lazy"
                      onError={() => setBrokenImgs((prev) => new Set(prev).add(prod._id))}
                    />
                  ) : (
                    <div className={s.thumbnailPlaceholder}>
                      <i className="bi bi-image"></i>
                    </div>
                  )}
                  <div className={s.productInfo}>
                    <div className={s.productNameRow}>
                      <span className={s.productName}>{prod.nombre}</span>
                      {prod.year && <span className={s.yearBadge}>{prod.year}</span>}
                    </div>
                    <span className={s.productCode}>
                      <i className="bi bi-upc-scan"></i> {prod.codigo}
                    </span>
                  </div>
                </td>
                <td>
                  {prod.cepa && (
                    <span
                      className={`${s.filterableCell} ${filtroCepa === prod.cepa ? s.filterActive : ""}`}
                      onClick={(e) => filtrarPor(setFiltroCepa, prod.cepa, e)}
                      title={`Filtrar por ${prod.cepa}`}
                    >
                      {prod.cepa}
                    </span>
                  )}
                </td>
                <td>
                  {prod.bodega && (
                    <span
                      className={`${s.filterableCell} ${filtroBodega === prod.bodega ? s.filterActive : ""}`}
                      onClick={(e) => filtrarPor(setFiltroBodega, prod.bodega, e)}
                      title={`Filtrar por ${prod.bodega}`}
                    >
                      {prod.bodega}
                    </span>
                  )}
                </td>
                <td>
                  {prod.origen && (
                    <span
                      className={`${s.filterableCell} ${filtroOrigen === prod.origen ? s.filterActive : ""}`}
                      onClick={(e) => filtrarPor(setFiltroOrigen, prod.origen, e)}
                      title={`Filtrar por ${prod.origen}`}
                    >
                      {prod.origen}
                    </span>
                  )}
                </td>
                <td>
                  {prod.posicion && (
                    <span className={s.positionBadge}>{prod.posicion}</span>
                  )}
                </td>
                <td className={s.priceCell}>
                  <NumericFormat
                    prefix="$"
                    displayType="text"
                    value={prod.venta}
                    thousandSeparator="."
                    decimalSeparator=","
                  />
                </td>
                <td>
                  {(!prod.tipo || prod.tipo === "vino") ? (
                    <span className={`${s.stockBadge} ${stockColor(prod.cantidad)}`}>
                      {prod.cantidad}
                    </span>
                  ) : (
                    <span className={s.tipoBadge}>
                      {prod.tipo === "articulo" ? "Artículo" : "Servicio"}
                    </span>
                  )}
                </td>
                <td className={s.actionsCell}>
                  <button
                    className={`${s.actionBtn} ${prod.carrito ? s.actionCartActive : s.actionCartBtn}`}
                    onClick={(e) => agregarCarrito(prod._id, e)}
                    title={prod.carrito ? "Quitar del carrito" : "Agregar al carrito"}
                  >
                    <i className={prod.carrito ? "bi bi-cart-check-fill" : "bi bi-cart-plus"}></i>
                  </button>
                  <button
                    className={`${s.actionBtn} ${prod.favorito ? s.actionFavActive : s.actionFavBtn}`}
                    onClick={(e) => agregarFavorito(prod._id, e)}
                    title={prod.favorito ? "Quitar de favoritos" : "Agregar a favoritos"}
                  >
                    <i className={prod.favorito ? "bi bi-heart-fill" : "bi bi-heart"}></i>
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

      {/* Modal */}
      {showModal && (
        <div className={s.modalOverlay} onClick={closeModal}>
          <div className={s.modalBody} onClick={(e) => e.stopPropagation()}>
            <button className={s.closeBtn} onClick={closeModal}>
              <i className="bi bi-x-lg"></i>
            </button>
            <div className={s.modalLeft}>
              <div className={s.modalImage}>
                <img src={fotoSrc(producto.foto, producto._id)} alt={producto.nombre} onError={(e) => { e.target.style.display = 'none'; }} />
              </div>

              {/* ── Seccion IA ── */}
              <div className={s.iaPanel}>
                <h4 className={s.iaPanelTitle}><i className="bi bi-stars"></i> Inteligencia Artificial</h4>
                <div className={s.iaRow}>
                  <span className={s.iaRowLabel}>Foto</span>
                  <div className={s.iaRowActions}>
                    <button
                      className={s.iaBtn}
                      disabled
                      title="Temporalmente no disponible"
                      style={{ opacity: 0.45, cursor: 'not-allowed' }}
                    >
                      <i className="bi bi-magic"></i> {producto.fotoIA ? 'Regenerar' : 'Generar'}
                    </button>
                    {producto.fotoIA && (
                      <button
                        className={`${s.iaToggle} ${producto.usarFotoIA ? s.iaToggleOn : ''}`}
                        disabled
                        style={{ opacity: 0.45, cursor: 'not-allowed' }}
                      >
                        {producto.usarFotoIA ? <><i className="bi bi-check-circle-fill"></i> IA activa</> : <><i className="bi bi-circle"></i> Usar IA</>}
                      </button>
                    )}
                  </div>
                </div>
                <div className={s.iaRow}>
                  <span className={s.iaRowLabel}>Descripcion</span>
                  <div className={s.iaRowActions}>
                    <button
                      className={s.iaBtn}
                      onClick={generarDescIA}
                      disabled={generandoDescIA}
                    >
                      {generandoDescIA ? (
                        <><i className="bi bi-hourglass-split"></i> Generando...</>
                      ) : (
                        <><i className="bi bi-magic"></i> {producto.descripcionGenerada ? 'Regenerar' : 'Generar'}</>
                      )}
                    </button>
                    {producto.descripcionGenerada && (
                      <button
                        className={`${s.iaToggle} ${producto.usarDescripcionIA ? s.iaToggleOn : ''}`}
                        onClick={toggleDescIA}
                      >
                        {producto.usarDescripcionIA ? <><i className="bi bi-check-circle-fill"></i> IA activa</> : <><i className="bi bi-circle"></i> Usar IA</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={s.modalInfo}>
              <div className={s.modalHeader}>
                <div className={s.modalNameRow}>
                  <span className={s.modalName}>{producto.nombre}</span>
                  {producto.year && <span className={s.modalYearBadge}>{producto.year}</span>}
                </div>
                <span className={s.modalBodega}>{producto.bodega}</span>
                <span className={s.modalCodigo}>
                  <i className="bi bi-upc-scan"></i> {producto.codigo}
                </span>
              </div>

              <div className={s.modalTags}>
                {producto.cepa && <span className={s.modalTag}><i className="bi bi-droplet"></i> {producto.cepa}</span>}
                {producto.origen && <span className={s.modalTag}><i className="bi bi-geo-alt"></i> {producto.origen}</span>}
                {producto.posicion && <span className={s.modalTagAccent}><i className="bi bi-geo"></i> {producto.posicion}</span>}
              </div>

              {(producto.descripcion || producto.descripcionGenerada) && (
                <div className={s.modalDescripcion}>
                  <p>{producto.usarDescripcionIA && producto.descripcionGenerada ? producto.descripcionGenerada : producto.descripcion}</p>
                  {producto.usarDescripcionIA && <span className={s.iaUsandoTag}><i className="bi bi-stars"></i> IA</span>}
                </div>
              )}

              <div className={s.modalFooter}>
                <div className={s.modalFooterLeft}>
                  <div className={s.modalPrice}>
                    <NumericFormat
                      prefix="$"
                      displayType="text"
                      value={producto.venta}
                      thousandSeparator="."
                      decimalSeparator=","
                    />
                  </div>
                  <div className={s.modalPriceDivider}></div>
                  <div className={`${s.modalStock} ${stockColor(producto.cantidad)}`}>
                    <i className="bi bi-box-seam"></i> {producto.cantidad} en stock
                  </div>
                </div>
                <div className={s.modalActions}>
                  <button
                    className={`${s.modalActionBtn} ${producto.carrito ? s.modalCartActive : s.modalCartBtn}`}
                    onClick={toggleCarritoMini}
                  >
                    <i className={producto.carrito ? "bi bi-cart-check-fill" : "bi bi-cart-plus"}></i>
                    <span>{producto.carrito ? "En carrito" : "Agregar"}</span>
                  </button>
                  <button
                    className={`${s.modalActionBtn} ${producto.favorito ? s.modalFavActiveBtn : s.modalFavBtn}`}
                    onClick={toggleFavorite}
                  >
                    <i className={producto.favorito ? "bi bi-heart-fill" : "bi bi-heart"}></i>
                    <span>{producto.favorito ? "Favorito" : "Favorito"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Info;
