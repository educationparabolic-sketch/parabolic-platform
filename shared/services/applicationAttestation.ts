import {getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck} from "firebase/app-check";
import {ensureFirebaseClient} from "./firebaseClient";
import {protectedApplicationRoute} from "./securityApiRoutes";
import {ApiClientError} from "../types/apiClient";
let instance: AppCheck | undefined;
export async function applicationAttestation(method: string, target: string): Promise<string | null> {
  if (typeof window === "undefined" || !protectedApplicationRoute(method, new URL(target, window.location.origin), window.location.origin)) return null;
  const mode = import.meta.env.VITE_APP_CHECK_MODE;
  if (mode === "pending_provisioning") return null; // Explicit release validation limits this to non-production qualification.
  if (mode !== "enforced" || !import.meta.env.VITE_APP_CHECK_PROVIDER_KEY) throw new ApiClientError("Application attestation is unavailable.", 500, "INTERNAL_ERROR", null);
  try {
    instance ??= initializeAppCheck(ensureFirebaseClient().app, {provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_APP_CHECK_PROVIDER_KEY), isTokenAutoRefreshEnabled: true});
    return (await getToken(instance, false)).token; // Standard reusable token; domain replay ownership stays independent.
  } catch {throw new ApiClientError("Application attestation is unavailable.", 500, "INTERNAL_ERROR", null);}
}
