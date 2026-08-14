export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (normalized === "localhost") {
    return true;
  }

  const segments = normalized.split(".");
  return (
    segments.length === 4 &&
    segments[0] === "127" &&
    segments[1] === "0" &&
    segments[2] === "0" &&
    segments[3] === "1"
  );
}
