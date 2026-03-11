import React, { useState, useEffect, useRef } from "react";
import { NumericFormat } from "react-number-format";
import Pagination from "../components/shared/Pagination";

import { IP, socket, fotoSrc } from "../main";
import { tienePermiso } from "../lib/permisos";
import { connectQZ, printRaw, findPrinter } from "../utils/qzPrint";
import { dialog } from "../components/shared/dialog";
import s from "./Inventario.module.css";

function Inventario({ usuario }) {
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
    tipo: "vino",
    proveedorId: "",
    proveedorNombre: "",
    stockMinimo: "3",
  });
  const fileInputRef = useRef(null);
  // Multi-foto state
  const [fotosExistentes, setFotosExistentes] = useState([]); // base64 strings from DB
  const [fotosNuevas, setFotosNuevas] = useState([]); // File objects to upload
  const [fotosNuevasPreview, setFotosNuevasPreview] = useState([]); // preview URLs
  const [fotoPrincipalIdx, setFotoPrincipalIdx] = useState(0);
  const [productos, setProductos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProductos, setTotalProductos] = useState(0);
  const [stockTotal, setStockTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [installedPrinters, setInstalledPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [useQZ, setUseQZ] = useState(false);
  const [brokenImgs, setBrokenImgs] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [historialModal, setHistorialModal] = useState(null);
  const [fotoIAModal, setFotoIAModal] = useState(null);
  const [generandoFotoIA, setGenerandoFotoIA] = useState(null);

  // Sorting
  const [ordenadoCantidad, setOrdenadoCantidad] = useState("");
  const [ordenadoCepa, setOrdenadoCepa] = useState("");

  const cycleSort = (setter) => {
    setter((prev) => (prev === "" ? "asc" : prev === "asc" ? "desc" : ""));
    setPage(1);
  };

  const sortIcon = (val) =>
    val === "asc" ? "bi-sort-up" : val === "desc" ? "bi-sort-down" : "bi-chevron-expand";

  // Filters
  const [filtroCepa, setFiltroCepa] = useState("");
  const [filtroBodega, setFiltroBodega] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState("");
  const [filtroYear, setFiltroYear] = useState("");
  const [filtrosOpciones, setFiltrosOpciones] = useState({ cepas: [], bodegas: [], origenes: [], years: [] });

  const hayFiltros = filtroCepa || filtroBodega || filtroOrigen || filtroYear;

  const limpiarFiltros = () => {
    setFiltroCepa("");
    setFiltroBodega("");
    setFiltroOrigen("");
    setFiltroYear("");
    setPage(1);
  };

  const resetTable = () => {
    setSearch("");
    limpiarFiltros();
    setOrdenadoCantidad("");
    setOrdenadoCepa("");
  };

  const stockColor = (cant) => {
    const n = parseInt(cant) || 0;
    if (n <= 0) return s.stockOut;
    if (n <= 3) return s.stockLow;
    if (n <= 10) return s.stockMid;
    return s.stockOk;
  };

  const filtrarPor = (setter, valor, e) => {
    e.stopPropagation();
    setter((prev) => (prev === valor ? "" : valor));
    setPage(1);
  };

  const fetchProductos = () => {
    socket.emit("request-productos", {
      page,
      search,
      ordenadoCantidad,
      ordenadoCepa,
      filtroCepa,
      filtroBodega,
      filtroOrigen,
      filtroYear,
    });
  };

  // Ref to always call latest fetchProductos from socket listeners
  const fetchProductosRef = useRef(fetchProductos);
  fetchProductosRef.current = fetchProductos;

  // Printer init — once only
  useEffect(() => {
    connectQZ().then(async (ok) => {
      if (ok) {
        try {
          const qz = await import('qz-tray').then((m) => m.default);
          const printers = await qz.printers.find();
          if (Array.isArray(printers) && printers.length > 0) {
            setInstalledPrinters(printers);
            const godex = printers.find((p) => /godex/i.test(p));
            setSelectedPrinter(godex || printers[0]);
            setUseQZ(true);
            return;
          }
        } catch { /* QZ fallo, caer a JSPM */ }
      }
      if (window.JSPM) {
        window.JSPM.JSPrintManager.auto_reconnect = true;
        window.JSPM.JSPrintManager.start(false);
        window.JSPM.JSPrintManager.WS.onStatusChanged = function () {
          if (jspmWSStatus()) {
            window.JSPM.JSPrintManager.getPrinters().then(function (myPrinters) {
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
    });
  }, []);

  // Socket listeners — once only
  useEffect(() => {
    const onCambios = () => {
      fetchProductosRef.current();
      socket.emit("request-filtros-productos");
    };
    const onProductos = (data) => {
      if (data.status === "error") {
        console.error(data.message);
        return;
      }
      setProductos(data.productos);
      setTotalPages(data.totalPages);
      setTotalProductos(data.totalProductos || 0);
      setStockTotal(data.stockTotal || 0);
      // Si la página actual queda fuera de rango, volver a la última válida
      setPage((prev) => prev > data.totalPages ? Math.max(1, data.totalPages) : prev);
    };
    const onFiltros = (data) => setFiltrosOpciones(data);
    const onProveedores = (data) => setProveedores(data || []);
    const onHistorial = (data) => setHistorialModal(data);

    socket.on("cambios", onCambios);
    socket.on("response-productos", onProductos);
    socket.on("response-filtros-productos", onFiltros);
    socket.on("response-proveedores-simple", onProveedores);
    socket.on("response-historial-precios", onHistorial);

    socket.emit("request-filtros-productos");
    socket.emit("request-proveedores-simple");

    return () => {
      socket.off("cambios", onCambios);
      socket.off("response-productos", onProductos);
      socket.off("response-filtros-productos", onFiltros);
      socket.off("response-proveedores-simple", onProveedores);
      socket.off("response-historial-precios", onHistorial);
    };
  }, []);

  // Fetch when filters/page/sort change
  useEffect(() => {
    fetchProductos();
  }, [page, search, ordenadoCantidad, ordenadoCepa, filtroCepa, filtroBodega, filtroOrigen, filtroYear]);

  const jspmWSStatus = () => {
    if (
      window.JSPM.JSPrintManager.websocket_status === window.JSPM.WSStatus.Open
    ) {
      return true;
    } else if (
      window.JSPM.JSPrintManager.websocket_status ===
      window.JSPM.WSStatus.Closed
    ) {
      return false;
    } else if (
      window.JSPM.JSPrintManager.websocket_status ===
      window.JSPM.WSStatus.Blocked
    ) {
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
    if (name === "fotos") {
      const newFiles = Array.from(files);
      setFotosNuevas((prev) => [...prev, ...newFiles]);
      const previews = newFiles.map((f) => URL.createObjectURL(f));
      setFotosNuevasPreview((prev) => [...prev, ...previews]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      const numericFields = ["codigo", "year", "cantidad", "stockMinimo"];
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

  const totalFotos = fotosExistentes.length + fotosNuevas.length;

  const removeFotoExistente = (idx) => {
    setFotosExistentes((prev) => prev.filter((_, i) => i !== idx));
    // Ajustar indice principal
    if (fotoPrincipalIdx >= idx && fotoPrincipalIdx > 0) {
      setFotoPrincipalIdx((prev) => prev - 1);
    }
    if (fotoPrincipalIdx >= fotosExistentes.length - 1 + fotosNuevas.length) {
      setFotoPrincipalIdx(Math.max(0, totalFotos - 2));
    }
  };

  const removeFotoNueva = (idx) => {
    URL.revokeObjectURL(fotosNuevasPreview[idx]);
    setFotosNuevas((prev) => prev.filter((_, i) => i !== idx));
    setFotosNuevasPreview((prev) => prev.filter((_, i) => i !== idx));
    const globalIdx = fotosExistentes.length + idx;
    if (fotoPrincipalIdx >= globalIdx && fotoPrincipalIdx > 0) {
      setFotoPrincipalIdx((prev) => prev - 1);
    }
  };

  const handleProveedorChange = (e) => {
    const id = e.target.value;
    const prov = proveedores.find((p) => p._id === id);
    setFormData((prev) => ({
      ...prev,
      proveedorId: id,
      proveedorNombre: prov ? prov.nombre : "",
    }));
  };

  const verHistorial = (productoId, e) => {
    e.stopPropagation();
    socket.emit("request-historial-precios", productoId);
  };

  const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);

  const generateEAN13 = () => {
    const timestamp = Date.now().toString().slice(0, 12);
    const modifiedTimestamp = timestamp.replace(/^1/, "8");

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

  const resetForm = () => {
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
      tipo: "vino",
      proveedorId: "",
      proveedorNombre: "",
      stockMinimo: "3",
    });
    setEditingId(null);
    setFotosExistentes([]);
    fotosNuevasPreview.forEach((u) => URL.revokeObjectURL(u));
    setFotosNuevas([]);
    setFotosNuevasPreview([]);
    setFotoPrincipalIdx(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formDataToSend = new FormData();
    for (const key in formData) {
      if (formData[key] != null) formDataToSend.append(key, formData[key]);
    }
    // Fotos: enviar indices a mantener de las existentes
    const keepIdx = fotosExistentes.map((_, i) => i);
    formDataToSend.append("fotosKeepIdx", JSON.stringify(keepIdx));
    formDataToSend.append("fotoPrincipalIdx", fotoPrincipalIdx);
    // Fotos nuevas
    fotosNuevas.forEach((file) => formDataToSend.append("fotos", file));
    try {
      const response = await fetch(`${IP()}/upload`, {
        method: "POST",
        body: formDataToSend,
      });
      const result = await response.json();
      if (result.status === "error") {
        await dialog.alert(result.message);
        return;
      }
      resetForm();
    } catch (error) {
      console.error("Error al enviar los datos:", error);
    }
  };

  const printLabel = async (codigo, cantidad) => {
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

    // Intentar QZ Tray primero
    if (useQZ && selectedPrinter) {
      const ok = await printRaw(selectedPrinter, cmds);
      if (ok) return;
    }

    // Fallback: JSPM
    if (jspmWSStatus()) {
      var cpj = new window.JSPM.ClientPrintJob();
      cpj.clientPrinter = new window.JSPM.InstalledPrinter(selectedPrinter);
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

  const editar = (producto, e) => {
    e.stopPropagation();
    setFormData(producto);
    setEditingId(producto._id);
    // Fetch fotos del producto
    socket.emit("request-producto-fotos", producto._id, (res) => {
      if (res && !res.error) {
        setFotosExistentes(res.fotos || []);
        setFotoPrincipalIdx(res.fotoPrincipalIdx || 0);
      }
    });
    fotosNuevasPreview.forEach((u) => URL.revokeObjectURL(u));
    setFotosNuevas([]);
    setFotosNuevasPreview([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelarEdicion = () => {
    resetForm();
  };

  const imprimir = async (codigo, e) => {
    e.stopPropagation();
    const cantidad = await dialog.prompt("Cantidad a imprimir");
    if (cantidad) printLabel(codigo, cantidad);
  };

  const deleteProducto = async (producto, e) => {
    e.stopPropagation();
    if (
      await dialog.confirm(
        `Estas seguro que quieres eliminar el producto\nCodigo: ${producto.codigo}\nNombre: ${producto.nombre}`
      )
    ) {
      socket.emit("delete-producto", producto._id);
    }
  };

  const agregarStock = async (producto, e) => {
    e.stopPropagation();
    const cantidad = await dialog.prompt(
      `CANTIDAD A SUMAR\nCodigo: ${producto.codigo}\nNombre: ${producto.nombre}`
    );
    if (cantidad && cantidad > 0) {
      socket.emit("agregar-stock", producto._id, cantidad);
    }
  };

  const mejorarFotoIA = (producto, e) => {
    e.stopPropagation();
    if (generandoFotoIA === producto._id) return;
    setGenerandoFotoIA(producto._id);
    socket.emit("mejorar-foto-ia", producto._id, (res) => {
      setGenerandoFotoIA(null);
      if (res.error) dialog.alert("Error: " + res.error);
    });
  };

  const toggleFotoIA = (id) => {
    socket.emit("toggle-foto-ia", id, (res) => {
      if (res.error) dialog.alert("Error: " + res.error);
      setFotoIAModal(null);
    });
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
    <div className={s.container}>
      {/* ── Form card (top) ── */}
      {tienePermiso(usuario, 'editar_producto') && <div className={s.formCard}>
        <div className={s.formHeader}>
          <i className={`bi ${editingId ? "bi-pencil-square" : "bi-plus-circle"}`}></i>
          <span>{editingId ? "Editar producto" : "Nuevo producto"}</span>
          {editingId && (
            <button className={s.cancelEditBtn} onClick={cancelarEdicion} title="Cancelar edición">
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>
        <form
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          className={s.form}
        >
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label>Codigo</label>
              <div className={s.inputBtnGroup}>
                <input
                  type="text"
                  id="codigo"
                  name="codigo"
                  value={formData.codigo}
                  onChange={handleChange}
                  autoComplete="off"
                />
                <button
                  className={s.generateBtn}
                  type="button"
                  onClick={generateEAN13}
                >
                  GENERAR
                </button>
              </div>
            </div>
            <div className={s.formGroup}>
              <label>Nombre</label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
            <div className={s.formGroup}>
              <label>Bodega</label>
              <input
                type="text"
                name="bodega"
                value={formData.bodega}
                onChange={handleChange}
              />
            </div>
            <div className={s.formGroup}>
              <label>Cepa</label>
              <input
                type="text"
                name="cepa"
                value={formData.cepa}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label>Año</label>
              <input
                type="text"
                name="year"
                value={formData.year}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
            <div className={s.formGroup}>
              <label>Origen</label>
              <input
                type="text"
                name="origen"
                value={formData.origen}
                onChange={handleChange}
              />
            </div>
            <div className={s.formGroup}>
              <label>Precio de Venta</label>
              <NumericFormat
                className={s.priceInput}
                prefix="$"
                value={formData.venta}
                thousandSeparator="."
                decimalSeparator=","
                onValueChange={(e) => handleChangeNumber(e.floatValue)}
              />
            </div>
            <div className={s.formGroup}>
              <label>Cantidad</label>
              <input
                type="text"
                name="cantidad"
                value={formData.cantidad}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
          </div>
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label>Posicion</label>
              <input
                type="text"
                name="posicion"
                value={formData.posicion}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
            <div className={s.formGroup}>
              <label>Tipo</label>
              <select
                name="tipo"
                value={formData.tipo || "vino"}
                onChange={handleChange}
              >
                <option value="vino">Vino</option>
                <option value="articulo">Artículo</option>
                <option value="servicio">Servicio</option>
              </select>
            </div>
            <div className={s.formGroup}>
              <label>Proveedor</label>
              <select
                value={formData.proveedorId || ""}
                onChange={handleProveedorChange}
              >
                <option value="">— Sin proveedor —</option>
                {proveedores.map((p) => (
                  <option key={p._id} value={p._id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div className={s.formGroup}>
              <label>Stock Minimo</label>
              <input
                type="text"
                name="stockMinimo"
                value={formData.stockMinimo}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
          </div>
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label>Fotos ({totalFotos}/10)</label>
              <div
                className={s.fileInputWrap}
                onClick={() => fileInputRef.current?.click()}
              >
                <i className="bi bi-cloud-arrow-up"></i>
                <span>Agregar fotos...</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                name="fotos"
                accept="image/*"
                multiple
                onChange={handleChange}
                className={s.fileInputHidden}
              />
            </div>
            <div className={s.formGroup}>
              <label>Descripcion</label>
              <input
                type="text"
                name="descripcion"
                value={formData.descripcion}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>
          </div>
          {/* Fotos preview grid */}
          {totalFotos > 0 && (
            <div className={s.fotosGrid}>
              {fotosExistentes.map((foto, i) => (
                <div key={`ex-${i}`} className={`${s.fotoThumb} ${fotoPrincipalIdx === i ? s.fotoThumbPrincipal : ""}`}>
                  <img src={foto} alt="" />
                  <div className={s.fotoThumbActions}>
                    <button type="button" title="Foto principal" className={`${s.fotoThumbBtn} ${fotoPrincipalIdx === i ? s.fotoThumbBtnActive : ""}`} onClick={() => setFotoPrincipalIdx(i)}>
                      <i className="bi bi-star-fill"></i>
                    </button>
                    <button type="button" title="Eliminar" className={`${s.fotoThumbBtn} ${s.fotoThumbBtnDel}`} onClick={() => removeFotoExistente(i)}>
                      <i className="bi bi-x-lg"></i>
                    </button>
                  </div>
                  {fotoPrincipalIdx === i && <span className={s.fotoThumbBadge}>Principal</span>}
                </div>
              ))}
              {fotosNuevasPreview.map((url, i) => {
                const globalIdx = fotosExistentes.length + i;
                return (
                  <div key={`new-${i}`} className={`${s.fotoThumb} ${fotoPrincipalIdx === globalIdx ? s.fotoThumbPrincipal : ""}`}>
                    <img src={url} alt="" />
                    <div className={s.fotoThumbActions}>
                      <button type="button" title="Foto principal" className={`${s.fotoThumbBtn} ${fotoPrincipalIdx === globalIdx ? s.fotoThumbBtnActive : ""}`} onClick={() => setFotoPrincipalIdx(globalIdx)}>
                        <i className="bi bi-star-fill"></i>
                      </button>
                      <button type="button" title="Eliminar" className={`${s.fotoThumbBtn} ${s.fotoThumbBtnDel}`} onClick={() => removeFotoNueva(i)}>
                        <i className="bi bi-x-lg"></i>
                      </button>
                    </div>
                    {fotoPrincipalIdx === globalIdx && <span className={s.fotoThumbBadge}>Principal</span>}
                    <span className={s.fotoThumbNew}>Nueva</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className={s.formActions}>
            <button className={s.saveBtn} type="submit">
              <i className={`bi ${editingId ? "bi-check-lg" : "bi-plus-lg"}`}></i>
              {editingId ? "Guardar cambios" : "Agregar producto"}
            </button>
          </div>
        </form>
      </div>}

      {/* ── Stats bar ── */}
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

      {/* ── Search + controls ── */}
      <div className={s.searchBar}>
        <button className={s.resetBtn} onClick={resetTable} title="Resetear filtros">
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
      </div>

      {/* ── Active filters ── */}
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

      {/* ── Table ── */}
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
              <th className={s.thActions}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productos?.map((prod) => (
              <tr className={s.row} key={prod._id}>
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
                    {prod.proveedorNombre && (
                      <span className={s.productProveedor}>
                        <i className="bi bi-truck"></i> {prod.proveedorNombre}
                      </span>
                    )}
                  </div>
                </td>
                <td
                  className={`${s.filterableCell} ${filtroCepa === prod.cepa ? s.filterActive : ""}`}
                  onClick={(e) => filtrarPor(setFiltroCepa, prod.cepa, e)}
                  title={`Filtrar por ${prod.cepa}`}
                >
                  {prod.cepa}
                </td>
                <td
                  className={`${s.filterableCell} ${filtroBodega === prod.bodega ? s.filterActive : ""}`}
                  onClick={(e) => filtrarPor(setFiltroBodega, prod.bodega, e)}
                  title={`Filtrar por ${prod.bodega}`}
                >
                  {prod.bodega}
                </td>
                <td
                  className={`${s.filterableCell} ${filtroOrigen === prod.origen ? s.filterActive : ""}`}
                  onClick={(e) => filtrarPor(setFiltroOrigen, prod.origen, e)}
                  title={`Filtrar por ${prod.origen}`}
                >
                  {prod.origen}
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
                  {prod.historialPrecios?.length > 1 && (
                    <button className={s.historialBtn} onClick={(e) => verHistorial(prod._id, e)} title="Ver historial de precios">
                      <i className="bi bi-clock-history"></i>
                    </button>
                  )}
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
                    className={`${s.actionBtn} ${s.actionPrintBtn}`}
                    onClick={(e) => imprimir(prod.codigo, e)}
                    title="Imprimir etiqueta"
                  >
                    <i className="bi bi-printer-fill"></i>
                  </button>
                  <button
                    className={`${s.actionBtn} ${s.actionAddBtn}`}
                    onClick={(e) => agregarStock(prod, e)}
                    title="Agregar stock"
                  >
                    <i className="bi bi-plus-circle"></i>
                  </button>
                  {tienePermiso(usuario, 'editar_producto') && <button
                    className={`${s.actionBtn} ${s.actionEditBtn}`}
                    onClick={(e) => editar(prod, e)}
                    title="Editar producto"
                  >
                    <i className="bi bi-pencil-square"></i>
                  </button>}
                  {tienePermiso(usuario, 'borrar_producto') && <button
                    className={`${s.actionBtn} ${s.actionDeleteBtn}`}
                    onClick={(e) => deleteProducto(prod, e)}
                    title="Eliminar producto"
                  >
                    <i className="bi bi-trash3-fill"></i>
                  </button>}
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

      {/* ── Modal historial de precios ── */}
      {historialModal && (
        <div className={s.modalOverlay} onClick={() => setHistorialModal(null)}>
          <div className={s.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <span><i className="bi bi-clock-history"></i> Historial de precios — {historialModal.nombre}</span>
              <button className={s.modalClose} onClick={() => setHistorialModal(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className={s.modalBody}>
              <div className={s.historialCurrent}>
                Precio actual: <strong>{money(historialModal.venta)}</strong>
              </div>
              {historialModal.historialPrecios?.length > 0 ? (
                <div className={s.historialList}>
                  {[...historialModal.historialPrecios].reverse().map((h, i) => (
                    <div key={i} className={s.historialItem}>
                      <span className={s.historialPrecio}>{money(h.precio)}</span>
                      <span className={s.historialFecha}>
                        {new Date(h.fecha).toLocaleDateString("es-AR")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={s.historialEmpty}>Sin historial previo</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Inventario;
