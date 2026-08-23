/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminTestDifficultyDistribution,
  AdminTestExamSnapshot,
  AdminTestPhaseConfigSnapshot,
  AdminTestPhaseSplitRow,
  AdminTestsCreateRequest,
  AdminTestsCreateResult,
  AdminTestsListRequest,
  AdminTestsLifecycleRequest,
  AdminTestsLifecycleResult,
  AdminTestsUpdateRequest,
  AdminTestsUpdateResult,
  AdminTestSelectionMethod,
  AdminTestsValidationError,
  AdminTestTemplateRecord,
  AdminTestTemplateStatus,
  AdminTestTemplateUpdateRequest,
  AdminTestTimingProfile,
  AdminTestTimingWindow,
} from "../types/adminTests";

const INSTITUTES_COLLECTION = "institutes";
const TESTS_COLLECTION = "tests";
const VERSION_SNAPSHOTS_COLLECTION = "versionSnapshots";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;
const SELECTION_METHODS = new Set<AdminTestSelectionMethod>([
  "manual",
  "offset_limit",
  "round_robin",
  "shuffle_slice",
  "upload_set",
]);
const DIFFICULTY_WEIGHTS = {
  easy: 1,
  hard: 4,
  medium: 2.3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ?
    value.trim() :
    undefined;
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ?
    value.trim() :
    fallback;
}

function normalizePositiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (
    typeof parsed !== "number" ||
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a positive integer.`,
    );
  }

  return parsed;
}

function normalizeNonNegativeInteger(value: unknown, field: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (
    typeof parsed !== "number" ||
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed < 0
  ) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a non-negative integer.`,
    );
  }

  return parsed;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function normalizeLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIMIT;
  }

  return Math.min(normalizePositiveInteger(value, "limit"), MAX_LIMIT);
}

function normalizeSelectionMethod(value: unknown): AdminTestSelectionMethod {
  const normalized = normalizeRequiredString(value, "selectionMethod");
  if (!SELECTION_METHODS.has(normalized as AdminTestSelectionMethod)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"selectionMethod\" must be a supported template selection " +
        "method.",
    );
  }

  return normalized as AdminTestSelectionMethod;
}

function toSelectionMethod(value: unknown): AdminTestSelectionMethod {
  return typeof value === "string" &&
    SELECTION_METHODS.has(value as AdminTestSelectionMethod) ?
    value as AdminTestSelectionMethod :
    "manual";
}

function normalizeQuestionIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"questionIds\" must be an array of question ids.",
    );
  }

  const ids = value.map((entry) => normalizeRequiredString(
    entry,
    "questionIds[]",
  ));
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"questionIds\" must contain at least one question id.",
    );
  }

  if (uniqueIds.length !== ids.length) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"questionIds\" must not contain duplicate ids.",
    );
  }

  return uniqueIds;
}

function normalizeDifficultyDistribution(
  value: unknown,
): AdminTestDifficultyDistribution {
  if (!isRecord(value)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"difficultyDistribution\" must be an object.",
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
}

function normalizeTimingWindow(
  value: unknown,
  field: string,
): AdminTestTimingWindow {
  if (!isRecord(value)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be an object.`,
    );
  }

  const minSeconds = normalizePositiveInteger(
    value.minSeconds ?? value.min,
    `${field}.minSeconds`,
  );
  const maxSeconds = normalizePositiveInteger(
    value.maxSeconds ?? value.max,
    `${field}.maxSeconds`,
  );

  if (minSeconds > maxSeconds) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must satisfy minSeconds <= maxSeconds.`,
    );
  }

  const recommendedSeconds = normalizePositiveInteger(
    value.recommendedSeconds ?? value.recommended ??
      Math.round((minSeconds + maxSeconds) / 2),
    `${field}.recommendedSeconds`,
  );
  if (recommendedSeconds < minSeconds || recommendedSeconds > maxSeconds) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must satisfy minSeconds <= recommendedSeconds <= maxSeconds.`,
    );
  }

  return {maxSeconds, minSeconds, recommendedSeconds};
}

function normalizeTimingProfile(value: unknown): AdminTestTimingProfile {
  if (!isRecord(value)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"timingProfile\" must be an object.",
    );
  }

  return {
    easy: normalizeTimingWindow(value.easy, "timingProfile.easy"),
    hard: normalizeTimingWindow(value.hard, "timingProfile.hard"),
    medium: normalizeTimingWindow(value.medium, "timingProfile.medium"),
  };
}

function defaultExamSnapshot(examType: string): AdminTestExamSnapshot {
  if (examType === "NEET") {
    return {
      defaultDurationMinutes: 200,
      difficultyTimingMapping: {
        easy: {maxSeconds: 55, minSeconds: 25, recommendedSeconds: 40},
        hard: {maxSeconds: 210, minSeconds: 135, recommendedSeconds: 173},
        medium: {maxSeconds: 135, minSeconds: 55, recommendedSeconds: 95},
      },
      markingScheme:
        "Fixed NEET snapshot: +4 correct, -1 incorrect, 0 unanswered. " +
        "Manual marks entry is locked.",
      sectionStructure: ["Physics", "Chemistry", "Botany", "Zoology"],
    };
  }

  return {
    defaultDurationMinutes: 180,
    difficultyTimingMapping: {
      easy: {maxSeconds: 60, minSeconds: 30, recommendedSeconds: 45},
      hard: {maxSeconds: 210, minSeconds: 150, recommendedSeconds: 180},
      medium: {maxSeconds: 150, minSeconds: 60, recommendedSeconds: 105},
    },
    markingScheme:
      "Fixed JEE snapshot: +4 correct, -1 incorrect, 0 unanswered. " +
      "Manual marks entry is locked.",
    sectionStructure: ["Physics", "Chemistry", "Mathematics"],
  };
}

function normalizeStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be an array of strings.`,
    );
  }

  const entries = value.map((entry) => normalizeRequiredString(entry, field));
  if (entries.length === 0) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must include at least one entry.`,
    );
  }

  return entries;
}

function normalizeExamSnapshot(
  value: unknown,
  examType: string,
): AdminTestExamSnapshot {
  const fallback = defaultExamSnapshot(examType);
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    defaultDurationMinutes: normalizePositiveInteger(
      value.defaultDurationMinutes ?? fallback.defaultDurationMinutes,
      "examSnapshot.defaultDurationMinutes",
    ),
    difficultyTimingMapping: normalizeTimingProfile(
      value.difficultyTimingMapping ?? fallback.difficultyTimingMapping,
    ),
    markingScheme: normalizeRequiredString(
      value.markingScheme ?? fallback.markingScheme,
      "examSnapshot.markingScheme",
    ),
    sectionStructure: normalizeStringList(
      value.sectionStructure ?? fallback.sectionStructure,
      "examSnapshot.sectionStructure",
    ),
  };
}

function normalizeDifficultyLabel(
  value: unknown,
  field: string,
): "easy" | "medium" | "hard" {
  const normalized = normalizeRequiredString(value, field);
  if (normalized !== "easy" && normalized !== "medium" && normalized !== "hard") {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be easy, medium, or hard.`,
    );
  }

  return normalized;
}

function normalizeNonNegativeNumber(value: unknown, field: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a non-negative number.`,
    );
  }

  return parsed;
}

function buildDefaultPhaseConfigSnapshot(
  difficultyDistribution: AdminTestDifficultyDistribution,
  totalDurationMinutes: number,
): AdminTestPhaseConfigSnapshot {
  const totalLoad =
    difficultyDistribution.easy * DIFFICULTY_WEIGHTS.easy +
    difficultyDistribution.medium * DIFFICULTY_WEIGHTS.medium +
    difficultyDistribution.hard * DIFFICULTY_WEIGHTS.hard;
  const labels = {
    easy: {
      focus: "Warm-up and confidence-building questions",
      phase: "Foundation",
    },
    hard: {
      focus: "High-load controlled/hard-mode readiness",
      phase: "Challenge Control",
    },
    medium: {
      focus: "Main concept discrimination and pacing signal",
      phase: "Diagnostic Core",
    },
  };

  const phaseSplit = (["easy", "medium", "hard"] as const)
    .map((difficulty): AdminTestPhaseSplitRow => {
      const questionCount = difficultyDistribution[difficulty];
      const weight = DIFFICULTY_WEIGHTS[difficulty];
      const load = questionCount * weight;
      return {
        difficulty,
        focus: labels[difficulty].focus,
        load: Number(load.toFixed(1)),
        minutes: totalLoad > 0 ?
          Math.round((load / totalLoad) * totalDurationMinutes) :
          0,
        percent: totalLoad > 0 ? Math.round((load / totalLoad) * 100) : 0,
        phase: labels[difficulty].phase,
        questionCount,
        weight,
      };
    });

  return {
    difficultyWeights: {...DIFFICULTY_WEIGHTS},
    phaseSplit,
    totalLoad: Number(totalLoad.toFixed(1)),
  };
}

function normalizePhaseSplitRow(
  value: unknown,
  index: number,
): AdminTestPhaseSplitRow {
  if (!isRecord(value)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "phaseConfigSnapshot.phaseSplit[${index}]" must be an object.`,
    );
  }

  return {
    difficulty: normalizeDifficultyLabel(
      value.difficulty,
      `phaseConfigSnapshot.phaseSplit[${index}].difficulty`,
    ),
    focus: normalizeRequiredString(
      value.focus,
      `phaseConfigSnapshot.phaseSplit[${index}].focus`,
    ),
    load: normalizeNonNegativeNumber(
      value.load,
      `phaseConfigSnapshot.phaseSplit[${index}].load`,
    ),
    minutes: normalizeNonNegativeInteger(
      value.minutes,
      `phaseConfigSnapshot.phaseSplit[${index}].minutes`,
    ),
    percent: normalizeNonNegativeInteger(
      value.percent,
      `phaseConfigSnapshot.phaseSplit[${index}].percent`,
    ),
    phase: normalizeRequiredString(
      value.phase,
      `phaseConfigSnapshot.phaseSplit[${index}].phase`,
    ),
    questionCount: normalizeNonNegativeInteger(
      value.questionCount,
      `phaseConfigSnapshot.phaseSplit[${index}].questionCount`,
    ),
    weight: normalizeNonNegativeNumber(
      value.weight,
      `phaseConfigSnapshot.phaseSplit[${index}].weight`,
    ),
  };
}

function normalizePhaseConfigSnapshot(
  value: unknown,
  difficultyDistribution: AdminTestDifficultyDistribution,
  totalDurationMinutes: number,
): AdminTestPhaseConfigSnapshot {
  const fallback = buildDefaultPhaseConfigSnapshot(
    difficultyDistribution,
    totalDurationMinutes,
  );
  if (!isRecord(value)) {
    return fallback;
  }

  const weights = isRecord(value.difficultyWeights) ?
    value.difficultyWeights :
    fallback.difficultyWeights;
  const phaseSplit = Array.isArray(value.phaseSplit) ?
    value.phaseSplit.map(normalizePhaseSplitRow) :
    fallback.phaseSplit;

  return {
    difficultyWeights: {
      easy: normalizeNonNegativeNumber(
        weights.easy,
        "phaseConfigSnapshot.difficultyWeights.easy",
      ),
      hard: normalizeNonNegativeNumber(
        weights.hard,
        "phaseConfigSnapshot.difficultyWeights.hard",
      ),
      medium: normalizeNonNegativeNumber(
        weights.medium,
        "phaseConfigSnapshot.difficultyWeights.medium",
      ),
    },
    phaseSplit,
    totalLoad: normalizeNonNegativeNumber(
      value.totalLoad ?? fallback.totalLoad,
      "phaseConfigSnapshot.totalLoad",
    ),
  };
}

function toTimingWindow(value: unknown): AdminTestTimingWindow {
  if (!isRecord(value)) {
    return {maxSeconds: 60, minSeconds: 30, recommendedSeconds: 45};
  }

  const minSeconds = Math.max(1, Math.round(
    toNumber(value.minSeconds ?? value.min, 30),
  ));
  const maxSeconds = Math.max(minSeconds, Math.round(
    toNumber(value.maxSeconds ?? value.max, 60),
  ));
  return {
    maxSeconds,
    minSeconds,
    recommendedSeconds: Math.min(maxSeconds, Math.max(minSeconds, Math.round(
      toNumber(
        value.recommendedSeconds ?? value.recommended,
        (minSeconds + maxSeconds) / 2,
      ),
    ))),
  };
}

function toStatus(value: unknown): AdminTestTemplateStatus {
  if (
    value === "draft" ||
    value === "ready" ||
    value === "assigned" ||
    value === "archived" ||
    value === "deprecated"
  ) {
    return value;
  }

  return "draft";
}

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return new Date(0).toISOString();
}

function toTemplateRecord(
  snapshot: FirebaseFirestore.DocumentSnapshot,
): AdminTestTemplateRecord {
  const data = snapshot.data() ?? {};
  const difficultyDistribution = isRecord(data.difficultyDistribution) ?
    data.difficultyDistribution :
    {};
  const timingProfile = isRecord(data.timingProfile) ? data.timingProfile : {};
  const questionIds = Array.isArray(data.questionIds) ?
    data.questionIds.filter((entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
    ) :
    [];
  const examType = toNonEmptyString(data.examType, "JEEMains");
  const examSnapshot = isRecord(data.examSnapshot) ?
    normalizeExamSnapshot(data.examSnapshot, examType) :
    defaultExamSnapshot(examType);
  const normalizedDifficultyDistribution = {
    easy: Math.max(0, Math.round(toNumber(difficultyDistribution.easy))),
    hard: Math.max(0, Math.round(toNumber(difficultyDistribution.hard))),
    medium: Math.max(0, Math.round(toNumber(difficultyDistribution.medium))),
  };
  const totalDurationMinutes = Math.max(30, Math.round(
    toNumber(data.totalDurationMinutes ?? data.durationMinutes, 180),
  ));
  const phaseConfigSnapshot = normalizePhaseConfigSnapshot(
    data.phaseConfigSnapshot,
    normalizedDifficultyDistribution,
    totalDurationMinutes,
  );

  return {
    canonicalId: toNonEmptyString(data.canonicalId, snapshot.id),
    difficultyDistribution: normalizedDifficultyDistribution,
    examType,
    examSnapshot,
    id: toNonEmptyString(data.testId, snapshot.id),
    phaseConfigSnapshot,
    selectedQuestionIds: questionIds,
    selectionMethod: toSelectionMethod(data.selectionMethod),
    status: toStatus(data.status),
    templateName: toNonEmptyString(data.templateName, snapshot.id),
    timingProfile: {
      easy: toTimingWindow(timingProfile.easy),
      hard: toTimingWindow(timingProfile.hard),
      medium: toTimingWindow(timingProfile.medium),
    },
    totalDurationMinutes,
    totalRuns: Math.max(0, Math.round(toNumber(data.totalRuns))),
    updatedAt: toIsoString(data.updatedAt ?? data.createdAt),
    version: Math.max(1, Math.round(toNumber(data.version, 1))),
  };
}

function toFirestoreTimingProfile(
  value: AdminTestTimingProfile,
): Record<string, {min: number; recommended: number; max: number}> {
  return {
    easy: {
      max: value.easy.maxSeconds,
      min: value.easy.minSeconds,
      recommended: value.easy.recommendedSeconds,
    },
    hard: {
      max: value.hard.maxSeconds,
      min: value.hard.minSeconds,
      recommended: value.hard.recommendedSeconds,
    },
    medium: {
      max: value.medium.maxSeconds,
      min: value.medium.minSeconds,
      recommended: value.medium.recommendedSeconds,
    },
  };
}

function toFirestoreExamSnapshot(
  value: AdminTestExamSnapshot,
): Record<string, unknown> {
  return {
    defaultDurationMinutes: value.defaultDurationMinutes,
    difficultyTimingMapping: toFirestoreTimingProfile(
      value.difficultyTimingMapping,
    ),
    markingScheme: value.markingScheme,
    sectionStructure: value.sectionStructure,
  };
}

function toFirestorePhaseConfigSnapshot(
  value: AdminTestPhaseConfigSnapshot,
): Record<string, unknown> {
  return {
    difficultyWeights: value.difficultyWeights,
    phaseSplit: value.phaseSplit.map((phase) => ({...phase})),
    totalLoad: value.totalLoad,
  };
}

type NormalizedTemplateMutation = Omit<
  AdminTestTemplateUpdateRequest,
  "expectedVersion"
>;

function normalizeTemplateMutationBody(value: unknown):
NormalizedTemplateMutation {
  const body = isRecord(value) ? value : {};
  const questionIds = normalizeQuestionIds(
    body.questionIds ?? body.selectedQuestionIds,
  );
  const difficultyDistribution = normalizeDifficultyDistribution(
    body.difficultyDistribution,
  );
  const difficultyTotal =
    difficultyDistribution.easy +
    difficultyDistribution.medium +
    difficultyDistribution.hard;

  if (difficultyTotal !== questionIds.length) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "difficultyDistribution total must match questionIds length.",
    );
  }

  const examType = normalizeRequiredString(body.examType, "examType");
  const totalDurationMinutes = normalizePositiveInteger(
    body.totalDurationMinutes,
    "totalDurationMinutes",
  );

  return {
    canonicalId: normalizeRequiredString(body.canonicalId, "canonicalId"),
    difficultyDistribution,
    examType,
    examSnapshot: normalizeExamSnapshot(body.examSnapshot, examType),
    phaseConfigSnapshot: normalizePhaseConfigSnapshot(
      body.phaseConfigSnapshot,
      difficultyDistribution,
      totalDurationMinutes,
    ),
    questionIds,
    selectionMethod: normalizeSelectionMethod(body.selectionMethod),
    templateName: normalizeRequiredString(body.templateName, "templateName"),
    timingProfile: normalizeTimingProfile(body.timingProfile),
    totalDurationMinutes,
  };
}

function toFirestoreTemplateMutation(
  request: NormalizedTemplateMutation,
): Record<string, unknown> {
  return {
    canonicalId: request.canonicalId,
    difficultyDistribution: request.difficultyDistribution,
    examSnapshot: toFirestoreExamSnapshot(request.examSnapshot),
    examType: request.examType,
    phaseConfigSnapshot: toFirestorePhaseConfigSnapshot(
      request.phaseConfigSnapshot,
    ),
    questionIds: request.questionIds,
    selectionMethod: request.selectionMethod,
    templateName: request.templateName,
    timingProfile: toFirestoreTimingProfile(request.timingProfile),
    totalDurationMinutes: request.totalDurationMinutes,
    totalQuestions: request.questionIds.length,
  };
}

function toFirestoreVersionSnapshot(
  current: AdminTestTemplateRecord,
  request: AdminTestsUpdateRequest,
  nextVersion: number,
): Record<string, unknown> {
  return {
    canonicalId: current.canonicalId,
    difficultyDistribution: current.difficultyDistribution,
    examSnapshot: toFirestoreExamSnapshot(current.examSnapshot),
    examType: current.examType,
    phaseConfigSnapshot: toFirestorePhaseConfigSnapshot(
      current.phaseConfigSnapshot,
    ),
    questionIds: current.selectedQuestionIds,
    selectionMethod: current.selectionMethod,
    snapshotCreatedAt: FieldValue.serverTimestamp(),
    snapshotCreatedBy: request.actorId,
    snapshotCreatedByRole: request.actorRole,
    status: current.status,
    supersededByVersion: nextVersion,
    templateName: current.templateName,
    testId: current.id,
    timingProfile: toFirestoreTimingProfile(current.timingProfile),
    totalDurationMinutes: current.totalDurationMinutes,
    totalQuestions: current.selectedQuestionIds.length,
    version: current.version,
  };
}

type TemplateLifecycleAction = "archive" | "publish";

function buildLifecycleAuditId(
  request: AdminTestsLifecycleRequest,
  action: TemplateLifecycleAction,
): string {
  const fingerprint = createHash("sha256")
    .update(`${request.instituteId}:${request.testId}:` +
      `${action}:${request.expectedVersion}`)
    .digest("hex");
  return `template_lifecycle_${fingerprint}`;
}

function toFirestoreLifecycleAudit(input: {
  action: TemplateLifecycleAction;
  auditId: string;
  beforeStatus: AdminTestTemplateStatus;
  request: AdminTestsLifecycleRequest;
  targetStatus: AdminTestTemplateStatus;
}): Record<string, unknown> {
  return {
    actionType: input.action === "publish" ?
      "ACTIVATE_TEST_TEMPLATE" :
      "ARCHIVE_TEST_TEMPLATE",
    actorId: input.request.actorId,
    actorRole: input.request.actorRole,
    actorUid: input.request.actorId,
    after: {status: input.targetStatus},
    auditId: input.auditId,
    before: {status: input.beforeStatus},
    entityId: input.request.testId,
    entityType: "test",
    instituteId: input.request.instituteId,
    ...(input.request.ipAddress ?
      {ipAddress: input.request.ipAddress} : {}),
    layer: "L0",
    metadata: {
      command: input.action,
      expectedVersion: input.request.expectedVersion,
      source: "AdminTestsService",
    },
    targetCollection: TESTS_COLLECTION,
    targetId: input.request.testId,
    tenantId: input.request.instituteId,
    timestamp: FieldValue.serverTimestamp(),
    ...(input.request.userAgent ?
      {userAgent: input.request.userAgent} : {}),
  };
}

export class AdminTestsService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeListRequest(input: {
    instituteId?: unknown;
    limit?: unknown;
  }): AdminTestsListRequest {
    return {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      limit: normalizeLimit(input.limit),
    };
  }

  public normalizeCreateRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: string;
    userAgent?: unknown;
  }): AdminTestsCreateRequest {
    const body = isRecord(input.body) ? input.body : {};
    if (Object.prototype.hasOwnProperty.call(body, "publish")) {
      throw new AdminTestsValidationError(
        "VALIDATION_ERROR",
        "Template creation cannot publish. Use the distinct publish command.",
      );
    }
    const template = normalizeTemplateMutationBody(body);

    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      ...template,
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: input.ipAddress,
      userAgent: normalizeOptionalString(input.userAgent),
    };
  }

  public normalizeUpdateRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: string;
    testId?: unknown;
    userAgent?: unknown;
  }): AdminTestsUpdateRequest {
    const body = isRecord(input.body) ? input.body : {};

    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      ...normalizeTemplateMutationBody(body),
      expectedVersion: normalizePositiveInteger(
        body.expectedVersion,
        "expectedVersion",
      ),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: input.ipAddress,
      testId: normalizeRequiredString(input.testId, "testId"),
      userAgent: normalizeOptionalString(input.userAgent),
    };
  }

  public normalizeLifecycleRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: string;
    testId?: unknown;
    userAgent?: unknown;
  }): AdminTestsLifecycleRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      expectedVersion: normalizePositiveInteger(
        body.expectedVersion,
        "expectedVersion",
      ),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: input.ipAddress,
      testId: normalizeRequiredString(input.testId, "testId"),
      userAgent: normalizeOptionalString(input.userAgent),
    };
  }

  public async listTemplates(
    request: AdminTestsListRequest,
  ): Promise<AdminTestTemplateRecord[]> {
    const snapshot = await this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(TESTS_COLLECTION)
      .limit(request.limit)
      .get();

    return snapshot.docs
      .map(toTemplateRecord)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public async createTemplate(
    request: AdminTestsCreateRequest,
  ): Promise<AdminTestsCreateResult> {
    const templatesCollection = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(TESTS_COLLECTION);
    const templateReference = templatesCollection.doc();
    await templateReference.set({
      academicYear: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.actorId,
      createdByRole: request.actorRole,
      ...(request.ipAddress ? {createdFromIp: request.ipAddress} : {}),
      ...(request.userAgent ?
        {createdFromUserAgent: request.userAgent} : {}),
      ...toFirestoreTemplateMutation(request),
      status: "draft",
      testId: templateReference.id,
      totalRuns: 0,
      updatedAt: FieldValue.serverTimestamp(),
      version: 1,
    });

    const savedSnapshot = await templateReference.get();

    return {
      template: toTemplateRecord(savedSnapshot),
    };
  }

  public async updateTemplate(
    request: AdminTestsUpdateRequest,
  ): Promise<AdminTestsUpdateResult> {
    const templateReference = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(TESTS_COLLECTION)
      .doc(request.testId);

    await this.firestore.runTransaction(async (transaction) => {
      const templateSnapshot = await transaction.get(templateReference);
      if (!templateSnapshot.exists) {
        throw new AdminTestsValidationError(
          "NOT_FOUND",
          `Test template "${request.testId}" was not found.`,
        );
      }

      const currentTemplate = toTemplateRecord(templateSnapshot);
      if (currentTemplate.version !== request.expectedVersion) {
        throw new AdminTestsValidationError(
          "CONFLICT",
          `Template version conflict: expected ${request.expectedVersion}, ` +
            `current version is ${currentTemplate.version}.`,
        );
      }

      if (
        currentTemplate.status !== "draft" &&
        currentTemplate.status !== "ready"
      ) {
        throw new AdminTestsValidationError(
          "CONFLICT",
          `Template status "${currentTemplate.status}" is structurally locked.`,
        );
      }

      const nextVersion = currentTemplate.version + 1;
      const versionSnapshotReference = templateReference
        .collection(VERSION_SNAPSHOTS_COLLECTION)
        .doc(String(currentTemplate.version));
      const existingVersionSnapshot = await transaction.get(
        versionSnapshotReference,
      );
      if (existingVersionSnapshot.exists) {
        throw new AdminTestsValidationError(
          "CONFLICT",
          "Immutable snapshot for template version " +
            `${currentTemplate.version} already exists.`,
        );
      }

      transaction.create(
        versionSnapshotReference,
        toFirestoreVersionSnapshot(currentTemplate, request, nextVersion),
      );
      transaction.update(templateReference, {
        ...toFirestoreTemplateMutation(request),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.actorId,
        updatedByRole: request.actorRole,
        ...(request.ipAddress ? {updatedFromIp: request.ipAddress} : {}),
        ...(request.userAgent ?
          {updatedFromUserAgent: request.userAgent} : {}),
        version: nextVersion,
      });
    });

    const savedSnapshot = await templateReference.get();
    return {template: toTemplateRecord(savedSnapshot)};
  }

  public async publishTemplate(
    request: AdminTestsLifecycleRequest,
  ): Promise<AdminTestsLifecycleResult> {
    return this.transitionTemplateLifecycle(request, "publish");
  }

  public async archiveTemplate(
    request: AdminTestsLifecycleRequest,
  ): Promise<AdminTestsLifecycleResult> {
    return this.transitionTemplateLifecycle(request, "archive");
  }

  private async transitionTemplateLifecycle(
    request: AdminTestsLifecycleRequest,
    action: TemplateLifecycleAction,
  ): Promise<AdminTestsLifecycleResult> {
    const instituteReference = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const templateReference = instituteReference
      .collection(TESTS_COLLECTION)
      .doc(request.testId);
    const auditId = buildLifecycleAuditId(request, action);
    const auditReference = instituteReference
      .collection(AUDIT_LOGS_COLLECTION)
      .doc(auditId);
    const targetStatus: AdminTestTemplateStatus = action === "publish" ?
      "ready" :
      "archived";

    await this.firestore.runTransaction(async (transaction) => {
      const [templateSnapshot, auditSnapshot] = await Promise.all([
        transaction.get(templateReference),
        transaction.get(auditReference),
      ]);
      if (!templateSnapshot.exists) {
        throw new AdminTestsValidationError(
          "NOT_FOUND",
          `Test template "${request.testId}" was not found.`,
        );
      }

      const currentTemplate = toTemplateRecord(templateSnapshot);
      if (currentTemplate.version !== request.expectedVersion) {
        throw new AdminTestsValidationError(
          "CONFLICT",
          `Template version conflict: expected ${request.expectedVersion}, ` +
            `current version is ${currentTemplate.version}.`,
        );
      }

      if (currentTemplate.status === targetStatus) {
        const auditData = auditSnapshot.data();
        if (
          auditSnapshot.exists &&
          auditData?.targetId === request.testId &&
          auditData?.metadata?.command === action
        ) {
          return;
        }

        throw new AdminTestsValidationError(
          "CONFLICT",
          `Template is already ${targetStatus} without matching command ` +
            "authority.",
        );
      }

      const legalSourceStatuses: readonly AdminTestTemplateStatus[] =
        action === "publish" ? ["draft"] : ["ready", "assigned"];
      if (!legalSourceStatuses.includes(currentTemplate.status)) {
        throw new AdminTestsValidationError(
          "CONFLICT",
          `Cannot ${action} template from status ` +
            `"${currentTemplate.status}".`,
        );
      }

      if (auditSnapshot.exists) {
        throw new AdminTestsValidationError(
          "CONFLICT",
          "Lifecycle audit authority already exists for this command.",
        );
      }

      transaction.create(auditReference, toFirestoreLifecycleAudit({
        action,
        auditId,
        beforeStatus: currentTemplate.status,
        request,
        targetStatus,
      }));
      transaction.update(templateReference, {
        status: targetStatus,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.actorId,
        updatedByRole: request.actorRole,
        ...(action === "publish" ? {
          publishedAt: FieldValue.serverTimestamp(),
          publishedBy: request.actorId,
        } : {
          archivedAt: FieldValue.serverTimestamp(),
          archivedBy: request.actorId,
        }),
      });
    });

    const savedSnapshot = await templateReference.get();
    return {
      auditId,
      auditPath: auditReference.path,
      template: toTemplateRecord(savedSnapshot),
    };
  }
}

export const adminTestsService = new AdminTestsService();
