import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {
  SessionDocumentInitializationContext,
  SessionDocumentInitializationRecord,
  SessionStartContext,
  SessionStartErrorCode,
  SessionStartResult,
  SessionStateTransitionContext,
  SessionStateTransitionResult,
  SessionStatus,
  SessionTokenClaims,
} from "../types/sessionStart";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const STUDENTS_COLLECTION = "students";
const LICENSE_COLLECTION = "license";
const ACTIVE_STUDENT_STATUSES = new Set(["active"]);
const ACTIVE_SESSION_STATUSES = ["created", "started", "active"];
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

type SessionTokenSigner = (
  uid: string,
  claims: SessionTokenClaims,
) => Promise<string>;

const defaultSessionTokenSigner: SessionTokenSigner = async (
  uid,
  claims,
) => getFirebaseAdminApp().auth().createCustomToken(uid, claims);

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
    const yearId = normalizeRequiredString(context.yearId, "yearId");
    const runId = normalizeRequiredString(context.runId, "runId");
    const studentId = normalizeRequiredString(context.studentId, "studentId");
    const studentUid = normalizeRequiredString(
      context.studentUid,
      "studentUid",
    );

    const runPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUNS_COLLECTION}/${runId}`;
    const sessionsCollectionPath = `${runPath}/${SESSIONS_COLLECTION}`;
    const runReference = this.firestore.doc(runPath);
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
    const sessionReference = this.firestore.collection(sessionsCollectionPath)
      .doc();
    const sessionId = sessionReference.id;
    const sessionPath = `${sessionsCollectionPath}/${sessionId}`;
    const sessionToken = await this.signSessionToken(studentUid, {
      instituteId,
      role: "student",
      runId,
      sessionId,
      studentId,
      yearId,
    });

    await this.firestore.runTransaction(async (transaction) => {
      const [
        runSnapshot,
        studentSnapshot,
        licenseMainSnapshot,
        licenseCurrentSnapshot,
      ] = await Promise.all([
        transaction.get(runReference),
        transaction.get(studentReference),
        transaction.get(licenseMainReference),
        transaction.get(licenseCurrentReference),
      ]);
      const runData = runSnapshot.data();

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

      if (!studentSnapshot.exists) {
        throw new SessionStartValidationError(
          "NOT_FOUND",
          `Student "${studentId}" does not exist in the institute.`,
        );
      }

      const studentStatus = String(studentSnapshot.data()?.status ?? "")
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

      const existingStudentSessionSnapshot = await transaction.get(
        runReference.collection(SESSIONS_COLLECTION)
          .where("studentId", "==", studentId)
          .limit(25),
      );

      const hasActiveSession = existingStudentSessionSnapshot.docs.some(
        (snapshot) => ACTIVE_SESSION_STATUSES.includes(
          String(snapshot.data()?.status ?? "").trim().toLowerCase(),
        ),
      );

      if (hasActiveSession) {
        throw new SessionStartValidationError(
          "SESSION_LOCKED",
          "An active session already exists for this student and run.",
        );
      }

      const initializationRecord = this.buildSessionInitializationRecord({
        instituteId,
        runId,
        sessionId,
        studentId,
        studentUid,
        yearId,
      });

      transaction.create(sessionReference, initializationRecord);

      this.logger.info("Session start validated and document initialized", {
        instituteId,
        licenseLayer: currentLayer,
        runId,
        sessionId,
        sessionPath,
        studentId,
        yearId,
      });
    });

    return {
      sessionId,
      sessionPath,
      sessionToken,
      status: "created",
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
      createdAt: FieldValue.serverTimestamp(),
      instituteId: context.instituteId,
      runId: context.runId,
      sessionId: context.sessionId,
      startedAt: null,
      status: "created",
      studentId: context.studentId,
      studentUid: context.studentUid,
      submissionLock: false,
      submittedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      version: 1,
      yearId: context.yearId,
    };
  }
}

export const sessionService = new SessionService();
