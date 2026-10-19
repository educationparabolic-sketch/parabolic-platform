import { getIdTokenResult, onIdTokenChanged, signInWithCustomToken, signOut } from "firebase/auth";
import type { ExamRuntimeEntryRequestV2, ExamRuntimeLeaseReceipt } from "../../../shared/contracts/examRuntimeOwnership";
import type { ApiClientRequestOptions } from "../../../shared/types/apiClient";
import { getPortalApiClient } from "../../../shared/services/portalIntegration";
import { getFrontendEnvironment } from "../../../shared/services/frontendEnvironment";
import { getFirebaseAuth } from "../../../shared/services/firebaseClient";
import { ApiClientError, SAME_ORIGIN_API_BASE_URL } from "../../../shared/services/apiClient";
import { adaptExamSessionEntryResult, adaptExamSubmitResult } from "../../../shared/services/portalResponseAdapters";
import { getLaunchMetadata, takeLaunchCredential } from "./launchBootstrap";
import { OWNER_STORAGE_KEY, leaseDeadline, readLease, readOwnerRecord, recoverySource, type Owner, type OwnerRecord } from "./ownershipState";

const launchApiClient = getPortalApiClient("exam");
function assertSameOriginApi() {
  const configured = new URL(getFrontendEnvironment().apiBaseUrl || SAME_ORIGIN_API_BASE_URL, window.location.origin);
  if (configured.href !== new URL(SAME_ORIGIN_API_BASE_URL, window.location.origin).href) throw safeError();
}
const safeError = () => new Error("Exam ownership is unavailable. Pending answers are retained. Relaunch or recover from Student My Tests.");
function tuple(uid: string, claims: Record<string, unknown>): string {
  const values = [uid, claims.instituteId, claims.yearId, claims.runId, claims.sessionId, claims.studentId, claims.launchNonce];
  if (claims.role !== "student" || values.some((v) => typeof v !== "string" || !v || v.length > 256)) throw safeError();
  return JSON.stringify(values);
}
function tokenTuple(token: string | null): string {
  if (!token) throw safeError();
  const bytes = Uint8Array.from(atob(token.split(".")[1].replace(/-/gu, "+").replace(/_/gu, "/")), (char) => char.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  return tuple(String(payload.sub ?? ""), payload);
}
function proof(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}
export interface OwnershipState {phase: "pending" | "active" | "closed" | "lost"; generation: number; reason: string}

/** One instance and one acquisition per document/session, including StrictMode remounts. */
export class ExamRuntimeOwnership {
  private state: OwnershipState = {phase: "pending", generation: 0, reason: ""};
  private listeners = new Set<() => void>();
  private lifetime = new AbortController();
  private expected = "";
  private scopeHash = "";
  private owner: Owner | null = null;
  private deadline = 0;
  private expiryTimer = 0;
  private renewTimer = 0;
  private unsubscribeAuth?: () => void;
  private channel?: BroadcastChannel;
  private renewCommand?: Extract<ExamRuntimeEntryRequestV2, {operation: "renew"}>;
  private renewSentAt = 0;
  private commandTail: Promise<unknown> = Promise.resolve();
  private startPromise?: ReturnType<ExamRuntimeOwnership["initialize"]>;
  readonly sessionId: string;
  constructor(sessionId: string) {this.sessionId = sessionId;}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      queueMicrotask(() => {
        if (!this.listeners.size) {
          this.invalidate("document_closed");
          this.unsubscribeAuth?.(); this.channel?.close();
          if (instances.get(this.sessionId) === this) instances.delete(this.sessionId);
        }
      });
    };
  };
  private publish(phase: OwnershipState["phase"], reason = "") {
    this.state = {phase, generation: this.owner?.generation ?? 0, reason};
    this.listeners.forEach((listener) => listener());
  }
  invalidate = (reason = "ownership_lost") => {
    if (this.state.phase === "lost") return;
    this.lifetime.abort();
    window.clearTimeout(this.expiryTimer); window.clearTimeout(this.renewTimer);
    this.publish("lost", reason);
  };
  matchesToken(token: string | null): boolean {
    try { return !!this.expected && tokenTuple(token) === this.expected; } catch { return false; }
  }
  isCurrent = () => {
    return !this.lifetime.signal.aborted && (this.state.phase === "closed" || (this.state.phase === "active" && performance.now() < this.deadline));
  };
  private async identity() {
    assertSameOriginApi();
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user || this.lifetime.signal.aborted) throw safeError();
    const token = await getIdTokenResult(user);
    if (auth.currentUser !== user || tuple(user.uid, token.claims) !== this.expected || this.lifetime.signal.aborted) {
      this.invalidate("identity_changed"); throw safeError();
    }
    return token;
  }
  private validateToken = (token: string | null) => {
    if (this.lifetime.signal.aborted || !this.matchesToken(token)) {
      this.invalidate("identity_changed"); throw safeError();
    }
  };
  private store(record: OwnerRecord) {
    // Failure to preserve pending acquisition must fail before the server request.
    sessionStorage.setItem(OWNER_STORAGE_KEY, JSON.stringify(record));
  }
  private command(command: ExamRuntimeEntryRequestV2, headers: Record<string, string> = {}) {
    const next = this.commandTail.catch(() => undefined).then(() => this.executeCommand(command, headers));
    this.commandTail = next;
    return next;
  }
  private async executeCommand(command: ExamRuntimeEntryRequestV2, headers: Record<string, string>) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.identity();
        const result = await launchApiClient.post<unknown, ExamRuntimeEntryRequestV2>(
          `/exam/session/${encodeURIComponent(this.sessionId)}/entry`, {
            body: command, headers, signal: this.lifetime.signal,
            retry: {maxAttempts: 1}, validateAuthToken: this.validateToken,
            handledFailureIsReady: true,
          });
        await this.identity();
        return result;
      } catch (error) {
        if (this.lifetime.signal.aborted || !(error instanceof ApiClientError) ||
            (error.status > 0 && error.status < 500) || attempt === 1) throw error;
      }
    }
    throw safeError();
  }
  private install(lease: ExamRuntimeLeaseReceipt, sentAt: number) {
    this.deadline = leaseDeadline(lease, sentAt);
    if (performance.now() >= this.deadline) throw safeError();
    window.clearTimeout(this.expiryTimer);
    this.expiryTimer = window.setTimeout(() => this.invalidate("lease_expired"), this.deadline - performance.now());
    this.renewTimer = window.setTimeout(() => void this.renew(), 30000);
  }
  private async initialize() {
    let token = takeLaunchCredential();
    let command: ExamRuntimeEntryRequestV2 | undefined;
    try {
      assertSameOriginApi();
      const metadata = getLaunchMetadata();
      if (metadata.status === "invalid" || metadata.devMock || window.self !== window.top ||
          metadata.sessionId !== this.sessionId) throw safeError();
      const auth = getFirebaseAuth();
      if (token) await signInWithCustomToken(auth, token);
      else await auth.authStateReady();
      const user = auth.currentUser;
      if (!user || this.lifetime.signal.aborted) throw safeError();
      const result = await getIdTokenResult(user);
      this.expected = tuple(user.uid, result.claims);
      if (result.claims.sessionId !== this.sessionId || auth.currentUser !== user) throw safeError();
      this.scopeHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(this.expected))))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      await this.identity();
      this.unsubscribeAuth = onIdTokenChanged(auth, (current) => {
        if (!current || current.uid !== user.uid) this.invalidate("identity_changed");
        else void this.identity().catch(() => this.invalidate("identity_changed"));
      });
      const record = readOwnerRecord(sessionStorage.getItem(OWNER_STORAGE_KEY), this.scopeHash);
      if (!record) sessionStorage.removeItem(OWNER_STORAGE_KEY);
      const pending = {proof: proof(), commandId: crypto.randomUUID()};
      let headers: Record<string, string> = {};
      if (token) command = {operation: "launch", commandId: pending.commandId, nextOwnerProof: pending.proof, token};
      else {
        if (!record) throw safeError();
        const source = recoverySource(record);
        headers = {"X-Parabolic-Exam-Owner": source.proof};
        command = {operation: "recover", commandId: pending.commandId, nextOwnerProof: pending.proof, previous: source.previous};
      }
      this.store({scopeHash: this.scopeHash, ...(record?.current ? {current: record.current} : {}), pending});
      const sentAt = performance.now();
      const value = await this.command(command, headers);
      if (!value || typeof value !== "object" || !("operation" in value) || value.operation !== command.operation ||
          !("ownership" in value) || !("entry" in value)) throw safeError();
      const lease = readLease(value.ownership);
      const responseBody = adaptExamSessionEntryResult(value.entry);
      if (responseBody.sessionId !== this.sessionId || responseBody.studentId !== result.claims.studentId ||
          responseBody.instituteId !== result.claims.instituteId || responseBody.yearId !== result.claims.yearId ||
          responseBody.runId !== result.claims.runId) throw safeError();
      await this.identity();
      this.owner = {proof: pending.proof, generation: lease.generation};
      this.store({scopeHash: this.scopeHash, current: this.owner});
      this.install(lease, sentAt);
      this.publish("active");
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel("parabolic.exam.runtimeOwner.v2");
        this.channel.onmessage = (event: MessageEvent<unknown>) => {
          const v = event.data as {sessionId?: unknown; generation?: unknown} | null;
          if (v && v.sessionId === this.sessionId && Number.isSafeInteger(v.generation) &&
              Number(v.generation) > (this.owner?.generation ?? 0)) this.invalidate("ownership_lost");
        };
        this.channel.postMessage({sessionId: this.sessionId, generation: this.owner.generation});
      }
      return {idToken: result.token, responseBody};
    } catch {
      this.invalidate("entry_denied"); throw safeError();
    } finally {
      token = null;
      if (command?.operation === "launch") command.token = "";
      if (command?.operation === "launch" || command?.operation === "recover") command.nextOwnerProof = "";
    }
  }
  start() { return this.startPromise ??= this.initialize(); }
  private headers(owner: Owner) {
    return {"X-Parabolic-Exam-Owner": owner.proof, "X-Parabolic-Exam-Generation": String(owner.generation)};
  }
  private async renew() {
    if (!this.isCurrent() || this.state.phase !== "active" || !this.owner) return;
    if (!this.renewCommand) {
      this.renewCommand = {operation: "renew", commandId: crypto.randomUUID()};
      this.renewSentAt = performance.now();
    }
    try {
      const value = await this.command(this.renewCommand, this.headers(this.owner));
      if (!value || typeof value !== "object" || !("operation" in value) || value.operation !== "renew" || !("ownership" in value)) throw safeError();
      const lease = readLease(value.ownership);
      if (lease.generation !== this.owner.generation || !this.isCurrent()) throw safeError();
      this.install(lease, this.renewSentAt); this.renewCommand = undefined;
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 0 || error.status >= 500) && this.isCurrent()) {
        this.renewTimer = window.setTimeout(() => void this.renew(), 5000);
      } else this.invalidate("ownership_lost");
    }
  }
  async post<T, B>(path: string, options: Omit<ApiClientRequestOptions<B>, "method"> = {}): Promise<T> {
    const allowed = ["activate", "answers", "submit", "integrity-events"].map((action) => `/exam/session/${encodeURIComponent(this.sessionId)}/${action}`);
    const owner = this.owner;
    if (!allowed.includes(path) || options.query || !owner || !this.isCurrent() ||
        (this.state.phase === "closed" && !path.endsWith("/submit"))) throw safeError();
    const validate = (token: string | null) => {
      this.validateToken(token);
      if (!this.isCurrent() || this.owner !== owner) throw safeError();
    };
    try {
      await this.identity();
      const value = await launchApiClient.request<T, B>(path, {...options, method: "POST",
        headers: {...this.headers(owner)}, signal: options.signal ? AbortSignal.any([options.signal, this.lifetime.signal]) : this.lifetime.signal,
        retry: {maxAttempts: 1}, validateAuthToken: validate, handledFailureIsReady: true});
      validate((await this.identity()).token);
      if (path.endsWith("/submit")) {
        adaptExamSubmitResult(value);
        window.clearTimeout(this.expiryTimer); window.clearTimeout(this.renewTimer);
        this.publish("closed");
      }
      return value;
    } catch (error) {
      if ((!(error instanceof ApiClientError) && !path.endsWith("/integrity-events")) || (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) ||
          ["ownership_lost", "invalid_owner", "entry_not_consumed", "ownership_upgrade_required", ...(path.endsWith("/integrity-events") ? [] : ["session_closed"])].includes(
            String(((error as ApiClientError).details as {reason?: unknown} | undefined)?.reason))) this.invalidate("ownership_lost");
      throw error;
    }
  }
  async signOut() {
    window.clearTimeout(this.renewTimer);
    await this.identity();
    if (this.owner && this.state.phase === "active" && this.isCurrent()) {
      try { await this.command({operation: "release", commandId: crypto.randomUUID()}, this.headers(this.owner)); }
      catch { /* Expiry/server fencing remains authoritative if release fails. */ }
    }
    await this.identity();
    const record = readOwnerRecord(sessionStorage.getItem(OWNER_STORAGE_KEY), this.scopeHash);
    if (!record?.pending && record?.current?.proof === this.owner?.proof &&
        record?.current?.generation === this.owner?.generation) sessionStorage.removeItem(OWNER_STORAGE_KEY);
    this.invalidate("signed_out");
    await signOut(getFirebaseAuth());
  }
}
const instances = new Map<string, ExamRuntimeOwnership>();
export function getExamRuntimeOwnership(sessionId: string) {
  let instance = instances.get(sessionId);
  if (!instance) { instance = new ExamRuntimeOwnership(sessionId); instances.set(sessionId, instance); }
  return instance;
}
