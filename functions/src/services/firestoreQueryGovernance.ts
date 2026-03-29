import {
  FirestoreQueryGovernancePolicy,
  FirestoreQueryGovernancePolicyId,
  FirestoreQueryPlan,
  FirestoreValidatedQueryPlan,
} from "../types/firestoreQueryGovernance";

const SEARCH_MAX_LIMIT = 50;
const AUTOCOMPLETE_MAX_LIMIT = 20;

const FIRESTORE_QUERY_GOVERNANCE_POLICIES:
Record<FirestoreQueryGovernancePolicyId, FirestoreQueryGovernancePolicy> = {
  chapterDictionaryAutocomplete: {
    approvedQueryPatterns: [
      {
        filterFields: ["chapterName"],
        orderByFields: ["chapterName"],
        patternId: "chapter_prefix",
      },
      {
        filterFields: ["chapterName", "subject"],
        orderByFields: ["chapterName"],
        patternId: "chapter_prefix_subject",
      },
    ],
    collectionPathTemplate: "institutes/{instituteId}/chapterDictionary",
    disallowCollectionScan: true,
    indexedFilterFields: ["chapterName", "subject"],
    indexedOrderByFields: ["chapterName"],
    maxLimit: AUTOCOMPLETE_MAX_LIMIT,
    policyId: "chapterDictionaryAutocomplete",
    requiredPaginationMode: "bounded-list",
  },
  questionBankSearch: {
    approvedQueryPatterns: [
      {
        filterFields: ["examType", "subject"],
        orderByFields: ["createdAt", "questionId"],
        patternId: "examType_subject_createdAt",
      },
      {
        filterFields: ["examType", "subject"],
        orderByFields: ["usedCount", "questionId"],
        patternId: "examType_subject_usedCount",
      },
      {
        filterFields: ["subject", "chapter"],
        orderByFields: ["createdAt", "questionId"],
        patternId: "subject_chapter_createdAt",
      },
      {
        filterFields: ["subject", "chapter"],
        orderByFields: ["usedCount", "questionId"],
        patternId: "subject_chapter_usedCount",
      },
      {
        filterFields: ["difficulty", "subject"],
        orderByFields: ["createdAt", "questionId"],
        patternId: "difficulty_subject_createdAt",
      },
      {
        filterFields: ["difficulty", "subject"],
        orderByFields: ["usedCount", "questionId"],
        patternId: "difficulty_subject_usedCount",
      },
      {
        filterFields: ["primaryTag"],
        orderByFields: ["createdAt", "questionId"],
        patternId: "primaryTag_createdAt",
      },
      {
        filterFields: ["primaryTag"],
        orderByFields: ["usedCount", "questionId"],
        patternId: "primaryTag_usedCount",
      },
      {
        filterFields: ["searchTokens"],
        orderByFields: ["createdAt", "questionId"],
        patternId: "searchToken_createdAt",
      },
      {
        filterFields: ["searchTokens"],
        orderByFields: ["usedCount", "questionId"],
        patternId: "searchToken_usedCount",
      },
    ],
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
    approvedQueryPatterns: [
      {
        filterFields: ["riskState"],
        orderByFields: ["studentId"],
        patternId: "riskState_studentId",
      },
      {
        filterFields: ["riskState"],
        orderByFields: ["disciplineIndex", "studentId"],
        patternId: "riskState_disciplineIndex",
      },
      {
        filterFields: ["riskState"],
        orderByFields: ["avgRawScorePercent", "studentId"],
        patternId: "riskState_avgRawScorePercent",
      },
      {
        filterFields: ["avgRawScorePercent"],
        orderByFields: ["avgRawScorePercent", "studentId"],
        patternId: "avgRawScorePercent_range",
      },
      {
        filterFields: ["riskState", "avgRawScorePercent"],
        orderByFields: ["avgRawScorePercent", "studentId"],
        patternId: "riskState_avgRawScorePercent_range",
      },
      {
        filterFields: ["disciplineIndex"],
        orderByFields: ["disciplineIndex", "studentId"],
        patternId: "disciplineIndex_range",
      },
      {
        filterFields: ["riskState", "disciplineIndex"],
        orderByFields: ["disciplineIndex", "studentId"],
        patternId: "riskState_disciplineIndex_range",
      },
    ],
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
    approvedQueryPatterns: [
      {
        filterFields: ["batchId"],
        orderByFields: ["studentId"],
        patternId: "batch_studentId",
      },
    ],
    collectionPathTemplate: "institutes/{instituteId}/students",
    disallowCollectionScan: true,
    indexedFilterFields: ["batchId"],
    indexedOrderByFields: ["studentId"],
    maxLimit: SEARCH_MAX_LIMIT,
    policyId: "studentsBatchSearch",
    requiredPaginationMode: "cursor",
  },
  tagDictionaryAutocomplete: {
    approvedQueryPatterns: [
      {
        filterFields: ["tagName"],
        orderByFields: ["tagName"],
        patternId: "tag_prefix",
      },
    ],
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

const buildExactFieldKey = (value: string[]): string => value.join("|");

const buildUnorderedFieldKey = (value: string[]): string =>
  [...value].sort().join("|");

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
  public assertQueryPlan(
    plan: FirestoreQueryPlan,
  ): FirestoreValidatedQueryPlan {
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

    if (orderByFields.length === 0) {
      throw new FirestoreQueryGovernanceValidationError(
        `Firestore query policy ${plan.policyId} requires at least one ` +
        "orderBy field.",
      );
    }

    const matchedPattern = policy.approvedQueryPatterns.find((pattern) =>
      buildUnorderedFieldKey(pattern.filterFields) ===
        buildUnorderedFieldKey(filterFields) &&
      buildExactFieldKey(pattern.orderByFields) ===
        buildExactFieldKey(orderByFields),
    );

    if (!matchedPattern) {
      throw new FirestoreQueryGovernanceValidationError(
        `Firestore query for ${plan.policyId} does not match an approved ` +
        "indexed query pattern.",
      );
    }

    return {
      matchedPatternId: matchedPattern.patternId,
      plan: {
        ...plan,
        collectionPath,
        filterFields,
        orderByFields,
      },
      policy,
    };
  }
}

export const firestoreQueryGovernanceService =
  new FirestoreQueryGovernanceService();
