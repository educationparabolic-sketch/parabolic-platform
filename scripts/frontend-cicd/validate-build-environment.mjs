const ENVIRONMENTS = new Set(["development", "test", "staging", "production"]);

const REQUIRED_KEYS = [
  "PARABOLIC_BUILD_ENVIRONMENT",
  "FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_CDN_BASE_URL",
  "VITE_PORTAL_BASE_URL",
  "VITE_EXAM_BASE_URL",
  "VITE_VENDOR_BASE_URL",
  "VITE_DATA_MODE",
  "VITE_EXAM_DEV_MOCK_ENTRY",
  "VITE_RELEASE_ID",
  "VITE_RELEASE_COMMIT_SHA",
  "VITE_RELEASE_BUILT_AT",
  "PROJECT_ID",
  "NODE_ENV",
  "APP_BASE_URL",
  "EXAM_BASE_URL",
  "VENDOR_BASE_URL",
  "CDN_BASE_URL",
  "QUESTION_ASSETS_BUCKET",
  "REPORTS_BUCKET",
  "RELEASE_ID",
  "RELEASE_COMMIT_SHA",
  "RELEASE_BUILT_AT",
];

const ORIGIN_KEYS = [
  "VITE_CDN_BASE_URL",
  "VITE_PORTAL_BASE_URL",
  "VITE_EXAM_BASE_URL",
  "VITE_VENDOR_BASE_URL",
  "APP_BASE_URL",
  "EXAM_BASE_URL",
  "VENDOR_BASE_URL",
  "CDN_BASE_URL",
];

const PATH_CAPABLE_BASE_URL_KEYS = new Set(["VITE_CDN_BASE_URL", "CDN_BASE_URL"]);

const ENVIRONMENT_BOUNDARY_KEYS = [
  "FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_CDN_BASE_URL",
  "VITE_PORTAL_BASE_URL",
  "VITE_EXAM_BASE_URL",
  "VITE_VENDOR_BASE_URL",
  "PROJECT_ID",
  "APP_BASE_URL",
  "EXAM_BASE_URL",
  "VENDOR_BASE_URL",
  "CDN_BASE_URL",
  "QUESTION_ASSETS_BUCKET",
  "REPORTS_BUCKET",
];

const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const FIREBASE_APP_ID_PATTERN = /^\d+:\d+:web:[A-Za-z0-9_-]+$/u;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/u;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;
const COMMIT_SHA_PATTERN = /^[a-fA-F0-9]{40}$/u;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export class BuildEnvironmentValidationError extends Error {
  constructor(errors) {
    super(
      ["Build environment validation failed:", ...errors.map((error) => `- ${error}`)].join("\n"),
    );
    this.name = "BuildEnvironmentValidationError";
    this.errors = errors;
  }
}

function normalizeEnvironment(input) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : "",
    ]),
  );
}

function validateOrigin(key, value, environment, errors) {
  if (!value) {
    return;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    errors.push(`${key} must be an absolute URL`);
    return;
  }

  const loopbackAllowed = environment === "development" || environment === "test";
  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (
    parsed.protocol !== "https:" &&
    !(loopbackAllowed && isLoopback && parsed.protocol === "http:")
  ) {
    errors.push(`${key} must use HTTPS outside an allowed local/test loopback`);
  }

  const hasPath = parsed.pathname !== "/" && parsed.pathname !== "";
  if (
    parsed.username ||
    parsed.password ||
    (hasPath && !PATH_CAPABLE_BASE_URL_KEYS.has(key)) ||
    parsed.search ||
    parsed.hash
  ) {
    errors.push(
      PATH_CAPABLE_BASE_URL_KEYS.has(key)
        ? `${key} must contain only an HTTPS base URL without credentials, query, or fragment`
        : `${key} must contain an origin only`,
    );
  }
}

function validateEquality(leftKey, rightKey, environment, errors) {
  if (
    environment[leftKey] &&
    environment[rightKey] &&
    environment[leftKey] !== environment[rightKey]
  ) {
    errors.push(`${leftKey} must equal ${rightKey}`);
  }
}

function validateEnvironmentBoundary(environmentName, environment, errors) {
  const projectId = environment.PROJECT_ID;

  if (environmentName === "test" && projectId && !projectId.startsWith("demo-")) {
    errors.push("PROJECT_ID must use a demo-* project in test");
  }

  if (environmentName === "staging" && projectId && projectId !== "parabolic-dev") {
    errors.push("PROJECT_ID must be parabolic-dev in staging");
  }

  if (
    environmentName === "production" &&
    projectId &&
    (projectId.startsWith("demo-") || projectId === "parabolic-dev")
  ) {
    errors.push("PROJECT_ID must not use a test or staging project in production");
  }

  const forbiddenPattern =
    environmentName === "production" ? /(?:demo-|parabolic-dev)/iu : /parabolic-prod/iu;

  for (const key of ENVIRONMENT_BOUNDARY_KEYS) {
    if (environment[key] && forbiddenPattern.test(environment[key])) {
      errors.push(`${key} belongs to a different environment`);
    }
  }

  if (
    projectId &&
    environment.VITE_FIREBASE_AUTH_DOMAIN &&
    !environment.VITE_FIREBASE_AUTH_DOMAIN.includes(projectId)
  ) {
    errors.push("VITE_FIREBASE_AUTH_DOMAIN must belong to PROJECT_ID");
  }

  if (
    projectId &&
    environment.VITE_FIREBASE_STORAGE_BUCKET &&
    !environment.VITE_FIREBASE_STORAGE_BUCKET.includes(projectId)
  ) {
    errors.push("VITE_FIREBASE_STORAGE_BUCKET must belong to PROJECT_ID");
  }
}

export function validateBuildEnvironment(input = process.env) {
  const environment = normalizeEnvironment(input);
  const errors = [];

  for (const key of REQUIRED_KEYS) {
    if (!environment[key]) {
      errors.push(`${key} is required`);
    }
  }

  const environmentName = environment.PARABOLIC_BUILD_ENVIRONMENT;
  if (environmentName && !ENVIRONMENTS.has(environmentName)) {
    errors.push("PARABOLIC_BUILD_ENVIRONMENT is invalid");
  }

  if (environment.NODE_ENV && environmentName && environment.NODE_ENV !== environmentName) {
    errors.push("NODE_ENV must equal PARABOLIC_BUILD_ENVIRONMENT");
  }

  if (environment.PROJECT_ID && !PROJECT_ID_PATTERN.test(environment.PROJECT_ID)) {
    errors.push("PROJECT_ID has an invalid Firebase project ID format");
  }

  if (
    environment.VITE_FIREBASE_APP_ID &&
    !FIREBASE_APP_ID_PATTERN.test(environment.VITE_FIREBASE_APP_ID)
  ) {
    errors.push("VITE_FIREBASE_APP_ID has an invalid Firebase web-app ID format");
  }

  if (
    environment.VITE_FIREBASE_AUTH_DOMAIN &&
    !/^[A-Za-z0-9.-]+$/u.test(environment.VITE_FIREBASE_AUTH_DOMAIN)
  ) {
    errors.push("VITE_FIREBASE_AUTH_DOMAIN must be a hostname");
  }

  for (const key of ["VITE_FIREBASE_STORAGE_BUCKET", "QUESTION_ASSETS_BUCKET", "REPORTS_BUCKET"]) {
    if (environment[key] && !BUCKET_PATTERN.test(environment[key])) {
      errors.push(`${key} must be a bare bucket name`);
    }
  }

  if (
    environmentName &&
    environmentName !== "test" &&
    environment.VITE_FIREBASE_API_KEY &&
    !/^AIza[A-Za-z0-9_-]{20,}$/u.test(environment.VITE_FIREBASE_API_KEY)
  ) {
    errors.push("VITE_FIREBASE_API_KEY has an invalid Firebase API key format");
  }

  if (
    environment.VITE_FIREBASE_MESSAGING_SENDER_ID &&
    !/^\d+$/u.test(environment.VITE_FIREBASE_MESSAGING_SENDER_ID)
  ) {
    errors.push("VITE_FIREBASE_MESSAGING_SENDER_ID must contain digits only");
  }

  if (
    environment.VITE_FIREBASE_MEASUREMENT_ID &&
    !/^G-[A-Z0-9]+$/u.test(environment.VITE_FIREBASE_MEASUREMENT_ID)
  ) {
    errors.push("VITE_FIREBASE_MEASUREMENT_ID has an invalid measurement ID format");
  }

  for (const key of ORIGIN_KEYS) {
    validateOrigin(key, environment[key], environmentName, errors);
  }

  if (environment.VITE_API_BASE_URL) {
    if (environmentName === "staging" || environmentName === "production") {
      errors.push("VITE_API_BASE_URL must be empty for staging and production");
    } else {
      validateOrigin("VITE_API_BASE_URL", environment.VITE_API_BASE_URL, environmentName, errors);
    }
  }

  if (environment.VITE_FIREBASE_AUTH_EMULATOR_URL) {
    if (environmentName === "staging" || environmentName === "production") {
      errors.push("VITE_FIREBASE_AUTH_EMULATOR_URL is forbidden in release builds");
    } else {
      let parsed;
      try {
        parsed = new URL(environment.VITE_FIREBASE_AUTH_EMULATOR_URL);
      } catch {
        errors.push("VITE_FIREBASE_AUTH_EMULATOR_URL must be an absolute URL");
      }

      if (parsed) {
        const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        if (parsed.protocol !== "http:" || !isLoopback) {
          errors.push("VITE_FIREBASE_AUTH_EMULATOR_URL must use a loopback HTTP origin");
        }
        if (
          parsed.username ||
          parsed.password ||
          (parsed.pathname !== "/" && parsed.pathname !== "") ||
          parsed.search ||
          parsed.hash
        ) {
          errors.push("VITE_FIREBASE_AUTH_EMULATOR_URL must contain an origin only");
        }
      }
    }
  }

  if (environment.VITE_EXAM_DEV_MOCK_ENTRY !== "false") {
    errors.push("VITE_EXAM_DEV_MOCK_ENTRY must be false in CI builds");
  }

  if (environment.VITE_DATA_MODE !== "live") {
    errors.push("VITE_DATA_MODE must be live in CI builds");
  }

  if (
    (environmentName === "staging" || environmentName === "production") &&
    environment.VITE_ADMIN_SETTINGS_INSTITUTE_ID
  ) {
    errors.push("VITE_ADMIN_SETTINGS_INSTITUTE_ID is forbidden in release builds");
  }

  for (const key of ["VITE_RELEASE_ID", "RELEASE_ID"]) {
    if (environment[key] && !RELEASE_ID_PATTERN.test(environment[key])) {
      errors.push(`${key} has an invalid release ID format`);
    }
  }

  for (const key of ["VITE_RELEASE_COMMIT_SHA", "RELEASE_COMMIT_SHA"]) {
    if (environment[key] && !COMMIT_SHA_PATTERN.test(environment[key])) {
      errors.push(`${key} must be a full 40-character commit SHA`);
    }
  }

  for (const key of ["VITE_RELEASE_BUILT_AT", "RELEASE_BUILT_AT"]) {
    if (
      environment[key] &&
      (!UTC_TIMESTAMP_PATTERN.test(environment[key]) || Number.isNaN(Date.parse(environment[key])))
    ) {
      errors.push(`${key} must be a valid UTC ISO-8601 timestamp`);
    }
  }

  validateEquality("FIREBASE_PROJECT_ID", "PROJECT_ID", environment, errors);
  validateEquality("VITE_FIREBASE_PROJECT_ID", "PROJECT_ID", environment, errors);
  validateEquality("VITE_PORTAL_BASE_URL", "APP_BASE_URL", environment, errors);
  validateEquality("VITE_EXAM_BASE_URL", "EXAM_BASE_URL", environment, errors);
  validateEquality("VITE_VENDOR_BASE_URL", "VENDOR_BASE_URL", environment, errors);
  validateEquality("VITE_CDN_BASE_URL", "CDN_BASE_URL", environment, errors);
  validateEquality("VITE_RELEASE_ID", "RELEASE_ID", environment, errors);
  validateEquality("VITE_RELEASE_COMMIT_SHA", "RELEASE_COMMIT_SHA", environment, errors);
  validateEquality("VITE_RELEASE_BUILT_AT", "RELEASE_BUILT_AT", environment, errors);

  const portalOrigins = new Set(
    [
      environment.VITE_PORTAL_BASE_URL,
      environment.VITE_EXAM_BASE_URL,
      environment.VITE_VENDOR_BASE_URL,
    ].filter(Boolean),
  );
  if (portalOrigins.size !== 3) {
    errors.push("Portal, Exam, and Vendor origins must be distinct");
  }

  if (environmentName && ENVIRONMENTS.has(environmentName)) {
    validateEnvironmentBoundary(environmentName, environment, errors);
  }

  if (errors.length > 0) {
    throw new BuildEnvironmentValidationError(errors);
  }

  return {
    environment: environmentName,
    projectId: environment.PROJECT_ID,
    releaseId: environment.RELEASE_ID,
  };
}

const isDirectExecution = process.argv.includes("--validate");

if (isDirectExecution) {
  try {
    const result = validateBuildEnvironment();
    console.log(`Build environment valid for ${result.environment} (${result.releaseId}).`);
  } catch (error) {
    if (error instanceof BuildEnvironmentValidationError) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
