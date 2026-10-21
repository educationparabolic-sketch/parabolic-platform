import { useEffect, useRef, useState, type ReactNode } from "react";
import {resultReadiness} from "./studentResultRecovery";
import { useAuthProvider } from "../../../../shared/services/authProvider";

/** One visible read cycle per identity/manual refresh; late reads cannot repopulate it. */
export default function StudentSummaryRead<T>({load, label, children}: {
  load: () => Promise<T>; label: string; children: (data: T) => ReactNode;
}) {
  const {session} = useAuthProvider();
  const [generation, setGeneration] = useState(0);
  const key = `${session.idToken ?? ""}:${generation}`;
  const cycle = `${session.user?.uid ?? "local"}:${generation}`;
  const budgetRef = useRef<{cycle: string; attempts: number; nextReadAt: number; error?: string} | null>(null);
  const [state, setState] = useState<{key: string; data?: T; error?: string; exhausted?: boolean}>({key: ""});
  useEffect(() => {
    let active = true, inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (session.status !== "authenticated") {budgetRef.current = null; return;}
    const budget = budgetRef.current?.cycle === cycle ? budgetRef.current : {cycle, attempts: 0, nextReadAt: 0};
    budgetRef.current = budget;
    if (budget.error) {setState({key, error: budget.error}); return;}
    if (budget.attempts >= 6) {setState({key, exhausted: true}); return;}
    const read = async () => {
      if (!active || budget.error || inFlight || document.visibilityState === "hidden" || budget.attempts >= 6) return;
      if (performance.now() < budget.nextReadAt) {timer = setTimeout(() => void read(), budget.nextReadAt - performance.now()); return;}
      inFlight = true; budget.attempts++; budget.nextReadAt = performance.now() + 2000;
      try {
        const data = await load();
        if (!active) return;
        const readiness = resultReadiness(data);
        // History/solution reads keep their existing refresh behavior.
        if (!readiness) {budget.attempts = 0; budget.nextReadAt = 0;}
        setState({key, data});
        if (readiness && readiness.state !== "available" && budget.attempts < 6) {
          budget.nextReadAt = performance.now() + 2000;
          timer = setTimeout(() => void read(), 2000);
        }
      } catch (error: unknown) {
        if (active) {
          budget.error = error instanceof Error ? error.message : `${label} is unavailable.`;
          setState({key, error: budget.error});
        }
      } finally {inFlight = false;}
    };
    const resume = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") void read();
    };
    void read();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {active = false; clearTimeout(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume);};
  }, [key, cycle, session.status, load, label]);
  const current = state.key === key && session.status === "authenticated" ? state : null;
  return <>
    <button type="button" onClick={() => setGeneration((value) => value + 1)}>Refresh {label}</button>
    {current?.exhausted ? <p role="status">Results not confirmed yet. Refresh to check again; any committed exam submission remains committed.</p> : current?.error ? <section role="alert"><p>{label} could not be loaded. {current.error}</p>
      <button type="button" onClick={() => setGeneration((value) => value + 1)}>Try again</button></section> :
      current?.data !== undefined ? <>{resultReadiness(current.data)?.state !== undefined && resultReadiness(current.data)?.state !== "available" ? <p role="status">Results not confirmed yet. Reflective metrics are unavailable. Refresh to check again; any committed exam submission remains committed.</p> : null}{children(current.data)}</> : <p role="status">Loading {label}...</p>}
  </>;
}
