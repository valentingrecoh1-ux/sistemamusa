import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../main";
import { tienePermiso } from "../lib/permisos";

const ESTADOS = {
  borrador: "Borrador",
  pendiente_aprobacion: "Pend. Aprobación",
  aprobada: "Aprobada",
  enviada: "Enviada",
  en_camino: "En Camino",
  recibida_parcial: "Recibida Parcial",
  recibida: "Recibida",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

const ESTADOS_PAGO = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado" };
const money = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(n || 0);

export default function OrdenCompraDetalle({ usuario }) {
  const { id } = useParams();
  const isNew = !id;

  const [orden, setOrden] = useState(null);
  const [proveedor, setProveedor] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(!isNew);

  // Form state para nueva OC
  const [provId, setProvId] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [items, setItems] = useState([{ nombre: "", cantidadSolicitada: 1, precioUnitario: 0 }]);
  const [factNum, setFactNum] = useState("");
  const [factMonto, setFactMonto] = useState("");
  const [notas, setNotas] = useState("");

  // Pago inline
  const [showPago, setShowPago] = useState(false);
  const [pagoForm, setPagoForm] = useState({ monto: "", metodoPago: "transferencia", referencia: "" });

  useEffect(() => {
    socket.on("response-orden-compra-detalle", (data) => {
      setOrden(data.orden);
      setProveedor(data.proveedor);
      setLoading(false);
    });
    socket.on("response-proveedores", (data) => setProveedores(data.proveedores));
    socket.on("cambios", () => { if (id) socket.emit("request-orden-compra-detalle", id); });

    if (id) socket.emit("request-orden-compra-detalle", id);
    socket.emit("request-proveedores", { soloActivos: true });

    return () => {
      socket.off("response-orden-compra-detalle");
      socket.off("response-proveedores");
      socket.off("cambios");
    };
  }, [id]);

  const addItem = () => setItems([...items, { nombre: "", cantidadSolicitada: 1, precioUnitario: 0 }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i, key, val) => setItems(items.map((item, idx) => idx === i ? { ...item, [key]: val } : item));
  const total = items.reduce((s, i) => s + (i.cantidadSolicitada || 0) * (i.precioUnitario || 0), 0);

  const handleCrear = () => {
    if (!provId || items.some((i) => !i.nombre)) return;
    const prov = proveedores.find((p) => p._id === provId);
    const facturas = factNum ? [{ numero: factNum, monto: Number(factMonto) || total, fecha: new Date().toISOString().split("T")[0] }] : [];
    socket.emit("guardar-orden-compra", {
      orden: {
        proveedorId: provId,
        proveedorNombre: prov?.nombre || "",
        estado: "pendiente_aprobacion",
        estadoPago: "pendiente",
        fechaEntrega,
        items: items.map((i) => ({ ...i, cantidadRecibida: 0 })),
        facturas,
        notas,
      },
      usuarioId: usuario?._id,
      usuarioNombre: usuario?.nombre,
    });
    window.location.href = "/compras";
  };

  const handleEstado = (nuevoEstado, detalle) => {
    socket.emit("cambiar-estado-oc", { ordenId: orden._id, nuevoEstado, usuarioId: usuario?._id, usuarioNombre: usuario?.nombre, detalle });
  };

  const handleCancelar = () => {
    const motivo = prompt("Motivo de cancelación:");
    if (motivo !== null) {
      socket.emit("cancelar-orden-compra", { ordenId: orden._id, usuarioId: usuario?._id, usuarioNombre: usuario?.nombre, motivo });
    }
  };

  const handlePago = () => {
    if (!pagoForm.monto || Number(pagoForm.monto) <= 0) return;
    socket.emit("guardar-pago-proveedor", {
      pago: { ordenCompraId: orden._id, proveedorId: orden.proveedorId, monto: Number(pagoForm.monto), metodoPago: pagoForm.metodoPago, referencia: pagoForm.referencia },
      usuarioId: usuario?._id,
      usuarioNombre: usuario?.nombre,
    });
    setShowPago(false);
    setPagoForm({ monto: "", metodoPago: "transferencia", referencia: "" });
  };

  // ── NUEVA OC ──
  if (isNew) {
    return (
      <div className="oc-detalle-container">
        <a href="/compras" style={{ color: "#007bff", textDecoration: "none", fontWeight: "bold" }}>← Volver</a>
        <h2 style={{ marginTop: "10px" }}>Nueva Orden de Compra</h2>

        <div className="compras-form-card">
          <div className="compras-form-grid">
            <div className="form-group">
              <label>Proveedor *</label>
              <select value={provId} onChange={(e) => setProvId(e.target.value)} style={{ width: "100%", padding: "5px", borderRadius: "5px", border: "1px solid #ccc", fontSize: "16px" }}>
                <option value="">Seleccionar...</option>
                {proveedores.map((p) => <option key={p._id} value={p._id}>{p.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Fecha entrega estimada</label>
              <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="compras-form-card">
          <h3 style={{ marginBottom: "10px" }}>Productos</h3>
          <div className="oc-items-form">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Precio Unit.</th>
                  <th>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td><input type="text" placeholder="Nombre del producto" value={item.nombre} onChange={(e) => updateItem(i, "nombre", e.target.value)} /></td>
                    <td><input type="number" min="1" value={item.cantidadSolicitada} onChange={(e) => updateItem(i, "cantidadSolicitada", Number(e.target.value))} /></td>
                    <td><input type="number" min="0" value={item.precioUnitario} onChange={(e) => updateItem(i, "precioUnitario", Number(e.target.value))} /></td>
                    <td style={{ textAlign: "center", fontWeight: "bold" }}>{money(item.cantidadSolicitada * item.precioUnitario)}</td>
                    <td>{items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: "#dc3545", cursor: "pointer", fontSize: "18px" }}>✕</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addItem} style={{ marginTop: "8px", background: "none", border: "1px solid #007bff", color: "#007bff", padding: "5px 12px", borderRadius: "5px", cursor: "pointer" }}>+ Agregar línea</button>
            <div style={{ textAlign: "right", fontSize: "18px", fontWeight: "bold", marginTop: "10px" }}>Total: {money(total)}</div>
          </div>
        </div>

        <div className="compras-form-card">
          <h3 style={{ marginBottom: "10px" }}>Factura (opcional)</h3>
          <div className="compras-form-grid">
            <div className="form-group">
              <label>Nro. Factura</label>
              <input placeholder="A-0001-00000000" value={factNum} onChange={(e) => setFactNum(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Monto</label>
              <input type="number" placeholder={String(total)} value={factMonto} onChange={(e) => setFactMonto(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Notas</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ width: "100%", minHeight: "60px", padding: "5px", borderRadius: "5px", border: "1px solid #ccc", resize: "none" }} />
          </div>
        </div>

        <button className="generar-codigo" onClick={handleCrear} style={{ maxWidth: "300px", padding: "10px", fontSize: "16px" }}>Crear Orden de Compra</button>
      </div>
    );
  }

  // ── DETALLE OC ──
  if (loading) return <div style={{ padding: "40px", textAlign: "center" }}>Cargando...</div>;
  if (!orden) return <div style={{ padding: "40px", textAlign: "center" }}>Orden no encontrada</div>;

  const saldo = orden.montoTotal - orden.montoPagado;
  const canApprove = tienePermiso(usuario, 'aprobar_oc') && orden.estado === "pendiente_aprobacion";
  const canPay = tienePermiso(usuario, 'pagar_proveedor') && orden.estadoPago !== "pagado" && orden.estado !== "cancelada";
  const canChangeState = tienePermiso(usuario, 'crear_oc');

  return (
    <div className="oc-detalle-container">
      <a href="/compras" style={{ color: "#007bff", textDecoration: "none", fontWeight: "bold" }}>← Volver</a>

      <div className="oc-header">
        <div>
          <h2 style={{ margin: 0 }}>{orden.numero}</h2>
          <p style={{ color: "#666", margin: 0 }}>{proveedor?.nombre || orden.proveedorNombre} — {new Date(orden.createdAt).toLocaleDateString("es-AR")}</p>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <span className={`estado-badge estado-${orden.estado}`}>{ESTADOS[orden.estado]}</span>
          <span className={`estado-badge estado-pago-${orden.estadoPago}`}>{ESTADOS_PAGO[orden.estadoPago]}</span>
        </div>
      </div>

      {/* Acciones */}
      <div className="oc-actions">
        {canApprove && <>
          <button className="btn-aprobar" onClick={() => handleEstado("aprobada", `Aprobada por ${usuario.nombre}`)}>✓ Aprobar</button>
          <button className="btn-rechazar" onClick={() => handleEstado("borrador", "Rechazada")}>✗ Rechazar</button>
        </>}
        {canChangeState && orden.estado === "aprobada" && <button onClick={() => handleEstado("enviada", "Enviada al proveedor")}>Marcar Enviada</button>}
        {canChangeState && orden.estado === "enviada" && <button onClick={() => handleEstado("en_camino", "En camino")}>En Camino</button>}
        {canChangeState && orden.estado === "recibida" && <button onClick={() => handleEstado("cerrada", "Cerrada")}>Cerrar OC</button>}
        {canPay && <button onClick={() => setShowPago(!showPago)}>💳 Registrar Pago</button>}
        {canChangeState && !["cerrada", "cancelada"].includes(orden.estado) && <button className="btn-rechazar" onClick={handleCancelar}>Cancelar OC</button>}
      </div>

      {/* Pago form */}
      {showPago && (
        <div className="compras-form-card" style={{ marginTop: "15px" }}>
          <h3>Registrar Pago — Saldo: <span style={{ color: "#dc3545" }}>{money(saldo)}</span></h3>
          <div className="compras-form-grid">
            <div className="form-group">
              <label>Monto *</label>
              <input type="number" value={pagoForm.monto} onChange={(e) => setPagoForm({ ...pagoForm, monto: e.target.value })} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Método</label>
              <select value={pagoForm.metodoPago} onChange={(e) => setPagoForm({ ...pagoForm, metodoPago: e.target.value })} style={{ width: "100%", padding: "5px", borderRadius: "5px", border: "1px solid #ccc" }}>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="efectivo">Efectivo</option>
              </select>
            </div>
            <div className="form-group">
              <label>Referencia</label>
              <input value={pagoForm.referencia} onChange={(e) => setPagoForm({ ...pagoForm, referencia: e.target.value })} placeholder="Nro. transf./cheque" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <button className="generar-codigo" style={{ maxWidth: "150px" }} onClick={handlePago}>Confirmar</button>
            <button onClick={() => setShowPago(false)} style={{ padding: "5px 15px", border: "1px solid #ccc", borderRadius: "5px", cursor: "pointer", background: "white" }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Grid de info */}
      <div className="oc-grid">
        {/* Productos */}
        <div className="oc-card">
          <h3>Productos</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>P.Unit</th>
                <th>Subtotal</th>
                <th>Recib.</th>
                <th>Dif</th>
              </tr>
            </thead>
            <tbody>
              {orden.items.map((item, i) => {
                const dif = item.cantidadRecibida > 0 ? item.cantidadRecibida - item.cantidadSolicitada : null;
                return (
                  <tr key={i}>
                    <td style={{ textAlign: "left" }}>{item.nombre}</td>
                    <td>{item.cantidadSolicitada}</td>
                    <td>{money(item.precioUnitario)}</td>
                    <td><strong>{money(item.cantidadSolicitada * item.precioUnitario)}</strong></td>
                    <td>{item.cantidadRecibida || "—"}</td>
                    <td>{dif !== null && <span style={{ color: dif === 0 ? "#28a745" : "#dc3545", fontWeight: "bold" }}>{dif === 0 ? "✓" : dif > 0 ? `+${dif}` : dif}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: "right", fontWeight: "bold" }}>TOTAL</td>
                <td style={{ fontWeight: "bold", fontSize: "15px" }}>{money(orden.montoTotal)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Finanzas */}
        <div className="oc-card">
          <h3>Finanzas</h3>
          <div className="oc-financiero">
            <div className="fila"><span>Total OC</span><strong>{money(orden.montoTotal)}</strong></div>
            <div className="fila"><span>Pagado</span><strong style={{ color: "#28a745" }}>{money(orden.montoPagado)}</strong></div>
            <div className="fila total"><span>Saldo</span><strong style={{ color: saldo > 0 ? "#dc3545" : "#28a745" }}>{money(saldo)}</strong></div>
          </div>
          {proveedor && (
            <div style={{ marginTop: "16px", background: "#f4f4f4", borderRadius: "5px", padding: "10px", fontSize: "13px" }}>
              <strong>Datos bancarios</strong>
              <div>Banco: {proveedor.banco || "—"}</div>
              <div>CBU: {proveedor.cbu || "—"}</div>
              <div>Alias: {proveedor.alias || "—"}</div>
              <div>Cond.: {proveedor.condicionPago === 0 ? "Contado" : `${proveedor.condicionPago} días`}</div>
            </div>
          )}
        </div>

        {/* Facturas */}
        {orden.facturas && orden.facturas.length > 0 && (
          <div className="oc-card">
            <h3>Facturas</h3>
            {orden.facturas.map((f, i) => (
              <div key={i} style={{ padding: "8px", background: "#f4f4f4", borderRadius: "5px", marginBottom: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{f.numero}</strong>
                  <strong>{money(f.monto)}</strong>
                </div>
                <div style={{ fontSize: "12px", color: "#666" }}>{f.fecha}</div>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        <div className="oc-card">
          <h3>Trazabilidad</h3>
          <div className="timeline-container">
            {orden.timeline.map((t, i) => (
              <div key={i} className="timeline-entry">
                <div className="timeline-dot"></div>
                <div>
                  <div style={{ fontWeight: "600" }}>{t.accion}</div>
                  {t.detalle && <div style={{ fontSize: "12px", color: "#666" }}>{t.detalle}</div>}
                  <div className="timeline-fecha">{t.usuario} — {new Date(t.fecha).toLocaleString("es-AR")}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
