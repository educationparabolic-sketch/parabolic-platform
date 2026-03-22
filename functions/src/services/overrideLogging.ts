import {randomUUID} from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  OverrideLogEntry,
  OverrideLogEntryInput,
  OverrideLogWriteResult,
  OverrideType,
} from "../types/overrideLogs";

const INSTITUTES_COLLECTION = "institutes";
const OVERRIDE_LOGS_COLLECTION = "overrideLogs";
const ALLOWED_OVERRIDE_TYPES = new Set<OverrideType>([
  "MIN_TIME_BYPASS",
  "FORCE_SUBMIT",
  "MODE_CHANGE",
  "EMERGENCY_ADJUSTMENT",
]);

/**
 * Raised when an execution override log fails validation.
 */
class OverrideLogValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "OverrideLogValidationError";
  }
}

const normalizeRequiredString = (
  value: string,
  fieldName: string,
): string => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new OverrideLogValidationError(
      `Override log field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalString = (
  value: string | undefined,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const normalizeOverrideType = (value: OverrideType): OverrideType => {
  const normalizedValue = normalizeRequiredString(
    value,
    "overrideType",
  ) as OverrideType;

  if (!ALLOWED_OVERRIDE_TYPES.has(normalizedValue)) {
    throw new OverrideLogValidationError(
      "Override log field \"overrideType\" must be one of " +
      `${Array.from(ALLOWED_OVERRIDE_TYPES).join(", ")}.`,
    );
  }

  return normalizedValue;
};

const buildOverrideLogPath = (
  instituteId: string,
  overrideId: string,
): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}/` +
  `${OVERRIDE_LOGS_COLLECTION}/${overrideId}`;

/**
 * Persists immutable institute execution override records.
 */
export class OverrideLoggingService {
  private readonly logger = createLogger("OverrideLoggingService");

  /**
   * Creates an immutable institute-scoped override log entry.
   * @param {OverrideLogEntryInput} input Override metadata to persist.
   * @return {Promise<OverrideLogWriteResult>} Stored override metadata.
   */
  public async createOverrideLog(
    input: OverrideLogEntryInput,
  ): Promise<OverrideLogWriteResult> {
    const instituteId = normalizeRequiredString(
      input.instituteId,
      "instituteId",
    );
    const overrideId =
      normalizeOptionalString(input.overrideId) ?? randomUUID();
    const overridePath = buildOverrideLogPath(instituteId, overrideId);

    const entry: OverrideLogEntry = {
      instituteId,
      justification: normalizeRequiredString(
        input.justification,
        "justification",
      ),
      overrideId,
      overrideType: normalizeOverrideType(input.overrideType),
      performedBy: normalizeRequiredString(input.performedBy, "performedBy"),
      runId: normalizeRequiredString(input.runId, "runId"),
      sessionId: normalizeRequiredString(input.sessionId, "sessionId"),
      studentId: normalizeRequiredString(input.studentId, "studentId"),
      timestamp: FieldValue.serverTimestamp(),
    };

    await getFirestore().doc(overridePath).create(entry);

    this.logger.info("Execution override log stored", {
      instituteId,
      overrideId,
      overrideType: entry.overrideType,
      path: overridePath,
      performedBy: entry.performedBy,
      runId: entry.runId,
      sessionId: entry.sessionId,
      studentId: entry.studentId,
    });

    return {
      instituteId,
      overrideId,
      path: overridePath,
    };
  }
}

export const overrideLoggingService = new OverrideLoggingService();
