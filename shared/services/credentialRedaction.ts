/** Redact credential-bearing values before telemetry is stored or returned. */
export function redactCredentialText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/giu, "[redacted-url]")
    .replace(/((?:token|launch|launchCredential|nextOwnerProof|ownerProof|authorization|x-parabolic-exam-(?:owner|generation))["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s"'&,}\]]+/giu, "$1[redacted]")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/gu, "[redacted-token]")
    .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/gu, "[redacted-proof]")
    .replace(/\b[a-f0-9]{64}\b/giu, "[redacted-hash]");
}

export function redactTelemetry<T>(value: T): T {
  if (typeof value === "string") return redactCredentialText(value) as T;
  if (Array.isArray(value)) return value.map((entry: unknown) => redactTelemetry(entry)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
      /token|credential|proof|authorization|headers|body|claims/iu.test(key) ? "[redacted]" : redactTelemetry(entry),
    ])) as T;
  }
  return value;
}
