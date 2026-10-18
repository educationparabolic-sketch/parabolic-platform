import {useLayoutEffect, useRef, useState, type ReactNode} from "react";
import {ApiClientError} from "../../../../shared/services/apiClient";
import type {StudentProfileResult, StudentIdentityPhotoEnrollRequest, StudentProfilePreferencesRequest,
  StudentIdentityPhotoWithdrawRequest, StudentIdentityPhotoLifecycleResult} from "../../../../shared/contracts/studentProfile";
import {StudentProfileContext, purgeLegacyStudentStorage} from "./studentProfileContext";
import {studentProfileApi as api} from "./studentProfileApi";

type Command = {kind: "preferences"; body: StudentProfilePreferencesRequest} |
  {kind: "enroll"; body: StudentIdentityPhotoEnrollRequest} | {kind: "withdraw"; body: StudentIdentityPhotoWithdrawRequest};
export default function StudentProfileProvider({uid, restricted, children}: {uid: string | null; restricted: boolean; children: ReactNode}) {
  const [profile, setProfile] = useState<StudentProfileResult | null>(null);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Command["kind"] | null>(null);
  const [privacyAvailable, setPrivacyAvailable] = useState(false);
  const [canCheckDeletion, setCanCheckDeletion] = useState(false);
  const [lifecycle, setLifecycle] = useState<StudentIdentityPhotoLifecycleResult | null>(null);
  const known = useRef<{version: number; photoId: string | null} | null>(null);
  const command = useRef<Command | null>(null);
  const deletionId = useRef<string | null>(null);
  const epoch = useRef(Symbol());
  const working = useRef(false);
  const latestRead = useRef(Symbol());
  const controllers = useRef(new Set<AbortController>());
  const enabled = useRef({uid, restricted});
  function controller() { const next = new AbortController(); controllers.current.add(next); return next; }
  function message(failure: unknown) {
    return failure instanceof ApiClientError ? `Request unavailable (${failure.code}). Reload current status or retry the original request.` :
      "Unable to confirm the server result. Reload current status or retry the original request.";
  }
  async function read(signal: AbortSignal, stamp: symbol) {
    const readStamp = Symbol(); latestRead.current = readStamp;
    setLoading(true);
    try {
      const current = await api.profile(signal);
      if (signal.aborted || epoch.current !== stamp || latestRead.current !== readStamp) return;
      if (current.studentId !== uid) throw new Error("Profile owner does not match the signed-in Student.");
      known.current = {version: current.version, photoId: current.identityPhoto.photo?.photoId ?? null};
      setProfile(current); setPrivacyAvailable(true); setError(null);
    } catch (failure) {
      if (!signal.aborted && epoch.current === stamp && latestRead.current === readStamp) throw failure;
    } finally {
      if (!signal.aborted && epoch.current === stamp && latestRead.current === readStamp) setLoading(false);
    }
  }
  useLayoutEffect(() => {
    enabled.current = {uid, restricted};
    setProfile(null); setLoading(Boolean(uid) && !restricted); setBusy(false);
    working.current = false;
    if (restricted && command.current?.kind !== "withdraw") { command.current = null; setPending(null); }
    purgeLegacyStudentStorage();
    epoch.current = Symbol();
    const stamp = epoch.current;
    const readController = new AbortController();
    const activeControllers = controllers.current;
    activeControllers.add(readController);
    if (uid && !restricted) {
      void read(readController.signal, stamp).catch((failure: unknown) => {
        if (!readController.signal.aborted && epoch.current === stamp) { setProfile(null); setError(message(failure)); }
      });
    }
    return () => {
      epoch.current = Symbol();
      for (const item of activeControllers) item.abort();
      activeControllers.clear();
    };
    // Provider is keyed by authenticated UID/tenant/role. Restriction changes hide
    // public state immediately, while retaining only known version/pointer for privacy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, restricted]);
  async function reload() {
    if (!uid || restricted || working.current) return;
    const next = controller(); const stamp = epoch.current;
    setLoading(true); setProfile(null);
    try { await read(next.signal, stamp); }
    catch (failure) { if (!next.signal.aborted && epoch.current === stamp) setError(message(failure)); }
    finally { controllers.current.delete(next); }
  }
  async function execute(next: Command) {
    if (!uid || working.current || (restricted && next.kind !== "withdraw")) return;
    latestRead.current = Symbol(); setLoading(false);
    working.current = true; command.current = next; setBusy(true); setPending(next.kind);
    setNotice(null); setError(null); setProfile(null);
    const request = controller(); const stamp = epoch.current;
    try {
      if (next.kind === "preferences") await api.preferences(next.body, request.signal);
      else if (next.kind === "enroll") await api.enroll(next.body, request.signal);
      else {
        const receipt = await api.withdraw(next.body, request.signal);
        if (epoch.current === stamp && !request.signal.aborted) {
          deletionId.current = receipt.photoId; setCanCheckDeletion(Boolean(receipt.photoId)); setPrivacyAvailable(true);
          known.current = {version: receipt.version, photoId: null};
          setLifecycle(null);
        }
      }
      if (request.signal.aborted || epoch.current !== stamp) return;
      command.current = null; setPending(null);
      setNotice(next.kind === "withdraw" ? "Consent withdrawn; media access revoked. Physical deletion is not yet confirmed." :
        "Command acknowledged. Current status is reloaded from the server.");
      if (!enabled.current.restricted) await read(request.signal, stamp);
    } catch (failure) {
      if (request.signal.aborted || epoch.current !== stamp) return;
      setError(message(failure));
      if (failure instanceof ApiClientError && [400, 401, 403, 404, 409].includes(failure.status)) {
        command.current = null; setPending(null);
        if (!enabled.current.restricted) {
          try { await read(request.signal, stamp); } catch { /* Retain unavailable state, never previous media. */ }
        }
      }
    } finally {
      controllers.current.delete(request);
      if (!request.signal.aborted && epoch.current === stamp) { working.current = false; setBusy(false); }
    }
  }
  async function checkDeletion() {
    if (!deletionId.current || working.current) return;
    const request = controller(); const stamp = epoch.current;
    try {
      const value = await api.lifecycle(deletionId.current, request.signal);
      if (!request.signal.aborted && epoch.current === stamp) setLifecycle(value);
    } catch (failure) { if (!request.signal.aborted && epoch.current === stamp) setError(message(failure)); }
    finally { controllers.current.delete(request); }
  }
  return <StudentProfileContext.Provider value={{
    profile: restricted ? null : profile, loading: !restricted && loading, error, notice, busy, pending, restricted,
    privacyAvailable, canCheckDeletion, lifecycle, reload, checkDeletion,
    preferences: async (collapsed) => {
      if (!profile || command.current || restricted) return;
      await execute({kind: "preferences", body: {expectedVersion: profile.version, idempotencyKey: crypto.randomUUID(), preferences: {sidebarCollapsed: collapsed}}});
    },
    enroll: async (contentBase64) => {
      if (!profile || command.current || restricted) return;
      await execute({kind: "enroll", body: {expectedVersion: profile.version, expectedPhotoId: profile.identityPhoto.photo?.photoId ?? null,
        idempotencyKey: crypto.randomUUID(), consent: {accepted: true, policyVersion: profile.photoPolicy.policyVersion}, mediaType: "image/jpeg", contentBase64}});
    },
    withdraw: async () => {
      if (!known.current || command.current) return;
      await execute({kind: "withdraw", body: {expectedVersion: known.current.version, expectedPhotoId: known.current.photoId, idempotencyKey: crypto.randomUUID()}});
    },
    retry: async () => { if (command.current) await execute(command.current); },
  }}>{children}</StudentProfileContext.Provider>;
}
