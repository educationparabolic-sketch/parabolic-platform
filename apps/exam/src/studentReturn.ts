function origin(value: unknown): URL | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return null;
  const text = value.trim();
  try {
    const parsed = new URL(text);
    // Reject paths and URL-parser normalization tricks, including empty ?/#.
    if (text !== parsed.origin && text !== `${parsed.origin}/`) return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch { return null; }
}

function loopback(host: string) {
  const normalized = host.replace(/\.+$/u, "");
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "[::1]" ||
    /^127\./u.test(normalized) || /^\[::ffff:7f[0-9a-f]{2}:/u.test(normalized);
}

/** Configuration only: never accepts a browser return path, credential or fallback. */
export function resolveStudentReturnUrl(portalValue: unknown, examValue: string, authEmulatorValue?: string): string | null {
  const portal = origin(portalValue), exam = origin(examValue);
  if (!portal || !exam || portal.origin === exam.origin) return null;
  const emulator = origin(authEmulatorValue);
  const isolatedLocal = !!emulator && emulator.protocol === "http:" && loopback(emulator.hostname) &&
    loopback(exam.hostname) && loopback(portal.hostname);
  if (portal.protocol !== "https:" && !(isolatedLocal && portal.protocol === "http:")) return null;
  if (loopback(portal.hostname) && !isolatedLocal) return null;
  return new URL("/student/my-tests", portal.origin).href;
}
