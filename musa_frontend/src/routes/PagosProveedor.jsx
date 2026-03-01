import { useState, useEffect } from "react";
import { socket } from "../main";
import { IP } from "../main";
import { tienePermiso } from "../lib/permisos";

const money = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(n || 0);
const ESTADOS_PAGO = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado" };

export default function PagosProveedor({ usuario }) {
  const [ordenes, setOrdenes] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [selectedOC, setSelectedOC] = useState("");
  const [form, setForm] = useState({ monto: "", metodoPago: "transferencia", referencia: "", notas: "" });
  const [file, setFile] = useState(null);

  const fetchData = () => {
    socket.emit("request-ordenes-compra", { estado: "todos" });
    socket.emit("request-pagos-proveedor", {});
  };

  useEffect(() => {
    socket.on("response-ordenes-compra", (data) => {
      const conDeuda = data.ordenes.filter((o) => o.estado !== "cancelada" && o.montoTotal > o.montoPagado);
      setOrdenes(conDeuda);
    });
    socket.on("response-pagos-proveedor", (data) => setPagos(data.pagos));
    socket.on("cambios", fetchData);
    fetchData();
    return () => {
      socket.off("response-ordenes-compra");
      socket.off("response-pagos-proveedor");
      socket.off("cambios", fetchData);
    };
  }, []);

  const selectedOrden = ordenes.find((o) => o._id === selectedOC);
  const saldo = selectedOrden ? selectedOrden.montoTotal - selectedOrden.montoPagado : 0;
  const deudaTotal = ordenes.reduce((s, o) => s + (o.montoTotal - o.montoPagado), 0);

  const handleSubmit = async () => {
    if (!selectedOC || !form.monto || Number(form.monto) <= 0) return;

    if (file) {
      // Upload con archivo
      const formData = new FormData();
      formData.append("file", file);
      formData.append("ordenCompraId", selectedOC);
      formData.append("proveedorId", selectedOrden.proveedorId);
      formData.append("monto", form.monto);
      formData.append("metodoPago", form.metodoPago);
      formData.append("referencia", form.referencia);
      formData.append("notas", form.notas);
      formData.append("registradoPor", usuario?.nombre || "");
      formData.append("registradoPorId", usuario?._id || "");
      await fetch(`${IP()}/upload_pago_proveedor`, { method: "POST", body: formData });
    } else {
      socket.emit("guardar-pago-proveedor", {
        pago: {
          ordenCompraId: selectedOC,
          proveedorId: selectedOrden.proveedorId,
          monto: Number(form.monto),
          metodoPago: form.metodoPago,
          referencia: form.referencia,
          notas: form.notas,
        },
        usuarioId: usuario?._id,
        usuarioNombre: usuario?.nombre,
      });
    }

    setForm({ monto: "", metodoPago: "transferencia", referencia: "", notas: "" });
    setFile(null);
    setSelectedOC("");
  };

  return (
    <div className="div-caja">
      {/* Form */}
      {tienePermiso(usuario, 'pagar_proveedor') && <div className="inputs-caja">
        <h3>Pago a Proveedor</h3>
        <p style={{ fontSize: "14px", color: "#666" }}>Deuda total: <strong style={{ color: "#dc3545" }}>{money(deudaTotal)}</strong></p>

        <div style={{ width: "100%" }}>
          <label style={{ fontWeight: "bold", fontSize: "14px" }}>Orden de Compra *</label>
          <select
            value={selectedOC}
            onChange={(e) => setSelectedOC(e.target.value)}
            style={{ width: "100%", padding: "8px", fontSize: "14px", border: "1px solid black", textAlign: "center" }}
          >
            <option value="">Seleccionar OC...</option>
            {ordenes.map((o) => (
              <option key={o._id} value={o._id}>{o.numero} — {o.proveedorNombre} — Saldo: {money(o.montoTotal - o.montoPagado)}</option>
            ))}
          </select>
        </div>

        {selectedOrden && <p style={{ fontSize: "14px" }}>Saldo: <strong style={{ color: "#dc3545" }}>{money(saldo)}</strong></p>}

        <input
          type="number"
          placeholder="Monto"
          value={form.monto}
          onChange={(e) => setForm({ ...form, monto: e.target.value })}
        />

        <div className="botones-caja">
          {["transferencia", "cheque", "efectivo"].map((m) => (
            <button
              key={m}
              className={form.metodoPago === m ? "boton-activo" : ""}
              onClick={() => setForm({ ...form, metodoPago: m })}
              style={{ textTransform: "capitalize" }}
            >
              {m}
            </button>
          ))}
        </div>

        <input
          placeholder="Referencia (nro. transf./cheque)"
          value={form.referencia}
          onChange={(e) => setForm({ ...form, referencia: e.target.value })}
        />

        <input
          placeholder="Notas"
          value={form.notas}
          onChange={(e) => setForm({ ...form, notas: e.target.value })}
        />

        <input type="file" onChange={(e) => setFile(e.target.files[0])} />

        <button className="generar-codigo" onClick={handleSubmit}>Registrar Pago</button>
      </div>}

      {/* Table */}
      <div className="div-tablas-caja">
        <div style={{ padding: "10px" }}>
          <a href="/compras" style={{ color: "#007bff", textDecoration: "none", fontWeight: "bold" }}>← Volver a Compras</a>
        </div>
        <div className="tabla-productos" style={{ margin: "10px" }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>OC</th>
                <th>Proveedor</th>
                <th>Monto</th>
                <th>Método</th>
                <th>Referencia</th>
                <th>Comp.</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p._id}>
                  <td>{p.fecha || new Date(p.createdAt).toLocaleDateString("es-AR")}</td>
                  <td><strong>{ordenes.find((o) => o._id === p.ordenCompraId)?.numero || "—"}</strong></td>
                  <td>{p.registradoPor || "—"}</td>
                  <td><strong>{money(p.monto)}</strong></td>
                  <td style={{ textTransform: "capitalize" }}>{p.metodoPago}</td>
                  <td>{p.referencia || "—"}</td>
                  <td>
                    {p.filePath ? (
                      <a href={p.filePath} target="_blank" rel="noreferrer" style={{ fontSize: "20px" }}>
                        <i className="bi bi-file-earmark"></i>
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {pagos.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#999" }}>Sin pagos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
