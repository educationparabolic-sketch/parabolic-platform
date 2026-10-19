// Explicit v1 test authority, independent of production normalization.
export const proctoringRequirementsForTest = (browser = false, camera = false) => ({
  contractVersion: 1 as const, browserIntegrityGuardEnabled: browser,
  cameraReadiness: camera ? "required" as const : "off" as const,
});
export const proctoringPolicyForTest = (browser = false, camera = false) => ({
  ...proctoringRequirementsForTest(browser, camera),
  capabilities: {automatedFaceMatching: "unavailable" as const,
    automatedGazeTracking: "unavailable" as const,
    cameraReadiness: "browser_permission_only" as const,
    browserIntegrity: "browser_controls_only" as const},
  identityPhotoReview: "not_required" as const,
  integrityReporting: browser || camera ? "client_observations" as const : "off" as const,
});
export const proctoringPreflightForTest = () => ({contractVersion: 1 as const,
  preflight: {camera: "not_requested" as const}});
