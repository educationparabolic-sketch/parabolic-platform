import {readFile, readdir, writeFile, lstat} from "node:fs/promises";
import {resolve, relative} from "node:path";
import {fileURLToPath} from "node:url";
import {scanReleaseArtifacts} from "./scan-release-artifacts.mjs";

export const REVALIDATE = "no-cache, max-age=0, must-revalidate";
export const PRIVATE = "private, max-age=0, no-store";
export const IMMUTABLE = "public, max-age=31536000, immutable";
export function cdnReleaseOrigin(environment) {
  const raw = environment.VITE_CDN_BASE_URL;
  if (!raw || raw !== environment.CDN_BASE_URL || /[\s\\?#]/u.test(raw)) throw new Error("Exact matching CDN release bases required");
  let url;
  try {url = new URL(raw);} catch {throw new Error("Invalid CDN release base");}
  const decoded = decodeURIComponent(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
      /(?:^|\/)\.{1,2}(?:\/|$)/u.test(decoded) || /[%\\\s]/u.test(decoded) ||
      url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
      url.hostname === "[::1]" || url.hostname === "[::]" || url.hostname === "0.0.0.0" ||
      /^\[::ffff:7f[0-9a-f]{2}:/iu.test(url.hostname) || /^127\./u.test(url.hostname) || url.hostname.endsWith(".")) throw new Error("Unsafe CDN release base");
  return url.origin;
}
async function files(directory) {
  if ((await lstat(directory)).isSymbolicLink()) throw new Error("Symlink in served root");
  const result = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (entry.isSymbolicLink()) throw new Error("Symlink in served root");
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
export async function prepareSecurityHosting({environment = process.env, rootDirectory = process.cwd(),
  config} = {}) {
  config ??= JSON.parse(await readFile(resolve(rootDirectory, "firebase.json"), "utf8"));
  cdnReleaseOrigin(environment);
  await scanReleaseArtifacts({rootDirectory});
  return securityHostingConfig({environment, rootDirectory, config});
}
export async function securityHostingConfig({environment, rootDirectory, config}) {
  const origin = cdnReleaseOrigin(environment);
  const candidate = structuredClone(config);
  if (candidate.hosting.length !== 3 || new Set(candidate.hosting.map(h => h.target)).size !== 3) throw new Error("Three reviewed targets required");
  const served = {portal: ".firebase/hosting/portal", exam: "apps/exam/dist", vendor: "apps/vendor/dist"};
  for (const target of candidate.hosting) {
    if (target.public !== served[target.target]) throw new Error("Unreviewed served release root");
    const base = target.headers.find(row => row.source === "**");
    const csp = base.headers.find(header => header.key === "Content-Security-Policy");
    csp.value = csp.value.replace("img-src 'self' data: blob:", `img-src 'self' data: blob: ${origin}`);
    // Exact existing generated files only: nonexistent hashed-looking paths still revalidate.
    const root = resolve(rootDirectory, target.public);
    for (const path of await files(root)) {
      const name = relative(root, path).replaceAll("\\", "/");
      if (/^(?:(?:admin|student)\/)?assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|png|webp|svg|woff2?)$/u.test(name)) {
        target.headers.push({source: "/" + name, headers: [{key: "Cache-Control", value: IMMUTABLE}]});
      }
    }
  }
  return candidate;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const candidate = await prepareSecurityHosting();
  await writeFile(".firebase-security-release.json", JSON.stringify(candidate, null, 2) + "\n");
  console.log("Prepared exact-origin, fully scanned three-target Hosting policy (no deployment).");
}
