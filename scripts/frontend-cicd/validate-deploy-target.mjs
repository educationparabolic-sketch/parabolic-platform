import { fileURLToPath } from "node:url";

export const BRANCH_ENVIRONMENT = Object.freeze({
  dev: "development",
  staging: "staging",
  main: "production",
});

export const NON_PRODUCTION_FIREBASE_MAPPING = Object.freeze({
  projectId: "parabolic-dev",
  sites: Object.freeze({
    portal: "parabolic-dev",
    exam: "parabolic-dev-40ec9",
    vendor: "parabolic-dev-vendor",
  }),
});

const REQUIRED_KEYS = [
  "PARABOLIC_DEPLOY_BRANCH",
  "PARABOLIC_BUILD_ENVIRONMENT",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_SITE_PORTAL",
  "FIREBASE_SITE_EXAM",
  "FIREBASE_SITE_VENDOR",
];

const FIREBASE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/u;

export class DeployTargetValidationError extends Error {
  constructor(errors) {
    super(["Deploy target validation failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
    this.name = "DeployTargetValidationError";
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

function validateNonProductionMapping(environment, errors) {
  if (environment.FIREBASE_PROJECT_ID !== NON_PRODUCTION_FIREBASE_MAPPING.projectId) {
    errors.push("FIREBASE_PROJECT_ID must use the recorded non-production project");
  }

  for (const [target, expectedSite] of Object.entries(NON_PRODUCTION_FIREBASE_MAPPING.sites)) {
    const key = `FIREBASE_SITE_${target.toUpperCase()}`;
    if (environment[key] !== expectedSite) {
      errors.push(`${key} must use the recorded non-production site`);
    }
  }
}

function validateProductionMapping(environment, errors) {
  const knownNonProductionSites = new Set(Object.values(NON_PRODUCTION_FIREBASE_MAPPING.sites));
  if (
    environment.FIREBASE_PROJECT_ID.includes(NON_PRODUCTION_FIREBASE_MAPPING.projectId) ||
    environment.FIREBASE_PROJECT_ID.startsWith("demo-")
  ) {
    errors.push("FIREBASE_PROJECT_ID must not use a demo or non-production project");
  }

  for (const key of ["FIREBASE_SITE_PORTAL", "FIREBASE_SITE_EXAM", "FIREBASE_SITE_VENDOR"]) {
    if (
      knownNonProductionSites.has(environment[key]) ||
      environment[key].startsWith("demo-") ||
      /(?:^|-)(?:dev|staging)(?:-|$)/u.test(environment[key])
    ) {
      errors.push(`${key} must not use a demo or non-production site`);
    }
  }
}

export function validateDeployTarget(input = process.env) {
  const environment = normalizeEnvironment(input);
  const errors = [];

  for (const key of REQUIRED_KEYS) {
    if (!environment[key]) {
      errors.push(`${key} is required`);
    }
  }

  for (const key of [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_SITE_PORTAL",
    "FIREBASE_SITE_EXAM",
    "FIREBASE_SITE_VENDOR",
  ]) {
    if (environment[key] && !FIREBASE_IDENTIFIER_PATTERN.test(environment[key])) {
      errors.push(`${key} has an invalid Firebase identifier format`);
    }
  }

  const branch = environment.PARABOLIC_DEPLOY_BRANCH;
  const expectedEnvironment = BRANCH_ENVIRONMENT[branch];
  if (branch && !expectedEnvironment) {
    errors.push("PARABOLIC_DEPLOY_BRANCH is not deployable");
  }

  if (
    expectedEnvironment &&
    environment.PARABOLIC_BUILD_ENVIRONMENT &&
    environment.PARABOLIC_BUILD_ENVIRONMENT !== expectedEnvironment
  ) {
    errors.push("PARABOLIC_BUILD_ENVIRONMENT does not match PARABOLIC_DEPLOY_BRANCH");
  }

  const sites = [
    environment.FIREBASE_SITE_PORTAL,
    environment.FIREBASE_SITE_EXAM,
    environment.FIREBASE_SITE_VENDOR,
  ].filter(Boolean);
  if (sites.length === 3 && new Set(sites).size !== 3) {
    errors.push("Firebase Hosting sites must be distinct");
  }

  if (branch === "dev" || branch === "staging") {
    validateNonProductionMapping(environment, errors);
  } else if (branch === "main") {
    validateProductionMapping(environment, errors);
  }

  if (errors.length > 0) {
    throw new DeployTargetValidationError(errors);
  }

  return {
    branch,
    environment: expectedEnvironment,
    targets: ["portal", "exam", "vendor"],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== "--validate") {
    console.error("Usage: node scripts/frontend-cicd/validate-deploy-target.mjs --validate");
    process.exitCode = 2;
  } else {
    try {
      const result = validateDeployTarget();
      console.log(
        `Deploy target valid for ${result.branch}/${result.environment} (${result.targets.join(",")}).`,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Deploy target validation failed.");
      process.exitCode = 1;
    }
  }
}
