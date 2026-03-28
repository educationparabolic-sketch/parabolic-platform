export type SearchDomain =
  "questionBank" |
  "students" |
  "studentYearMetrics" |
  "runAnalytics" |
  "vendorAggregates";

export type SearchActorRole =
  "student" |
  "teacher" |
  "admin" |
  "vendor" |
  "internal";

export type SearchQueryPattern =
  "examType_subject" |
  "subject_chapter" |
  "difficulty_subject" |
  "chapter_difficulty" |
  "primaryTag" |
  "additionalTags" |
  "status" |
  "academicYear" |
  "token_text" |
  "batch" |
  "batch_riskState" |
  "riskState" |
  "avgRawScoreRange" |
  "avgAccuracyRange" |
  "disciplineIndexRange" |
  "percentileRange";

export interface SearchDomainDefinition {
  academicYearScoped: boolean;
  collectionPathTemplate: string;
  defaultLimit: number;
  domain: SearchDomain;
  indexedOrderByFields: string[];
  maxLimit: number;
  permittedQueryPatterns: SearchQueryPattern[];
  permittedRoles: SearchActorRole[];
  usesSummaryCollectionsOnly: boolean;
}

export interface InitializeSearchDomainRequest {
  actorRole?: SearchActorRole;
  domain: SearchDomain;
  instituteId?: string;
  limit?: number;
  yearId?: string;
}

export interface InitializedSearchDomain {
  collectionPath: string;
  definition: SearchDomainDefinition;
  limit: number;
}
