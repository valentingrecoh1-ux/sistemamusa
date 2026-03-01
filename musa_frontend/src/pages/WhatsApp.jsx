import React, { useState, useEffect, useCallback } from "react";
import { IP } from "../main";
import s from "./WhatsApp.module.css";

function WhatsApp() {
  const [status, setStatus] = useState("disconnected");
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${IP()}/api/whatsapp/status`);
      const data = await res.json();
      setStatus(data.status);
      if (data.qr) setQr(data.qr);
      else setQr(null);
    } catch (e) {
      console.error("Error fetching WA status:", e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const connect = async () => {
    setLoading(true);
    setQr(null);
    try {
      const res = await fetch(`${IP()}/api/whatsapp/connect`, { method: "POST" });
      const data = await res.json();
      setStatus(data.status);
      if (data.qr) setQr(data.qr);
    } catch (e) {
      console.error("Error connecting WA:", e);
    }
    setLoading(false);
  };

  const disconnect = async () => {
    setLoading(true);
    try {
      await fetch(`${IP()}/api/whatsapp/disconnect`, { method: "POST" });
      setStatus("disconnected");
      setQr(null);
    } catch (e) {
      console.error("Error disconnecting WA:", e);
    }
    setLoading(false);
  };

  const send = async () => {
    if (!phone || !message) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(`${IP()}/api/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message }),
      });
      const data = await res.json();
      if (data.sent) {
        setSendResult({ type: "success", text: "Mensaje enviado" });
        setMessage("");
      } else {
        setSendResult({ type: "error", text: data.error || "Error al enviar" });
      }
    } catch (e) {
      setSendResult({ type: "error", text: e.message });
    }
    setSending(false);
  };

  const statusLabel = {
    disconnected: "Desconectado",
    connecting: "Conectando...",
    qr: "Escanea el QR",
    connected: "Conectado",
  };

  const statusClass = {
    disconnected: s.statusDisconnected,
    connecting: s.statusConnecting,
    qr: s.statusQr,
    connected: s.statusConnected,
  };

  return (
    <div className={s.container}>
      {/* Connection card */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <i className="bi bi-whatsapp"></i> WhatsApp
        </h2>

        <div className={s.statusRow}>
          <span className={s.statusLabel}>Estado:</span>
          <span className={`${s.statusBadge} ${statusClass[status] || ""}`}>
            {statusLabel[status] || status}
          </span>
        </div>

        {/* QR Code */}
        {qr && (
          <div className={s.qrBox}>
            <p className={s.qrText}>Escaneá este código con WhatsApp:</p>
            <img src={qr} alt="QR WhatsApp" className={s.qrImage} />
          </div>
        )}

        {/* Connect / Disconnect buttons */}
        <div className={s.btnRow}>
          {status !== "connected" ? (
            <button
              className={s.connectBtn}
              onClick={connect}
              disabled={loading || status === "connecting"}
            >
              {loading || status === "connecting" ? "Conectando..." : "Conectar"}
            </button>
          ) : (
            <button
              className={s.disconnectBtn}
              onClick={disconnect}
              disabled={loading}
            >
              Desconectar
            </button>
          )}
        </div>
      </div>

      {/* Send message card */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>Enviar mensaje</h2>

        {status !== "connected" && (
          <div className={s.warning}>
            <i className="bi bi-exclamation-triangle"></i>
            Conecta WhatsApp primero para poder enviar mensajes
          </div>
        )}

        <div className={s.formGroup}>
          <label className={s.label}>Telefono (con codigo de pais)</label>
          <input
            type="text"
            className={s.input}
            placeholder="5491155551234"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={status !== "connected"}
          />
          <span className={s.hint}>Ej: 5491155551234 (sin +, sin espacios, sin guiones)</span>
        </div>

        <div className={s.formGroup}>
          <label className={s.label}>Mensaje</label>
          <textarea
            className={s.textarea}
            placeholder="Escribe tu mensaje..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={status !== "connected"}
            rows={4}
          />
        </div>

        <button
          className={s.sendBtn}
          onClick={send}
          disabled={status !== "connected" || sending || !phone || !message}
        >
          {sending ? "Enviando..." : "Enviar"}
        </button>

        {sendResult && (
          <div className={sendResult.type === "success" ? s.successMsg : s.errorMsg}>
            {sendResult.text}
          </div>
        )}
      </div>
    </div>
  );
}

export default WhatsApp;
