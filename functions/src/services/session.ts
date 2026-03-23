import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {
  SessionStartContext,
  SessionStartErrorCode,
  SessionStartResult,
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

      transaction.create(sessionReference, {
        answerMap: {},
        createdAt: FieldValue.serverTimestamp(),
        instituteId,
        runId,
        sessionId,
        startedAt: null,
        status: "created",
        studentId,
        studentUid,
        submissionLock: false,
        submittedAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        version: 1,
        yearId,
      });

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
}

export const sessionService = new SessionService();
