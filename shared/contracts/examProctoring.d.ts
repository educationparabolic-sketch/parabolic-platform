/**
 * BWM-045 v1: backend policy/activation/ingest and mounted Admin/Exam callers adopted locally.
 * Exact validation, rollout, bounds and retention: docs/EXAM_PROCTORING_CONTRACT.md.
 * Browser reports cannot prove camera continuity, identity, gaze or misconduct.
 */
export interface ExamProctoringRequirementsV1 {
  contractVersion: 1;
  browserIntegrityGuardEnabled: boolean;
  cameraReadiness: "off" | "required";
}

/** Issued by the server from supported immutable run/session requirements. */
export interface ExamProctoringPolicyV1 extends ExamProctoringRequirementsV1 {
  capabilities: {
    automatedFaceMatching: "unavailable";
    automatedGazeTracking: "unavailable";
    cameraReadiness: "browser_permission_only";
    browserIntegrity: "browser_controls_only";
  };
  identityPhotoReview: "not_required";
  integrityReporting: "off" | "client_observations";
}

/** Supplementary to Firebase identity and BWM-044 owner headers, never proof. */
export type ExamProctoringActivationRequestV1 = {
  contractVersion: 1;
  preflight:
    | {camera: "not_requested"; consentNoticeVersion?: never; consentAccepted?: never}
    | {
      camera: "client_reported_ready";
      consentNoticeVersion: "exam-camera-local-v1";
      consentAccepted: true;
    };
};

/** Fixed categories only; no free text, keys, URLs, images or answer content. */
export type ExamIntegrityEventTypeV1 =
  | "FULLSCREEN_ENTERED"
  | "FULLSCREEN_REQUEST_FAILED"
  | "FULLSCREEN_EXIT"
  | "FULLSCREEN_REENTERED"
  | "TAB_SWITCH"
  | "WINDOW_BLUR"
  | "WINDOW_FOCUS_RETURNED"
  | "COPY_BLOCKED"
  | "PASTE_BLOCKED"
  | "CUT_BLOCKED"
  | "CONTEXT_MENU_BLOCKED"
  | "SHORTCUT_BLOCKED"
  | "NETWORK_LOSS"
  | "RECONNECTED"
  | "CAMERA_READY"
  | "CAMERA_DENIED"
  | "CAMERA_LOST";

export interface ExamIntegrityEventV1 {
  eventType: ExamIntegrityEventTypeV1;
  /** Canonical UTC ISO string, untrusted and never an authority timestamp. */
  observedAt: string;
  phase: "lobby" | "instructions" | "exam";
}

/** EXM-07; nonempty 1..10 events, <=8192 UTF-8 raw JSON bytes. */
export interface ExamIntegrityBatchRequestV1 {
  contractVersion: 1;
  batchId: string;
  events: readonly [ExamIntegrityEventV1, ...ExamIntegrityEventV1[]];
}

export interface ExamIntegrityBatchResultV1 {
  contractVersion: 1;
  sessionId: string;
  batchId: string;
  generation: number;
  disposition: "accepted" | "replayed";
  acceptedCount: number;
  receivedAt: string;
  retainedUntil: string;
  source: "client_report";
}

/** Existing standard envelope codes, with safe error.details.reason. */
export type ExamProctoringFailureV1 =
  | {code: "VALIDATION_ERROR"; reason: "invalid_proctoring_request" | "invalid_integrity_batch"}
  | {code: "SESSION_LOCKED"; reason: "policy_upgrade_required" | "policy_unsupported" | "integrity_capacity_reached" | "integrity_receipt_expired" | "integrity_window_closed"}
  | {code: "CONFLICT"; reason: "preflight_required" | "policy_mismatch" | "integrity_disabled" | "integrity_batch_conflict"}
  | {code: "CONFLICT"; reason: "integrity_rate_limited"; retryAfterSeconds: 5};
