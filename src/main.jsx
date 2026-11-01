import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AccessibilityTools from "./components/AccessibilityTools";
import "./style.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <AccessibilityTools />
  </React.StrictMode>,
);
