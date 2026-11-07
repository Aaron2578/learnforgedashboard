import React from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an uncaught render error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (e) {
        console.warn("Error during error boundary reset:", e);
      }
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || "Something went wrong in this view";
      const message = this.state.error?.message || "An unexpected error occurred while rendering.";

      return (
        <div
          role="alert"
          style={{
            padding: "24px",
            margin: "16px auto",
            maxWidth: "700px",
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #fecaca",
            boxShadow: "0 4px 12px rgba(239, 68, 68, 0.08)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "#fee2e2",
              color: "#dc2626",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "12px",
            }}
          >
            <AlertCircle size={26} />
          </div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px", color: "#1e293b" }}>
            {title}
          </h2>
          <p style={{ fontSize: "13.5px", color: "#64748b", margin: "0 0 16px", lineHeight: 1.5 }}>
            {message}
          </p>

          <div
            style={{
              display: "flex",
              gap: "10px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="button primary"
              onClick={this.handleReset}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <RefreshCw size={14} /> Try again
            </button>
            <button
              type="button"
              className="button"
              onClick={this.handleReload}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <RefreshCw size={14} /> Reload page
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                try {
                  window.location.hash = "";
                  window.location.reload();
                } catch {}
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Home size={14} /> Return to Home
            </button>
          </div>

          {process.env.NODE_ENV !== "production" && this.state.errorInfo && (
            <details style={{ marginTop: "18px", textAlign: "left", fontSize: "11px", color: "#94a3b8" }}>
              <summary style={{ cursor: "pointer", color: "#64748b" }}>Technical stack trace</summary>
              <pre
                style={{
                  background: "#f8fafc",
                  padding: "10px",
                  borderRadius: "6px",
                  overflowX: "auto",
                  marginTop: "8px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {this.state.error?.stack || String(this.state.error)}
                {"\n"}
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

