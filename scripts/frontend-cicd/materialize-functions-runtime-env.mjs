import { access, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBuildEnvironment } from "./validate-build-environment.mjs";
import {
  NON_PRODUCTION_FIREBASE_MAPPING,
  validateDeployTarget,
} from "./validate-deploy-target.mjs";

export const FUNCTIONS_RUNTIME_KEYS = Object.freeze([
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
]);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, "..", "..");
const functionsDirectory = join(repositoryRoot, "functions");
const baseEnvironmentPath = join(functionsDirectory, ".env");
const stagingEnvironmentPath = join(
  functionsDirectory,
  `.env.${NON_PRODUCTION_FIREBASE_MAPPING.projectId}`,
);

export class FunctionsRuntimeEnvironmentError extends Error {
  constructor(message) {
    super(message);
    this.name = "FunctionsRuntimeEnvironmentError";
  }
}

function normalizeValue(input, key) {
  const value = typeof input[key] === "string" ? input[key].trim() : "";
  if (!value) {
    throw new FunctionsRuntimeEnvironmentError(`${key} is required`);
  }
  if (/[\0\r\n]/u.test(value)) {
    throw new FunctionsRuntimeEnvironmentError(`${key} contains an invalid control character`);
  }
  return value;
}

export function renderFunctionsRuntimeEnvironment(input = process.env) {
  const build = validateBuildEnvironment(input);
  const deploy = validateDeployTarget(input);

  if (
    build.environment !== "staging" ||
    deploy.branch !== "staging" ||
    deploy.environment !== "staging" ||
    build.projectId !== NON_PRODUCTION_FIREBASE_MAPPING.projectId
  ) {
    throw new FunctionsRuntimeEnvironmentError(
      "Functions runtime environment may be materialized only for the recorded staging target",
    );
  }

  return `${FUNCTIONS_RUNTIME_KEYS.map((key) => `${key}=${normalizeValue(input, key)}`).join(
    "\n",
  )}\n`;
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function writeFunctionsRuntimeEnvironment(input = process.env) {
  if (await pathExists(baseEnvironmentPath)) {
    throw new FunctionsRuntimeEnvironmentError(
      "functions/.env must be absent so staging cannot merge unreviewed local configuration",
    );
  }
  if (await pathExists(stagingEnvironmentPath)) {
    throw new FunctionsRuntimeEnvironmentError(
      "The generated staging Functions environment already exists",
    );
  }

  const contents = renderFunctionsRuntimeEnvironment(input);
  await writeFile(stagingEnvironmentPath, contents, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return stagingEnvironmentPath;
}

export async function removeFunctionsRuntimeEnvironment() {
  try {
    await unlink(stagingEnvironmentPath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (process.argv.length !== 3 || (action !== "--write" && action !== "--remove")) {
    console.error(
      "Usage: node scripts/frontend-cicd/materialize-functions-runtime-env.mjs --write|--remove",
    );
    process.exitCode = 2;
  } else {
    try {
      if (action === "--write") {
        await writeFunctionsRuntimeEnvironment();
        console.log("Generated the staging Functions runtime environment.");
      } else {
        await removeFunctionsRuntimeEnvironment();
        console.log("Removed the generated staging Functions runtime environment.");
      }
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "Functions environment operation failed.",
      );
      process.exitCode = 1;
    }
  }
}
