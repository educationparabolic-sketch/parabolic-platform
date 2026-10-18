import { useEffect, useState, type ReactNode } from "react";
import { useAuthProvider } from "../../../../shared/services/authProvider";

/** Each token/retry/foreground transition discards prior data; late reads cannot repopulate it. */
export default function StudentSummaryRead<T>({load, label, children}: {
  load: () => Promise<T>; label: string; children: (data: T) => ReactNode;
}) {
  const {session} = useAuthProvider();
  const [generation, setGeneration] = useState(0);
  const key = `${session.idToken ?? ""}:${generation}`;
  const [state, setState] = useState<{key: string; data?: T; error?: string}>({key: ""});
  useEffect(() => {
    let active = true;
    if (session.status !== "authenticated") return;
    void load().then((data) => {
      if (active) setState({key, data});
    }).catch((error: unknown) => {
      if (active) setState({key, error: error instanceof Error ? error.message : `${label} is unavailable.`});
    });
    return () => { active = false; };
  }, [key, session.status, load, label]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setGeneration((value) => value + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const current = state.key === key && session.status === "authenticated" ? state : null;
  return <>
    <button type="button" onClick={() => setGeneration((value) => value + 1)}>Refresh {label}</button>
    {current?.error ? <section role="alert"><p>{label} could not be loaded. {current.error}</p>
      <button type="button" onClick={() => setGeneration((value) => value + 1)}>Try again</button></section> :
      current?.data !== undefined ? children(current.data) : <p role="status">Loading {label}...</p>}
  </>;
}
