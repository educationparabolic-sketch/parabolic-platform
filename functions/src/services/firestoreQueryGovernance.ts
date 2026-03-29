import {
  FirestoreQueryGovernancePolicy,
  FirestoreQueryGovernancePolicyId,
  FirestoreQueryPlan,
} from "../types/firestoreQueryGovernance";

const SEARCH_MAX_LIMIT = 50;
const AUTOCOMPLETE_MAX_LIMIT = 20;

const FIRESTORE_QUERY_GOVERNANCE_POLICIES:
Record<FirestoreQueryGovernancePolicyId, FirestoreQueryGovernancePolicy> = {
  chapterDictionaryAutocomplete: {
    collectionPathTemplate: "institutes/{instituteId}/chapterDictionary",
    disallowCollectionScan: true,
    indexedFilterFields: ["chapterName", "subject"],
    indexedOrderByFields: ["chapterName"],
    maxLimit: AUTOCOMPLETE_MAX_LIMIT,
    policyId: "chapterDictionaryAutocomplete",
    requiredPaginationMode: "bounded-list",
  },
  questionBankSearch: {
    collectionPathTemplate: "institutes/{instituteId}/questionBank",
    disallowCollectionScan: true,
    indexedFilterFields: [
      "chapter",
      "difficulty",
      "examType",
      "primaryTag",
      "searchTokens",
      "subject",
    ],
    indexedOrderByFields: ["createdAt", "questionId", "usedCount"],
    maxLimit: SEARCH_MAX_LIMIT,
    policyId: "questionBankSearch",
    requiredPaginationMode: "cursor",
  },
  studentYearMetricsSearch: {
    collectionPathTemplate:
      "institutes/{instituteId}/academicYears/{yearId}/studentYearMetrics",
    disallowCollectionScan: true,
    indexedFilterFields: [
      "avgRawScorePercent",
      "disciplineIndex",
      "riskState",
    ],
    indexedOrderByFields: [
      "avgRawScorePercent",
      "disciplineIndex",
      "studentId",
    ],
    maxLimit: SEARCH_MAX_LIMIT,
    policyId: "studentYearMetricsSearch",
    requiredPaginationMode: "cursor",
  },
  studentsBatchSearch: {
    collectionPathTemplate: "institutes/{instituteId}/students",
    disallowCollectionScan: true,
    indexedFilterFields: ["batchId"],
    indexedOrderByFields: ["studentId"],
    maxLimit: SEARCH_MAX_LIMIT,
    policyId: "studentsBatchSearch",
    requiredPaginationMode: "cursor",
  },
  tagDictionaryAutocomplete: {
    collectionPathTemplate: "institutes/{instituteId}/tagDictionary",
    disallowCollectionScan: true,
    indexedFilterFields: ["tagName"],
    indexedOrderByFields: ["tagName"],
    maxLimit: AUTOCOMPLETE_MAX_LIMIT,
    policyId: "tagDictionaryAutocomplete",
    requiredPaginationMode: "bounded-list",
  },
};

/**
 * Raised when a Firestore query plan violates governance policy.
 */
class FirestoreQueryGovernanceValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "FirestoreQueryGovernanceValidationError";
  }
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new FirestoreQueryGovernanceValidationError(
      `Firestore query governance field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new FirestoreQueryGovernanceValidationError(
      `Firestore query governance field "${fieldName}" must be non-empty.`,
    );
  }

  return normalizedValue;
};

const normalizeFields = (value: string[], fieldName: string): string[] => {
  const normalizedFields = value.map((entry) =>
    normalizeRequiredString(entry, fieldName),
  );

  return [...new Set(normalizedFields)];
};

const pathMatchesTemplate = (path: string, template: string): boolean => {
  const pathSegments = path.split("/");
  const templateSegments = template.split("/");

  if (pathSegments.length !== templateSegments.length) {
    return false;
  }

  return templateSegments.every((segment, index) => {
    if (segment.startsWith("{") && segment.endsWith("}")) {
      return Boolean(pathSegments[index]);
    }

    return segment === pathSegments[index];
  });
};

/**
 * Validates Firestore query plans against approved deterministic policies.
 */
export class FirestoreQueryGovernanceService {
  /**
   * Returns the governance policy associated with the supplied identifier.
   * @param {FirestoreQueryGovernancePolicyId} policyId Policy identifier.
   * @return {FirestoreQueryGovernancePolicy} Query governance policy.
   */
  public getPolicy(
    policyId: FirestoreQueryGovernancePolicyId,
  ): FirestoreQueryGovernancePolicy {
    return FIRESTORE_QUERY_GOVERNANCE_POLICIES[policyId];
  }

  /**
   * Validates that a query plan stays within the approved policy boundary.
   * @param {FirestoreQueryPlan} plan Proposed Firestore query plan.
   * @return {void} Returns when the query plan is approved.
   */
  public assertQueryPlan(plan: FirestoreQueryPlan): void {
    const policy = this.getPolicy(plan.policyId);
    const collectionPath = normalizeRequiredString(
      plan.collectionPath,
      "collectionPath",
    );
    const filterFields = normalizeFields(plan.filterFields, "filterFields");
    const orderByFields = normalizeFields(plan.orderByFields, "orderByFields");

    if (!pathMatchesTemplate(collectionPath, policy.collectionPathTemplate)) {
      throw new FirestoreQueryGovernanceValidationError(
        `Firestore query path "${collectionPath}" is not approved for ` +
        `${plan.policyId}.`,
      );
    }

    if (
      !Number.isInteger(plan.limit) ||
      plan.limit < 1 ||
      plan.limit > policy.maxLimit
    ) {
      throw new FirestoreQueryGovernanceValidationError(
        `Firestore query limit for ${plan.policyId} must be between 1 and ` +
        `${policy.maxLimit}.`,
      );
    }

    if (plan.paginationMode !== policy.requiredPaginationMode) {
      throw new FirestoreQueryGovernanceValidationError(
        `Firestore query pagination mode for ${plan.policyId} must be ` +
        `${policy.requiredPaginationMode}.`,
      );
    }

    if (policy.disallowCollectionScan && filterFields.length === 0) {
      throw new FirestoreQueryGovernanceValidationError(
        `Firestore query policy ${plan.policyId} disallows collection scans.`,
      );
    }

    for (const filterField of filterFields) {
      if (!policy.indexedFilterFields.includes(filterField)) {
        throw new FirestoreQueryGovernanceValidationError(
          `Firestore query filter field "${filterField}" is not indexed for ` +
          `${plan.policyId}.`,
        );
      }
    }

    for (const orderByField of orderByFields) {
      if (!policy.indexedOrderByFields.includes(orderByField)) {
        throw new FirestoreQueryGovernanceValidationError(
          `Firestore query orderBy field "${orderByField}" is not indexed ` +
          `for ${plan.policyId}.`,
        );
      }
    }
  }
}

export const firestoreQueryGovernanceService =
  new FirestoreQueryGovernanceService();
