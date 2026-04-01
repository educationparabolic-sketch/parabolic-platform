import {
  AssetCacheTier,
  CdnArchitectureCachePolicy,
  InitializeCdnArchitectureRequest,
} from "./cdnArchitecture";

export type InitializeCdnCachePolicyRequest =
  InitializeCdnArchitectureRequest;

export type CdnCachePolicyReason =
  "activeAcademicYear" |
  "inactiveMoreThan30Days" |
  "archivedAcademicYear";

export interface InitializedCdnCachePolicyConfiguration {
  cachePolicies: Record<AssetCacheTier, CdnArchitectureCachePolicy>;
  warmAfterDaysWithoutAccess: number;
}

export interface ResolveCdnCachePolicyRequest {
  archivedAcademicYear?: boolean;
  lastAccessedAt?: Date | string;
  now?: Date | string;
}

export interface ResolvedCdnCachePolicy extends CdnArchitectureCachePolicy {
  reason: CdnCachePolicyReason;
}
