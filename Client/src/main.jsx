import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { initWebVitals } from "./lib/webVitals.js";
import { registerServiceWorker } from "./lib/registerServiceWorker.js";

initWebVitals();
registerServiceWorker();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
