import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../../../shared/services/authProvider";
import { ensureFirebaseClient } from "../../../shared/services/firebaseClient";
import { initializeFrontendMonitoring } from "../../../shared/services/frontendMonitoring";
import { GlobalPortalStateProvider } from "../../../shared/services/globalPortalState";
import { UiErrorBoundary } from "../../../shared/ui/components";
import "./index.css";
import App from "./App.tsx";

try {
  ensureFirebaseClient();
} catch (error) {
  console.warn(
    "[vendor] Firebase client was not initialized. Check app environment variables.",
    error,
  );
}
initializeFrontendMonitoring({ portal: "vendor" });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider portalKey="vendor">
      <GlobalPortalStateProvider portalKey="vendor">
        <UiErrorBoundary portalLabel="Vendor Portal">
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </UiErrorBoundary>
      </GlobalPortalStateProvider>
    </AuthProvider>
  </StrictMode>,
)
