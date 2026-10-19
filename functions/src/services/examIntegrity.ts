/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import type {ExamIntegrityBatchRequestV1, ExamIntegrityBatchResultV1,
  ExamIntegrityEventTypeV1} from "../../../shared/contracts/examProctoring";
import {getFirestore} from "../utils/firebaseAdmin";
import {StudentProfileService} from "./studentProfile";
import {photoAccessFail, photoAccessId} from "./studentIdentityPhotoAccess";
import {assertRuntimeOwner, assertUniqueCommandJson} from "./examRuntimeOwnership";
import {ExamProctoringError, readProctoringPolicy} from "./examProctoringPolicy";
import {InstituteAuthorityEnforcementService} from "./instituteAuthorityEnforcement";

const types: readonly ExamIntegrityEventTypeV1[] = ["FULLSCREEN_ENTERED", "FULLSCREEN_REQUEST_FAILED",
  "FULLSCREEN_EXIT", "FULLSCREEN_REENTERED", "TAB_SWITCH", "WINDOW_BLUR", "WINDOW_FOCUS_RETURNED",
  "COPY_BLOCKED", "PASTE_BLOCKED", "CUT_BLOCKED", "CONTEXT_MENU_BLOCKED", "SHORTCUT_BLOCKED",
  "NETWORK_LOSS", "RECONNECTED", "CAMERA_READY", "CAMERA_DENIED", "CAMERA_LOST"];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => record(v) &&
  Object.keys(v).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(v, key));
const invalid = (): never => {
  throw new ExamProctoringError("VALIDATION_ERROR", "invalid_integrity_batch");
};
export function readIntegrityBatch(value: unknown): ExamIntegrityBatchRequestV1 {
  if (!exact(value, ["contractVersion", "batchId", "events"]) || value.contractVersion !== 1 ||
      typeof value.batchId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.batchId) ||
      !Array.isArray(value.events) || value.events.length < 1 || value.events.length > 10) return invalid();
  for (const event of value.events) {
    if (!exact(event, ["eventType", "observedAt", "phase"]) ||
        !types.includes(event.eventType as ExamIntegrityEventTypeV1) ||
        typeof event.phase !== "string" || !["lobby", "instructions", "exam"].includes(event.phase) ||
        typeof event.observedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(event.observedAt) ||
        !Number.isFinite(Date.parse(event.observedAt)) ||
        new Date(event.observedAt).toISOString() !== event.observedAt) return invalid();
  }
  return value as unknown as ExamIntegrityBatchRequestV1;
}
export function readIntegrityJson(raw: Buffer | undefined): ExamIntegrityBatchRequestV1 {
  if (!raw || raw.length > 8192 || !raw.equals(Buffer.from(raw.toString("utf8"), "utf8"))) return invalid();
  try {
    assertUniqueCommandJson(raw);
    return readIntegrityBatch(JSON.parse(raw.toString("utf8")));
  } catch {
    return invalid();
  }
}
export function integrityFingerprint(batch: ExamIntegrityBatchRequestV1): string {
  return createHash("sha256").update(JSON.stringify([1, batch.batchId,
    batch.events.map((e) => [e.eventType, e.observedAt, e.phase])])).digest("hex");
}
const upgrade = (): never => {
  throw new ExamProctoringError("SESSION_LOCKED", "policy_upgrade_required");
};
function reportingState(value: unknown) {
  if (!exact(value, ["contractVersion", "acceptedBatchCount", "acceptedEventCount", "lastAcceptedAt",
    "initializedAt", "closesAt"]) || value.contractVersion !== 1 ||
      !Number.isSafeInteger(value.acceptedBatchCount) || !Number.isSafeInteger(value.acceptedEventCount) ||
      Number(value.acceptedBatchCount) < 0 || Number(value.acceptedBatchCount) > 60 ||
      Number(value.acceptedEventCount) < Number(value.acceptedBatchCount) ||
      Number(value.acceptedEventCount) > Number(value.acceptedBatchCount) * 10 ||
      !(value.initializedAt instanceof Timestamp) || !(value.closesAt instanceof Timestamp) ||
      value.closesAt.toMillis() <= value.initializedAt.toMillis() ||
      value.closesAt.toMillis() > value.initializedAt.toMillis() + 86_400_000 ||
      (value.acceptedBatchCount === 0 ? value.lastAcceptedAt !== null :
        !(value.lastAcceptedAt instanceof Timestamp) ||
        value.lastAcceptedAt.toMillis() < value.initializedAt.toMillis() ||
        value.lastAcceptedAt.toMillis() >= value.closesAt.toMillis())) return upgrade();
  return {acceptedBatchCount: Number(value.acceptedBatchCount), acceptedEventCount: Number(value.acceptedEventCount),
    initializedAt: value.initializedAt, closesAt: value.closesAt,
    lastAcceptedAt: value.lastAcceptedAt as Timestamp | null};
}
interface Dependencies {
  firestore?: FirebaseFirestore.Firestore;
  profiles?: StudentProfileService;
  now?: () => Timestamp;
}
export class ExamIntegrityService {
  private readonly firestore: FirebaseFirestore.Firestore;
  private readonly profiles: StudentProfileService;
  private readonly now: () => Timestamp;
  constructor(dependencies: Dependencies = {}) {
    this.firestore = dependencies.firestore ?? getFirestore();
    this.profiles = dependencies.profiles ?? new StudentProfileService();
    this.now = dependencies.now ?? (() => Timestamp.now());
  }
  public async ingest(rawToken: string, sessionId: string, input: unknown,
    ownership: {proof: string; generation: number}): Promise<ExamIntegrityBatchResultV1> {
    photoAccessId(sessionId);
    const batch = readIntegrityBatch(input);
    const fingerprint = integrityFingerprint(batch);
    return this.profiles.withOwnStudent(rawToken, async (transaction, owner) => {
      const {token, instituteId, studentId} = owner;
      const yearId = photoAccessId(token.yearId);
      const runId = photoAccessId(token.runId);
      const launchNonce = photoAccessId(token.launchNonce);
      if (token.sessionId !== sessionId || token.studentId !== studentId) {
        return photoAccessFail("FORBIDDEN", "Session identity does not match.");
      }
      const ref = this.firestore.doc(
        `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}/sessions/${sessionId}`);
      const session = await transaction.get(ref);
      const data = session.data();
      if (!data || data.instituteId !== instituteId || data.yearId !== yearId || data.runId !== runId ||
          data.sessionId !== sessionId || data.studentId !== studentId || data.studentUid !== studentId) {
        return photoAccessFail("NOT_FOUND", "Entered owning session was not found.");
      }
      const now = this.now();
      assertRuntimeOwner(data, {instituteId, yearId, runId, sessionId, studentId,
        runtimeOwner: {...ownership, studentUid: studentId, launchNonce}}, now.toMillis());
      const authority = new InstituteAuthorityEnforcementService({firestore: this.firestore, now: () => now.toDate()});
      authority.assertActiveSessionAllowed(await authority.readCurrentAuthority(transaction, instituteId), data);
      const policy = readProctoringPolicy(data.runtimeSnapshot?.proctoringPolicy);
      const state = reportingState(data.integrityReportingState);
      const deadline = data.deadlineAt ?? data.runtimeSnapshot?.schedule?.sessionEndsAt;
      const deadlineMs = deadline instanceof Timestamp ? deadline.toMillis() :
        typeof deadline === "string" ? Date.parse(deadline) : NaN;
      if (!["started",
        "active"].includes(data.status) || !Number.isFinite(deadlineMs) || now.toMillis() >= deadlineMs) {
        return photoAccessFail("SESSION_NOT_ACTIVE", "Session is not active.");
      }
      if (policy.integrityReporting !== "client_observations") {
        throw new ExamProctoringError("CONFLICT", "integrity_disabled");
      }
      if (now.toMillis() < state.initializedAt.toMillis() || now.toMillis() >= state.closesAt.toMillis()) {
        throw new ExamProctoringError("SESSION_LOCKED", "integrity_window_closed");
      }
      const receiptRef = ref.collection("integrityBatches").doc(batch.batchId);
      const existing = await transaction.get(receiptRef);
      const receipt = existing.data();
      if (receipt) {
        if (!(receipt.retainedUntil instanceof Timestamp) ||
          !(receipt.receivedAt instanceof Timestamp)) return upgrade();
        if (now.toMillis() >= receipt.retainedUntil.toMillis()) {
          throw new ExamProctoringError("SESSION_LOCKED", "integrity_receipt_expired");
        }
        if (!exact(receipt, ["contractVersion", "batchId", "generation", "requestFingerprint", "events",
          "source", "receivedAt", "retainedUntil"]) || receipt.source !== "client_report" ||
            !Number.isSafeInteger(receipt.generation) || Number(receipt.generation) < 1) return upgrade();
        try {
          const stored = readIntegrityBatch({contractVersion: receipt.contractVersion,
            batchId: receipt.batchId, events: receipt.events});
          if (stored.batchId !== batch.batchId || integrityFingerprint(stored) !== receipt.requestFingerprint) {
            return upgrade();
          }
        } catch {
          return upgrade();
        }
        if (receipt.requestFingerprint !== fingerprint || receipt.generation !== ownership.generation) {
          throw new ExamProctoringError("CONFLICT", "integrity_batch_conflict");
        }
        return this.result(sessionId, batch, ownership.generation, "replayed", receipt.receivedAt,
          receipt.retainedUntil);
      }
      if (state.acceptedBatchCount >= 60 || state.acceptedEventCount + batch.events.length > 600) {
        throw new ExamProctoringError("SESSION_LOCKED", "integrity_capacity_reached");
      }
      if (state.lastAcceptedAt && now.toMillis() - state.lastAcceptedAt.toMillis() < 5000) {
        throw new ExamProctoringError("CONFLICT", "integrity_rate_limited");
      }
      const retainedUntil = Timestamp.fromMillis(now.toMillis() + 30 * 86_400_000);
      transaction.create(receiptRef, {contractVersion: 1, batchId: batch.batchId, generation: ownership.generation,
        requestFingerprint: fingerprint, events: batch.events, source: "client_report", receivedAt: now,
        retainedUntil});
      transaction.update(ref, {"integrityReportingState.acceptedBatchCount": state.acceptedBatchCount + 1,
        "integrityReportingState.acceptedEventCount": state.acceptedEventCount + batch.events.length,
        "integrityReportingState.lastAcceptedAt": now});
      return this.result(sessionId, batch, ownership.generation, "accepted", now, retainedUntil);
    });
  }
  private result(sessionId: string, batch: ExamIntegrityBatchRequestV1, generation: number,
    disposition: "accepted" | "replayed", receivedAt: Timestamp, retainedUntil: Timestamp): ExamIntegrityBatchResultV1 {
    return {contractVersion: 1, sessionId, batchId: batch.batchId, generation, disposition,
      acceptedCount: batch.events.length, receivedAt: receivedAt.toDate().toISOString(),
      retainedUntil: retainedUntil.toDate().toISOString(), source: "client_report"};
  }
}
