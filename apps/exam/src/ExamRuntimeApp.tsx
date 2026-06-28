import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes, useLocation, useParams } from "react-router-dom";
import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
import { buildQuestionAssetUrl, toCdnAssetUrl } from "../../../shared/services/cdnAssetDelivery";
import { ApiClientError } from "../../../shared/services/apiClient";
import { getFrontendEnvironment } from "../../../shared/services/frontendEnvironment";
import { getPortalApiClient } from "../../../shared/services/portalIntegration";
import "./App.css";

type QuestionPaletteStatus = "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked";
type ExecutionMode = "Operational" | "Controlled" | "Focused" | "Hard";
type QuestionSection = "Physics" | "Chemistry" | "Mathematics";
type QuestionType = "mcq" | "numeric" | "matrix";
type DifficultyBand = "easy" | "medium" | "hard";
type PhaseId = "phase1" | "phase2" | "phase3" | "buffer";
type SubmissionReason = "manual" | "expiry";
type SessionLifecycleState = "created" | "started" | "active" | "submitted" | "expired" | "terminated";
type ExamEntryStage = "entry_not_open" | "pre_exam_lobby" | "instructions_waiting" | "entry_closed" | "exam_active";
type PreExamCheckState = "pending" | "passed" | "failed" | "skipped";
type BrowserIntegritySeverity = "info" | "warning" | "blocking";
type BrowserIntegrityEventType =
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
  | "DEVTOOLS_SUSPECTED"
  | "NETWORK_LOSS"
  | "RECONNECTED";
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
  refreshNonce: string | null;
}

type EntryValidationReason =
  | "missing_token"
  | "expired_token"
  | "malformed_token"
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

interface QuestionOption {
  id: string;
  label: string;
  text: string;
}

interface QuestionMedia {
  type: "video" | "audio";
  title: string;
  url: string;
}

interface SessionQuestion {
  id: string;
  number: number;
  section: QuestionSection;
  type: QuestionType;
  difficulty: DifficultyBand;
  text: string;
  imageUrl?: string;
  options?: QuestionOption[];
  matrixRows?: string[];
  matrixColumns?: string[];
  media?: QuestionMedia;
}

interface PhaseConfigSnapshot {
  phase1Percent: number;
  phase2Percent: number;
  phase3Percent: number;
  bufferPercent: number;
}

interface DifficultyDistributionSnapshot {
  easyPercent: number;
  mediumPercent: number;
  hardPercent: number;
}

interface TimingProfileSnapshot {
  minTimeByDifficultySec: Record<DifficultyBand, number>;
  maxTimeByDifficultySec: Record<DifficultyBand, number>;
  finalWindowMinutes: number;
  syncEveryMs: number;
  controlledSlowdownSeconds: number;
  hardModeSequentialNavigation: boolean;
  hardModeRestrictSubmitUntilAllVisited: boolean;
}

interface SessionSnapshot {
  sessionId: string;
  questionSetVersion: string;
  subjects: QuestionSection[];
  questions: SessionQuestion[];
  hardModeRevisitRestricted: boolean;
  phaseConfigSnapshot: PhaseConfigSnapshot;
  difficultyDistribution: DifficultyDistributionSnapshot;
  timingProfile: TimingProfileSnapshot;
}

interface QuestionResponseState {
  selectedOptionId: string | null;
  numericResponse: string;
  matrixSelections: string[];
  markedForReview: boolean;
}

interface PaletteTile {
  id: string;
  number: number;
  section: QuestionSection;
  status: QuestionPaletteStatus;
  revisitLocked: boolean;
}

interface QuestionTimingState {
  timeSpentMs: number;
  minTimeSec: number;
  maxTimeSec: number;
  maxTimeLocked: boolean;
  minTimeViolationCount: number;
}

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

interface BrowserIntegrityEvent {
  eventId: string;
  eventType: BrowserIntegrityEventType;
  severity: BrowserIntegritySeverity;
  timestamp: string;
  phaseId: PhaseId | "instructions" | "lobby";
  details: string;
}

interface ExamSessionSchedule {
  earlyEntryOpensAtMs: number;
  sessionStartsAtMs: number;
  sessionEndsAtMs: number;
  durationMs: number;
  earlyEntryBufferMinutes: number;
}

interface QueuedAnswerWrite {
  clientTimestamp: number;
  questionId: string;
  selectedOption: string;
  timeSpent: number;
}

interface ExamAnswerBatchRequestBody {
  adaptivePhaseSnapshot?: AdaptivePhaseSnapshot;
  answers: QueuedAnswerWrite[];
  instituteId: string;
  millisecondsSinceLastWrite: number;
  runId: string;
  yearId: string;
}

interface ExamAnswerBatchResponse {
  code?: string;
  data?: {
    ignoredQuestionIds?: string[];
    lockedQuestionIds?: string[];
    persistedQuestionIds?: string[];
  };
}

interface SessionTokenRefreshResponse {
  code?: string;
  data?: {
    token?: string;
  };
}

interface ExamSessionEntryResponse {
  code?: string;
  data?: {
    allowed?: boolean;
    mode?: ExecutionMode;
    sessionId?: string;
    status?: SessionLifecycleState;
  };
}

interface ExamSubmitRequestBody {
  instituteId: string;
  runId: string;
  yearId: string;
  reason: SubmissionReason;
  unansweredQuestionIds: string[];
  clientSubmittedAt: string;
}

interface ExamSubmitResponse {
  code?: string;
  data?: {
    status?: SessionLifecycleState;
    submittedAt?: string;
    rawScorePercent?: number;
    accuracyPercent?: number;
    disciplineIndex?: number;
    riskState?: string;
    alreadySubmitted?: boolean;
  };
}

interface SessionRecoverySnapshot {
  sessionId: string;
  responseStateByQuestionId: Record<string, QuestionResponseState>;
  questionTimingById: Record<string, QuestionTimingState>;
  visitedQuestionIds: string[];
  hardModeLockedQuestionIds: string[];
  selectedQuestionId: string;
  remainingMs: number;
  deadlineEpochMs: number | null;
  pendingAnswerMap: Record<string, QueuedAnswerWrite>;
  lastAnswerWriteAtMs: number;
  syncCounter: number;
  savedAtIso: string;
}

type SyncState = "idle" | "syncing" | "error";

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
const STUDENT_PORTAL_FALLBACK_PATH = "/student/my-tests";
const ANSWER_BATCH_INTERVAL_MS = 5_000;
const ANSWER_BATCH_MAX_SIZE = 10;
const HEARTBEAT_INTERVAL_MS = 20_000;
const SESSION_TOKEN_REFRESH_WINDOW_SEC = 120;
const RECOVERY_DB_NAME = "parabolic-exam-runtime";
const RECOVERY_STORE_NAME = "sessionRecovery";
const RECOVERY_SAVE_INTERVAL_MS = 3_000;
const DEV_MOCK_SESSION_TOKEN = "dev";
const BROWSER_INTEGRITY_EVENT_LIMIT = 60;
const DEVTOOLS_SIZE_THRESHOLD_PX = 160;
const DEV_MOCK_SESSION_START_DELAY_MS = 60_000;
const DEV_MOCK_EARLY_ENTRY_BUFFER_MINUTES = 1;

const GAZE_CALIBRATION_POINTS = [
  { id: "center", label: "Center", x: 50, y: 50 },
  { id: "left", label: "Left", x: 12, y: 50 },
  { id: "right", label: "Right", x: 88, y: 50 },
  { id: "top", label: "Top", x: 50, y: 14 },
  { id: "bottom", label: "Bottom", x: 50, y: 86 },
] as const;

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
  Focused: {
    title: "Focused Mode",
    points: [
      "Phase transitions happen automatically at the configured phase boundaries.",
      "Phase 2 shows answered-and-marked questions only; Phase 3 shows unanswered-and-marked questions only.",
      "Questions hidden by phase rules return in the buffer phase.",
    ],
  },
  Hard: {
    title: "Hard Mode",
    points: [
      "Focused phase visibility rules are enforced.",
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
  Focused: {
    title: "Focused Execution Entry",
    summary: "Automatic phase transitions and filtered question visibility are enabled.",
    focus: "Calibrate identity checks before the focused phase engine takes over.",
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
const MOCK_INSTITUTE_ID = "inst-build-142";
const PHYSICS_IMAGE_CDN_URL = buildQuestionAssetUrl({
  instituteId: MOCK_INSTITUTE_ID,
  questionId: "exam-demo-q-2",
  version: "v1",
  kind: "questionImage",
});
const CHEMISTRY_IMAGE_CDN_URL = buildQuestionAssetUrl({
  instituteId: MOCK_INSTITUTE_ID,
  questionId: "exam-demo-q-6",
  version: "v1",
  kind: "questionImage",
});

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
  if (normalized === "controlled" || normalized === "l1") {
    return "Controlled";
  }
  if (normalized === "focused" || normalized === "l2") {
    return "Focused";
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
    const instituteId = typeof payload.instituteId === "string" ? payload.instituteId.trim() : "";
    const yearId = typeof payload.yearId === "string" ? payload.yearId.trim() : "";
    const runId = typeof payload.runId === "string" ? payload.runId.trim() : "";
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
    const refreshNonce = typeof payload.refreshNonce === "string" ? payload.refreshNonce.trim() : "";

    return {
      sub: typeof payload.sub === "string" && payload.sub.trim().length > 0 ? payload.sub.trim() : null,
      exp: typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null,
      mode:
        parseExecutionMode(payload.mode) ??
        parseExecutionMode(payload.executionMode) ??
        parseExecutionMode(payload.licenseLayer) ??
        "Operational",
      instituteId: instituteId.length > 0 ? instituteId : null,
      yearId: yearId.length > 0 ? yearId : null,
      runId: runId.length > 0 ? runId : null,
      sessionId: sessionId.length > 0 ? sessionId : null,
      refreshNonce: refreshNonce.length > 0 ? refreshNonce : null,
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
    refreshNonce: "dev-mock-refresh",
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
        refreshNonce: null,
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
        refreshNonce: null,
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
        refreshNonce: null,
      },
    };
  }

  if (claims.exp && claims.exp * 1000 <= Date.now()) {
    return {
      allowed: false,
      reason: "expired_token",
      claims,
    };
  }

  return {
    allowed: true,
    reason: null,
    claims,
  };
}

function toEpochSeconds(value: number): number {
  return Math.floor(value / 1000);
}

function parseSessionRefreshToken(responseBody: SessionTokenRefreshResponse): string | null {
  if (!responseBody || typeof responseBody !== "object") {
    return null;
  }

  const refreshedToken = responseBody.data?.token;
  if (typeof refreshedToken !== "string" || refreshedToken.trim().length === 0) {
    return null;
  }

  return refreshedToken.trim();
}

async function openRecoveryDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return null;
  }

  return new Promise<IDBDatabase | null>((resolve) => {
    const openRequest = window.indexedDB.open(RECOVERY_DB_NAME, 1);
    openRequest.onupgradeneeded = () => {
      const db = openRequest.result;
      if (!db.objectStoreNames.contains(RECOVERY_STORE_NAME)) {
        db.createObjectStore(RECOVERY_STORE_NAME, { keyPath: "sessionId" });
      }
    };
    openRequest.onerror = () => resolve(null);
    openRequest.onsuccess = () => resolve(openRequest.result);
  });
}

async function loadRecoverySnapshot(sessionId: string): Promise<SessionRecoverySnapshot | null> {
  const db = await openRecoveryDb();
  if (!db) {
    return null;
  }

  return new Promise<SessionRecoverySnapshot | null>((resolve) => {
    const transaction = db.transaction(RECOVERY_STORE_NAME, "readonly");
    const store = transaction.objectStore(RECOVERY_STORE_NAME);
    const getRequest = store.get(sessionId);

    getRequest.onerror = () => {
      db.close();
      resolve(null);
    };
    getRequest.onsuccess = () => {
      const snapshot = getRequest.result as SessionRecoverySnapshot | undefined;
      db.close();
      resolve(snapshot ?? null);
    };
  });
}

async function saveRecoverySnapshot(snapshot: SessionRecoverySnapshot): Promise<void> {
  const db = await openRecoveryDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(RECOVERY_STORE_NAME, "readwrite");
    transaction.objectStore(RECOVERY_STORE_NAME).put(snapshot);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
}

async function clearRecoverySnapshot(sessionId: string): Promise<void> {
  const db = await openRecoveryDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(RECOVERY_STORE_NAME, "readwrite");
    transaction.objectStore(RECOVERY_STORE_NAME).delete(sessionId);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
    transaction.onabort = () => {
      db.close();
      resolve();
    };
  });
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

function buildIntegrityEventId(eventType: BrowserIntegrityEventType): string {
  return `${eventType.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function buildSessionSnapshot(sessionId: string, mode: ExecutionMode): SessionSnapshot {
  const questions: SessionQuestion[] = [
    {
      id: "q-1",
      number: 1,
      section: "Physics",
      type: "mcq",
      difficulty: "easy",
      text: "A particle moves in a circle of radius r with constant speed v. What is the magnitude of centripetal acceleration?",
      options: [
        { id: "q1-a", label: "A", text: "v / r" },
        { id: "q1-b", label: "B", text: "v² / r" },
        { id: "q1-c", label: "C", text: "r / v²" },
        { id: "q1-d", label: "D", text: "v² r" },
      ],
      media: {
        type: "video",
        title: "Reference animation: circular motion setup",
        url: "https://example.com/media/circular-motion",
      },
    },
    {
      id: "q-2",
      number: 2,
      section: "Physics",
      type: "numeric",
      difficulty: "medium",
      text: "A body starts from rest and accelerates uniformly at 2 m/s² for 6 seconds. Enter displacement in meters.",
      imageUrl: PHYSICS_IMAGE_CDN_URL,
    },
    {
      id: "q-3",
      number: 3,
      section: "Physics",
      type: "matrix",
      difficulty: "hard",
      text: "Match each quantity to its SI unit symbol.",
      matrixRows: ["Force", "Power", "Frequency"],
      matrixColumns: ["N", "W", "Hz", "J"],
    },
    {
      id: "q-4",
      number: 4,
      section: "Chemistry",
      type: "mcq",
      difficulty: "easy",
      text: "Which quantum number determines the orientation of an orbital?",
      options: [
        { id: "q4-a", label: "A", text: "Principal quantum number" },
        { id: "q4-b", label: "B", text: "Azimuthal quantum number" },
        { id: "q4-c", label: "C", text: "Magnetic quantum number" },
        { id: "q4-d", label: "D", text: "Spin quantum number" },
      ],
    },
    {
      id: "q-5",
      number: 5,
      section: "Chemistry",
      type: "numeric",
      difficulty: "medium",
      text: "For pH = 3 solution, enter [H+] concentration in mol/L using decimal notation.",
    },
    {
      id: "q-6",
      number: 6,
      section: "Chemistry",
      type: "mcq",
      difficulty: "hard",
      text: "Identify the compound that exhibits hydrogen bonding in pure state.",
      options: [
        { id: "q6-a", label: "A", text: "CH4" },
        { id: "q6-b", label: "B", text: "NH3" },
        { id: "q6-c", label: "C", text: "CO2" },
        { id: "q6-d", label: "D", text: "CCl4" },
      ],
      imageUrl: CHEMISTRY_IMAGE_CDN_URL,
    },
    {
      id: "q-7",
      number: 7,
      section: "Mathematics",
      type: "mcq",
      difficulty: "easy",
      text: "If f(x) = x³, then f'(2) equals:",
      options: [
        { id: "q7-a", label: "A", text: "4" },
        { id: "q7-b", label: "B", text: "8" },
        { id: "q7-c", label: "C", text: "12" },
        { id: "q7-d", label: "D", text: "16" },
      ],
    },
    {
      id: "q-8",
      number: 8,
      section: "Mathematics",
      type: "matrix",
      difficulty: "hard",
      text: "Select all statements that are true for a 2x2 identity matrix.",
      matrixRows: ["Determinant", "Trace", "Inverse"],
      matrixColumns: ["Equals 1", "Equals 2", "Exists", "Zero"],
    },
    {
      id: "q-9",
      number: 9,
      section: "Mathematics",
      type: "numeric",
      difficulty: "medium",
      text: "Evaluate integral of 2x from x = 0 to x = 3.",
      media: {
        type: "audio",
        title: "Optional audio instruction",
        url: "https://example.com/media/math-audio",
      },
    },
  ];

  return {
    sessionId,
    questionSetVersion: "snapshot-v1",
    subjects: ["Physics", "Chemistry", "Mathematics"],
    questions,
    hardModeRevisitRestricted: mode === "Hard",
    phaseConfigSnapshot: {
      phase1Percent: 40,
      phase2Percent: 30,
      phase3Percent: 20,
      bufferPercent: 10,
    },
    difficultyDistribution: {
      easyPercent: 35,
      mediumPercent: 40,
      hardPercent: 25,
    },
    timingProfile: {
      minTimeByDifficultySec: {
        easy: 20,
        medium: 35,
        hard: 50,
      },
      maxTimeByDifficultySec: {
        easy: 180,
        medium: 240,
        hard: 300,
      },
      finalWindowMinutes: 10,
      syncEveryMs: 10_000,
      controlledSlowdownSeconds: 12,
      hardModeSequentialNavigation: true,
      hardModeRestrictSubmitUntilAllVisited: true,
    },
  };
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

function getSessionTotalDurationMs(sessionSnapshot: SessionSnapshot): number {
  const totalMaxTimeSec = sessionSnapshot.questions.reduce((sum, question) => {
    return sum + sessionSnapshot.timingProfile.maxTimeByDifficultySec[question.difficulty];
  }, 0);

  return Math.max(totalMaxTimeSec * 1000, 60_000);
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

function buildDevSessionSchedule(anchorMs: number, durationMs: number): ExamSessionSchedule {
  const sessionStartsAtMs = anchorMs + DEV_MOCK_SESSION_START_DELAY_MS;
  const sessionEndsAtMs = sessionStartsAtMs + durationMs;

  return {
    earlyEntryOpensAtMs: sessionStartsAtMs - DEV_MOCK_EARLY_ENTRY_BUFFER_MINUTES * 60_000,
    sessionStartsAtMs,
    sessionEndsAtMs,
    durationMs,
    earlyEntryBufferMinutes: DEV_MOCK_EARLY_ENTRY_BUFFER_MINUTES,
  };
}

function toTimeLabel(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
): string {
  if (question.type === "mcq") {
    return responseState.selectedOptionId ?? "UNANSWERED";
  }

  if (question.type === "numeric") {
    const normalizedValue = responseState.numericResponse.trim();
    return normalizedValue.length > 0 ? normalizedValue : "UNANSWERED";
  }

  if (responseState.matrixSelections.length === 0) {
    return "UNANSWERED";
  }

  return responseState.matrixSelections.slice().sort().join("|");
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
        <button
          type="button"
          className="exam-start-button"
          onClick={() => {
            window.location.assign(STUDENT_PORTAL_FALLBACK_PATH);
          }}
        >
          Go to Student Portal
        </button>
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
  const tokenFromQuery = useMemo(() => new URLSearchParams(location.search).get("token"), [location.search]);
  const modeFromQuery = useMemo(() => new URLSearchParams(location.search).get("mode"), [location.search]);
  const [sessionToken, setSessionToken] = useState<string | null>(() => tokenFromQuery);
  const devMockEntryEnabled = useMemo(() => isExamDevMockEntryEnabled(), []);
  const devMockSessionActive = devMockEntryEnabled && sessionToken?.trim() === DEV_MOCK_SESSION_TOKEN;
  const entryValidation = useMemo(
    () => validateSessionEntry(sessionToken, sessionId, modeFromQuery),
    [modeFromQuery, sessionId, sessionToken],
  );
  const modeInstruction = MODE_INSTRUCTIONS[entryValidation.claims.mode];
  const candidateName = entryValidation.claims.sub ?? "Student Candidate";
  const examApiClient = useMemo(() => getPortalApiClient("exam"), []);
  const scheduleAnchorMsRef = useRef(Date.now());

  const sessionSnapshot = useMemo(
    () => buildSessionSnapshot(sessionId || "runtime-session", entryValidation.claims.mode),
    [entryValidation.claims.mode, sessionId],
  );
  const templateDurationMs = useMemo(() => getSessionTotalDurationMs(sessionSnapshot), [sessionSnapshot]);
  const sessionSchedule = useMemo(
    () => buildDevSessionSchedule(scheduleAnchorMsRef.current, templateDurationMs),
    [templateDurationMs],
  );
  const totalDurationMs = sessionSchedule.durationMs;
  const totalDurationMinutesLabel = useMemo(() => toDurationMinutesLabel(totalDurationMs), [totalDurationMs]);

  const [selectedSection, setSelectedSection] = useState<QuestionSection | "All">("All");
  const [selectedQuestionId, setSelectedQuestionId] = useState(sessionSnapshot.questions[0]?.id ?? "q-1");
  const [entryStage, setEntryStage] = useState<ExamEntryStage>("pre_exam_lobby");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [instructionConfirmed, setInstructionConfirmed] = useState(false);
  const [remainingMs, setRemainingMs] = useState(totalDurationMs);
  const [deadlineEpochMs, setDeadlineEpochMs] = useState<number | null>(null);
  const [syncCounter, setSyncCounter] = useState(0);
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
  const devtoolsSuspectedRef = useRef(false);
  const fullscreenExitActiveRef = useRef(false);
  const [skippedQuestionsCount, setSkippedQuestionsCount] = useState(0);
  const [sessionLifecycleState, setSessionLifecycleState] = useState<SessionLifecycleState>("created");
  const [submittedAtIso, setSubmittedAtIso] = useState<string | null>(null);
  const [submissionReason, setSubmissionReason] = useState<SubmissionReason | null>(null);
  const [nowEpochMs, setNowEpochMs] = useState(() => Date.now());
  const [lastAnswerWriteAtMs, setLastAnswerWriteAtMs] = useState(() => Date.now() - ANSWER_BATCH_INTERVAL_MS);
  const [pendingAnswerMap, setPendingAnswerMap] = useState<Record<string, QueuedAnswerWrite>>({});
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [, setSyncMessage] = useState("No pending answer updates.");
  const [, setLastHeartbeatAtIso] = useState<string | null>(null);
  const [, setSessionTokenRefreshAtIso] = useState<string | null>(null);
  const [recoveryApplied, setRecoveryApplied] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitInFlight, setSubmitInFlight] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitWarningAcknowledged, setSubmitWarningAcknowledged] = useState(false);
  const [earlySubmitOverrideAccepted, setEarlySubmitOverrideAccepted] = useState(false);
  const [sessionConflictMessage, setSessionConflictMessage] = useState<string | null>(null);
  const [serverEntryValidationStatus, setServerEntryValidationStatus] = useState<"pending" | "valid" | "invalid">(
    entryValidation.allowed ? "pending" : "invalid",
  );
  const [controlledPhaseId, setControlledPhaseId] = useState<PhaseId>("phase1");
  const [fullscreenGateError, setFullscreenGateError] = useState<string | null>(null);
  const [browserIntegrityEvents, setBrowserIntegrityEvents] = useState<BrowserIntegrityEvent[]>([]);
  const [integrityBlockingReason, setIntegrityBlockingReason] = useState<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const [browserReadinessState, setBrowserReadinessState] = useState<PreExamCheckState>("passed");
  const [internetCheckState, setInternetCheckState] = useState<PreExamCheckState>("pending");
  const [cameraCheckState, setCameraCheckState] = useState<PreExamCheckState>("pending");
  const [faceVerificationState, setFaceVerificationState] = useState<PreExamCheckState>("pending");
  const [gazeCalibrationState, setGazeCalibrationState] = useState<PreExamCheckState>("pending");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [gazeCalibrationIndex, setGazeCalibrationIndex] = useState(0);
  const [gazeCalibrationOverlayOpen, setGazeCalibrationOverlayOpen] = useState(false);

  const isOperationalMode = entryValidation.claims.mode === "Operational";
  const isControlledMode = entryValidation.claims.mode === "Controlled";
  const isFocusedMode = entryValidation.claims.mode === "Focused";
  const isHardMode = entryValidation.claims.mode === "Hard";
  const faceIdentityGazeGuardEnabled = useMemo(() => {
    const value = new URLSearchParams(location.search).get("faceGaze");
    return value?.toLowerCase() !== "off";
  }, [location.search]);
  const hardModeMinimalUI = isHardMode;
  const phaseVisibilityEnforced = isFocusedMode || isHardMode;
  const questionTimingEnforced = isHardMode;
  const isSubmitted = sessionLifecycleState === "submitted";
  const tokenExpiryEpochSec = entryValidation.claims.exp;
  const instituteId = entryValidation.claims.instituteId ?? "inst-build-135";
  const yearId = entryValidation.claims.yearId ?? "year-build-135";
  const runId = entryValidation.claims.runId ?? "run-build-135";
  const tokenSessionId = entryValidation.claims.sessionId;
  const effectiveSessionId = tokenSessionId && tokenSessionId.length > 0 ? tokenSessionId : sessionId;
  const activeSessionGuardKey = `exam-active-session::${entryValidation.claims.sub ?? "anonymous"}::${runId}`;
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

  useEffect(() => {
    setSessionToken(tokenFromQuery);
  }, [tokenFromQuery]);

  useEffect(() => {
    if (!entryValidation.allowed || !sessionToken) {
      setServerEntryValidationStatus("invalid");
      return;
    }

    if (devMockEntryEnabled && sessionToken.trim() === DEV_MOCK_SESSION_TOKEN) {
      // TODO(EXP): remove this dev-only mock entry after exam P0/P1/P2 completion.
      setServerEntryValidationStatus("valid");
      return;
    }

    const controller = new AbortController();
    const endpointPath = `/exam/session/${encodeURIComponent(sessionId)}/entry`;

    setServerEntryValidationStatus("pending");
    void examApiClient
      .post<ExamSessionEntryResponse, { token: string }>(endpointPath, {
        body: {
          token: sessionToken,
        },
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
        signal: controller.signal,
        skipAuth: true,
      })
      .then((responseBody) => {
        const serverAllowed =
          responseBody.data?.allowed === true &&
          responseBody.data.sessionId === effectiveSessionId;

        setServerEntryValidationStatus(serverAllowed ? "valid" : "invalid");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setServerEntryValidationStatus("invalid");
      });

    return () => controller.abort();
  }, [
    devMockEntryEnabled,
    effectiveSessionId,
    entryValidation.allowed,
    examApiClient,
    sessionId,
    sessionToken,
  ]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted) {
      return;
    }

    const tickInterval = window.setInterval(() => {
      setNowEpochMs(Date.now());
      setRemainingMs((current) => Math.max(0, current - TICK_INTERVAL_MS));
      setQuestionTimingById((current) => {
        const currentTiming = current[selectedQuestionId];
        if (!currentTiming || currentTiming.maxTimeLocked) {
          return current;
        }

        const nextTimeSpentMs = currentTiming.timeSpentMs + TICK_INTERVAL_MS;
        const reachedMaxTime = isHardMode && nextTimeSpentMs >= currentTiming.maxTimeSec * 1000;
        if (!reachedMaxTime && nextTimeSpentMs === currentTiming.timeSpentMs) {
          return current;
        }

        return {
          ...current,
          [selectedQuestionId]: {
            ...currentTiming,
            timeSpentMs: nextTimeSpentMs,
            maxTimeLocked: reachedMaxTime ? true : currentTiming.maxTimeLocked,
          },
        };
      });
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(tickInterval);
  }, [instructionConfirmed, isSubmitted, isHardMode, selectedQuestionId]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted || !deadlineEpochMs) {
      return;
    }

    const syncInterval = window.setInterval(() => {
      const authoritativeRemaining = Math.max(0, deadlineEpochMs - Date.now());
      setNowEpochMs(Date.now());
      setRemainingMs(authoritativeRemaining);
      setSyncCounter((current) => current + 1);
    }, sessionSnapshot.timingProfile.syncEveryMs);

    return () => window.clearInterval(syncInterval);
  }, [deadlineEpochMs, instructionConfirmed, isSubmitted, sessionSnapshot.timingProfile.syncEveryMs]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted || remainingMs > 0) {
      return;
    }

    const submitTimeout = window.setTimeout(() => {
      setSessionLifecycleState("expired");
    }, 0);

    return () => window.clearTimeout(submitTimeout);
  }, [instructionConfirmed, isSubmitted, remainingMs]);

  const navigateToQuestion = (questionId: string) => {
    setVisitedQuestionIds((current) => {
      const next = new Set(current);
      next.add(questionId);
      return next;
    });
    setSelectedQuestionId(questionId);
  };

  const queueAnswerWrite = useCallback((questionId: string, nextResponseState: QuestionResponseState): void => {
    if (!entryValidation.allowed) {
      return;
    }

    const question = sessionSnapshot.questions.find((candidateQuestion) => candidateQuestion.id === questionId);
    if (!question) {
      return;
    }

    const selectedOption = serializeResponseForPersistence(question, nextResponseState);
    const questionTimeSpentMs = questionTimingById[questionId]?.timeSpentMs ?? 0;
    const queuedWrite: QueuedAnswerWrite = {
      clientTimestamp: Date.now(),
      questionId,
      selectedOption,
      timeSpent: Math.max(0, Math.floor(questionTimeSpentMs / 1000)),
    };

    setPendingAnswerMap((current) => {
      const nextPendingMap = {
        ...current,
        [questionId]: queuedWrite,
      };
      setSyncMessage(`Pending answer updates: ${Object.keys(nextPendingMap).length}`);
      return nextPendingMap;
    });
  }, [entryValidation.allowed, questionTimingById, sessionSnapshot.questions]);

  const updateQuestionResponseState = useCallback((
    questionId: string,
    updater: (previous: QuestionResponseState) => QuestionResponseState,
  ): void => {
    setResponseStateByQuestionId((current) => {
      const currentState = current[questionId] ?? {
        selectedOptionId: null,
        numericResponse: "",
        matrixSelections: [],
        markedForReview: false,
      };
      const nextState = updater(currentState);
      queueAnswerWrite(questionId, nextState);
      return {
        ...current,
        [questionId]: nextState,
      };
    });
  }, [queueAnswerWrite]);

  const flushAnswerBatch = useCallback(async (reason: "interval" | "heartbeat" | "submission"): Promise<boolean> => {
    if (!entryValidation.allowed || !instructionConfirmed || isSubmitted && reason !== "submission") {
      return false;
    }

    if (!sessionToken || pendingAnswers.length === 0) {
      if (reason === "heartbeat") {
        setLastHeartbeatAtIso(new Date().toISOString());
      }
      return true;
    }

    const nowMs = Date.now();
    const millisecondsSinceLastWrite = nowMs - lastAnswerWriteAtMs;
    if (millisecondsSinceLastWrite < ANSWER_BATCH_INTERVAL_MS && reason !== "submission") {
      return false;
    }

    const answersToPersist = pendingAnswers.slice(0, ANSWER_BATCH_MAX_SIZE);
    if (answersToPersist.length === 0) {
      return true;
    }

    const endpointPath = `/exam/session/${encodeURIComponent(effectiveSessionId)}/answers`;
    const requestBody: ExamAnswerBatchRequestBody = {
      adaptivePhaseSnapshot: adaptivePhaseSnapshotRef.current ?? undefined,
      answers: answersToPersist,
      instituteId,
      millisecondsSinceLastWrite,
      runId,
      yearId,
    };

    setSyncState("syncing");
    setSyncMessage(`Syncing ${answersToPersist.length} answer update(s)...`);

    try {
      const responseBody = await examApiClient.post<ExamAnswerBatchResponse, ExamAnswerBatchRequestBody>(
        endpointPath,
        {
          body: requestBody,
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
          skipAuth: true,
        },
      );
      const persistedQuestionIds = responseBody.data?.persistedQuestionIds ?? answersToPersist.map((answer) => answer.questionId);
      const ignoredQuestionIds = responseBody.data?.ignoredQuestionIds ?? [];
      const settledQuestionIds = new Set([...persistedQuestionIds, ...ignoredQuestionIds]);
      const lockedQuestionIds = responseBody.data?.lockedQuestionIds ?? [];

      if (lockedQuestionIds.length > 0) {
        setHardModeLockedQuestionIds((current) => {
          const next = new Set(current);
          lockedQuestionIds.forEach((questionId) => next.add(questionId));
          return next;
        });
      }

      setPendingAnswerMap((current) => {
        const next = {...current};
        settledQuestionIds.forEach((questionId) => {
          delete next[questionId];
        });
        const remainingPending = Object.keys(next).length;
        setSyncMessage(
          remainingPending > 0 ?
            `Synced ${persistedQuestionIds.length} answer(s). Pending: ${remainingPending}` :
            `Synced ${persistedQuestionIds.length} answer(s).`,
        );
        return next;
      });
      setLastAnswerWriteAtMs(nowMs);
      setSyncState("idle");

      return true;
    } catch (error) {
      setSyncState("error");
      if (error instanceof ApiClientError) {
        setSyncMessage(`Answer sync failed with status ${error.status}`);
      } else {
        setSyncMessage(error instanceof Error ? error.message : "Answer sync failed.");
      }
      return false;
    }
  }, [
    examApiClient,
    effectiveSessionId,
    entryValidation.allowed,
    instituteId,
    instructionConfirmed,
    isSubmitted,
    lastAnswerWriteAtMs,
    pendingAnswers,
    runId,
    sessionToken,
    yearId,
  ]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted) {
      return;
    }

    const batchInterval = window.setInterval(() => {
      void flushAnswerBatch("interval");
    }, ANSWER_BATCH_INTERVAL_MS);

    return () => window.clearInterval(batchInterval);
  }, [flushAnswerBatch, instructionConfirmed, isSubmitted]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted || pendingAnswers.length < ANSWER_BATCH_MAX_SIZE) {
      return;
    }

    void flushAnswerBatch("interval");
  }, [flushAnswerBatch, instructionConfirmed, isSubmitted, pendingAnswers.length]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted) {
      return;
    }

    const heartbeatInterval = window.setInterval(() => {
      setLastHeartbeatAtIso(new Date().toISOString());
      void flushAnswerBatch("heartbeat");
    }, HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(heartbeatInterval);
  }, [flushAnswerBatch, instructionConfirmed, isSubmitted]);

  useEffect(() => {
    if (!instructionConfirmed || !sessionToken || !tokenExpiryEpochSec || isSubmitted) {
      return;
    }

    const refreshCheckInterval = window.setInterval(() => {
      const secondsUntilExpiry = tokenExpiryEpochSec - toEpochSeconds(Date.now());
      if (secondsUntilExpiry > SESSION_TOKEN_REFRESH_WINDOW_SEC) {
        return;
      }

      const refreshEndpointPath = `/exam/session/${encodeURIComponent(effectiveSessionId)}/token/refresh`;
      void examApiClient
        .post<SessionTokenRefreshResponse, {
          instituteId: string;
          refreshNonce: string | null;
          runId: string;
          sessionId: string;
          yearId: string;
        }>(refreshEndpointPath, {
          body: {
            instituteId,
            refreshNonce: entryValidation.claims.refreshNonce,
            runId,
            sessionId: effectiveSessionId,
            yearId,
          },
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
          skipAuth: true,
        })
        .then((responseBody) => {
          const refreshedToken = parseSessionRefreshToken(responseBody);
          if (!refreshedToken) {
            throw new Error("Token refresh response was missing a token.");
          }

          setSessionToken(refreshedToken);
          setSessionTokenRefreshAtIso(new Date().toISOString());
          setSyncMessage("Session token refreshed.");
        })
        .catch((error) => {
          setSyncState("error");
          if (error instanceof ApiClientError) {
            setSyncMessage(`Token refresh failed with status ${error.status}`);
            return;
          }
          setSyncMessage(error instanceof Error ? error.message : "Session token refresh failed.");
        });
    }, 30_000);

    return () => window.clearInterval(refreshCheckInterval);
  }, [
    examApiClient,
    effectiveSessionId,
    entryValidation.claims.refreshNonce,
    instituteId,
    instructionConfirmed,
    isSubmitted,
    runId,
    sessionToken,
    tokenExpiryEpochSec,
    yearId,
  ]);

  useEffect(() => {
    if (!instructionConfirmed || sessionLifecycleState === "submitted" || sessionLifecycleState === "terminated") {
      return;
    }

    if (sessionLifecycleState !== "created" && sessionLifecycleState !== "started") {
      return;
    }

    setSessionLifecycleState("active");
  }, [instructionConfirmed, sessionLifecycleState]);

  useEffect(() => {
    if (sessionLifecycleState === "active") {
      window.sessionStorage.setItem(activeSessionGuardKey, effectiveSessionId);
      return;
    }

    if (sessionLifecycleState === "submitted" || sessionLifecycleState === "terminated") {
      window.sessionStorage.removeItem(activeSessionGuardKey);
    }
  }, [activeSessionGuardKey, effectiveSessionId, sessionLifecycleState]);

  useEffect(() => {
    if (!instructionConfirmed || !entryValidation.allowed || recoveryApplied || isSubmitted) {
      return;
    }

    void loadRecoverySnapshot(effectiveSessionId).then((snapshot) => {
      if (!snapshot) {
        return;
      }

      setResponseStateByQuestionId(snapshot.responseStateByQuestionId);
      setQuestionTimingById(snapshot.questionTimingById);
      setVisitedQuestionIds(new Set(snapshot.visitedQuestionIds));
      setHardModeLockedQuestionIds(new Set(snapshot.hardModeLockedQuestionIds));
      setSelectedQuestionId(snapshot.selectedQuestionId);
      setRemainingMs(snapshot.remainingMs);
      setDeadlineEpochMs(snapshot.deadlineEpochMs);
      setPendingAnswerMap(snapshot.pendingAnswerMap);
      setLastAnswerWriteAtMs(snapshot.lastAnswerWriteAtMs);
      setSyncCounter(snapshot.syncCounter);
      setSyncMessage("Recovered session state from local IndexedDB snapshot.");
      setRecoveryApplied(true);
    });
  }, [effectiveSessionId, entryValidation.allowed, instructionConfirmed, isSubmitted, recoveryApplied]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted) {
      return;
    }

    const saveInterval = window.setInterval(() => {
      const snapshot: SessionRecoverySnapshot = {
        sessionId: effectiveSessionId,
        responseStateByQuestionId,
        questionTimingById,
        visitedQuestionIds: Array.from(visitedQuestionIds),
        hardModeLockedQuestionIds: Array.from(hardModeLockedQuestionIds),
        selectedQuestionId,
        remainingMs,
        deadlineEpochMs,
        pendingAnswerMap,
        lastAnswerWriteAtMs,
        syncCounter,
        savedAtIso: new Date().toISOString(),
      };
      void saveRecoverySnapshot(snapshot);
    }, RECOVERY_SAVE_INTERVAL_MS);

    return () => window.clearInterval(saveInterval);
  }, [
    deadlineEpochMs,
    effectiveSessionId,
    hardModeLockedQuestionIds,
    instructionConfirmed,
    isSubmitted,
    lastAnswerWriteAtMs,
    pendingAnswerMap,
    questionTimingById,
    remainingMs,
    responseStateByQuestionId,
    selectedQuestionId,
    syncCounter,
    visitedQuestionIds,
  ]);

  useEffect(() => {
    if (!instructionConfirmed || isSubmitted) {
      return;
    }

    const handleOnline = () => {
      setSyncMessage("Connection restored. Syncing pending responses.");
      void flushAnswerBatch("submission");
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [flushAnswerBatch, instructionConfirmed, isSubmitted]);

  useEffect(() => {
    if (!isSubmitted) {
      return;
    }

    setSessionLifecycleState("submitted");
    void clearRecoverySnapshot(effectiveSessionId);
  }, [effectiveSessionId, isSubmitted]);

  const submitSession = useCallback(async (reason: SubmissionReason, unansweredIds: string[]): Promise<void> => {
    if (!entryValidation.allowed || !sessionToken) {
      throw new Error("Missing valid session token for submission.");
    }

    setSubmitInFlight(true);
    setSubmitError(null);

    try {
      const answeredPersisted = await flushAnswerBatch("submission");
      if (!answeredPersisted) {
        throw new Error("Unable to flush pending answers before submission.");
      }

      const endpointPath = `/exam/session/${encodeURIComponent(effectiveSessionId)}/submit`;
      const requestBody: ExamSubmitRequestBody = {
        instituteId,
        runId,
        yearId,
        reason,
        unansweredQuestionIds: unansweredIds,
        clientSubmittedAt: new Date().toISOString(),
      };

      const responseBody = await examApiClient.post<ExamSubmitResponse, ExamSubmitRequestBody>(
        endpointPath,
        {
          body: requestBody,
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
          skipAuth: true,
        },
      );
      setSubmissionReason(reason);
      setSubmittedAtIso(responseBody.data?.submittedAt ?? new Date().toISOString());
      setSessionLifecycleState("submitted");
      setSubmitDialogOpen(false);
      setSubmitWarningAcknowledged(false);
      setEarlySubmitOverrideAccepted(false);
      setSyncMessage(responseBody.data?.alreadySubmitted ? "Submission already finalized on server." : "Submission completed.");
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw new Error(`Submission failed with status ${error.status}`);
      }
      throw error;
    } finally {
      setSubmitInFlight(false);
    }
  }, [
    examApiClient,
    effectiveSessionId,
    entryValidation.allowed,
    flushAnswerBatch,
    instituteId,
    runId,
    sessionToken,
    yearId,
  ]);

  useEffect(() => {
    if (sessionLifecycleState !== "expired" || isSubmitted || submitInFlight) {
      return;
    }

    void submitSession("expiry", unansweredQuestionIdsForSubmission)
      .catch((error) => {
        setSubmitError(error instanceof Error ? error.message : "Auto-submit failed.");
        setSessionLifecycleState("terminated");
      });
  }, [isSubmitted, sessionLifecycleState, submitInFlight, submitSession, unansweredQuestionIdsForSubmission]);

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
  const getIntegritySeverity = useCallback((eventType: BrowserIntegrityEventType): BrowserIntegritySeverity => {
    if (eventType === "FULLSCREEN_ENTERED" || eventType === "FULLSCREEN_REENTERED" || eventType === "WINDOW_FOCUS_RETURNED" || eventType === "RECONNECTED") {
      return "info";
    }

    return "blocking";
  }, []);
  const recordBrowserIntegrityEvent = useCallback((
    eventType: BrowserIntegrityEventType,
    details: string,
    severityOverride?: BrowserIntegritySeverity,
  ) => {
    const severity = severityOverride ?? getIntegritySeverity(eventType);
    const eventRecord: BrowserIntegrityEvent = {
      eventId: buildIntegrityEventId(eventType),
      eventType,
      severity,
      timestamp: new Date().toISOString(),
      phaseId: instructionConfirmed ? currentExamPhase : entryStage === "pre_exam_lobby" ? "lobby" : "instructions",
      details,
    };

    setBrowserIntegrityEvents((current) => [eventRecord, ...current].slice(0, BROWSER_INTEGRITY_EVENT_LIMIT));

    if (severity === "blocking") {
      setIntegrityBlockingReason(details);
    }
  }, [currentExamPhase, entryStage, getIntegritySeverity, instructionConfirmed]);
  const requestExamFullscreen = useCallback(async (): Promise<boolean> => {
    if (isBrowserFullscreenActive()) {
      return true;
    }

    try {
      await document.documentElement.requestFullscreen();
      fullscreenExitActiveRef.current = false;
      setIntegrityBlockingReason(null);
      recordBrowserIntegrityEvent("FULLSCREEN_ENTERED", "Fullscreen entered for secure exam entry.", "info");
      return true;
    } catch {
      recordBrowserIntegrityEvent("FULLSCREEN_REQUEST_FAILED", "Browser rejected fullscreen entry from exam start.", "warning");
      return false;
    }
  }, [recordBrowserIntegrityEvent]);
  const startInternetCheck = useCallback(() => {
    if (!navigator.onLine) {
      setInternetCheckState("failed");
      return;
    }

    setInternetCheckState("passed");
  }, []);
  const startCameraCheck = useCallback(async () => {
    if (!faceIdentityGazeGuardEnabled) {
      setCameraCheckState("skipped");
      setFaceVerificationState("skipped");
      setGazeCalibrationState("skipped");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 540 },
        },
        audio: false,
      });
      setCameraStream(stream);
      setCameraCheckState("passed");
    } catch {
      setCameraCheckState("failed");
    }
  }, [faceIdentityGazeGuardEnabled]);
  const runFaceVerificationCheck = useCallback(() => {
    if (!faceIdentityGazeGuardEnabled) {
      setFaceVerificationState("skipped");
      return;
    }

    if (cameraCheckState !== "passed") {
      setFaceVerificationState("failed");
      return;
    }

    setFaceVerificationState("passed");
  }, [cameraCheckState, faceIdentityGazeGuardEnabled]);
  const captureGazeCalibrationPoint = useCallback(() => {
    if (!faceIdentityGazeGuardEnabled) {
      setGazeCalibrationState("skipped");
      return;
    }

    if (faceVerificationState !== "passed") {
      setGazeCalibrationState("failed");
      return;
    }

    setGazeCalibrationIndex((current) => {
      const next = current + 1;
      if (next >= GAZE_CALIBRATION_POINTS.length) {
        setGazeCalibrationState("passed");
        setGazeCalibrationOverlayOpen(false);
        return current;
      }

      setGazeCalibrationState("pending");
      return next;
    });
  }, [faceIdentityGazeGuardEnabled, faceVerificationState]);
  const beginExamSession = useCallback(() => {
    const activeSessionId = window.sessionStorage.getItem(activeSessionGuardKey);
    if (activeSessionId && activeSessionId !== effectiveSessionId) {
      setSessionConflictMessage(
        "Another active session is already registered for this run in this browser profile. Resume that session or submit it before starting a new one.",
      );
      return false;
    }

    const remainingWindowMs = Math.max(0, sessionSchedule.sessionEndsAtMs - Date.now());
    if (remainingWindowMs <= 0) {
      setEntryStage("entry_closed");
      return false;
    }

    setDeadlineEpochMs(sessionSchedule.sessionEndsAtMs);
    setRemainingMs(remainingWindowMs);
    setLastAnswerWriteAtMs(Date.now() - ANSWER_BATCH_INTERVAL_MS);
    setPendingAnswerMap({});
    setSyncState("idle");
    setSyncMessage("No pending answer updates.");
    setSessionConflictMessage(null);
    setFullscreenGateError(null);
    setSessionLifecycleState("started");
    setRecoveryApplied(false);
    setInstructionConfirmed(true);
    setEntryStage("exam_active");
    return true;
  }, [activeSessionGuardKey, effectiveSessionId, sessionSchedule.sessionEndsAtMs]);
  const preExamChecksPassed =
    browserReadinessState === "passed" &&
    internetCheckState === "passed" &&
    (faceIdentityGazeGuardEnabled ?
      cameraCheckState === "passed" && faceVerificationState === "passed" && gazeCalibrationState === "passed" :
      cameraCheckState === "skipped" && faceVerificationState === "skipped" && gazeCalibrationState === "skipped");
  const continueToInstructions = useCallback(() => {
    void (async () => {
      if (!preExamChecksPassed) {
        return;
      }

      if (!devMockSessionActive && Date.now() >= sessionSchedule.sessionStartsAtMs) {
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
  }, [devMockSessionActive, preExamChecksPassed, requestExamFullscreen, sessionSchedule.sessionStartsAtMs]);
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
  }, [isHardMode, isSubmitted, questionTimingById, selectedQuestion, selectedQuestionIndex, sessionSnapshot.questions]);

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
    sessionSnapshot.phaseConfigSnapshot,
    sessionSnapshot.questions,
    skippedQuestionsCount,
  ]);

  useEffect(() => {
    adaptivePhaseSnapshotRef.current = adaptivePhaseSnapshot;
  }, [adaptivePhaseSnapshot]);

  useEffect(() => {
    if (!faceIdentityGazeGuardEnabled) {
      setCameraCheckState("skipped");
      setFaceVerificationState("skipped");
      setGazeCalibrationState("skipped");
    }
  }, [faceIdentityGazeGuardEnabled]);

  useEffect(() => {
    if (!cameraVideoRef.current || !cameraStream) {
      return;
    }

    cameraVideoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  useEffect(() => {
    if (instructionConfirmed || isSubmitted) {
      return;
    }

    const preExamClockInterval = window.setInterval(() => {
      setNowEpochMs(Date.now());
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(preExamClockInterval);
  }, [instructionConfirmed, isSubmitted]);

  useEffect(() => {
    if (instructionConfirmed || isSubmitted) {
      return;
    }

    if (nowEpochMs < sessionSchedule.earlyEntryOpensAtMs) {
      setEntryStage("entry_not_open");
      return;
    }

    if (entryStage === "entry_not_open" && nowEpochMs >= sessionSchedule.earlyEntryOpensAtMs && nowEpochMs < sessionSchedule.sessionStartsAtMs) {
      setEntryStage("pre_exam_lobby");
      return;
    }

    if (!devMockSessionActive && entryStage === "pre_exam_lobby" && nowEpochMs >= sessionSchedule.sessionStartsAtMs) {
      setEntryStage("entry_closed");
      return;
    }

    if (entryStage !== "instructions_waiting" || nowEpochMs < sessionSchedule.sessionStartsAtMs) {
      return;
    }

    if (!declarationAccepted) {
      if (devMockSessionActive) {
        return;
      }
      setEntryStage("entry_closed");
      return;
    }

    if (!isBrowserFullscreenActive()) {
      setIntegrityBlockingReason("Fullscreen is required at official exam start. Re-enter fullscreen to open the question paper.");
      return;
    }

    beginExamSession();
  }, [
    beginExamSession,
    declarationAccepted,
    devMockSessionActive,
    entryStage,
    instructionConfirmed,
    isSubmitted,
    nowEpochMs,
    sessionSchedule.earlyEntryOpensAtMs,
    sessionSchedule.sessionStartsAtMs,
  ]);

  useEffect(() => {
    if ((!instructionConfirmed && entryStage !== "instructions_waiting") || isSubmitted) {
      return;
    }

    const handleFullscreenChange = () => {
      if (isBrowserFullscreenActive()) {
        if (fullscreenExitActiveRef.current) {
          recordBrowserIntegrityEvent("FULLSCREEN_REENTERED", "Student returned to fullscreen.", "info");
        }
        fullscreenExitActiveRef.current = false;
        setIntegrityBlockingReason(null);
        return;
      }

      fullscreenExitActiveRef.current = true;
      recordBrowserIntegrityEvent("FULLSCREEN_EXIT", "Fullscreen was exited during the exam.");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        recordBrowserIntegrityEvent("TAB_SWITCH", "Exam tab became hidden.");
      }
    };

    const handleWindowBlur = () => {
      recordBrowserIntegrityEvent("WINDOW_BLUR", "Exam window lost focus.");
    };

    const handleWindowFocus = () => {
      recordBrowserIntegrityEvent("WINDOW_FOCUS_RETURNED", "Exam window focus returned.", "info");
    };

    const blockClipboardEvent = (event: ClipboardEvent) => {
      event.preventDefault();
      const eventType = event.type === "copy" ? "COPY_BLOCKED" : event.type === "paste" ? "PASTE_BLOCKED" : "CUT_BLOCKED";
      recordBrowserIntegrityEvent(eventType, `${event.type} action was blocked during the exam.`);
    };

    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      recordBrowserIntegrityEvent("CONTEXT_MENU_BLOCKED", "Context menu was blocked during the exam.");
    };

    const blockKeyboardShortcut = (event: KeyboardEvent) => {
      if (!isRestrictedKeyboardEvent(event)) {
        return;
      }

      event.preventDefault();
      recordBrowserIntegrityEvent("SHORTCUT_BLOCKED", `Restricted keyboard shortcut was blocked: ${event.key}.`);
    };

    const handleOffline = () => {
      recordBrowserIntegrityEvent("NETWORK_LOSS", "Browser reported offline state.");
    };

    const handleOnline = () => {
      recordBrowserIntegrityEvent("RECONNECTED", "Browser reported online state.", "info");
    };

    const devtoolsCheckInterval = window.setInterval(() => {
      const widthDelta = Math.abs(window.outerWidth - window.innerWidth);
      const heightDelta = Math.abs(window.outerHeight - window.innerHeight);
      const devtoolsSuspected =
        widthDelta > DEVTOOLS_SIZE_THRESHOLD_PX ||
        heightDelta > DEVTOOLS_SIZE_THRESHOLD_PX;

      if (devtoolsSuspected && !devtoolsSuspectedRef.current) {
        devtoolsSuspectedRef.current = true;
        recordBrowserIntegrityEvent("DEVTOOLS_SUSPECTED", "DevTools-like viewport difference was detected.");
      }

      if (!devtoolsSuspected) {
        devtoolsSuspectedRef.current = false;
      }
    }, 1_500);

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
      window.clearInterval(devtoolsCheckInterval);
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
  }, [entryStage, instructionConfirmed, isSubmitted, recordBrowserIntegrityEvent]);

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
  const saveDisabled = selectedQuestionRevisitLocked || saveBlockedByTiming || slowdownActive || isSubmitted || sessionLocked;
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
  const syncSummaryLabel = syncState === "error"
    ? "Sync issue"
    : pendingAnswers.length > 0
      ? `${pendingAnswers.length} pending`
      : "Synced";
  const modeTierLabel = isOperationalMode
    ? "L0 Operational"
    : isControlledMode
      ? "L1 Controlled"
      : isFocusedMode
        ? "L2 Focused"
        : "L2 Hard";
  const activeSectionLabel = selectedSection === "All" ? "All Subjects" : selectedSection;
  const modeStudentExplanation = isOperationalMode
    ? "Standard exam delivery. You can navigate freely and submit anytime."
    : isControlledMode
      ? "Phase guidance is active. You control transitions, and expiry starts overstay instead of forcing movement."
      : isFocusedMode
        ? "Focused execution is active. Phase timing and phase visibility are enforced automatically."
        : "Hard execution is active. Focused phase rules plus minimum thinking time and progression locks are enforced.";
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
      : isFocusedMode
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
  const browserIntegrityAlertCount = browserIntegrityEvents.filter((event) => event.severity !== "info").length;
  const sessionStartCountdownMs = Math.max(0, sessionSchedule.sessionStartsAtMs - nowEpochMs);
  const entryOpenCountdownMs = Math.max(0, sessionSchedule.earlyEntryOpensAtMs - nowEpochMs);
  const currentGazeCalibrationPoint = GAZE_CALIBRATION_POINTS[gazeCalibrationIndex] ?? GAZE_CALIBRATION_POINTS[0];
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
    {
      id: "face",
      label: "Face Verification",
      state: faceVerificationState,
      helper: "Keep your face centered in the guide with steady lighting.",
    },
    {
      id: "gaze",
      label: "Gaze Calibration",
      state: gazeCalibrationState,
      helper: "Look at each full-screen marker until it is captured.",
    },
  ];
  const completedPreExamCheckCount = preExamChecklist.filter((item) => item.state === "passed" || item.state === "skipped").length;
  const preExamProgressPercent = Math.round((completedPreExamCheckCount / preExamChecklist.length) * 100);
  const lobbyModeDetail = LOBBY_MODE_DETAILS[entryValidation.claims.mode];
  const lobbyModeClassName = isOperationalMode
    ? "operational"
    : isControlledMode
      ? "controlled"
      : isFocusedMode
        ? "focused"
        : "hard";
  const faceStatusState = !faceIdentityGazeGuardEnabled
    ? "skipped"
    : cameraCheckState === "failed"
      ? "failed"
      : faceVerificationState === "passed"
        ? "passed"
        : cameraCheckState === "passed"
          ? "ready"
          : "pending";
  const faceStatusLabel = faceStatusState === "passed"
    ? "Face Verified"
    : faceStatusState === "ready"
      ? "Ready to Verify"
      : faceStatusState === "failed"
        ? "Face Not Verified"
        : faceStatusState === "skipped"
          ? "Face Check Skipped"
          : "Face Not Verified";
  const faceStatusHint = faceStatusState === "passed"
    ? "Identity readiness confirmed. Continue with gaze calibration."
    : faceStatusState === "ready"
      ? "Camera is active. Select Verify Face to complete identity readiness."
      : faceStatusState === "failed"
        ? "Camera access failed or identity readiness could not complete. Re-enable camera and try again."
        : faceStatusState === "skipped"
          ? "This assignment policy does not require face verification."
          : "Enable camera first so the face check can run.";
  const lobbyNextStepState = preExamChecksPassed
    ? "complete"
    : browserReadinessState === "failed" || internetCheckState === "failed" || cameraCheckState === "failed" || faceVerificationState === "failed" || gazeCalibrationState === "failed"
      ? "attention"
      : "active";
  const lobbyNextStepTitle = preExamChecksPassed
    ? "Entry checks complete"
    : browserReadinessState === "failed"
      ? "Browser needs attention"
      : internetCheckState !== "passed"
        ? "Check internet connection"
        : faceIdentityGazeGuardEnabled && cameraCheckState !== "passed"
          ? "Enable camera to continue"
          : faceIdentityGazeGuardEnabled && faceVerificationState !== "passed"
            ? "Now verify your face"
            : faceIdentityGazeGuardEnabled && gazeCalibrationState !== "passed"
              ? "Complete gaze calibration"
              : "Review readiness checks";
  const lobbyNextStepDetail = preExamChecksPassed
    ? "You can continue to instructions when you are ready."
    : browserReadinessState === "failed"
      ? "Return to the exam tab and recheck browser readiness."
      : internetCheckState !== "passed"
        ? "Select Check Internet. If it fails, reconnect before starting."
        : faceIdentityGazeGuardEnabled && cameraCheckState !== "passed"
          ? "Allow browser camera access, then center your face in the guide."
          : faceIdentityGazeGuardEnabled && faceVerificationState !== "passed"
            ? "Keep your face steady and select Verify Face."
            : faceIdentityGazeGuardEnabled && gazeCalibrationState !== "passed"
              ? "Open the calibration screen and capture every marker."
              : "Confirm the skipped lab checks and proceed to instructions.";
  const lobbyModeStudentNote = isControlledMode
    ? "Controlled mode shows phase goals and overstay status during the exam."
    : isFocusedMode
      ? "Focused mode may show only the questions available in the current phase."
      : isHardMode
        ? "Hard mode applies navigation locks and minimum thinking-time rules."
        : "Operational mode keeps navigation open while integrity events are captured silently.";
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

  if (!entryValidation.allowed) {
    return <ExamAccessRedirect reason={entryValidation.reason} />;
  }

  if (serverEntryValidationStatus === "pending") {
    return <ExamServerEntryValidationLoading />;
  }

  if (serverEntryValidationStatus === "invalid") {
    return <ExamAccessRedirect reason="server_validation_failed" />;
  }

  if (entryStage === "entry_not_open") {
    return (
      <main className="exam-instruction-shell">
        <section className="exam-instruction-card">
          <p className="exam-instruction-eyebrow">Exam Entry Lobby</p>
          <h1>Entry Window Not Open</h1>
          <p>
            Student entry opens at
            {" "}
            <strong>{toTimeLabel(sessionSchedule.earlyEntryOpensAtMs)}</strong>
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
        <section className="exam-instruction-card">
          <p className="exam-instruction-eyebrow">Exam Entry Closed</p>
          <h1>Entry Window Closed</h1>
          <p>
            This exam started at
            {" "}
            <strong>{toTimeLabel(sessionSchedule.sessionStartsAtMs)}</strong>
            . New entry is not allowed after the official start time.
          </p>
          <button
            type="button"
            className="exam-start-button"
            onClick={() => window.location.assign(STUDENT_PORTAL_FALLBACK_PATH)}
          >
            Return to Student Portal
          </button>
        </section>
      </main>
    );
  }

  if (entryStage === "pre_exam_lobby") {
    return (
      <main className="exam-instruction-shell">
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
              <strong>{toTimeLabel(sessionSchedule.sessionStartsAtMs)}</strong>
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
              <span>Checks Done</span>
              <strong>
                {completedPreExamCheckCount}
                /
                {preExamChecklist.length}
              </strong>
            </div>
            <div>
              <span>Face + Gaze</span>
              <strong>{faceIdentityGazeGuardEnabled ? "Required" : "Off for lab"}</strong>
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

                <article className="exam-lobby-action-panel">
                  <div className="exam-lobby-action-header">
                    <span>02</span>
                    <div>
                      <h2>Camera + Face</h2>
                      <p>{faceIdentityGazeGuardEnabled ? "Open camera, then run the identity readiness check." : "Skipped for supervised lab assignment policy."}</p>
                    </div>
                  </div>
                  <div className="exam-lobby-camera-frame">
                    {faceIdentityGazeGuardEnabled ? (
                      <video ref={cameraVideoRef} autoPlay playsInline muted aria-label="Camera preview" />
                    ) : (
                      <span>Camera skipped</span>
                    )}
                    {faceIdentityGazeGuardEnabled ? (
                      <div className="exam-lobby-face-guide" aria-hidden="true">
                        <span />
                      </div>
                    ) : null}
                    <div className={`exam-lobby-face-status exam-lobby-face-status-${faceStatusState}`} aria-live="polite">
                      <span className="exam-lobby-face-status-icon" aria-hidden="true" />
                      <div>
                        <strong>{faceStatusLabel}</strong>
                        <p>{faceStatusHint}</p>
                      </div>
                    </div>
                  </div>
                  <div className="exam-lobby-action-row">
                    <button type="button" className="exam-secondary-action" onClick={() => { void startCameraCheck(); }}>
                      {cameraCheckState === "failed" ? "Retry Camera" : faceIdentityGazeGuardEnabled ? "Enable Camera" : "Mark Skipped"}
                    </button>
                    <button type="button" className="exam-save-next-button" onClick={runFaceVerificationCheck} disabled={faceIdentityGazeGuardEnabled && cameraCheckState !== "passed"}>
                      {faceVerificationState === "failed" ? "Retry Face Check" : "Verify Face"}
                    </button>
                  </div>
                  {cameraCheckState === "failed" || faceVerificationState === "failed" ? (
                    <p className="exam-lobby-support-note">If this keeps failing, contact the invigilator before the official start.</p>
                  ) : null}
                </article>

                <article className="exam-lobby-action-panel exam-lobby-gaze-panel">
                  <div className="exam-lobby-action-header">
                    <span>03</span>
                    <div>
                      <h2>Gaze Calibration</h2>
                      <p>{faceIdentityGazeGuardEnabled ? "Open the full-screen marker calibration. Look at each marker before capturing it." : "Skipped for supervised lab assignment policy."}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="exam-save-next-button"
                    onClick={() => {
                      if (!faceIdentityGazeGuardEnabled) {
                        captureGazeCalibrationPoint();
                        return;
                      }
                      setGazeCalibrationOverlayOpen(true);
                    }}
                    disabled={faceIdentityGazeGuardEnabled && faceVerificationState !== "passed"}
                  >
                    {gazeCalibrationState === "passed" ? "Calibration Complete" : "Open Full-Screen Calibration"}
                  </button>
                  {gazeCalibrationState === "failed" ? (
                    <p className="exam-lobby-support-note">Retry calibration with your face steady and eyes on each marker.</p>
                  ) : null}
                </article>
              </div>
            </section>
          </div>

          <section className={`exam-lobby-completion-panel ${preExamChecksPassed ? "complete" : ""}`} aria-label="Entry completion status">
            <div>
              <span>{preExamChecksPassed ? "Ready" : "Before You Continue"}</span>
              <strong>{preExamChecksPassed ? "Entry checks complete" : "Complete every required check"}</strong>
              <p>{preExamChecksPassed ? "You are cleared to review instructions and start when the exam opens." : "The button below unlocks after browser, internet, camera, face, and gaze checks are ready."}</p>
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
          {gazeCalibrationOverlayOpen ? (
            <div className="exam-gaze-calibration-overlay" role="presentation">
              <section className="exam-gaze-calibration-surface" aria-label="Full-screen gaze calibration">
                <div className="exam-gaze-calibration-header">
                  <div>
                    <p className="exam-integrity-eyebrow">Gaze Calibration</p>
                    <h2>{currentGazeCalibrationPoint.label} Marker</h2>
                  </div>
                  <span>
                    {Math.min(gazeCalibrationIndex + 1, GAZE_CALIBRATION_POINTS.length)}
                    /
                    {GAZE_CALIBRATION_POINTS.length}
                  </span>
                </div>
                <span
                  className="exam-gaze-calibration-marker"
                  style={{
                    left: `${currentGazeCalibrationPoint.x}%`,
                    top: `${currentGazeCalibrationPoint.y}%`,
                  }}
                >
                  {currentGazeCalibrationPoint.label}
                </span>
                <div className="exam-gaze-calibration-footer">
                  <p>Keep your face steady and look directly at the marker before capturing.</p>
                  <div className="exam-lobby-action-row">
                    <button type="button" className="exam-secondary-action" onClick={() => setGazeCalibrationOverlayOpen(false)}>
                      Pause Calibration
                    </button>
                    <button type="button" className="exam-save-next-button" onClick={captureGazeCalibrationPoint}>
                      Capture Marker
                    </button>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  if (!instructionConfirmed) {
    return (
      <main className="exam-instruction-shell">
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
                {toTimeLabel(sessionSchedule.sessionStartsAtMs)}
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
        setSlowdownUntilMs(Date.now() + sessionSnapshot.timingProfile.controlledSlowdownSeconds * 1000);
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

    await submitSession("manual", unansweredQuestionIdsForSubmission).catch((error) => {
      setSubmitError(error instanceof Error ? error.message : "Submission failed.");
    });
  };

  if (sessionLifecycleState === "terminated") {
    return (
      <main className="exam-submitted-shell" aria-live="polite">
        <section className="exam-submitted-card">
          <p className="exam-access-eyebrow">Session Terminated</p>
          <h1>Submission Could Not Be Finalized</h1>
          <p>
            Reason:
            {" "}
            <strong>{submitError ?? "Auto-submit failed after expiry."}</strong>
          </p>
          <button
            type="button"
            className="exam-start-button"
            onClick={() => window.location.assign(STUDENT_PORTAL_FALLBACK_PATH)}
          >
            Return to Student Portal
          </button>
        </section>
      </main>
    );
  }

  if (isSubmitted) {
    return (
      <main className="exam-submitted-shell" aria-live="polite">
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
          <div className="exam-submission-metrics">
            <p>
              Phase Adherence:
              {" "}
              <strong>{adaptivePhaseSnapshot.phaseAdherencePercent.toFixed(1)}%</strong>
            </p>
            <p>
              Overspend:
              {" "}
              <strong>{adaptivePhaseSnapshot.overspendPercent.toFixed(1)}%</strong>
            </p>
            <p>
              Difficulty Compliance:
              {" "}
              <strong>{adaptivePhaseSnapshot.difficultyCompliancePercent.toFixed(1)}%</strong>
            </p>
          </div>
          <button
            type="button"
            className="exam-start-button"
            onClick={() => window.location.assign(STUDENT_PORTAL_FALLBACK_PATH)}
          >
            Return to Student Portal
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={hardModeMinimalUI ? "exam-runner-shell exam-runner-shell-hard-mode" : "exam-runner-shell"}>
      <div className="exam-top-bar">
        <header className="exam-header" aria-label="Exam header bar">
          <div className="exam-header-group exam-header-identity exam-header-identity-compact">
            <p className="exam-header-label">Candidate</p>
            <h1>{candidateName}</h1>
          </div>

          <div className="exam-header-group exam-header-metrics exam-header-metrics-compact">
            <p>
              <span className={isOperationalMode ? "exam-mode-badge operational" : isControlledMode ? "exam-mode-badge controlled" : isFocusedMode ? "exam-mode-badge focused" : "exam-mode-badge hard"}>
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
              {(isControlledMode || isFocusedMode || isHardMode) ? (
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
              className={isControlledMode ? "exam-inline-mode-strip controlled" : isFocusedMode ? "exam-inline-mode-strip focused" : "exam-inline-mode-strip hard"}
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

      {(sessionLifecycleState === "expired" || submitInFlight) ? (
        <section className="exam-enforcement-warning" aria-label="Submission finalization status">
          <p>
            {sessionLifecycleState === "expired"
              ? "Timer expired. Auto-submit is being finalized with the backend submission endpoint."
              : "Submission in progress. Do not close this tab until confirmation is displayed."}
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
              Browser Alerts:
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
          {selectedQuestion && selectedResponseState && selectedQuestionVisible ? (
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
                  submitInFlight ||
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
      {integrityBlockingReason ? (
        <div className="exam-integrity-overlay" role="presentation">
          <section className="exam-integrity-dialog" role="dialog" aria-modal="true" aria-label="Browser integrity restriction">
            <p className="exam-integrity-eyebrow">Browser Integrity Guard</p>
            <h2>Return to Fullscreen</h2>
            <p>{integrityBlockingReason}</p>
            <button
              type="button"
              className="exam-start-button"
              onClick={() => {
                void requestExamFullscreen();
              }}
            >
              Re-enter Fullscreen
            </button>
          </section>
        </div>
      ) : null}
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
