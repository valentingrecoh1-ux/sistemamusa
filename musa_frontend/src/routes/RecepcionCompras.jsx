import { useState, useEffect } from "react";
import { socket } from "../main";

const ESTADOS = {
  pendiente_aprobacion: "Pend. Aprobación",
  aprobada: "Aprobada",
  enviada: "Enviada",
  en_camino: "En Camino",
  recibida_parcial: "Recibida Parcial",
};

const money = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(n || 0);

export default function RecepcionCompras({ usuario }) {
  const [ordenes, setOrdenes] = useState([]);
  const [selectedOC, setSelectedOC] = useState(null);
  const [recepcion, setRecepcion] = useState([]);
  const [notas, setNotas] = useState("");

  const fetchData = () => {
    socket.emit("request-ordenes-compra", { estado: "todos" });
  };

  useEffect(() => {
    socket.on("response-ordenes-compra", (data) => {
      const pendientes = data.ordenes.filter((o) =>
        ["aprobada", "enviada", "en_camino", "recibida_parcial", "pendiente_aprobacion"].includes(o.estado)
      );
      setOrdenes(pendientes);
    });
    socket.on("cambios", fetchData);
    fetchData();
    return () => {
      socket.off("response-ordenes-compra");
      socket.off("cambios", fetchData);
    };
  }, []);

  const selectOC = (oc) => {
    setSelectedOC(oc);
    setRecepcion(oc.items.map((item) => ({ itemId: item._id, nombre: item.nombre, cantidadSolicitada: item.cantidadSolicitada, cantidadRecibidaPrevia: item.cantidadRecibida || 0, cantidad: "" })));
    setNotas("");
  };

  const updateCant = (i, val) => {
    setRecepcion((r) => r.map((item, idx) => idx === i ? { ...item, cantidad: val } : item));
  };

  const handleConfirmar = () => {
    const itemsRecibidos = recepcion.map((r) => ({ itemId: r.itemId, cantidad: Number(r.cantidad) || 0 }));
    socket.emit("registrar-recepcion", {
      ordenId: selectedOC._id,
      itemsRecibidos,
      usuarioId: usuario?._id,
      usuarioNombre: usuario?.nombre,
      notas,
    });
    setSelectedOC(null);
    setRecepcion([]);
  };

  return (
    <div style={{ padding: "20px" }}>
      <a href="/compras" style={{ color: "#007bff", textDecoration: "none", fontWeight: "bold" }}>← Volver</a>
      <h2 style={{ marginTop: "10px" }}>Recepción de Mercadería</h2>
      <p style={{ color: "#666" }}>{ordenes.length} órdenes pendientes de recepción</p>

      {!selectedOC ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px", marginTop: "16px" }}>
          {ordenes.map((o) => (
            <div key={o._id} className="oc-card" style={{ cursor: "pointer" }} onClick={() => selectOC(o)}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                <strong>{o.numero}</strong>
                <span className={`estado-badge estado-${o.estado}`}>{ESTADOS[o.estado] || o.estado}</span>
              </div>
              <p style={{ margin: "0 0 6px", fontWeight: "600" }}>{o.proveedorNombre}</p>
              {o.fechaEntrega && <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#666" }}>Entrega: {new Date(o.fechaEntrega).toLocaleDateString("es-AR")}</p>}
              <div style={{ borderTop: "1px solid #eee", paddingTop: "8px" }}>
                {o.items.map((item, i) => {
                  const dif = item.cantidadRecibida > 0 ? item.cantidadRecibida - item.cantidadSolicitada : null;
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", padding: "2px 0" }}>
                      <span>{item.nombre}</span>
                      <span>
                        {item.cantidadRecibida || 0}/{item.cantidadSolicitada}
                        {dif !== null && dif !== 0 && <span style={{ color: "#dc3545", fontWeight: "bold" }}> ({dif > 0 ? "+" : ""}{dif})</span>}
                        {dif === 0 && <span style={{ color: "#28a745" }}> ✓</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {ordenes.length === 0 && <p style={{ color: "#999", textAlign: "center", padding: "40px" }}>Sin recepciones pendientes</p>}
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
            <h3>{selectedOC.numero} — {selectedOC.proveedorNombre}</h3>
            <button onClick={() => setSelectedOC(null)} style={{ padding: "5px 15px", border: "1px solid #ccc", borderRadius: "5px", cursor: "pointer", background: "white" }}>Cancelar</button>
          </div>

          <div className="tabla-productos" style={{ marginTop: "14px" }}>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Pedido</th>
                  <th>Ya Recibido</th>
                  <th>Recibir Ahora</th>
                </tr>
              </thead>
              <tbody>
                {recepcion.map((r, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: "left" }}>{r.nombre}</td>
                    <td><strong>{r.cantidadSolicitada}</strong></td>
                    <td>{r.cantidadRecibidaPrevia}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={r.cantidad}
                        onChange={(e) => updateCant(i, e.target.value)}
                        style={{ width: "80px", padding: "5px", textAlign: "center", border: "1px solid #ccc", borderRadius: "3px" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-group" style={{ marginTop: "14px", maxWidth: "400px" }}>
            <label>Notas</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ width: "100%", minHeight: "60px", padding: "5px", borderRadius: "5px", border: "1px solid #ccc", resize: "none" }} />
          </div>

          <button className="generar-codigo" onClick={handleConfirmar} style={{ maxWidth: "250px", padding: "10px", fontSize: "16px", marginTop: "10px" }}>
            Confirmar Recepción
          </button>
        </div>
      )}
    </div>
  );
}
