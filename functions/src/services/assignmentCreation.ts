import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AssignmentCreationContext,
  AssignmentCreationResult,
  AssignmentMode,
  AssignmentTemplateSnapshot,
  LicenseLayer,
} from "../types/assignmentCreation";
import {
  TemplateDifficultyDistribution,
  TemplatePhaseConfigSnapshot,
  TemplateTimingProfile,
  TemplateTimingWindow,
} from "../types/templateCreation";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const STUDENTS_COLLECTION = "students";
const TESTS_COLLECTION = "tests";
const LICENSE_COLLECTION = "license";
const ALLOWED_TEMPLATE_STATUSES = new Set(["ready", "assigned"]);
const ALLOWED_MODES = new Set<AssignmentMode>([
  "Operational",
  "Diagnostic",
  "Controlled",
  "Hard",
]);
const ALLOWED_LICENSE_LAYERS = new Set<LicenseLayer>([
  "L0",
  "L1",
  "L2",
  "L3",
]);
const ALLOWED_ACTIVE_STUDENT_STATUSES = new Set(["active"]);
const MODE_REQUIRED_LAYERS: Record<AssignmentMode, LicenseLayer> = {
  Controlled: "L2",
  Diagnostic: "L1",
  Hard: "L2",
  Operational: "L0",
};
const LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

/**
 * Raised when assignment creation input violates architecture constraints.
 */
class AssignmentCreationValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "AssignmentCreationValidationError";
  }
}

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof Timestamp);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new AssignmentCreationValidationError(
      `Assignment field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new AssignmentCreationValidationError(
      `Assignment field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeRunMode = (value: unknown): AssignmentMode => {
  const normalizedMode =
    normalizeRequiredString(value, "mode") as AssignmentMode;

  if (!ALLOWED_MODES.has(normalizedMode)) {
    throw new AssignmentCreationValidationError(
      "Assignment field \"mode\" must be one of Operational, Diagnostic, " +
      "Controlled, or Hard.",
    );
  }

  return normalizedMode;
};

const normalizeTimestamp = (
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

  throw new AssignmentCreationValidationError(
    `Assignment field "${fieldName}" must be a Firestore timestamp or ` +
    "valid ISO date string.",
  );
};

const normalizeRecipientStudentIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new AssignmentCreationValidationError(
      "Assignment field \"recipientStudentIds\" must be an array of strings.",
    );
  }

  const normalizedIds = value.map((studentId) =>
    normalizeRequiredString(studentId, "recipientStudentIds[]"),
  );
  const uniqueIds = Array.from(new Set(normalizedIds));

  if (uniqueIds.length === 0) {
    throw new AssignmentCreationValidationError(
      "Assignment field \"recipientStudentIds\" must contain at least one " +
      "student id.",
    );
  }

  if (uniqueIds.length !== normalizedIds.length) {
    throw new AssignmentCreationValidationError(
      "Assignment field \"recipientStudentIds\" must not contain duplicates.",
    );
  }

  return uniqueIds;
};

const normalizeRequiredLayer = (value: unknown): LicenseLayer => {
  const normalizedLayer = normalizeRequiredString(
    value,
    "license.currentLayer",
  ) as LicenseLayer;

  if (!ALLOWED_LICENSE_LAYERS.has(normalizedLayer)) {
    throw new AssignmentCreationValidationError(
      "License field \"currentLayer\" must be one of L0, L1, L2, or L3.",
    );
  }

  return normalizedLayer;
};

const normalizeCalibrationVersion = (value: unknown): string =>
  normalizeRequiredString(value, "institute.calibrationVersion");

const normalizeNonNegativeInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new AssignmentCreationValidationError(
      `Template field "${fieldName}" must be a non-negative integer.`,
    );
  }

  return value;
};

const normalizePositiveInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new AssignmentCreationValidationError(
      `Template field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
};

const normalizePercentField = (
  value: unknown,
  fieldName: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new AssignmentCreationValidationError(
      `Template field "${fieldName}" must be a number between 0 and 100.`,
    );
  }

  return value;
};

const normalizeQuestionIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new AssignmentCreationValidationError(
      "Template field \"questionIds\" must be an array of strings.",
    );
  }

  const normalizedQuestionIds = value.map((questionId) =>
    normalizeRequiredString(questionId, "questionIds[]"),
  );

  if (normalizedQuestionIds.length === 0) {
    throw new AssignmentCreationValidationError(
      "Template field \"questionIds\" must contain at least one question id.",
    );
  }

  const uniqueQuestionIds = Array.from(new Set(normalizedQuestionIds));

  if (uniqueQuestionIds.length !== normalizedQuestionIds.length) {
    throw new AssignmentCreationValidationError(
      "Template field \"questionIds\" must not contain duplicates.",
    );
  }

  return uniqueQuestionIds;
};

const normalizeDifficultyDistribution = (
  value: unknown,
): TemplateDifficultyDistribution => {
  if (!isPlainObject(value)) {
    throw new AssignmentCreationValidationError(
      "Template field \"difficultyDistribution\" must be an object.",
    );
  }

  return {
    easy: normalizeNonNegativeInteger(
      value.easy,
      "difficultyDistribution.easy",
    ),
    hard: normalizeNonNegativeInteger(
      value.hard,
      "difficultyDistribution.hard",
    ),
    medium: normalizeNonNegativeInteger(
      value.medium,
      "difficultyDistribution.medium",
    ),
  };
};

const normalizePhaseConfigSnapshot = (
  value: unknown,
): TemplatePhaseConfigSnapshot => {
  if (!isPlainObject(value)) {
    throw new AssignmentCreationValidationError(
      "Template field \"phaseConfigSnapshot\" must be an object.",
    );
  }

  return {
    phase1Percent: normalizePercentField(
      value.phase1Percent,
      "phaseConfigSnapshot.phase1Percent",
    ),
    phase2Percent: normalizePercentField(
      value.phase2Percent,
      "phaseConfigSnapshot.phase2Percent",
    ),
    phase3Percent: normalizePercentField(
      value.phase3Percent,
      "phaseConfigSnapshot.phase3Percent",
    ),
  };
};

const normalizeTimingWindow = (
  value: unknown,
  fieldName: string,
): TemplateTimingWindow => {
  if (!isPlainObject(value)) {
    throw new AssignmentCreationValidationError(
      `Template field "${fieldName}" must be an object.`,
    );
  }

  const min = normalizePositiveInteger(value.min, `${fieldName}.min`);
  const max = normalizePositiveInteger(value.max, `${fieldName}.max`);

  if (min > max) {
    throw new AssignmentCreationValidationError(
      `Template field "${fieldName}" must satisfy min <= max.`,
    );
  }

  return {max, min};
};

const normalizeTimingProfile = (value: unknown): TemplateTimingProfile => {
  if (!isPlainObject(value)) {
    throw new AssignmentCreationValidationError(
      "Template field \"timingProfile\" must be an object.",
    );
  }

  return {
    easy: normalizeTimingWindow(value.easy, "timingProfile.easy"),
    hard: normalizeTimingWindow(value.hard, "timingProfile.hard"),
    medium: normalizeTimingWindow(value.medium, "timingProfile.medium"),
  };
};

const normalizeTemplateSnapshot = (
  templateData: Record<string, unknown> | undefined,
): AssignmentTemplateSnapshot => {
  const timingProfileSource =
    templateData?.timingProfileSnapshot ?? templateData?.timingProfile;

  return {
    difficultyDistribution: normalizeDifficultyDistribution(
      templateData?.difficultyDistribution,
    ),
    phaseConfigSnapshot: normalizePhaseConfigSnapshot(
      templateData?.phaseConfigSnapshot,
    ),
    questionIds: normalizeQuestionIds(templateData?.questionIds),
    timingProfileSnapshot: normalizeTimingProfile(timingProfileSource),
  };
};

const isLicenseLayerSufficient = (
  currentLayer: LicenseLayer,
  requiredLayer: LicenseLayer,
): boolean => LAYER_ORDER[currentLayer] >= LAYER_ORDER[requiredLayer];

/**
 * Validates and normalizes assignment-run documents on create.
 */
export class AssignmentCreationService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("AssignmentCreationService");

  /**
   * Processes a newly created run assignment document.
   * @param {AssignmentCreationContext} context Trigger context identifiers.
   * @param {unknown} data Newly created run payload.
   * @return {Promise<AssignmentCreationResult>} Persisted assignment metadata.
   */
  public async processAssignmentCreated(
    context: AssignmentCreationContext,
    data: unknown,
  ): Promise<AssignmentCreationResult> {
    const instituteId = normalizeRequiredString(
      context.instituteId,
      "instituteId",
    );
    const yearId = normalizeRequiredString(context.yearId, "yearId");
    const runId = normalizeRequiredString(context.runId, "runId");

    if (!isPlainObject(data)) {
      throw new AssignmentCreationValidationError(
        "Assignment payload must be a Firestore object.",
      );
    }

    const payloadRunId = normalizeRequiredString(data.runId, "runId");
    const testId = normalizeRequiredString(data.testId, "testId");
    const mode = normalizeRunMode(data.mode);
    const startWindow = normalizeTimestamp(data.startWindow, "startWindow");
    const endWindow = normalizeTimestamp(data.endWindow, "endWindow");
    const recipientStudentIds = normalizeRecipientStudentIds(
      data.recipientStudentIds,
    );

    if (payloadRunId !== runId) {
      throw new AssignmentCreationValidationError(
        "Assignment field \"runId\" must match the document identifier.",
      );
    }

    const nowMillis = Date.now();

    if (startWindow.toMillis() <= nowMillis) {
      throw new AssignmentCreationValidationError(
        "Assignment startWindow must be in the future.",
      );
    }

    if (endWindow.toMillis() <= startWindow.toMillis()) {
      throw new AssignmentCreationValidationError(
        "Assignment endWindow must be greater than startWindow.",
      );
    }

    const runPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUNS_COLLECTION}/${runId}`;
    const institutePath = `${INSTITUTES_COLLECTION}/${instituteId}`;
    const testPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${TESTS_COLLECTION}/${testId}`;
    const licenseMainPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${LICENSE_COLLECTION}/main`;
    const licenseCurrentPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${LICENSE_COLLECTION}/current`;
    const runReference = this.firestore.doc(runPath);
    const instituteReference = this.firestore.doc(institutePath);
    const testReference = this.firestore.doc(testPath);
    const recipientReferences = recipientStudentIds.map((studentId) =>
      this.firestore.doc(
        `${INSTITUTES_COLLECTION}/${instituteId}/` +
        `${STUDENTS_COLLECTION}/${studentId}`,
      ),
    );
    const licenseMainReference = this.firestore.doc(licenseMainPath);
    const licenseCurrentReference = this.firestore.doc(licenseCurrentPath);
    const [
      instituteSnapshot,
      testSnapshot,
      licenseMainSnapshot,
      licenseCurrentSnapshot,
      ...studentSnapshots
    ] = await this.firestore.getAll(
      instituteReference,
      testReference,
      licenseMainReference,
      licenseCurrentReference,
      ...recipientReferences,
    );

    if (!instituteSnapshot.exists) {
      throw new AssignmentCreationValidationError(
        `Institute "${instituteId}" does not exist.`,
      );
    }

    if (!testSnapshot.exists) {
      throw new AssignmentCreationValidationError(
        `Template "${testId}" does not exist for this institute.`,
      );
    }

    const templateData = testSnapshot.data();
    const templateStatus = normalizeRequiredString(
      templateData?.status,
      "template.status",
    ).toLowerCase();

    if (!ALLOWED_TEMPLATE_STATUSES.has(templateStatus)) {
      throw new AssignmentCreationValidationError(
        "Template status must be \"ready\" or \"assigned\" before " +
        "creating an assignment.",
      );
    }

    const capturedTemplateSnapshot = normalizeTemplateSnapshot(templateData);

    const templateAllowedModesRaw = templateData?.allowedModes;

    if (
      Array.isArray(templateAllowedModesRaw) &&
      templateAllowedModesRaw.length > 0
    ) {
      const templateAllowedModes = new Set(
        templateAllowedModesRaw
          .map((value) => String(value).trim())
          .filter((value): value is AssignmentMode =>
            ALLOWED_MODES.has(value as AssignmentMode),
          ),
      );

      if (!templateAllowedModes.has(mode)) {
        throw new AssignmentCreationValidationError(
          `Template "${testId}" does not allow assignment mode "${mode}".`,
        );
      }
    }

    studentSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) {
        throw new AssignmentCreationValidationError(
          "Assignment recipient does not exist in institute students: " +
          `"${recipientStudentIds[index]}".`,
        );
      }

      const status = String(snapshot.data()?.status ?? "").trim().toLowerCase();

      if (!ALLOWED_ACTIVE_STUDENT_STATUSES.has(status)) {
        throw new AssignmentCreationValidationError(
          "Assignment recipient must be an active student: " +
          `"${recipientStudentIds[index]}".`,
        );
      }
    });

    const activeLicenseSnapshot = licenseMainSnapshot.exists ?
      licenseMainSnapshot :
      licenseCurrentSnapshot;

    if (!activeLicenseSnapshot.exists) {
      throw new AssignmentCreationValidationError(
        "Institute license document is required before creating assignments.",
      );
    }

    const licenseData = activeLicenseSnapshot.data();
    const currentLayer = normalizeRequiredLayer(licenseData?.currentLayer);
    const requiredLayer = MODE_REQUIRED_LAYERS[mode];

    if (!isLicenseLayerSufficient(currentLayer, requiredLayer)) {
      throw new AssignmentCreationValidationError(
        `Assignment mode "${mode}" requires license layer ${requiredLayer} ` +
        `or higher (current: ${currentLayer}).`,
      );
    }

    const featureFlags = isPlainObject(licenseData?.featureFlags) ?
      licenseData.featureFlags :
      {};
    const controlledModeEnabled = featureFlags.controlledMode !== false;
    const hardModeEnabled = featureFlags.hardMode !== false;

    if (mode === "Controlled" && !controlledModeEnabled) {
      throw new AssignmentCreationValidationError(
        "Assignment mode \"Controlled\" is disabled by license feature flags.",
      );
    }

    if (mode === "Hard" && !hardModeEnabled) {
      throw new AssignmentCreationValidationError(
        "Assignment mode \"Hard\" is disabled by license feature flags.",
      );
    }

    const instituteData = instituteSnapshot.data();
    const calibrationVersion = normalizeCalibrationVersion(
      instituteData?.calibrationVersion,
    );

    const normalizedTotalSessions = typeof data.totalSessions === "number" &&
      Number.isFinite(data.totalSessions) &&
      data.totalSessions >= 0 ?
      Math.floor(data.totalSessions) :
      0;
    const createdAt = data.createdAt instanceof Timestamp ?
      data.createdAt :
      FieldValue.serverTimestamp();

    await this.firestore.runTransaction(async (transaction) => {
      transaction.set(runReference, {
        calibrationVersion,
        createdAt,
        difficultyDistribution:
          capturedTemplateSnapshot.difficultyDistribution,
        endWindow,
        licenseLayer: currentLayer,
        mode,
        phaseConfigSnapshot: capturedTemplateSnapshot.phaseConfigSnapshot,
        questionIds: capturedTemplateSnapshot.questionIds,
        recipientCount: recipientStudentIds.length,
        recipientStudentIds,
        runId,
        startWindow,
        status: "scheduled",
        testId,
        timingProfileSnapshot:
          capturedTemplateSnapshot.timingProfileSnapshot,
        totalSessions: normalizedTotalSessions,
      }, {merge: true});

      transaction.set(testReference, {
        status: "assigned",
        totalRuns: FieldValue.increment(1),
      }, {merge: true});
    });

    this.logger.info("Assignment creation validation completed", {
      instituteId,
      calibrationVersion,
      licenseLayer: currentLayer,
      mode,
      questionCount: capturedTemplateSnapshot.questionIds.length,
      recipientCount: recipientStudentIds.length,
      runId,
      runPath,
      testId,
      yearId,
    });

    return {
      calibrationVersion,
      capturedTemplateSnapshot,
      licenseLayer: currentLayer,
      recipientCount: recipientStudentIds.length,
      runPath,
      status: "scheduled",
      testPath,
    };
  }
}

export const assignmentCreationService = new AssignmentCreationService();
