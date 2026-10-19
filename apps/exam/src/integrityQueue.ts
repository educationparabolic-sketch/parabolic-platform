import type {
  ExamIntegrityBatchRequestV1,
  ExamIntegrityEventV1,
  ExamIntegrityEventTypeV1,
} from "../../../shared/contracts/examProctoring";
export interface ReportingState {
  pending: number;
  saved: number;
  lost: number;
  status: "ready" | "sending" | "unavailable" | "stopped";
}
const keys = (v: Record<string, unknown>, fields: string[]) =>
  Object.keys(v).sort().join() === fields.sort().join();
function date(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value))
    return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : NaN;
}
export function validateIntegrityAcknowledgement(
  value: unknown,
  sessionId: string,
  generation: number,
  batch: ExamIntegrityBatchRequestV1,
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid reporting acknowledgement.");
  const r = value as Record<string, unknown>;
  if (
    !keys(r, [
      "contractVersion",
      "sessionId",
      "batchId",
      "generation",
      "disposition",
      "acceptedCount",
      "receivedAt",
      "retainedUntil",
      "source",
    ]) ||
    r.contractVersion !== 1 ||
    r.sessionId !== sessionId ||
    r.generation !== generation ||
    r.batchId !== batch.batchId ||
    (r.disposition !== "accepted" && r.disposition !== "replayed") ||
    r.acceptedCount !== batch.events.length ||
    r.source !== "client_report" ||
    !Number.isFinite(date(r.receivedAt)) ||
    date(r.retainedUntil) - date(r.receivedAt) !== 30 * 86400000
  )
    throw new Error("Invalid reporting acknowledgement.");
}
/** Memory only, independent of answer/lease/submit commands. Never drains at exit. */
export class IntegrityQueue {
  private events: ExamIntegrityEventV1[] = [];
  private batch: ExamIntegrityBatchRequestV1 | null = null;
  private busy = false;
  private stopped = false;
  private unavailable = false;
  private retries = 0;
  private nextAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saved = 0;
  private lost = 0;
  private last: ExamIntegrityEventV1 | undefined;
  private abort = new AbortController();
  private sessionId: string;
  private generation: number;
  private current: () => boolean;
  private online: () => boolean;
  private send: (batch: ExamIntegrityBatchRequestV1, signal: AbortSignal) => Promise<unknown>;
  private changed: (state: ReportingState) => void;
  constructor(
    sessionId: string,
    generation: number,
    current: () => boolean,
    online: () => boolean,
    send: IntegrityQueue["send"],
    changed: IntegrityQueue["changed"],
  ) {
    this.sessionId = sessionId;
    this.generation = generation;
    this.current = current;
    this.online = online;
    this.send = send;
    this.changed = changed;
    this.publish();
  }
  private publish() {
    this.changed({
      pending: this.events.length,
      saved: this.saved,
      lost: this.lost,
      status: this.stopped
        ? "stopped"
        : this.unavailable
          ? "unavailable"
          : this.busy
            ? "sending"
            : "ready",
    });
  }
  capture(type: ExamIntegrityEventTypeV1, phase: ExamIntegrityEventV1["phase"]) {
    if (this.stopped || !this.current()) return;
    const event: ExamIntegrityEventV1 = {
      eventType: type,
      observedAt: new Date().toISOString(),
      phase,
    };
    if (
      this.last?.eventType === type &&
      this.last.phase === phase &&
      date(event.observedAt) - date(this.last.observedAt) < 1000
    )
      return;
    this.last = event;
    if (this.events.length >= 60) {
      this.lost++;
      this.publish();
      return;
    }
    this.events.push(event);
    this.publish();
    this.wake();
  }
  wake = () => {
    clearTimeout(this.timer);
    if (this.stopped || this.unavailable || this.busy || !this.events.length || !this.online())
      return;
    this.timer = setTimeout(() => void this.flush(), Math.max(0, this.nextAt - Date.now()));
  };
  retry = () => {
    if (this.stopped || this.busy) return;
    this.unavailable = false;
    this.retries = 0;
    this.publish();
    this.wake();
  };
  stop = () => {
    if (this.stopped) return;
    this.stopped = true;
    this.abort.abort();
    clearTimeout(this.timer);
    this.lost += this.events.length;
    this.events = [];
    this.last = undefined;
    this.batch = null;
    this.publish();
  };
  private async flush() {
    if (this.stopped || this.busy || !this.current() || !this.online()) return;
    if (!this.events.length) return;
    if (!this.batch)
      this.batch = {
        contractVersion: 1,
        batchId: crypto.randomUUID(),
        events: [this.events[0], ...this.events.slice(1, 10)],
      };
    const batch = this.batch;
    if (new TextEncoder().encode(JSON.stringify(batch)).length > 8192) {
      this.unavailable = true;
      this.publish();
      return;
    }
    this.busy = true;
    this.publish();
    try {
      const ack = await this.send(batch, this.abort.signal);
      if (this.stopped || !this.current()) return;
      validateIntegrityAcknowledgement(ack, this.sessionId, this.generation, batch);
      this.events.splice(0, batch.events.length);
      this.saved += batch.events.length;
      this.batch = null;
      this.retries = 0;
      this.nextAt = Date.now() + 5000;
    } catch (error) {
      if (this.stopped) return;
      const e = (error ?? {}) as {
        status?: number;
        details?: { reason?: string; retryAfterSeconds?: number };
      };
      const reason = e.details?.reason;
      if (!this.current()) {
        this.stop();
        return;
      }
      if (
        [
          "integrity_capacity_reached",
          "integrity_disabled",
          "integrity_window_closed",
          "integrity_receipt_expired",
          "session_closed",
        ].includes(reason ?? "")
      ) {
        this.stop();
        return;
      }
      if (reason === "integrity_rate_limited")
        this.nextAt = Date.now() + Math.max(5, Number(e.details?.retryAfterSeconds) || 5) * 1000;
      else if ((e.status === 0 || (e.status ?? 0) >= 500) && this.retries < 3)
        this.nextAt = Date.now() + [1000, 2000, 5000][this.retries++];
      else this.unavailable = true; // malformed ACK and deterministic denials require explicit retry; never claim saved.
    } finally {
      this.busy = false;
      this.publish();
      this.wake();
    }
  }
}
