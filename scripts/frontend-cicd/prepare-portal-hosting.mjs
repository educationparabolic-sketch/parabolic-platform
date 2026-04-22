import fs from "node:fs/promises";
import path from "node:path";

const portalHostingRoot = path.resolve(".firebase/hosting/portal");
const adminDistPath = path.resolve("apps/admin/dist");
const studentDistPath = path.resolve("apps/student/dist");

async function assertDirectoryExists(directoryPath) {
  const stats = await fs.stat(directoryPath).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Missing build output directory: ${directoryPath}`);
  }
}

async function writePortalIndex() {
  const indexPath = path.join(portalHostingRoot, "index.html");
  const html = [
    "<!doctype html>",
    "<html lang=\"en\">",
    "  <head>",
    "    <meta charset=\"utf-8\" />",
    "    <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />",
    "    <title>Parabolic Portal</title>",
    "    <meta http-equiv=\"refresh\" content=\"0; url=/admin\" />",
    "  </head>",
    "  <body>",
    "    <p>Redirecting to /admin...</p>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");

  await fs.writeFile(indexPath, html, "utf8");
}

async function main() {
  await assertDirectoryExists(adminDistPath);
  await assertDirectoryExists(studentDistPath);

  await fs.rm(portalHostingRoot, { recursive: true, force: true });
  await fs.mkdir(portalHostingRoot, { recursive: true });

  await fs.cp(adminDistPath, path.join(portalHostingRoot, "admin"), {
    recursive: true,
  });
  await fs.cp(studentDistPath, path.join(portalHostingRoot, "student"), {
    recursive: true,
  });

  await writePortalIndex();

  console.log("Prepared portal hosting bundle:", portalHostingRoot);
}

await main();
