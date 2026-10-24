// URL syntax is a rendering boundary, never a replacement for server object authorization.
const unsafe = /[\u0000-\u0020\u007f\\]/u;
const segment = /^[A-Za-z0-9_-]+$/u;
export function safeBusinessUrl(value: string | null | undefined): string {
  if (!value || unsafe.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(value)) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? value : "";
  } catch { return ""; }
}
function cleanPath(path: string): boolean {
  try {
    const decoded = decodeURIComponent(path);
    return !unsafe.test(decoded) && !decoded.includes("%") &&
      decoded.split("/").every(part => part !== "." && part !== "..");
  } catch { return false; }
}
export function managedSignedAssetUrl(value: string | null | undefined, base: string | undefined,
  expectedPath?: string): string {
  if (!value || !base || unsafe.test(value) || unsafe.test(base) || !cleanPath(value.split("?")[0])) return "";
  try {
    const target = new URL(value), configured = new URL(base);
    if (configured.protocol !== "https:" || configured.username || configured.password ||
        configured.port || configured.search || configured.hash || !cleanPath(configured.pathname) ||
        target.protocol !== "https:" || target.origin !== configured.origin || target.username ||
        target.password || target.port || target.hash) return "";
    const prefix = configured.pathname.replace(/\/$/u, "") + "/";
    if (!target.pathname.startsWith(prefix)) return "";
    const object = target.pathname.slice(prefix.length);
    const parts = object.split("/");
    if (!parts.every(part => segment.test(part) || /^[A-Za-z0-9_-]+\.(?:png|webp|pdf|csv)$/u.test(part))) return "";
    const question = /^[A-Za-z0-9_-]+\/questions\/[A-Za-z0-9_-]+\/v[1-9]\d*\/(?:question|solution)(?:-r[1-9]\d*)?\.(?:png|webp|pdf)$/u;
    const report = /^[A-Za-z0-9_-]+\/reports\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.(?:pdf|csv)$/u;
    if (!question.test(object) && !report.test(object)) return "";
    if (expectedPath !== undefined && object !== expectedPath) return "";
    for (const key of ["Expires", "KeyName", "Signature"]) {
      const values = target.searchParams.getAll(key);
      if (values.length !== 1 || !values[0]) return "";
    }
    if (!/^\d+$/u.test(target.searchParams.get("Expires")!)) return "";
    return value; // Preserve the original signature, query ordering and escape bytes.
  } catch { return ""; }
}
