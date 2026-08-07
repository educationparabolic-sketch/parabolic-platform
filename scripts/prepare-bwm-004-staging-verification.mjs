import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(repositoryRoot, "verification", "bwm-004");
const outputRoot = path.join(repositoryRoot, ".firebase", "bwm-004-verification");
const canonicalConfigPath = path.join(repositoryRoot, "firebase.json");
const firebaseRcPath = path.join(repositoryRoot, ".firebaserc");

const canonicalConfig = JSON.parse(await fs.readFile(canonicalConfigPath, "utf8"));
const firebaseRc = JSON.parse(await fs.readFile(firebaseRcPath, "utf8"));

if (!Array.isArray(canonicalConfig.hosting)) {
  throw new Error("firebase.json must define the reviewed multi-target Hosting configuration");
}

const expectedTargets = ["portal", "exam", "vendor"];
const configuredTargets = canonicalConfig.hosting.map(({target}) => target).sort();
if (JSON.stringify(configuredTargets) !== JSON.stringify([...expectedTargets].sort())) {
  throw new Error(`Unexpected Hosting targets: ${configuredTargets.join(", ")}`);
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
  hosting: canonicalConfig.hosting.map((hosting) => ({
    ...hosting,
    public: `hosting/${hosting.target}`,
  })),
};

await fs.rm(outputRoot, {recursive: true, force: true});
await fs.mkdir(outputRoot, {recursive: true});
await fs.cp(path.join(sourceRoot, "functions"), path.join(outputRoot, "functions"), {
  recursive: true,
});
await fs.cp(path.join(sourceRoot, "hosting"), path.join(outputRoot, "hosting"), {
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

console.log(`Prepared isolated BWM-004 staging verification package: ${outputRoot}`);
