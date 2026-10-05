import {StandardApiErrorCode} from "../types/apiResponse";
import {
  ComputeVendorChurnTrackingResult,
  VendorChurnTrackingQuery,
} from "../types/vendorChurnTracking";
import {createLogger} from "./logging";
import {
  VendorIntelligenceReadError,
  VendorIntelligenceReadModel,
  vendorIntelligenceReadModel,
} from "./vendorIntelligenceReadModel";

/** Raised when strict Vendor churn authority or filters are invalid. */
export class VendorChurnTrackingError extends Error {
  public readonly code: StandardApiErrorCode;

  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "VendorChurnTrackingError";
    this.code = code;
  }
}

/** Bounded complete-snapshot churn and inactivity reader. */
export class VendorChurnTrackingService {
  private readonly logger = createLogger("VendorChurnTrackingService");

  constructor(
    private readonly readModel: VendorIntelligenceReadModel =
    vendorIntelligenceReadModel,
  ) {}

  /**
   * Reads exact supported churn projections and truthful unavailable fields.
   * @param {VendorChurnTrackingQuery} query Strict month/window filter.
   * @return {Promise<ComputeVendorChurnTrackingResult>} Churn result.
   */
  public async computeChurnTracking(
    query: VendorChurnTrackingQuery = {},
  ): Promise<ComputeVendorChurnTrackingResult> {
    try {
      const result = await this.readModel.readChurn(query);
      this.logger.info("Vendor churn analytics read.", {
        availability: result.metadata.availability,
        dataAsOfMonth: result.metadata.dataAsOfMonth,
        inactiveInstituteCount: result.inactiveInstituteCount,
      });
      return result;
    } catch (error) {
      if (error instanceof VendorIntelligenceReadError) {
        throw new VendorChurnTrackingError(error.code, error.message);
      }
      throw error;
    }
  }
}

export const vendorChurnTrackingService = new VendorChurnTrackingService();
