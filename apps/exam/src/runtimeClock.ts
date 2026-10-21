/** Receipt anchors are document-local; browser storage never supplies clock authority. */
export class RuntimeClock {
  private receipt = 0;
  private serverEpoch = 0;
  private deadline = 0;
  private ready = false;
  accept(serverTime: string, deadlineAt: string | null, sentAt: number, receivedAt: number) {
    const server = Date.parse(serverTime), end = deadlineAt === null ? null : Date.parse(deadlineAt);
    if (!Number.isFinite(server) || (end !== null && !Number.isFinite(end)) ||
        !Number.isFinite(sentAt) || !Number.isFinite(receivedAt) || receivedAt < sentAt) throw new Error("Clock confirmation unavailable.");
    this.receipt = receivedAt; this.serverEpoch = server;
    this.deadline = end === null ? 0 : receivedAt + Math.max(0, end - server - (receivedAt - sentAt));
    this.ready = true;
  }
  serverNow(now: number) {
    if (!this.ready || now < this.receipt || !Number.isFinite(now)) throw new Error("Confirm the server clock before editing.");
    return this.serverEpoch + now - this.receipt;
  }
  remaining(now: number) {this.serverNow(now); return Math.max(0, this.deadline - now);}
  timestamp(highWater: number, now: number) {
    const server = Math.floor(this.serverNow(now)), next = Math.max(server, highWater + 1);
    if (!Number.isSafeInteger(next) || next >= 8640000000000000 || next > server + 29_000) {
      throw new Error("Answer ordering needs server confirmation. Pending timestamps were preserved.");
    }
    return next;
  }
}

/** Count only a continuous eligible foreground interval. A throttled/sleep gap needs reconciliation. */
export function interactionElapsed(previous: number, now: number, eligible: boolean, previousWall?: number, wall?: number) {
  const elapsed = now - previous;
  // Wall time detects uncertainty only (including platforms whose monotonic clock stops during sleep).
  // It never supplies remaining time, answer ordering or compliant dwell.
  const discontinuity = previousWall !== undefined && wall !== undefined &&
    (!Number.isFinite(wall - previousWall) || Math.abs((wall - previousWall) - elapsed) > 5000);
  const uncertain = discontinuity || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 5000;
  return {uncertain, elapsed: eligible && !uncertain ? elapsed : 0};
}
