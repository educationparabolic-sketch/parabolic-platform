import type {SessionRecoverySnapshot} from "./answerRecovery";

export type StorageResult = {state: "ok"; value?: unknown} | {state: "memory_only"; reason: string; superseded?: true};
const unavailable = (reason = "Browser storage is unavailable. Unacknowledged edits remain in memory and may be lost on reload."): StorageResult => ({state: "memory_only", reason});

/** One document/scope writer. Transactions serialize, obsolete saves coalesce, clear fences late saves. */
export class RecoveryStorage {
  private tail: Promise<unknown> = Promise.resolve();
  private serial = 0;
  private closed = false;
  private sessionId: string;
  private scopeHash: string;
  private generation: number;
  private current: () => boolean;
  private factory: IDBFactory | undefined;
  private timeoutMs: number;
  constructor(sessionId: string, scopeHash: string, generation: number,
    current: () => boolean, factory?: IDBFactory, timeoutMs = 2000) {
    this.sessionId = sessionId; this.scopeHash = scopeHash; this.generation = generation;
    this.current = current; this.timeoutMs = timeoutMs;
    try {this.factory = factory ?? globalThis.indexedDB;} catch {this.factory = undefined;}
  }

  private transaction(action: "read" | "save" | "clear" | "discard", snapshot?: SessionRecoverySnapshot, legacyOwnerId?: string): Promise<StorageResult> {
    return new Promise(resolve => {
      let db: IDBDatabase | undefined, tx: IDBTransaction | undefined, finished = false, value: unknown;
      const finish = (result: StorageResult) => {
        if (finished) return;
        finished = true; clearTimeout(timer); db?.close(); resolve(result);
      };
      const abort = () => {try {tx?.abort();} catch { /* Already settled. */ }};
      const timer = setTimeout(() => {finish(unavailable("Browser storage did not settle within 2 seconds. Pending edits may be lost on reload.")); abort();}, this.timeoutMs);
      try {
        if (!this.factory || !this.current()) {finish(unavailable()); return;}
        const open = this.factory.open("parabolic-exam-runtime", 1);
        open.onerror = () => finish(unavailable()); open.onblocked = () => finish(unavailable("Browser storage is blocked. Pending edits are only in memory."));
        open.onupgradeneeded = () => {
          if (finished) {open.transaction?.abort(); return;}
          if (!open.result.objectStoreNames.contains("sessionRecovery")) open.result.createObjectStore("sessionRecovery", {keyPath: "sessionId"});
        };
        open.onsuccess = () => {
          db = open.result;
          if (finished || !this.current()) {db.close(); finish(unavailable()); return;}
          db.onversionchange = () => {finish(unavailable()); abort();};
          try {
            tx = db.transaction("sessionRecovery", action === "read" ? "readonly" : "readwrite");
            tx.onerror = () => finish(unavailable()); tx.onabort = () => finish(unavailable());
            tx.oncomplete = () => finish(this.current() ? {state: "ok", value} : unavailable());
            const store = tx.objectStore("sessionRecovery"), read = store.get(this.sessionId);
            read.onerror = () => {finish(unavailable()); abort();};
            read.onsuccess = () => {
              try {
                value = read.result;
                const row = read.result as {scopeHash?: unknown; runtimeGeneration?: unknown; schemaVersion?: unknown; ownerId?: unknown; sessionId?: unknown; closed?: unknown} | undefined;
                const owned = row?.scopeHash === this.scopeHash && Number.isSafeInteger(row.runtimeGeneration) &&
                  Number(row.runtimeGeneration) > 0 && Number(row.runtimeGeneration) <= this.generation;
                if (action === "read") {
                  if (owned && row?.closed === true && row.schemaVersion === 3 && row.sessionId === this.sessionId &&
                      Object.keys(row).length === 5) value = undefined;
                  return;
                }
                const legacy = action === "discard" && row?.schemaVersion === 2 && row?.scopeHash === undefined &&
                  (row.runtimeGeneration === undefined || (Number.isSafeInteger(row.runtimeGeneration) && Number(row.runtimeGeneration) <= this.generation)) &&
                  row?.ownerId === legacyOwnerId && !!legacyOwnerId;
                if (!this.current() || (row && !owned && !legacy)) {finish(unavailable("A different, future or unsupported recovery record was preserved. Server answers are available; local edits are not adopted.")); abort(); return;}
                if (row?.closed === true && action !== "clear") {
                  finish(unavailable("This recovery scope is closed. Late local writes cannot recreate submitted answers.")); abort(); return;
                }
                if (action === "save") store.put(snapshot);
                else if (action === "clear") store.put({schemaVersion: 3, sessionId: this.sessionId,
                  scopeHash: this.scopeHash, runtimeGeneration: this.generation, closed: true});
                else store.delete(this.sessionId);
              } catch {finish(unavailable()); abort();}
            };
          } catch {finish(unavailable()); abort();}
        };
      } catch {finish(unavailable()); abort();}
    });
  }
  private enqueue(action: () => Promise<StorageResult>) {
    const next = this.tail.then(action, action); this.tail = next; return next;
  }
  read() {return this.enqueue(() => this.transaction("read"));}
  save(snapshot: SessionRecoverySnapshot) {
    const serial = ++this.serial;
    // Capture now; React or a later edit cannot mutate an enqueued payload.
    const copy = structuredClone(snapshot);
    return this.enqueue(() => this.closed || serial !== this.serial
      ? Promise.resolve<StorageResult>({state: "memory_only", reason: "A newer snapshot superseded this save.", superseded: true})
      : this.transaction("save", copy));
  }
  discard(legacyOwnerId: string) {++this.serial; return this.enqueue(() => this.transaction("discard", undefined, legacyOwnerId));}
  clear() {this.closed = true; ++this.serial; return this.enqueue(() => this.transaction("clear"));}
}
