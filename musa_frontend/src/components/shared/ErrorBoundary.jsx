import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Error inesperado en la interfaz.",
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("UI crash capturado por ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(165deg, #020617 0%, #0b1226 100%)",
          color: "#e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        <div
          style={{
            width: "min(520px, 92vw)",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            borderRadius: "14px",
            background: "rgba(15, 23, 42, 0.9)",
            padding: "18px 20px",
            boxShadow: "0 12px 34px rgba(2, 6, 23, 0.45)",
          }}
        >
          <div style={{ fontSize: "0.78rem", letterSpacing: "0.08em", color: "#94a3b8" }}>
            ERROR DE INTERFAZ
          </div>
          <h2 style={{ margin: "8px 0 6px", fontSize: "1.2rem", color: "#f8fafc" }}>
            La pantalla se recupero para evitar una caida total
          </h2>
          <p style={{ margin: "0 0 14px", color: "#cbd5e1", fontSize: "0.93rem" }}>
            {this.state.errorMessage}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: "1px solid rgba(59, 130, 246, 0.45)",
              borderRadius: "999px",
              background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
              color: "#f8fafc",
              fontWeight: 700,
              fontSize: "0.83rem",
              cursor: "pointer",
              padding: "8px 14px",
            }}
          >
            Recargar interfaz
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
