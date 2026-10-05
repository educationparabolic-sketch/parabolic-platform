import {StandardApiErrorCode} from "../types/apiResponse";
import {
  ComputeVendorRevenueForecastingResult,
  VendorRevenueForecastingQuery,
} from "../types/vendorRevenueForecasting";
import {createLogger} from "./logging";
import {
  VendorIntelligenceReadError,
  VendorIntelligenceReadModel,
  vendorIntelligenceReadModel,
} from "./vendorIntelligenceReadModel";

/** Raised when strict Vendor forecast authority or filters are invalid. */
export class VendorRevenueForecastingError extends Error {
  public readonly code: StandardApiErrorCode;

  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "VendorRevenueForecastingError";
    this.code = code;
  }
}

/** Bounded complete-snapshot revenue forecast reader. */
export class VendorRevenueForecastingService {
  private readonly logger = createLogger("VendorRevenueForecastingService");

  constructor(
    private readonly readModel: VendorIntelligenceReadModel =
    vendorIntelligenceReadModel,
  ) {}

  /**
   * Forecasts only from the requested complete monthly snapshot window.
   * @param {VendorRevenueForecastingQuery} query Strict month/window filter.
   * @return {Promise<ComputeVendorRevenueForecastingResult>} Forecast result.
   */
  public async computeRevenueForecast(
    query: VendorRevenueForecastingQuery = {},
  ): Promise<ComputeVendorRevenueForecastingResult> {
    try {
      const result = await this.readModel.readForecast(query);
      this.logger.info("Vendor revenue forecast read.", {
        availability: result.metadata.availability,
        dataAsOfMonth: result.metadata.dataAsOfMonth,
        observedMonthCount: result.observedMonthCount,
      });
      return result;
    } catch (error) {
      if (error instanceof VendorIntelligenceReadError) {
        throw new VendorRevenueForecastingError(error.code, error.message);
      }
      throw error;
    }
  }
}

export const vendorRevenueForecastingService =
  new VendorRevenueForecastingService();
