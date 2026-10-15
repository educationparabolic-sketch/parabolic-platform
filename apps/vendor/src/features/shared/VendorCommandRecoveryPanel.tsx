import { resolveVendorAccessContext } from "../../portals/vendorAccess";
import { useEffect, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { removeInvalidVendorRecovery, retryVendorRecovery, subscribeVendorRecovery, vendorRecoveryState } from "./vendorCommandRecovery";
// Register only the existing strict transports. Stored data cannot choose a URL or executable function.
import "../institutes/vendorInstitutesApi";
import "../licensing/vendorCommercialApi";

export default function VendorCommandRecoveryPanel() {
  const { session } = useAuthProvider();
  const uid = session.user?.uid ?? "";
  const access = resolveVendorAccessContext(session);
  const [, refresh] = useState(0);
  const [reviewedIntent, setReviewedIntent] = useState("");
  const [selectedIntent, setSelectedIntent] = useState("");
  const [failure, setFailure] = useState("");
  const [openedAt] = useState(() => Date.now());
  useEffect(() => subscribeVendorRecovery(() => refresh(value => value + 1)), []);
  const state = vendorRecoveryState(uid);
  const call = state.calls.find(capture => JSON.stringify(capture) === selectedIntent) ?? state.call;
  const reviewed = reviewedIntent === JSON.stringify(call);
  if (!uid) return null;
  const value = state.receipt && state.receipt.at >= openedAt ? state.receipt.value : null;
  const receipt = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const propagation = receipt?.propagation as { state?: string } | undefined;
  const deletion = receipt?.deletion as { stage?: string } | undefined;
  const retryCaptured = () => {
    setFailure("");
    void retryVendorRecovery(uid, JSON.stringify(call)).then(() => {
      if (vendorRecoveryState(uid).calls.some(capture => JSON.stringify(capture) === JSON.stringify(call))) throw new Error("The server still reports incomplete provider or delivery work. Recovery remains available.");
      window.location.reload();
    }).catch(error => setFailure(error instanceof Error ? error.message : "Recovery remains unresolved."));
  };
  return <>
    {receipt && <aside aria-label="Last server command receipt">
      {state.receipt?.call.args.slice(0, -1).length !== 0 && <p>Captured targets: {state.receipt?.call.args.slice(0, -1).map(String).join(" / ")}.</p>}
      {typeof receipt.instituteId === "string" && <p>Target institute: {receipt.instituteId}.</p>}
      <p>Server command persisted. This receipt does not guarantee downstream completion.</p>
      {typeof receipt.propagationState === "string" && <p>Claim propagation: {receipt.propagationState === "pending_bwm_036" ? "completion unavailable in this commercial receipt" : receipt.propagationState}{propagation?.state ? ` (${propagation.state})` : ""}.</p>}
      {typeof receipt.deliveryState === "string" && <p>Delivery: {receipt.deliveryState}. Queued is not delivered.</p>}
      {typeof receipt.reconciliationState === "string" && <p>Reconciliation result: {receipt.reconciliationState}. A refreshed event queue is a bounded page.</p>}
      {Boolean(receipt.providerOperation) && <p>Provider operation: {String((receipt.providerOperation as { state: string }).state)}. Provider completion is independent of the persisted command.</p>}
      {deletion && <p>Deletion stage: {deletion.stage ?? "not exposed"}; lifecycle: {typeof receipt.lifecycleState === "string" ? receipt.lifecycleState : "see institute detail"}. A reserved purge is not completed deletion.</p>}
    </aside>}
    {state.invalid ? <aside role="alert">
      <p>Recovery data is invalid. No stored command was sent.</p>
      <button onClick={() => { try { removeInvalidVendorRecovery(uid); } catch { setFailure("Browser recovery storage is unavailable. No command was sent."); } }}>Remove invalid recovery data</button>
      {failure && <p>{failure}</p>}
    </aside> : call ? <aside role="alert" aria-label="Captured Vendor command recovery">
      <p>{state.busy ? "Command or authoritative reload in flight." : state.uncertain ? "Command completion or reload remains unresolved. New intent is blocked until this captured command is reconciled." : "A provider or delivery retry intent is stored. Current completion must be read from the server. Review before retrying; unrelated work may continue."}</p>
      {!state.uncertain && state.calls.length > 1 && <label>Stored retry intent<select aria-label="Stored retry intent" value={JSON.stringify(call)} disabled={state.busy} onChange={event => { setSelectedIntent(event.target.value); setFailure(""); }}>
        {state.calls.map(capture => {
          const intent = capture.args.at(-1) as Record<string, unknown>;
          return <option key={JSON.stringify(capture)} value={JSON.stringify(capture)}>{String(intent.action ?? capture.method).replaceAll("_", " ")} · {capture.args.slice(0, -1).map(String).join(" / ") || String(intent.planId ?? "creation")} · {String(intent.idempotencyKey).slice(0, 8)}</option>;
        })}
      </select></label>}
      <details><summary>Review captured targets and intent</summary><pre>{JSON.stringify(call, null, 2)}</pre></details>
      <label><input type="checkbox" checked={reviewed} onChange={event => setReviewedIntent(event.target.checked ? JSON.stringify(call) : "")} />I reviewed the captured targets and complete intent.</label>
      {call.family === "institutes" && <button disabled={!reviewed || state.busy || !access.canUseCapability("vendor.institutes.manage_lifecycle")} onClick={retryCaptured}>Retry captured institute command</button>}
      {call.family === "commercial" && <button disabled={!reviewed || state.busy || !access.canUseCapability("vendor.licenses.manage")} onClick={retryCaptured}>Retry captured commercial command</button>}
      {failure && <p>{failure}</p>}
    </aside> : null}
  </>;
}
