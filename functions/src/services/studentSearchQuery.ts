import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {searchArchitectureService} from "./searchArchitecture";
import {firestoreQueryGovernanceService} from "./firestoreQueryGovernance";
import {
  StudentFilteringBaseDomain,
  StudentFilteringCursor,
  StudentFilteringQueryRequest,
  StudentFilteringQueryResult,
  StudentFilteringResultItem,
  StudentFilteringSortDirection,
  StudentFilteringSortField,
  StudentMetricRangeFilter,
  StudentMetricsSearchSummary,
} from "../types/studentSearch";
import {StudentRiskState} from "../types/riskEngine";

const STUDENT_SCAN_MULTIPLIER = 3;
const MAX_SCAN_LIMIT = 150;
const SUPPORTED_RISK_STATES = new Set<StudentRiskState>([
  "Stable",
  "Drift-Prone",
  "Impulsive",
  "Overextended",
  "Volatile",
]);

interface NormalizedMetricRange {
  max?: number;
  min?: number;
}

interface NormalizedStudentFilteringFilter {
  avgRawScorePercentRange?: NormalizedMetricRange;
  batchId?: string;
  disciplineIndexRange?: NormalizedMetricRange;
  riskState?: StudentRiskState;
}

interface NormalizedStudentFilteringSort {
  direction: StudentFilteringSortDirection;
  field: StudentFilteringSortField;
}

interface StudentDocumentRecord {
  batchId?: unknown;
  name?: unknown;
  status?: unknown;
  studentId?: unknown;
}

interface StudentMetricsDocumentRecord {
  avgRawScorePercent?: unknown;
  disciplineIndex?: unknown;
  riskState?: unknown;
  studentId?: unknown;
}

/**
 * Raised when a student-filtering query request fails validation.
 */
class StudentFilteringValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "StudentFilteringValidationError";
  }
}

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
    throw new StudentFilteringValidationError(
      `Student filter field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new StudentFilteringValidationError(
      `Student filter field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const normalizePercent = (value: unknown, fieldName: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new StudentFilteringValidationError(
      `Student filter field "${fieldName}" must be a number between 0 and 100.`,
    );
  }

  return value;
};

const toOptionalPercent = (value: unknown): number | null => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    return null;
  }

  return value;
};

const normalizeMetricRange = (
  value: unknown,
  fieldName: string,
): NormalizedMetricRange | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new StudentFilteringValidationError(
      `Student filter field "${fieldName}" must be an object.`,
    );
  }

  const min = value.min === undefined ?
    undefined :
    normalizePercent(value.min, `${fieldName}.min`);
  const max = value.max === undefined ?
    undefined :
    normalizePercent(value.max, `${fieldName}.max`);

  if (min === undefined && max === undefined) {
    throw new StudentFilteringValidationError(
      `Student filter field "${fieldName}" must include min or max.`,
    );
  }

  if (min !== undefined && max !== undefined && min > max) {
    throw new StudentFilteringValidationError(
      `Student filter field "${fieldName}" cannot have min greater than max.`,
    );
  }

  return {
    max,
    min,
  };
};

const normalizeRiskState = (value: unknown): StudentRiskState | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = normalizeRequiredString(value, "riskState");

  if (!SUPPORTED_RISK_STATES.has(normalizedValue as StudentRiskState)) {
    throw new StudentFilteringValidationError(
      "Student filter field \"riskState\" must be a supported risk state.",
    );
  }

  return normalizedValue as StudentRiskState;
};

const normalizeFilter = (value: unknown): NormalizedStudentFilteringFilter => {
  if (!isPlainObject(value)) {
    throw new StudentFilteringValidationError(
      "Student filter \"filter\" must be an object.",
    );
  }

  const normalizedFilter: NormalizedStudentFilteringFilter = {
    avgRawScorePercentRange: normalizeMetricRange(
      value.avgRawScorePercentRange,
      "avgRawScorePercentRange",
    ),
    batchId: value.batchId === undefined ?
      undefined :
      normalizeRequiredString(value.batchId, "batchId"),
    disciplineIndexRange: normalizeMetricRange(
      value.disciplineIndexRange,
      "disciplineIndexRange",
    ),
    riskState: normalizeRiskState(value.riskState),
  };

  if (
    !normalizedFilter.batchId &&
    !normalizedFilter.riskState &&
    !normalizedFilter.avgRawScorePercentRange &&
    !normalizedFilter.disciplineIndexRange
  ) {
    throw new StudentFilteringValidationError(
      "Student filtering requires at least one supported filter.",
    );
  }

  if (
    normalizedFilter.avgRawScorePercentRange &&
    normalizedFilter.disciplineIndexRange
  ) {
    throw new StudentFilteringValidationError(
      "Student filtering supports only one score range filter per query.",
    );
  }

  return normalizedFilter;
};

const resolveBaseDomain = (
  filter: NormalizedStudentFilteringFilter,
): StudentFilteringBaseDomain =>
  filter.batchId &&
  !filter.riskState &&
  !filter.avgRawScorePercentRange &&
  !filter.disciplineIndexRange ?
    "students" :
    "studentYearMetrics";

const normalizeSortField = (
  value: unknown,
  baseDomain: StudentFilteringBaseDomain,
  filter: NormalizedStudentFilteringFilter,
): StudentFilteringSortField => {
  if (filter.avgRawScorePercentRange) {
    if (value === undefined) {
      return "avgRawScorePercent";
    }

    if (value !== "avgRawScorePercent") {
      throw new StudentFilteringValidationError(
        "avgRawScorePercent range queries must sort by avgRawScorePercent.",
      );
    }

    return value;
  }

  if (filter.disciplineIndexRange) {
    if (value === undefined) {
      return "disciplineIndex";
    }

    if (value !== "disciplineIndex") {
      throw new StudentFilteringValidationError(
        "disciplineIndex range queries must sort by disciplineIndex.",
      );
    }

    return value;
  }

  if (value === undefined) {
    return "studentId";
  }

  if (
    value === "studentId" ||
    (baseDomain === "studentYearMetrics" && value === "avgRawScorePercent") ||
    (baseDomain === "studentYearMetrics" && value === "disciplineIndex")
  ) {
    return value;
  }

  throw new StudentFilteringValidationError(
    "Student filtering sort field must be one of studentId, " +
    "avgRawScorePercent, or disciplineIndex when supported by the query.",
  );
};

const normalizeSortDirection = (
  value: unknown,
  field: StudentFilteringSortField,
): StudentFilteringSortDirection => {
  if (value === undefined) {
    return field === "studentId" ? "asc" : "desc";
  }

  if (value === "asc" || value === "desc") {
    return value;
  }

  throw new StudentFilteringValidationError(
    "Student filtering sort direction must be either asc or desc.",
  );
};

const normalizeSort = (
  value: unknown,
  baseDomain: StudentFilteringBaseDomain,
  filter: NormalizedStudentFilteringFilter,
): NormalizedStudentFilteringSort => {
  if (value === undefined) {
    const field = normalizeSortField(undefined, baseDomain, filter);
    return {
      direction: normalizeSortDirection(undefined, field),
      field,
    };
  }

  if (!isPlainObject(value)) {
    throw new StudentFilteringValidationError(
      "Student filtering \"sort\" must be an object.",
    );
  }

  const field = normalizeSortField(value.field, baseDomain, filter);

  return {
    direction: normalizeSortDirection(value.direction, field),
    field,
  };
};

const normalizeCursor = (
  value: unknown,
  baseDomain: StudentFilteringBaseDomain,
  sort: NormalizedStudentFilteringSort,
): StudentFilteringCursor | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new StudentFilteringValidationError(
      "Student filtering \"cursor\" must be an object.",
    );
  }

  const cursorBaseDomain = value.baseDomain;
  const cursorSortField = value.sortField;
  const cursorSortDirection = value.sortDirection;
  const studentId = normalizeRequiredString(
    value.studentId,
    "cursor.studentId",
  );
  const sortValue = value.sortValue;

  if (cursorBaseDomain !== baseDomain) {
    throw new StudentFilteringValidationError(
      "Student filtering cursor baseDomain must match the active query.",
    );
  }

  if (cursorSortField !== sort.field) {
    throw new StudentFilteringValidationError(
      "Student filtering cursor sortField must match the active sort field.",
    );
  }

  if (cursorSortDirection !== sort.direction) {
    throw new StudentFilteringValidationError(
      "Student filtering cursor sortDirection must match the active sort " +
      "direction.",
    );
  }

  if (sort.field === "studentId") {
    if (typeof sortValue !== "string") {
      throw new StudentFilteringValidationError(
        "Student filtering cursor sortValue must be a string for studentId " +
        "sorting.",
      );
    }

    return {
      baseDomain,
      sortDirection: sort.direction,
      sortField: sort.field,
      sortValue: normalizeRequiredString(
        sortValue,
        "cursor.sortValue",
      ),
      studentId,
    };
  }

  if (typeof sortValue !== "number" || !Number.isFinite(sortValue)) {
    throw new StudentFilteringValidationError(
      "Student filtering cursor sortValue must be a number for score sorting.",
    );
  }

  return {
    baseDomain,
    sortDirection: sort.direction,
    sortField: sort.field,
    sortValue,
    studentId,
  };
};

const toStudentMetricsSummary = (
  payload: StudentMetricsDocumentRecord | undefined,
): StudentMetricsSearchSummary | null => {
  if (!payload) {
    return null;
  }

  const riskState = toOptionalString(payload.riskState);

  return {
    avgRawScorePercent: toOptionalPercent(payload.avgRawScorePercent),
    disciplineIndex: toOptionalPercent(payload.disciplineIndex),
    riskState: riskState &&
        SUPPORTED_RISK_STATES.has(riskState as StudentRiskState) ?
      riskState as StudentRiskState :
      null,
  };
};

const buildMetricsCursor = (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  sort: NormalizedStudentFilteringSort,
): StudentFilteringCursor => ({
  baseDomain: "studentYearMetrics",
  sortDirection: sort.direction,
  sortField: sort.field,
  sortValue: sort.field === "studentId" ?
    normalizeRequiredString(snapshot.id, "cursor.sortValue") :
    normalizePercent(snapshot.data()[sort.field], `cursor.${sort.field}`),
  studentId: normalizeRequiredString(
    snapshot.data().studentId ?? snapshot.id,
    "cursor.studentId",
  ),
});

const buildStudentCursor = (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
): StudentFilteringCursor => {
  const studentId = normalizeRequiredString(
    snapshot.data().studentId ?? snapshot.id,
    "cursor.studentId",
  );

  return {
    baseDomain: "students",
    sortDirection: "asc",
    sortField: "studentId",
    sortValue: studentId,
    studentId,
  };
};

const toResultItem = (
  studentSnapshot: FirebaseFirestore.DocumentSnapshot,
  metricsPayload?: StudentMetricsDocumentRecord,
): StudentFilteringResultItem => {
  const studentPayload =
    (studentSnapshot.data() ?? {}) as StudentDocumentRecord;
  const resolvedStudentId = normalizeRequiredString(
    studentPayload.studentId ?? studentSnapshot.id,
    "studentId",
  );

  return {
    batchId: toOptionalString(studentPayload.batchId),
    metrics: toStudentMetricsSummary(metricsPayload),
    name: toOptionalString(studentPayload.name),
    status: toOptionalString(studentPayload.status),
    studentId: resolvedStudentId,
  };
};

const getMetricsScanLimit = (limit: number): number =>
  Math.min(limit * STUDENT_SCAN_MULTIPLIER, MAX_SCAN_LIMIT);

const getMetricsGovernedFilterFields = (
  filter: NormalizedStudentFilteringFilter,
): string[] => {
  const governedFields: string[] = [];

  if (filter.riskState) {
    governedFields.push("riskState");
  }

  if (filter.avgRawScorePercentRange) {
    governedFields.push("avgRawScorePercent");
  }

  if (filter.disciplineIndexRange) {
    governedFields.push("disciplineIndex");
  }

  return governedFields;
};

/**
 * Executes deterministic student filtering queries across student identity and
 * academic-year metrics collections.
 */
export class StudentFilteringQueryService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("StudentFilteringQueryService");

  /**
   * Queries students using approved batch and metric filters with pagination.
   * @param {StudentFilteringQueryRequest} request Query and pagination input.
   * @return {Promise<StudentFilteringQueryResult>} Paginated student
   * result set.
   */
  public async searchStudents(
    request: StudentFilteringQueryRequest,
  ): Promise<StudentFilteringQueryResult> {
    const instituteId = normalizeRequiredString(
      request.instituteId,
      "instituteId",
    );
    const yearId = normalizeRequiredString(request.yearId, "yearId");
    const filter = normalizeFilter(request.filter);
    const baseDomain = resolveBaseDomain(filter);
    const sort = normalizeSort(request.sort, baseDomain, filter);
    const cursor = normalizeCursor(request.cursor, baseDomain, sort);

    if (filter.batchId) {
      searchArchitectureService.assertQueryPattern("students", "batch");
    }

    if (filter.riskState) {
      searchArchitectureService.assertQueryPattern(
        "studentYearMetrics",
        "riskState",
      );
    }

    if (filter.avgRawScorePercentRange) {
      searchArchitectureService.assertQueryPattern(
        "studentYearMetrics",
        "avgRawScoreRange",
      );
    }

    if (filter.disciplineIndexRange) {
      searchArchitectureService.assertQueryPattern(
        "studentYearMetrics",
        "disciplineIndexRange",
      );
    }

    if (baseDomain === "students") {
      return this.searchStudentsByBatch({
        actorRole: request.actorRole,
        cursor,
        filter,
        instituteId,
        limit: request.limit,
        sort,
        yearId,
      });
    }

    return this.searchStudentsByMetrics({
      actorRole: request.actorRole,
      cursor,
      filter,
      instituteId,
      limit: request.limit,
      sort,
      yearId,
    });
  }

  /**
   * Executes batch-only filtering directly against institute student records.
   * @param {object} request Batch filtering request context.
   * @return {Promise<StudentFilteringQueryResult>} Paginated student results.
   */
  private async searchStudentsByBatch(
    request: {
      actorRole: StudentFilteringQueryRequest["actorRole"];
      cursor?: StudentFilteringCursor;
      filter: NormalizedStudentFilteringFilter;
      instituteId: string;
      limit?: number;
      sort: NormalizedStudentFilteringSort;
      yearId: string;
    },
  ): Promise<StudentFilteringQueryResult> {
    const searchDomain = searchArchitectureService.initializeDomain({
      actorRole: request.actorRole,
      domain: "students",
      instituteId: request.instituteId,
      limit: request.limit,
    });
    const limit = searchDomain.limit;
    firestoreQueryGovernanceService.assertQueryPlan({
      collectionPath: searchDomain.collectionPath,
      filterFields: ["batchId"],
      limit,
      orderByFields: ["studentId"],
      paginationMode: "cursor",
      policyId: "studentsBatchSearch",
    });
    let query: FirebaseFirestore.Query = this.firestore.collection(
      searchDomain.collectionPath,
    )
      .where("batchId", "==", request.filter.batchId)
      .orderBy("studentId", "asc")
      .limit(limit + 1);

    if (request.cursor) {
      query = query.startAfter(request.cursor.sortValue);
    }

    const querySnapshot = await query.get();
    const hasMore = querySnapshot.docs.length > limit;
    const selectedDocuments = querySnapshot.docs.slice(0, limit);
    const metricsReferences = selectedDocuments.map((studentSnapshot) =>
      this.firestore.doc(
        `institutes/${request.instituteId}/academicYears/${request.yearId}/` +
        `studentYearMetrics/${studentSnapshot.id}`,
      ),
    );
    const metricsSnapshots = metricsReferences.length > 0 ?
      await this.firestore.getAll(...metricsReferences) :
      [];
    const metricsMap = new Map(
      metricsSnapshots.map((snapshot) => [
        snapshot.id,
        snapshot.data() as StudentMetricsDocumentRecord | undefined,
      ]),
    );
    const students = selectedDocuments.map((studentSnapshot) =>
      toResultItem(studentSnapshot, metricsMap.get(studentSnapshot.id)),
    );
    const lastSnapshot =
      selectedDocuments.length > 0 ?
        selectedDocuments[selectedDocuments.length - 1] :
        undefined;

    this.logger.info("Student filtering query completed", {
      baseDomain: "students",
      batchFilterApplied: Boolean(request.filter.batchId),
      cursorProvided: Boolean(request.cursor),
      instituteId: request.instituteId,
      limit,
      resultCount: students.length,
      yearId: request.yearId,
    });

    return {
      nextCursor:
        hasMore && lastSnapshot ? buildStudentCursor(lastSnapshot) : null,
      students,
    };
  }

  /**
   * Executes metrics-driven filtering against academic-year summaries and
   * joins bounded student identity records.
   * @param {object} request Metrics filtering request context.
   * @return {Promise<StudentFilteringQueryResult>} Paginated student results.
   */
  private async searchStudentsByMetrics(
    request: {
      actorRole: StudentFilteringQueryRequest["actorRole"];
      cursor?: StudentFilteringCursor;
      filter: NormalizedStudentFilteringFilter;
      instituteId: string;
      limit?: number;
      sort: NormalizedStudentFilteringSort;
      yearId: string;
    },
  ): Promise<StudentFilteringQueryResult> {
    const searchDomain = searchArchitectureService.initializeDomain({
      actorRole: request.actorRole,
      domain: "studentYearMetrics",
      instituteId: request.instituteId,
      limit: request.limit,
      yearId: request.yearId,
    });
    const limit = searchDomain.limit;
    firestoreQueryGovernanceService.assertQueryPlan({
      collectionPath: searchDomain.collectionPath,
      filterFields: getMetricsGovernedFilterFields(request.filter),
      limit,
      orderByFields:
        request.sort.field === "studentId" ?
          ["studentId"] :
          [request.sort.field, "studentId"],
      paginationMode: "cursor",
      policyId: "studentYearMetricsSearch",
    });
    const scanLimit = getMetricsScanLimit(limit);
    let workingCursor = request.cursor;
    const results: StudentFilteringResultItem[] = [];
    let nextCursor: StudentFilteringCursor | null = null;

    while (results.length < limit) {
      let query: FirebaseFirestore.Query = this.firestore.collection(
        searchDomain.collectionPath,
      );

      if (request.filter.riskState) {
        query = query.where("riskState", "==", request.filter.riskState);
      }

      query = this.applyMetricRange(query, request.filter, request.sort.field);
      query = this.applyMetricOrderBy(query, request.sort).limit(scanLimit + 1);

      if (workingCursor) {
        if (request.sort.field === "studentId") {
          query = query.startAfter(workingCursor.sortValue);
        } else {
          query = query.startAfter(
            workingCursor.sortValue,
            workingCursor.studentId,
          );
        }
      }

      const querySnapshot = await query.get();
      const selectedDocuments = querySnapshot.docs.slice(0, scanLimit);
      const queryHasMore = querySnapshot.docs.length > scanLimit;

      if (selectedDocuments.length === 0) {
        break;
      }

      const studentSnapshots = await this.fetchStudentSnapshots(
        request.instituteId,
        selectedDocuments.map((snapshot) => snapshot.id),
      );

      let processedDocuments = 0;
      let moreAvailable = queryHasMore;

      for (const metricsSnapshot of selectedDocuments) {
        processedDocuments += 1;
        const metricsPayload =
          metricsSnapshot.data() as StudentMetricsDocumentRecord;
        const studentSnapshot = studentSnapshots.get(metricsSnapshot.id);

        if (!studentSnapshot?.exists) {
          this.logger.warn("Student metrics search skipped missing student", {
            instituteId: request.instituteId,
            studentId: metricsSnapshot.id,
            yearId: request.yearId,
          });
          nextCursor = buildMetricsCursor(metricsSnapshot, request.sort);
          moreAvailable =
            processedDocuments < selectedDocuments.length || queryHasMore;
          continue;
        }

        const studentPayload =
          (studentSnapshot.data() ?? {}) as StudentDocumentRecord;
        const batchId = toOptionalString(studentPayload.batchId);

        if (request.filter.batchId && batchId !== request.filter.batchId) {
          nextCursor = buildMetricsCursor(metricsSnapshot, request.sort);
          moreAvailable =
            processedDocuments < selectedDocuments.length || queryHasMore;
          continue;
        }

        results.push(toResultItem(studentSnapshot, metricsPayload));
        nextCursor = buildMetricsCursor(metricsSnapshot, request.sort);
        moreAvailable =
          processedDocuments < selectedDocuments.length || queryHasMore;

        if (results.length >= limit) {
          break;
        }
      }

      if (results.length >= limit) {
        if (!moreAvailable) {
          nextCursor = null;
        }
        break;
      }

      if (!nextCursor || !moreAvailable) {
        nextCursor = null;
        break;
      }

      workingCursor = nextCursor;
    }

    this.logger.info("Student filtering query completed", {
      baseDomain: "studentYearMetrics",
      batchFilterApplied: Boolean(request.filter.batchId),
      cursorProvided: Boolean(request.cursor),
      disciplineRangeApplied: Boolean(request.filter.disciplineIndexRange),
      instituteId: request.instituteId,
      limit,
      resultCount: results.length,
      riskStateApplied: Boolean(request.filter.riskState),
      sortDirection: request.sort.direction,
      sortField: request.sort.field,
      yearId: request.yearId,
    });

    return {
      nextCursor,
      students: results,
    };
  }

  /**
   * Applies the single permitted score-range filter for the current query.
   * @param {FirebaseFirestore.Query} query Base Firestore query.
   * @param {NormalizedStudentFilteringFilter} filter Normalized filter state.
   * @param {StudentFilteringSortField} sortField Active sort field.
   * @return {FirebaseFirestore.Query} Query with range constraints applied.
   */
  private applyMetricRange(
    query: FirebaseFirestore.Query,
    filter: NormalizedStudentFilteringFilter,
    sortField: StudentFilteringSortField,
  ): FirebaseFirestore.Query {
    const avgRange = filter.avgRawScorePercentRange;
    const disciplineRange = filter.disciplineIndexRange;

    if (avgRange) {
      return this.applyRange(query, "avgRawScorePercent", avgRange, sortField);
    }

    if (disciplineRange) {
      return this.applyRange(
        query,
        "disciplineIndex",
        disciplineRange,
        sortField,
      );
    }

    return query;
  }

  /**
   * Applies validated Firestore range constraints to a metrics field.
   * @param {FirebaseFirestore.Query} query Base Firestore query.
   * @param {"avgRawScorePercent"|"disciplineIndex"} fieldName Field to range
   * constrain.
   * @param {StudentMetricRangeFilter} range Range values.
   * @param {StudentFilteringSortField} sortField Active sort field.
   * @return {FirebaseFirestore.Query} Query with range constraints applied.
   */
  private applyRange(
    query: FirebaseFirestore.Query,
    fieldName: "avgRawScorePercent" | "disciplineIndex",
    range: StudentMetricRangeFilter,
    sortField: StudentFilteringSortField,
  ): FirebaseFirestore.Query {
    if (sortField !== fieldName) {
      throw new StudentFilteringValidationError(
        `${fieldName} range queries must sort by ${fieldName}.`,
      );
    }

    let rangedQuery = query;

    if (range.min !== undefined) {
      rangedQuery = rangedQuery.where(fieldName, ">=", range.min);
    }

    if (range.max !== undefined) {
      rangedQuery = rangedQuery.where(fieldName, "<=", range.max);
    }

    return rangedQuery;
  }

  /**
   * Applies deterministic ordering to a metrics-domain query.
   * @param {FirebaseFirestore.Query} query Base Firestore query.
   * @param {NormalizedStudentFilteringSort} sort Active sort configuration.
   * @return {FirebaseFirestore.Query} Ordered Firestore query.
   */
  private applyMetricOrderBy(
    query: FirebaseFirestore.Query,
    sort: NormalizedStudentFilteringSort,
  ): FirebaseFirestore.Query {
    if (sort.field === "studentId") {
      return query.orderBy("studentId", sort.direction);
    }

    return query
      .orderBy(sort.field, sort.direction)
      .orderBy("studentId", sort.direction);
  }

  /**
   * Loads institute student documents for the provided identifiers.
   * @param {string} instituteId Institute identifier.
   * @param {string[]} studentIds Student identifiers to load.
   * @return {Promise<Map<string, FirebaseFirestore.DocumentSnapshot>>}
   * Loaded student documents keyed by studentId.
   */
  private async fetchStudentSnapshots(
    instituteId: string,
    studentIds: string[],
  ): Promise<Map<string, FirebaseFirestore.DocumentSnapshot>> {
    if (studentIds.length === 0) {
      return new Map();
    }

    const references = studentIds.map((studentId) =>
      this.firestore.doc(`institutes/${instituteId}/students/${studentId}`),
    );
    const snapshots = await this.firestore.getAll(...references);

    return new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  }
}

export const studentFilteringQueryService = new StudentFilteringQueryService();
