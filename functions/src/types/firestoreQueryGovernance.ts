export type FirestoreQueryGovernancePolicyId =
  "questionBankSearch" |
  "studentsBatchSearch" |
  "studentYearMetricsSearch" |
  "tagDictionaryAutocomplete" |
  "chapterDictionaryAutocomplete";

export type FirestoreQueryPaginationMode = "bounded-list" | "cursor";

export interface FirestoreIndexedQueryPattern {
  filterFields: string[];
  orderByFields: string[];
  patternId: string;
}

export interface FirestoreQueryGovernancePolicy {
  approvedQueryPatterns: FirestoreIndexedQueryPattern[];
  collectionPathTemplate: string;
  disallowCollectionScan: boolean;
  indexedFilterFields: string[];
  indexedOrderByFields: string[];
  maxLimit: number;
  policyId: FirestoreQueryGovernancePolicyId;
  requiredPaginationMode: FirestoreQueryPaginationMode;
}

export interface FirestoreQueryPlan {
  collectionPath: string;
  filterFields: string[];
  limit: number;
  orderByFields: string[];
  paginationMode: FirestoreQueryPaginationMode;
  policyId: FirestoreQueryGovernancePolicyId;
}

export interface FirestoreValidatedQueryPlan {
  matchedPatternId: string;
  plan: FirestoreQueryPlan;
  policy: FirestoreQueryGovernancePolicy;
}
