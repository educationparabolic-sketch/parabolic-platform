/* eslint-disable max-len */
import type * as functions from "firebase-functions";
import {createHmac, timingSafeEqual} from "crypto";
import {getAppCheck} from "firebase-admin/app-check";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {verifyCurrentAccountIdentity, currentIdentityClaims} from "./currentAccountIdentity";
import {AdmissionError, consumeSecurityRate, IngressAdmission, securityOperation} from "./securityRateLimits";

export const ingressAdmission = new IngressAdmission();
export function isolatedAdmissionEmulator(environment = process.env): boolean {
  return environment.NODE_ENV === "test" && !!(environment.GOOGLE_CLOUD_PROJECT || environment.GCLOUD_PROJECT || environment.PROJECT_ID)?.startsWith("demo-") &&
    environment.FUNCTIONS_EMULATOR === "true" && environment.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9099" &&
    environment.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080";
}
// CLI 15 routes HTTP into worker Unix sockets. All isolated IPC traffic shares one local bucket.
export function trustedIngressPeer(request: functions.https.Request, environment = process.env): string | undefined {
  return request.socket?.remoteAddress ?? (isolatedAdmissionEmulator(environment) &&
    environment.PORT?.startsWith("/") ? "127.0.0.1" : undefined);
}
export function admissionConfiguration(environment = process.env) {
  const project = environment.GOOGLE_CLOUD_PROJECT || environment.GCLOUD_PROJECT || environment.PROJECT_ID;
  const mode = environment.APP_CHECK_MODE;
  const local = isolatedAdmissionEmulator(environment);
  if (!project || !["enforced", "pending_provisioning"].includes(mode ?? "") ||
      mode === "pending_provisioning" && !(environment.NODE_ENV === "staging" || local) ||
      environment.SECURITY_TEST_APP_CHECK_KEY && !local) throw new AdmissionError("INTERNAL_ERROR");
  const appIds = (environment.APP_CHECK_ALLOWED_APP_IDS ?? "").split(",").filter(Boolean);
  if (mode === "enforced" && (!appIds.length || appIds.some((id) => !/^\d+:\d+:web:[A-Za-z0-9_-]+$/u.test(id)))) {
    throw new AdmissionError("INTERNAL_ERROR");
  }
  return {project, mode, appIds, testKey: local ? environment.SECURITY_TEST_APP_CHECK_KEY : undefined};
}
// SDK 11's key-provider callback wraps availability failures as invalid-argument.
// Only its anchored provider prefix is inspected; raw provider text never escapes.
export const appCheckUnavailable = (error: unknown) => {
  const e = error as {code?: string; message?: string};
  return !["app-check/invalid-argument", "app-check/app-check-token-expired"].includes(e?.code ?? "") ||
    /^error in secret or public key callback: (?:Error fetching Json Web Keys|Error fetching public keys)/u.test(e?.message ?? "");
};
export async function verifyApplicationToken(raw: string, project: string, appIds: string[], testKey?: string) {
  let appId: string; let audience: unknown; let expires: number;
  try {
    if (testKey) {
      const parts = raw.split(".");
      if (parts.length !== 2) throw new AdmissionError("FORBIDDEN");
      const signature = createHmac("sha256", testKey).update(parts[0]).digest();
      const supplied = Buffer.from(parts[1], "base64url");
      if (signature.length !== supplied.length || !timingSafeEqual(signature, supplied)) throw new AdmissionError("FORBIDDEN");
      const decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      if (decoded.providerFailure === true) throw new AdmissionError("INTERNAL_ERROR");
      appId = decoded.appId; audience = decoded.aud; expires = decoded.exp;
    } else {
      const decoded = await getAppCheck(getFirebaseAdminApp()).verifyToken(raw); // reusable, no consume/replay network call
      appId = decoded.appId; audience = decoded.token.aud; expires = decoded.token.exp;
    }
  } catch (error) {
    if (error instanceof AdmissionError) throw error;
    throw new AdmissionError(testKey || !appCheckUnavailable(error) ? "FORBIDDEN" : "INTERNAL_ERROR");
  }
  if (!appIds.includes(appId) || !Array.isArray(audience) || !audience.includes(`projects/${project}`) ||
      !Number.isFinite(expires) || expires * 1000 <= Date.now()) throw new AdmissionError("FORBIDDEN");
}
export function singleHeader(request: functions.https.Request, name: string): string | undefined {
  const value = request.headers[name];
  const occurrences = (request.rawHeaders ?? []).filter((_, index) => index % 2 === 0)
    .filter((key) => key.toLowerCase() === name).length;
  if (occurrences > 1 || typeof value !== "string" || !value || value.length > 8192 || /\s|,/u.test(value)) return undefined;
  return value;
}
const admitted = new WeakMap<object, Promise<void>>();
export async function admitApplicationRequest(name: string, request: functions.https.Request): Promise<void> {
  const prior = admitted.get(request); if (prior) return prior;
  const work = (async () => {
    if (["vendorLicenseUpdate", "adminQuestionAssets", "adminQuestionsBulk"].includes(name)) return;
    const config = admissionConfiguration();
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !/^Bearer [^\s,]+$/iu.test(authorization)) throw new AdmissionError("UNAUTHORIZED");
    const {token} = await verifyCurrentAccountIdentity(getFirebaseAdminApp().auth(), authorization.slice(7));
    const identity = currentIdentityClaims(token, token.uid);
    const service = name === "internalEmailQueue" && ["service", "backend_service"].includes(identity.role);
    if (name === "internalEmailQueue" && !service) throw new AdmissionError("FORBIDDEN");
    if (!service && config.mode === "enforced") {
      const raw = singleHeader(request, "x-firebase-appcheck");
      if (!raw) throw new AdmissionError("FORBIDDEN");
      await verifyApplicationToken(raw, config.project, config.appIds, config.testKey);
    }
    await consumeSecurityRate(config.project, token.uid, identity.instituteId, securityOperation(name, request.method));
  })();
  admitted.set(request, work); return work;
}
