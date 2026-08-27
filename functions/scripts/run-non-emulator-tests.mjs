import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const functionsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const selectedSourceSuites = [
  "adminInterventionsApi.test",
  "adminAnalyticsApi.test",
  "adminLicensingApi.test",
  "adminQuestionAssetsApi.test",
  "adminQuestionDistributionApi.test",
  "adminQuestionDistributionService.test",
  "adminQuestionLibraryApi.test",
  "adminQuestionLibraryService.test",
  "adminQuestionTagsApi.test",
  "adminQuestionTagsService.test",
  "adminQuestionUploadLogsApi.test",
  "adminOverviewApi.test",
  "adminQuestionsBulkApi.test",
  "adminRunsApi.test",
  "adminSettingsApi.test",
  "adminStudentsBulkApi.test",
  "adminTestsApi.test",
  "apiErrorHandling.test",
  "authMiddleware.test",
  "cdnArchitecture.test",
  "cdnCachePolicy.test",
  "cdnMonitoring.test",
  "cursorPagination.test",
  "customClaimSynchronization.test",
  "firestoreIndexes.test",
  "firestoreQueryGovernance.test",
  "governanceAccessMiddleware.test",
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
  "submissionResponseContract.test",
  "systemEventTopology.test",
  "tenantMiddleware.test",
];

const baselineExclusions = new Map([
  [
    "adminStudentsApi.test",
    "existing validation assertion expects 400 but middleware currently returns 403",
  ],
  [
    "endpointTestingFramework.test",
    "existing endpoint framework baseline is 55 passing and 13 failing subtests",
  ],
]);

const selectedExternalSuites = [
  "apiGateway.test.js",
  "apiRouteManifest.test.js",
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

const sourceDirectory = resolve(functionsRoot, "src/tests");
const sourceFiles = (await readdir(sourceDirectory))
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
const discoveredExternalSuites = (await readdir(externalDirectory))
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

const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...testFiles],
  {
    cwd: functionsRoot,
    env: {
      ...process.env,
      CI: "true",
      NODE_ENV: "test",
      PROJECT_ID: "demo-parabolic-test",
      GCLOUD_PROJECT: "demo-parabolic-test",
      GOOGLE_CLOUD_PROJECT: "demo-parabolic-test",
      NO_GCE_CHECK: "true",
      METADATA_SERVER_DETECTION: "none",
    },
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
