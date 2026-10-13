/** Server-authored immutable source captured at assignment creation. */
export interface FrozenCalibrationSource {
  schemaVersion: 1;
  model: "risk_projection_v1";
  instituteId: string;
  sourcePath: string;
  fingerprint: string;
  versionId: string;
  weights: import("./vendorCalibration.js").VendorCalibrationWeights;
  thresholds: import("./vendorCalibration.js").VendorCalibrationThresholds;
  createdBy: string;
  createdAt: string;
  activationDate: string | null;
  isActive: true;
}
