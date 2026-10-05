import {
  InitializeVendorIntelligenceResult,
  VendorIntelligenceQuery,
} from "../types/vendorIntelligence";
import {createLogger} from "./logging";
import {
  VendorIntelligenceReadModel,
  vendorIntelligenceReadModel,
} from "./vendorIntelligenceReadModel";

/** Strict readiness reader for the Vendor intelligence platform. */
export class VendorIntelligenceService {
  private readonly logger = createLogger("VendorIntelligenceService");

  constructor(
    private readonly readModel: VendorIntelligenceReadModel =
    vendorIntelligenceReadModel,
  ) {}

  /**
   * Reads bounded readiness from complete canonical portfolio snapshots.
   * @param {VendorIntelligenceQuery} query Strict month/window filter.
   * @return {Promise<InitializeVendorIntelligenceResult>} Readiness result.
   */
  public async initializePlatform(
    query: VendorIntelligenceQuery = {},
  ): Promise<InitializeVendorIntelligenceResult> {
    const result = await this.readModel.readReadiness(query);
    this.logger.info("Vendor intelligence readiness read.", {
      availability: result.metadata.availability,
      dataAsOfMonth: result.metadata.dataAsOfMonth,
      windowMonths: result.metadata.windowMonths,
    });
    return result;
  }
}

export const vendorIntelligenceService = new VendorIntelligenceService();
