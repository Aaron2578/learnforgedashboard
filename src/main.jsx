import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AuthGate from "./portal/AuthGate.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="Application Error">
      <AuthGate />
    </ErrorBoundary>
  </StrictMode>,
);
