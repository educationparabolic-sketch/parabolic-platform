import { useEffect, useRef, useState } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import type { VendorCalibrationOperationResult, VendorCalibrationRolloutRequest, VendorCalibrationRollbackRequest, VendorCalibrationRolloutTarget } from "../../../../../shared/contracts/vendorCalibrationRollout";
import { vendorInstitutesApi } from "../institutes/vendorInstitutesApi";
import { vendorCalibrationApi, calibrationFailure } from "./vendorCalibrationApi";
import { deriveOperationId, operationId, parseRollout, parseRollback, matchRollout } from "./vendorCalibrationOperation";

type Recovery = { kind: "rollout"; operationId: string; request: VendorCalibrationRolloutRequest }
  | { kind: "rollback"; operationId: string; originalId: string; request: VendorCalibrationRollbackRequest };
function recovery(value: unknown): Recovery {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid recovery intent.");
  const item = value as Record<string, unknown>;
  const keys = item.kind === "rollout" ? "kind,operationId,request" : "kind,operationId,originalId,request";
  if (Object.keys(item).sort().join(",") !== keys) throw new Error("Invalid recovery intent.");
  operationId(item.operationId);
  if (item.kind === "rollout") parseRollout(item.request);
  else if (item.kind === "rollback") { operationId(item.originalId); parseRollback(item.request); }
  else throw new Error("Invalid recovery intent.");
  return item as Recovery;
}
function validate(data: VendorCalibrationOperationResult, intent: Recovery) {
  if (intent.kind === "rollout") matchRollout(data, intent.request);
  else if (data.receipt && (data.receipt.kind !== "rollback" || data.receipt.originalOperationId !== intent.originalId)) throw new Error("Inverse identity mismatch.");
}
export default function VendorCalibrationPublish(props: { versionId: string; targets: string[]; ready: boolean; onComplete: () => void }) {
  const { session } = useAuthProvider();
  const uid = session.user?.uid;
  // Keying the inner component discards in-memory authority on an identity change.
  return uid ? <Publish key={uid} uid={uid} {...props} /> : null;
}
function Publish({ uid, versionId, targets, ready, onComplete }: { uid: string; versionId: string; targets: string[]; ready: boolean; onComplete: () => void }) {
  const storageKey = `vendor-calibration-command-v1:${uid}`;
  const [command, setCommand] = useState<Recovery | null>(null);
  const [result, setResult] = useState<VendorCalibrationOperationResult | null>(null);
  const [failure, setFailure] = useState<ReturnType<typeof calibrationFailure> | null>(null);
  const [busy, setBusy] = useState(false), lock = useRef(false);
  const alive = useRef(true);
  const [initialized, setInitialized] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const selection = JSON.stringify([versionId, [...targets].sort(), attempt]);
  const [preconditions, setPreconditions] = useState<{ key: string; targets: VendorCalibrationRolloutTarget[] } | null>(null);
  const [targetFailure, setTargetFailure] = useState<ReturnType<typeof calibrationFailure> | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (abort.signal.aborted) return;
      setConfirmed(false); setPreconditions(null); setTargetFailure(null);
      if (!ready || !versionId || targets.length < 1 || targets.length > 20) return;
      try {
        const ids = (JSON.parse(selection) as [string, string[], number])[1];
        const details = await Promise.all(ids.map(id => vendorInstitutesApi.getInstitute(id, abort.signal)));
        if (details.some((detail, i) => detail.instituteId !== ids[i] || !detail.calibrationPointer)) throw new Error("Target identity or pointer authority is missing.");
        const captured = details.map(detail => {
          const pointer = detail.calibrationPointer!;
          return { instituteId: detail.instituteId, expectedCalibrationVersion: pointer.present ? pointer.value : null };
        });
        if (!abort.signal.aborted) setPreconditions({ key: selection, targets: captured });
      } catch (error) { if (!abort.signal.aborted) setTargetFailure(calibrationFailure(error)); }
    })();
    return () => abort.abort();
  }, [selection, ready, versionId, targets.length]);
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      let invalidRecovery = false;
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          invalidRecovery = true;
          const intent = recovery(JSON.parse(stored));
          if (await deriveOperationId(uid, intent.kind, intent.request.idempotencyKey) !== intent.operationId) throw new Error("Recovery identity mismatch.");
          if (abort.signal.aborted) return;
          setCommand(intent);
          invalidRecovery = false;
          const data = await vendorCalibrationApi.operation(intent.operationId, abort.signal);
          validate(data, intent);
          if (!abort.signal.aborted) setResult(data);
        }
      } catch (error) { if (!abort.signal.aborted) setFailure(calibrationFailure(error)); }
      finally { if (!abort.signal.aborted) setInitialized(!invalidRecovery); }
    })();
    return () => abort.abort();
  }, [storageKey, uid]);
  async function run(intent: Recovery, readOnly = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailure(null); setResult(null);
    try {
      // Persist only retry intent BEFORE issuing a command. Stored data never supplies success.
      sessionStorage.setItem(storageKey, JSON.stringify(intent)); setCommand(intent);
      if (!readOnly) {
        const data = intent.kind === "rollout" ? await vendorCalibrationApi.publish(intent.request, intent.operationId)
          : await vendorCalibrationApi.rollback(intent.originalId, intent.request, intent.operationId);
        validate(data, intent);
      }
      const data = await vendorCalibrationApi.operation(intent.operationId);
      validate(data, intent);
      if (alive.current) { setResult(data); if (data.state !== "pending") { setAttempt(value => value + 1); onComplete(); } }
    } catch (error) { if (alive.current) setFailure(calibrationFailure(error)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function create(kind: "rollout" | "rollback") {
    if (lock.current || !confirmed || !initialized) return;
    // Synchronous lock prevents double clicks during asynchronous hashing.
    lock.current = true; setBusy(true); setFailure(null);
    try {
      const key = crypto.randomUUID(), id = await deriveOperationId(uid, kind, key);
      let intent: Recovery;
      if (kind === "rollout") {
        if (command || !ready || preconditions?.key !== selection) throw new Error("Reload target authority first.");
        intent = { kind, operationId: id, request: parseRollout({ idempotencyKey: key, versionId, targets: preconditions.targets }) };
      } else {
        if (!command || command.kind !== "rollout" || result?.state !== "applied") throw new Error("Completed rollout required.");
        intent = { kind, operationId: id, originalId: command.operationId, request: parseRollback({ idempotencyKey: key, expectedOperationRevision: result.revision }) };
      }
      lock.current = false;
      if (alive.current) await run(intent);
    } catch (error) { lock.current = false; if (alive.current) { setFailure(calibrationFailure(error)); setBusy(false); } }
  }
  const terminal = result && result.state !== "pending";
  return <section aria-label="Immediate calibration publishing"><h3>Immediate selected-version publishing</h3>
    <p>Publishes the immutable selected version, not edited simulation weights. Only 1–20 explicit targets; no global activation.</p>
    {preconditions?.key === selection && <ul>{preconditions.targets.map(target => <li key={target.instituteId}>{target.instituteId}: expected {target.expectedCalibrationVersion ?? "no institute pointer"} → {versionId}</li>)}</ul>}
    {targetFailure && <p role="alert">{targetFailure.message}</p>}
    <button disabled={busy} onClick={() => setAttempt(value => value + 1)}>Reload publish preconditions</button>
    <label><input type="checkbox" aria-label="Confirm calibration command" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Confirm immediate publication or inverse restoration of the displayed operation.</label>
    <button disabled={!initialized || busy || Boolean(command) || !confirmed || !ready || preconditions?.key !== selection} onClick={() => void create("rollout")}>Publish calibration</button>
    <button disabled={busy || !confirmed || command?.kind !== "rollout" || result?.state !== "applied"} onClick={() => void create("rollback")}>Rollback</button>
    {busy && <p role="status">Calibration command in flight; no success is assumed.</p>}
    {command && <><p>Operation: {command.operationId}. Kind: {command.kind}.</p>
      <button disabled={busy || !initialized} onClick={() => void run(command, true)}>Reload operation status</button>
      <button disabled={busy || !initialized} onClick={() => void run(command)}>Retry / replay exact command</button></>}
    {failure && <p role="alert">{failure.kind}: {failure.message} Completion is unknown until status reload; retry retains the exact key and preconditions. {failure.requestId}</p>}
    {result && <div role="status"><p>Authoritative operation: {result.state}; revision {result.revision}.</p>
      {result.state === "pending" && <p>Pending is uncertain, not successful. Reload or retry the same command.</p>}
      {result.receipt && <><p>Completed: {result.receipt.completedAt}; source version: {result.receipt.versionId}; {result.receipt.vendorCalibrationLogPath}.</p>
        {result.receipt.state === "not_applied" ? <p>No targets applied: {result.receipt.failureCode}.</p> : result.receipt.targets.map(target => <div key={target.instituteId}><p>{target.instituteId}: {target.state}; {target.calibrationHistoryPath}.</p>
          <p>Captured before: {JSON.stringify(target.before)}. Recorded after: {JSON.stringify(target.after)}.</p></div>)}</>}
      {result.rollbackOperationId && <p>Inverse operation: {result.rollbackOperationId}</p>}
    </div>}
    <button disabled={busy || !terminal} onClick={() => { sessionStorage.removeItem(storageKey); setCommand(null); setResult(null); setFailure(null); setConfirmed(false); setAttempt(value => value + 1); }}>Start a new command after terminal status</button>
    <p>Recovery storage contains only this Vendor's retry intent; receipts and business success are server authority. Unified audit remains BWM-040.</p>
  </section>;
}
