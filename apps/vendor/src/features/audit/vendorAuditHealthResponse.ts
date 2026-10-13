import type {
  VendorAuditEventsQuery, VendorAuditEventsResult, VendorSystemHealthResult,
} from "../../../../../shared/contracts/vendorAuditHealth";

export const auditCategories = ["institute", "onboarding", "access", "support", "license", "billing", "webhook", "calibration"] as const;
export const auditStatuses = ["completed", "pending", "failed"] as const;
const sources = ["vendor_command_audit", "vendor_system_audit", "calibration_terminal", "stripe_event", "billing_snapshot", "license_history"];
type Obj = Record<string, unknown>;
const fail = (): never => { throw new Error("Invalid Vendor audit or health authority."); };
const obj = (value: unknown, keys: string[]): Obj => {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail();
  return value as Obj;
};
const text = (value: unknown, max = 1000): string => {
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > max) fail();
  return value as string;
};
const id = (value: unknown) => { const result = text(value, 128); if (/[\s/]/u.test(result)) fail(); return result; };
const date = (value: unknown): string => {
  const result = text(value, 32);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) fail();
  return result;
};
const number = (value: unknown, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) fail();
  return value as number;
};
const oneOf = (value: unknown, allowed: readonly string[]) => { if (!allowed.includes(text(value, 160))) fail(); };
const nullable = (value: unknown, check: (value: unknown) => unknown) => { if (value !== null) check(value); };
const cursor = (value: unknown) => { if (!/^[A-Za-z0-9_-]+$/u.test(text(value, 4096))) fail(); };
const metadataKeys = ["operationId", "requestId", "invoiceId", "versionId", "cycleId", "eventType", "processingState", "reconciliationState", "previousLicenseLayer", "nextLicenseLayer", "amountMinor", "currency", "affectedInstituteCount", "revision"];

export function parseAuditQuery(value: unknown): VendorAuditEventsQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const input = value as Obj;
  if (Object.keys(input).some(key => !["category", "status", "instituteId", "from", "to", "limit", "cursor"].includes(key))) fail();
  if (input.category !== undefined) oneOf(input.category, auditCategories);
  if (input.status !== undefined) oneOf(input.status, auditStatuses);
  if (input.instituteId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(text(input.instituteId, 128))) fail();
  if (input.from !== undefined) date(input.from);
  if (input.to !== undefined) date(input.to);
  if (input.from !== undefined && input.to !== undefined && String(input.from) > String(input.to)) fail();
  if (input.limit !== undefined && number(input.limit, 50) < 1) fail();
  if (input.cursor !== undefined) cursor(input.cursor);
  return input as VendorAuditEventsQuery;
}

export function parseAuditSearch(params: URLSearchParams): VendorAuditEventsQuery {
  const input: Obj = {};
  for (const [key, value] of params) {
    if (key in input || !value) fail();
    if (key === "limit") {
      if (!/^(?:[1-9]|[1-4][0-9]|50)$/u.test(value)) fail();
      input[key] = Number(value);
    } else input[key] = value;
  }
  return parseAuditQuery(input);
}

export function parseVendorAuditEvents(value: unknown, selection: VendorAuditEventsQuery = {}): VendorAuditEventsResult {
  parseAuditQuery(selection);
  const page = obj(value, ["generatedAt", "items", "hasMore", "nextCursor"]);
  date(page.generatedAt);
  if (!Array.isArray(page.items) || page.items.length > (selection.limit ?? 25) || typeof page.hasMore !== "boolean") fail();
  if (page.hasMore) cursor(page.nextCursor); else if (page.nextCursor !== null) fail();
  if (page.hasMore && page.nextCursor === selection.cursor) fail();
  const seen = new Set<string>();
  let previous: {time: string; source: number} | null = null;
  (page.items as unknown[]).forEach(value => {
    const event = obj(value, ["eventId", "occurredAt", "source", "category", "status", "action", "summary", "actor", "institute", "target", "metadata"]);
    const eventId = id(event.eventId);
    if (!/^audit_[A-Za-z0-9_-]{24}$/u.test(eventId) || seen.has(eventId)) fail();
    seen.add(eventId);
    const time = date(event.occurredAt); oneOf(event.source, sources);
    const source = sources.indexOf(event.source as string);
    // Same-source ties use a private Firestore continuation key, not public HMAC IDs.
    if (previous && (time > previous.time || (time === previous.time && source < previous.source))) fail();
    previous = {time, source};
    oneOf(event.category, auditCategories); oneOf(event.status, auditStatuses);
    text(event.action, 128); text(event.summary);
    if ((selection.category && event.category !== selection.category) || (selection.status && event.status !== selection.status) ||
      (selection.from && time < selection.from) || (selection.to && time > selection.to)) fail();
    nullable(event.actor, value => { const actor = obj(value, ["userId", "role"]); id(actor.userId); nullable(actor.role, value => text(value, 64)); });
    nullable(event.institute, value => {
      const institute = obj(value, ["instituteId", "displayName"]); id(institute.instituteId); nullable(institute.displayName, value => text(value, 160));
      if (selection.instituteId && institute.instituteId !== selection.instituteId) fail();
    });
    nullable(event.target, value => {
      const target = obj(value, ["kind", "targetId"]);
      oneOf(target.kind, ["institute", "onboarding", "administrator", "support_ticket", "license", "invoice", "payment_event", "calibration"]); id(target.targetId);
      if (target.kind === "payment_event" && !/^audit_[A-Za-z0-9_-]{24}$/u.test(String(target.targetId))) fail();
    });
    const metadata = obj(event.metadata, metadataKeys);
    for (const key of ["operationId", "requestId", "invoiceId", "versionId"]) nullable(metadata[key], id);
    nullable(metadata.cycleId, value => { if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(text(value, 7))) fail(); });
    nullable(metadata.eventType, value => text(value, 160));
    nullable(metadata.processingState, value => oneOf(value, ["received", "processing", "applied", "ignored", "failed_retryable", "failed_terminal", "pending", "succeeded", "failed", "not_applicable"]));
    nullable(metadata.reconciliationState, value => oneOf(value, ["pending", "reconciled", "mismatch", "manual_review"]));
    for (const key of ["previousLicenseLayer", "nextLicenseLayer"]) nullable(metadata[key], value => oneOf(value, ["L0", "L1", "L2", "L3"]));
    nullable(metadata.amountMinor, number); nullable(metadata.currency, value => { if (!/^[A-Z]{3}$/u.test(text(value, 3))) fail(); });
    if (metadata.amountMinor !== null && metadata.currency === null) fail();
    nullable(metadata.affectedInstituteCount, value => number(value, 20));
    nullable(metadata.revision, value => { if (number(value) < 1) fail(); });
  });
  return page as unknown as VendorAuditEventsResult;
}

const queueNames = ["failureRecovery", "emailDelivery", "stripeReconciliation", "calibrationOperations"] as const;
export const unavailableHealthNames = ["cloudMonitoring", "errorReporting", "costAndUsage", "latencyAndErrorMetrics", "frontendTelemetry", "deploymentHistory"] as const;
const queueKeys = ["totalCount", "outstandingCount", "processingCount", "retryingCount", "succeededCount", "failedCount", "oldestOutstandingAt", "newestActivityAt"];
export function parseVendorSystemHealth(value: unknown): VendorSystemHealthResult {
  const result = obj(value, ["generatedAt", "release", ...queueNames, ...unavailableHealthNames]);
  const generated = date(result.generatedAt);
  for (const name of ["release", ...queueNames, ...unavailableHealthNames]) {
    const raw = result[name] as Obj | null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
    const source = obj(raw, raw.availability === "available" ? ["availability", "observedAt", "data"] : ["availability", "observedAt", "reason"]);
    if (date(source.observedAt) !== generated) fail();
    if (source.availability === "unavailable") {
      oneOf(source.reason, ["not_configured", "no_durable_source", "adapter_not_implemented", "source_limit_exceeded", "source_unavailable"]);
      if (unavailableHealthNames.includes(name as typeof unavailableHealthNames[number]) &&
        source.reason !== (name === "cloudMonitoring" || name === "errorReporting" ? "adapter_not_implemented" : "no_durable_source")) fail();
      continue;
    }
    if (source.availability !== "available" || unavailableHealthNames.includes(name as typeof unavailableHealthNames[number])) fail();
    if (name === "release") {
      const release = obj(source.data, ["releaseId", "commitSha", "builtAt", "environment", "functionsRevision"]);
      nullable(release.releaseId, value => { if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u.test(text(value, 128))) fail(); });
      nullable(release.commitSha, value => { if (!/^[a-fA-F0-9]{40}$/u.test(text(value, 40))) fail(); });
      nullable(release.builtAt, date); nullable(release.environment, value => oneOf(value, ["development", "staging", "production", "test"]));
      nullable(release.functionsRevision, value => { if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(text(value, 128))) fail(); });
      if (Object.values(release).every(value => value === null)) fail();
    } else {
      const queue = obj(source.data, queueKeys); const total = number(queue.totalCount, 1000);
      for (const key of queueKeys.slice(1, 6)) number(queue[key], total);
      if (Number(queue.processingCount) + Number(queue.retryingCount) > Number(queue.outstandingCount) ||
        Number(queue.processingCount) + Number(queue.retryingCount) + Number(queue.succeededCount) + Number(queue.failedCount) > total) fail();
      nullable(queue.oldestOutstandingAt, date); nullable(queue.newestActivityAt, date);
      if ((queue.outstandingCount === 0) !== (queue.oldestOutstandingAt === null) || (total === 0) !== (queue.newestActivityAt === null) ||
        (queue.oldestOutstandingAt !== null && queue.newestActivityAt !== null && String(queue.oldestOutstandingAt) > String(queue.newestActivityAt))) fail();
    }
  }
  return result as unknown as VendorSystemHealthResult;
}
