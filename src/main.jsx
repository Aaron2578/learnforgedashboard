import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AuthGate from "./portal/AuthGate.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <AuthGate />
    </ThemeProvider>
  </StrictMode>,
);
