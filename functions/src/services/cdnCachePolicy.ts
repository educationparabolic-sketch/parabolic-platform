import {
  InitializeCdnCachePolicyRequest,
  InitializedCdnCachePolicyConfiguration,
  ResolveCdnCachePolicyRequest,
  ResolvedCdnCachePolicy,
} from "../types/cdnCachePolicy";
import {cdnArchitectureService} from "./cdnArchitecture";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const WARM_AFTER_DAYS_WITHOUT_ACCESS = 30;

const parseOptionalDate = (
  value: Date | string | undefined,
  fieldName: string,
): Date | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsedDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new CdnCachePolicyValidationError(
      `CDN cache policy field "${fieldName}" must be a valid date.`,
    );
  }

  return parsedDate;
};

/**
 * Raised when CDN cache policy resolution input is invalid.
 */
export class CdnCachePolicyValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "CdnCachePolicyValidationError";
  }
}

/**
 * Resolves deterministic cache tiers and Cache-Control headers for CDN assets.
 */
export class CdnCachePolicyService {
  /**
   * Returns the normalized CDN cache-policy configuration.
   * @param {InitializeCdnCachePolicyRequest} request Optional config overrides.
   * @return {InitializedCdnCachePolicyConfiguration} Cache policy state.
   */
  public initializeConfiguration(
    request: InitializeCdnCachePolicyRequest = {},
  ): InitializedCdnCachePolicyConfiguration {
    const architecture = cdnArchitectureService.initializeArchitecture(request);

    return {
      cachePolicies: architecture.cachePolicies,
      warmAfterDaysWithoutAccess: WARM_AFTER_DAYS_WITHOUT_ACCESS,
    };
  }

  /**
   * Resolves the correct cache tier for an asset from lifecycle metadata.
   * @param {ResolveCdnCachePolicyRequest} request Asset access metadata.
   * @param {InitializeCdnCachePolicyRequest} config Optional config overrides.
   * @return {ResolvedCdnCachePolicy} Applied cache policy and selection reason.
   */
  public resolveCachePolicy(
    request: ResolveCdnCachePolicyRequest,
    config: InitializeCdnCachePolicyRequest = {},
  ): ResolvedCdnCachePolicy {
    const configuration = this.initializeConfiguration(config);

    if (request.archivedAcademicYear) {
      return {
        ...configuration.cachePolicies.cold,
        reason: "archivedAcademicYear",
      };
    }

    const now = parseOptionalDate(request.now, "now") ?? new Date();
    const lastAccessedAt = parseOptionalDate(
      request.lastAccessedAt,
      "lastAccessedAt",
    );

    if (
      lastAccessedAt &&
      lastAccessedAt.getTime() > now.getTime()
    ) {
      throw new CdnCachePolicyValidationError(
        "CDN cache policy field \"lastAccessedAt\" cannot be in the future " +
        "relative to \"now\".",
      );
    }

    if (
      lastAccessedAt &&
      now.getTime() - lastAccessedAt.getTime() >=
        configuration.warmAfterDaysWithoutAccess * MILLISECONDS_PER_DAY
    ) {
      return {
        ...configuration.cachePolicies.warm,
        reason: "inactiveMoreThan30Days",
      };
    }

    return {
      ...configuration.cachePolicies.hot,
      reason: "activeAcademicYear",
    };
  }

  /**
   * Resolves the Cache-Control header value for a CDN asset response.
   * @param {ResolveCdnCachePolicyRequest} request Asset access metadata.
   * @param {InitializeCdnCachePolicyRequest} config Optional config overrides.
   * @return {string} Architecture-aligned Cache-Control header.
   */
  public resolveCacheControlHeader(
    request: ResolveCdnCachePolicyRequest,
    config: InitializeCdnCachePolicyRequest = {},
  ): string {
    return this.resolveCachePolicy(request, config).cacheControl;
  }
}

export const cdnCachePolicyService = new CdnCachePolicyService();
