import {
  InitializeSearchDomainRequest,
  InitializedSearchDomain,
  SearchActorRole,
  SearchDomain,
  SearchDomainDefinition,
  SearchQueryPattern,
} from "../types/searchArchitecture";

const DEFAULT_SEARCH_LIMIT = 25;
const MAX_SEARCH_LIMIT = 50;

const SEARCH_DOMAIN_DEFINITIONS:
Record<SearchDomain, SearchDomainDefinition> = {
  questionBank: {
    academicYearScoped: false,
    collectionPathTemplate: "institutes/{instituteId}/questionBank",
    defaultLimit: DEFAULT_SEARCH_LIMIT,
    domain: "questionBank",
    indexedOrderByFields: ["createdAt", "questionId", "usedCount"],
    maxLimit: MAX_SEARCH_LIMIT,
    permittedQueryPatterns: [
      "examType_subject",
      "subject_chapter",
      "difficulty_subject",
      "chapter_difficulty",
      "primaryTag",
      "additionalTags",
      "status",
      "academicYear",
      "token_text",
    ],
    permittedRoles: ["teacher", "admin", "internal"],
    usesSummaryCollectionsOnly: false,
  },
  students: {
    academicYearScoped: false,
    collectionPathTemplate: "institutes/{instituteId}/students",
    defaultLimit: DEFAULT_SEARCH_LIMIT,
    domain: "students",
    indexedOrderByFields: ["studentId", "batchId", "status"],
    maxLimit: MAX_SEARCH_LIMIT,
    permittedQueryPatterns: [
      "batch",
      "batch_riskState",
      "status",
      "academicYear",
    ],
    permittedRoles: ["teacher", "admin", "internal"],
    usesSummaryCollectionsOnly: false,
  },
  studentYearMetrics: {
    academicYearScoped: true,
    collectionPathTemplate:
      "institutes/{instituteId}/academicYears/{yearId}/studentYearMetrics",
    defaultLimit: DEFAULT_SEARCH_LIMIT,
    domain: "studentYearMetrics",
    indexedOrderByFields: [
      "studentId",
      "riskState",
      "avgRawScorePercent",
      "avgAccuracyPercent",
      "disciplineIndex",
      "percentile",
    ],
    maxLimit: MAX_SEARCH_LIMIT,
    permittedQueryPatterns: [
      "riskState",
      "avgRawScoreRange",
      "avgAccuracyRange",
      "disciplineIndexRange",
      "percentileRange",
    ],
    permittedRoles: ["teacher", "admin", "internal"],
    usesSummaryCollectionsOnly: true,
  },
  runAnalytics: {
    academicYearScoped: true,
    collectionPathTemplate:
      "institutes/{instituteId}/academicYears/{yearId}/runAnalytics",
    defaultLimit: DEFAULT_SEARCH_LIMIT,
    domain: "runAnalytics",
    indexedOrderByFields: ["runId", "createdAt", "lastUpdated"],
    maxLimit: MAX_SEARCH_LIMIT,
    permittedQueryPatterns: ["academicYear", "status"],
    permittedRoles: ["admin", "internal"],
    usesSummaryCollectionsOnly: true,
  },
  vendorAggregates: {
    academicYearScoped: false,
    collectionPathTemplate: "vendorAggregates",
    defaultLimit: DEFAULT_SEARCH_LIMIT,
    domain: "vendorAggregates",
    indexedOrderByFields: ["instituteName", "currentLayer", "lastActivityAt"],
    maxLimit: MAX_SEARCH_LIMIT,
    permittedQueryPatterns: ["status", "academicYear"],
    permittedRoles: ["vendor", "internal"],
    usesSummaryCollectionsOnly: true,
  },
};

/**
 * Raised when search-domain initialization or validation fails.
 */
class SearchArchitectureValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "SearchArchitectureValidationError";
  }
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new SearchArchitectureValidationError(
      `Search architecture field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SearchArchitectureValidationError(
      `Search architecture field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeLimit = (value: unknown, maxLimit: number): number => {
  if (value === undefined) {
    return DEFAULT_SEARCH_LIMIT;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maxLimit
  ) {
    throw new SearchArchitectureValidationError(
      "Search limit must be an integer between 1 and " +
      `${maxLimit}.`,
    );
  }

  return value;
};

const resolveCollectionPath = (
  definition: SearchDomainDefinition,
  instituteId?: string,
  yearId?: string,
): string => {
  if (definition.domain === "vendorAggregates") {
    return definition.collectionPathTemplate;
  }

  const normalizedInstituteId = normalizeRequiredString(
    instituteId,
    "instituteId",
  );

  if (definition.academicYearScoped) {
    const normalizedYearId = normalizeRequiredString(yearId, "yearId");

    return definition.collectionPathTemplate
      .replace("{instituteId}", normalizedInstituteId)
      .replace("{yearId}", normalizedYearId);
  }

  return definition.collectionPathTemplate.replace(
    "{instituteId}",
    normalizedInstituteId,
  );
};

/**
 * Shared foundation for deterministic search-domain configuration and guards.
 */
export class SearchArchitectureService {
  /**
   * Returns the static definition for a supported search domain.
   * @param {SearchDomain} domain Search domain identifier.
   * @return {SearchDomainDefinition} Domain configuration metadata.
   */
  public getDomainDefinition(domain: SearchDomain): SearchDomainDefinition {
    return SEARCH_DOMAIN_DEFINITIONS[domain];
  }

  /**
   * Resolves a normalized search domain with enforced access and limits.
   * @param {InitializeSearchDomainRequest} request Domain initialization input.
   * @return {InitializedSearchDomain} Normalized domain initialization state.
   */
  public initializeDomain(
    request: InitializeSearchDomainRequest,
  ): InitializedSearchDomain {
    const definition = this.getDomainDefinition(request.domain);

    if (
      request.actorRole &&
      !definition.permittedRoles.includes(request.actorRole)
    ) {
      throw new SearchArchitectureValidationError(
        `Role "${request.actorRole}" cannot access ${request.domain} search.`,
      );
    }

    return {
      collectionPath: resolveCollectionPath(
        definition,
        request.instituteId,
        request.yearId,
      ),
      definition,
      limit: normalizeLimit(request.limit, definition.maxLimit),
    };
  }

  /**
   * Validates that a query pattern is approved for the search domain.
   * @param {SearchDomain} domain Search domain identifier.
   * @param {SearchQueryPattern} queryPattern Query pattern under validation.
   * @return {void} Returns when the pattern is permitted.
   */
  public assertQueryPattern(
    domain: SearchDomain,
    queryPattern: SearchQueryPattern,
  ): void {
    const definition = this.getDomainDefinition(domain);

    if (!definition.permittedQueryPatterns.includes(queryPattern)) {
      throw new SearchArchitectureValidationError(
        `Unsupported ${domain} search query pattern: ${queryPattern}.`,
      );
    }
  }

  /**
   * Indicates whether a role can access a given search domain.
   * @param {SearchDomain} domain Search domain identifier.
   * @param {SearchActorRole} actorRole Requesting actor role.
   * @return {boolean} True when the role is permitted.
   */
  public isRolePermitted(
    domain: SearchDomain,
    actorRole: SearchActorRole,
  ): boolean {
    return this.getDomainDefinition(domain).permittedRoles.includes(actorRole);
  }
}

export const searchArchitectureService = new SearchArchitectureService();
