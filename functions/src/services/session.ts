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
  started: ["active"],
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
): string => normalizeRequiredString(value, fieldName);

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
    const launchCredential = await this.signSessionToken(studentUid, {
      instituteId,
      launchNonce: randomUUID(),
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
      const questionTimeMap: SessionQuestionTimeMap = {};

      questionSnapshots.forEach((questionSnapshot, index) => {
        if (!questionSnapshot.exists) {
          throw new SessionStartValidationError(
            "VALIDATION_ERROR",
            "Run references a question that does not exist in institute " +
              `questionBank: "${questionIds[index]}".`,
          );
        }

        const difficulty = normalizeQuestionDifficulty(
          questionSnapshot.data()?.difficulty,
          `questionBank.${questionIds[index]}.difficulty`,
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

        questionTimeMap[questionIds[index]] = {
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
        instituteId,
        licenseSnapshot,
        launchCredentialHashes: [launchCredentialHash],
        mode,
        phaseConfigSnapshot,
        questionTimeMap,
        riskModelVersion,
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
   * Validates that an exam runtime entry token matches an existing HOT session.
   * @param {SessionEntryValidationContext} context Entry token and route id.
   * @return {Promise<SessionEntryValidationResult>} Validated session metadata.
   */
  public async validateSessionEntry(
    context: SessionEntryValidationContext,
  ): Promise<SessionEntryValidationResult> {
    const routeSessionId = normalizeRequiredString(
      context.sessionId,
      "sessionId",
    );
    const token = normalizeRequiredString(
      context.sessionToken,
      "sessionToken",
    );
    const claims = decodeSessionTokenClaims(token);
    const instituteId = normalizeRequiredString(
      claims.instituteId,
      "token.instituteId",
    );
    const yearId = normalizeRequiredString(claims.yearId, "token.yearId");
    const runId = normalizeRequiredString(claims.runId, "token.runId");
    const tokenSessionId = normalizeRequiredString(
      claims.sessionId,
      "token.sessionId",
    );
    const studentId = normalizeRequiredString(
      claims.studentId ?? claims.sub,
      "token.studentId",
    );

    if (tokenSessionId !== routeSessionId) {
      throw new SessionStartValidationError(
        "UNAUTHORIZED",
        "Session token does not match the requested session route.",
      );
    }

    const sessionPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUNS_COLLECTION}/${runId}/` +
      `${SESSIONS_COLLECTION}/${routeSessionId}`;
    const sessionSnapshot = await this.firestore.doc(sessionPath).get();
    const sessionData = sessionSnapshot.data();

    if (!sessionSnapshot.exists || !isPlainObject(sessionData)) {
      throw new SessionStartValidationError(
        "NOT_FOUND",
        `Session "${routeSessionId}" does not exist.`,
      );
    }

    const status = normalizeSessionStatus(
      sessionData.status,
      "session.status",
    );
    if (!ACTIVE_SESSION_STATUSES.includes(status)) {
      throw new SessionStartValidationError(
        "SESSION_LOCKED",
        "Session is not active for exam runtime entry.",
      );
    }

    const sessionStudentId = normalizeRequiredString(
      sessionData.studentId,
      "session.studentId",
    );
    if (sessionStudentId !== studentId) {
      throw new SessionStartValidationError(
        "UNAUTHORIZED",
        "Session token student does not match the session record.",
      );
    }

    const storedLaunchCredentialHashes = normalizeLaunchCredentialHashes(
      sessionData.launchCredentialHashes,
      sessionData.sessionTokenHash,
    );
    if (!storedLaunchCredentialHashes.includes(hashSessionToken(token))) {
      throw new SessionStartValidationError(
        "UNAUTHORIZED",
        "Launch credential does not match a backend-issued session credential.",
      );
    }

    const mode = normalizeSessionExecutionMode(
      sessionData.mode,
      "session.mode",
    );
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
    const templateSnapshot = normalizeSnapshotObject(
      sessionData.templateSnapshot,
      "templateSnapshot",
    );

    return {
      instituteId,
      licenseSnapshot,
      mode,
      operationalDataAccessPolicy:
        dataTierPartitionService.buildExamOperationalDataAccessPolicy(
          sessionPath,
        ),
      phaseConfigSnapshot,
      runId,
      sessionId: routeSessionId,
      sessionPath,
      status,
      studentId,
      templateSnapshot,
      timingProfileSnapshot,
      yearId,
    };
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
      createdAt: FieldValue.serverTimestamp(),
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
