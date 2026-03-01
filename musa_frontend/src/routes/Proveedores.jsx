import { useState, useEffect } from "react";
import { socket } from "../main";
import { tienePermiso } from "../lib/permisos";

export default function Proveedores({ usuario }) {
  const [proveedores, setProveedores] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState(null);

  const puedeEditar = tienePermiso(usuario, 'editar_proveedor');

  const emptyForm = { nombre: "", contacto: "", telefono: "", email: "", direccion: "", cuit: "", cbu: "", alias: "", banco: "", condicionPago: 0, notas: "" };

  const fetchData = () => {
    socket.emit("request-proveedores", { search, page });
  };

  useEffect(() => {
    socket.on("response-proveedores", (data) => {
      setProveedores(data.proveedores);
      setTotalPages(data.totalPages);
    });
    socket.on("cambios", fetchData);
    fetchData();
    return () => {
      socket.off("response-proveedores");
      socket.off("cambios", fetchData);
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, [search, page]);

  const handleSave = () => {
    if (!form.nombre) return;
    socket.emit("guardar-proveedor", form);
    setForm(null);
  };

  const handleEdit = (p) => {
    setForm({ ...p });
  };

  const handleToggle = (id) => {
    socket.emit("toggle-proveedor-activo", id);
  };

  return (
    <div className="inventario-container">
      {/* Form */}
      <div className="formulario-container">
        <div className="formulario">
          <h3 style={{ marginBottom: "10px" }}>{form?._id ? "Editar Proveedor" : "Nuevo Proveedor"}</h3>
          {[
            ["Razón Social *", "nombre"],
            ["CUIT", "cuit"],
            ["Contacto", "contacto"],
            ["Email", "email"],
            ["Teléfono", "telefono"],
            ["Dirección", "direccion"],
            ["CBU", "cbu"],
            ["Alias", "alias"],
            ["Banco", "banco"],
          ].map(([label, key]) => (
            <div className="form-group" key={key}>
              <label>{label}</label>
              <input
                value={form ? form[key] || "" : ""}
                onChange={(e) => setForm((f) => ({ ...(f || emptyForm), [key]: e.target.value }))}
                placeholder={label}
              />
            </div>
          ))}
          <div className="form-group">
            <label>Condición de Pago (días)</label>
            <input
              type="number"
              value={form ? form.condicionPago || 0 : 0}
              onChange={(e) => setForm((f) => ({ ...(f || emptyForm), condicionPago: Number(e.target.value) }))}
            />
          </div>
          <div className="form-group">
            <label>Notas</label>
            <textarea
              value={form ? form.notas || "" : ""}
              onChange={(e) => setForm((f) => ({ ...(f || emptyForm), notas: e.target.value }))}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="generar-codigo" onClick={handleSave}>Guardar</button>
            {form?._id && (
              <button className="generar-codigo" style={{ backgroundColor: "#6c757d" }} onClick={() => setForm({ ...emptyForm })}>Cancelar</button>
            )}
          </div>
          {!form && <button className="generar-codigo" style={{ marginTop: "10px" }} onClick={() => setForm({ ...emptyForm })}>+ Nuevo Proveedor</button>}
        </div>
      </div>

      {/* Table */}
      <div className="tabla-container">
        <div className="buscador" style={{ justifyContent: "flex-start", marginBottom: "10px" }}>
          <input
            placeholder="Buscar proveedor..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ padding: "8px", fontSize: "14px", border: "1px solid #ccc", borderRadius: "5px" }}
          />
          <a href="/compras" style={{ padding: "8px 16px", backgroundColor: "#6c757d", color: "white", borderRadius: "5px", textDecoration: "none", fontSize: "14px" }}>← Volver</a>
        </div>

        <div className="tabla-productos">
          <table>
            <thead>
              <tr>
                <th>Razón Social</th>
                <th>CUIT</th>
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Banco</th>
                <th>Cond. Pago</th>
                <th>Estado</th>
                {puedeEditar && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p._id}>
                  <td><strong>{p.nombre}</strong></td>
                  <td>{p.cuit || "—"}</td>
                  <td>{p.contacto || "—"}</td>
                  <td>{p.telefono || "—"}</td>
                  <td>{p.banco ? `${p.banco} — ${p.alias || ""}` : "—"}</td>
                  <td>{p.condicionPago === 0 ? "Contado" : `${p.condicionPago} días`}</td>
                  <td>{p.activo ? <span style={{ color: "#28a745", fontWeight: "bold" }}>Activo</span> : <span style={{ color: "#dc3545" }}>Inactivo</span>}</td>
                  {puedeEditar && (
                    <td>
                      <span className="editar" onClick={() => handleEdit(p)}>✎</span>
                      <span className="editar" onClick={() => handleToggle(p._id)} style={{ marginLeft: "8px" }}>{p.activo ? "⏸" : "▶"}</span>
                    </td>
                  )}
                </tr>
              ))}
              {proveedores.length === 0 && (
                <tr><td colSpan={puedeEditar ? 8 : 7} style={{ textAlign: "center", padding: "40px", color: "#999" }}>Sin proveedores</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="paginacion" style={{ marginTop: "10px" }}>
            <button className="flechas-paginacion" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <i className="bi bi-arrow-left-circle"></i>
            </button>
            <span>{page} / {totalPages}</span>
            <button className="flechas-paginacion" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <i className="bi bi-arrow-right-circle"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
