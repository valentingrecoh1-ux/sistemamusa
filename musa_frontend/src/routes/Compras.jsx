import { useState, useEffect } from "react";
import { socket } from "../main";

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

const ESTADOS_PAGO = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagado: "Pagado",
};

const money = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(n || 0);

export default function Compras({ usuario }) {
  const [dash, setDash] = useState({ pendientesAprobacion: 0, pendientesRecepcion: 0, deudaTotal: 0, conDiferencias: 0, pendientesPago: 0 });
  const [ordenes, setOrdenes] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = () => {
    socket.emit("request-compras-dashboard");
    socket.emit("request-ordenes-compra", { search, page, estado: filtroEstado });
    if (usuario) socket.emit("request-notificaciones", { usuarioId: usuario._id, rol: usuario.rol });
  };

  useEffect(() => {
    socket.on("response-compras-dashboard", (data) => setDash(data));
    socket.on("response-ordenes-compra", (data) => {
      setOrdenes(data.ordenes);
      setTotalPages(data.totalPages);
    });
    socket.on("response-notificaciones", (data) => setNotifs(data));
    socket.on("cambios", fetchData);
    fetchData();
    return () => {
      socket.off("response-compras-dashboard");
      socket.off("response-ordenes-compra");
      socket.off("response-notificaciones");
      socket.off("cambios", fetchData);
    };
  }, []);

  useEffect(() => {
    socket.emit("request-ordenes-compra", { search, page, estado: filtroEstado });
  }, [search, page, filtroEstado]);

  const marcarLeida = (id) => {
    socket.emit("marcar-notificacion-leida", id);
  };

  const marcarTodasLeidas = () => {
    socket.emit("marcar-todas-notificaciones-leidas", { usuarioId: usuario?._id, rol: usuario?.rol });
  };

  const puedeCrear = usuario?.rol === "admin" || usuario?.rol === "comprador";

  return (
    <div className="compras-dashboard">
      <h2>Compras</h2>

      {/* KPIs */}
      <div className="compras-kpis">
        <div className={`kpi-card ${dash.pendientesAprobacion > 0 ? "urgente" : ""}`}>
          <h3>Pend. Aprobación</h3>
          <div className="kpi-valor">{dash.pendientesAprobacion}</div>
        </div>
        <div className={`kpi-card ${dash.pendientesPago > 0 ? "urgente" : ""}`}>
          <h3>Pend. Pago</h3>
          <div className="kpi-valor">{dash.pendientesPago}</div>
        </div>
        <div className="kpi-card">
          <h3>Pend. Recepción</h3>
          <div className="kpi-valor">{dash.pendientesRecepcion}</div>
        </div>
        <div className={`kpi-card ${dash.deudaTotal > 0 ? "urgente" : ""}`}>
          <h3>Deuda Total</h3>
          <div className="kpi-valor">{money(dash.deudaTotal)}</div>
        </div>
      </div>

      {/* Nav */}
      <div className="compras-nav">
        {puedeCrear && <a href="/compras/orden/nueva">+ Nueva OC</a>}
        <a href="/compras/proveedores">Proveedores</a>
        {(usuario?.rol === "admin" || usuario?.rol === "recepcion") && <a href="/compras/recepcion">Recepción</a>}
        {(usuario?.rol === "admin" || usuario?.rol === "comprador") && <a href="/compras/pagos">Pagos</a>}
      </div>

      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
        {/* Tabla OCs */}
        <div style={{ flex: 2 }}>
          <div className="buscador" style={{ justifyContent: "flex-start" }}>
            <input
              placeholder="Buscar nro. o proveedor..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ padding: "8px", fontSize: "14px", border: "1px solid #ccc", borderRadius: "5px" }}
            />
            <select
              value={filtroEstado}
              onChange={(e) => { setFiltroEstado(e.target.value); setPage(1); }}
              style={{ padding: "8px", fontSize: "14px", border: "1px solid #ccc", borderRadius: "5px" }}
            >
              <option value="todos">Todos</option>
              {Object.entries(ESTADOS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="tabla-productos">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Proveedor</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {ordenes.map((o) => (
                  <tr key={o._id} className="tr-cursor-pointer" onClick={() => window.location.href = `/compras/orden/${o._id}`}>
                    <td><strong>{o.numero}</strong></td>
                    <td>{o.proveedorNombre || "—"}</td>
                    <td>{o.createdAt ? new Date(o.createdAt).toLocaleDateString("es-AR") : "—"}</td>
                    <td><strong>{money(o.montoTotal)}</strong></td>
                    <td><span className={`estado-badge estado-${o.estado}`}>{ESTADOS[o.estado] || o.estado}</span></td>
                    <td><span className={`estado-badge estado-pago-${o.estadoPago}`}>{ESTADOS_PAGO[o.estadoPago] || o.estadoPago}</span></td>
                  </tr>
                ))}
                {ordenes.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#999" }}>Sin órdenes de compra</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="paginacion" style={{ marginTop: "10px" }}>
              <button className="flechas-paginacion" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <i className="bi bi-arrow-left-circle"></i>
              </button>
              <span>{page} / {totalPages}</span>
              <button className="flechas-paginacion" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <i className="bi bi-arrow-right-circle"></i>
              </button>
            </div>
          )}
        </div>

        {/* Notificaciones */}
        <div style={{ flex: 1, minWidth: "280px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h3>Notificaciones {notifs.length > 0 && <span className="notificaciones-badge">{notifs.length}</span>}</h3>
            {notifs.length > 0 && <button onClick={marcarTodasLeidas} style={{ background: "none", border: "none", color: "#007bff", cursor: "pointer", fontSize: "13px" }}>Marcar leídas</button>}
          </div>
          <div className="oc-card" style={{ maxHeight: "400px", overflowY: "auto" }}>
            {notifs.length === 0 && <p style={{ color: "#999", fontSize: "13px", padding: "10px" }}>Sin novedades</p>}
            {notifs.map((n) => (
              <div key={n._id} className="notificacion-item no-leida" onClick={() => {
                marcarLeida(n._id);
                if (n.referenciaId) window.location.href = `/compras/orden/${n.referenciaId}`;
              }}>
                <span style={{ fontSize: "13px" }}>{n.mensaje}</span>
                <span style={{ fontSize: "11px", color: "#999", whiteSpace: "nowrap" }}>{new Date(n.createdAt).toLocaleDateString("es-AR")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
