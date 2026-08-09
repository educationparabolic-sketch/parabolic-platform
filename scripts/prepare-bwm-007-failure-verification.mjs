import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(repositoryRoot, "verification/bwm-007");
const portalHostingRoot = path.join(repositoryRoot, ".firebase/hosting/portal");
const outputRoot = path.join(repositoryRoot, ".firebase/bwm-007-failure-verification");
const canonicalConfig = JSON.parse(
  await fs.readFile(path.join(repositoryRoot, "firebase.json"), "utf8"),
);
const firebaseRc = JSON.parse(await fs.readFile(path.join(repositoryRoot, ".firebaserc"), "utf8"));

const portalConfig = canonicalConfig.hosting?.find(({ target }) => target === "portal");
if (!portalConfig) {
  throw new Error("firebase.json must define the reviewed portal Hosting target");
}

const hostingStats = await fs.stat(portalHostingRoot).catch(() => null);
if (!hostingStats?.isDirectory()) {
  throw new Error("Prepare the combined portal Hosting artifact before BWM-007 verification");
}

const verificationConfig = {
  functions: [
    {
      source: "functions",
      codebase: "default",
      disallowLegacyRuntimeConfig: true,
      ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
    },
  ],
  hosting: [
    {
      ...portalConfig,
      public: "hosting/portal",
    },
  ],
  emulators: canonicalConfig.emulators,
};

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });
await fs.cp(path.join(sourceRoot, "functions"), path.join(outputRoot, "functions"), {
  recursive: true,
});
await fs.symlink(
  path.join(repositoryRoot, "functions/node_modules"),
  path.join(outputRoot, "functions/node_modules"),
  process.platform === "win32" ? "junction" : "dir",
);
await fs.cp(portalHostingRoot, path.join(outputRoot, "hosting/portal"), {
  recursive: true,
});
await fs.writeFile(
  path.join(outputRoot, "firebase.json"),
  `${JSON.stringify(verificationConfig, null, 2)}\n`,
  "utf8",
);
await fs.writeFile(
  path.join(outputRoot, ".firebaserc"),
  `${JSON.stringify(firebaseRc, null, 2)}\n`,
  "utf8",
);

console.log(`Prepared isolated BWM-007 failure verification package: ${outputRoot}`);
