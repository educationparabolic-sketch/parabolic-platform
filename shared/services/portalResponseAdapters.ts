import type {
  DeployCalibrationVersionResult,
  QuestionBulkUploadResult,
} from "../contracts/apiDtos";

type StudentSummaryResource =
  | "dashboard"
  | "tests"
  | "performance"
  | "insights"
  | "solutions";

type ExamSubmissionRiskState =
  | "Stable"
  | "Drift-Prone"
  | "Impulsive"
  | "Overextended"
  | "Volatile";

type ExamSessionStatus =
  | "created"
  | "started"
  | "active"
  | "submitted"
  | "expired"
  | "terminated";

export interface ExamSubmitAdapterResult {
  accuracyPercent: number;
  alreadySubmitted?: boolean;
  disciplineIndex: number;
  operationalDataAccessPolicy: Record<string, unknown>;
  rawScorePercent: number;
  riskState: ExamSubmissionRiskState;
  status?: ExamSessionStatus;
  submittedAt?: string;
}

export class PortalResponseValidationError extends Error {
  public readonly route: string;

  constructor(
    route: string,
    message: string,
  ) {
    super(`${route} ${message}`);
    this.name = "PortalResponseValidationError";
    this.route = route;
  }
}

function fail(route: string, field: string, expectation: string): never {
  throw new PortalResponseValidationError(
    route,
    `returned invalid field "${field}"; expected ${expectation}.`,
  );
}

function readRecord(
  value: unknown,
  route: string,
  field = "data",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(route, field, "an object");
  }

  return value as Record<string, unknown>;
}

function readBoolean(
  value: unknown,
  route: string,
  field: string,
): boolean {
  if (typeof value !== "boolean") {
    return fail(route, field, "a boolean");
  }

  return value;
}

function readNumber(
  value: unknown,
  route: string,
  field: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(route, field, "a finite number");
  }

  return value;
}

function readString(
  value: unknown,
  route: string,
  field: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(route, field, "a non-empty string");
  }

  return value;
}

function readNullableString(
  value: unknown,
  route: string,
  field: string,
): string | null {
  if (value === null) {
    return null;
  }

  return readString(value, route, field);
}

function readStringArray(
  value: unknown,
  route: string,
  field: string,
): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return fail(route, field, "an array of strings");
  }

  return value;
}

export function adaptAdminQuestionBulkResult(
  value: unknown,
): QuestionBulkUploadResult {
  const route = "POST /admin/questions/bulk";
  const data = readRecord(value, route);

  if (!Array.isArray(data.rows)) {
    return fail(route, "rows", "an array");
  }

  const rows = data.rows.map((value, index) => {
    const field = `rows[${index}]`;
    const row = readRecord(value, route, field);
    const action = row.action;
    if (action !== "create" && action !== "update" && action !== "none") {
      return fail(route, `${field}.action`, '"create", "update", or "none"');
    }
    const validatedAction: "create" | "update" | "none" = action;

    return {
      action: validatedAction,
      errors: readStringArray(row.errors, route, `${field}.errors`),
      questionId: readNullableString(row.questionId, route, `${field}.questionId`),
      rowNumber: readNumber(row.rowNumber, route, `${field}.rowNumber`),
      uniqueKey: readNullableString(row.uniqueKey, route, `${field}.uniqueKey`),
      warnings: readStringArray(row.warnings, route, `${field}.warnings`),
    };
  });
  const summary = readRecord(data.summary, route, "summary");

  return {
    commitRequested: readBoolean(data.commitRequested, route, "commitRequested"),
    committed: readBoolean(data.committed, route, "committed"),
    rows,
    summary: {
      created: readNumber(summary.created, route, "summary.created"),
      invalid: readNumber(summary.invalid, route, "summary.invalid"),
      received: readNumber(summary.received, route, "summary.received"),
      updated: readNumber(summary.updated, route, "summary.updated"),
      valid: readNumber(summary.valid, route, "summary.valid"),
      warnings: readNumber(summary.warnings, route, "summary.warnings"),
    },
    uploadLogId: readNullableString(data.uploadLogId, route, "uploadLogId"),
    uploadLogPath: readNullableString(data.uploadLogPath, route, "uploadLogPath"),
  };
}

export function adaptStudentSummaryResult(
  value: unknown,
  resource: StudentSummaryResource,
): unknown {
  const route = `GET /student/${resource}`;
  const allowsArray = resource === "tests" || resource === "solutions";

  if (allowsArray && Array.isArray(value)) {
    return value;
  }

  const data = readRecord(value, route);
  if (Object.keys(data).length === 0) {
    return fail(route, "data", "a non-empty summary object");
  }

  return value;
}

export function adaptExamSubmitResult(value: unknown): ExamSubmitAdapterResult {
  const route = "POST /exam/session/{sessionId}/submit";
  const data = readRecord(value, route);
  const riskState = data.riskState;
  if (
    riskState !== "Stable" &&
    riskState !== "Drift-Prone" &&
    riskState !== "Impulsive" &&
    riskState !== "Overextended" &&
    riskState !== "Volatile"
  ) {
    return fail(route, "riskState", "a supported submission risk state");
  }

  const status = data.status;
  if (
    status !== undefined &&
    status !== "created" &&
    status !== "started" &&
    status !== "active" &&
    status !== "submitted" &&
    status !== "expired" &&
    status !== "terminated"
  ) {
    return fail(route, "status", "a supported session status");
  }

  const submittedAt = data.submittedAt;
  if (submittedAt !== undefined && typeof submittedAt !== "string") {
    return fail(route, "submittedAt", "a string when present");
  }

  const alreadySubmitted = data.alreadySubmitted;
  if (alreadySubmitted !== undefined && typeof alreadySubmitted !== "boolean") {
    return fail(route, "alreadySubmitted", "a boolean when present");
  }

  return {
    accuracyPercent: readNumber(data.accuracyPercent, route, "accuracyPercent"),
    disciplineIndex: readNumber(data.disciplineIndex, route, "disciplineIndex"),
    operationalDataAccessPolicy: readRecord(
      data.operationalDataAccessPolicy,
      route,
      "operationalDataAccessPolicy",
    ),
    rawScorePercent: readNumber(data.rawScorePercent, route, "rawScorePercent"),
    riskState,
    ...(alreadySubmitted === undefined ? {} : {alreadySubmitted}),
    ...(status === undefined ? {} : {status}),
    ...(submittedAt === undefined ? {} : {submittedAt}),
  };
}

export function adaptVendorCalibrationPushResult(
  value: unknown,
): DeployCalibrationVersionResult {
  const route = "POST /vendor/calibration/push";
  const data = readRecord(value, route);

  if (!Array.isArray(data.deployedInstitutes)) {
    return fail(route, "deployedInstitutes", "an array");
  }

  const deployedInstitutes = data.deployedInstitutes.map((value, index) => {
    const field = `deployedInstitutes[${index}]`;
    const record = readRecord(value, route, field);
    return {
      calibrationPath: readString(record.calibrationPath, route, `${field}.calibrationPath`),
      calibrationHistoryPath: readString(
        record.calibrationHistoryPath,
        route,
        `${field}.calibrationHistoryPath`,
      ),
      instituteId: readString(record.instituteId, route, `${field}.instituteId`),
      licensePath: readString(record.licensePath, route, `${field}.licensePath`),
      compatibilityLicensePath: readString(
        record.compatibilityLicensePath,
        route,
        `${field}.compatibilityLicensePath`,
      ),
    };
  });

  return {
    calibrationSourcePath: readString(
      data.calibrationSourcePath,
      route,
      "calibrationSourcePath",
    ),
    deployedInstituteCount: readNumber(
      data.deployedInstituteCount,
      route,
      "deployedInstituteCount",
    ),
    deployedInstitutes,
    deploymentLogId: readString(data.deploymentLogId, route, "deploymentLogId"),
    vendorCalibrationLogPath: readString(
      data.vendorCalibrationLogPath,
      route,
      "vendorCalibrationLogPath",
    ),
    versionId: readString(data.versionId, route, "versionId"),
  };
}
