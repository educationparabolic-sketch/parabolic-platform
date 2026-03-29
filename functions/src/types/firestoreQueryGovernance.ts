export type FirestoreQueryGovernancePolicyId =
  "questionBankSearch" |
  "studentsBatchSearch" |
  "studentYearMetricsSearch" |
  "tagDictionaryAutocomplete" |
  "chapterDictionaryAutocomplete";

export type FirestoreQueryPaginationMode = "bounded-list" | "cursor";

export interface FirestoreQueryGovernancePolicy {
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
