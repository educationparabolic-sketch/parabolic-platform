/* eslint-disable max-len */
import {createHash, createHmac, randomBytes} from "crypto";
import {isIP} from "net";
import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {MiddlewareRejectionError} from "../types/middleware";

export const SECURITY_LIMITS = {all: 1200, read: 600, mutation: 60, expensive: 10,
  examStart: 20, examOwnership: 120, examAnswers: 600, examCommit: 30, examIntegrity: 120} as const;
export type SecurityOperation = Exclude<keyof typeof SECURITY_LIMITS, "all">;
export class AdmissionError extends MiddlewareRejectionError {
  constructor(code: "RATE_LIMITED" | "FORBIDDEN" | "INTERNAL_ERROR" | "UNAUTHORIZED", public readonly retryAfterSeconds?: number) {
    super(code, code === "RATE_LIMITED" ? "Request rate limit reached. Retry later." :
      code === "FORBIDDEN" ? "Application attestation is required." :
        code === "UNAUTHORIZED" ? "Authentication is required." : "Security admission is unavailable.");
  }
}
export const securityOperation = (name: string, method: string): SecurityOperation => {
  if (name === "examStart") return "examStart";
  if (name === "examSessionEntry") return "examOwnership";
  if (name === "examSessionAnswers") return "examAnswers";
  if (["examSessionActivate", "examSessionSubmit"].includes(name)) return "examCommit";
  if (name === "examSessionIntegrityEvents") return "examIntegrity";
  if (name.startsWith("vendorSimulation") || name === "vendorCalibrationSimulation" ||
      name === "vendorCalibrationPush" || name === "vendorIntelligenceInitialize" ||
      method !== "GET" && ["adminQuestionPackages", "adminStudentDataExport", "adminAcademicYearArchive",
        "adminGovernanceTransport", "vendorCalibrationOperations"].includes(name)) return "expensive";
  return method === "GET" ? "read" : "mutation";
};
export const rateDigest = (project: string, uid: string, scope: string, bucket: string) =>
  createHash("sha256").update(JSON.stringify(["security-rate-v1", project, uid, scope, bucket])).digest("hex");
export const retrySeconds = (now: number) => Math.max(1, Math.min(60, Math.ceil((Math.floor(now / 60000) * 60000 + 60000 - now) / 1000)));
// Fixed stable documents; TTL is delayed cleanup and never a window-reset condition.
export async function consumeSecurityRate(project: string, uid: string, instituteId: string | null,
  operation: SecurityOperation, db = getFirestore(), now = Date.now()): Promise<void> {
  const scope = instituteId === null ? "global-vendor" : `institute:${instituteId}`;
  const prefix = instituteId === null ? "securityGlobalRateLimits" : `institutes/${instituteId}/securityRateLimits`;
  const windowStartMs = Math.floor(now / 60000) * 60000;
  const buckets = ["all", operation] as const;
  const refs = buckets.map((bucket) => db.doc(`${prefix}/${rateDigest(project, uid, scope, bucket)}`));
  try {
    await db.runTransaction(async (transaction) => {
      const snapshots = await transaction.getAll(...refs);
      const counts = snapshots.map((snapshot) => {
        if (!snapshot.exists) return 0;
        const data = snapshot.data();
        if (!data) throw new AdmissionError("INTERNAL_ERROR");
        if (data.version !== 1 || !Number.isSafeInteger(data.windowStartMs) || data.windowStartMs % 60000 !== 0 ||
            data.windowStartMs > windowStartMs || !Number.isSafeInteger(data.used) || data.used < 0 ||
            !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() < data.windowStartMs + 60000) {
          throw new AdmissionError("INTERNAL_ERROR");
        }
        return data.windowStartMs === windowStartMs ? data.used as number : 0;
      });
      if (counts.some((count, index) => count >= SECURITY_LIMITS[buckets[index]])) {
        throw new AdmissionError("RATE_LIMITED", retrySeconds(now));
      }
      refs.forEach((ref, index) => transaction.set(ref, {version: 1, windowStartMs, used: counts[index] + 1,
        expiresAt: Timestamp.fromMillis(windowStartMs + 60000 + 24 * 60 * 60 * 1000)}));
    });
  } catch (error) {
    if (error instanceof AdmissionError) throw error;
    throw new AdmissionError("INTERNAL_ERROR");
  }
}
export class IngressAdmission {
  private readonly key = randomBytes(32);
  private readonly entries = new Map<string, {window: number; used: number; health: number}>();
  consume(project: string, peer: string | undefined, health: boolean, now = Date.now()) {
    if (!peer || !isIP(peer)) throw new AdmissionError("INTERNAL_ERROR");
    const window = Math.floor(now / 60000);
    for (const [key, value] of this.entries) if (value.window < window) this.entries.delete(key);
    const digest = createHmac("sha256", this.key).update(JSON.stringify([project, peer])).digest("hex");
    let entry = this.entries.get(digest);
    if (!entry) {
      if (this.entries.size >= 4096) throw new AdmissionError("RATE_LIMITED", retrySeconds(now));
      entry = {window, used: 0, health: 0}; this.entries.set(digest, entry);
    }
    if (entry.window > window) throw new AdmissionError("INTERNAL_ERROR");
    if (entry.used >= 1200 || health && entry.health >= 60) throw new AdmissionError("RATE_LIMITED", retrySeconds(now));
    entry.used++; if (health) entry.health++;
  }
}
