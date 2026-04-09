import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ensureFirebaseClient } from "../../../shared/services/firebaseClient";
import "./index.css";
import App from "./App.tsx";

try {
  ensureFirebaseClient();
} catch (error) {
  console.warn(
    "[student] Firebase client was not initialized. Check app environment variables.",
    error,
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
