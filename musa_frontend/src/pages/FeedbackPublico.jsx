import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { IP } from "../main";

const STARS = [1, 2, 3, 4, 5];

export default function FeedbackPublico() {
  const { eventoId, turnoId } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ puntaje: 0, loPositivo: "", loNegativo: "", mejoraria: "", comentario: "" });

  useEffect(() => {
    fetch(`${IP()}/api/feedback-evento/${eventoId}/${turnoId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError("Link inválido"); }
        else if (data.yaRespondio) { setSent(true); }
        setInfo(data);
      })
      .catch(() => setError("No se pudo conectar"))
      .finally(() => setLoading(false));
  }, [eventoId, turnoId]);

  const enviar = async () => {
    if (!form.puntaje) { setError("Elegí un puntaje del 1 al 5"); return; }
    setError("");
    try {
      const res = await fetch(`${IP()}/api/feedback-evento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventoId, turnoId, ...form }),
      });
      const data = await res.json();
      if (data.ok) setSent(true);
      else setError(data.error || "Error al enviar");
    } catch { setError("Error de conexión"); }
  };

  if (loading) return <div style={styles.page}><div style={styles.card}><p style={styles.loading}>Cargando...</p></div></div>;
  if (error && !info) return <div style={styles.page}><div style={styles.card}><p style={styles.error}>{error}</p></div></div>;
  if (sent) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.check}>&#10003;</div>
        <h2 style={styles.title}>Gracias por tu feedback!</h2>
        <p style={styles.subtitle}>Tu opinión nos ayuda a mejorar cada degustación.</p>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Contanos tu experiencia</h2>
        <p style={styles.subtitle}>
          {info?.evento?.nombre} — {info?.turno?.nombre}, nos encantaría saber qué te pareció la degustación.
        </p>

        <label style={styles.label}>Puntaje general</label>
        <div style={styles.stars}>
          {STARS.map((n) => (
            <button key={n} onClick={() => setForm((p) => ({ ...p, puntaje: n }))} style={{ ...styles.star, color: n <= form.puntaje ? "#f5a623" : "#555" }}>
              {n <= form.puntaje ? "\u2605" : "\u2606"}
            </button>
          ))}
        </div>

        <label style={styles.label}>Qué te gustó?</label>
        <textarea style={styles.textarea} rows={3} value={form.loPositivo} onChange={(e) => setForm((p) => ({ ...p, loPositivo: e.target.value }))} placeholder="Los vinos, el ambiente, la atención..." />

        <label style={styles.label}>Qué no te gustó?</label>
        <textarea style={styles.textarea} rows={3} value={form.loNegativo} onChange={(e) => setForm((p) => ({ ...p, loNegativo: e.target.value }))} placeholder="Algo que podríamos mejorar..." />

        <label style={styles.label}>Qué mejorarías?</label>
        <textarea style={styles.textarea} rows={3} value={form.mejoraria} onChange={(e) => setForm((p) => ({ ...p, mejoraria: e.target.value }))} placeholder="Sugerencias para la próxima..." />

        <label style={styles.label}>Comentario adicional</label>
        <textarea style={styles.textarea} rows={2} value={form.comentario} onChange={(e) => setForm((p) => ({ ...p, comentario: e.target.value }))} placeholder="Algo más que quieras contarnos..." />

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.btn} onClick={enviar}>Enviar feedback</button>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0d", padding: 16, fontFamily: "'Segoe UI', sans-serif" },
  card: { background: "#1a1a1a", borderRadius: 16, padding: "32px 28px", maxWidth: 480, width: "100%", color: "#eee", boxShadow: "0 8px 32px rgba(0,0,0,.5)" },
  title: { margin: "0 0 4px", fontSize: 22, fontWeight: 700, textAlign: "center" },
  subtitle: { margin: "0 0 20px", fontSize: 14, color: "#aaa", textAlign: "center" },
  label: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, marginTop: 14, color: "#ccc" },
  stars: { display: "flex", gap: 6, marginBottom: 8 },
  star: { background: "none", border: "none", fontSize: 32, cursor: "pointer", padding: 0, lineHeight: 1 },
  textarea: { width: "100%", background: "#252525", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#eee", fontSize: 14, resize: "vertical", boxSizing: "border-box" },
  btn: { marginTop: 20, width: "100%", padding: "12px 0", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer" },
  error: { color: "#ef4444", fontSize: 13, marginTop: 8, textAlign: "center" },
  loading: { color: "#aaa", textAlign: "center" },
  check: { textAlign: "center", fontSize: 48, color: "#22c55e", marginBottom: 8 },
};
