import { useCallback, useEffect, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import type { VendorAuditEventsQuery } from "../../../../../shared/contracts/vendorAuditHealth";
import { auditHealthFailure, vendorAuditHealthApi, type AuditHealthFailure } from "./vendorAuditHealthApi";

type State<T> = { key: string; loading: boolean; data: T | null; failure: AuditHealthFailure | null };
function useAuthority<T>(queryKey: string, load: (signal: AbortSignal) => Promise<T>, enabled: boolean) {
  const { session } = useAuthProvider();
  const [attempt, setAttempt] = useState(0);
  const ready = enabled && session.status === "authenticated";
  // Identity and current token changes immediately hide prior-session data.
  // This key stays in memory and is never rendered, logged or persisted.
  const key = JSON.stringify([session.user?.uid, session.status, session.idToken, queryKey, attempt, ready]);
  const [state, setState] = useState<State<T>>({ key: "", loading: true, data: null, failure: null });
  useEffect(() => {
    const controller = new AbortController();
    if (!ready) return () => controller.abort();
    const run = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setState({ key, loading: true, data: null, failure: null });
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted) setState({ key, loading: false, data, failure: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, loading: false, data: null, failure: auditHealthFailure(error) });
      }
    };
    void run();
    return () => controller.abort();
  }, [key, ready, load]);
  const visible = ready && state.key === key ? state : { key, loading: ready, data: null, failure: null };
  return { loading: visible.loading, data: visible.data, failure: visible.failure,
    retry: () => setAttempt(value => value + 1) };
}
export function useVendorAudit(query: VendorAuditEventsQuery = {}, enabled = true) {
  const queryKey = JSON.stringify(query);
  const load = useCallback((signal: AbortSignal) => vendorAuditHealthApi.audit(JSON.parse(queryKey) as VendorAuditEventsQuery, signal), [queryKey]);
  return useAuthority(queryKey, load, enabled);
}
export function useVendorSystemHealth() {
  const load = useCallback((signal: AbortSignal) => vendorAuditHealthApi.health(signal), []);
  return useAuthority("health", load, true);
}
