import { useEffect, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { shouldUseLiveApi } from "../../services/frontendEnvironment";
import {
  getFrontendDataStateSnapshot,
  releaseFrontendDataStateIfIdle,
  resetFrontendDataState,
  subscribeToFrontendDataState,
  type FrontendDataStateKind,
} from "../../services/frontendDataState";

interface UiDataStateBoundaryProps {
  children: ReactNode;
  label: string;
}

const STATE_COPY: Record<
  Exclude<FrontendDataStateKind, "ready">,
  { eyebrow: string; title: string; description: string }
> = {
  loading: {
    eyebrow: "Loading",
    title: "Loading authoritative data",
    description: "This view will open after its current data request completes.",
  },
  empty: {
    eyebrow: "Empty",
    title: "No records available",
    description: "The request succeeded, but no authoritative records are available for this view.",
  },
  unavailable: {
    eyebrow: "Unavailable",
    title: "Authoritative data is unavailable",
    description: "The request could not be completed. Fixture data has not been substituted.",
  },
  permission: {
    eyebrow: "Permission required",
    title: "You cannot access this data",
    description: "Your current account, tenant, or license does not permit this request.",
  },
  validation: {
    eyebrow: "Validation failed",
    title: "The response could not be validated",
    description:
      "The server response did not satisfy the required contract. No fallback data is shown.",
  },
};

function UiDataStateBoundary({ children, label }: UiDataStateBoundaryProps) {
  const snapshot = useSyncExternalStore(
    subscribeToFrontendDataState,
    getFrontendDataStateSnapshot,
    getFrontendDataStateSnapshot,
  );
  const liveMode = shouldUseLiveApi();

  useLayoutEffect(() => {
    if (liveMode) {
      resetFrontendDataState();
    }
  }, [label, liveMode]);

  useEffect(() => {
    if (!liveMode) {
      return undefined;
    }

    const timeoutId = window.setTimeout(releaseFrontendDataStateIfIdle, 0);
    return () => window.clearTimeout(timeoutId);
  }, [label, liveMode]);

  if (!liveMode || snapshot.kind === "ready") {
    return children;
  }

  const copy = STATE_COPY[snapshot.kind];
  const canRetry = snapshot.kind !== "loading";

  return (
    <main className="ui-data-state-shell">
      <section
        className={`ui-data-state-card ui-data-state-card-${snapshot.kind}`}
        aria-busy={snapshot.kind === "loading"}
        aria-live={snapshot.kind === "loading" ? "polite" : "assertive"}
        role={snapshot.kind === "loading" ? "status" : "alert"}
      >
        <p className="ui-data-state-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
        <p className="ui-data-state-context">View: {label}</p>
        {snapshot.message ? <p className="ui-data-state-message">{snapshot.message}</p> : null}
        {canRetry ? (
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        ) : null}
      </section>
    </main>
  );
}

export default UiDataStateBoundary;
export type { UiDataStateBoundaryProps };
