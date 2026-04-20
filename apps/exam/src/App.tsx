import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes, useLocation, useParams } from "react-router-dom";
import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
import { getFrontendEnvironment } from "../../../shared/services/frontendEnvironment";
import "./App.css";

type QuestionPaletteStatus = "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked";
type ExecutionMode = "Operational" | "Diagnostic" | "Controlled" | "Hard";
type QuestionSection = "Physics" | "Chemistry" | "Mathematics";
type QuestionType = "mcq" | "numeric" | "matrix";
type DifficultyBand = "easy" | "medium" | "hard";
type PhaseId = "phase1" | "phase2" | "phase3";
type SubmissionReason = "manual" | "expiry";
type SessionLifecycleState = "created" | "started" | "active" | "submitted" | "expired" | "terminated";
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

interface EntryValidationResult {
  allowed: boolean;
  reason: "missing_token" | "expired_token" | "malformed_token" | "iframe_blocked" | null;
  claims: TokenClaims;
}

interface ModeInstruction {
  title: string;
  points: string[];
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

interface QueuedAnswerWrite {
  clientTimestamp: number;
  questionId: string;
  selectedOption: string;
  timeSpent: number;
}

interface ExamAnswerBatchRequestBody {
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

const EXAM_DURATION_MINUTES = 180;
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
      "Free question navigation is available across all sections.",
      "No pacing interventions are enforced in this mode.",
    ],
  },
  Diagnostic: {
    title: "L1 Diagnostic Mode",
    points: [
      "Diagnostic advisories may appear to guide pacing awareness.",
      "No blocking actions are enforced; this mode remains advisory.",
    ],
  },
  Controlled: {
    title: "L2 Controlled Mode",
    points: [
      "Minimum engagement timing is enforced per question.",
      "Save actions may remain disabled until minimum timing conditions are met.",
    ],
  },
  Hard: {
    title: "Hard Mode",
    points: [
      "Minimum and maximum timing limits may be enforced per question.",
      "Revisit and free navigation behavior can be restricted by session policy.",
    ],
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
const PHYSICS_IMAGE_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='400'><rect width='100%' height='100%' fill='#edf4ff'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI' font-size='28' fill='#1f5fbf'>Physics Question Figure</text></svg>",
)}`;
const CHEMISTRY_IMAGE_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='400'><rect width='100%' height='100%' fill='#f2fbf5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI' font-size='28' fill='#0a7e42'>Chemistry Question Figure</text></svg>",
)}`;

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
  if (normalized === "diagnostic" || normalized === "l1") {
    return "Diagnostic";
  }
  if (normalized === "controlled" || normalized === "l2") {
    return "Controlled";
  }
  if (normalized === "hard" || normalized === "l3") {
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

function validateSessionEntry(token: string | null): EntryValidationResult {
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

function resolveExamApiBaseUrl(): string {
  const apiBaseUrl = getFrontendEnvironment().apiBaseUrl?.trim();
  if (!apiBaseUrl) {
    return "";
  }

  return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
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
      imageUrl: PHYSICS_IMAGE_DATA_URI,
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
      imageUrl: CHEMISTRY_IMAGE_DATA_URI,
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
      phase2Percent: 45,
      phase3Percent: 15,
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

function getPhaseId(elapsedPercent: number, phaseConfigSnapshot: PhaseConfigSnapshot): PhaseId {
  const phase1Cutoff = phaseConfigSnapshot.phase1Percent;
  const phase2Cutoff = phaseConfigSnapshot.phase1Percent + phaseConfigSnapshot.phase2Percent;

  if (elapsedPercent <= phase1Cutoff) {
    return "phase1";
  }
  if (elapsedPercent <= phase2Cutoff) {
    return "phase2";
  }
  return "phase3";
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
          <h2>Scientific Calculator</h2>
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
          <button type="button" onClick={() => runScientificOperation("backspace")}>backspace</button>
          <button type="button" onClick={() => runScientificOperation("clear")}>clear</button>
          <button type="button" onClick={() => runScientificOperation("equals")}>equals</button>
        </div>
      </section>
    </div>
  );
}

function ExamSessionPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const tokenFromQuery = useMemo(() => new URLSearchParams(location.search).get("token"), [location.search]);
  const [sessionToken, setSessionToken] = useState<string | null>(() => tokenFromQuery);
  const entryValidation = useMemo(() => validateSessionEntry(sessionToken), [sessionToken]);
  const modeInstruction = MODE_INSTRUCTIONS[entryValidation.claims.mode];
  const candidateName = entryValidation.claims.sub ?? "Student Candidate";
  const apiBaseUrl = useMemo(() => resolveExamApiBaseUrl(), []);

  const sessionSnapshot = useMemo(
    () => buildSessionSnapshot(sessionId || "runtime-session", entryValidation.claims.mode),
    [entryValidation.claims.mode, sessionId],
  );

  const [selectedSection, setSelectedSection] = useState<QuestionSection | "All">("All");
  const [selectedQuestionId, setSelectedQuestionId] = useState(sessionSnapshot.questions[0]?.id ?? "q-1");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [instructionConfirmed, setInstructionConfirmed] = useState(false);
  const [remainingMs, setRemainingMs] = useState(EXAM_DURATION_MINUTES * 60 * 1000);
  const [deadlineEpochMs, setDeadlineEpochMs] = useState<number | null>(null);
  const [syncCounter, setSyncCounter] = useState(0);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
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
  const [skippedQuestionsCount, setSkippedQuestionsCount] = useState(0);
  const [sessionLifecycleState, setSessionLifecycleState] = useState<SessionLifecycleState>("created");
  const [submittedAtIso, setSubmittedAtIso] = useState<string | null>(null);
  const [submissionReason, setSubmissionReason] = useState<SubmissionReason | null>(null);
  const [nowEpochMs, setNowEpochMs] = useState(() => Date.now());
  const [lastAnswerWriteAtMs, setLastAnswerWriteAtMs] = useState(() => Date.now() - ANSWER_BATCH_INTERVAL_MS);
  const [pendingAnswerMap, setPendingAnswerMap] = useState<Record<string, QueuedAnswerWrite>>({});
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMessage, setSyncMessage] = useState("No pending answer updates.");
  const [lastHeartbeatAtIso, setLastHeartbeatAtIso] = useState<string | null>(null);
  const [sessionTokenRefreshAtIso, setSessionTokenRefreshAtIso] = useState<string | null>(null);
  const [recoveryApplied, setRecoveryApplied] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitInFlight, setSubmitInFlight] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitWarningAcknowledged, setSubmitWarningAcknowledged] = useState(false);
  const [earlySubmitOverrideAccepted, setEarlySubmitOverrideAccepted] = useState(false);
  const [sessionConflictMessage, setSessionConflictMessage] = useState<string | null>(null);

  const totalDurationMs = EXAM_DURATION_MINUTES * 60 * 1000;
  const isOperationalMode = entryValidation.claims.mode === "Operational";
  const isDiagnosticMode = entryValidation.claims.mode === "Diagnostic";
  const isControlledMode = entryValidation.claims.mode === "Controlled";
  const isHardMode = entryValidation.claims.mode === "Hard";
  const enforcementMode = isControlledMode || isHardMode;
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

    const endpointBase = apiBaseUrl || "";
    const endpoint = `${endpointBase}/exam/session/${encodeURIComponent(effectiveSessionId)}/answers`;
    const requestBody: ExamAnswerBatchRequestBody = {
      answers: answersToPersist,
      instituteId,
      millisecondsSinceLastWrite,
      runId,
      yearId,
    };

    setSyncState("syncing");
    setSyncMessage(`Syncing ${answersToPersist.length} answer update(s)...`);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Answer sync failed with status ${response.status}`);
      }

      const responseBody = await response.json() as ExamAnswerBatchResponse;
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
      setSyncMessage(error instanceof Error ? error.message : "Answer sync failed.");
      return false;
    }
  }, [
    apiBaseUrl,
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

      const endpointBase = apiBaseUrl || "";
      const refreshEndpoint = `${endpointBase}/exam/session/${encodeURIComponent(effectiveSessionId)}/token/refresh`;
      void fetch(refreshEndpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instituteId,
          refreshNonce: entryValidation.claims.refreshNonce,
          runId,
          sessionId: effectiveSessionId,
          yearId,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Token refresh failed with status ${response.status}`);
          }

          const responseBody = await response.json() as SessionTokenRefreshResponse;
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
          setSyncMessage(error instanceof Error ? error.message : "Session token refresh failed.");
        });
    }, 30_000);

    return () => window.clearInterval(refreshCheckInterval);
  }, [
    apiBaseUrl,
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

      const endpointBase = apiBaseUrl || "";
      const endpoint = `${endpointBase}/exam/session/${encodeURIComponent(effectiveSessionId)}/submit`;
      const requestBody: ExamSubmitRequestBody = {
        instituteId,
        runId,
        yearId,
        reason,
        unansweredQuestionIds: unansweredIds,
        clientSubmittedAt: new Date().toISOString(),
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Submission failed with status ${response.status}`);
      }

      const responseBody = await response.json() as ExamSubmitResponse;
      setSubmissionReason(reason);
      setSubmittedAtIso(responseBody.data?.submittedAt ?? new Date().toISOString());
      setSessionLifecycleState("submitted");
      setSubmitDialogOpen(false);
      setSubmitWarningAcknowledged(false);
      setEarlySubmitOverrideAccepted(false);
      setSyncMessage(responseBody.data?.alreadySubmitted ? "Submission already finalized on server." : "Submission completed.");
    } finally {
      setSubmitInFlight(false);
    }
  }, [
    apiBaseUrl,
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

  const filteredPalette = useMemo(
    () =>
      selectedSection === "All"
        ? palette
        : palette.filter((tile) => tile.section === selectedSection),
    [palette, selectedSection],
  );

  const selectedQuestion = sessionSnapshot.questions.find((question) => question.id === selectedQuestionId) ?? sessionSnapshot.questions[0];
  const selectedQuestionIndex = getQuestionIndex(sessionSnapshot.questions, selectedQuestion?.id ?? "");
  const nextQuestion = selectedQuestionIndex >= 0 ? sessionSnapshot.questions[selectedQuestionIndex + 1] : null;
  const selectedResponseState = selectedQuestion
    ? responseStateByQuestionId[selectedQuestion.id]
    : undefined;
  const selectedQuestionTiming = selectedQuestion
    ? questionTimingById[selectedQuestion.id]
    : undefined;

  useEffect(() => {
    if (!nextQuestion?.imageUrl) {
      return;
    }

    const preloadedImage = new Image();
    preloadedImage.src = nextQuestion.imageUrl;
  }, [nextQuestion?.imageUrl]);

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
  const elapsedPercent = toPercent(totalDurationMs - remainingMs, totalDurationMs);

  const adaptivePhaseSnapshot = useMemo<AdaptivePhaseSnapshot>(() => {
    const currentPhase = getPhaseId(elapsedPercent, sessionSnapshot.phaseConfigSnapshot);
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
    elapsedPercent,
    questionTimingById,
    sessionSnapshot.difficultyDistribution.easyPercent,
    sessionSnapshot.difficultyDistribution.hardPercent,
    sessionSnapshot.difficultyDistribution.mediumPercent,
    sessionSnapshot.phaseConfigSnapshot,
    sessionSnapshot.questions,
    skippedQuestionsCount,
  ]);

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

  const selectedQuestionRevisitLocked = selectedQuestion
    ? hardModeLockedQuestionIds.has(selectedQuestion.id) || questionTimingById[selectedQuestion.id]?.maxTimeLocked === true
    : false;

  const saveBlockedByTiming =
    enforcementMode &&
    selectedQuestionMinTimeRemainingSec > 0;

  const sessionLocked = sessionLifecycleState !== "active";
  const saveDisabled = selectedQuestionRevisitLocked || saveBlockedByTiming || slowdownActive || isSubmitted || sessionLocked;

  const shouldRestrictManualSubmit =
    isHardMode &&
    sessionSnapshot.timingProfile.hardModeRestrictSubmitUntilAllVisited &&
    visitedCount < sessionSnapshot.questions.length;

  const unansweredCount = unansweredQuestionIdsForSubmission.length;
  const lowDiscipline = adaptivePhaseSnapshot.disciplineIndex < EARLY_SUBMIT_DISCIPLINE_THRESHOLD;
  const lowAdherence = adaptivePhaseSnapshot.phaseAdherencePercent < EARLY_SUBMIT_PHASE_ADHERENCE_THRESHOLD;
  const requiresEarlySubmitOverride = isControlledMode && (lowDiscipline || lowAdherence);

  const manualSubmitDisabled = isSubmitted || sessionLocked || slowdownActive || shouldRestrictManualSubmit;

  if (!entryValidation.allowed) {
    return <ExamAccessRedirect reason={entryValidation.reason} />;
  }

  if (!instructionConfirmed) {
    return (
      <main className="exam-instruction-shell">
        <section className="exam-instruction-card" aria-labelledby="exam-instruction-title">
          <header className="exam-instruction-header">
            <p className="exam-instruction-eyebrow">Exam Entry</p>
            <h1 id="exam-instruction-title">Instructions</h1>
            <p>
              Session ID:
              {" "}
              <code>{sessionId}</code>
            </p>
            <p>
              Candidate:
              {" "}
              <strong>{candidateName}</strong>
            </p>
          </header>

          <section className="exam-instruction-section" aria-label="General Instructions">
            <h2>1. General Instructions</h2>
            <ul>
              <li>This portal follows a server-authoritative execution model.</li>
              <li>Do not refresh or close the tab during the attempt.</li>
              <li>Use only this session URL with the signed token provided by the backend.</li>
            </ul>
          </section>

          <section className="exam-instruction-section" aria-label="Marking Scheme">
            <h2>2. Marking Scheme</h2>
            <ul>
              {MARKING_SCHEME.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <section className="exam-instruction-section" aria-label="Question Palette Explanation">
            <h2>3. Question Palette Explanation</h2>
            <div className="exam-legend-grid">
              {QUESTION_PALETTE_LEGEND.map((legend) => (
                <div key={legend.status} className="exam-legend-item">
                  <span className={`exam-legend-swatch ${statusClassName(legend.status)}`}>{legend.label.split(" ")[0]}</span>
                  <span>{legend.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="exam-instruction-section" aria-label="Navigation Instructions">
            <h2>4. Navigation Instructions</h2>
            <ul>
              {NAVIGATION_INSTRUCTIONS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <section className="exam-instruction-section" aria-label="Mode Specific Instructions">
            <h2>5. Mode-Specific Instructions</h2>
            <p>
              <strong>{modeInstruction.title}</strong>
            </p>
            <ul>
              {modeInstruction.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <section className="exam-instruction-section" aria-label="Declaration and Start">
            <h2>6. Declaration and Start</h2>
            <label className="exam-declaration-checkbox" htmlFor="exam-declaration-checkbox">
              <input
                id="exam-declaration-checkbox"
                type="checkbox"
                checked={declarationAccepted}
                onChange={(event) => setDeclarationAccepted(event.target.checked)}
              />
              I have read all instructions and agree to begin the test under monitored exam conditions.
            </label>
            <button
              type="button"
              className="exam-start-button"
              disabled={!declarationAccepted}
              onClick={() => {
                const activeSessionId = window.sessionStorage.getItem(activeSessionGuardKey);
                if (activeSessionId && activeSessionId !== effectiveSessionId) {
                  setSessionConflictMessage(
                    "Another active session is already registered for this run in this browser profile. Resume that session or submit it before starting a new one.",
                  );
                  return;
                }

                const deadline = Date.now() + totalDurationMs;
                setDeadlineEpochMs(deadline);
                setRemainingMs(totalDurationMs);
                setLastAnswerWriteAtMs(Date.now() - ANSWER_BATCH_INTERVAL_MS);
                setPendingAnswerMap({});
                setSyncState("idle");
                setSyncMessage("No pending answer updates.");
                setSessionConflictMessage(null);
                setSessionLifecycleState("started");
                setRecoveryApplied(false);
                setInstructionConfirmed(true);
              }}
            >
              Start Test
            </button>
            {sessionConflictMessage ? <p className="exam-submit-warning">{sessionConflictMessage}</p> : null}
          </section>
        </section>
      </main>
    );
  }

  const saveCurrentAndMaybeAdvance = (advance: boolean) => {
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

    if (!hasAnswer(selectedQuestion, responseStateByQuestionId[selectedQuestion.id])) {
      setSkippedQuestionsCount((current) => current + 1);
    }

    queueAnswerWrite(
      selectedQuestion.id,
      responseStateByQuestionId[selectedQuestion.id] ?? {
        selectedOptionId: null,
        numericResponse: "",
        matrixSelections: [],
        markedForReview: false,
      },
    );

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
    if (!selectedQuestion || selectedQuestionIndex <= 0 || slowdownActive || sessionLocked) {
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
    if (!selectedQuestion || slowdownActive || sessionLocked) {
      return;
    }

    if (isHardMode && sessionSnapshot.hardModeRevisitRestricted) {
      const targetQuestionIndex = getQuestionIndex(sessionSnapshot.questions, questionId);
      if (sessionSnapshot.timingProfile.hardModeSequentialNavigation && targetQuestionIndex > selectedQuestionIndex + 1) {
        return;
      }
      if (targetQuestionIndex < selectedQuestionIndex) {
        return;
      }
      if (hardModeLockedQuestionIds.has(questionId)) {
        return;
      }
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
    <main className="exam-runner-shell">
      <header className="exam-header" aria-label="Exam header bar">
        <div className="exam-header-group">
          <p className="exam-header-label">Candidate</p>
          <h1>{candidateName}</h1>
        </div>

        <div className="exam-header-group exam-header-metrics">
          <p>
            Question:
            {" "}
            <strong>{selectedQuestion?.number ?? 1}</strong>
            {" / "}
            {sessionSnapshot.questions.length}
          </p>
          <p>
            Mode:
            {" "}
            <strong>{entryValidation.claims.mode}</strong>
          </p>
          <p>
            Version:
            {" "}
            <strong>{sessionSnapshot.questionSetVersion}</strong>
          </p>
          <p>
            Lifecycle:
            {" "}
            <strong>{sessionLifecycleState}</strong>
          </p>
          {!isOperationalMode ? (
            <p>
              Phase:
              {" "}
              <strong>{adaptivePhaseSnapshot.currentPhase.toUpperCase()}</strong>
            </p>
          ) : null}
        </div>

        <div className="exam-header-group exam-header-timer-group">
          <p className="exam-header-label">Time Left</p>
          <p className={isFinalWindow ? "exam-header-timer danger" : "exam-header-timer"}>
            {toCountdownLabel(remainingMs)}
          </p>
          <p className="exam-sync-indicator">Server Sync #{syncCounter}</p>
          <p className={syncState === "error" ? "exam-sync-indicator error" : "exam-sync-indicator"}>
            Sync State:
            {" "}
            <strong>{syncState.toUpperCase()}</strong>
          </p>
          <p className="exam-sync-indicator">{syncMessage}</p>
          <p className="exam-sync-indicator">
            Pending Batch Size:
            {" "}
            <strong>{pendingAnswers.length}</strong>
          </p>
          <p className="exam-sync-indicator">
            Last Heartbeat:
            {" "}
            <strong>{lastHeartbeatAtIso ?? "N/A"}</strong>
          </p>
          <p className="exam-sync-indicator">
            Token Refresh:
            {" "}
            <strong>{sessionTokenRefreshAtIso ?? "Not required yet"}</strong>
          </p>
          <button
            type="button"
            className="exam-calculator-launch"
            onClick={() => setCalculatorOpen(true)}
          >
            Open Calculator
          </button>
        </div>
      </header>

      <div className="exam-header-subject-tabs" role="tablist" aria-label="Header subject tabs">
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

      {(isDiagnosticMode || isControlledMode) && !slowdownActive ? (
        <section className="exam-advisory-banner" aria-label="Adaptive advisory banner">
          {isDiagnosticMode ? (
            <p>
              Advisory: Phase adherence is
              {" "}
              <strong>{adaptivePhaseSnapshot.phaseAdherencePercent.toFixed(1)}%</strong>
              {" "}
              and overspend is
              {" "}
              <strong>{adaptivePhaseSnapshot.overspendPercent.toFixed(1)}%</strong>.
              Keep skip behavior controlled.
            </p>
          ) : (
            <p>
              Controlled Enforcement: MinTime gating active.
              {" "}
              Discipline Index
              {" "}
              <strong>{adaptivePhaseSnapshot.disciplineIndex.toFixed(1)}</strong>.
              {" "}
              Save is blocked until question timer reaches MinTime.
            </p>
          )}
        </section>
      ) : null}

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

      <div className="exam-main-layout">
        <aside className="exam-palette-panel" aria-label="Question navigation panel">
          <div className="exam-palette-section-header">
            <h2>Question Palette</h2>
            <p>Left vertical navigation with JEE-style square tiles.</p>
          </div>

          <div className="exam-section-filters" role="tablist" aria-label="Question section filters">
            {(["All", ...sessionSnapshot.subjects] as const).map((section) => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={selectedSection === section}
                className={selectedSection === section ? "exam-filter-button active" : "exam-filter-button"}
                onClick={() => setSelectedSection(section)}
              >
                {section}
              </button>
            ))}
          </div>

          <div className="exam-palette-grid" aria-label="Question status tiles">
            {filteredPalette.map((tile) => {
              const jumpDisabled =
                slowdownActive ||
                (isHardMode &&
                  sessionSnapshot.hardModeRevisitRestricted &&
                  (tile.revisitLocked || tile.number < (selectedQuestion?.number ?? 1)));

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

          <div className="exam-status-indicators" aria-label="Answer status indicators">
            <h3>Status Indicators</h3>
            <p>
              Answered:
              {" "}
              <strong>{answeredCount}</strong>
            </p>
            <p>
              Not Answered:
              {" "}
              <strong>{notAnsweredCount}</strong>
            </p>
            <p>
              Marked:
              {" "}
              <strong>{markedCount}</strong>
            </p>
            <p>
              Hard Mode Locks:
              {" "}
              <strong>{hardModeLockedQuestionIds.size}</strong>
            </p>
            <p>
              Phase Adherence:
              {" "}
              <strong>{adaptivePhaseSnapshot.phaseAdherencePercent.toFixed(1)}%</strong>
            </p>
            <p>
              Difficulty Compliance:
              {" "}
              <strong>{adaptivePhaseSnapshot.difficultyCompliancePercent.toFixed(1)}%</strong>
            </p>
            <p>
              Skip Pattern:
              {" "}
              <strong>{adaptivePhaseSnapshot.skipPatternScore.toFixed(1)}%</strong>
            </p>
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
          <header className="exam-question-header">
            <h2>
              {selectedQuestion?.section ?? "Physics"}
              {" "}
              • Question
              {" "}
              {selectedQuestion?.number ?? 1}
            </h2>
            <p>
              Snapshot:
              {" "}
              <code>{sessionSnapshot.sessionId}</code>
            </p>
            <div className="exam-question-timing-metrics">
              <p>
                MinTime Remaining:
                {" "}
                <strong>{selectedQuestionMinTimeRemainingSec}s</strong>
              </p>
              <p>
                MaxTime Remaining:
                {" "}
                <strong>{selectedQuestionMaxTimeRemainingSec}s</strong>
              </p>
              <p>
                Time Spent:
                {" "}
                <strong>{selectedQuestionTimeSpentSec}s</strong>
              </p>
            </div>
          </header>

          {selectedQuestion && selectedResponseState ? (
            <article className="exam-question-surface">
              <p className="exam-question-type">
                Type:
                {" "}
                <strong>{selectedQuestion.type.toUpperCase()}</strong>
                {" "}
                • Difficulty:
                {" "}
                <strong>{selectedQuestion.difficulty.toUpperCase()}</strong>
              </p>
              <p className="exam-question-text">{selectedQuestion.text}</p>

              {selectedQuestion.imageUrl ? (
                <figure className="exam-question-image-wrap">
                  <img
                    src={selectedQuestion.imageUrl}
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
                        name={selectedQuestion.id}
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
                  <label htmlFor={`numeric-${selectedQuestion.id}`}>Numeric response</label>
                  <input
                    id={`numeric-${selectedQuestion.id}`}
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
                  onClick={goToPreviousQuestion}
                  disabled={selectedQuestionIndex <= 0 || selectedQuestionRevisitLocked || slowdownActive || sessionLocked}
                >
                  Previous
                </button>
                <button
                  type="button"
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
                  onClick={() => {
                    if (selectedQuestionRevisitLocked || slowdownActive || sessionLocked) {
                      return;
                    }

                    updateQuestionResponseState(selectedQuestion.id, (current) => ({
                      ...current,
                      markedForReview: !current.markedForReview,
                    }));
                  }}
                  disabled={selectedQuestionRevisitLocked || slowdownActive || sessionLocked}
                >
                  Mark for Review
                </button>
                <button
                  type="button"
                  className="exam-save-next-button"
                  onClick={() => saveCurrentAndMaybeAdvance(true)}
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
            </article>
          ) : null}
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

            {unansweredCount > 0 ? (
              <label className="exam-submit-check">
                <input
                  type="checkbox"
                  checked={submitWarningAcknowledged}
                  onChange={(event) => setSubmitWarningAcknowledged(event.target.checked)}
                />
                I understand {unansweredCount} question(s) will remain unanswered after final submission.
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
