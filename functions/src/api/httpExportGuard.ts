import {admitApplicationRequest, ingressAdmission, trustedIngressPeer} from "../services/applicationAdmission";
import {AdmissionError} from "../services/securityRateLimits";
import {MiddlewareRejectionError} from "../types/middleware";
import {buildErrorResponse, sendErrorResponse, STANDARD_API_ERROR_STATUS} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import type * as functions from "firebase-functions";
import {API_ROUTE_MANIFEST, BACKEND_HTTP_EXPORT_MANIFEST} from "../apiRouteManifest";
import {resolveApiRoutePath} from "./apiGateway";
import {requestCorrelationId} from "../services/diagnosticDisclosure";
import {safeApiRouteParameters} from "./apiRouteParameters";

type Handler = (request: functions.https.Request, response: functions.Response) => Promise<void> | void;

// Direct transport cannot select another export's operation or an implicit mutation.
export interface HttpAdmissionDependencies {
  admit: typeof admitApplicationRequest;
  ingress: (request: functions.https.Request, health: boolean) => void;
}
const ingressSeen = new WeakSet<object>();
const productionAdmission: HttpAdmissionDependencies = {
  admit: admitApplicationRequest,
  ingress: (request, health) => {
    if (ingressSeen.has(request)) return;
    const project = getFirebaseAdminApp().options.projectId;
    if (!project) throw new AdmissionError("INTERNAL_ERROR");
    // Immediate server-observed transport peer; never Express proxy/X-Forwarded-For input.
    ingressAdmission.consume(project, trustedIngressPeer(request), health);
    ingressSeen.add(request);
  },
};
export const guardHttpExport = (name: string, handler: Handler,
  admission: HttpAdmissionDependencies = productionAdmission): Handler => {
  const entry = BACKEND_HTTP_EXPORT_MANIFEST.find((item) => item.functionExport === name);
  if (!entry) throw new Error("Unclassified HTTP export.");
  const routes = API_ROUTE_MANIFEST.filter((route) => route.functionExport === name);
  return async (request, response) => {
    response.set("Cache-Control", "private, max-age=0, no-store");
    response.set("Pragma", "no-cache");
    response.set("X-Content-Type-Options", "nosniff");
    try {
      admission.ingress(request, entry.disposition === "healthcheck");
      if (["webhook", "healthcheck"].includes(entry.disposition)) return await handler(request, response);
      if (entry.disposition === "gateway") {
        const selected = resolveApiRoutePath(request.path).find((match) => match.route.method === request.method);
        if (selected?.route.functionExport) await admission.admit(selected.route.functionExport, request);
        return await handler(request, response);
      }
      const path = request.path.startsWith("/api/v1/") ? request.path : `/api/v1${request.path}`;
      const matches = resolveApiRoutePath(path).filter((match) => match.route.functionExport === name);
      // A root alias exists only for a single exact operation or a direct-only legacy/service endpoint.
      const root = request.path === "/" && routes.length <= 1;
      const methods = root ? routes.length ? [routes[0].method] : ["POST"] :
        matches.map((match) => match.route.method);
      if (!root && matches.length === 0) {
        sendErrorResponse(response, requestCorrelationId(request), "NOT_FOUND", "API route not found.");
        return;
      }
      if (!methods.includes(request.method as "GET" | "POST" | "PATCH")) {
        response.set("Allow", [...new Set(methods)].sort().join(", "));
        sendErrorResponse(response, requestCorrelationId(request), "METHOD_NOT_ALLOWED",
          "Method is not allowed.");
        return;
      }
      if (!root) {
        const parameters = matches.find((match) => match.route.method === request.method)?.parameters ?? {};
        if (!safeApiRouteParameters(parameters)) {
          sendErrorResponse(response, requestCorrelationId(request), "VALIDATION_ERROR",
            "Resource identifier is invalid.");
          return;
        }
        Object.assign(request.params, parameters);
      }
      if (!["vendorLicenseUpdate", "adminQuestionAssets", "adminQuestionsBulk"].includes(name)) {
        await admission.admit(name, request);
      }
      return await handler(request, response);
    } catch (error) {
      const code = error instanceof MiddlewareRejectionError ? error.code : "INTERNAL_ERROR";
      const seconds = error instanceof AdmissionError ? error.retryAfterSeconds : undefined;
      if (seconds) response.set("Retry-After", String(seconds));
      response.status(STANDARD_API_ERROR_STATUS[code] ?? 500).json(buildErrorResponse(code,
        error instanceof MiddlewareRejectionError ? error.message : "Security admission is unavailable.",
        requestCorrelationId(request), new Date().toISOString(),
        error instanceof AdmissionError && code === "FORBIDDEN" ? {reason: "app_check_denied"} : undefined));
    }
  };
};
