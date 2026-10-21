import { RuntimeClock, interactionElapsed } from "./runtimeClock";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Route, Routes, useLocation, useParams } from "react-router-dom";
import type {
  ExamAnswerFlushReason,
  ExamAnswerBatchRequestBody,
  ExamAnswerWrite,
  ExamExecutionMode,
  ExamQuestionResponse,
  ExamRuntimePhaseConfigSnapshot as PhaseConfigSnapshot,
  ExamRuntimeQuestion as SessionQuestion,
  ExamRuntimeQuestionDifficulty as DifficultyBand,
  ExamRuntimeSnapshot as SessionSnapshot,
  ExamRuntimeTimingProfileSnapshot as TimingProfileSnapshot,
  ExamSessionActivationResult,
  ExamSessionEntryResult,
  ExamSubmissionReason,
  ExamSubmitRequestBody,
  ExamSubmitResult,
} from "../../../shared/contracts/apiDtos";
import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
import { toCdnAssetUrl } from "../../../shared/services/cdnAssetDelivery";
import { ApiClientError } from "../../../shared/services/apiClient";
import { useAuthProvider } from "../../../shared/services/authProvider";
import { useGlobalPortalState } from "../../../shared/services/globalPortalState";
import {
  adaptExamSessionActivationResult,
  adaptExamSubmitResult,
} from "../../../shared/services/portalResponseAdapters";
import { getFrontendEnvironment } from "../../../shared/services/frontendEnvironment";
import { getFirebaseAuth } from "../../../shared/services/firebaseClient";
import { getLaunchMetadata } from "./launchBootstrap";
import { getExamRuntimeOwnership } from "./launchTransport";
import { resolveStudentReturnUrl } from "./studentReturn";
import { CameraReadiness, CAMERA_NOTICE, type CameraState } from "./cameraReadiness";
import { IntegrityQueue, type ReportingState } from "./integrityQueue";
import type { ExamProctoringActivationRequestV1, ExamIntegrityEventTypeV1 } from "../../../shared/contracts/examProctoring";
import {displayResponse, mergeAnswerRecovery, readAnswerAcknowledgements, readLocalSnapshot, validatePendingAnswers,
  type QuestionResponseState, type QuestionTimingState, type SessionRecoverySnapshot, type RejectedAnswer} from "./answerRecovery";
import {RecoveryStorage} from "./recoveryStorage";
import type {ExamRecoveryDurabilityV1} from "../../../shared/contracts/examResilience";
import "./App.css";

type QuestionPaletteStatus = "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked";
type ExecutionMode = ExamExecutionMode;
type QuestionSection = string;
type PhaseId = "phase1" | "phase2" | "phase3" | "buffer";
type SubmissionReason = ExamSubmissionReason;
type SessionLifecycleState = "created" | "started" | "active" | "submitted" | "expired" | "terminated";
type ExamAuthorityInterruption = "session_revoked" | "institute_suspended" | "license_restricted";
type ExamEntryStage = "entry_not_open" | "pre_exam_lobby" | "instructions_waiting" | "entry_closed" | "exam_active";
type PreExamCheckState = "pending" | "passed" | "failed" | "skipped";
type BrowserIntegrityEventType = ExamIntegrityEventTypeV1;
type CalculatorOperation =
  | "sqrt"
  | "square"
  | "cbrt"
  | "cube"
  | "log"
  | "ln"
  | "sin"
  | "cos"
  | "tan"
  | "pi"
  | "e"
  | "clear"
  | "backspace"
  | "equals";

interface TokenClaims {
  sub: string | null;
  exp: number | null;
  mode: ExecutionMode;
  instituteId: string | null;
  yearId: string | null;
  runId: string | null;
  sessionId: string | null;
  launchNonce: string | null;
}

type EntryValidationReason =
  | "missing_token"
  | "expired_token"
  | "malformed_token"
  | "wrong_session"
  | "iframe_blocked"
  | "server_validation_failed"
  | null;

interface EntryValidationResult {
  allowed: boolean;
  reason: EntryValidationReason;
  claims: TokenClaims;
}

interface ModeInstruction {
  title: string;
  points: string[];
}

interface LobbyModeDetail {
  title: string;
  summary: string;
  focus: string;
}

interface PreExamChecklistItem {
  id: string;
  label: string;
  state: PreExamCheckState;
  helper: string;
}

interface PaletteTile {id: string; number: number; section: QuestionSection; status: QuestionPaletteStatus; revisitLocked: boolean}

interface AdaptivePhaseSnapshot {
  currentPhase: PhaseId;
  elapsedPercent: number;
  answeredPercent: number;
  phaseAdherencePercent: number;
  overspendPercent: number;
  difficultyCompliancePercent: number;
  skipPatternScore: number;
  disciplineIndex: number;
}

interface ExamSessionSchedule {
  earlyEntryOpensAtMs: number;
  sessionStartsAtMs: number;
  sessionEndsAtMs: number;
  durationMs: number;
  earlyEntryBufferMinutes: number;
  timezone: string;
}

type QueuedAnswerWrite = ExamAnswerWrite;

type SyncState = "idle" | "syncing" | "offline" | "error";

interface PhasePresentation {
  shortLabel: string;
  title: string;
  description: string;
}

interface PhaseScheduleItem extends PhasePresentation {
  phaseId: PhaseId;
  startMs: number;
  endMs: number;
  durationMs: number;
}

const TICK_INTERVAL_MS = 1_000;
const EARLY_SUBMIT_DISCIPLINE_THRESHOLD = 65;
const EARLY_SUBMIT_PHASE_ADHERENCE_THRESHOLD = 62;
const MAX_RUSHED_SAVE_BEFORE_SLOWDOWN = 2;
function StudentPortalReturnButton({label = "Return to Student Portal"}: {label?: string}) {
  const target = resolveStudentReturnUrl(import.meta.env.VITE_PORTAL_BASE_URL,
    window.location.origin, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL);
  return <>
    <button type="button" className="exam-start-button" disabled={!target}
      onClick={() => {if (target) window.location.assign(target);}}>{label}</button>
    {!target ? <p role="status">Student Portal link is unavailable. Contact your institute to reopen My Tests.</p> : null}
  </>;
}
const ANSWER_BATCH_INTERVAL_MS = 5_000;
const ANSWER_BATCH_MAX_SIZE = 10;
const HEARTBEAT_INTERVAL_MS = 20_000;
const DEV_MOCK_SESSION_TOKEN = "dev";
const MARKING_SCHEME = [
  "+4 for each correct answer",
  "-1 for each incorrect MCQ answer",
  "0 for unanswered questions",
  "Numeric-type questions do not carry negative marking unless explicitly configured",
];

const NAVIGATION_INSTRUCTIONS = [
  "Use the left question palette for direct question jumps.",
  "Use section tabs to focus on Physics, Chemistry, or Mathematics.",
  "Answered questions are tracked in green tiles and review-marked ones in purple variants.",
  "Submission should only happen after final review of unanswered and marked questions.",
];

const MODE_INSTRUCTIONS: Record<ExecutionMode, ModeInstruction> = {
  Operational: {
    title: "Operational Mode",
    points: [
      "Free question navigation is available across all sections for the full exam.",
      "No phase awareness, question visibility restriction, or pacing intervention is shown to the candidate.",
      "Behaviour events are captured silently for post-submit analytics.",
    ],
  },
  Controlled: {
    title: "Controlled Mode",
    points: [
      "Phase objectives, phase timer, and progress indicators are visible.",
      "You may navigate to any question, and phase expiry starts overstay instead of forcing transition.",
      "Proceed to Phase 2 unlocks only after every question has been viewed.",
    ],
  },
  Diagnostic: {
    title: "Diagnostic Mode",
    points: [
      "Phase transitions happen automatically at the configured phase boundaries.",
      "Phase 2 shows answered-and-marked questions only; Phase 3 shows unanswered-and-marked questions only.",
      "Questions hidden by phase rules return in the buffer phase.",
    ],
  },
  Hard: {
    title: "Hard Mode",
    points: [
      "Diagnostic phase visibility rules are enabled for this session.",
      "Minimum thinking time is enforced before navigation or save actions unlock.",
      "Sequential progression and question discipline events are captured for training analytics.",
    ],
  },
};

const LOBBY_MODE_DETAILS: Record<ExecutionMode, LobbyModeDetail> = {
  Operational: {
    title: "Standard Exam Entry",
    summary: "Open navigation with silent integrity capture.",
    focus: "Confirm device readiness and continue to the instruction sheet.",
  },
  Controlled: {
    title: "Guided Phase Entry",
    summary: "Phase objectives, pacing support, and overstay visibility are enabled.",
    focus: "Complete checks before reviewing the phase plan and controlled start rules.",
  },
  Diagnostic: {
    title: "Diagnostic Execution Entry",
    summary: "Automatic phase transitions and filtered question visibility are enabled.",
    focus: "Calibrate identity checks before the diagnostic phase engine takes over.",
  },
  Hard: {
    title: "Hard Mode Entry",
    summary: "Sequential discipline, minimum time locks, and strict timing capture are enabled.",
    focus: "Finish every readiness gate before entering the restricted instruction flow.",
  },
};

const QUESTION_PALETTE_LEGEND: Array<{ status: QuestionPaletteStatus; label: string }> = [
  { status: "not_visited", label: "Not Visited" },
  { status: "not_answered", label: "Not Answered" },
  { status: "answered", label: "Answered" },
  { status: "marked", label: "Marked for Review" },
  { status: "answered_marked", label: "Answered & Marked" },
];

const CALCULATOR_KEYS = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "(", ")", "+"];
function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

function parseExecutionMode(value: unknown): ExecutionMode | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "operational" || normalized === "l0") {
    return "Operational";
  }
  if (normalized === "diagnostic" || normalized === "focused" || normalized === "l1") {
    return "Diagnostic";
  }
  if (normalized === "controlled" || normalized === "l2") {
    return "Controlled";
  }
  if (normalized === "hard") {
    return "Hard";
  }

  return null;
}

function parseTokenClaims(token: string): TokenClaims | null {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(tokenParts[1] ?? "")) as Record<string, unknown>;
    const nestedClaims = payload.claims;
    const claims = nestedClaims && typeof nestedClaims === "object" && !Array.isArray(nestedClaims) ?
      nestedClaims as Record<string, unknown> :
      payload;
    const instituteId = typeof claims.instituteId === "string" ? claims.instituteId.trim() : "";
    const yearId = typeof claims.yearId === "string" ? claims.yearId.trim() : "";
    const runId = typeof claims.runId === "string" ? claims.runId.trim() : "";
    const sessionId = typeof claims.sessionId === "string" ? claims.sessionId.trim() : "";
    const launchNonce = typeof claims.launchNonce === "string" ? claims.launchNonce.trim() : "";
    const subject = claims.studentId ?? payload.sub ?? payload.uid;

    return {
      sub: typeof subject === "string" && subject.trim().length > 0 ? subject.trim() : null,
      exp: typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null,
      mode:
        parseExecutionMode(claims.mode) ??
        parseExecutionMode(claims.executionMode) ??
        parseExecutionMode(claims.licenseLayer) ??
        "Operational",
      instituteId: instituteId.length > 0 ? instituteId : null,
      yearId: yearId.length > 0 ? yearId : null,
      runId: runId.length > 0 ? runId : null,
      sessionId: sessionId.length > 0 ? sessionId : null,
      launchNonce: launchNonce.length > 0 ? launchNonce : null,
    };
  } catch {
    return null;
  }
}

function isExamDevMockEntryEnabled(): boolean {
  return import.meta.env.DEV && getFrontendEnvironment().examDevMockEntry === true;
}

function buildDevMockTokenClaims(sessionId: string, modeOverride: string | null): TokenClaims {
  const resolvedMode = parseExecutionMode(modeOverride) ?? "Operational";

  return {
    sub: "Dev Mock Candidate",
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    mode: resolvedMode,
    instituteId: "inst-dev-mock",
    yearId: "year-dev-mock",
    runId: "run-dev-mock",
    sessionId: sessionId || "dev-mock-session",
    launchNonce: "dev-mock-launch",
  };
}

function validateSessionEntry(
  token: string | null,
  sessionId: string,
  modeOverride: string | null,
): EntryValidationResult {
  if (window.self !== window.top) {
    return {
      allowed: false,
      reason: "iframe_blocked",
      claims: {
        sub: null,
        exp: null,
        mode: "Operational",
        instituteId: null,
        yearId: null,
        runId: null,
        sessionId: null,
        launchNonce: null,
      },
    };
  }

  if (isExamDevMockEntryEnabled() && token?.trim() === DEV_MOCK_SESSION_TOKEN) {
    return {
      allowed: true,
      reason: null,
      claims: buildDevMockTokenClaims(sessionId, modeOverride),
    };
  }

  if (!token || token.trim().length === 0) {
    return {
      allowed: false,
      reason: "missing_token",
      claims: {
        sub: null,
        exp: null,
        mode: "Operational",
        instituteId: null,
        yearId: null,
        runId: null,
        sessionId: null,
        launchNonce: null,
      },
    };
  }

  const claims = parseTokenClaims(token.trim());
  if (!claims) {
    return {
      allowed: false,
      reason: "malformed_token",
      claims: {
        sub: null,
        exp: null,
        mode: "Operational",
        instituteId: null,
        yearId: null,
        runId: null,
        sessionId: null,
        launchNonce: null,
      },
    };
  }

  if (!claims.sessionId || claims.sessionId !== sessionId) {
    return {
      allowed: false,
      reason: "wrong_session",
      claims,
    };
  }

  return {
    allowed: true,
    reason: null,
    claims,
  };
}

function statusClassName(status: QuestionPaletteStatus): string {
  switch (status) {
    case "not_visited":
      return "exam-palette-tile-not-visited";
    case "not_answered":
      return "exam-palette-tile-not-answered";
    case "answered":
      return "exam-palette-tile-answered";
    case "marked":
      return "exam-palette-tile-marked";
    case "answered_marked":
      return "exam-palette-tile-answered-marked";
    default:
      return "exam-palette-tile-not-visited";
  }
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

function toCountdownLabel(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return clamp((numerator / denominator) * 100, 0, 100);
}

function isBrowserFullscreenActive(): boolean {
  return Boolean(document.fullscreenElement);
}

function isRestrictedKeyboardEvent(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  const ctrlOrMeta = event.ctrlKey || event.metaKey;

  return (
    key === "f12" ||
    (ctrlOrMeta && ["c", "v", "x", "p", "s", "u"].includes(key)) ||
    (ctrlOrMeta && event.shiftKey && ["i", "j", "c"].includes(key))
  );
}


function buildInitialResponseMap(questions: SessionQuestion[]): Record<string, QuestionResponseState> {
  return questions.reduce<Record<string, QuestionResponseState>>((accumulator, question) => {
    accumulator[question.id] = {
      selectedOptionId: null,
      numericResponse: "",
      matrixSelections: [],
      markedForReview: false,
    };
    return accumulator;
  }, {});
}

function buildInitialTimingMap(
  questions: SessionQuestion[],
  timingProfile: TimingProfileSnapshot,
): Record<string, QuestionTimingState> {
  return questions.reduce<Record<string, QuestionTimingState>>((accumulator, question) => {
    accumulator[question.id] = {
      timeSpentMs: 0,
      minTimeSec: timingProfile.minTimeByDifficultySec[question.difficulty],
      maxTimeSec: timingProfile.maxTimeByDifficultySec[question.difficulty],
      maxTimeLocked: false,
      minTimeViolationCount: 0,
    };
    return accumulator;
  }, {});
}

function toDurationMinutesLabel(totalDurationMs: number): number {
  return Math.max(1, Math.ceil(totalDurationMs / 1000 / 60));
}

function toCompactDurationLabel(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

function toMinuteSecondCountdownLabel(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function buildEmptySessionSnapshot(sessionId: string): SessionSnapshot {
  const nowIso = new Date().toISOString();
  const endIso = new Date(Date.now() + 60_000).toISOString();
  return {
    difficultyDistribution: {easyPercent: 0, hardPercent: 0, mediumPercent: 0},
    hardModeRevisitRestricted: false,
    license: {currentLayer: "L0", eligibilityFlags: {}, featureFlags: {}},
    mode: "Operational",
    phaseConfigSnapshot: {
      bufferPercent: 0,
      phase1Percent: 100,
      phase2Percent: 0,
      phase3Percent: 0,
    },
    proctoringPolicy: {
      browserIntegrityGuardEnabled: false,
      contractVersion: 1,
      cameraReadiness: "off",
      capabilities: {automatedFaceMatching: "unavailable", automatedGazeTracking: "unavailable", cameraReadiness: "browser_permission_only", browserIntegrity: "browser_controls_only"},
      identityPhotoReview: "not_required",
      integrityReporting: "off",
    },
    questionSetVersion: "pending",
    questions: [],
    schedule: {
      durationMs: 60_000,
      earlyEntryBufferMinutes: 0,
      earlyEntryOpensAt: nowIso,
      sessionEndsAt: endIso,
      sessionStartsAt: nowIso,
      timezone: "UTC",
    },
    sessionId,
    subjects: [],
    timingProfile: {
      controlledSlowdownSeconds: 1,
      finalWindowMinutes: 1,
      hardModeRestrictSubmitUntilAllVisited: false,
      hardModeSequentialNavigation: false,
      maxTimeByDifficultySec: {easy: 1, hard: 1, medium: 1},
      minTimeByDifficultySec: {easy: 0, hard: 0, medium: 0},
      syncEveryMs: 10_000,
    },
  };
}

function toExamSessionSchedule(snapshot: SessionSnapshot): ExamSessionSchedule {
  return {
    durationMs: snapshot.schedule.durationMs,
    earlyEntryBufferMinutes: snapshot.schedule.earlyEntryBufferMinutes,
    earlyEntryOpensAtMs: Date.parse(snapshot.schedule.earlyEntryOpensAt),
    sessionEndsAtMs: Date.parse(snapshot.schedule.sessionEndsAt),
    sessionStartsAtMs: Date.parse(snapshot.schedule.sessionStartsAt),
    timezone: snapshot.schedule.timezone,
  };
}

function toTimeLabel(epochMs: number, timezone: string): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  });
}

function hasAnswer(question: SessionQuestion, responseState: QuestionResponseState): boolean {
  if (question.type === "mcq") {
    return Boolean(responseState.selectedOptionId);
  }
  if (question.type === "numeric") {
    return responseState.numericResponse.trim().length > 0;
  }

  return responseState.matrixSelections.length > 0;
}

function serializeResponseForPersistence(
  question: SessionQuestion,
  responseState: QuestionResponseState,
): ExamQuestionResponse {
  if (question.type === "mcq") {
    return responseState.selectedOptionId ?
      {kind: "mcq", optionId: responseState.selectedOptionId} :
      {kind: "unanswered"};
  }

  if (question.type === "numeric") {
    const normalizedValue = responseState.numericResponse.trim();
    return normalizedValue.length > 0 ?
      {kind: "numeric", value: normalizedValue} :
      {kind: "unanswered"};
  }

  if (responseState.matrixSelections.length === 0) {
    return {kind: "unanswered"};
  }

  return {
    kind: "matrix",
    selections: responseState.matrixSelections
      .map((selection) => {
        const [row, column] = selection.split("::");
        return {column, row};
      })
      .sort((left, right) =>
        left.row.localeCompare(right.row) ||
        left.column.localeCompare(right.column)),
  };
}

function toPaletteStatus(question: SessionQuestion, responseState: QuestionResponseState, hasVisited: boolean): QuestionPaletteStatus {
  if (!hasVisited) {
    return "not_visited";
  }

  const answered = hasAnswer(question, responseState);
  if (answered && responseState.markedForReview) {
    return "answered_marked";
  }
  if (answered) {
    return "answered";
  }
  if (responseState.markedForReview) {
    return "marked";
  }
  return "not_answered";
}

function getQuestionIndex(questions: SessionQuestion[], questionId: string): number {
  return questions.findIndex((question) => question.id === questionId);
}

function getPublicQuestionFieldKey(question: SessionQuestion): string {
  return `question-${question.number}`;
}

function getPhaseId(elapsedPercent: number, phaseConfigSnapshot: PhaseConfigSnapshot): PhaseId {
  const phase1Cutoff = phaseConfigSnapshot.phase1Percent;
  const phase2Cutoff = phaseConfigSnapshot.phase1Percent + phaseConfigSnapshot.phase2Percent;
  const phase3Cutoff = phase2Cutoff + phaseConfigSnapshot.phase3Percent;

  if (elapsedPercent <= phase1Cutoff) {
    return "phase1";
  }
  if (elapsedPercent <= phase2Cutoff) {
    return "phase2";
  }
  if (elapsedPercent <= phase3Cutoff) {
    return "phase3";
  }
  return "buffer";
}

function getPhasePresentation(phaseId: PhaseId): PhasePresentation {
  switch (phaseId) {
    case "phase1":
      return {
        shortLabel: "Phase 1",
        title: "Rapid Sweep",
        description: "Move steadily, secure easier questions, and establish attempt momentum.",
      };
    case "phase2":
      return {
        shortLabel: "Phase 2",
        title: "Verification",
        description: "Review answered and marked questions with clean routing.",
      };
    case "phase3":
      return {
        shortLabel: "Phase 3",
        title: "Recovery",
        description: "Review unanswered and marked questions before final closure.",
      };
    case "buffer":
    default:
      return {
        shortLabel: "Buffer",
        title: "Open Review",
        description: "All questions are available again for final edits.",
      };
  }
}

function buildPhaseSchedule(totalDurationMs: number, phaseConfigSnapshot: PhaseConfigSnapshot): PhaseScheduleItem[] {
  const phaseDefinitions: Array<{ phaseId: PhaseId; percent: number }> = [
    { phaseId: "phase1", percent: phaseConfigSnapshot.phase1Percent },
    { phaseId: "phase2", percent: phaseConfigSnapshot.phase2Percent },
    { phaseId: "phase3", percent: phaseConfigSnapshot.phase3Percent },
    { phaseId: "buffer", percent: phaseConfigSnapshot.bufferPercent },
  ];

  let elapsedMs = 0;

  return phaseDefinitions.map((definition, index) => {
    const rawDurationMs = Math.round((totalDurationMs * definition.percent) / 100);
    const durationMs = index === phaseDefinitions.length - 1 ? Math.max(0, totalDurationMs - elapsedMs) : rawDurationMs;
    const startMs = elapsedMs;
    const endMs = Math.min(totalDurationMs, startMs + durationMs);
    elapsedMs = endMs;

    return {
      phaseId: definition.phaseId,
      ...getPhasePresentation(definition.phaseId),
      startMs,
      endMs,
      durationMs: Math.max(0, durationMs),
    };
  });
}

function evaluateExpression(expression: string): number {
  if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
    throw new Error("Invalid expression");
  }

  const evaluator = Function(`"use strict"; return (${expression});`);
  const value = evaluator();

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Evaluation error");
  }

  return value;
}

function evaluateScientificOperation(currentValue: string, operation: CalculatorOperation): string {
  const trimmed = currentValue.trim();

  if (operation === "clear") {
    return "";
  }
  if (operation === "backspace") {
    return currentValue.slice(0, -1);
  }
  if (operation === "pi") {
    return `${currentValue}${Math.PI.toFixed(8)}`;
  }
  if (operation === "e") {
    return `${currentValue}${Math.E.toFixed(8)}`;
  }
  if (operation === "equals") {
    if (trimmed.length === 0) {
      return "";
    }
    return String(evaluateExpression(trimmed));
  }

  if (trimmed.length === 0) {
    return currentValue;
  }

  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) {
    throw new Error("Input must be numeric for scientific operations");
  }

  if (operation === "sqrt") {
    return String(Math.sqrt(numericValue));
  }
  if (operation === "square") {
    return String(numericValue ** 2);
  }
  if (operation === "cbrt") {
    return String(Math.cbrt(numericValue));
  }
  if (operation === "cube") {
    return String(numericValue ** 3);
  }
  if (operation === "log") {
    return String(Math.log10(numericValue));
  }
  if (operation === "ln") {
    return String(Math.log(numericValue));
  }
  if (operation === "sin") {
    return String(Math.sin(numericValue));
  }
  if (operation === "cos") {
    return String(Math.cos(numericValue));
  }

  return String(Math.tan(numericValue));
}

function ExamAccessRedirect(props: { reason: EntryValidationResult["reason"] }) {
  const { reason } = props;

  return (
    <main className="exam-access-shell" aria-live="polite">
      <section className="exam-access-card">
        <p className="exam-access-eyebrow">Secure Entry Check</p>
        <h1>Session Access Blocked</h1>
        <p>
          Exam session access requires a valid signed token generated through the backend exam start flow.
        </p>
        <p className="exam-access-reason">
          Reason:
          {" "}
          <strong>{reason ?? "invalid_entry"}</strong>
        </p>
        <StudentPortalReturnButton label="Go to Student Portal" />
      </section>
    </main>
  );
}

function ExamServerEntryValidationLoading() {
  return (
    <main className="exam-access-shell" aria-live="polite">
      <section className="exam-access-card">
        <p className="exam-access-eyebrow">Secure Entry Check</p>
        <h1>Validating Session</h1>
        <p>
          The exam portal is confirming this signed session token with the backend before loading instructions.
        </p>
      </section>
    </main>
  );
}

function ExamAuthorityInterruptionPage(props: {
  interruption: ExamAuthorityInterruption;
  pendingAnswerCount: number;
}) {
  const { interruption, pendingAnswerCount } = props;
  const heading = interruption === "institute_suspended"
    ? "Institute access suspended"
    : interruption === "license_restricted"
      ? "Exam paused after a license change"
      : "Exam session authorization ended";
  const detail = interruption === "institute_suspended"
    ? "Your institute has suspended access. The exam cannot continue until authority is restored."
    : interruption === "license_restricted"
      ? "The current institute license no longer permits this exam session."
      : "This Firebase session is no longer authorized. Return to the Student Portal to recover access.";

  return (
    <main className="exam-access-shell" aria-live="assertive">
      <section className="exam-access-card">
        <p className="exam-access-eyebrow">Recoverable Session Interruption</p>
        <h1>{heading}</h1>
        <p>{detail}</p>
        <p>
          The exam was not auto-submitted. Responses already accepted by the server remain saved
          {pendingAnswerCount > 0
            ? `, and ${pendingAnswerCount} pending response update(s) remain in this browser for recovery.`
            : "."}
        </p>
        <StudentPortalReturnButton />
      </section>
    </main>
  );
}

function ScientificCalculatorModal(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const [displayValue, setDisplayValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  const runScientificOperation = (operation: CalculatorOperation) => {
    try {
      const nextValue = evaluateScientificOperation(displayValue, operation);
      setDisplayValue(nextValue);
      setError(null);
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : "Calculation error");
    }
  };

  return (
    <div className="exam-calculator-overlay" role="presentation" onClick={onClose}>
      <section
        className="exam-calculator-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Scientific calculator"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="exam-calculator-header">
          <div>
            <p className="exam-calculator-eyebrow">On-screen Utility</p>
            <h2>Scientific Calculator</h2>
          </div>
          <button type="button" className="exam-calculator-close" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="exam-calculator-note">
          Client-side calculator only. No server persistence and no history storage.
        </p>

        <input
          type="text"
          className="exam-calculator-display"
          value={displayValue}
          onChange={(event) => {
            setDisplayValue(event.target.value);
            setError(null);
          }}
          aria-label="Calculator display"
        />

        {error ? <p className="exam-calculator-error">{error}</p> : null}

        <div className="exam-calculator-section-label">Numeric Keypad</div>
        <div className="exam-calculator-grid" aria-label="Arithmetic keypad">
          {CALCULATOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="exam-calculator-key"
              onClick={() => {
                setDisplayValue((current) => `${current}${key}`);
                setError(null);
              }}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="exam-calculator-section-label">Scientific Operations</div>
        <div className="exam-calculator-operations" aria-label="Scientific operations">
          <button type="button" onClick={() => runScientificOperation("sqrt")}>sqrt</button>
          <button type="button" onClick={() => runScientificOperation("square")}>x²</button>
          <button type="button" onClick={() => runScientificOperation("cbrt")}>cbrt</button>
          <button type="button" onClick={() => runScientificOperation("cube")}>x³</button>
          <button type="button" onClick={() => runScientificOperation("log")}>log</button>
          <button type="button" onClick={() => runScientificOperation("ln")}>ln</button>
          <button type="button" onClick={() => runScientificOperation("sin")}>sin</button>
          <button type="button" onClick={() => runScientificOperation("cos")}>cos</button>
          <button type="button" onClick={() => runScientificOperation("tan")}>tan</button>
          <button type="button" onClick={() => runScientificOperation("pi")}>pi</button>
          <button type="button" onClick={() => runScientificOperation("e")}>e</button>
          <button type="button" className="exam-calculator-utility-key" onClick={() => runScientificOperation("backspace")}>Bksp</button>
          <button type="button" className="exam-calculator-utility-key" onClick={() => runScientificOperation("clear")}>Clear</button>
          <button type="button" className="exam-calculator-equals-key" onClick={() => runScientificOperation("equals")}>=</button>
        </div>
      </section>
    </div>
  );
}

function ExamInsightsModal(props: {
  open: boolean;
  onClose: () => void;
  timingStatus: string;
  timingProfileItems: Array<{ label: string; value: string; hint: string }>;
}) {
  const {
    open,
    onClose,
    timingStatus,
    timingProfileItems,
  } = props;

  if (!open) {
    return null;
  }

  return (
    <div className="exam-insights-overlay" role="presentation" onClick={onClose}>
      <section
        className="exam-insights-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Exam insights"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="exam-insights-modal-header">
          <div>
            <p className="exam-insights-modal-eyebrow">Session Insights</p>
            <h2>Timing and control metrics</h2>
          </div>
          <button type="button" className="exam-insights-close" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="exam-insight-card" aria-label="Question timing profile">
          <div className="exam-insight-card-header">
            <div>
              <p className="exam-insight-card-label">Timing Profile</p>
              <h3>Question pacing</h3>
            </div>
            <span className="exam-insight-status">{timingStatus}</span>
          </div>
          <div className="exam-insight-grid">
            {timingProfileItems.map((item) => (
              <article key={item.label} className="exam-insight-metric">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.hint}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function ExamSessionPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const { session: authSession } = useAuthProvider();
  const globalState = useGlobalPortalState();
  const modeFromQuery = useMemo(() => new URLSearchParams(location.search).get("mode"), [location.search]);
  const launchMetadata = getLaunchMetadata();
  const devMockEntryEnabled = useMemo(() => isExamDevMockEntryEnabled(), []);
  const devMockSessionActive = devMockEntryEnabled && launchMetadata.devMock;
  const [entryValidation, setEntryValidation] = useState<EntryValidationResult>(
    () => validateSessionEntry(launchMetadata.devMock ? DEV_MOCK_SESSION_TOKEN : null, sessionId, modeFromQuery),
  );
  const modeInstruction = MODE_INSTRUCTIONS[entryValidation.claims.mode];
  const candidateName = entryValidation.claims.sub ?? "Student Candidate";
  const runtimeOwnership = useMemo(() => getExamRuntimeOwnership(sessionId), [sessionId]);
  const ownership = useSyncExternalStore(runtimeOwnership.subscribe, runtimeOwnership.snapshot);
  const examApiClient = runtimeOwnership;
  const activationInFlightRef = useRef(false);
  const expirySubmitAttemptedRef = useRef(false);
  const submitIntentRef = useRef<ExamSubmitRequestBody | null>(null);
  const submitAttemptRunningRef = useRef(false);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [entryAuthority, setEntryAuthority] = useState<ExamSessionEntryResult | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<SessionSnapshot>(() =>
    buildEmptySessionSnapshot(sessionId || "runtime-session"));
  const sessionSchedule = useMemo(
    () => toExamSessionSchedule(sessionSnapshot),
    [sessionSnapshot],
  );
  const totalDurationMs = sessionSchedule.durationMs;
  const totalDurationMinutesLabel = useMemo(() => toDurationMinutesLabel(totalDurationMs), [totalDurationMs]);

  const [selectedSection, setSelectedSection] = useState<QuestionSection | "All">("All");
  const [selectedQuestionId, setSelectedQuestionId] = useState(sessionSnapshot.questions[0]?.id ?? "");
  const [entryStage, setEntryStage] = useState<ExamEntryStage>("pre_exam_lobby");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [instructionConfirmed, setInstructionConfirmed] = useState(false);
  const [remainingMs, setRemainingMs] = useState(totalDurationMs);
  const runtimeClockRef = useRef(new RuntimeClock());
  const [clockRecoveryRequired, setClockRecoveryRequired] = useState(false);
  const clockPausedRef = useRef(false);
  const transportStoppedRef = useRef(false);
  const clockAttemptRef = useRef<Promise<boolean> | null>(null);
  const clockAttemptStoppedRef = useRef(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [responseStateByQuestionId, setResponseStateByQuestionId] = useState<Record<string, QuestionResponseState>>(() =>
    buildInitialResponseMap(sessionSnapshot.questions),
  );
  const [questionTimingById, setQuestionTimingById] = useState<Record<string, QuestionTimingState>>(() =>
    buildInitialTimingMap(sessionSnapshot.questions, sessionSnapshot.timingProfile),
  );
  const [visitedQuestionIds, setVisitedQuestionIds] = useState<Set<string>>(() =>
    new Set(sessionSnapshot.questions[0] ? [sessionSnapshot.questions[0].id] : []),
  );
  const [hardModeLockedQuestionIds, setHardModeLockedQuestionIds] = useState<Set<string>>(new Set());
  const [slowdownUntilMs, setSlowdownUntilMs] = useState<number | null>(null);
  const [rushedAttemptStreak, setRushedAttemptStreak] = useState(0);
  const adaptivePhaseSnapshotRef = useRef<AdaptivePhaseSnapshot | null>(null);
  const preloadedQuestionImageUrlsRef = useRef<Set<string>>(new Set());
  const cachedQuestionSnapshotsRef = useRef<Map<string, SessionQuestion>>(new Map());
  const questionSnapshotReadCountRef = useRef<Map<string, number>>(new Map());
  const fullscreenExitActiveRef = useRef(false);
  const [skippedQuestionsCount, setSkippedQuestionsCount] = useState(0);
  const [sessionLifecycleState, setSessionLifecycleState] = useState<SessionLifecycleState>("created");
  const [submittedAtIso, setSubmittedAtIso] = useState<string | null>(null);
  const [submissionReason, setSubmissionReason] = useState<SubmissionReason | null>(null);
  const [submissionResult, setSubmissionResult] = useState<ExamSubmitResult | null>(null);
  const [nowEpochMs, setNowEpochMs] = useState(() => Date.now());
  const [pendingAnswerMap, setPendingAnswerMap] = useState<Record<string, QueuedAnswerWrite>>({});
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMessage, setSyncMessage] = useState("No pending answer updates.");
  const [, setLastHeartbeatAtIso] = useState<string | null>(null);
  const [recoveryApplied, setRecoveryApplied] = useState(false);
  const [durability, setDurability] = useState<ExamRecoveryDurabilityV1>("saving");
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const storageWritableRef = useRef(true);
  const [unsupportedRecovery, setUnsupportedRecovery] = useState(false);
  const [rejectedAnswerMap, setRejectedAnswerMap] = useState<Record<string, RejectedAnswer>>({});
  const rejectedAnswerMapRef = useRef<Record<string, RejectedAnswer>>({});
  const unresolvedRef = useRef(new Set<string>());
  const [rejectionsAcknowledged, setRejectionsAcknowledged] = useState(false);
  const rejectionsAcknowledgedRef = useRef(false);
  const pendingAnswerMapRef = useRef<Record<string, QueuedAnswerWrite>>({});
  const lastAnswerWriteAtMsRef = useRef(performance.now() - ANSWER_BATCH_INTERVAL_MS);
  const nextClientRevisionRef = useRef(1);
  const lastIssuedClientTimestampRef = useRef(0);
  const batchSequenceRef = useRef(1);
  const flushInFlightRef = useRef<Promise<boolean> | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitInFlight, setSubmitInFlight] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitWarningAcknowledged, setSubmitWarningAcknowledged] = useState(false);
  const [earlySubmitOverrideAccepted, setEarlySubmitOverrideAccepted] = useState(false);
  const [sessionConflictMessage, setSessionConflictMessage] = useState<string | null>(null);
  const [serverEntryValidationStatus, setServerEntryValidationStatus] = useState<"pending" | "valid" | "invalid">(
    launchMetadata.status !== "invalid" && sessionId ? "pending" : "invalid",
  );
  const [controlledPhaseId, setControlledPhaseId] = useState<PhaseId>("phase1");
  const [fullscreenGateError, setFullscreenGateError] = useState<string | null>(null);
  const integrityQueueRef = useRef<IntegrityQueue | null>(null);
  const phaseRef = useRef<"lobby" | "instructions" | "exam">("lobby");
  const [reporting, setReporting] = useState<ReportingState>({pending: 0, saved: 0, lost: 0, status: "stopped"});
  const [integrityBlockingReason, setIntegrityBlockingReason] = useState<string | null>(null);
  const [browserReadinessState, setBrowserReadinessState] = useState<PreExamCheckState>("passed");
  const [internetCheckState, setInternetCheckState] = useState<PreExamCheckState>("pending");
  const [cameraState, setCameraState] = useState<CameraState>("pending");
  const cameraRef = useRef<CameraReadiness | null>(null);
  const displayedPreviewRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const isOperationalMode = entryValidation.claims.mode === "Operational";
  const isControlledMode = entryValidation.claims.mode === "Controlled";
  const isDiagnosticMode = entryValidation.claims.mode === "Diagnostic";
  const isHardMode = entryValidation.claims.mode === "Hard";
  const browserIntegrityGuardEnabled = sessionSnapshot.proctoringPolicy.browserIntegrityGuardEnabled;
  const cameraRequired = sessionSnapshot.proctoringPolicy.cameraReadiness === "required";
  const cameraCheckState: PreExamCheckState = !cameraRequired ? "skipped" : cameraState === "requesting" ? "pending" : cameraState;
  const hardModeMinimalUI = isHardMode;
  const phaseVisibilityEnforced = isDiagnosticMode || isHardMode;
  const questionTimingEnforced = isHardMode;
  const isSubmitted = sessionLifecycleState === "submitted";
  const currentAuthorityScope = devMockSessionActive || runtimeOwnership.matchesToken(authSession.idToken);
  const authorityInterruption: ExamAuthorityInterruption | null = !currentAuthorityScope ? null :
    authSession.authorityIssue === "session_revoked"
      ? "session_revoked"
      : globalState.isSuspended || authSession.authorityIssue === "institute_suspended"
        ? "institute_suspended"
        : authSession.authorityIssue === "license_restricted" ||
            (globalState.isAuthenticated &&
              (globalState.license.status === "grace" || globalState.license.status === "expired"))
          ? "license_restricted"
          : null;
  const identityInterrupted = !devMockSessionActive && entryAuthority !== null &&
    ((authSession.status === "unauthenticated" && !getFirebaseAuth().currentUser) || (authSession.status === "authenticated" &&
      authSession.user === getFirebaseAuth().currentUser && !runtimeOwnership.matchesToken(authSession.idToken)));
  const ownershipInterrupted = !devMockSessionActive && (ownership.phase === "lost" || ownership.reason === "refresh_pending" || identityInterrupted || (ownership.phase === "active" && !runtimeOwnership.isCurrent()));
  const authorityInterrupted = authorityInterruption !== null || ownershipInterrupted;
  useEffect(() => {
    if (identityInterrupted || (entryAuthority && authorityInterruption)) runtimeOwnership.invalidate("identity_or_authority_changed");
  }, [authorityInterruption, identityInterrupted, runtimeOwnership, entryAuthority]);
  useEffect(() => {
    if (["refresh_pending", "refresh_unavailable", "transport_paused"].includes(ownership.reason)) {
      clockPausedRef.current = true; setClockRecoveryRequired(true);
      if (ownership.reason !== "refresh_pending") clockAttemptStoppedRef.current = true;
    }
  }, [ownership.reason]);
  const reportingEnabled = sessionSnapshot.proctoringPolicy.integrityReporting === "client_observations";
  const locallyEligible = serverEntryValidationStatus === "valid" && !authorityInterrupted &&
    (instructionConfirmed ? remainingMs > 0 : nowEpochMs < sessionSchedule.sessionEndsAtMs) &&
    (sessionLifecycleState === "started" || (sessionLifecycleState === "active" && remainingMs > 0));
  useEffect(() => {
    phaseRef.current = instructionConfirmed ? "exam" : entryStage === "pre_exam_lobby" ? "lobby" : "instructions";
  }, [instructionConfirmed, entryStage]);
  useEffect(() => {
    if (!locallyEligible || !reportingEnabled || devMockSessionActive) {integrityQueueRef.current?.stop(); return;}
    let mounted = true;
    const current = () => mounted && runtimeOwnership.isCurrent() && runtimeOwnership.snapshot().phase === "active" && runtimeOwnership.snapshot().generation === ownership.generation;
    const queue = new IntegrityQueue(sessionId, ownership.generation, current, () => navigator.onLine,
      (body, signal) => examApiClient.post(`/exam/session/${encodeURIComponent(sessionId)}/integrity-events`, {body, signal}),
      state => {if (mounted) setReporting(state);});
    integrityQueueRef.current = queue;
    const online = () => {queue.capture("RECONNECTED", phaseRef.current); queue.wake();};
    const offline = () => queue.capture("NETWORK_LOSS", phaseRef.current);
    const exit = () => queue.stop();
    window.addEventListener("online", online); window.addEventListener("offline", offline); window.addEventListener("pagehide", exit);
    return () => {queue.stop(); mounted = false; window.removeEventListener("online", online); window.removeEventListener("offline", offline); window.removeEventListener("pagehide", exit); if (integrityQueueRef.current === queue) integrityQueueRef.current = null;};
  }, [locallyEligible, reportingEnabled, devMockSessionActive, runtimeOwnership, examApiClient, ownership.generation, sessionId]);
  useEffect(() => {
    if (!locallyEligible || !cameraRequired) {cameraRef.current?.stop(); return;}
    let mounted = true;
    const camera = new CameraReadiness(() => mounted && (devMockSessionActive || (runtimeOwnership.isCurrent() && runtimeOwnership.snapshot().phase === "active" && runtimeOwnership.snapshot().generation === ownership.generation)),
      (state, stream) => {if (mounted) {setCameraState(state); setCameraStream(stream);}},
      type => integrityQueueRef.current?.capture(type, phaseRef.current));
    cameraRef.current = camera;
    const exit = () => camera.stop(); window.addEventListener("pagehide", exit);
    return () => {camera.stop(); mounted = false; window.removeEventListener("pagehide", exit); if (cameraRef.current === camera) cameraRef.current = null;};
  }, [locallyEligible, cameraRequired, devMockSessionActive, runtimeOwnership, ownership.generation, sessionId]);
  const instituteId = entryAuthority?.instituteId ?? entryValidation.claims.instituteId ?? "";
  const yearId = entryAuthority?.yearId ?? entryValidation.claims.yearId ?? "";
  const runId = entryAuthority?.runId ?? entryValidation.claims.runId ?? "";
  const tokenSessionId = entryValidation.claims.sessionId;
  const effectiveSessionId = entryAuthority?.sessionId ??
    (tokenSessionId && tokenSessionId.length > 0 ? tokenSessionId : sessionId);
  const recoveryOwnerId = entryAuthority?.studentId ?? entryValidation.claims.sub ?? "";
  const recoveryScopeHash = runtimeOwnership.recoveryScope();
  const recoveryStorage = useMemo(() => new RecoveryStorage(effectiveSessionId, recoveryScopeHash, ownership.generation,
    runtimeOwnership.isCurrent), [effectiveSessionId, recoveryScopeHash, ownership.generation, runtimeOwnership]);
  const recoveryUiRef = useRef({responseStateByQuestionId, questionTimingById, visitedQuestionIds, hardModeLockedQuestionIds, selectedQuestionId});
  useEffect(() => {recoveryUiRef.current = {responseStateByQuestionId, questionTimingById, visitedQuestionIds, hardModeLockedQuestionIds, selectedQuestionId};},
    [responseStateByQuestionId, questionTimingById, visitedQuestionIds, hardModeLockedQuestionIds, selectedQuestionId]);
  const captureRecovery = useCallback((): SessionRecoverySnapshot => ({schemaVersion: 3, sessionId: effectiveSessionId,
    scopeHash: recoveryScopeHash, runtimeGeneration: ownership.generation, batchSequence: batchSequenceRef.current,
    nextClientRevision: nextClientRevisionRef.current, lastIssuedClientTimestamp: lastIssuedClientTimestampRef.current,
    responseStateByQuestionId: recoveryUiRef.current.responseStateByQuestionId, questionTimingById: recoveryUiRef.current.questionTimingById,
    visitedQuestionIds: [...recoveryUiRef.current.visitedQuestionIds], hardModeLockedQuestionIds: [...recoveryUiRef.current.hardModeLockedQuestionIds],
    selectedQuestionId: recoveryUiRef.current.selectedQuestionId, pendingAnswerMap: pendingAnswerMapRef.current,
    rejectedAnswerMap: rejectedAnswerMapRef.current, unresolvedQuestionIds: [...unresolvedRef.current]}),
    [effectiveSessionId, recoveryScopeHash, ownership.generation]);
  const recordRejections = useCallback((rejected: Record<string, RejectedAnswer>) => {
    rejectedAnswerMapRef.current = rejected; setRejectedAnswerMap(rejected);
    rejectionsAcknowledgedRef.current = false; setRejectionsAcknowledged(false);
  }, []);
  const pendingAnswers = useMemo(() => Object.values(pendingAnswerMap), [pendingAnswerMap]);
  const unansweredQuestionIdsForSubmission = useMemo(
    () =>
      sessionSnapshot.questions
        .filter((question) => {
          const responseState = responseStateByQuestionId[question.id] ?? {
            selectedOptionId: null,
            numericResponse: "",
            matrixSelections: [],
            markedForReview: false,
          };
          return !visitedQuestionIds.has(question.id) || !hasAnswer(question, responseState);
        })
        .map((question) => question.id),
    [responseStateByQuestionId, sessionSnapshot.questions, visitedQuestionIds],
  );

  const applyServerLifecycleAuthority = useCallback((
    authority: Pick<ExamSessionActivationResult,
    "deadlineAt" | "serverTime" | "sessionId" | "status">,
    sentAt: number,
  ): boolean => {
    if (authority.sessionId !== sessionId) {
      return false;
    }
    try {
      runtimeClockRef.current.accept(authority.serverTime, authority.deadlineAt, sentAt, performance.now());
      setRemainingMs(runtimeClockRef.current.remaining(performance.now()));
      setNowEpochMs(runtimeClockRef.current.serverNow(performance.now()));
    } catch {return false;}
    setSessionLifecycleState(authority.status);
    if (authority.status === "expired") {
      setEntryStage("entry_closed");
    }
    return true;
  }, [sessionId]);

  const requestServerActivation = useCallback(async (): Promise<
  ExamSessionActivationResult | null
  > => {
    if (activationInFlightRef.current || !entryValidation.allowed || authorityInterrupted) {
      return null;
    }
    activationInFlightRef.current = true;
    const sentAt = performance.now();
    try {
      const rawAuthority = await examApiClient.post<unknown, ExamProctoringActivationRequestV1>(
          `/exam/session/${encodeURIComponent(effectiveSessionId)}/activate`,
          {body: {contractVersion: 1, preflight: cameraRequired && cameraRef.current?.isReady() && remainingMs > 0
            ? {camera: "client_reported_ready", consentNoticeVersion: "exam-camera-local-v1", consentAccepted: true}
            : {camera: "not_requested"}}},
        );
      const authority = adaptExamSessionActivationResult(rawAuthority);
      if (!applyServerLifecycleAuthority(authority, runtimeOwnership.requestStartedAt(rawAuthority, sentAt))) {
        throw new Error("Server activation authority is not bound to this session.");
      }
      return authority;
    } finally {
      activationInFlightRef.current = false;
    }
  }, [applyServerLifecycleAuthority, authorityInterrupted, effectiveSessionId, entryValidation.allowed, examApiClient, cameraRequired, remainingMs, runtimeOwnership]);

  useEffect(() => {
    if (launchMetadata.status === "invalid" || launchMetadata.sessionId !== sessionId || window.self !== window.top) {
      setServerEntryValidationStatus("invalid");
      return;
    }

    if (
      import.meta.env.DEV &&
      devMockEntryEnabled &&
      launchMetadata.devMock
    ) {
      // TODO(EXP): remove this dev-only mock entry after exam P0/P1/P2 completion.
      void import("./devMockSessionSnapshot")
        .then(({buildDevMockSessionSnapshot}) => {
          const snapshot = buildDevMockSessionSnapshot(
            sessionId || "runtime-session",
            parseExecutionMode(modeFromQuery) ?? "Operational",
          );
          const firstQuestionId = snapshot.questions[0]?.id ?? "";
          setSessionSnapshot(snapshot);
          setSelectedQuestionId(firstQuestionId);
          setResponseStateByQuestionId(buildInitialResponseMap(snapshot.questions));
          setQuestionTimingById(buildInitialTimingMap(
            snapshot.questions,
            snapshot.timingProfile,
          ));
          setVisitedQuestionIds(new Set(firstQuestionId ? [firstQuestionId] : []));
          setRemainingMs(snapshot.schedule.durationMs);
          setServerEntryValidationStatus("valid");
        })
        .catch(() => setServerEntryValidationStatus("invalid"));
      return;
    }

    let live = true;

    setServerEntryValidationStatus("pending");
    const authenticateAndRequestEntry = async () => {
      const {idToken, responseBody, terminal, sentAt} = await runtimeOwnership.start();
      const authenticatedValidation = validateSessionEntry(
        idToken,
        sessionId,
        null,
      );
      if (!authenticatedValidation.allowed) {
        throw new Error("Firebase ID token is not bound to this exam session.");
      }
      return {authenticatedValidation, responseBody, terminal, sentAt};
    };

    void authenticateAndRequestEntry()
      .then(({authenticatedValidation, responseBody, terminal, sentAt}) => {
        if (!live || !runtimeOwnership.isCurrent()) return;
        if (terminal) {
          setEntryValidation(authenticatedValidation);
          setServerEntryValidationStatus("valid");
          setSessionLifecycleState(terminal.status);
          if (terminal.status === "submitted") {
            setSubmissionResult(terminal.submission);
            setSubmissionReason(terminal.submission.submissionReason);
            setSubmittedAtIso(terminal.submission.submittedAt);
          }
          return;
        }
        if (!responseBody) throw new Error("Entry confirmation is unavailable.");
        const serverAllowed =
          responseBody.allowed === true &&
          responseBody.sessionId === sessionId &&
          responseBody.runtimeSnapshot.sessionId === sessionId &&
          responseBody.instituteId === authenticatedValidation.claims.instituteId &&
          responseBody.yearId === authenticatedValidation.claims.yearId &&
          responseBody.runId === authenticatedValidation.claims.runId;
        if (!serverAllowed) {
          throw new Error("Server runtime snapshot is not bound to the authenticated session.");
        }

        const authoritativeValidation: EntryValidationResult = {
          ...authenticatedValidation,
          claims: {
            ...authenticatedValidation.claims,
            mode: responseBody.runtimeSnapshot.mode,
          },
        };
        const firstQuestionId = responseBody.runtimeSnapshot.questions[0]?.id ?? "";
        runtimeClockRef.current.accept(responseBody.serverTime, responseBody.deadlineAt, sentAt, performance.now());
        setNowEpochMs(runtimeClockRef.current.serverNow(performance.now()));
        setEntryAuthority(responseBody);
        setSessionSnapshot(responseBody.runtimeSnapshot);
        setSelectedSection("All");
        setSelectedQuestionId(firstQuestionId);
        const recovered = mergeAnswerRecovery(responseBody.runtimeSnapshot, responseBody.recovery, null);
        setResponseStateByQuestionId(recovered.responses);
        setQuestionTimingById(recovered.timings);
        setHardModeLockedQuestionIds(recovered.locked);
        lastIssuedClientTimestampRef.current = recovered.highWater;
        setVisitedQuestionIds(new Set(firstQuestionId ? [firstQuestionId] : []));
        setRemainingMs(responseBody.runtimeSnapshot.schedule.durationMs);
        setSessionLifecycleState(responseBody.status);
        if (responseBody.status === "active" || responseBody.status === "expired") {
          if (
            responseBody.deadlineAt === null ||
            !applyServerLifecycleAuthority({
              deadlineAt: responseBody.deadlineAt,
              serverTime: responseBody.serverTime,
              sessionId: responseBody.sessionId,
              status: responseBody.status,
            }, sentAt)
          ) {
            throw new Error("Server lifecycle clock is invalid for this session.");
          }
          if (responseBody.status === "active" || responseBody.status === "expired") {
            setInstructionConfirmed(true);
            setEntryStage("exam_active");
            setRecoveryApplied(false);
          }
        }
        setEntryValidation(authoritativeValidation);
        setServerEntryValidationStatus(serverAllowed ? "valid" : "invalid");
      })
      .catch((error) => {
        if (!live) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setServerEntryValidationStatus("invalid");
      });

    return () => {live = false;};
  }, [
    devMockEntryEnabled,
    runtimeOwnership,
    launchMetadata.status,
    launchMetadata.sessionId,
    launchMetadata.devMock,
    modeFromQuery,
    applyServerLifecycleAuthority,
    sessionId,
  ]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted || authorityInterrupted) return;
    let previous = performance.now(), previousWall = Date.now();
    const reset = () => {previous = performance.now(); previousWall = Date.now();};
    document.addEventListener("visibilitychange", reset);
    const tickInterval = window.setInterval(() => {
      const now = performance.now();
      const eligible = sessionLifecycleState === "active" && !submissionUncertain && document.visibilityState !== "hidden" && !clockPausedRef.current && !clockRecoveryRequired &&
        !submitInFlight && (!cameraRequired || !!cameraRef.current?.isReady()) && !integrityBlockingReason;
      const wall = Date.now();
      const interval = interactionElapsed(previous, now, eligible, previousWall, wall); previous = now; previousWall = wall;
      if (interval.uncertain) {clockPausedRef.current = true; setClockRecoveryRequired(true);}
      if (!devMockSessionActive) {
        try {setNowEpochMs(runtimeClockRef.current.serverNow(now)); setRemainingMs(runtimeClockRef.current.remaining(now));}
        catch {clockPausedRef.current = true; setClockRecoveryRequired(true);}
      } else setRemainingMs(current => Math.max(0, current - interval.elapsed));
      if (!interval.elapsed) return;
      setQuestionTimingById(current => {
        const timing = current[selectedQuestionId];
        if (!timing || timing.maxTimeLocked) return current;
        const timeSpentMs = timing.timeSpentMs + interval.elapsed;
        return {...current, [selectedQuestionId]: {...timing, timeSpentMs,
          maxTimeLocked: isHardMode && timeSpentMs >= timing.maxTimeSec * 1000}};
      });
    }, TICK_INTERVAL_MS);
    return () => {window.clearInterval(tickInterval); document.removeEventListener("visibilitychange", reset);};
  }, [authorityInterrupted, instructionConfirmed, isSubmitted, isHardMode, selectedQuestionId,
    clockRecoveryRequired, submitInFlight, cameraRequired, cameraCheckState, integrityBlockingReason, devMockSessionActive, sessionLifecycleState, submissionUncertain]);

  useEffect(() => {
    if (authorityInterrupted) return;
    if (
      !instructionConfirmed ||
      isSubmitted ||
      authorityInterrupted ||
      remainingMs > 0 ||
      sessionLifecycleState !== "active"
    ) {
      return;
    }

    const reconcileTimeout = window.setTimeout(() => {
      void requestServerActivation().catch((error) => {
        setSubmitError(error instanceof Error ? error.message : "Deadline reconciliation failed.");
      });
    }, 0);

    return () => window.clearTimeout(reconcileTimeout);
  }, [authorityInterrupted, instructionConfirmed, isSubmitted, remainingMs, requestServerActivation, sessionLifecycleState]);

  const navigateToQuestion = (questionId: string) => {
    setVisitedQuestionIds((current) => {
      const next = new Set(current);
      next.add(questionId);
      return next;
    });
    setSelectedQuestionId(questionId);
  };

  const replacePendingAnswerMap = useCallback((
    nextPendingMap: Record<string, QueuedAnswerWrite>,
  ): void => {
    pendingAnswerMapRef.current = nextPendingMap;
    setPendingAnswerMap(nextPendingMap);
  }, []);

  const recordLastAnswerWriteAt = useCallback((writeAtMs: number): void => {
    lastAnswerWriteAtMsRef.current = writeAtMs;
  }, []);

  const queueAnswerWrite = useCallback((questionId: string, nextResponseState: QuestionResponseState): boolean => {
    if ((!devMockSessionActive && !runtimeOwnership.isCurrent()) || !entryValidation.allowed || authorityInterrupted || !recoveryApplied || sessionLifecycleState === "expired" || submissionUncertain || clockPausedRef.current || clockRecoveryRequired || document.visibilityState === "hidden") {
      return false;
    }

    const question = sessionSnapshot.questions.find((candidateQuestion) => candidateQuestion.id === questionId);
    if (!question) {
      return false;
    }

    let response: ExamQuestionResponse;
    let incompleteNumeric = false;
    try {
      response = serializeResponseForPersistence(question, nextResponseState);
      if (response.kind === "numeric") {
        incompleteNumeric = !Number.isFinite(Number(response.value));
        if (!incompleteNumeric) response = {kind: "numeric", value: String(Number(response.value))};
      }
    } catch (error) {setSyncState("error"); setSyncMessage(String(error)); return false;}
    const questionTimeSpentMs = questionTimingById[questionId]?.timeSpentMs ?? 0;
    let clientTimestamp: number;
    try {clientTimestamp = devMockSessionActive ? Math.max(Math.floor(performance.now()), lastIssuedClientTimestampRef.current + 1)
      : runtimeClockRef.current.timestamp(lastIssuedClientTimestampRef.current, performance.now());}
    catch (error) {clockPausedRef.current = true; setClockRecoveryRequired(true); setSyncMessage(String(error)); return false;}
    if (!Number.isSafeInteger(clientTimestamp) || clientTimestamp >= 8640000000000000 || nextClientRevisionRef.current >= Number.MAX_SAFE_INTEGER - 1) {
      setSyncState("error"); setSyncMessage("Answer ordering is unavailable. Recover the session before editing."); return false;
    }
    const clientRevision = nextClientRevisionRef.current;
    lastIssuedClientTimestampRef.current = clientTimestamp;
    nextClientRevisionRef.current += 1;
    const queuedWrite: QueuedAnswerWrite = {
      clientRevision,
      clientTimestamp,
      questionId,
      response,
      timeSpentSeconds: Math.max(0, Math.floor(questionTimeSpentMs / 1000)),
    };

    const nextPendingMap = {
      ...pendingAnswerMapRef.current,
      [questionId]: queuedWrite,
    };
    setDurability(current => current === "memory_only" ? current : "saving");
    replacePendingAnswerMap(nextPendingMap);
    setSyncState((current) => navigator.onLine ? current === "syncing" ? current : "idle" : "offline");
    setSyncMessage(incompleteNumeric ? "Complete the numeric response before saving. This draft is only in memory and blocks submission." : `Pending answer updates: ${Object.keys(nextPendingMap).length}`);
    if (incompleteNumeric) setSyncState("error");
    return true;
  }, [authorityInterrupted, clockRecoveryRequired, devMockSessionActive, runtimeOwnership, entryValidation.allowed, recoveryApplied, sessionLifecycleState, submissionUncertain, questionTimingById, replacePendingAnswerMap, sessionSnapshot.questions]);

  const updateQuestionResponseState = useCallback((
    questionId: string,
    updater: (previous: QuestionResponseState) => QuestionResponseState,
  ): void => {
    if (!recoveryApplied || authorityInterrupted || submitInFlight || (!devMockSessionActive && !runtimeOwnership.isCurrent())) return;
    const current = recoveryUiRef.current.responseStateByQuestionId;
    const nextState = updater(current[questionId] ?? displayResponse(undefined));
    if (!queueAnswerWrite(questionId, nextState)) return;
    recoveryUiRef.current = {...recoveryUiRef.current, responseStateByQuestionId: {...current, [questionId]: nextState}};
    setResponseStateByQuestionId(previous => ({...previous, [questionId]: nextState}));
  }, [queueAnswerWrite, recoveryApplied, authorityInterrupted, submitInFlight, devMockSessionActive, runtimeOwnership]);

  const reconcilePendingAnswers = useCallback(async (): Promise<boolean> => {
    // The entry read already supplied a validated immutable question binding.
    const sentAt = performance.now();
    const result = await runtimeOwnership.reconcileAnswers();
    if (!runtimeOwnership.isCurrent() || result.generation !== ownership.generation ||
        (result.status !== "started" && result.status !== "active" && result.status !== "expired")) {
      throw new Error("Answer confirmation is unavailable. Pending changes are unresolved.");
    }
    if (result.status === "active" || result.status === "expired") {
      if (!result.deadlineAt || !applyServerLifecycleAuthority({...result, deadlineAt: result.deadlineAt}, runtimeOwnership.requestStartedAt(result, sentAt))) throw new Error("Clock confirmation unavailable.");
    } else runtimeClockRef.current.accept(result.serverTime, null, runtimeOwnership.requestStartedAt(result, sentAt), performance.now());
    const local = readLocalSnapshot(captureRecovery(), sessionSnapshot, recoveryScopeHash, ownership.generation);
    const merged = mergeAnswerRecovery(sessionSnapshot, result.recovery, local);
    setResponseStateByQuestionId(merged.responses); setQuestionTimingById(merged.timings);
    setHardModeLockedQuestionIds(merged.locked); replacePendingAnswerMap(merged.pending);
    recordRejections(merged.rejected); lastIssuedClientTimestampRef.current = merged.highWater;
    unresolvedRef.current.clear();
    setSyncMessage(Object.keys(merged.rejected).length ? "Some local changes were not accepted. Review the rejected changes before submitting." : "Accepted answers confirmed by the server.");
    return true;
  }, [runtimeOwnership, ownership.generation, captureRecovery, sessionSnapshot, recoveryScopeHash, replacePendingAnswerMap, recordRejections, applyServerLifecycleAuthority]);

  const confirmCurrentAuthority = useCallback((manual = false): Promise<boolean> => {
    if (clockAttemptRef.current) return clockAttemptRef.current;
    if (!navigator.onLine || document.visibilityState === "hidden" || !runtimeOwnership.isCurrent() ||
        (!manual && clockAttemptStoppedRef.current)) return Promise.resolve(false);
    clockPausedRef.current = true; setClockRecoveryRequired(true);
    const promise = (async () => {
      try {
        if (manual) await runtimeOwnership.retryTransport();
        await reconcilePendingAnswers();
        runtimeClockRef.current.timestamp(lastIssuedClientTimestampRef.current, performance.now());
        if (runtimeOwnership.snapshot().reason === "transport_paused") throw new Error("Renewal needs confirmation. Use Retry.");
        clockPausedRef.current = false; setClockRecoveryRequired(false);
        clockAttemptStoppedRef.current = false; transportStoppedRef.current = false;
        return true;
      } catch (error) {
        clockAttemptStoppedRef.current = true; setSyncState("error");
        setSyncMessage(`Current authority confirmation unavailable. ${error instanceof Error ? error.message : "Use Retry."}`); return false;
      } finally {clockAttemptRef.current = null;}
    })();
    clockAttemptRef.current = promise; return promise;
  }, [runtimeOwnership, reconcilePendingAnswers]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted || authorityInterrupted || devMockSessionActive) return;
    const pause = () => {
      clockPausedRef.current = true; setClockRecoveryRequired(true);
      if (document.visibilityState !== "hidden" && navigator.onLine) void confirmCurrentAuthority();
    };
    document.addEventListener("visibilitychange", pause);
    window.addEventListener("focus", pause);
    if (clockRecoveryRequired || ownership.reason === "transport_paused") pause();
    return () => {document.removeEventListener("visibilitychange", pause); window.removeEventListener("focus", pause);};
  }, [instructionConfirmed, isSubmitted, authorityInterrupted, devMockSessionActive, confirmCurrentAuthority, clockRecoveryRequired, ownership.reason]);

  const executeAnswerFlush = useCallback(async (reason: ExamAnswerFlushReason): Promise<boolean> => {
    if (!entryValidation.allowed || !instructionConfirmed || !recoveryApplied || authorityInterrupted ||
        sessionLifecycleState === "expired" || submissionUncertain ||
        isSubmitted && reason !== "submission" || serverEntryValidationStatus !== "valid") return false;
    if (document.visibilityState === "hidden") return false;
    if ((transportStoppedRef.current || clockPausedRef.current) && reason !== "reconnect" && reason !== "submission") return false;
    if ((reason === "reconnect" || reason === "submission") && (transportStoppedRef.current || clockPausedRef.current) &&
        !await confirmCurrentAuthority(reason === "reconnect")) return false;
    if (!navigator.onLine) {setSyncState("offline"); setSyncMessage("Offline. Pending changes are retained in this browser."); return false;}
    const complete = reason === "reconnect" || reason === "submission";
    let dispatchedChunks = 0;
    try {
      if (unresolvedRef.current.size) await reconcilePendingAnswers();
      while (true) {
        if (!runtimeOwnership.isCurrent()) throw new Error("Current ownership is required to save answers.");
        const pending = Object.values(pendingAnswerMapRef.current).sort((a, b) => a.clientRevision - b.clientRevision);
        if (!pending.length) {
          setSyncState("idle");
          return !unresolvedRef.current.size && (!Object.keys(rejectedAnswerMapRef.current).length || rejectionsAcknowledgedRef.current);
        }
        // A fixed 500-question queue drains in at most 50 chunks. Continuous new
        // edits cannot turn one reconnect into an unlimited dispatch loop.
        if (dispatchedChunks >= 50) throw new Error("Newer changes remain pending. Confirm them before submitting.");
        const nowMs = performance.now(), millisecondsSinceLastWrite = Math.max(0, Math.floor(nowMs - lastAnswerWriteAtMsRef.current));
        if (millisecondsSinceLastWrite < ANSWER_BATCH_INTERVAL_MS && !complete) return false;
        if (!Number.isSafeInteger(batchSequenceRef.current) || batchSequenceRef.current >= Number.MAX_SAFE_INTEGER - 1) {
          throw new Error("Answer sequence is exhausted. Recover before saving.");
        }
        validatePendingAnswers(pending, sessionSnapshot);
        const batchSequence = batchSequenceRef.current++;
        const requestBody: ExamAnswerBatchRequestBody = {
          adaptivePhaseSnapshot: adaptivePhaseSnapshotRef.current ?? undefined,
          answers: structuredClone(pending.slice(0, ANSWER_BATCH_MAX_SIZE)),
          batchId: `${effectiveSessionId}:${ownership.generation}:${crypto.randomUUID()}`,
          batchSequence, flushReason: reason, instituteId, millisecondsSinceLastWrite, runId, yearId,
        };
        setSyncState("syncing"); setSyncMessage(`Saving ${requestBody.answers.length} answer update(s)...`);
        // Until the exact receipt is validated these intents are uncertain, including response loss.
        requestBody.answers.forEach(w => unresolvedRef.current.add(w.questionId));
        dispatchedChunks++;
        const raw = await examApiClient.post<unknown, ExamAnswerBatchRequestBody>(
          `/exam/session/${encodeURIComponent(effectiveSessionId)}/answers`, {body: requestBody, handledFailureIsReady: true});
        const receipt = readAnswerAcknowledgements(raw, requestBody);
        if (!runtimeOwnership.isCurrent()) throw new Error("Answer receipt arrived after ownership ended.");
        const next = {...pendingAnswerMapRef.current};
        for (const ack of receipt.acknowledgements) {
          if (ack.disposition === "persisted") {
            // An older receipt cannot remove a replacement edit.
            if (next[ack.questionId]?.clientRevision === ack.clientRevision) delete next[ack.questionId];
            unresolvedRef.current.delete(ack.questionId);
          }
        }
        replacePendingAnswerMap(next); recordLastAnswerWriteAt(nowMs);
        if (receipt.lockedQuestionIds.length) setHardModeLockedQuestionIds(current => new Set([...current, ...receipt.lockedQuestionIds]));
        if (receipt.acknowledgements.some(ack => ack.disposition !== "persisted")) await reconcilePendingAnswers();
        setSyncMessage(Object.keys(rejectedAnswerMapRef.current).length ? "Some changes were rejected; the displayed answers were restored from the server." : "Saved answer updates were accepted by the server.");
        setSyncState("idle");
        if (!complete) return true;
      }
    } catch (error) {
      transportStoppedRef.current = true;
      setSyncState(navigator.onLine ? "error" : "offline");
      setSyncMessage(`Answer confirmation unavailable. ${error instanceof Error ? error.message : "Pending changes remain unresolved."}`);
      return false;
    }
  }, [entryValidation.allowed, instructionConfirmed, recoveryApplied, authorityInterrupted, isSubmitted, serverEntryValidationStatus,
    confirmCurrentAuthority, reconcilePendingAnswers, runtimeOwnership, effectiveSessionId, ownership.generation, instituteId, runId, yearId, examApiClient, replacePendingAnswerMap, recordLastAnswerWriteAt, sessionSnapshot, sessionLifecycleState, submissionUncertain]);

  const flushAnswerBatch = useCallback(async (reason: ExamAnswerFlushReason): Promise<boolean> => {
    if (flushInFlightRef.current) {
      // Timers coalesce. Only a caller that must drain waits for the active flush.
      if (reason !== "submission" && reason !== "reconnect") return flushInFlightRef.current;
      await flushInFlightRef.current;
      if (flushInFlightRef.current) return flushInFlightRef.current;
    }
    const promise = executeAnswerFlush(reason); flushInFlightRef.current = promise;
    try {return await promise;} finally {if (flushInFlightRef.current === promise) flushInFlightRef.current = null;}
  }, [executeAnswerFlush]);

  const recoveryDrainStartedRef = useRef(false);
  useEffect(() => {
    if (!recoveryApplied || !instructionConfirmed || authorityInterrupted || isSubmitted || sessionLifecycleState === "expired" || recoveryDrainStartedRef.current) return;
    recoveryDrainStartedRef.current = true;
    if (Object.keys(pendingAnswerMapRef.current).length) void flushAnswerBatch("reconnect");
  }, [recoveryApplied, instructionConfirmed, authorityInterrupted, isSubmitted, sessionLifecycleState, flushAnswerBatch]);

  useEffect(() => {
    if (authorityInterrupted) return;
    if (!instructionConfirmed || isSubmitted || authorityInterrupted) {
      return;
    }

    const batchInterval = window.setInterval(() => {
      void flushAnswerBatch("scheduled");
    }, ANSWER_BATCH_INTERVAL_MS);

    return () => window.clearInterval(batchInterval);
  }, [authorityInterrupted, flushAnswerBatch, instructionConfirmed, isSubmitted]);

  useEffect(() => {
    if (
      !instructionConfirmed ||
      isSubmitted ||
      authorityInterrupted ||
      pendingAnswers.length < ANSWER_BATCH_MAX_SIZE
    ) {
      return;
    }

    void flushAnswerBatch("scheduled");
  }, [authorityInterrupted, flushAnswerBatch, instructionConfirmed, isSubmitted, pendingAnswers.length]);

  useEffect(() => {
    if (authorityInterrupted) return;
    if (!instructionConfirmed || isSubmitted || authorityInterrupted) {
      return;
    }

    const heartbeatInterval = window.setInterval(() => {
      setLastHeartbeatAtIso(new Date().toISOString());
      void flushAnswerBatch("heartbeat");
    }, HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(heartbeatInterval);
  }, [authorityInterrupted, flushAnswerBatch, instructionConfirmed, isSubmitted]);

  useEffect(() => {
    if (!instructionConfirmed || !entryValidation.allowed || recoveryApplied || isSubmitted || authorityInterrupted) return;
    if (devMockSessionActive) {setRecoveryApplied(true); return;}
    if (!entryAuthority) return;
    let live = true;
    void recoveryStorage.read().then(result => {
      if (!live || !runtimeOwnership.isCurrent()) return;
      let local: SessionRecoverySnapshot | null = null;
      if (result.state === "memory_only") {setDurability("memory_only"); setRecoveryNotice(result.reason);}
      else if (result.value !== undefined) {
        try {local = readLocalSnapshot(result.value, sessionSnapshot, recoveryScopeHash, ownership.generation);}
        catch {
          storageWritableRef.current = false; setUnsupportedRecovery(true); setDurability("memory_only");
          setRecoveryNotice("Local recovery is corrupt, unsupported or belongs to another scope. Server answers were restored. Unacknowledged local edits were not adopted.");
        }
      } else setRecoveryNotice("Server answers restored. Pending edits without a completed local save may have been lost.");
      const merged = mergeAnswerRecovery(sessionSnapshot, entryAuthority.recovery, local);
      setResponseStateByQuestionId(merged.responses); setQuestionTimingById(merged.timings); setHardModeLockedQuestionIds(merged.locked);
      if (local) {
        setVisitedQuestionIds(new Set(local.visitedQuestionIds)); setSelectedQuestionId(local.selectedQuestionId);
        nextClientRevisionRef.current = local.nextClientRevision; batchSequenceRef.current = local.batchSequence;
      }
      replacePendingAnswerMap(merged.pending); recordRejections(merged.rejected);
      lastIssuedClientTimestampRef.current = merged.highWater; unresolvedRef.current.clear();
      setRecoveryApplied(true);
    });
    return () => {live = false;};
  }, [instructionConfirmed, entryValidation.allowed, recoveryApplied, isSubmitted, authorityInterrupted, devMockSessionActive,
    entryAuthority, recoveryStorage, runtimeOwnership, sessionSnapshot, recoveryScopeHash, ownership.generation, replacePendingAnswerMap, recordRejections]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted || !recoveryApplied || authorityInterrupted || devMockSessionActive || !storageWritableRef.current) return;
    let live = true;
    try {
      const snapshot = readLocalSnapshot(captureRecovery(), sessionSnapshot, recoveryScopeHash, ownership.generation);
      setDurability(current => current === "memory_only" ? current : "saving");
      void recoveryStorage.save(snapshot).then(result => {
        if (!runtimeOwnership.isCurrent() || (result.state === "memory_only" && result.superseded)) return;
        // A newer tick may retire this snapshot before slow storage settles.
        // Only its success is obsolete; a real failure still applies to this
        // current storage scope until a later transaction actually commits.
        if (!live && result.state === "ok") return;
        setDurability(result.state === "ok" ? "durable" : "memory_only");
        if (result.state === "memory_only") setRecoveryNotice(result.reason);
      });
    } catch {setDurability("memory_only"); setRecoveryNotice("This local snapshot could not be saved safely. Pending edits may be lost on reload.");}
    return () => {live = false;};
  }, [instructionConfirmed, isSubmitted, recoveryApplied, authorityInterrupted, devMockSessionActive, captureRecovery, sessionSnapshot,
    recoveryScopeHash, ownership.generation, recoveryStorage, runtimeOwnership, pendingAnswerMap, rejectedAnswerMap, responseStateByQuestionId,
    questionTimingById, visitedQuestionIds, hardModeLockedQuestionIds, selectedQuestionId]);

  const saveLocalRecovery = async (discard: boolean) => {
    try {
      if (discard) {
        const result = await recoveryStorage.discard(recoveryOwnerId);
        if (!runtimeOwnership.isCurrent()) return;
        if (result.state !== "ok") {setRecoveryNotice(result.reason); return;}
        storageWritableRef.current = true; setUnsupportedRecovery(false);
        setRecoveryNotice("Unsupported local recovery discarded. Server answers and current in-memory changes remain.");
      }
      const snapshot = readLocalSnapshot(captureRecovery(), sessionSnapshot, recoveryScopeHash, ownership.generation);
      setDurability(current => current === "memory_only" ? current : "saving"); const saved = await recoveryStorage.save(snapshot);
      if (!runtimeOwnership.isCurrent()) return;
      if (saved.state === "memory_only" && saved.superseded) return;
      setDurability(saved.state === "ok" ? "durable" : "memory_only");
      if (saved.state === "memory_only") setRecoveryNotice(saved.reason);
    } catch {setDurability("memory_only"); setRecoveryNotice("Local recovery could not be saved. Complete any unfinished numeric response. Pending changes may be lost on reload.");}
  };

  useEffect(() => {
    if (authorityInterrupted) return;
    if (!instructionConfirmed || isSubmitted || authorityInterrupted) {
      return;
    }

    const handleOnline = () => {
      setSyncMessage("Connection restored. Confirming current server authority before saving.");
      clockPausedRef.current = true; setClockRecoveryRequired(true);
      void confirmCurrentAuthority().then(confirmed => {if (confirmed) void flushAnswerBatch("reconnect");});
    };
    const handleOffline = () => {
      setSyncState("offline");
      setSyncMessage(`Offline. ${Object.keys(pendingAnswerMapRef.current).length} answer update(s) retained locally.`);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [authorityInterrupted, flushAnswerBatch, instructionConfirmed, isSubmitted, confirmCurrentAuthority]);

  useEffect(() => {
    if (!isSubmitted) {
      return;
    }

    setSessionLifecycleState("submitted");
    void recoveryStorage.clear();
  }, [isSubmitted, recoveryStorage]);

  const submitSession = useCallback(async (reason: SubmissionReason): Promise<void> => {
    if (!entryValidation.allowed || serverEntryValidationStatus !== "valid" || authorityInterrupted) {
      throw new Error("Missing valid Firebase exam identity for submission.");
    }
    if (submitAttemptRunningRef.current) return;
    submitAttemptRunningRef.current = true;
    setSubmitInFlight(true);
    setSubmitError(null);

    try {
      if (!recoveryApplied) throw new Error("Wait for answer recovery before submission.");
      const answeredPersisted = reason === "manual" && !submitIntentRef.current ? await flushAnswerBatch("submission") : true;
      if (reason === "manual" && !answeredPersisted) {
        throw new Error("Unable to flush pending answers before submission.");
      }
      if (
        reason === "manual" && !submitIntentRef.current &&
        Object.keys(pendingAnswerMapRef.current).length > 0
      ) {
        throw new Error("Pending answers remain after the submission drain.");
      }

      const endpointPath = `/exam/session/${encodeURIComponent(effectiveSessionId)}/submit`;
      const requestBody: ExamSubmitRequestBody = submitIntentRef.current ?? {
        instituteId,
        runId,
        yearId,
        reason,
      };

      submitIntentRef.current = requestBody;
      setSubmissionUncertain(true);
      const responseBody = adaptExamSubmitResult(
        await examApiClient.post<unknown, ExamSubmitRequestBody>(
          endpointPath,
          {
            body: requestBody,
          },
        ),
      );
      setSubmissionUncertain(false);
      setSubmissionResult(responseBody);
      setSubmissionReason(responseBody.submissionReason);
      setSubmittedAtIso(responseBody.submittedAt);
      setSessionLifecycleState(responseBody.status);
      replacePendingAnswerMap({});
      setSubmitDialogOpen(false);
      setSubmitWarningAcknowledged(false);
      setEarlySubmitOverrideAccepted(false);
      setSyncMessage(responseBody.alreadySubmitted ? "Submission already finalized on server." : "Submission completed.");
    } catch (error) {
      if (error instanceof ApiClientError) {
        if ((error.details as {reason?: unknown} | undefined)?.reason === "session_terminated") {
          setSessionLifecycleState("terminated"); setSubmissionUncertain(false);
        }
        throw new Error("Submission confirmation unavailable. Accepted answers and any existing receipt remain on the server. Retry confirmation or reload.");
      }
      throw error;
    } finally {
      submitAttemptRunningRef.current = false;
      setSubmitInFlight(false);
    }
  }, [
    examApiClient,
    authorityInterrupted,
    effectiveSessionId,
    entryValidation.allowed,
    flushAnswerBatch,
    recoveryApplied,
    instituteId,
    replacePendingAnswerMap,
    runId,
    serverEntryValidationStatus,
    yearId,
  ]);

  useEffect(() => {
    if (
      sessionLifecycleState !== "expired" ||
      isSubmitted ||
      authorityInterrupted ||
      submitInFlight ||
      !recoveryApplied ||
      expirySubmitAttemptedRef.current
    ) {
      return;
    }

    expirySubmitAttemptedRef.current = true;
    void submitSession("expiry")
      .catch((error) => {
        setSubmitError(error instanceof Error ? error.message : "Auto-submit failed.");
      });
  }, [authorityInterrupted, isSubmitted, sessionLifecycleState, submitInFlight, recoveryApplied, submitSession]);

  const palette = useMemo<PaletteTile[]>(
    () =>
      sessionSnapshot.questions.map((question) => ({
        id: question.id,
        number: question.number,
        section: question.section,
        status: toPaletteStatus(
          question,
          responseStateByQuestionId[question.id] ?? {
            selectedOptionId: null,
            numericResponse: "",
            matrixSelections: [],
            markedForReview: false,
          },
          visitedQuestionIds.has(question.id),
        ),
        revisitLocked: hardModeLockedQuestionIds.has(question.id) || questionTimingById[question.id]?.maxTimeLocked === true,
      })),
    [hardModeLockedQuestionIds, questionTimingById, responseStateByQuestionId, sessionSnapshot.questions, visitedQuestionIds],
  );

  const elapsedPercent = toPercent(totalDurationMs - remainingMs, totalDurationMs);
  const automaticPhaseId = getPhaseId(elapsedPercent, sessionSnapshot.phaseConfigSnapshot);
  const currentExamPhase = isControlledMode ? controlledPhaseId : automaticPhaseId;
  const recordBrowserIntegrityEvent = useCallback((eventType: BrowserIntegrityEventType) => {
    integrityQueueRef.current?.capture(eventType, phaseRef.current);
    if (eventType === "FULLSCREEN_EXIT" && browserIntegrityGuardEnabled) setIntegrityBlockingReason("Fullscreen was exited. Re-enter to continue questions; saving and submission remain available.");
  }, [browserIntegrityGuardEnabled]);
  const requestExamFullscreen = useCallback(async (): Promise<boolean> => {
    if (authorityInterrupted) return false;
    if (!browserIntegrityGuardEnabled) {
      return true;
    }
    if (isBrowserFullscreenActive()) {
      return true;
    }

    try {
      await document.documentElement.requestFullscreen();
      if (!devMockSessionActive && !runtimeOwnership.isCurrent()) {void document.exitFullscreen().catch(() => undefined); return false;}
      fullscreenExitActiveRef.current = false;
      setIntegrityBlockingReason(null);
      recordBrowserIntegrityEvent("FULLSCREEN_ENTERED");
      return true;
    } catch {
      recordBrowserIntegrityEvent("FULLSCREEN_REQUEST_FAILED");
      return false;
    }
  }, [authorityInterrupted, devMockSessionActive, runtimeOwnership, browserIntegrityGuardEnabled, recordBrowserIntegrityEvent]);
  const startInternetCheck = useCallback(() => {
    if (!navigator.onLine) {
      setInternetCheckState("failed");
      return;
    }

    setInternetCheckState("passed");
  }, []);
  const beginExamSession = useCallback(async (): Promise<boolean> => {
    if (authorityInterrupted || (cameraRequired && !cameraRef.current?.isReady())) {
      return false;
    }
    try {
      const authority = await requestServerActivation();
      if (!authority || authority.status !== "active") {
        return false;
      }
    } catch (error) {
      setSessionConflictMessage(
        error instanceof Error ? error.message : "Session activation failed.",
      );
      return false;
    }
    recordLastAnswerWriteAt(performance.now() - ANSWER_BATCH_INTERVAL_MS);
    replacePendingAnswerMap({});
    nextClientRevisionRef.current = 1;
    lastIssuedClientTimestampRef.current = entryAuthority?.recovery.maxAcceptedClientTimestamp ?? 0;
    batchSequenceRef.current = 1;
    setSyncState("idle");
    setSyncMessage("No pending answer updates.");
    setSessionConflictMessage(null);
    setFullscreenGateError(null);
    setRecoveryApplied(false);
    setInstructionConfirmed(true);
    setEntryStage("exam_active");
    return true;
  }, [
    authorityInterrupted,
    cameraRequired,
    entryAuthority,
    recordLastAnswerWriteAt,
    replacePendingAnswerMap,
    requestServerActivation,
  ]);
  const preExamChecksPassed =
    browserReadinessState === "passed" &&
    internetCheckState === "passed" &&
    (!cameraRequired || cameraCheckState === "passed");
  const continueToInstructions = useCallback(() => {
    void (async () => {
      if (!preExamChecksPassed) {
        return;
      }

      if (!devMockSessionActive && runtimeClockRef.current.serverNow(performance.now()) >= sessionSchedule.sessionEndsAtMs) {
        setEntryStage("entry_closed");
        return;
      }

      const fullscreenEntered = await requestExamFullscreen();
      if (!fullscreenEntered) {
        setFullscreenGateError("Fullscreen permission is required before instructions can open. Use Continue to Instructions again and allow fullscreen.");
        return;
      }

      setFullscreenGateError(null);
      setEntryStage("instructions_waiting");
    })();
  }, [devMockSessionActive, preExamChecksPassed, requestExamFullscreen, sessionSchedule.sessionEndsAtMs]);
  const getQuestionPhaseVisibility = useCallback((question: SessionQuestion): boolean => {
    if (!phaseVisibilityEnforced || currentExamPhase === "phase1" || currentExamPhase === "buffer") {
      return true;
    }

    if (!visitedQuestionIds.has(question.id)) {
      return false;
    }

    const responseState = responseStateByQuestionId[question.id] ?? {
      selectedOptionId: null,
      numericResponse: "",
      matrixSelections: [],
      markedForReview: false,
    };
    const answered = hasAnswer(question, responseState);

    if (currentExamPhase === "phase2") {
      return answered && responseState.markedForReview;
    }

    return !answered && responseState.markedForReview;
  }, [currentExamPhase, phaseVisibilityEnforced, responseStateByQuestionId, visitedQuestionIds]);

  const filteredPalette = useMemo(
    () => {
      const visibleQuestionIds = new Set(
        sessionSnapshot.questions.filter((question) => getQuestionPhaseVisibility(question)).map((question) => question.id),
      );

      return (selectedSection === "All" ? palette : palette.filter((tile) => tile.section === selectedSection)).filter((tile) =>
        visibleQuestionIds.has(tile.id),
      );
    },
    [getQuestionPhaseVisibility, palette, selectedSection, sessionSnapshot.questions],
  );

  const questionSnapshotById = useMemo(
    () => new Map(sessionSnapshot.questions.map((question) => [question.id, question])),
    [sessionSnapshot.questions],
  );

  const selectedQuestion = useMemo(() => {
    const fallbackQuestion = sessionSnapshot.questions[0];
    const resolvedQuestion =
      cachedQuestionSnapshotsRef.current.get(selectedQuestionId) ??
      questionSnapshotById.get(selectedQuestionId) ??
      fallbackQuestion;

    if (!resolvedQuestion) {
      return undefined;
    }

    if (!cachedQuestionSnapshotsRef.current.has(resolvedQuestion.id)) {
      cachedQuestionSnapshotsRef.current.set(resolvedQuestion.id, resolvedQuestion);
      questionSnapshotReadCountRef.current.set(resolvedQuestion.id, 1);
    }

    return cachedQuestionSnapshotsRef.current.get(resolvedQuestion.id) ?? resolvedQuestion;
  }, [questionSnapshotById, selectedQuestionId, sessionSnapshot.questions]);
  const selectedQuestionIndex = getQuestionIndex(sessionSnapshot.questions, selectedQuestion?.id ?? "");
  const nextQuestionId = selectedQuestionIndex >= 0 ? sessionSnapshot.questions[selectedQuestionIndex + 1]?.id : null;
  const nextQuestion = nextQuestionId
    ? cachedQuestionSnapshotsRef.current.get(nextQuestionId) ?? questionSnapshotById.get(nextQuestionId) ?? null
    : null;
  const nextQuestionImageSrc = nextQuestion?.imageUrl ? toCdnAssetUrl(nextQuestion.imageUrl) : null;
  const selectedResponseState = selectedQuestion
    ? responseStateByQuestionId[selectedQuestion.id]
    : undefined;
  const selectedQuestionTiming = selectedQuestion
    ? questionTimingById[selectedQuestion.id]
    : undefined;
  const selectedQuestionVisible = selectedQuestion ? getQuestionPhaseVisibility(selectedQuestion) : false;
  const visibleQuestionsForCurrentPhase = useMemo(
    () => sessionSnapshot.questions.filter((question) => getQuestionPhaseVisibility(question)),
    [getQuestionPhaseVisibility, sessionSnapshot.questions],
  );

  useEffect(() => {
    cachedQuestionSnapshotsRef.current.clear();
    questionSnapshotReadCountRef.current.clear();

    const firstQuestion = sessionSnapshot.questions[0];
    if (!firstQuestion) {
      return;
    }

    cachedQuestionSnapshotsRef.current.set(firstQuestion.id, firstQuestion);
    questionSnapshotReadCountRef.current.set(firstQuestion.id, 1);
  }, [sessionSnapshot.questions]);

  useEffect(() => {
    if (!nextQuestionImageSrc || preloadedQuestionImageUrlsRef.current.has(nextQuestionImageSrc)) {
      return;
    }

    const preloadLink = document.createElement("link");
    preloadLink.rel = "preload";
    preloadLink.as = "image";
    preloadLink.href = nextQuestionImageSrc;
    document.head.appendChild(preloadLink);

    const preloadedImage = new Image();
    preloadedImage.src = nextQuestionImageSrc;
    preloadedQuestionImageUrlsRef.current.add(nextQuestionImageSrc);

    return () => {
      preloadLink.remove();
    };
  }, [nextQuestionImageSrc]);

  useEffect(() => {
    if (!phaseVisibilityEnforced || !selectedQuestion || getQuestionPhaseVisibility(selectedQuestion)) {
      return;
    }

    const fallbackQuestion = visibleQuestionsForCurrentPhase[0];
    if (fallbackQuestion && fallbackQuestion.id !== selectedQuestion.id) {
      navigateToQuestion(fallbackQuestion.id);
    }
  }, [
    getQuestionPhaseVisibility,
    phaseVisibilityEnforced,
    selectedQuestion,
    sessionSnapshot.questions,
    visibleQuestionsForCurrentPhase,
  ]);

  useEffect(() => {
    if (authorityInterrupted) return;
    if (!isHardMode || !selectedQuestion || isSubmitted) {
      return;
    }

    const selectedTiming = questionTimingById[selectedQuestion.id];
    if (!selectedTiming?.maxTimeLocked) {
      return;
    }

    const nextUnlockedQuestion = sessionSnapshot.questions.find((question, index) => {
      if (index <= selectedQuestionIndex) {
        return false;
      }
      const timing = questionTimingById[question.id];
      return !timing?.maxTimeLocked;
    });

    if (nextUnlockedQuestion) {
      const navigateTimeout = window.setTimeout(() => {
        navigateToQuestion(nextUnlockedQuestion.id);
      }, 0);
      return () => window.clearTimeout(navigateTimeout);
    }
  }, [authorityInterrupted, isHardMode, isSubmitted, questionTimingById, selectedQuestion, selectedQuestionIndex, sessionSnapshot.questions]);

  const answeredCount = palette.filter((tile) => tile.status === "answered" || tile.status === "answered_marked").length;
  const notAnsweredCount = palette.filter((tile) => tile.status === "not_answered").length;
  const markedCount = palette.filter((tile) => tile.status === "marked" || tile.status === "answered_marked").length;
  const visitedCount = visitedQuestionIds.size;

  const adaptivePhaseSnapshot = useMemo<AdaptivePhaseSnapshot>(() => {
    const currentPhase = currentExamPhase;
    const answeredPercent = toPercent(answeredCount, sessionSnapshot.questions.length);
    const phaseAdherencePercent = clamp(100 - Math.abs(elapsedPercent - answeredPercent), 0, 100);
    const overspendPercent = clamp(elapsedPercent - answeredPercent, 0, 100);

    const timeByDifficultyMs = sessionSnapshot.questions.reduce<Record<DifficultyBand, number>>(
      (accumulator, question) => {
        accumulator[question.difficulty] += questionTimingById[question.id]?.timeSpentMs ?? 0;
        return accumulator;
      },
      { easy: 0, medium: 0, hard: 0 },
    );

    const totalTrackedMs = timeByDifficultyMs.easy + timeByDifficultyMs.medium + timeByDifficultyMs.hard;
    const easyShare = toPercent(timeByDifficultyMs.easy, totalTrackedMs);
    const mediumShare = toPercent(timeByDifficultyMs.medium, totalTrackedMs);
    const hardShare = toPercent(timeByDifficultyMs.hard, totalTrackedMs);

    const easyDiff = Math.abs(easyShare - sessionSnapshot.difficultyDistribution.easyPercent);
    const mediumDiff = Math.abs(mediumShare - sessionSnapshot.difficultyDistribution.mediumPercent);
    const hardDiff = Math.abs(hardShare - sessionSnapshot.difficultyDistribution.hardPercent);
    const compliancePenalty = (easyDiff + mediumDiff + hardDiff) / 3;
    const difficultyCompliancePercent = clamp(100 - compliancePenalty, 0, 100);

    const skipPatternScore = clamp(100 - skippedQuestionsCount * 12, 0, 100);
    const disciplineIndex = clamp((phaseAdherencePercent + difficultyCompliancePercent + skipPatternScore) / 3, 0, 100);

    return {
      currentPhase,
      elapsedPercent,
      answeredPercent,
      phaseAdherencePercent,
      overspendPercent,
      difficultyCompliancePercent,
      skipPatternScore,
      disciplineIndex,
    };
  }, [
    answeredCount,
    currentExamPhase,
    elapsedPercent,
    questionTimingById,
    sessionSnapshot.difficultyDistribution.easyPercent,
    sessionSnapshot.difficultyDistribution.hardPercent,
    sessionSnapshot.difficultyDistribution.mediumPercent,
    sessionSnapshot.questions,
    skippedQuestionsCount,
  ]);

  useEffect(() => {
    adaptivePhaseSnapshotRef.current = adaptivePhaseSnapshot;
  }, [adaptivePhaseSnapshot]);

  useEffect(() => {
    if (authorityInterrupted) return;
    if (instructionConfirmed || isSubmitted || authorityInterrupted) {
      return;
    }

    const preExamClockInterval = window.setInterval(() => {
      try {setNowEpochMs(runtimeClockRef.current.serverNow(performance.now()));} catch {if (devMockSessionActive) setNowEpochMs(Date.now());}
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(preExamClockInterval);
  }, [authorityInterrupted, instructionConfirmed, isSubmitted, devMockSessionActive]);

  useEffect(() => {
    if (serverEntryValidationStatus !== "valid" || instructionConfirmed || isSubmitted || sessionLifecycleState === "terminated" || authorityInterrupted) {
      return;
    }

    if (nowEpochMs < sessionSchedule.earlyEntryOpensAtMs) {
      setEntryStage("entry_not_open");
      return;
    }

    if (entryStage === "entry_not_open" && nowEpochMs >= sessionSchedule.earlyEntryOpensAtMs && nowEpochMs < sessionSchedule.sessionEndsAtMs) {
      setEntryStage("pre_exam_lobby");
      return;
    }

    if (!devMockSessionActive && runtimeClockRef.current.serverNow(performance.now()) >= sessionSchedule.sessionEndsAtMs) {
      setEntryStage("entry_closed");
      return;
    }

    if (entryStage !== "instructions_waiting" || nowEpochMs < sessionSchedule.sessionStartsAtMs) {
      return;
    }

    if (!declarationAccepted) {
      return;
    }

    if (browserIntegrityGuardEnabled && !isBrowserFullscreenActive()) {
      setIntegrityBlockingReason("Fullscreen is required at official exam start. Re-enter fullscreen to open the question paper.");
      return;
    }

    void beginExamSession();
  }, [
    authorityInterrupted,
    beginExamSession,
    browserIntegrityGuardEnabled,
    declarationAccepted,
    devMockSessionActive,
    entryStage,
    instructionConfirmed,
    isSubmitted,
    nowEpochMs,
    serverEntryValidationStatus,
    sessionLifecycleState,
    sessionSchedule.earlyEntryOpensAtMs,
    sessionSchedule.sessionEndsAtMs,
    sessionSchedule.sessionStartsAtMs,
  ]);

  useEffect(() => {
    if (authorityInterrupted) return;
    if (!browserIntegrityGuardEnabled || authorityInterrupted) {
      return;
    }
    if ((!instructionConfirmed && entryStage !== "instructions_waiting") || isSubmitted) {
      return;
    }

    const handleFullscreenChange = () => {
      if (isBrowserFullscreenActive()) {
        if (fullscreenExitActiveRef.current) {
          recordBrowserIntegrityEvent("FULLSCREEN_REENTERED");
        }
        fullscreenExitActiveRef.current = false;
        setIntegrityBlockingReason(null);
        return;
      }

      fullscreenExitActiveRef.current = true;
      recordBrowserIntegrityEvent("FULLSCREEN_EXIT");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        recordBrowserIntegrityEvent("TAB_SWITCH");
      }
    };

    const handleWindowBlur = () => {
      recordBrowserIntegrityEvent("WINDOW_BLUR");
    };

    const handleWindowFocus = () => {
      recordBrowserIntegrityEvent("WINDOW_FOCUS_RETURNED");
    };

    const blockClipboardEvent = (event: ClipboardEvent) => {
      event.preventDefault();
      const eventType = event.type === "copy" ? "COPY_BLOCKED" : event.type === "paste" ? "PASTE_BLOCKED" : "CUT_BLOCKED";
      recordBrowserIntegrityEvent(eventType);
    };

    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      recordBrowserIntegrityEvent("CONTEXT_MENU_BLOCKED");
    };

    const blockKeyboardShortcut = (event: KeyboardEvent) => {
      if (!isRestrictedKeyboardEvent(event)) {
        return;
      }

      event.preventDefault();
      recordBrowserIntegrityEvent("SHORTCUT_BLOCKED");
    };

    const handleOffline = () => {
      recordBrowserIntegrityEvent("NETWORK_LOSS");
    };

    const handleOnline = () => {
      recordBrowserIntegrityEvent("RECONNECTED");
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("copy", blockClipboardEvent);
    document.addEventListener("paste", blockClipboardEvent);
    document.addEventListener("cut", blockClipboardEvent);
    document.addEventListener("contextmenu", blockContextMenu);
    window.addEventListener("keydown", blockKeyboardShortcut, { capture: true });
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("copy", blockClipboardEvent);
      document.removeEventListener("paste", blockClipboardEvent);
      document.removeEventListener("cut", blockClipboardEvent);
      document.removeEventListener("contextmenu", blockContextMenu);
      window.removeEventListener("keydown", blockKeyboardShortcut, { capture: true });
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [authorityInterrupted, browserIntegrityGuardEnabled, entryStage, instructionConfirmed, isSubmitted, recordBrowserIntegrityEvent]);

  const timerMinutes = Math.floor(remainingMs / 1000 / 60);
  const finalWindowThresholdMinutes = sessionSnapshot.timingProfile.finalWindowMinutes;
  const isFinalWindow = timerMinutes <= finalWindowThresholdMinutes;
  const slowdownSecondsRemaining = slowdownUntilMs ? Math.max(0, Math.ceil((slowdownUntilMs - nowEpochMs) / 1000)) : 0;
  const slowdownActive = slowdownSecondsRemaining > 0;

  const selectedQuestionTimeSpentSec = selectedQuestionTiming ? Math.floor(selectedQuestionTiming.timeSpentMs / 1000) : 0;
  const selectedQuestionMinTimeRemainingSec = selectedQuestionTiming
    ? Math.max(0, selectedQuestionTiming.minTimeSec - selectedQuestionTimeSpentSec)
    : 0;
  const selectedQuestionMaxTimeRemainingSec = selectedQuestionTiming
    ? Math.max(0, selectedQuestionTiming.maxTimeSec - selectedQuestionTimeSpentSec)
    : 0;
  const selectedQuestionRecommendedAverageSec = selectedQuestionTiming
    ? Math.round((selectedQuestionTiming.minTimeSec + selectedQuestionTiming.maxTimeSec) / 2)
    : 0;
  const selectedQuestionOverstaySec =
    isControlledMode && selectedQuestionTiming
      ? Math.max(0, selectedQuestionTimeSpentSec - selectedQuestionRecommendedAverageSec)
      : 0;

  const selectedQuestionRevisitLocked = selectedQuestion
    ? hardModeLockedQuestionIds.has(selectedQuestion.id) || questionTimingById[selectedQuestion.id]?.maxTimeLocked === true
    : false;
  const hardModeBackwardNavigationDisabled = isHardMode && sessionSnapshot.hardModeRevisitRestricted;

  const isQuestionJumpDisabled = (questionId: string): boolean => {
    if (slowdownActive || sessionLocked) {
      return true;
    }

    const targetQuestion = questionSnapshotById.get(questionId);
    if (targetQuestion && !getQuestionPhaseVisibility(targetQuestion)) {
      return true;
    }

    if (questionTimingEnforced && selectedQuestionMinTimeRemainingSec > 0 && questionId !== selectedQuestion?.id) {
      return true;
    }

    if (!selectedQuestion || !isHardMode || !sessionSnapshot.hardModeRevisitRestricted) {
      return false;
    }

    const targetQuestionIndex = getQuestionIndex(sessionSnapshot.questions, questionId);
    if (targetQuestionIndex === -1) {
      return true;
    }

    if (questionId === selectedQuestion.id) {
      return false;
    }

    if (hardModeLockedQuestionIds.has(questionId) || targetQuestionIndex < selectedQuestionIndex) {
      return true;
    }

    return (
      sessionSnapshot.timingProfile.hardModeSequentialNavigation &&
      targetQuestionIndex > selectedQuestionIndex + 1
    );
  };

  const saveBlockedByTiming =
    questionTimingEnforced &&
    selectedQuestionMinTimeRemainingSec > 0;

  const sessionLocked = sessionLifecycleState !== "active";
  const localQuestionPaused = clockRecoveryRequired || ownership.reason === "transport_paused" || (cameraRequired && cameraCheckState !== "passed") || !!integrityBlockingReason;
  const saveDisabled = localQuestionPaused || selectedQuestionRevisitLocked || saveBlockedByTiming || slowdownActive || isSubmitted || sessionLocked;
  const selectedQuestionTimingStatus = slowdownActive
    ? `Resume in ${slowdownSecondsRemaining}s`
    : selectedQuestionRevisitLocked
      ? "Locked"
      : saveBlockedByTiming
        ? `Save unlocks in ${selectedQuestionMinTimeRemainingSec}s`
        : selectedQuestionOverstaySec > 0
          ? `Overstay by ${selectedQuestionOverstaySec}s`
          : "On track";
  const selectedQuestionHeaderStatus = slowdownActive
    ? `Resume ${slowdownSecondsRemaining}s`
    : selectedQuestionRevisitLocked
      ? "Locked"
      : saveBlockedByTiming
        ? `Unlocks in ${selectedQuestionMinTimeRemainingSec}s`
        : selectedQuestionOverstaySec > 0
          ? `Overstay ${selectedQuestionOverstaySec}s`
          : "Ready";
  const timingProfileItems = [
    {
      label: "Min Time",
      value: `${selectedQuestionMinTimeRemainingSec}s`,
      hint: saveBlockedByTiming ? "Before save is enabled" : "Requirement met",
    },
    {
      label: "Max Time",
      value: `${selectedQuestionMaxTimeRemainingSec}s`,
      hint: selectedQuestionRevisitLocked ? "Question locked" : "Remaining on this question",
    },
    {
      label: "Time Spent",
      value: `${selectedQuestionTimeSpentSec}s`,
      hint: "Tracked on this question",
    },
    {
      label: "Recommended Avg",
      value: `${selectedQuestionRecommendedAverageSec}s`,
      hint: isControlledMode ? "Guided pacing target" : "Reference pacing",
    },
  ];
  const syncSummaryLabel = !recoveryApplied ? "Restoring answers" : syncState === "error" && pendingAnswers.length > 0 ? "Confirmation needed" : Object.keys(rejectedAnswerMap).length > 0 ? "Rejected changes" : syncState === "offline"
    ? `Offline · ${pendingAnswers.length} pending`
    : syncState === "syncing"
      ? `Syncing · ${pendingAnswers.length} pending`
      : syncState === "error"
        ? `Sync issue · ${pendingAnswers.length} pending`
        : pendingAnswers.length > 0
          ? `${pendingAnswers.length} pending`
          : "Synced";
  const modeTierLabel = `${sessionSnapshot.license.currentLayer} ${entryValidation.claims.mode}`;
  const activeSectionLabel = selectedSection === "All" ? "All Subjects" : selectedSection;
  const modeStudentExplanation = isOperationalMode
    ? "Standard exam delivery. You can navigate freely and submit anytime."
    : isControlledMode
      ? "Phase guidance is active. You control transitions, and expiry starts overstay instead of forcing movement."
      : isDiagnosticMode
        ? "Diagnostic execution is active. Phase timing and phase visibility are driven by the session snapshot."
        : "Hard execution is active. Diagnostic phase rules plus minimum thinking time and progression locks are enforced.";
  const phaseSchedule = useMemo(
    () => buildPhaseSchedule(totalDurationMs, sessionSnapshot.phaseConfigSnapshot),
    [sessionSnapshot.phaseConfigSnapshot, totalDurationMs],
  );
  const currentPhasePresentation = useMemo(
    () => getPhasePresentation(adaptivePhaseSnapshot.currentPhase),
    [adaptivePhaseSnapshot.currentPhase],
  );
  const currentPhaseSchedule = useMemo(
    () => phaseSchedule.find((item) => item.phaseId === adaptivePhaseSnapshot.currentPhase) ?? phaseSchedule[0],
    [adaptivePhaseSnapshot.currentPhase, phaseSchedule],
  );
  const elapsedMs = Math.max(0, totalDurationMs - remainingMs);
  const currentPhaseRemainingMs = Math.max(0, (currentPhaseSchedule?.endMs ?? totalDurationMs) - elapsedMs);
  const currentPhaseRemainingLabel = toMinuteSecondCountdownLabel(currentPhaseRemainingMs);
  const paletteSummaryItems = [
    { label: "Answered", value: answeredCount },
    { label: "Pending", value: notAnsweredCount },
    { label: "Review", value: markedCount },
  ];

  const shouldRestrictManualSubmit =
    isHardMode &&
    sessionSnapshot.timingProfile.hardModeRestrictSubmitUntilAllVisited &&
    visitedCount < sessionSnapshot.questions.length;

  const unansweredCount = unansweredQuestionIdsForSubmission.length;
  const attemptedPercent = toPercent(answeredCount, sessionSnapshot.questions.length);
  const showControlledLowAttemptSubmitWarning = isControlledMode && attemptedPercent < 50;
  const liveSupportItems = isControlledMode
      ? [
        `${currentPhasePresentation.shortLabel}: ${currentPhasePresentation.title}`,
          `${currentPhaseRemainingLabel} left in phase`,
          automaticPhaseId !== controlledPhaseId ? "Overstay active" : "Within phase window",
        ]
      : isDiagnosticMode
        ? [
            `${currentPhasePresentation.shortLabel}: ${currentPhasePresentation.title}`,
            `${visibleQuestionsForCurrentPhase.length} visible questions`,
            currentExamPhase === "buffer" ? "Buffer open" : "Auto phase transition active",
          ]
        : isHardMode
          ? [
              "Sequential progression active",
              sessionSnapshot.hardModeRevisitRestricted ? "Revisit disabled" : "Restricted revisit",
              `MinTime ${selectedQuestionMinTimeRemainingSec}s`,
            ]
          : [];
  const compactModePills = !isOperationalMode ? liveSupportItems.slice(2) : [];
  const lowDiscipline = adaptivePhaseSnapshot.disciplineIndex < EARLY_SUBMIT_DISCIPLINE_THRESHOLD;
  const lowAdherence = adaptivePhaseSnapshot.phaseAdherencePercent < EARLY_SUBMIT_PHASE_ADHERENCE_THRESHOLD;
  const requiresEarlySubmitOverride = isControlledMode && (lowDiscipline || lowAdherence);
  const manualSubmitDisabled = isSubmitted || sessionLocked || slowdownActive || shouldRestrictManualSubmit;
  const browserIntegrityAlertCount = reporting.pending;
  const sessionStartCountdownMs = Math.max(0, sessionSchedule.sessionStartsAtMs - nowEpochMs);
  const entryOpenCountdownMs = Math.max(0, sessionSchedule.earlyEntryOpensAtMs - nowEpochMs);
  const preExamChecklist: PreExamChecklistItem[] = [
    {
      id: "session",
      label: "Session Window",
      state: entryStage === "entry_not_open" ? "pending" : "passed",
      helper: "Wait until the entry window opens for this session.",
    },
    {
      id: "browser",
      label: "Browser Integrity",
      state: browserReadinessState,
      helper: "Keep this tab active and avoid switching windows during entry.",
    },
    {
      id: "internet",
      label: "Internet Connection",
      state: internetCheckState,
      helper: "Check your connection before starting the secure session.",
    },
    {
      id: "camera",
      label: "Camera Permission",
      state: cameraCheckState,
      helper: "Allow browser camera permission and keep the camera uncovered.",
    },
  ];
  const completedPreExamCheckCount = preExamChecklist.filter((item) => item.state === "passed" || item.state === "skipped").length;
  const preExamProgressPercent = Math.round((completedPreExamCheckCount / preExamChecklist.length) * 100);
  const lobbyModeDetail = LOBBY_MODE_DETAILS[entryValidation.claims.mode];
  const lobbyModeClassName = isOperationalMode
    ? "operational"
    : isControlledMode
      ? "controlled"
      : isDiagnosticMode
        ? "focused"
        : "hard";
  const lobbyNextStepState = preExamChecksPassed ? "complete" : "active";
  const lobbyNextStepTitle = preExamChecksPassed ? "Entry checks complete" : "Complete local readiness checks";
  const lobbyNextStepDetail = "Check internet and any required local camera preview. Automated face matching and gaze tracking are unavailable.";
  const lobbyModeStudentNote = isControlledMode
    ? "Controlled mode shows phase goals and overstay status during the exam."
    : isDiagnosticMode
      ? "Diagnostic mode may show only the questions available in the current phase."
      : isHardMode
        ? "Hard mode applies navigation locks and minimum thinking-time rules."
        : "Operational mode keeps navigation open with best-effort browser observations when required by server policy.";
  const canControlledProceedToPhase2 = visitedCount >= sessionSnapshot.questions.length;
  const controlledPhaseAdvanceDisabled =
    sessionLocked ||
    !isControlledMode ||
    controlledPhaseId === "buffer" ||
    (controlledPhaseId === "phase1" && !canControlledProceedToPhase2);

  const advanceControlledPhase = () => {
    if (controlledPhaseAdvanceDisabled) {
      return;
    }

    setControlledPhaseId((current) => {
      if (current === "phase1") {
        return "phase2";
      }
      if (current === "phase2") {
        return "phase3";
      }
      return "buffer";
    });
  };

  const signOutOfExam = () => {
    cameraRef.current?.stop(); integrityQueueRef.current?.stop();
    void runtimeOwnership.signOut().catch(() => runtimeOwnership.invalidate("sign_out_interrupted"));
  };
  const cameraPanel = <section aria-label="Local camera readiness">
    {cameraRequired ? <><p>{CAMERA_NOTICE}</p>
      <video autoPlay playsInline muted aria-label="Local camera preview" ref={node => {if (displayedPreviewRef.current) displayedPreviewRef.current.srcObject = null; displayedPreviewRef.current = node; if (node) node.srcObject = cameraStream;}} />
      <p role="status">{cameraState === "passed" ? "Local camera preview ready. This is a browser report, not identity verification." : cameraState === "failed" ? "Camera readiness unavailable. Retry or return to Student for help." : cameraState === "requesting" ? "Waiting for permission and usable preview." : "Fresh consent and local readiness are required."}</p>
      <button type="button" onClick={() => void cameraRef.current?.start()} disabled={!locallyEligible || cameraState === "requesting"}>I agree — {cameraState === "failed" ? "Retry Camera" : "Start Camera"}</button>
      <button type="button" onClick={() => {cameraRef.current?.stop(); integrityQueueRef.current?.capture("CAMERA_LOST", phaseRef.current);}}>Stop Camera</button>
      <StudentPortalReturnButton />
    </> : <p>Camera readiness is off. No camera permission is requested.</p>}
    <p>Automated face matching and gaze tracking are unavailable. No identity photo is fetched.</p>
  </section>;
  const transportRetryWaitMs = runtimeOwnership.retryWaitMs();
  const clockRecoveryControls = !isSubmitted && !authorityInterrupted && clockRecoveryRequired ?
    <section className="exam-instruction-card" aria-label="Clock and connection recovery">
      <p>{syncMessage} Confirm current clock and ownership before editing. The exam deadline continues.</p>
      {transportRetryWaitMs > 0 ? <p>Retry available in at least {Math.ceil(transportRetryWaitMs / 1000)} seconds.</p> : null}
      <button type="button" disabled={transportRetryWaitMs > 0 || !navigator.onLine} onClick={() => void confirmCurrentAuthority(true)}>Retry clock and connection</button>
    </section> : null;
  const proctoringStatus = <>{clockRecoveryControls}<section aria-label="Client observation reporting" aria-live="polite">
    {integrityBlockingReason ? <p>{integrityBlockingReason} <button type="button" onClick={() => void requestExamFullscreen()}>Re-enter Fullscreen</button></p> : null}
    <p>{reportingEnabled ? `Client observations: ${reporting.status}. ${reporting.saved} acknowledged, ${reporting.pending} not yet saved, ${reporting.lost} lost or discarded.` : "Client observation reporting is off."}</p>
    <p>Observations are incomplete browser reports, never proof of misconduct. Unacknowledged observations may be lost on exit or submission. Answer saving and submission do not wait for reporting.</p>
    {reporting.status === "unavailable" ? <button type="button" onClick={() => integrityQueueRef.current?.retry()}>Retry reporting</button> : null}
  </section></>;
  if (ownershipInterrupted) {
    return <main className="exam-access-shell" aria-live="polite"><section className="exam-access-card">
      {proctoringStatus}
      <h1>Exam runtime paused</h1>
      <p>{ownership.reason === "refresh_pending" ? "Checking current sign-in. Questions and camera are paused; pending answers are retained." : ownership.reason === "entry_unavailable" ? "Entry confirmation is temporarily unavailable. Reload to recover the retained entry command, or relaunch from Student My Tests." : "Ownership or sign-in changed. Pending answers are retained. Another runtime may be active; no remote browser has been closed."}</p>
      <p>Reload to request recovery, or relaunch from Student My Tests after release or lease expiry.</p>
      <StudentPortalReturnButton />
    </section></main>;
  }
  if (serverEntryValidationStatus === "pending" || (!devMockSessionActive && authSession.status === "loading")) {
    return <ExamServerEntryValidationLoading />;
  }

  if (!entryValidation.allowed) {
    return <ExamAccessRedirect reason={entryValidation.reason} />;
  }

  if (authorityInterruption) {
    return (
      <>{proctoringStatus}<ExamAuthorityInterruptionPage
        interruption={authorityInterruption}
        pendingAnswerCount={pendingAnswers.length}
      /></>
    );
  }

  if (serverEntryValidationStatus === "invalid") {
    return <ExamAccessRedirect reason="server_validation_failed" />;
  }

  if (sessionLifecycleState === "terminated") {
    return (
      <main className="exam-submitted-shell" aria-live="polite">
        {proctoringStatus}
        <section className="exam-submitted-card">
          <p className="exam-access-eyebrow">Session Terminated</p>
          <h1>Session Terminated</h1>
          <p>
            Reason:
            {" "}
            <strong>{"The server closed this session without a submission receipt."}</strong>
          </p>
          <StudentPortalReturnButton />
        </section>
      </main>
    );
  }

  if (isSubmitted) {
    return (
      <main className="exam-submitted-shell" aria-live="polite">
        {proctoringStatus}
        <section className="exam-submitted-card">
          <p className="exam-access-eyebrow">Session Closed</p>
          <h1>Exam Submitted</h1>
          <p>
            Reason:
            {" "}
            <strong>{submissionReason === "expiry" ? "Timer expiry auto-submit" : "Manual submit"}</strong>
          </p>
          <p>
            Submitted At:
            {" "}
            <strong>{submittedAtIso ?? "N/A"}</strong>
          </p>
          <p>Only answers accepted by the server were submitted. Local changes received after the deadline were not accepted. Results in Student may still be processing.</p>
          {submissionResult ? (
            <div className="exam-submission-metrics" aria-label="Authoritative submission metrics">
              <p>Raw Score: <strong>{submissionResult.rawScorePercent.toFixed(2)}%</strong></p>
              <p>Accuracy: <strong>{submissionResult.accuracyPercent.toFixed(2)}%</strong></p>
              <p>Discipline Index: <strong>{submissionResult.disciplineIndex.toFixed(2)}%</strong></p>
              <p>Risk State: <strong>{submissionResult.riskState}</strong></p>
              <p>Phase Adherence: <strong>{submissionResult.phaseAdherencePercent.toFixed(2)}%</strong></p>
              <p>Guess Rate: <strong>{submissionResult.guessRatePercent.toFixed(2)}%</strong></p>
              <p>Min-Time Violations: <strong>{submissionResult.minTimeViolationPercent.toFixed(2)}%</strong></p>
              <p>Max-Time Violations: <strong>{submissionResult.maxTimeViolationPercent.toFixed(2)}%</strong></p>
              <p>
                Server Disposition:
                {" "}
                <strong>{submissionResult.alreadySubmitted ? "Already finalized" : "Finalized now"}</strong>
              </p>
            </div>
          ) : null}
          <StudentPortalReturnButton />
        </section>
      </main>
    );
  }
  if (sessionLifecycleState === "expired" || submissionUncertain) return <main className="exam-submitted-shell" aria-live="polite"><section className="exam-submitted-card">
    <h1>{sessionLifecycleState === "expired" ? "Exam time expired" : "Submission confirmation"}</h1>
    <p>Only server-accepted answers can be finalized. Pending local changes received after the deadline are not accepted. They are retained until a canonical receipt is confirmed.</p>
    <p role="status">{submitInFlight ? "Confirming submission with the server…" : "Submission confirmation unavailable. This does not establish whether submission committed."}</p>
    {submitError ? <p role="alert">{submitError}</p> : null}
    <button type="button" disabled={submitInFlight || !recoveryApplied || transportRetryWaitMs > 0 || !navigator.onLine} onClick={() => void submitSession(submitIntentRef.current?.reason ?? "expiry").catch(error => setSubmitError(error instanceof Error ? error.message : "Confirmation unavailable."))}>Retry submission confirmation</button>
    {clockRecoveryControls}<StudentPortalReturnButton />
  </section></main>;

  if (instructionConfirmed && !recoveryApplied && !isSubmitted) return <main className="exam-instruction-shell"><p role="status">Restoring accepted answers and checking local recovery…</p></main>;

  if (entryStage === "entry_not_open") {
    return (
      <main className="exam-instruction-shell">
        {proctoringStatus}
        {!devMockSessionActive && runtimeOwnership.isCurrent() ? <button type="button" className="exam-secondary-button" onClick={signOutOfExam}>Sign out of Exam</button> : null}
        <section className="exam-instruction-card">
          <p className="exam-instruction-eyebrow">Exam Entry Lobby</p>
          <h1>Entry Window Not Open</h1>
          <p>
            Student entry opens at
            {" "}
            <strong>{toTimeLabel(sessionSchedule.earlyEntryOpensAtMs, sessionSchedule.timezone)}</strong>
            .
          </p>
          <p className="exam-lobby-countdown">
            Opens in
            {" "}
            <strong>{toMinuteSecondCountdownLabel(entryOpenCountdownMs)}</strong>
          </p>
        </section>
      </main>
    );
  }

  if (entryStage === "entry_closed") {
    return (
      <main className="exam-instruction-shell">
        {proctoringStatus}
        {!devMockSessionActive && runtimeOwnership.isCurrent() ? <button type="button" className="exam-secondary-button" onClick={signOutOfExam}>Sign out of Exam</button> : null}
        <section className="exam-instruction-card">
          <p className="exam-instruction-eyebrow">Exam Entry Closed</p>
          <h1>Entry Window Closed</h1>
          <p>
            This exam started at
            {" "}
            <strong>{toTimeLabel(sessionSchedule.sessionStartsAtMs, sessionSchedule.timezone)}</strong>
            . New entry is not allowed after the official start time.
          </p>
          <StudentPortalReturnButton />
        </section>
      </main>
    );
  }

  if (entryStage === "pre_exam_lobby") {
    return (
      <main className="exam-instruction-shell">
        {proctoringStatus}
        {!devMockSessionActive && runtimeOwnership.isCurrent() ? <button type="button" className="exam-secondary-button" onClick={signOutOfExam}>Sign out of Exam</button> : null}
        <section className="exam-instruction-card exam-lobby-card" aria-labelledby="exam-lobby-title">
          <header className={`exam-lobby-hero ${lobbyModeClassName}`}>
            <div className="exam-lobby-hero-copy">
              <p className="exam-instruction-eyebrow">Pre-Exam Session Lobby</p>
              <h1 id="exam-lobby-title">Complete Entry Check</h1>
              <p>{lobbyModeDetail.focus}</p>
              <div className="exam-lobby-mode-strip" aria-label="Exam mode identity">
                <span>{modeTierLabel}</span>
                <strong>{lobbyModeDetail.title}</strong>
                <span>{lobbyModeDetail.summary}</span>
              </div>
            </div>
            <div className="exam-lobby-start-panel" aria-label="Exam start countdown">
              <span>Official Start</span>
              <strong>{toTimeLabel(sessionSchedule.sessionStartsAtMs, sessionSchedule.timezone)}</strong>
              <p>
                Starts in
                {" "}
                {toMinuteSecondCountdownLabel(sessionStartCountdownMs)}
              </p>
            </div>
          </header>

          <div className="exam-lobby-meta-grid" aria-label="Session summary">
            <div>
              <span>Candidate</span>
              <strong>{candidateName}</strong>
            </div>
            <div>
              <span>Attempt Mode</span>
              <strong>{entryValidation.claims.mode}</strong>
            </div>
            <div>
              <span>Question Set</span>
              <strong>{sessionSnapshot.questionSetVersion}</strong>
            </div>
            <div>
              <span>Total Questions</span>
              <strong>{sessionSnapshot.questions.length}</strong>
            </div>
            <div>
              <span>Checks Done</span>
              <strong>
                {completedPreExamCheckCount}
                /
                {preExamChecklist.length}
              </strong>
            </div>
            <div>
              <span>Local camera readiness</span>
              <strong>{cameraRequired ? "Required" : "Off"}</strong>
            </div>
          </div>

          <section className={`exam-lobby-next-step exam-lobby-next-step-${lobbyNextStepState}`} aria-live="polite">
            <span className="exam-lobby-next-step-icon" aria-hidden="true" />
            <div>
              <strong>{lobbyNextStepTitle}</strong>
              <p>{lobbyNextStepDetail}</p>
            </div>
          </section>

          <div className="exam-lobby-layout">
            <aside className="exam-lobby-checklist" aria-label="Pre-exam checklist">
              <div className="exam-lobby-checklist-header">
                <div>
                  <span>Readiness</span>
                  <strong>{preExamProgressPercent}%</strong>
                </div>
                <div className="exam-lobby-progress-track" aria-hidden="true">
                  <span style={{ width: `${preExamProgressPercent}%` }} />
                </div>
              </div>
              {preExamChecklist.map((item) => (
                <div key={item.id} className={`exam-lobby-check exam-lobby-check-${item.state}`}>
                  <span className="exam-lobby-check-dot" aria-hidden="true" />
                  <span>
                    {item.label}
                    {item.state === "pending" || item.state === "failed" ? (
                      <small>{item.helper}</small>
                    ) : null}
                  </span>
                  <strong>{item.state}</strong>
                </div>
              ))}
            </aside>

            <section className="exam-lobby-workspace" aria-label="Current lobby checks">
              <div className="exam-lobby-action-grid">
                <article className="exam-lobby-action-panel">
                  <div className="exam-lobby-action-header">
                    <span>01</span>
                    <div>
                      <h2>Browser + Internet</h2>
                      <p>Confirm the browser is online and ready for the secure session.</p>
                    </div>
                  </div>
                  <div className="exam-lobby-action-row">
                    <button type="button" className="exam-secondary-action" onClick={() => setBrowserReadinessState(navigator.onLine ? "passed" : "failed")}>
                      Recheck Browser
                    </button>
                    <button type="button" className="exam-save-next-button" onClick={startInternetCheck}>
                      Check Internet
                    </button>
                  </div>
                  {internetCheckState === "failed" || browserReadinessState === "failed" ? (
                    <p className="exam-lobby-support-note">If this keeps failing, reconnect and contact the invigilator.</p>
                  ) : null}
                </article>

                <article className="exam-lobby-action-panel"><h2>Local camera readiness</h2>{cameraPanel}</article>
              </div>
            </section>
          </div>

          <section className={`exam-lobby-completion-panel ${preExamChecksPassed ? "complete" : ""}`} aria-label="Entry completion status">
            <div>
              <span>{preExamChecksPassed ? "Ready" : "Before You Continue"}</span>
              <strong>{preExamChecksPassed ? "Entry checks complete" : "Complete every required check"}</strong>
              <p>{preExamChecksPassed ? "You are cleared to review instructions and start when the exam opens." : "The button below unlocks after browser, internet and required local camera readiness checks pass."}</p>
            </div>
            <p>{lobbyModeStudentNote}</p>
          </section>

          <footer className="exam-lobby-footer">
            <p>
              The official exam opens automatically after instructions when the countdown reaches zero.
            </p>
            <button
              type="button"
              className="exam-start-button"
              disabled={!preExamChecksPassed}
              onClick={continueToInstructions}
            >
              Continue to Instructions
            </button>
            {fullscreenGateError ? <p className="exam-submit-warning">{fullscreenGateError}</p> : null}
          </footer>

        </section>
      </main>
    );
  }

  if (!instructionConfirmed) {
    return (
      <main className="exam-instruction-shell">
        {proctoringStatus}
        {cameraPanel}
        {!devMockSessionActive && runtimeOwnership.isCurrent() ? <button type="button" className="exam-secondary-button" onClick={signOutOfExam}>Sign out of Exam</button> : null}
        <section className="exam-instruction-card exam-instruction-card-redesigned" aria-labelledby="exam-instruction-title">
          <header className={`exam-instruction-hero ${lobbyModeClassName}`}>
            <div className="exam-instruction-hero-copy">
              <p className="exam-instruction-eyebrow">Exam Entry</p>
              <h1 id="exam-instruction-title">Read Before You Start</h1>
              <p>{modeStudentExplanation}</p>
              <div className="exam-instruction-candidate-strip">
                <p>
                  Candidate:
                  {" "}
                  <strong>{candidateName}</strong>
                </p>
                <p>
                  Session:
                  {" "}
                  <code>{sessionId}</code>
                </p>
              </div>
            </div>
            <div className="exam-instruction-start-card" aria-label="Official start countdown">
              <span>Official exam starts in</span>
              <strong>{toMinuteSecondCountdownLabel(sessionStartCountdownMs)}</strong>
              <p>
                Opens at
                {" "}
                {toTimeLabel(sessionSchedule.sessionStartsAtMs, sessionSchedule.timezone)}
              </p>
            </div>
          </header>

          <div className="exam-instruction-meta-grid" aria-label="Instruction summary">
            <div className="exam-instruction-meta-card">
              <span>Questions</span>
              <strong>{sessionSnapshot.questions.length}</strong>
            </div>
            <div className="exam-instruction-meta-card">
              <span>Duration</span>
              <strong>{totalDurationMinutesLabel} Min</strong>
            </div>
            <div className="exam-instruction-meta-card">
              <span>Mode</span>
              <strong>{entryValidation.claims.mode}</strong>
            </div>
            <div className="exam-instruction-meta-card">
              <span>Negative Marking</span>
              <strong>-1 MCQ</strong>
            </div>
          </div>

          <section className="exam-instruction-priority" aria-label="Most important instructions">
            <article>
              <span>01</span>
              <strong>Stay in this tab</strong>
              <p>Do not refresh, close, or switch away from the exam window.</p>
            </article>
            <article>
              <span>02</span>
              <strong>Use on-screen controls</strong>
              <p>Navigate with the palette, section tabs, and footer buttons only.</p>
            </article>
            <article>
              <span>03</span>
              <strong>Accept declaration</strong>
              <p>The question paper opens automatically at the official start time.</p>
            </article>
          </section>

          <div className="exam-instruction-layout">
            <section className="exam-instruction-section" aria-label="Marking Scheme">
              <div className="exam-instruction-section-header">
                <span>Scoring</span>
                <h2>Marking Scheme</h2>
              </div>
              <ul className="exam-instruction-clean-list">
                {MARKING_SCHEME.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>

            <section className="exam-instruction-section" aria-label="Navigation Instructions">
              <div className="exam-instruction-section-header">
                <span>During Exam</span>
                <h2>Navigation Rules</h2>
              </div>
              <ul className="exam-instruction-clean-list">
                {NAVIGATION_INSTRUCTIONS.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>
          </div>

          <section className="exam-instruction-section" aria-label="Question Palette Explanation">
            <div className="exam-instruction-section-header">
              <span>Status Guide</span>
              <h2>Question Palette</h2>
            </div>
            <div className="exam-legend-grid exam-legend-grid-instructions">
              {QUESTION_PALETTE_LEGEND.map((legend) => (
                <div key={legend.status} className="exam-legend-item">
                  <span className={`exam-legend-swatch ${statusClassName(legend.status)}`}>{legend.label.split(" ")[0]}</span>
                  <span className="exam-legend-copy">
                    <strong>{legend.label}</strong>
                    <span>
                      {legend.status === "not_visited" ? "You have not opened this question yet." : null}
                      {legend.status === "not_answered" ? "You opened it but have not saved an answer." : null}
                      {legend.status === "answered" ? "Your answer is saved for this question." : null}
                      {legend.status === "marked" ? "You want to review this question later." : null}
                      {legend.status === "answered_marked" ? "Your answer is saved and the question is marked for review." : null}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="exam-instruction-section" aria-label="Mode Specific Instructions">
            <div className="exam-instruction-section-header">
              <span>{modeTierLabel}</span>
              <h2>{modeInstruction.title}</h2>
            </div>
            <div className="exam-mode-rule-grid">
              {modeInstruction.points.map((point, index) => (
                <article key={point}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{point}</p>
                </article>
              ))}
            </div>
            {!isOperationalMode ? (
              <div className="exam-phase-schedule" aria-label="Phase timing schedule">
                {phaseSchedule.map((phase) => (
                  <article
                    key={phase.phaseId}
                    className={phase.phaseId === adaptivePhaseSnapshot.currentPhase ? "exam-phase-schedule-card active" : "exam-phase-schedule-card"}
                  >
                    <span>{phase.shortLabel}</span>
                    <strong>{phase.title}</strong>
                    <p>{phase.description}</p>
                    <small>
                      {toCompactDurationLabel(phase.durationMs)}
                      {" "}
                      window
                    </small>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className={`exam-instruction-ready-panel ${declarationAccepted ? "accepted" : ""}`} aria-label="Declaration and readiness">
            {!declarationAccepted ? (
              <div className="exam-declaration-alert" role="alert">
                <strong>Action required before start</strong>
                <p>Tick the declaration checkbox below. Without this confirmation, the exam paper will not open.</p>
              </div>
            ) : null}
            <div>
              <span>{declarationAccepted ? "Ready State" : "Final Step"}</span>
              <strong>{declarationAccepted ? "Declaration accepted" : "Accept declaration to enter the paper"}</strong>
              <p>
                {declarationAccepted ?
                  "Keep this page open in fullscreen. The paper opens automatically at the official start time." :
                  "Read the rules above, then confirm that you understand the monitored exam conditions."}
              </p>
            </div>
            <label className="exam-declaration-checkbox" htmlFor="exam-declaration-checkbox">
                <input
                  id="exam-declaration-checkbox"
                  type="checkbox"
                  checked={declarationAccepted}
                  onChange={(event) => setDeclarationAccepted(event.target.checked)}
                />
              <span>
                <strong>Accept Declaration</strong>
                I have read and understood the instructions. I am ready to begin the test under monitored exam conditions.
              </span>
            </label>
            <p className="exam-instruction-start-note">If the declaration is not accepted before official start, entry will close.</p>
            {sessionConflictMessage ? <p className="exam-submit-warning">{sessionConflictMessage}</p> : null}
            {fullscreenGateError ? <p className="exam-submit-warning">{fullscreenGateError}</p> : null}
          </section>
        </section>
      </main>
    );
  }

  const saveCurrentWithReviewStateAndMaybeAdvance = (markedForReview: boolean, advance: boolean) => {
    if (!selectedQuestion || sessionLocked) {
      return;
    }

    if (slowdownActive || selectedQuestionRevisitLocked) {
      return;
    }

    if (saveBlockedByTiming) {
      setQuestionTimingById((current) => ({
        ...current,
        [selectedQuestion.id]: {
          ...current[selectedQuestion.id],
          minTimeViolationCount: current[selectedQuestion.id].minTimeViolationCount + 1,
        },
      }));
      const nextStreak = rushedAttemptStreak + 1;
      setRushedAttemptStreak(nextStreak);
      if (isControlledMode && nextStreak >= MAX_RUSHED_SAVE_BEFORE_SLOWDOWN) {
        setSlowdownUntilMs(nowEpochMs + sessionSnapshot.timingProfile.controlledSlowdownSeconds * 1000);
        setRushedAttemptStreak(0);
      }
      return;
    }

    setRushedAttemptStreak(0);

    setVisitedQuestionIds((current) => {
      const next = new Set(current);
      next.add(selectedQuestion.id);
      return next;
    });

    const currentResponseState = responseStateByQuestionId[selectedQuestion.id] ?? {
      selectedOptionId: null,
      numericResponse: "",
      matrixSelections: [],
      markedForReview: false,
    };
    const nextResponseState = {
      ...currentResponseState,
      markedForReview,
    };

    setResponseStateByQuestionId((current) => ({
      ...current,
      [selectedQuestion.id]: nextResponseState,
    }));

    if (!hasAnswer(selectedQuestion, nextResponseState)) {
      setSkippedQuestionsCount((current) => current + 1);
    }

    queueAnswerWrite(selectedQuestion.id, nextResponseState);

    if (isHardMode && sessionSnapshot.hardModeRevisitRestricted) {
      setHardModeLockedQuestionIds((current) => {
        const next = new Set(current);
        next.add(selectedQuestion.id);
        return next;
      });
    }

    if (!advance) {
      return;
    }

    const firstForwardQuestion = sessionSnapshot.questions.find(
      (question, index) =>
        index > selectedQuestionIndex &&
        (!isHardMode || !hardModeLockedQuestionIds.has(question.id) || question.id === selectedQuestion.id),
    );

    if (firstForwardQuestion) {
      navigateToQuestion(firstForwardQuestion.id);
    }
  };

  const goToPreviousQuestion = () => {
    if (
      !selectedQuestion ||
      selectedQuestionIndex <= 0 ||
      slowdownActive ||
      sessionLocked ||
      hardModeBackwardNavigationDisabled ||
      (questionTimingEnforced && selectedQuestionMinTimeRemainingSec > 0)
    ) {
      return;
    }

    const previousQuestion = sessionSnapshot.questions[selectedQuestionIndex - 1];
    if (!previousQuestion) {
      return;
    }

    if (isHardMode && sessionSnapshot.hardModeRevisitRestricted && hardModeLockedQuestionIds.has(previousQuestion.id)) {
      return;
    }

    navigateToQuestion(previousQuestion.id);
  };

  const jumpToQuestion = (questionId: string) => {
    if (!selectedQuestion || isQuestionJumpDisabled(questionId)) {
      return;
    }

    navigateToQuestion(questionId);
  };

  const openSubmitDialog = () => {
    if (manualSubmitDisabled) {
      return;
    }
    setSubmitError(null);
    setSubmitWarningAcknowledged(unansweredCount === 0);
    setEarlySubmitOverrideAccepted(!requiresEarlySubmitOverride);
    setSubmitDialogOpen(true);
  };

  const submitExam = async () => {
    if (manualSubmitDisabled || submitInFlight) {
      return;
    }

    if (unansweredCount > 0 && !submitWarningAcknowledged) {
      return;
    }

    if (requiresEarlySubmitOverride && !earlySubmitOverrideAccepted) {
      return;
    }

    if (selectedQuestion) {
      queueAnswerWrite(
        selectedQuestion.id,
        responseStateByQuestionId[selectedQuestion.id] ?? {
          selectedOptionId: null,
          numericResponse: "",
          matrixSelections: [],
          markedForReview: false,
        },
      );
    }

    await submitSession("manual").catch((error) => {
      setSubmitError(error instanceof Error ? error.message : "Submission failed.");
    });
  };


  return (
    <main className={hardModeMinimalUI ? "exam-runner-shell exam-runner-shell-hard-mode" : "exam-runner-shell"}>
      {proctoringStatus}
      {cameraRequired ? cameraPanel : null}
      {localQuestionPaused ? <section role="status"><h2>Question interaction paused</h2><p>{clockRecoveryRequired ? "Confirm current server clock and ownership before editing. The exam deadline continues." : "Restore required local camera readiness or fullscreen."} Pending answers continue syncing. Submission remains available.</p>
      </section> : null}
        {!devMockSessionActive && runtimeOwnership.isCurrent() ? <button type="button" className="exam-secondary-button" onClick={signOutOfExam}>Sign out of Exam</button> : null}
      <div className="exam-top-bar">
        <header className="exam-header" aria-label="Exam header bar">
          <div className="exam-header-group exam-header-identity exam-header-identity-compact">
            <p className="exam-header-label">Candidate</p>
            <h1>{candidateName}</h1>
          </div>

          <div className="exam-header-group exam-header-metrics exam-header-metrics-compact">
            <p>
              <span className={isOperationalMode ? "exam-mode-badge operational" : isControlledMode ? "exam-mode-badge controlled" : isDiagnosticMode ? "exam-mode-badge focused" : "exam-mode-badge hard"}>
                {modeTierLabel}
              </span>
            </p>
            <p>
              Q
              {" "}
              <strong>{selectedQuestion?.number ?? 1}</strong>
              /
              {sessionSnapshot.questions.length}
            </p>
            {!isOperationalMode ? (
              <p>
                {currentPhasePresentation.shortLabel}
                {" "}
                <strong>{currentPhasePresentation.title}</strong>
                {" "}
                •
                {" "}
                <strong>{currentPhaseRemainingLabel} left</strong>
              </p>
            ) : null}
          </div>

          <div className="exam-header-group exam-header-timer-group">
            <div className="exam-header-timer-row">
              <div className="exam-header-timer-stack">
                <p className="exam-header-label">Exam Time Left</p>
                <p className={isFinalWindow ? "exam-header-timer danger" : "exam-header-timer"}>
                  {toCountdownLabel(remainingMs)}
                </p>
              </div>
              <div className="exam-header-utility-actions">
                {!hardModeMinimalUI ? (
                  <span className={syncState === "error" ? "exam-sync-pill error" : "exam-sync-pill"}>
                    {syncSummaryLabel}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="exam-calculator-launch"
                  onClick={() => setCalculatorOpen(true)}
                >
                  Calculator
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className={hardModeMinimalUI ? "exam-header-subject-tabs exam-header-subject-tabs-hard-mode" : "exam-header-subject-tabs"} role="tablist" aria-label="Header subject tabs">
          <div className="exam-header-subject-tabs-track">
            {sessionSnapshot.subjects.map((subject) => (
              <button
                key={subject}
                type="button"
                role="tab"
                aria-selected={selectedSection === subject}
                className={selectedSection === subject ? "exam-filter-button active" : "exam-filter-button"}
                onClick={() => setSelectedSection(subject)}
              >
                {subject}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={selectedSection === "All"}
              className={selectedSection === "All" ? "exam-filter-button active" : "exam-filter-button"}
              onClick={() => setSelectedSection("All")}
            >
              All Subjects
            </button>
          </div>
          <div className="exam-inline-question-strip" aria-label="Current question context">
            <div className="exam-inline-question-strip-copy">
              <strong>
                {selectedQuestion?.section ?? "Physics"}
                {" "}
                • Question
                {" "}
                {selectedQuestion?.number ?? 1}
              </strong>
              <span>
                Type
                {" "}
                <strong>{selectedQuestion?.type.toUpperCase() ?? "MCQ"}</strong>
              </span>
            </div>
            <div className="exam-inline-question-strip-actions">
              {!isOperationalMode ? (
                <span className="exam-question-status-chip">{selectedQuestionHeaderStatus}</span>
              ) : null}
              {(isControlledMode || isDiagnosticMode || isHardMode) ? (
                <button
                  type="button"
                  className="exam-header-utility-button"
                  onClick={() => setInsightsOpen(true)}
                >
                  Q Time
                </button>
              ) : null}
            </div>
          </div>
          {!isOperationalMode ? (
            <div
              className={isControlledMode ? "exam-inline-mode-strip controlled" : isDiagnosticMode ? "exam-inline-mode-strip focused" : "exam-inline-mode-strip hard"}
              aria-label="Execution mode strip"
            >
              <div className="exam-inline-mode-strip-signals">
                {compactModePills.map((item) => (
                  <span key={item} className="exam-inline-mode-strip-pill">{item}</span>
                ))}
              </div>
              {isControlledMode ? (
                <button
                  type="button"
                  className="exam-phase-advance-button"
                  disabled={controlledPhaseAdvanceDisabled}
                  onClick={advanceControlledPhase}
                >
                  {controlledPhaseId === "phase1"
                    ? "Proceed to Phase 2"
                    : controlledPhaseId === "phase2"
                      ? "Proceed to Phase 3"
                      : controlledPhaseId === "phase3"
                        ? "Enter Buffer"
                        : "Buffer Active"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {slowdownActive ? (
        <section className="exam-enforcement-warning" aria-label="Controlled slowdown warning">
          <p>
            Slowdown active due to consecutive rushed saves. Resume in
            {" "}
            <strong>{slowdownSecondsRemaining}s</strong>.
          </p>
        </section>
      ) : null}

      {submitInFlight ? (
        <section className="exam-enforcement-warning" aria-label="Submission finalization status">
          <p>
            Submission in progress. Do not close this tab until confirmation is displayed.
          </p>
        </section>
      ) : null}

      {hardModeMinimalUI ? (
        <section className="exam-hard-mode-strip" aria-label="Hard mode minimal guidance">
          <p>Hard Mode active. Sequential progression and timing locks are enforced with minimal on-screen guidance.</p>
        </section>
      ) : null}

      <div className="exam-main-layout">
        <aside className="exam-palette-panel" aria-label="Question navigation panel">
          <div className="exam-palette-topline">
            <div className="exam-palette-section-header">
              <h2>Question Palette</h2>
              <p>{activeSectionLabel}</p>
            </div>
            <div className="exam-palette-summary" aria-label="Palette summary">
              {paletteSummaryItems.map((item) => (
                <div key={item.label} className="exam-palette-summary-card">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="exam-palette-grid" aria-label="Question status tiles">
            {filteredPalette.map((tile) => {
              const jumpDisabled = isQuestionJumpDisabled(tile.id);

              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={jumpDisabled}
                  className={
                    tile.id === selectedQuestionId
                      ? `exam-palette-tile ${statusClassName(tile.status)} selected`
                      : `exam-palette-tile ${statusClassName(tile.status)}`
                  }
                  onClick={() => jumpToQuestion(tile.id)}
                >
                  {tile.number}
                </button>
              );
            })}
          </div>
          {filteredPalette.length === 0 ? (
            <p className="exam-phase-empty-note">No questions are visible in this phase window.</p>
          ) : null}

          {!hardModeMinimalUI ? (
            <div className="exam-palette-legend" aria-label="Question palette legend">
              <h3>Legend</h3>
              <div className="exam-palette-legend-grid">
                <div className="exam-palette-legend-item">
                  <span className="exam-palette-legend-swatch exam-palette-tile-not-visited">1</span>
                  <span>You have not visited the question yet.</span>
                </div>
                <div className="exam-palette-legend-item">
                  <span className="exam-palette-legend-swatch exam-palette-tile-not-answered">2</span>
                  <span>You have not answered the question.</span>
                </div>
                <div className="exam-palette-legend-item">
                  <span className="exam-palette-legend-swatch exam-palette-tile-answered">3</span>
                  <span>You have answered the question.</span>
                </div>
                <div className="exam-palette-legend-item">
                  <span className="exam-palette-legend-swatch exam-palette-tile-marked">4</span>
                  <span>You have marked the question for review.</span>
                </div>
                <div className="exam-palette-legend-item">
                  <span className="exam-palette-legend-swatch exam-palette-tile-answered-marked">5</span>
                  <span>You answered the question and marked it for review.</span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="exam-status-indicators" aria-label="Answer status indicators">
            <h3>Session Status</h3>
            <p>
              Current Section:
              {" "}
              <strong>{activeSectionLabel}</strong>
            </p>
            <p>
              Completion:
              {" "}
              <strong>{toPercent(visitedCount, sessionSnapshot.questions.length).toFixed(0)}%</strong>
            </p>
            <p>
              Observations not yet saved:
              {" "}
              <strong>{browserIntegrityAlertCount}</strong>
            </p>
            {isHardMode ? (
              <p>
                Locked Questions:
                {" "}
                <strong>{hardModeLockedQuestionIds.size}</strong>
              </p>
            ) : null}
            {isControlledMode ? (
              <p>
                Phase Status:
                {" "}
                <strong>{automaticPhaseId !== controlledPhaseId ? "Overstay active" : "On phase"}</strong>
              </p>
            ) : null}
          </div>

          <div className="exam-submit-controls" aria-label="Submit controls">
            <button
              type="button"
              className="exam-submit-button"
              disabled={manualSubmitDisabled || submitInFlight}
              onClick={openSubmitDialog}
            >
              {submitInFlight ? "Submitting..." : "Submit Test"}
            </button>
            {shouldRestrictManualSubmit ? (
              <p className="exam-submit-warning">Hard Mode submit restriction active until all questions are visited.</p>
            ) : null}
            {submitError ? <p className="exam-submit-warning">{submitError}</p> : null}
          </div>
        </aside>

        <section className="exam-question-container" aria-label="Question rendering container">
          {localQuestionPaused ? null : selectedQuestion && selectedResponseState && selectedQuestionVisible ? (
            <article className="exam-question-surface">
              {(() => {
                const publicQuestionFieldKey = getPublicQuestionFieldKey(selectedQuestion);

                return (
                  <>
              <p className="exam-question-text">{selectedQuestion.text}</p>

              {selectedQuestion.imageUrl ? (
                <figure className="exam-question-image-wrap">
                  <img
                    src={toCdnAssetUrl(selectedQuestion.imageUrl)}
                    alt={`Question ${selectedQuestion.number} prompt`}
                    loading="lazy"
                    className="exam-question-image"
                  />
                  <figcaption>Image-based question content (lazy loaded)</figcaption>
                </figure>
              ) : null}

              {selectedQuestion.media ? (
                <section className="exam-question-media" aria-label="Optional media">
                  <p>
                    <strong>{selectedQuestion.media.title}</strong>
                  </p>
                  <a href={selectedQuestion.media.url} target="_blank" rel="noreferrer">
                    Open {selectedQuestion.media.type} reference
                  </a>
                </section>
              ) : null}

              {selectedQuestion.type === "mcq" && selectedQuestion.options ? (
                <div className="exam-option-list" role="radiogroup" aria-label="Multiple choice options">
                  {selectedQuestion.options.map((option) => (
                    <label key={option.id} className="exam-option-item">
                      <input
                        type="radio"
                        name={publicQuestionFieldKey}
                        checked={selectedResponseState.selectedOptionId === option.id}
                        onChange={() => {
                          if (selectedQuestionRevisitLocked || slowdownActive || sessionLocked) {
                            return;
                          }

                          updateQuestionResponseState(
                            selectedQuestion.id,
                            (current) => ({
                              ...current,
                              selectedOptionId: option.id,
                            }),
                          );
                        }}
                      />
                      <span>
                        <strong>{option.label}.</strong>
                        {" "}
                        {option.text}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}

              {selectedQuestion.type === "numeric" ? (
                <div className="exam-numeric-response">
                  <label htmlFor={`numeric-${publicQuestionFieldKey}`}>Numeric response</label>
                  <input
                    id={`numeric-${publicQuestionFieldKey}`}
                    type="text"
                    value={selectedResponseState.numericResponse}
                    onChange={(event) => {
                      if (selectedQuestionRevisitLocked || slowdownActive || sessionLocked) {
                        return;
                      }

                      updateQuestionResponseState(
                        selectedQuestion.id,
                        (current) => ({
                          ...current,
                          numericResponse: event.target.value,
                        }),
                      );
                    }}
                    placeholder="Enter numeric answer"
                  />
                </div>
              ) : null}

              {selectedQuestion.type === "matrix" ? (
                <div className="exam-matrix-response" aria-label="Matrix response">
                  {(selectedQuestion.matrixRows ?? []).map((row) => (
                    <div key={row} className="exam-matrix-row">
                      <p>{row}</p>
                      <div className="exam-matrix-columns">
                        {(selectedQuestion.matrixColumns ?? []).map((column) => {
                          const value = `${row}::${column}`;
                          const checked = selectedResponseState.matrixSelections.includes(value);
                          return (
                            <label key={value}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  if (selectedQuestionRevisitLocked || slowdownActive || sessionLocked) {
                                    return;
                                  }

                                  updateQuestionResponseState(selectedQuestion.id, (current) => {
                                    const existing = current.matrixSelections;
                                    const nextSelections = event.target.checked
                                      ? [...existing, value]
                                      : existing.filter((entry) => entry !== value);

                                    return {
                                      ...current,
                                      matrixSelections: nextSelections,
                                    };
                                  });
                                }}
                              />
                              {column}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <footer className="exam-question-actions" aria-label="Question interaction controls">
                <button
                  type="button"
                  className="exam-secondary-action"
                  onClick={goToPreviousQuestion}
                  disabled={
                    selectedQuestionIndex <= 0 ||
                    selectedQuestionRevisitLocked ||
                    slowdownActive ||
                    sessionLocked ||
                    hardModeBackwardNavigationDisabled ||
                    (questionTimingEnforced && selectedQuestionMinTimeRemainingSec > 0)
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="exam-warning-action"
                  onClick={() => {
                    if (selectedQuestionRevisitLocked || slowdownActive || sessionLocked) {
                      return;
                    }

                    updateQuestionResponseState(selectedQuestion.id, (current) => ({
                      selectedOptionId: null,
                      numericResponse: "",
                      matrixSelections: [],
                      markedForReview: current.markedForReview,
                    }));
                  }}
                  disabled={selectedQuestionRevisitLocked || slowdownActive || sessionLocked}
                >
                  Clear Response
                </button>
                <button
                  type="button"
                  className="exam-neutral-action"
                  onClick={() => saveCurrentWithReviewStateAndMaybeAdvance(true, true)}
                  disabled={saveDisabled}
                >
                  Mark for Review & Next
                </button>
                <button
                  type="button"
                  className="exam-save-next-button"
                  onClick={() => saveCurrentWithReviewStateAndMaybeAdvance(false, true)}
                  disabled={saveDisabled}
                >
                  Save & Next
                </button>
              </footer>

              {saveBlockedByTiming ? (
                <p className="exam-enforcement-warning">
                  MinTime enforcement active. Save unlocks in
                  {" "}
                  <strong>{selectedQuestionMinTimeRemainingSec}s</strong>.
                </p>
              ) : null}

              {selectedQuestionRevisitLocked ? (
                <p className="exam-hard-mode-notice">
                  Hard Mode lock active for this question. Edits and revisit are disabled.
                </p>
              ) : null}

              {isHardMode && selectedQuestionTiming?.maxTimeLocked ? (
                <p className="exam-hard-mode-notice">MaxTime reached. Question auto-locked by Hard Mode timing policy.</p>
              ) : null}
                  </>
                );
              })()}
            </article>
          ) : (
            <article className="exam-question-surface exam-phase-empty-state">
              <h2>{currentPhasePresentation.shortLabel}: {currentPhasePresentation.title}</h2>
              <p>No questions match the visibility rule for this phase. Continue when the next phase or buffer opens.</p>
            </article>
          )}
        </section>
      </div>

      {!isSubmitted ? <section className="exam-instruction-card" aria-label="Answer recovery status">
        <p role="status">{syncMessage}</p>
        <p>Local recovery: {durability === "durable" ? "Saved on this device" : durability === "saving" ? "Saving on this device" : "Memory only — pending edits may be lost on reload"}.</p>
        {recoveryNotice ? <p>{recoveryNotice}</p> : null}
        <button type="button" onClick={() => void flushAnswerBatch("reconnect")}>Confirm pending answers</button>
        {durability === "memory_only" ? <button type="button" onClick={() => void saveLocalRecovery(unsupportedRecovery)}>{unsupportedRecovery ? "Discard unsupported local recovery" : "Retry local save"}</button> : null}
        {Object.entries(rejectedAnswerMap).length ? <>
          <p>The following local changes were not accepted and will not be submitted. Newer pending changes are shown separately by the save status.</p>
          <ul>{Object.entries(rejectedAnswerMap).map(([id, rejected]) => <li key={id}>Question {sessionSnapshot.questions.find(q => q.id === id)?.number}: {rejected.reason}. Rejected response: {JSON.stringify(rejected.write.response)}</li>)}</ul>
          <label><input type="checkbox" checked={rejectionsAcknowledged} onChange={event => {rejectionsAcknowledgedRef.current = event.target.checked; setRejectionsAcknowledged(event.target.checked);}} />I understand these rejected changes will not be submitted.</label>
        </> : null}
      </section> : null}

      {submitDialogOpen ? (
        <div className="exam-submit-dialog-overlay" role="presentation" onClick={() => setSubmitDialogOpen(false)}>
          <section
            className="exam-submit-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm exam submission"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Confirm Submission</h2>
            <p>
              You are about to submit your exam. This action is immutable after server confirmation.
            </p>
            <div className="exam-submit-summary">
              <p>
                Answered:
                {" "}
                <strong>{answeredCount}</strong>
              </p>
              <p>
                Marked:
                {" "}
                <strong>{markedCount}</strong>
              </p>
              <p>
                Unanswered/Unvisited:
                {" "}
                <strong>{unansweredCount}</strong>
              </p>
              <p>
                Lifecycle state:
                {" "}
                <strong>{sessionLifecycleState}</strong>
              </p>
            </div>

            {showControlledLowAttemptSubmitWarning ? (
              <p className="exam-submit-warning">
                Controlled Mode Warning: attempted coverage is below 50%. Submission remains available after final
                confirmation.
              </p>
            ) : null}

            {unansweredCount > 0 ? (
              <label className="exam-submit-check">
                <input
                  type="checkbox"
                  checked={submitWarningAcknowledged}
                  onChange={(event) => setSubmitWarningAcknowledged(event.target.checked)}
                />
                {showControlledLowAttemptSubmitWarning
                  ? `I understand this controlled attempt is below 50% coverage and ${unansweredCount} question(s) will remain unanswered after final submission.`
                  : `I understand ${unansweredCount} question(s) will remain unanswered after final submission.`}
              </label>
            ) : null}

            {requiresEarlySubmitOverride ? (
              <label className="exam-submit-check">
                <input
                  type="checkbox"
                  checked={earlySubmitOverrideAccepted}
                  onChange={(event) => setEarlySubmitOverrideAccepted(event.target.checked)}
                />
                I confirm early submit in Controlled mode despite low discipline/phase-adherence indicators.
              </label>
            ) : null}

            {submitError ? <p className="exam-submit-warning">{submitError}</p> : null}

            <div className="exam-submit-dialog-actions">
              <button
                type="button"
                onClick={() => setSubmitDialogOpen(false)}
                disabled={submitInFlight}
              >
                Cancel
              </button>
              <button
                type="button"
                className="exam-submit-button"
                disabled={
                  submitInFlight || !recoveryApplied ||
                  (Object.keys(rejectedAnswerMap).length > 0 && !rejectionsAcknowledged) ||
                  (unansweredCount > 0 && !submitWarningAcknowledged) ||
                  (requiresEarlySubmitOverride && !earlySubmitOverrideAccepted)
                }
                onClick={() => {
                  void submitExam();
                }}
              >
                {submitInFlight ? "Submitting..." : "Confirm Final Submit"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <ScientificCalculatorModal open={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
      <ExamInsightsModal
        open={insightsOpen}
        onClose={() => setInsightsOpen(false)}
        timingStatus={selectedQuestionTimingStatus}
        timingProfileItems={timingProfileItems}
      />

    </main>
  );
}

function App() {
  usePortalTitle("exam");

  return (
    <Routes>
      <Route path="/" element={<ExamAccessRedirect reason="missing_token" />} />
      <Route path="/session/:sessionId" element={<ExamSessionPage />} />
      <Route path="*" element={<ExamAccessRedirect reason="missing_token" />} />
    </Routes>
  );
}

export default App;
