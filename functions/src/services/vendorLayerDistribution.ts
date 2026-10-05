import {StandardApiErrorCode} from "../types/apiResponse";
import {
  ComputeVendorLayerDistributionResult,
  VendorLayerDistributionQuery,
} from "../types/vendorLayerDistribution";
import {createLogger} from "./logging";
import {
  VendorIntelligenceReadError,
  VendorIntelligenceReadModel,
  vendorIntelligenceReadModel,
} from "./vendorIntelligenceReadModel";

/** Raised when strict Vendor layer authority or filters are invalid. */
export class VendorLayerDistributionError extends Error {
  public readonly code: StandardApiErrorCode;

  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "VendorLayerDistributionError";
    this.code = code;
  }
}

/** Bounded complete-snapshot layer distribution reader. */
export class VendorLayerDistributionService {
  private readonly logger = createLogger("VendorLayerDistributionService");

  constructor(
    private readonly readModel: VendorIntelligenceReadModel =
    vendorIntelligenceReadModel,
  ) {}

  /**
   * Reads exact current layer counts without raw history scans.
   * @param {VendorLayerDistributionQuery} query Strict month/window filter.
   * @return {Promise<ComputeVendorLayerDistributionResult>} Layer result.
   */
  public async computeLayerDistribution(
    query: VendorLayerDistributionQuery = {},
  ): Promise<ComputeVendorLayerDistributionResult> {
    try {
      const result = await this.readModel.readLayerDistribution(query);
      this.logger.info("Vendor layer distribution read.", {
        availability: result.metadata.availability,
        dataAsOfMonth: result.metadata.dataAsOfMonth,
        totalInstitutes: result.totalInstitutes,
      });
      return result;
    } catch (error) {
      if (error instanceof VendorIntelligenceReadError) {
        throw new VendorLayerDistributionError(error.code, error.message);
      }
      throw error;
    }
  }
}

export const vendorLayerDistributionService =
  new VendorLayerDistributionService();
