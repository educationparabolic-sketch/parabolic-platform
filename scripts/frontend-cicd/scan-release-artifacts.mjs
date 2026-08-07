import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

export const DEFAULT_ARTIFACT_ROOTS = [
  "apps/admin/dist",
  "apps/student/dist",
  "apps/exam/dist",
  "apps/vendor/dist",
];

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
]);

const POLICIES = [
  {
    id: "loopback-localhost",
    pattern: /(?:https?:)?\/\/localhost(?::\d+|\/)/giu,
  },
  {
    id: "loopback-localhost-root",
    test(source) {
      const portlessHttpOrigins = source.match(/["']http:\/\/localhost["']/gu) ?? [];
      const otherPortlessOrigins = source.match(/["'](?:https:)?\/\/localhost["']/gu) ?? [];
      if (portlessHttpOrigins.length === 0 && otherPortlessOrigins.length === 0) {
        return false;
      }

      // Firebase Auth currently embeds exactly two inert popup/redirect fallback origins.
      // Any additional portless origin, or the same literal outside that reviewed SDK,
      // is treated as release configuration leakage.
      return !(
        portlessHttpOrigins.length === 2 &&
        otherPortlessOrigins.length === 0 &&
        source.includes("/v1/accounts:signInWithIdp") &&
        source.includes("pendingToken")
      );
    },
  },
  {
    id: "loopback-127.0.0.1",
    pattern: /(?:https?:)?\/\/127\.0\.0\.1(?::\d+)?(?:[/?#]|\b)/gu,
  },
  {
    id: "dev-mock-token",
    pattern:
      /(?:mock|dev|test|fixture)[_-]?(?:auth[_-]?)?token\s*[:=]\s*["'][^"'\r\n]+["']|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.(?:signature|[A-Za-z0-9_-]{8,})/giu,
  },
  {
    id: "fixture-mode",
    pattern:
      /(?:fixture[_-]?mode|use[_-]?fixtures?)\s*["']?\s*[:=]\s*["']?true\b|["']mode["']\s*:\s*["']fixture["']/giu,
  },
  {
    id: "prefilled-password-object",
    pattern: /(?:["']password["']|\bpassword)\s*:\s*["'][^"'\r\n]+["']/giu,
  },
  {
    id: "prefilled-password-assignment",
    pattern: /\bpassword\s*=\s*["'][^"'\r\n]+["']/giu,
  },
  {
    id: "prefilled-password-input",
    pattern:
      /<input\b(?=[^>]*\btype\s*=\s*["']password["'])(?=[^>]*\bvalue\s*=\s*["'][^"']+["'])[^>]*>/giu,
  },
  {
    id: "prefilled-password-query",
    pattern: /[?&]password=[^&\s"'<>]+/giu,
  },
];

export class ReleaseArtifactScanError extends Error {
  constructor(errors) {
    super(["Release artifact scan failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
    this.name = "ReleaseArtifactScanError";
    this.errors = errors;
  }
}

async function collectTextFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new ReleaseArtifactScanError([
        `${relative(workspaceRoot, entryPath)} is a symbolic link`,
      ]);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectTextFiles(entryPath)));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }

  return files;
}

export async function scanReleaseArtifacts({
  artifactRoots = DEFAULT_ARTIFACT_ROOTS,
  rootDirectory = workspaceRoot,
} = {}) {
  const errors = [];
  let filesScanned = 0;

  for (const artifactRoot of artifactRoots) {
    const absoluteRoot = resolve(rootDirectory, artifactRoot);
    let rootStat;
    try {
      rootStat = await stat(absoluteRoot);
    } catch {
      errors.push(`${artifactRoot} is missing`);
      continue;
    }

    if (!rootStat.isDirectory()) {
      errors.push(`${artifactRoot} is not a directory`);
      continue;
    }

    const files = await collectTextFiles(absoluteRoot);
    if (files.length === 0) {
      errors.push(`${artifactRoot} contains no scannable release files`);
      continue;
    }

    for (const file of files) {
      filesScanned += 1;
      const source = await readFile(file, "utf8");
      for (const policy of POLICIES) {
        if (policy.pattern) {
          policy.pattern.lastIndex = 0;
        }
        if (policy.test?.(source) ?? policy.pattern.test(source)) {
          errors.push(`${relative(rootDirectory, file)} violates ${policy.id}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ReleaseArtifactScanError(errors);
  }

  return { filesScanned, rootsScanned: artifactRoots.length };
}

export function parseArtifactScanArguments(args) {
  if (args[0] !== "--scan") {
    throw new Error("scan mode is required");
  }

  const artifactRoots = [];
  for (let index = 1; index < args.length; index += 2) {
    if (args[index] !== "--root" || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("artifact roots must use --root <path>");
    }
    artifactRoots.push(args[index + 1]);
  }

  return artifactRoots.length > 0 ? artifactRoots : DEFAULT_ARTIFACT_ROOTS;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const artifactRoots = parseArtifactScanArguments(process.argv.slice(2));
    try {
      const result = await scanReleaseArtifacts({ artifactRoots });
      console.log(
        `Release artifact scan passed (${result.filesScanned} files across ${result.rootsScanned} roots).`,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Release artifact scan failed.");
      process.exitCode = 1;
    }
  } catch {
    console.error(
      "Usage: node scripts/frontend-cicd/scan-release-artifacts.mjs --scan [--root <path> ...]",
    );
    process.exitCode = 2;
  }
}
