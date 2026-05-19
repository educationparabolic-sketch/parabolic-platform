/* eslint-disable require-jsdoc */
import {adminSettingsService} from "./adminSettings";
import {
  AssignmentCreationValidationError,
  assignmentCreationService,
} from "./assignmentCreation";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminRunsCreateResult,
  AdminRunsValidatedRequest,
  AdminRunsValidationError,
} from "../types/adminRuns";
import {AssignmentMode} from "../types/assignmentCreation";

const ACADEMIC_YEARS_COLLECTION = "academicYears";
const INSTITUTES_COLLECTION = "institutes";
const RUNS_COLLECTION = "runs";

const ALLOWED_MODES = new Set<AssignmentMode>([
  "Controlled",
  "Diagnostic",
  "Hard",
  "Operational",
]);

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  return normalizeRequiredString(value, fieldName);
}

function normalizeMode(value: unknown): AssignmentMode {
  const mode = normalizeRequiredString(value, "mode") as AssignmentMode;

  if (!ALLOWED_MODES.has(mode)) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      "Field \"mode\" must be one of Operational, Diagnostic, " +
        "Controlled, or Hard.",
    );
  }

  return mode;
}

function normalizeIsoDate(value: unknown, fieldName: string): string {
  const rawValue = normalizeRequiredString(value, fieldName);
  const parsed = Date.parse(rawValue);

  if (Number.isNaN(parsed)) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a valid ISO date string.`,
    );
  }

  return new Date(parsed).toISOString();
}

function normalizePositiveInteger(value: unknown, fieldName: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
}

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-negative integer.`,
    );
  }

  return value;
}

function normalizeBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a boolean.`,
    );
  }

  return value;
}

function normalizeRecipientStudentIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      "Field \"recipientStudentIds\" must be an array of strings.",
    );
  }

  const normalizedIds = value.map((entry) =>
    normalizeRequiredString(entry, "recipientStudentIds[]"),
  );
  const uniqueIds = Array.from(new Set(normalizedIds));

  if (uniqueIds.length === 0) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      "Field \"recipientStudentIds\" must contain at least one student id.",
    );
  }

  if (uniqueIds.length !== normalizedIds.length) {
    throw new AdminRunsValidationError(
      "VALIDATION_ERROR",
      "Field \"recipientStudentIds\" must not contain duplicates.",
    );
  }

  return uniqueIds;
}

function resolveCurrentYearId(
  academicYears: Array<{status: string; yearId: string}>,
): string {
  const active =
    academicYears.find((year) =>
      year.status === "Active" ||
        year.status === "Started" ||
        year.status === "Scheduled",
    ) ?? academicYears[0];

  return active?.yearId ?? "unknown";
}

function toApiValidationError(error: unknown): AdminRunsValidationError {
  if (error instanceof AdminRunsValidationError) {
    return error;
  }

  if (error instanceof AssignmentCreationValidationError) {
    return new AdminRunsValidationError("VALIDATION_ERROR", error.message);
  }

  return new AdminRunsValidationError(
    "VALIDATION_ERROR",
    error instanceof Error ? error.message : "Run scheduling failed.",
  );
}

export class AdminRunsService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: Record<string, unknown>;
    instituteId?: unknown;
  }): AdminRunsValidatedRequest {
    const body = input.body ?? {};
    const mode = normalizeMode(body.mode ?? body.modeSnapshot);

    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      payload: {
        attemptLimit: normalizePositiveInteger(
          body.attemptLimit ?? 1,
          "attemptLimit",
        ),
        canonicalId: normalizeOptionalString(body.canonicalId, "canonicalId"),
        endWindow: normalizeIsoDate(body.endWindow, "endWindow"),
        gracePeriodMinutes: normalizeNonNegativeInteger(
          body.gracePeriodMinutes ?? 0,
          "gracePeriodMinutes",
        ),
        mode,
        recipientStudentIds: normalizeRecipientStudentIds(
          body.recipientStudentIds,
        ),
        runId: normalizeOptionalString(body.runId, "runId"),
        shuffleQuestionOrder: normalizeBoolean(
          body.shuffleQuestionOrder ?? false,
          "shuffleQuestionOrder",
        ),
        startWindow: normalizeIsoDate(body.startWindow, "startWindow"),
        testId: normalizeRequiredString(body.testId, "testId"),
        timezone: normalizeRequiredString(body.timezone ?? "UTC", "timezone"),
      },
    };
  }

  public async createRun(
    request: AdminRunsValidatedRequest,
  ): Promise<AdminRunsCreateResult> {
    try {
      const settingsSnapshot = await adminSettingsService.loadSettingsSnapshot(
        request.instituteId,
      );
      const currentYearId = resolveCurrentYearId(
        settingsSnapshot.academicYears,
      );
      const runsCollection = this.firestore
        .collection(INSTITUTES_COLLECTION)
        .doc(request.instituteId)
        .collection(ACADEMIC_YEARS_COLLECTION)
        .doc(currentYearId)
        .collection(RUNS_COLLECTION);
      const runId = request.payload.runId ?? runsCollection.doc().id;
      const assignment = await assignmentCreationService
        .processAssignmentCreated(
          {
            instituteId: request.instituteId,
            runId,
            yearId: currentYearId,
          },
          {
            ...request.payload,
            academicYear: currentYearId,
            modeSnapshot: request.payload.mode,
            runId,
          },
        );

      return {
        academicYear: currentYearId,
        assignment,
        runId,
        runPath: assignment.runPath,
        status: "scheduled",
      };
    } catch (error) {
      throw toApiValidationError(error);
    }
  }
}

export const adminRunsService = new AdminRunsService();
