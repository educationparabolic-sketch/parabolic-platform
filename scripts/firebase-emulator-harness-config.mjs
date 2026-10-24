export const firebaseEmulatorHarness = Object.freeze({
  firebaseCliVersion: "15.9.0",
  projectId: "demo-parabolic-test",
  services: Object.freeze([
    "auth",
    "firestore",
    "functions",
    "hosting:portal",
    "storage",
  ]),
  ports: Object.freeze({
    auth: 9099,
    firestore: 8080,
    functions: 5001,
    hosting: 5000,
    storage: 9199,
  }),
});

// Exhaustive normal-worker lifecycles prevent accumulated HTTP workers exhausting local RAM.
export const firebaseIntegrationGroups = Object.freeze({
  foundation: Object.freeze([
    "accessPolicyNegative.emulator.test.js",
    "adminTeacherRoleAlignment.emulator.test.js",
    "apiGateway.emulator.test.js",
    "claimPropagation.emulator.test.js",
    "customClaimSynchronization.emulator.test.js",
    "examStart.emulator.test.js",
    "identitySessionSecurity.emulator.test.js",
    "licenseClaimFreshness.emulator.test.js",
  ]),
  student: Object.freeze([
    "studentProfileApi.emulator.test.js",
    "studentSolutions.emulator.test.js",
    "studentSummary.emulator.test.js",
    "suspensionGuard.emulator.test.js",
    "targetOwnership.emulator.test.js",
  ]),
  vendor: Object.freeze([
    "vendorAuditHealthApi.emulator.test.js",
    "vendorCalibrationApi.emulator.test.js",
    "vendorCalibrationOperations.emulator.test.js",
    "vendorCapabilityAlignment.emulator.test.js",
    "vendorCommercialApi.emulator.test.js",
    "vendorInstitutesApi.emulator.test.js",
    "vendorIntelligenceApi.emulator.test.js",
  ]),
});
