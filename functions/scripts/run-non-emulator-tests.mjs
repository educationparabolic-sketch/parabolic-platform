import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {backendEnvironment, executeBackendSuite} from "../../scripts/backend-test-process.mjs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const functionsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const selectedSourceSuites = [
  "adminAssignmentOperationsApi.test",
  "adminGovernanceInterventionsApi.test",
  "adminInterventionsApi.test",
  "adminAnalyticsApi.test",
  "adminLicensingApi.test",
  "adminQuestionAssetsApi.test",
  "adminQuestionDistributionApi.test",
  "adminQuestionDistributionService.test",
  "adminQuestionLibraryApi.test",
  "adminQuestionLibraryService.test",
  "adminQuestionMutationsApi.test",
  "adminQuestionPackagesApi.test",
  "adminQuestionTagsApi.test",
  "adminQuestionUploadLogsApi.test",
  "adminOverviewApi.test",
  "adminQuestionsBulkApi.test",
  "adminRunsApi.test",
  "adminSettingsApi.test",
  "adminSupportApi.test",
  "adminStudentMutationsApi.test",
  "adminStudentsApi.test",
  "adminStudentsBulkApi.test",
  "adminTestsApi.test",
  "apiErrorHandling.test",
  "authMiddleware.test",
  "capabilityMiddleware.test",
  "claimPropagation.test",
  "cdnArchitecture.test",
  "cdnCachePolicy.test",
  "cdnMonitoring.test",
  "cursorPagination.test",
  "currentVendor.test",
  "customClaimSynchronization.test",
  "examRuntimeOwnership.test",
  "examProctoringPolicy.test",
  "examIntegrityApi.test",
  "examSessionActivateApi.test",
  "examSessionEntryApi.test",
  "examStartApi.test",
  "emailDeliveryProvider.test",
  "endpointTestingFramework.test",
  "firestoreIndexes.test",
  "firestoreQueryGovernance.test",
  "governanceAccessMiddleware.test",
  "governanceReportPdf.test",
  "identitySessionSecurity.test",
  "indexedQueryValidation.test",
  "licenseClaimFreshness.test",
  "licenseMiddleware.test",
  "middlewareFramework.test",
  "questionAssetUpload.test",
  "roleMiddleware.test",
  "searchArchitecture.test",
  "searchTokenIndex.test",
  "sessionWriteBatchingPolicy.test",
  "signedUrl.test",
  "storageBucketArchitecture.test",
  "studentSummaryApi.test",
  "studentIdentityPhotoImage.test",
  "submissionResponseContract.test",
  "systemEventTopology.test",
  "tenantMiddleware.test",
  "vendorSupportApi.test",
  "vendorInstitutesApi.test",
  "vendorCommercialApi.test",
  "vendorIntelligenceApi.test",
];

const baselineExclusions = new Map();

export const selectedExternalSuites = [
  "apiGateway.test.js",
  "apiRouteManifest.test.js",
  "vendorAuditHealth.test.js",
];

const emulatorMarkers = [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "firebase emulators",
];

function fail(message) {
  console.error(`Non-emulator test classification failed: ${message}`);
  process.exit(1);
}

export async function runNonEmulatorTests() {
  const sourceDirectory = resolve(functionsRoot, "src/tests");
  const sourceFiles = (await readdir(sourceDirectory, {recursive: true}))
    .filter((file) => file.endsWith(".test.ts"))
    .sort();
  const discoveredNonEmulatorSuites = [];

  for (const file of sourceFiles) {
    const source = await readFile(resolve(sourceDirectory, file), "utf8");
    if (!emulatorMarkers.some((marker) => source.includes(marker))) {
      discoveredNonEmulatorSuites.push(file.slice(0, -3));
    }
  }

  const classifiedSourceSuites = [
    ...selectedSourceSuites,
    ...baselineExclusions.keys(),
  ].sort();

  if (new Set(classifiedSourceSuites).size !== classifiedSourceSuites.length) {
    fail("selected and excluded source suite lists must not overlap or contain duplicates");
  }

  if (JSON.stringify(classifiedSourceSuites) !== JSON.stringify(discoveredNonEmulatorSuites)) {
    const classified = new Set(classifiedSourceSuites);
    const discovered = new Set(discoveredNonEmulatorSuites);
    const unclassified = discoveredNonEmulatorSuites.filter((suite) => !classified.has(suite));
    const missing = classifiedSourceSuites.filter((suite) => !discovered.has(suite));
    fail(
      `source suite inventory changed (unclassified: ${unclassified.join(", ") || "none"}; ` +
        `missing: ${missing.join(", ") || "none"})`,
    );
  }

  const externalDirectory = resolve(functionsRoot, "tests");
  const discoveredExternalSuites = (await readdir(externalDirectory, {recursive: true}))
    .filter((file) => file.endsWith(".test.js") && !file.endsWith(".emulator.test.js"))
    .sort();

  if (JSON.stringify([...selectedExternalSuites].sort()) !== JSON.stringify(discoveredExternalSuites)) {
    fail(`external suite inventory changed (${discoveredExternalSuites.join(", ")})`);
  }

  for (const [suite, reason] of baselineExclusions) {
    console.error(`Known baseline exclusion: ${suite} — ${reason}`);
  }

  const testFiles = [
    ...selectedExternalSuites.map((file) => resolve(externalDirectory, file)),
    ...selectedSourceSuites.map((suite) => resolve(functionsRoot, "lib/tests", `${suite}.js`)),
  ];

  const output = process.env.BACKEND_TEST_STAGE_DIRECTORY ?? resolve(functionsRoot, "../test-results/backend-unit/run");
  await mkdir(output, {recursive: true});
  assert.equal(baselineExclusions.size, 0, "Baseline exclusions are forbidden");
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt);
  const receipts = [];
  try {
    for (const file of testFiles) {
      const receipt = await executeBackendSuite(functionsRoot, file, backendEnvironment(), {signal: controller.signal});
      receipts.push({file, ...receipt});
      await writeFile(resolve(output, "suites.json"), JSON.stringify(receipts, null, 2));
      console.log(`[backend-unit] PASS ${file} (${receipt.passed} test events).`);
    }
    console.log(`[backend-unit] PASS ${receipts.length} files; ${receipts.reduce((sum, r) => sum + r.passed, 0)} passing events; zero skips/TODOs.`);
  } finally {
    process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, "The complete unit selection cannot omit suites");
  runNonEmulatorTests().catch(error => {console.error(error); process.exitCode = 1;});
}
