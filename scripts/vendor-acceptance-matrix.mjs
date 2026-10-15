// One ordered matrix; separate browser processes prevent deleted Admin SDK apps
// and mutable demo fixture caches leaking into the next domain proof.
export const apiSuites = [
  "functions/tests/vendorCapabilityAlignment.emulator.test.js",
  "functions/tests/vendorInstitutesApi.emulator.test.js",
  "functions/tests/vendorCommercialApi.emulator.test.js",
  "functions/tests/vendorAuditHealthApi.emulator.test.js",
  "functions/tests/apiGateway.emulator.test.js",
];
export const browserStages = [
  {id: "audit-health-overview", script: "test:e2e:vendor-audit-health-smoke", file: "tests/e2e/vendor-audit-health-smoke.spec.mjs", proves: ["read-states", "current-identity", "fresh-session", "source-unavailable"]},
  {id: "shells-current-targets", script: "test:e2e:vendor-acceptance-shells", file: "tests/e2e/vendor-acceptance-shells.spec.mjs", proves: ["navigation", "shells", "current-identity", "target-denial", "fresh-session"]},
  {id: "route-capability", script: "test:e2e:vendor-capability-alignment", file: "tests/e2e/vendor-capability-alignment.spec.mjs", proves: ["all-routes", "wrong-role", "profile-persistence"]},
  {id: "uncertain-recovery", script: "test:e2e:vendor-truthfulness", file: "tests/e2e/vendor-truthfulness-repair.spec.mjs", proves: ["post-commit-uncertainty", "failed-reload", "exact-replay", "hostile-storage"]},
  {id: "institutes-onboarding-administrators", script: "test:e2e:vendor-institutes", file: "tests/e2e/vendor-institutes.spec.mjs", proves: ["onboarding", "administrator", "institute-persistence", "validation", "conflict", "transport", "reload"]},
  {id: "commercial-financial", script: "test:e2e:vendor-commercial", file: "tests/e2e/vendor-commercial.spec.mjs", proves: ["financial-persistence", "provider-failure", "two-actor", "fresh-session", "exact-replay"]},
  {id: "calibration-authority", script: "test:e2e:vendor-calibration-acceptance", file: "tests/e2e/vendor-calibration-acceptance.spec.mjs", proves: ["calibration-simulation", "disabled-unsupported", "hostile-storage", "target-denial"]},
  {id: "calibration-persistence", script: "test:e2e:vendor-calibration-rollout", file: "tests/e2e/vendor-calibration-rollout-acceptance.spec.mjs", proves: ["calibration-persistence", "rollback", "post-commit-uncertainty", "exact-replay", "reload", "conflict"]},
  {id: "intelligence", script: "test:e2e:vendor-intelligence-acceptance", file: "tests/e2e/vendor-intelligence-acceptance.spec.mjs", proves: ["read-states", "fresh-session", "raw-data-isolation", "hostile-storage"]},
];
