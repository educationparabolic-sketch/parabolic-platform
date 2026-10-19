/* eslint-disable require-jsdoc */
import {assertUniqueCommandJson} from "./examRuntimeOwnership";
import {Timestamp} from "firebase-admin/firestore";
import type {ExamProctoringRequirementsV1, ExamProctoringPolicyV1,
  ExamProctoringActivationRequestV1, ExamProctoringFailureV1} from "../../../shared/contracts/examProctoring";

export class ExamProctoringError extends Error {
  constructor(public readonly code: ExamProctoringFailureV1["code"],
    public readonly reason: ExamProctoringFailureV1["reason"]) {
    super("Exam policy requirements are unavailable or invalid.");
    this.name = "ExamProctoringError";
  }
}
const fail = (reason: ExamProctoringFailureV1["reason"],
  code: ExamProctoringFailureV1["code"] = "SESSION_LOCKED"): never => {
  throw new ExamProctoringError(code, reason);
};
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]): boolean =>
  Object.keys(v).length === expected.length && expected.every((k) => Object.prototype.hasOwnProperty.call(v, k));

export function readProctoringRequirements(value: unknown, stored = false): ExamProctoringRequirementsV1 {
  const invalid = () => fail(stored ? "policy_upgrade_required" : "invalid_proctoring_request",
    stored ? "SESSION_LOCKED" : "VALIDATION_ERROR");
  if (!object(value) || value.contractVersion !== 1 ||
      !keys(value, ["contractVersion", "browserIntegrityGuardEnabled", "cameraReadiness"]) ||
      typeof value.browserIntegrityGuardEnabled !== "boolean") return invalid();
  if (value.cameraReadiness !== "off" && value.cameraReadiness !== "required") {
    return stored ? fail("policy_unsupported") : invalid();
  }
  return {contractVersion: 1, browserIntegrityGuardEnabled: value.browserIntegrityGuardEnabled,
    cameraReadiness: value.cameraReadiness};
}
export function issueProctoringPolicy(value: unknown): ExamProctoringPolicyV1 {
  const requirements = readProctoringRequirements(value, true);
  return {...requirements, capabilities: {automatedFaceMatching: "unavailable",
    automatedGazeTracking: "unavailable", cameraReadiness: "browser_permission_only",
    browserIntegrity: "browser_controls_only"}, identityPhotoReview: "not_required",
  integrityReporting: requirements.browserIntegrityGuardEnabled || requirements.cameraReadiness === "required" ?
    "client_observations" : "off"};
}
export function readProctoringPolicy(value: unknown): ExamProctoringPolicyV1 {
  if (!object(value) || !keys(value, ["contractVersion", "browserIntegrityGuardEnabled",
    "cameraReadiness", "capabilities", "identityPhotoReview", "integrityReporting"])) {
    return fail("policy_upgrade_required");
  }
  const expected = issueProctoringPolicy({contractVersion: value.contractVersion,
    browserIntegrityGuardEnabled: value.browserIntegrityGuardEnabled, cameraReadiness: value.cameraReadiness});
  if (!object(value.capabilities) || !keys(value.capabilities, Object.keys(expected.capabilities)) ||
      Object.entries(expected.capabilities).some(([key, entry]) =>
        (value.capabilities as Record<string, unknown>)[key] !== entry) ||
      value.identityPhotoReview !== expected.identityPhotoReview ||
      value.integrityReporting !== expected.integrityReporting) return fail("policy_unsupported");
  return expected;
}
export function readActivationPreflight(value: unknown): ExamProctoringActivationRequestV1 {
  const invalid = () => fail("invalid_proctoring_request", "VALIDATION_ERROR");
  if (!object(value) || !keys(value, ["contractVersion", "preflight"]) || value.contractVersion !== 1 ||
      !object(value.preflight)) return invalid();
  const p = value.preflight;
  if (p.camera === "not_requested" && keys(p, ["camera"])) {
    return {contractVersion: 1, preflight: {camera: "not_requested"}};
  }
  if (p.camera === "client_reported_ready" && keys(p, ["camera", "consentNoticeVersion", "consentAccepted"]) &&
      p.consentNoticeVersion === "exam-camera-local-v1" && p.consentAccepted === true) {
    return {contractVersion: 1, preflight: {camera: p.camera,
      consentNoticeVersion: "exam-camera-local-v1", consentAccepted: true}};
  }
  return invalid();
}
export function assertActivationPreflight(policy: ExamProctoringPolicyV1,
  command: ExamProctoringActivationRequestV1): void {
  if (policy.cameraReadiness === "required" && command.preflight.camera !== "client_reported_ready") {
    fail("preflight_required", "CONFLICT");
  }
  if (policy.cameraReadiness === "off" && command.preflight.camera !== "not_requested") {
    fail("policy_mismatch", "CONFLICT");
  }
}
export function initializeIntegrityReporting(endMillis: number, nowMillis: number) {
  return {contractVersion: 1, acceptedBatchCount: 0, acceptedEventCount: 0, lastAcceptedAt: null,
    initializedAt: Timestamp.fromMillis(nowMillis),
    closesAt: Timestamp.fromMillis(Math.min(endMillis, nowMillis + 86_400_000))};
}

export function assertProctoringJson(raw: Buffer | undefined): void {
  try {
    assertUniqueCommandJson(raw);
  } catch {
    fail("invalid_proctoring_request", "VALIDATION_ERROR");
  }
}
