import { getFirebaseAuth } from "../../../../../shared/services/firebaseClient";
import { ApiClientError } from "../../../../../shared/services/apiClient";

type Call = { version: 1; family: string; method: string; args: unknown[] };
type Transport = Record<string, (...args: never[]) => Promise<unknown>>;
type Registration = { transport: Transport; methods: readonly string[]; reload: (call: Call, receipt: unknown) => Promise<unknown> };
const registrations = new Map<string, Registration>();
const active = new Set<string>();
const listeners = new Set<() => void>();
const receipts = new Map<string, { value: unknown; call: Call; at: number }>();
const trustedPending = new Map<string, string>();
const key = (uid: string) => `vendor-command-recovery-v1:${uid}`;
const providerKey = (uid: string) => `vendor-provider-recovery-v1:${uid}`;
const notify = () => listeners.forEach(listener => listener());
const actor = () => {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error("A current Vendor session is required.");
  return uid;
};

function parse(value: unknown): Call {
  if (JSON.stringify(value).length > 16384) throw new Error("Captured intent exceeds the supported recovery size.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid recovery data.");
  const call = value as Call;
  if (Object.keys(call).sort().join(",") !== "args,family,method,version" || call.version !== 1 ||
      !registrations.get(call.family)?.methods.includes(call.method) || !Array.isArray(call.args) ||
      call.args.length < 1 || call.args.length > 3) throw new Error("Invalid recovery data.");
  const intent = call.args.at(-1);
  if (!intent || typeof intent !== "object" || Array.isArray(intent) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(String((intent as Record<string, unknown>).idempotencyKey)) ||
      call.args.slice(0, -1).some(target => typeof target !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(target))) {
    throw new Error("Invalid captured command. No command was sent.");
  }
  const arity = registrations.get(call.family)!.transport[call.method].length;
  if (call.args.length !== arity) throw new Error("Invalid command target count.");
  return call;
}

function read(uid: string): Call | null {
  const stored = window.sessionStorage.getItem(key(uid));
  if (!stored) return null;
  if (stored.length > 16384) throw new Error("Invalid recovery data.");
  return parse(JSON.parse(stored));
}

function providerCalls(uid: string): Call[] {
  const stored = window.sessionStorage.getItem(providerKey(uid));
  if (!stored) return [];
  if (stored.length > 327680) throw new Error("Invalid provider recovery data.");
  const values: unknown = JSON.parse(stored);
  if (!Array.isArray(values) || values.length > 20) throw new Error("Invalid provider recovery data.");
  return values.map(parse);
}
function updateProviderCalls(uid: string, call: Call, keep: boolean): void {
  const next = providerCalls(uid).filter(existing => business(existing) !== business(call));
  if (keep) next.push(call);
  if (next.length > 20) throw new Error("Provider recovery capacity reached. Reconcile existing captured commands first.");
  if (next.length) window.sessionStorage.setItem(providerKey(uid), JSON.stringify(next));
  else window.sessionStorage.removeItem(providerKey(uid));
}

// Generated metadata is retained from the first dispatch; changed business intent cannot reuse it.
function business(call: Call): string {
  const intent = { ...(call.args.at(-1) as Record<string, unknown>) };
  for (const field of ["idempotencyKey", "expectedRevision", "expectedCatalogRevision", "expectedPlanRevision", "expectedOfflinePaymentRevision", "expectedOnboardingRevision", "occurredAt"]) delete intent[field];
  return JSON.stringify([call.family, call.method, call.args.slice(0, -1), intent]);
}

async function execute(uid: string, call: Call, priorAttempt: boolean): Promise<unknown> {
  if (actor() !== uid) throw new Error("Vendor session changed. Reload authority.");
  if (active.has(uid)) throw new Error("A captured Vendor command is already in flight.");
  active.add(uid);
  receipts.delete(uid);
  notify();
  let committed = false;
  try {
    const registration = registrations.get(call.family)!;
    const receipt = await registration.transport[call.method](...call.args as never[]);
    committed = true;
    if (actor() !== uid) throw new Error("Vendor session changed during the command; completion requires recovery.");
    receipts.set(uid, { value: receipt, call, at: Date.now() });
    await registration.reload(call, receipt);
    const record = receipt as Record<string, unknown>;
    const provider = record.providerOperation as { state?: string } | null | undefined;
    // A validated failure plus a successful owning read is known business authority.
    // Preserve its exact provider retry separately; unrelated targets may continue.
    updateProviderCalls(uid, call, record.deliveryState === "failed_retryable" || provider?.state === "failed_retryable");
    window.sessionStorage.removeItem(key(uid));
    trustedPending.delete(uid);
    return receipt;
  } catch (error) {
    // Only definitive rejection of a first attempt permits new intent. Denying a later retry cannot disprove an earlier commit.
    if (!committed && !priorAttempt && error instanceof ApiClientError && [400, 401, 403, 404, 409, 422].includes(error.status)) {
      window.sessionStorage.removeItem(key(uid));
      trustedPending.delete(uid);
      updateProviderCalls(uid, call, false);
    }
    throw error;
  } finally {
    active.delete(uid);
    notify();
  }
}

export function withVendorCommandRecovery<T extends object>(family: string, transport: T, methods: readonly (keyof T & string)[], reload: Registration["reload"]): T {
  registrations.set(family, { transport: transport as unknown as Transport, methods, reload });
  const wrapped = { ...transport } as Record<string, unknown>;
  for (const method of methods) wrapped[method] = async (...args: unknown[]) => {
    const uid = actor();
    const proposed = parse(JSON.parse(JSON.stringify({ version: 1, family, method, args })));
    const pending = read(uid);
    const known = providerCalls(uid).find(existing => business(existing) === business(proposed));
    if (!pending && known) throw new Error("This provider intent has a captured retry. Review it before repeating the command.");
    if (pending && trustedPending.get(uid) !== JSON.stringify(pending)) throw new Error("Stored recovery intent requires explicit review before replay. No new command was sent.");
    if (pending && business(pending) !== business(proposed)) throw new Error("An unresolved command has different intent. Review and retry the captured command before starting another.");
    const call = pending ?? proposed;
    // Storage failure blocks dispatch; recovery is never silently downgraded to a fresh UUID.
    window.sessionStorage.setItem(key(uid), JSON.stringify(call));
    trustedPending.set(uid, JSON.stringify(call));
    return execute(uid, call, Boolean(pending));
  };
  return wrapped as T;
}

export function subscribeVendorRecovery(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function vendorRecoveryState(uid: string) {
  try { const pending = read(uid), calls = pending ? [pending] : providerCalls(uid); return { call: calls[0] ?? null, calls, uncertain: Boolean(pending), invalid: false, busy: active.has(uid), receipt: receipts.get(uid) }; }
  catch { return { call: null, calls: [], uncertain: false, invalid: true, busy: active.has(uid), receipt: undefined }; }
}
export async function retryVendorRecovery(uid: string, reviewed: string): Promise<void> {
  const pending = read(uid);
  const call = pending ?? providerCalls(uid).find(existing => JSON.stringify(existing) === reviewed);
  if (!call) throw new Error("No captured command is available.");
  if (JSON.stringify(call) !== reviewed) throw new Error("Captured intent changed. Review the current targets and intent again.");
  if (!pending) window.sessionStorage.setItem(key(uid), JSON.stringify(call));
  await execute(uid, call, true);
}
export function removeInvalidVendorRecovery(uid: string): void {
  try { read(uid); } catch { window.sessionStorage.removeItem(key(uid)); notify(); return; }
  try { providerCalls(uid); } catch { window.sessionStorage.removeItem(providerKey(uid)); notify(); return; }
  throw new Error("Valid unresolved commands cannot be discarded.");
}
