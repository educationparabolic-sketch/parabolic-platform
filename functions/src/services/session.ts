import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import {createHash, randomUUID} from "node:crypto";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {dataTierPartitionService} from "./dataTierPartition";
import {
  buildQuestionPhaseTimingRuleSet,
  normalizeDifficultyTimingProfile,
} from "./questionPhaseTiming";
import {
  SessionDocumentInitializationContext,
  SessionDocumentInitializationRecord,
  SessionActivationContext,
  SessionActivationResult,
  SessionExecutionMode,
  SessionEntryValidationContext,
  SessionEntryValidationResult,
  SessionQuestionTimeMap,
  SessionStartContext,
  SessionStartErrorCode,
  SessionTimingProfileSnapshot,
  SessionWriteBatchingEvaluationInput,
  SessionWriteBatchingEvaluationResult,
  SessionWriteBatchingPolicy,
  SessionWriteBatchingReason,
  SessionStartResult,
  SessionStateTransitionContext,
  SessionStateTransitionResult,
  SessionStatus,
  SessionTokenClaims,
} from "../types/sessionStart";
import {DEFAULT_RISK_MODEL_VERSION} from "../types/riskEngine";
import type {
  ExamRuntimeQuestion,
  ExamRuntimeSnapshot,
} from "../../../shared/contracts/apiDtos";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const STUDENTS_COLLECTION = "students";
const QUESTION_BANK_COLLECTION = "questionBank";
const LICENSE_COLLECTION = "license";
const ACTIVE_STUDENT_STATUSES = new Set(["active"]);
const ACTIVE_SESSION_STATUSES = ["created", "started", "active"];
const CURRENT_YEAR_STATUS_PRIORITY = new Map([
  ["active", 0],
  ["started", 1],
  ["scheduled", 2],
]);
const MAX_LAUNCH_CREDENTIAL_HASHES = 5;
const DEFAULT_RUNTIME_FINAL_WINDOW_MINUTES = 10;
const DEFAULT_RUNTIME_SYNC_EVERY_MS = 10_000;
const DEFAULT_RUNTIME_CONTROLLED_SLOWDOWN_SECONDS = 12;
const CANDIDATE_FORBIDDEN_RUNTIME_FIELDS = new Set([
  "answer",
  "answerkey",
  "correctanswer",
  "correct",
  "internalnotes",
  "iscorrect",
  "solution",
  "solutionimageurl",
  "solutionpdfurl",
]);
const ALLOWED_MODES_BY_LAYER: Record<
  SessionStartContext["licenseLayer"],
  SessionExecutionMode[]
> = {
  L0: ["Operational"],
  L1: ["Operational", "Diagnostic"],
  L2: ["Operational", "Diagnostic", "Controlled", "Hard"],
  L3: ["Operational", "Diagnostic", "Controlled", "Hard"],
};
const SESSION_STATUS_TRANSITION_ORDER: Record<SessionStatus, number> = {
  created: 0,
  started: 1,
  active: 2,
  submitted: 3,
  expired: 4,
  terminated: 5,
};
const ALLOWED_SESSION_STATUS_TRANSITIONS:
Record<SessionStatus, SessionStatus[]> = {
  active: ["submitted", "expired"],
  created: ["started"],
  expired: ["terminated"],
  started: ["active", "expired"],
  submitted: [],
  terminated: [],
};
const SESSION_WRITE_BATCHING_POLICY: SessionWriteBatchingPolicy =
  Object.freeze({
    maxPendingAnswers: 10,
    minimumWriteIntervalMs: 5000,
  });

type SessionTokenSigner = (
  uid: string,
  claims: SessionTokenClaims,
) => Promise<string>;

const defaultSessionTokenSigner: SessionTokenSigner = async (
  uid,
  claims,
) => getFirebaseAdminApp().auth().createCustomToken(uid, claims);

const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const decodeBase64UrlJson = (value: string): Record<string, unknown> | null => {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;

    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const decodeSessionTokenClaims = (token: string): Record<string, unknown> => {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 3) {
    throw new SessionStartValidationError(
      "UNAUTHORIZED",
      "Session token must be a signed JWT.",
    );
  }

  const payload = decodeBase64UrlJson(tokenParts[1] ?? "");
  if (!payload) {
    throw new SessionStartValidationError(
      "UNAUTHORIZED",
      "Session token payload could not be decoded.",
    );
  }

  if (
    Number.isFinite(payload.exp) &&
    (payload.exp as number) * 1000 <= Date.now()
  ) {
    throw new SessionStartValidationError(
      "UNAUTHORIZED",
      "Session token has expired.",
    );
  }

  const customClaims = isPlainObject(payload.claims) ?
    payload.claims :
    payload;

  return customClaims;
};

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeNonNegativeInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (!Number.isInteger(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be an integer.`,
    );
  }

  if ((value as number) < 0) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-negative integer.`,
    );
  }

  return value as number;
};

const normalizeRunWindowTimestamp = (
  value: unknown,
  fieldName: string,
): Timestamp => {
  if (value instanceof Timestamp) {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Timestamp.fromDate(value);
  }

  if (typeof value === "string") {
    const parsedDate = new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return Timestamp.fromDate(parsedDate);
    }
  }

  throw new SessionStartValidationError(
    "VALIDATION_ERROR",
    `Run field "${fieldName}" must be a timestamp or ISO date string.`,
  );
};

const normalizeOptionalSessionTimestampIso = (
  value: unknown,
  fieldName: string,
): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRunWindowTimestamp(value, fieldName).toDate().toISOString();
};

const normalizeSessionStatus = (
  value: unknown,
  fieldName: string,
): SessionStatus => {
  const normalizedValue = normalizeRequiredString(value, fieldName);

  if (!(normalizedValue in SESSION_STATUS_TRANSITION_ORDER)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a valid session status.`,
    );
  }

  return normalizedValue as SessionStatus;
};

const normalizeLaunchIntent = (
  value: unknown,
): SessionStartContext["intent"] => {
  const normalizedValue = normalizeRequiredString(value, "intent");
  if (normalizedValue !== "start" && normalizedValue !== "resume") {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Field \"intent\" must be start or resume.",
    );
  }
  return normalizedValue;
};

const normalizeLicenseLayer = (
  value: unknown,
): SessionStartContext["licenseLayer"] => {
  const normalizedValue = normalizeRequiredString(value, "licenseLayer");
  if (
    normalizedValue !== "L0" &&
    normalizedValue !== "L1" &&
    normalizedValue !== "L2" &&
    normalizedValue !== "L3"
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Field \"licenseLayer\" must be L0, L1, L2, or L3.",
    );
  }
  return normalizedValue;
};

const resolveCurrentAcademicYear = (
  snapshots: FirebaseFirestore.QueryDocumentSnapshot[],
): FirebaseFirestore.QueryDocumentSnapshot => {
  const candidates = snapshots
    .map((snapshot) => ({
      priority: CURRENT_YEAR_STATUS_PRIORITY.get(
        String(snapshot.data().status ?? "").trim().toLowerCase(),
      ),
      snapshot,
    }))
    .filter((entry): entry is {
      priority: number;
      snapshot: FirebaseFirestore.QueryDocumentSnapshot;
    } => entry.priority !== undefined)
    .sort((left, right) =>
      left.priority - right.priority ||
      left.snapshot.id.localeCompare(right.snapshot.id));
  const current = candidates[0]?.snapshot;
  if (!current) {
    throw new SessionStartValidationError(
      "CONFLICT",
      "The institute has no current operational academic year.",
    );
  }
  return current;
};

const buildDeterministicSessionId = (
  instituteId: string,
  yearId: string,
  runId: string,
  studentId: string,
): string => `session_${createHash("sha256")
  .update(`${instituteId}:${yearId}:${runId}:${studentId}`)
  .digest("hex")
  .slice(0, 32)}`;

const normalizeLaunchCredentialHashes = (
  value: unknown,
  legacyHash: unknown,
): string[] => {
  const hashes = Array.isArray(value) ? value.flatMap((entry) =>
    typeof entry === "string" && entry.trim() ? [entry.trim()] : []) : [];
  if (typeof legacyHash === "string" && legacyHash.trim()) {
    hashes.push(legacyHash.trim());
  }
  return Array.from(new Set(hashes)).slice(-MAX_LAUNCH_CREDENTIAL_HASHES);
};

const normalizeQuestionIds = (
  value: unknown,
  fieldName: string,
): string[] => {
  if (!Array.isArray(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" must be an array of question ids.`,
    );
  }

  if (value.length === 0) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" must contain at least one question id.`,
    );
  }

  const normalizedQuestionIds = value.map((questionId, index) =>
    normalizeRequiredString(questionId, `${fieldName}[${index}]`)
  );

  if (new Set(normalizedQuestionIds).size !== normalizedQuestionIds.length) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" must not contain duplicate question ids.`,
    );
  }

  return normalizedQuestionIds;
};

const normalizeTimingWindow = (
  value: unknown,
  fieldName: string,
): SessionTimingProfileSnapshot["easy"] => {
  if (!isPlainObject(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" must be an object.`,
    );
  }

  const min = value.min;
  const max = value.max;
  const recommended = value.recommended ?? ((Number(min) + Number(max)) / 2);

  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(recommended)
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" must contain numeric min, recommended, and max values.`,
    );
  }

  if (
    (min as number) < 0 ||
    (max as number) < 0 ||
    (recommended as number) < 0
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" timing values must be non-negative.`,
    );
  }

  if ((min as number) > (max as number)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" min must be less than or equal to max.`,
    );
  }

  if ((recommended as number) < (min as number) ||
    (recommended as number) > (max as number)
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" recommended must be between min and max.`,
    );
  }

  return {
    max: Number(max),
    min: Number(min),
    recommended: Number(recommended),
  };
};

const normalizeTimingProfileSnapshot = (
  value: unknown,
  fieldName: string,
): SessionTimingProfileSnapshot => {
  if (!isPlainObject(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" must be an object.`,
    );
  }

  return {
    easy: normalizeTimingWindow(value.easy, `${fieldName}.easy`),
    hard: normalizeTimingWindow(value.hard, `${fieldName}.hard`),
    medium: normalizeTimingWindow(value.medium, `${fieldName}.medium`),
  };
};

const normalizeQuestionDifficulty = (
  value: unknown,
  fieldName: string,
): keyof SessionTimingProfileSnapshot => {
  const normalizedValue = normalizeRequiredString(value, fieldName)
    .toLowerCase();

  if (
    normalizedValue !== "easy" &&
    normalizedValue !== "medium" &&
    normalizedValue !== "hard"
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Question field "${fieldName}" must be Easy, Medium, or Hard.`,
    );
  }

  return normalizedValue;
};

const normalizeSessionTransitionActorType = (
  value: unknown,
  fieldName: string,
): SessionStateTransitionContext["actorType"] => {
  const normalizedValue = normalizeRequiredString(value, fieldName);

  if (
    normalizedValue !== "student" &&
    normalizedValue !== "backend" &&
    normalizedValue !== "system"
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a valid session actor type.`,
    );
  }

  return normalizedValue;
};

const normalizeSessionExecutionMode = (
  value: unknown,
  fieldName: string,
): SessionExecutionMode => {
  const normalizedValue = normalizeRequiredString(value, fieldName);

  if (
    normalizedValue !== "Operational" &&
    normalizedValue !== "Diagnostic" &&
    normalizedValue !== "Controlled" &&
    normalizedValue !== "Hard"
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be one of Operational, Diagnostic, ` +
        "Controlled, or Hard.",
    );
  }

  return normalizedValue;
};

const normalizeVersionString = (
  value: unknown,
  fieldName: string,
): string => Number.isInteger(value) && (value as number) > 0 ?
  String(value) :
  normalizeRequiredString(value, fieldName);

const normalizeSnapshotObject = (
  value: unknown,
  fieldName: string,
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" must be an object.`,
    );
  }

  return {...value};
};

const normalizeRunPhaseConfigSnapshot = (
  value: unknown,
): Record<string, unknown> => isPlainObject(value) ?
  {...value} :
  {
    phase1Percent: 40,
    phase2Percent: 45,
    phase3Percent: 15,
  };

const normalizeBooleanFlagMap = (
  value: unknown,
): Record<string, boolean> => {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, flagValue]) => [key, flagValue === true]),
  );
};

const buildLicenseSnapshot = (
  licenseData: FirebaseFirestore.DocumentData,
  currentLayer: string,
): Record<string, unknown> => ({
  currentLayer,
  eligibilityFlags: normalizeBooleanFlagMap(licenseData.eligibilityFlags),
  featureFlags: normalizeBooleanFlagMap(licenseData.featureFlags),
});

const buildTemplateSnapshot = (
  runData: FirebaseFirestore.DocumentData,
  questionIds: string[],
  templateVersion: string,
): Record<string, unknown> => {
  const snapshot: Record<string, unknown> = {
    questionIds,
    templateVersion,
  };

  if (typeof runData.testId === "string" && runData.testId.trim()) {
    snapshot.testId = runData.testId.trim();
  }

  if (typeof runData.canonicalId === "string" && runData.canonicalId.trim()) {
    snapshot.canonicalId = runData.canonicalId.trim();
  }

  if (isPlainObject(runData.difficultyDistribution)) {
    snapshot.difficultyDistribution = {...runData.difficultyDistribution};
  }

  return snapshot;
};

const normalizeRuntimeOptionalString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeRuntimePositiveNumber = (
  value: unknown,
  fallback: number,
  fieldName: string,
): number => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" must be a positive number.`,
    );
  }
  return Number(value);
};

const normalizeRuntimeNonNegativeInteger = (
  value: unknown,
  fallback: number,
  fieldName: string,
): number => value === undefined ? fallback :
  normalizeNonNegativeInteger(value, fieldName);

const normalizeRuntimeQuestionType = (
  value: unknown,
): ExamRuntimeQuestion["type"] => {
  if (value === undefined || value === null || value === "") {
    return "mcq";
  }
  const normalized = normalizeRequiredString(value, "question.questionType")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (["mcq", "multiplechoice", "singlechoice"].includes(normalized)) {
    return "mcq";
  }
  if (["numeric", "numerical", "number"].includes(normalized)) {
    return "numeric";
  }
  if (["matrix", "matrixmatch", "matching"].includes(normalized)) {
    return "matrix";
  }
  throw new SessionStartValidationError(
    "VALIDATION_ERROR",
    `Question type "${String(value)}" is not supported by the Exam runtime.`,
  );
};

const normalizeRuntimeStringList = (
  value: unknown,
  fieldName: string,
): string[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Question field "${fieldName}" must be an array.`,
    );
  }
  const normalized = value.map((entry, index) =>
    normalizeRequiredString(entry, `${fieldName}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Question field "${fieldName}" must contain unique values.`,
    );
  }
  return normalized;
};

const normalizeRuntimeQuestionOptions = (
  questionData: FirebaseFirestore.DocumentData,
  questionType: ExamRuntimeQuestion["type"],
): ExamRuntimeQuestion["options"] => {
  const source = questionData.responseOptions ?? questionData.options;
  if (source === undefined || source === null) {
    return questionType === "mcq" ? ["A", "B", "C", "D"].map((label) => ({
      id: label,
      label,
      text: "",
    })) : [];
  }
  if (!Array.isArray(source)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Question field \"responseOptions\" must be an array.",
    );
  }
  const options = source.map((entry, index) => {
    if (typeof entry === "string") {
      const label = normalizeRequiredString(entry, `responseOptions[${index}]`);
      return {id: label, label, text: ""};
    }
    if (!isPlainObject(entry)) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        `Question field "responseOptions[${index}]" must be a string or object.`,
      );
    }
    const id = normalizeRequiredString(
      entry.id ?? entry.value ?? entry.label,
      `responseOptions[${index}].id`,
    );
    return {
      id,
      label: normalizeRuntimeOptionalString(entry.label) || id,
      text: normalizeRuntimeOptionalString(entry.text),
    };
  });
  if (new Set(options.map((option) => option.id)).size !== options.length) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Question response option ids must be unique.",
    );
  }
  if (questionType === "mcq" && options.length < 2) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "MCQ questions require at least two response options.",
    );
  }
  return options;
};

const normalizeRuntimeQuestionMedia = (
  value: unknown,
): ExamRuntimeQuestion["media"] => {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Question field \"questionMedia\" must be an object.",
    );
  }
  const type = normalizeRequiredString(value.type, "questionMedia.type")
    .toLowerCase();
  if (type !== "audio" && type !== "video") {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Question media type must be audio or video.",
    );
  }
  return {
    title: normalizeRequiredString(value.title, "questionMedia.title"),
    type,
    url: normalizeRequiredString(value.url, "questionMedia.url"),
  };
};

const buildCandidateSafeRuntimeQuestion = (
  questionId: string,
  questionData: FirebaseFirestore.DocumentData,
  number: number,
): ExamRuntimeQuestion => {
  const payloadQuestionId = normalizeRuntimeOptionalString(questionData.questionId);
  if (payloadQuestionId && payloadQuestionId !== questionId) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Question payload id does not match questionBank document "${questionId}".`,
    );
  }
  const type = normalizeRuntimeQuestionType(questionData.questionType);
  const section = normalizeRuntimeOptionalString(questionData.subject) || "General";
  const imageUrl = normalizeRuntimeOptionalString(questionData.questionImageUrl);
  const explicitText = [
    questionData.prompt,
    questionData.questionText,
    questionData.stem,
  ].map(normalizeRuntimeOptionalString).find(Boolean);
  const metadataText = [
    normalizeRuntimeOptionalString(questionData.subject),
    normalizeRuntimeOptionalString(questionData.chapter),
    normalizeRuntimeOptionalString(questionData.questionType),
  ].filter(Boolean).join(" · ");
  const matrixRows = normalizeRuntimeStringList(
    questionData.matrixRows,
    "matrixRows",
  );
  const matrixColumns = normalizeRuntimeStringList(
    questionData.matrixColumns,
    "matrixColumns",
  );
  if (type === "matrix" && (matrixRows.length === 0 || matrixColumns.length === 0)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Matrix question "${questionId}" requires matrixRows and matrixColumns.`,
    );
  }
  return {
    difficulty: normalizeQuestionDifficulty(
      questionData.difficulty,
      `questionBank.${questionId}.difficulty`,
    ),
    id: questionId,
    imageUrl,
    matrixColumns,
    matrixRows,
    media: normalizeRuntimeQuestionMedia(questionData.questionMedia),
    number,
    options: normalizeRuntimeQuestionOptions(questionData, type),
    section,
    text: explicitText || (imageUrl ? "Refer to the question image." : metadataText || questionId),
    type,
  };
};

const normalizeRuntimePercent = (
  value: unknown,
  fieldName: string,
): number => {
  if (!Number.isFinite(value) || (value as number) < 0 || (value as number) > 100) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Run field "${fieldName}" must be between 0 and 100.`,
    );
  }
  return Number(value);
};

const buildSessionRuntimeSnapshot = (input: {
  licenseSnapshot: Record<string, unknown>;
  mode: SessionExecutionMode;
  phaseConfigSnapshot: Record<string, unknown>;
  questionIds: string[];
  questionSnapshots: FirebaseFirestore.DocumentSnapshot[];
  runData: FirebaseFirestore.DocumentData;
  sessionId: string;
  templateVersion: string;
  timingProfileSnapshot: SessionTimingProfileSnapshot;
}): ExamRuntimeSnapshot => {
  const questionsById = new Map(input.questionSnapshots.map((snapshot) => [
    snapshot.id,
    snapshot,
  ]));
  const orderedQuestionIds = input.runData.shuffleQuestionOrder === true ?
    [...input.questionIds].sort((left, right) =>
      createHash("sha256").update(`${input.sessionId}:${left}`).digest("hex")
        .localeCompare(
          createHash("sha256").update(`${input.sessionId}:${right}`).digest("hex"),
        )) :
    input.questionIds;
  const questions = orderedQuestionIds.map((questionId, index) => {
    const snapshot = questionsById.get(questionId);
    if (!snapshot?.exists) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        `Run references missing questionBank document "${questionId}".`,
      );
    }
    return buildCandidateSafeRuntimeQuestion(
      questionId,
      snapshot.data() ?? {},
      index + 1,
    );
  });
  const phase1Percent = normalizeRuntimePercent(
    input.phaseConfigSnapshot.phase1Percent,
    "phaseConfigSnapshot.phase1Percent",
  );
  const phase2Percent = normalizeRuntimePercent(
    input.phaseConfigSnapshot.phase2Percent,
    "phaseConfigSnapshot.phase2Percent",
  );
  const phase3Percent = normalizeRuntimePercent(
    input.phaseConfigSnapshot.phase3Percent,
    "phaseConfigSnapshot.phase3Percent",
  );
  const configuredPhasePercent = phase1Percent + phase2Percent + phase3Percent;
  if (configuredPhasePercent > 100) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Run phase percentages must not exceed 100 in total.",
    );
  }
  const startWindow = normalizeRunWindowTimestamp(
    input.runData.startWindow,
    "run.startWindow",
  );
  const endWindow = normalizeRunWindowTimestamp(
    input.runData.endWindow,
    "run.endWindow",
  );
  const earlyEntryBufferMinutes = normalizeRuntimeNonNegativeInteger(
    input.runData.earlyEntryBufferMinutes,
    0,
    "earlyEntryBufferMinutes",
  );
  const difficultyCounts = questions.reduce<Record<ExamRuntimeQuestion["difficulty"], number>>(
    (counts, question) => ({
      ...counts,
      [question.difficulty]: counts[question.difficulty] + 1,
    }),
    {easy: 0, hard: 0, medium: 0},
  );
  const toPercent = (count: number): number =>
    Number(((count / questions.length) * 100).toFixed(4));
  const licenseCurrentLayer = normalizeLicenseLayer(
    input.licenseSnapshot.currentLayer,
  );
  const proctoringPolicy = isPlainObject(input.runData.proctoringPolicy) ?
    input.runData.proctoringPolicy : {};

  return {
    difficultyDistribution: {
      easyPercent: toPercent(difficultyCounts.easy),
      hardPercent: toPercent(difficultyCounts.hard),
      mediumPercent: toPercent(difficultyCounts.medium),
    },
    hardModeRevisitRestricted: input.mode === "Hard",
    license: {
      currentLayer: licenseCurrentLayer,
      eligibilityFlags: normalizeBooleanFlagMap(
        input.licenseSnapshot.eligibilityFlags,
      ),
      featureFlags: normalizeBooleanFlagMap(input.licenseSnapshot.featureFlags),
    },
    mode: input.mode,
    phaseConfigSnapshot: {
      bufferPercent: 100 - configuredPhasePercent,
      phase1Percent,
      phase2Percent,
      phase3Percent,
    },
    proctoringPolicy: {
      browserIntegrityGuardEnabled:
        proctoringPolicy.browserIntegrityGuardEnabled === true,
      faceIdentityGazeGuardEnabled:
        proctoringPolicy.faceIdentityGazeGuardEnabled === true,
    },
    questionSetVersion: input.templateVersion,
    questions,
    schedule: {
      durationMs: endWindow.toMillis() - startWindow.toMillis(),
      earlyEntryBufferMinutes,
      earlyEntryOpensAt: new Date(
        startWindow.toMillis() - earlyEntryBufferMinutes * 60_000,
      ).toISOString(),
      sessionEndsAt: endWindow.toDate().toISOString(),
      sessionStartsAt: startWindow.toDate().toISOString(),
      timezone: normalizeRuntimeOptionalString(input.runData.timezone) || "UTC",
    },
    sessionId: input.sessionId,
    subjects: Array.from(new Set(questions.map((question) => question.section))),
    timingProfile: {
      controlledSlowdownSeconds: normalizeRuntimePositiveNumber(
        input.runData.controlledSlowdownSeconds,
        DEFAULT_RUNTIME_CONTROLLED_SLOWDOWN_SECONDS,
        "controlledSlowdownSeconds",
      ),
      finalWindowMinutes: normalizeRuntimePositiveNumber(
        input.runData.finalWindowMinutes,
        DEFAULT_RUNTIME_FINAL_WINDOW_MINUTES,
        "finalWindowMinutes",
      ),
      hardModeRestrictSubmitUntilAllVisited:
        input.runData.hardModeRestrictSubmitUntilAllVisited !== false,
      hardModeSequentialNavigation:
        input.runData.hardModeSequentialNavigation !== false,
      maxTimeByDifficultySec: {
        easy: input.timingProfileSnapshot.easy.max,
        hard: input.timingProfileSnapshot.hard.max,
        medium: input.timingProfileSnapshot.medium.max,
      },
      minTimeByDifficultySec: {
        easy: input.timingProfileSnapshot.easy.min,
        hard: input.timingProfileSnapshot.hard.min,
        medium: input.timingProfileSnapshot.medium.min,
      },
      syncEveryMs: normalizeRuntimePositiveNumber(
        input.runData.syncEveryMs,
        DEFAULT_RUNTIME_SYNC_EVERY_MS,
        "syncEveryMs",
      ),
    },
  };
};

const assertCandidateSafeRuntimeSnapshot = (
  value: unknown,
  fieldName = "runtimeSnapshot",
): void => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertCandidateSafeRuntimeSnapshot(entry, `${fieldName}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (CANDIDATE_FORBIDDEN_RUNTIME_FIELDS.has(key.toLowerCase())) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        `Session field "${fieldName}.${key}" is not candidate-safe.`,
      );
    }
    assertCandidateSafeRuntimeSnapshot(entry, `${fieldName}.${key}`);
  }
};

const normalizeStoredRuntimeSnapshot = (
  value: unknown,
  sessionId: string,
  questionTimeMap: unknown,
): ExamRuntimeSnapshot => {
  if (!isPlainObject(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Session field \"runtimeSnapshot\" must be an object.",
    );
  }
  assertCandidateSafeRuntimeSnapshot(value);
  if (normalizeRequiredString(value.sessionId, "runtimeSnapshot.sessionId") !== sessionId) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Runtime snapshot sessionId does not match the session document.",
    );
  }
  if (!Array.isArray(value.questions) || value.questions.length === 0) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Runtime snapshot must contain at least one question.",
    );
  }
  const runtimeQuestionIds = value.questions.map((question, index) => {
    if (!isPlainObject(question)) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        `Runtime snapshot question ${index + 1} must be an object.`,
      );
    }
    return normalizeRequiredString(question.id, `runtimeSnapshot.questions[${index}].id`);
  });
  if (new Set(runtimeQuestionIds).size !== runtimeQuestionIds.length) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Runtime snapshot question ids must be unique.",
    );
  }
  if (!isPlainObject(questionTimeMap)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Session field \"questionTimeMap\" must be an object.",
    );
  }
  const timingQuestionIds = Object.keys(questionTimeMap);
  if (
    runtimeQuestionIds.length !== timingQuestionIds.length ||
    runtimeQuestionIds.some((questionId) => !Object.prototype.hasOwnProperty.call(questionTimeMap, questionId))
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Runtime snapshot question ids must exactly match questionTimeMap ids.",
    );
  }
  return JSON.parse(JSON.stringify(value)) as ExamRuntimeSnapshot;
};

const normalizeRiskModelVersion = (value: unknown): string => {
  if (typeof value !== "string") {
    return DEFAULT_RISK_MODEL_VERSION;
  }

  const normalizedValue = value.trim();
  return normalizedValue || DEFAULT_RISK_MODEL_VERSION;
};

const resolveLicenseData = (
  mainLicense: FirebaseFirestore.DocumentSnapshot,
  currentLicense: FirebaseFirestore.DocumentSnapshot,
): FirebaseFirestore.DocumentData => {
  if (mainLicense.exists) {
    return mainLicense.data() ?? {};
  }

  if (currentLicense.exists) {
    return currentLicense.data() ?? {};
  }

  throw new SessionStartValidationError(
    "LICENSE_RESTRICTED",
    "Institute license is required before starting sessions.",
  );
};

/**
 * Validation error raised for session-start contract violations.
 */
export class SessionStartValidationError extends Error {
  public readonly code: SessionStartErrorCode;

  /**
   * @param {SessionStartErrorCode} code Architecture-aligned API error code.
   * @param {string} message Validation failure detail.
   */
  constructor(code: SessionStartErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "SessionStartValidationError";
  }
}

/**
 * Session execution service handling Build 26 session-start behavior.
 */
export class SessionService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("SessionService");
  private readonly signSessionToken: SessionTokenSigner;

  /**
   * @param {SessionTokenSigner} tokenSigner Optional token signer.
   */
  constructor(tokenSigner: SessionTokenSigner = defaultSessionTokenSigner) {
    this.signSessionToken = tokenSigner;
  }

  /**
   * Starts a student session for a scheduled run.
   * @param {SessionStartContext} context Session-start request identifiers.
   * @param {number} nowMillis Current timestamp used for window checks.
   * @return {Promise<SessionStartResult>} Created session metadata and token.
   */
  public async startSession(
    context: SessionStartContext,
    nowMillis = Date.now(),
  ): Promise<SessionStartResult> {
    const instituteId = normalizeRequiredString(
      context.instituteId,
      "instituteId",
    );
    const intent = normalizeLaunchIntent(context.intent);
    const licenseLayer = normalizeLicenseLayer(context.licenseLayer);
    const runId = normalizeRequiredString(context.runId, "runId");
    const studentId = normalizeRequiredString(context.studentId, "studentId");
    const studentUid = normalizeRequiredString(
      context.studentUid,
      "studentUid",
    );
    const instituteReference = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId);
    const academicYearsSnapshot = await instituteReference
      .collection(ACADEMIC_YEARS_COLLECTION)
      .get();
    const currentAcademicYear = resolveCurrentAcademicYear(
      academicYearsSnapshot.docs,
    );
    const yearId = currentAcademicYear.id;
    const academicYearReference = currentAcademicYear.ref;
    const runReference = academicYearReference
      .collection(RUNS_COLLECTION)
      .doc(runId);
    const sessionsCollection = runReference.collection(SESSIONS_COLLECTION);
    const existingStudentSessions = await sessionsCollection
      .where("studentId", "==", studentId)
      .limit(25)
      .get();
    const existingActiveSessions = existingStudentSessions.docs.filter(
      (snapshot) => ACTIVE_SESSION_STATUSES.includes(
        String(snapshot.data().status ?? "").trim().toLowerCase(),
      ),
    );
    if (existingActiveSessions.length > 1) {
      throw new SessionStartValidationError(
        "CONFLICT",
        "Multiple active sessions exist for this Student and run.",
      );
    }
    const sessionId = existingActiveSessions[0]?.id ??
      buildDeterministicSessionId(instituteId, yearId, runId, studentId);
    const sessionReference = sessionsCollection.doc(sessionId);
    const sessionPath = sessionReference.path;
    const launchNonce = randomUUID();
    const launchCredential = await this.signSessionToken(studentUid, {
      instituteId,
      launchNonce,
      licenseLayer,
      role: "student",
      runId,
      sessionId,
      studentId,
      yearId,
    });
    const launchCredentialHash = hashSessionToken(launchCredential);
    const studentReference = this.firestore.doc(
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${STUDENTS_COLLECTION}/${studentId}`,
    );
    const licenseMainReference = this.firestore.doc(
      `${INSTITUTES_COLLECTION}/${instituteId}/${LICENSE_COLLECTION}/main`,
    );
    const licenseCurrentReference = this.firestore.doc(
      `${INSTITUTES_COLLECTION}/${instituteId}/${LICENSE_COLLECTION}/current`,
    );
    let disposition: SessionStartResult["disposition"] = "created";
    let status: SessionStartResult["status"] = "created";
    await this.firestore.runTransaction(async (transaction) => {
      const [
        runSnapshot,
        studentSnapshot,
        academicYearSnapshot,
        licenseMainSnapshot,
        licenseCurrentSnapshot,
        candidateSessionSnapshot,
        studentSessionsSnapshot,
      ] = await Promise.all([
        transaction.get(runReference),
        transaction.get(studentReference),
        transaction.get(academicYearReference),
        transaction.get(licenseMainReference),
        transaction.get(licenseCurrentReference),
        transaction.get(sessionReference),
        transaction.get(
          sessionsCollection.where("studentId", "==", studentId).limit(25),
        ),
      ]);
      const academicYearData = academicYearSnapshot.data();
      const runData = runSnapshot.data();

      if (!academicYearSnapshot.exists || !isPlainObject(academicYearData)) {
        throw new SessionStartValidationError(
          "NOT_FOUND",
          `Academic year "${yearId}" does not exist.`,
        );
      }

      dataTierPartitionService.assertOperationalAcademicYearAccess({
        operation: "session start",
        partition: dataTierPartitionService.buildAcademicYearPartition(
          academicYearReference.path,
          academicYearData,
        ),
      });

      if (!runSnapshot.exists || !isPlainObject(runData)) {
        throw new SessionStartValidationError(
          "NOT_FOUND",
          `Run "${runId}" does not exist.`,
        );
      }

      const payloadRunId = normalizeRequiredString(runData.runId, "run.runId");

      if (payloadRunId !== runId) {
        throw new SessionStartValidationError(
          "VALIDATION_ERROR",
          "Run payload runId must match the run document identifier.",
        );
      }

      const startWindow = normalizeRunWindowTimestamp(
        runData.startWindow,
        "run.startWindow",
      );
      const endWindow = normalizeRunWindowTimestamp(
        runData.endWindow,
        "run.endWindow",
      );

      if (
        nowMillis < startWindow.toMillis() ||
        nowMillis > endWindow.toMillis()
      ) {
        throw new SessionStartValidationError(
          "WINDOW_CLOSED",
          "Assignment window is not active.",
        );
      }

      const runStatus = String(runData.status ?? "").trim().toLowerCase();
      if (runStatus !== "scheduled" && runStatus !== "active") {
        throw new SessionStartValidationError(
          "SESSION_LOCKED",
          "Run is not eligible for session start or resume.",
        );
      }

      const recipientStudentIds = runData.recipientStudentIds;

      if (!Array.isArray(recipientStudentIds)) {
        throw new SessionStartValidationError(
          "VALIDATION_ERROR",
          "Run field \"recipientStudentIds\" must be an array.",
        );
      }

      const isAssigned = recipientStudentIds.some(
        (recipientStudentId) => String(recipientStudentId).trim() === studentId,
      );

      if (!isAssigned) {
        throw new SessionStartValidationError(
          "FORBIDDEN",
          "Student is not assigned to this run.",
        );
      }

      const studentData = studentSnapshot.data();
      if (!studentSnapshot.exists || studentData?.deleted === true) {
        throw new SessionStartValidationError(
          "NOT_FOUND",
          `Student "${studentId}" does not exist in the institute.`,
        );
      }

      const storedStudentId = typeof studentData?.studentId === "string" ?
        studentData.studentId.trim() :
        studentId;
      if (storedStudentId !== studentId) {
        throw new SessionStartValidationError(
          "FORBIDDEN",
          "Authenticated Student does not match the institute record.",
        );
      }

      const studentStatus = String(studentData?.status ?? "")
        .trim()
        .toLowerCase();

      if (!ACTIVE_STUDENT_STATUSES.has(studentStatus)) {
        throw new SessionStartValidationError(
          "FORBIDDEN",
          "Student is not active.",
        );
      }

      const licenseData = resolveLicenseData(
        licenseMainSnapshot,
        licenseCurrentSnapshot,
      );
      const currentLayer = normalizeRequiredString(
        licenseData.currentLayer,
        "license.currentLayer",
      );
      if (currentLayer !== licenseLayer) {
        throw new SessionStartValidationError(
          "LICENSE_RESTRICTED",
          "Authenticated license layer is not current for session launch.",
        );
      }

      const mode = normalizeSessionExecutionMode(runData.mode, "run.mode");
      if (!ALLOWED_MODES_BY_LAYER[licenseLayer].includes(mode)) {
        throw new SessionStartValidationError(
          "LICENSE_RESTRICTED",
          `License layer ${licenseLayer} does not permit ${mode} sessions.`,
        );
      }

      const activeSessionDocuments = studentSessionsSnapshot.docs.filter(
        (snapshot) => ACTIVE_SESSION_STATUSES.includes(
          String(snapshot.data().status ?? "").trim().toLowerCase(),
        ),
      );
      if (activeSessionDocuments.length > 1) {
        throw new SessionStartValidationError(
          "CONFLICT",
          "Multiple active sessions exist for this Student and run.",
        );
      }
      const activeSessionDocument = activeSessionDocuments[0];
      if (activeSessionDocument && activeSessionDocument.id !== sessionId) {
        throw new SessionStartValidationError(
          "CONFLICT",
          "Session launch authority changed during the request; retry safely.",
        );
      }

      if (candidateSessionSnapshot.exists) {
        const sessionData = candidateSessionSnapshot.data();
        const persistedSessionId = normalizeRequiredString(
          sessionData?.sessionId,
          "session.sessionId",
        );
        const persistedStudentId = normalizeRequiredString(
          sessionData?.studentId,
          "session.studentId",
        );
        const persistedStudentUid = normalizeRequiredString(
          sessionData?.studentUid,
          "session.studentUid",
        );
        const persistedRunId = normalizeRequiredString(
          sessionData?.runId,
          "session.runId",
        );
        const persistedYearId = normalizeRequiredString(
          sessionData?.yearId,
          "session.yearId",
        );
        const persistedInstituteId = normalizeRequiredString(
          sessionData?.instituteId,
          "session.instituteId",
        );
        if (
          persistedSessionId !== sessionId ||
          persistedStudentId !== studentId ||
          persistedStudentUid !== studentUid ||
          persistedRunId !== runId ||
          persistedYearId !== yearId ||
          persistedInstituteId !== instituteId
        ) {
          throw new SessionStartValidationError(
            "CONFLICT",
            "Existing session does not match the authenticated launch scope.",
          );
        }
        const persistedStatus = normalizeSessionStatus(
          sessionData?.status,
          "session.status",
        );
        if (!ACTIVE_SESSION_STATUSES.includes(persistedStatus)) {
          throw new SessionStartValidationError(
            "SESSION_LOCKED",
            "Existing session is not eligible for start or resume.",
          );
        }
        const credentialHashes = normalizeLaunchCredentialHashes(
          sessionData?.launchCredentialHashes,
          sessionData?.sessionTokenHash,
        );
        credentialHashes.push(launchCredentialHash);
        transaction.update(sessionReference, {
          launchCredentialHashes: Array.from(new Set(credentialHashes))
            .slice(-MAX_LAUNCH_CREDENTIAL_HASHES),
          sessionTokenHash: launchCredentialHash,
          updatedAt: FieldValue.serverTimestamp(),
        });
        disposition = intent === "resume" ? "resumed" : "replayed";
        status = persistedStatus as SessionStartResult["status"];
        return;
      }

      if (intent === "resume") {
        throw new SessionStartValidationError(
          "NOT_FOUND",
          "No active session exists to resume for this Student and run.",
        );
      }

      const timingProfileSnapshot = normalizeTimingProfileSnapshot(
        runData.timingProfileSnapshot,
        "run.timingProfileSnapshot",
      );
      const calibrationVersion = normalizeVersionString(
        runData.calibrationVersion,
        "run.calibrationVersion",
      );
      const riskModelVersion = normalizeRiskModelVersion(
        runData.riskModelVersion,
      );
      const templateVersion = normalizeVersionString(
        runData.templateVersion,
        "run.templateVersion",
      );
      const questionIds = normalizeQuestionIds(
        runData.questionIds,
        "questionIds",
      );
      const phaseConfigSnapshot = normalizeRunPhaseConfigSnapshot(
        runData.phaseConfigSnapshot,
      );
      const licenseSnapshot = buildLicenseSnapshot(licenseData, currentLayer);
      const templateSnapshot = buildTemplateSnapshot(
        runData,
        questionIds,
        templateVersion,
      );
      const questionReferences = questionIds.map((questionId) =>
        this.firestore.doc(
          `${INSTITUTES_COLLECTION}/${instituteId}/` +
            `${QUESTION_BANK_COLLECTION}/${questionId}`,
        )
      );
      const questionSnapshots = await transaction.getAll(...questionReferences);
      const runtimeSnapshot = buildSessionRuntimeSnapshot({
        licenseSnapshot,
        mode,
        phaseConfigSnapshot,
        questionIds,
        questionSnapshots,
        runData,
        sessionId,
        templateVersion,
        timingProfileSnapshot,
      });
      const questionSnapshotsById = new Map(questionSnapshots.map((snapshot) => [
        snapshot.id,
        snapshot,
      ]));
      const questionTimeMap: SessionQuestionTimeMap = {};

      runtimeSnapshot.questions.forEach((runtimeQuestion) => {
        const questionSnapshot = questionSnapshotsById.get(runtimeQuestion.id);
        if (!questionSnapshot?.exists) {
          throw new SessionStartValidationError(
            "VALIDATION_ERROR",
            "Run references a question that does not exist in institute " +
              `questionBank: "${runtimeQuestion.id}".`,
          );
        }

        const difficulty = normalizeQuestionDifficulty(
          questionSnapshot.data()?.difficulty,
          `questionBank.${runtimeQuestion.id}.difficulty`,
        );
        const timingWindow = timingProfileSnapshot[difficulty];
        const phaseTimingRules = buildQuestionPhaseTimingRuleSet(
          difficulty,
          normalizeDifficultyTimingProfile(timingProfileSnapshot),
          {
            phase1Percent: Number(phaseConfigSnapshot.phase1Percent ?? 0),
            phase2Percent: Number(phaseConfigSnapshot.phase2Percent ?? 0),
            phase3Percent: Number(phaseConfigSnapshot.phase3Percent ?? 0),
          },
        );

        questionTimeMap[runtimeQuestion.id] = {
          bufferTimeSpent: 0,
          cumulativeTimeSpent: 0,
          enteredAt: null,
          exitedAt: null,
          lastEntryTimestamp: null,
          maxTime: timingWindow.max,
          minTime: timingWindow.min,
          phase1TimeSpent: 0,
          phase2TimeSpent: 0,
          phase3TimeSpent: 0,
          phaseTimingRules,
          recommendedTime: timingWindow.recommended,
        };
      });

      const initializationRecord = this.buildSessionInitializationRecord({
        calibrationVersion,
        consumedLaunchCredentialHashes: [],
        instituteId,
        licenseSnapshot,
        launchCredentialHashes: [launchCredentialHash],
        mode,
        phaseConfigSnapshot,
        questionTimeMap,
        riskModelVersion,
        runtimeSnapshot,
        runId,
        sessionId,
        sessionTokenHash: launchCredentialHash,
        studentId,
        studentUid,
        templateSnapshot,
        templateVersion,
        timingProfileSnapshot,
        yearId,
      });

      transaction.create(sessionReference, initializationRecord);

      disposition = "created";
      status = "created";

      this.logger.info("Session start validated and document initialized", {
        instituteId,
        calibrationVersion,
        licenseLayer: currentLayer,
        questionCount: questionIds.length,
        riskModelVersion,
        runId,
        sessionId,
        sessionPath,
        studentId,
        templateVersion,
        yearId,
      });
    });

    return {
      disposition,
      launchCredential,
      operationalDataAccessPolicy:
        dataTierPartitionService.buildExamOperationalDataAccessPolicy(
          sessionPath,
        ),
      sessionId,
      sessionPath,
      status,
      yearId,
    };
  }

  /**
   * Consumes a launch credential and validates its exchanged Firebase identity.
   * @param {SessionEntryValidationContext} context Credential and ID claims.
   * @param {number} nowMillis Server time used for lifecycle reconciliation.
   * @return {Promise<SessionEntryValidationResult>} Validated session metadata.
   */
  public async validateSessionEntry(
    context: SessionEntryValidationContext,
    nowMillis = Date.now(),
  ): Promise<SessionEntryValidationResult> {
    const instituteId = normalizeRequiredString(context.instituteId, "instituteId");
    const launchNonce = normalizeRequiredString(context.launchNonce, "launchNonce");
    const licenseLayer = normalizeLicenseLayer(context.licenseLayer);
    const runId = normalizeRequiredString(context.runId, "runId");
    const routeSessionId = normalizeRequiredString(context.sessionId, "sessionId");
    const token = normalizeRequiredString(context.sessionToken, "sessionToken");
    const studentId = normalizeRequiredString(context.studentId, "studentId");
    const studentUid = normalizeRequiredString(context.studentUid, "studentUid");
    const yearId = normalizeRequiredString(context.yearId, "yearId");
    const claims = decodeSessionTokenClaims(token);
    const expectedClaims: Record<string, string> = {
      instituteId,
      launchNonce,
      licenseLayer,
      role: "student",
      runId,
      sessionId: routeSessionId,
      studentId,
      yearId,
    };
    for (const [claimName, expectedValue] of Object.entries(expectedClaims)) {
      if (normalizeRequiredString(claims[claimName], `token.${claimName}`) !== expectedValue) {
        throw new SessionStartValidationError(
          "UNAUTHORIZED",
          "Launch credential does not match the authenticated exam session.",
        );
      }
    }

    const sessionPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUNS_COLLECTION}/${runId}/` +
      `${SESSIONS_COLLECTION}/${routeSessionId}`;
    const sessionReference = this.firestore.doc(sessionPath);
    const launchCredentialHash = hashSessionToken(token);
    let result: SessionEntryValidationResult | null = null;

    await this.firestore.runTransaction(async (transaction) => {
      const sessionSnapshot = await transaction.get(sessionReference);
      const sessionData = sessionSnapshot.data();
      if (!sessionSnapshot.exists || !isPlainObject(sessionData)) {
        throw new SessionStartValidationError(
          "NOT_FOUND",
          `Session "${routeSessionId}" does not exist.`,
        );
      }
      let status = normalizeSessionStatus(sessionData.status, "session.status");
      if (!ACTIVE_SESSION_STATUSES.includes(status)) {
        throw new SessionStartValidationError(
          "SESSION_LOCKED",
          "Session is not active for exam runtime entry.",
        );
      }
      const persistedIdentity = {
        instituteId: normalizeRequiredString(sessionData.instituteId, "session.instituteId"),
        runId: normalizeRequiredString(sessionData.runId, "session.runId"),
        sessionId: normalizeRequiredString(sessionData.sessionId, "session.sessionId"),
        studentId: normalizeRequiredString(sessionData.studentId, "session.studentId"),
        studentUid: normalizeRequiredString(sessionData.studentUid, "session.studentUid"),
        yearId: normalizeRequiredString(sessionData.yearId, "session.yearId"),
      };
      if (
        persistedIdentity.instituteId !== instituteId ||
        persistedIdentity.runId !== runId ||
        persistedIdentity.sessionId !== routeSessionId ||
        persistedIdentity.studentId !== studentId ||
        persistedIdentity.studentUid !== studentUid ||
        persistedIdentity.yearId !== yearId
      ) {
        throw new SessionStartValidationError(
          "UNAUTHORIZED",
          "Authenticated exam identity does not own the requested session.",
        );
      }

      const storedLaunchCredentialHashes = normalizeLaunchCredentialHashes(
        sessionData.launchCredentialHashes,
        sessionData.sessionTokenHash,
      );
      const consumedLaunchCredentialHashes = normalizeLaunchCredentialHashes(
        sessionData.consumedLaunchCredentialHashes,
        undefined,
      );
      if (consumedLaunchCredentialHashes.includes(launchCredentialHash)) {
        throw new SessionStartValidationError(
          "UNAUTHORIZED",
          "Launch credential has already been consumed.",
        );
      }
      if (!storedLaunchCredentialHashes.includes(launchCredentialHash)) {
        throw new SessionStartValidationError(
          "UNAUTHORIZED",
          "Launch credential does not match a backend-issued session credential.",
        );
      }

      const mode = normalizeSessionExecutionMode(sessionData.mode, "session.mode");
      const timingProfileSnapshot = normalizeTimingProfileSnapshot(
        sessionData.timingProfileSnapshot,
        "session.timingProfileSnapshot",
      );
      const phaseConfigSnapshot = normalizeSnapshotObject(
        sessionData.phaseConfigSnapshot,
        "phaseConfigSnapshot",
      );
      const licenseSnapshot = normalizeSnapshotObject(
        sessionData.licenseSnapshot,
        "licenseSnapshot",
      );
      if (licenseSnapshot.currentLayer !== licenseLayer) {
        throw new SessionStartValidationError(
          "LICENSE_RESTRICTED",
          "Authenticated exam license does not match the session snapshot.",
        );
      }
      const templateSnapshot = normalizeSnapshotObject(
        sessionData.templateSnapshot,
        "templateSnapshot",
      );
      const runtimeSnapshot = normalizeStoredRuntimeSnapshot(
        sessionData.runtimeSnapshot,
        routeSessionId,
        sessionData.questionTimeMap,
      );
      const scheduledDeadline = normalizeRunWindowTimestamp(
        runtimeSnapshot.schedule.sessionEndsAt,
        "runtimeSnapshot.schedule.sessionEndsAt",
      );
      let startedAt = normalizeOptionalSessionTimestampIso(
        sessionData.startedAt,
        "session.startedAt",
      );
      let deadlineAt = normalizeOptionalSessionTimestampIso(
        sessionData.deadlineAt,
        "session.deadlineAt",
      );
      const remainingCredentialHashes = storedLaunchCredentialHashes.filter(
        (credentialHash) => credentialHash !== launchCredentialHash,
      );
      const nextConsumedHashes = Array.from(new Set([
        ...consumedLaunchCredentialHashes,
        launchCredentialHash,
      ])).slice(-MAX_LAUNCH_CREDENTIAL_HASHES);
      const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        consumedLaunchCredentialHashes: nextConsumedHashes,
        launchCredentialConsumedAt: FieldValue.serverTimestamp(),
        launchCredentialConsumedByUid: studentUid,
        launchCredentialHashes: remainingCredentialHashes,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (status === "created") {
        status = "started";
        update.status = status;
      }
      if (status === "active" && deadlineAt === null) {
        deadlineAt = scheduledDeadline.toDate().toISOString();
        update.deadlineAt = scheduledDeadline;
      }
      if (status === "active" && startedAt === null) {
        startedAt = new Date(nowMillis).toISOString();
        update.startedAt = Timestamp.fromMillis(nowMillis);
      }
      if (
        status === "active" &&
        deadlineAt !== null &&
        nowMillis >= Date.parse(deadlineAt)
      ) {
        status = "expired";
        update.expiredAt = Timestamp.fromMillis(nowMillis);
        update.status = status;
      }
      if (sessionData.sessionTokenHash === launchCredentialHash) {
        update.sessionTokenHash = FieldValue.delete();
      }
      transaction.update(sessionReference, update);

      result = {
        deadlineAt,
        instituteId,
        licenseSnapshot,
        mode,
        operationalDataAccessPolicy:
          dataTierPartitionService.buildExamOperationalDataAccessPolicy(sessionPath),
        phaseConfigSnapshot,
        runId,
        runtimeSnapshot,
        serverTime: new Date(nowMillis).toISOString(),
        sessionId: routeSessionId,
        sessionPath,
        startedAt,
        status,
        studentId,
        templateSnapshot,
        timingProfileSnapshot,
        yearId,
      };
    });

    if (!result) {
      throw new SessionStartValidationError(
        "UNAUTHORIZED",
        "Exam session entry could not be authorized.",
      );
    }
    return result;
  }

  /**
   * Activates an entered session using only persisted schedule and identity.
   * @param {SessionActivationContext} context Verified session identity.
   * @param {number} nowMillis Server time used for activation and expiry.
   * @return {Promise<SessionActivationResult>} Authoritative lifecycle clock.
   */
  public async activateSession(
    context: SessionActivationContext,
    nowMillis = Date.now(),
  ): Promise<SessionActivationResult> {
    const instituteId = normalizeRequiredString(context.instituteId, "instituteId");
    const runId = normalizeRequiredString(context.runId, "runId");
    const sessionId = normalizeRequiredString(context.sessionId, "sessionId");
    const studentId = normalizeRequiredString(context.studentId, "studentId");
    const studentUid = normalizeRequiredString(context.studentUid, "studentUid");
    const yearId = normalizeRequiredString(context.yearId, "yearId");
    const sessionPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUNS_COLLECTION}/${runId}/` +
      `${SESSIONS_COLLECTION}/${sessionId}`;
    const sessionReference = this.firestore.doc(sessionPath);

    const result = await this.firestore.runTransaction(async (transaction) => {
      const sessionSnapshot = await transaction.get(sessionReference);
      const sessionData = sessionSnapshot.data();
      if (!sessionSnapshot.exists || !isPlainObject(sessionData)) {
        throw new SessionStartValidationError(
          "NOT_FOUND",
          `Session "${sessionId}" does not exist.`,
        );
      }

      const persistedIdentity = {
        instituteId: normalizeRequiredString(sessionData.instituteId, "session.instituteId"),
        runId: normalizeRequiredString(sessionData.runId, "session.runId"),
        sessionId: normalizeRequiredString(sessionData.sessionId, "session.sessionId"),
        studentId: normalizeRequiredString(sessionData.studentId, "session.studentId"),
        studentUid: normalizeRequiredString(sessionData.studentUid, "session.studentUid"),
        yearId: normalizeRequiredString(sessionData.yearId, "session.yearId"),
      };
      if (
        persistedIdentity.instituteId !== instituteId ||
        persistedIdentity.runId !== runId ||
        persistedIdentity.sessionId !== sessionId ||
        persistedIdentity.studentId !== studentId ||
        persistedIdentity.studentUid !== studentUid ||
        persistedIdentity.yearId !== yearId
      ) {
        throw new SessionStartValidationError(
          "UNAUTHORIZED",
          "Authenticated exam identity does not own the requested session.",
        );
      }

      let status = normalizeSessionStatus(sessionData.status, "session.status");
      if (status === "created") {
        throw new SessionStartValidationError(
          "SESSION_LOCKED",
          "Session entry must complete before activation.",
        );
      }
      if (status === "submitted" || status === "terminated") {
        throw new SessionStartValidationError(
          "SESSION_LOCKED",
          `Session cannot activate from ${status}.`,
        );
      }

      const runtimeSnapshot = normalizeStoredRuntimeSnapshot(
        sessionData.runtimeSnapshot,
        sessionId,
        sessionData.questionTimeMap,
      );
      const scheduledStart = normalizeRunWindowTimestamp(
        runtimeSnapshot.schedule.sessionStartsAt,
        "runtimeSnapshot.schedule.sessionStartsAt",
      );
      const scheduledDeadline = normalizeRunWindowTimestamp(
        runtimeSnapshot.schedule.sessionEndsAt,
        "runtimeSnapshot.schedule.sessionEndsAt",
      );
      let startedAt = normalizeOptionalSessionTimestampIso(
        sessionData.startedAt,
        "session.startedAt",
      );
      const deadlineAt = normalizeOptionalSessionTimestampIso(
        sessionData.deadlineAt,
        "session.deadlineAt",
      ) ?? scheduledDeadline.toDate().toISOString();
      const replayed = status === "active" || status === "expired";
      const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {};

      if (status === "started" && nowMillis < scheduledStart.toMillis()) {
        throw new SessionStartValidationError(
          "WINDOW_CLOSED",
          "Session activation is not open yet.",
        );
      }

      if (status === "started" && nowMillis < scheduledDeadline.toMillis()) {
        this.assertTransitionIsAllowed("student", status, "active");
        status = "active";
        startedAt = new Date(nowMillis).toISOString();
        update.startedAt = Timestamp.fromMillis(nowMillis);
        update.status = status;
      }

      if (
        (status === "started" || status === "active") &&
        nowMillis >= Date.parse(deadlineAt)
      ) {
        this.assertTransitionIsAllowed("system", status, "expired");
        status = "expired";
        update.expiredAt = Timestamp.fromMillis(nowMillis);
        update.status = status;
      }

      if (sessionData.deadlineAt === null || sessionData.deadlineAt === undefined) {
        update.deadlineAt = scheduledDeadline;
      }
      if (Object.keys(update).length > 0) {
        update.updatedAt = FieldValue.serverTimestamp();
        transaction.update(sessionReference, update);
      }

      return {
        deadlineAt,
        replayed,
        serverTime: new Date(nowMillis).toISOString(),
        sessionId,
        sessionPath,
        startedAt,
        status: status as SessionActivationResult["status"],
      };
    });

    this.logger.info("Session activation reconciled", {
      instituteId,
      replayed: result.replayed,
      runId,
      sessionId,
      status: result.status,
      yearId,
    });

    return result;
  }

  /**
   * Applies the architecture-defined session lifecycle state machine.
   * @param {SessionStateTransitionContext} context Session identifiers.
   * @param {SessionStatus} nextStatus Requested next session state.
   * @return {Promise<SessionStateTransitionResult>} Updated session metadata.
   */
  public async transitionSessionState(
    context: SessionStateTransitionContext,
    nextStatus: SessionStatus,
  ): Promise<SessionStateTransitionResult> {
    const instituteId = normalizeRequiredString(
      context.instituteId,
      "instituteId",
    );
    const yearId = normalizeRequiredString(context.yearId, "yearId");
    const runId = normalizeRequiredString(context.runId, "runId");
    const sessionId = normalizeRequiredString(context.sessionId, "sessionId");
    const actorType = normalizeSessionTransitionActorType(
      context.actorType,
      "actorType",
    );
    const normalizedNextStatus = normalizeSessionStatus(nextStatus, "status");
    const sessionPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUNS_COLLECTION}/${runId}/` +
      `${SESSIONS_COLLECTION}/${sessionId}`;
    const sessionReference = this.firestore.doc(sessionPath);

    const transitionResult = await this.firestore.runTransaction(async (
      transaction,
    ) => {
      const sessionSnapshot = await transaction.get(sessionReference);
      const sessionData = sessionSnapshot.data();

      if (!sessionSnapshot.exists || !isPlainObject(sessionData)) {
        throw new SessionStartValidationError(
          "NOT_FOUND",
          `Session "${sessionId}" does not exist.`,
        );
      }

      const currentStatus = normalizeSessionStatus(
        sessionData.status,
        "session.status",
      );

      this.assertTransitionIsAllowed(
        actorType,
        currentStatus,
        normalizedNextStatus,
      );

      transaction.update(sessionReference, {
        status: normalizedNextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        fromStatus: currentStatus,
        sessionId,
        sessionPath,
        status: normalizedNextStatus,
      };
    });

    this.logger.info("Session state transition applied", {
      actorType,
      fromStatus: transitionResult.fromStatus,
      instituteId,
      runId,
      sessionId,
      status: transitionResult.status,
      yearId,
    });

    return transitionResult;
  }

  /**
   * Returns the architecture-defined answer write batching policy (Build 29).
   * @return {SessionWriteBatchingPolicy} Immutable write policy constraints.
   */
  public getAnswerWriteBatchingPolicy(): SessionWriteBatchingPolicy {
    return {
      maxPendingAnswers: SESSION_WRITE_BATCHING_POLICY.maxPendingAnswers,
      minimumWriteIntervalMs:
        SESSION_WRITE_BATCHING_POLICY.minimumWriteIntervalMs,
    };
  }

  /**
   * Evaluates if a write flush should execute using Build 29 constraints.
   * @param {SessionWriteBatchingEvaluationInput} input Client buffer metrics.
   * @return {SessionWriteBatchingEvaluationResult} Flush decision details.
   */
  public evaluateAnswerWriteBatching(
    input: SessionWriteBatchingEvaluationInput,
  ): SessionWriteBatchingEvaluationResult {
    const pendingAnswersCount = normalizeNonNegativeInteger(
      input.pendingAnswersCount,
      "pendingAnswersCount",
    );
    const millisecondsSinceLastWrite = normalizeNonNegativeInteger(
      input.millisecondsSinceLastWrite,
      "millisecondsSinceLastWrite",
    );
    const reasons: SessionWriteBatchingReason[] = [];

    if (
      pendingAnswersCount >= SESSION_WRITE_BATCHING_POLICY.maxPendingAnswers
    ) {
      reasons.push("MAX_PENDING_ANSWERS_REACHED");
    }

    if (
      millisecondsSinceLastWrite >=
      SESSION_WRITE_BATCHING_POLICY.minimumWriteIntervalMs
    ) {
      reasons.push("WRITE_INTERVAL_ELAPSED");
    }

    return {
      policy: this.getAnswerWriteBatchingPolicy(),
      reasons,
      shouldWrite: reasons.length > 0,
    };
  }

  /**
   * Enforces Build 29 answer-write contract constraints for backend APIs.
   * @param {number} answersInBatchCount Answer updates in current write.
   * @param {number} millisecondsSinceLastWrite Time since previous write.
   */
  public assertAnswerWriteBatchingConstraints(
    answersInBatchCount: number,
    millisecondsSinceLastWrite: number,
  ): void {
    const normalizedAnswersInBatchCount = normalizeNonNegativeInteger(
      answersInBatchCount,
      "answersInBatchCount",
    );
    const normalizedMillisecondsSinceLastWrite = normalizeNonNegativeInteger(
      millisecondsSinceLastWrite,
      "millisecondsSinceLastWrite",
    );

    if (
      normalizedAnswersInBatchCount >
      SESSION_WRITE_BATCHING_POLICY.maxPendingAnswers
    ) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        "Answer batch size exceeds maximum of " +
          `${SESSION_WRITE_BATCHING_POLICY.maxPendingAnswers}.`,
      );
    }

    if (
      normalizedMillisecondsSinceLastWrite <
      SESSION_WRITE_BATCHING_POLICY.minimumWriteIntervalMs
    ) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        "Minimum write interval is " +
          `${SESSION_WRITE_BATCHING_POLICY.minimumWriteIntervalMs}ms.`,
      );
    }
  }

  /**
   * Enforces forward-only transition ordering and actor restrictions.
   * @param {string} actorType Actor type.
   * @param {string} currentStatus Current persisted status.
   * @param {string} nextStatus Requested next status.
   */
  private assertTransitionIsAllowed(
    actorType: SessionStateTransitionContext["actorType"],
    currentStatus: SessionStatus,
    nextStatus: SessionStatus,
  ): void {
    const allowedNextStates =
      ALLOWED_SESSION_STATUS_TRANSITIONS[currentStatus] ?? [];

    if (!allowedNextStates.includes(nextStatus)) {
      if (
        SESSION_STATUS_TRANSITION_ORDER[nextStatus] <=
        SESSION_STATUS_TRANSITION_ORDER[currentStatus]
      ) {
        throw new SessionStartValidationError(
          "VALIDATION_ERROR",
          `Session transition ${currentStatus} -> ${nextStatus} ` +
            "is not forward-only.",
        );
      }

      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        `Session transition ${currentStatus} -> ${nextStatus} is not allowed.`,
      );
    }

    if (nextStatus === "active" && actorType !== "student") {
      throw new SessionStartValidationError(
        "FORBIDDEN",
        "Only students may transition a session to active.",
      );
    }

    if (nextStatus === "submitted" && actorType !== "backend") {
      throw new SessionStartValidationError(
        "FORBIDDEN",
        "Only backend services may transition a session to submitted.",
      );
    }
  }

  /**
   * Creates the architecture-defined initial session record for Build 28.
   * @param {SessionDocumentInitializationContext} context Session identifiers.
   * @return {SessionDocumentInitializationRecord} Initial session document.
   */
  private buildSessionInitializationRecord(
    context: SessionDocumentInitializationContext,
  ): SessionDocumentInitializationRecord {
    return {
      answerMap: {},
      calibrationVersion: context.calibrationVersion,
      consumedLaunchCredentialHashes:
        context.consumedLaunchCredentialHashes,
      createdAt: FieldValue.serverTimestamp(),
      deadlineAt: null,
      instituteId: context.instituteId,
      licenseSnapshot: context.licenseSnapshot,
      launchCredentialHashes: context.launchCredentialHashes,
      mode: context.mode,
      operationalDataAccessPolicy:
        dataTierPartitionService.buildExamOperationalDataAccessPolicy(
          `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
            `${ACADEMIC_YEARS_COLLECTION}/${context.yearId}/` +
            `${RUNS_COLLECTION}/${context.runId}/` +
            `${SESSIONS_COLLECTION}/${context.sessionId}`,
        ),
      phaseConfigSnapshot: context.phaseConfigSnapshot,
      questionTimeMap: context.questionTimeMap,
      riskModelVersion: context.riskModelVersion,
      runtimeSnapshot: context.runtimeSnapshot,
      runId: context.runId,
      sessionId: context.sessionId,
      sessionTokenHash: context.sessionTokenHash,
      startedAt: null,
      status: "created",
      studentId: context.studentId,
      studentUid: context.studentUid,
      submissionLock: false,
      submittedAt: null,
      templateSnapshot: context.templateSnapshot,
      templateVersion: context.templateVersion,
      timingProfileSnapshot: context.timingProfileSnapshot,
      updatedAt: FieldValue.serverTimestamp(),
      version: 1,
      yearId: context.yearId,
    };
  }
}

export const sessionService = new SessionService();
