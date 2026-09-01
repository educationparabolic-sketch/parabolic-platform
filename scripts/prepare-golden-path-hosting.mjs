import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const hostingRoot = path.join(repositoryRoot, ".firebase", "hosting", "golden-path");
const portalBuilds = [
  ["admin", path.join(repositoryRoot, "apps", "admin", "dist")],
  ["student", path.join(repositoryRoot, "apps", "student", "dist")],
  ["exam", path.join(repositoryRoot, "apps", "exam", "dist")],
];

async function assertDirectory(directoryPath) {
  const stats = await fs.stat(directoryPath).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error(`Missing golden-path build output: ${directoryPath}`);
  }
}

await Promise.all(portalBuilds.map(([, directory]) => assertDirectory(directory)));
await fs.rm(hostingRoot, { force: true, recursive: true });
await fs.mkdir(hostingRoot, { recursive: true });
await Promise.all(
  portalBuilds.map(([name, directory]) =>
    fs.cp(directory, path.join(hostingRoot, name), { recursive: true }),
  ),
);
await fs.writeFile(
  path.join(hostingRoot, "index.html"),
  '<!doctype html><meta http-equiv="refresh" content="0;url=/admin">\n',
  "utf8",
);

console.log(`Prepared golden-path Hosting artifact: ${hostingRoot}`);
