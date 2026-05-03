const BLOCKED_RAW_SESSION_KEYS = new Set([
  "sessionlog",
  "sessionlogs",
  "rawanswerarray",
  "rawanswerarrays",
  "rawanswers",
  "answermap",
  "perquestiontimestamps",
  "questiontimestamps",
  "questiontimings",
  "eventlog",
  "eventlogs",
]);

type StudentSummaryResource =
  | "dashboard"
  | "tests"
  | "performance"
  | "insights"
  | "solutions";

function normalizeKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function scanForBlockedFields(
  value: unknown,
  resource: StudentSummaryResource,
  trail: string[],
): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      scanForBlockedFields(entry, resource, [...trail, `[${index}]`]);
    });
    return;
  }

  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if (BLOCKED_RAW_SESSION_KEYS.has(normalizeKey(key))) {
      const location = trail.length > 0 ? `${trail.join(".")}.${key}` : key;
      throw new Error(
        `GET /student/${resource} exposed blocked raw-session field "${location}". Student portal data must remain summary-only.`,
      );
    }

    scanForBlockedFields(entry, resource, [...trail, key]);
  }
}

export function assertStudentSummaryPayload(
  payload: unknown,
  resource: StudentSummaryResource,
): void {
  scanForBlockedFields(payload, resource, []);
}
