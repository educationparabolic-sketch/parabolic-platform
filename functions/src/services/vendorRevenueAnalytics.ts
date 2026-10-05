import {StandardApiErrorCode} from "../types/apiResponse";
import {
  ComputeVendorRevenueAnalyticsResult,
  VendorRevenueAnalyticsQuery,
} from "../types/vendorRevenueAnalytics";
import {createLogger} from "./logging";
import {
  VendorIntelligenceReadError,
  VendorIntelligenceReadModel,
  vendorIntelligenceReadModel,
} from "./vendorIntelligenceReadModel";

/** Raised when strict Vendor revenue authority or filters are invalid. */
export class VendorRevenueAnalyticsError extends Error {
  public readonly code: StandardApiErrorCode;

  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "VendorRevenueAnalyticsError";
    this.code = code;
  }
}

/** Bounded complete-snapshot revenue analytics reader. */
export class VendorRevenueAnalyticsService {
  private readonly logger = createLogger("VendorRevenueAnalyticsService");

  constructor(
    private readonly readModel: VendorIntelligenceReadModel =
    vendorIntelligenceReadModel,
  ) {}

  /**
   * Reads exact minor-unit revenue analytics from complete snapshots only.
   * @param {VendorRevenueAnalyticsQuery} query Strict month/window filter.
   * @return {Promise<ComputeVendorRevenueAnalyticsResult>} Revenue result.
   */
  public async computeRevenueAnalytics(
    query: VendorRevenueAnalyticsQuery = {},
  ): Promise<ComputeVendorRevenueAnalyticsResult> {
    try {
      const result = await this.readModel.readRevenue(query);
      this.logger.info("Vendor revenue analytics read.", {
        availability: result.metadata.availability,
        dataAsOfMonth: result.metadata.dataAsOfMonth,
        instituteDetailCount: result.instituteRevenue.length,
        observedMonthCount: result.monthlySnapshots.length,
      });
      return result;
    } catch (error) {
      if (error instanceof VendorIntelligenceReadError) {
        throw new VendorRevenueAnalyticsError(error.code, error.message);
      }
      throw error;
    }
  }
}

export const vendorRevenueAnalyticsService =
  new VendorRevenueAnalyticsService();
