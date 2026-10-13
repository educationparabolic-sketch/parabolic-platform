import { useCallback, useEffect, useRef, useState } from "react";
import type { VendorCalibrationSimulationResult, VendorCalibrationWeights } from "../../../../../shared/contracts/vendorCalibration";
import { vendorInstitutesApi } from "../institutes/vendorInstitutesApi";
import { vendorCalibrationApi, calibrationFailure } from "./vendorCalibrationApi";
import { parseCalibrationRequest, riskStates, weightKeys } from "./vendorCalibrationResponse";
import VendorCalibrationPublish from "./VendorCalibrationPublish";

function useRead<T>(key: string, load: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const currentKey = `${key}|${attempt}`;
  const [state, setState] = useState<{ key: string; data: T | null; failure: ReturnType<typeof calibrationFailure> | null }>({ key: "", data: null, failure: null });
  useEffect(() => {
    const controller = new AbortController();
    if (enabled) void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setState({ key: currentKey, data: null, failure: null });
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted) setState({ key: currentKey, data, failure: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key: currentKey, data: null, failure: calibrationFailure(error) });
      }
    })();
    return () => controller.abort();
  }, [currentKey, load, enabled]);
  return { data: enabled && state.key === currentKey ? state.data : null,
    failure: enabled && state.key === currentKey ? state.failure : null,
    loading: enabled && (state.key !== currentKey || (!state.data && !state.failure)),
    key: currentKey, retry: () => setAttempt(value => value + 1) };
}
function Failure({ failure, retry }: { failure: ReturnType<typeof calibrationFailure> | null; retry: () => void }) {
  return failure ? <div role="alert"><p>{failure.kind}: {failure.message}</p>
    {failure.requestId && <p>Request: {failure.requestId}</p>}<button onClick={retry}>Retry authority</button></div> : null;
}

export default function VendorCalibrationWorkspace() {
  const [versionCursors, setVersionCursors] = useState<Array<string | undefined>>([undefined]);
  const [targetCursors, setTargetCursors] = useState<Array<string | undefined>>([undefined]);
  const [versionId, setVersionId] = useState("");
  const [year, setYear] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [draft, setDraft] = useState<{ versionId: string; weights: VendorCalibrationWeights } | null>(null);
  const versionCursor = versionCursors.at(-1), targetCursor = targetCursors.at(-1);
  const loadVersions = useCallback((signal: AbortSignal) => vendorCalibrationApi.versions(versionCursor, signal), [versionCursor]);
  const loadTargets = useCallback((signal: AbortSignal) => vendorInstitutesApi.listInstitutes({ limit: 25, ...(targetCursor ? { cursor: targetCursor } : {}) }, signal), [targetCursor]);
  const loadDetail = useCallback((signal: AbortSignal) => vendorCalibrationApi.version(versionId, signal), [versionId]);
  const versions = useRead(versionCursor ?? "first", loadVersions);
  const directory = useRead(targetCursor ?? "first", loadTargets);
  const detail = useRead(versionId, loadDetail, Boolean(versionId));
  const weights = detail.data ? draft?.versionId === versionId ? draft.weights : detail.data.weights : null;
  const intent = { academicYearId: year, institutes: targets, weights };
  let valid = true;
  try { parseCalibrationRequest(intent); } catch { valid = false; }
  const selectionKey = JSON.stringify([intent, versionId, versions.key, directory.key, detail.key]);
  const abort = useRef<AbortController | null>(null);
  const [simulation, setSimulation] = useState<{ key: string; data: VendorCalibrationSimulationResult | null; failure: ReturnType<typeof calibrationFailure> | null; loading: boolean }>({ key: "", data: null, failure: null, loading: false });
  useEffect(() => () => abort.current?.abort(), [selectionKey]);
  const ready = Boolean(detail.data && versions.data && directory.data);
  const visible = ready && simulation.key === selectionKey ? simulation : null;
  async function simulate() {
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setSimulation({ key: selectionKey, data: null, failure: null, loading: true });
    try {
      const data = await vendorCalibrationApi.simulate(parseCalibrationRequest(intent), controller.signal);
      if (!controller.signal.aborted) setSimulation({ key: selectionKey, data, failure: null, loading: false });
    } catch (error) {
      if (!controller.signal.aborted) setSimulation({ key: selectionKey, data: null, failure: calibrationFailure(error), loading: false });
    }
  }
  function choose(id: string) { abort.current?.abort(); setVersionId(id); setDraft(null); setSimulation({ key: "", data: null, failure: null, loading: false }); }
  const result = visible?.data;
  function invalidate() { abort.current?.abort(); setSimulation({ key: "", data: null, failure: null, loading: false }); }
  return <section className="vendor-calibration-page" aria-labelledby="calibration-title">
    <header className="vendor-page-heading"><h2 id="calibration-title">Calibration Management</h2>
      <p>Read-only risk_projection_v1 on stored Student-year summaries. This is not a prediction of production risk-engine outcomes.</p></header>
    <section><h3>Authoritative versions</h3>
      {versions.loading && <p role="status">Loading calibration versions</p>}
      <Failure failure={versions.failure} retry={() => { choose(""); versions.retry(); }} />
      {versions.data?.items.length === 0 && <p role="status">No calibration versions available</p>}
      {versions.data?.items.map(version => <button key={version.versionId} aria-pressed={versionId === version.versionId} onClick={() => choose(version.versionId)}>{version.versionId} ({version.isActive ? "Active" : "Inactive"})</button>)}
      <button disabled={versionCursors.length < 2 || versions.loading} onClick={() => { choose(""); setVersionCursors(current => current.slice(0, -1)); }}>Previous versions</button>
      <button disabled={!versions.data?.hasMore} onClick={() => { choose(""); setVersionCursors(current => [...current, versions.data!.nextCursor!]); }}>Next versions</button>
      <button onClick={() => { choose(""); versions.retry(); }}>Refresh versions</button>
    </section>
    <section><h3>Selected version and proposed weights</h3>
      {detail.loading && <p role="status">Loading selected version</p>}
      <Failure failure={detail.failure} retry={() => { setDraft(null); detail.retry(); }} />
      {!versionId && <p>Select a server version to initialize proposed weights.</p>}
      {detail.data && weights && <>
        <p>Source: {detail.data.sourcePath}. Created: {detail.data.createdAt}. Actor: {detail.data.createdBy}.</p>
        {weightKeys.map(key => <label key={key} style={{ display: "block" }}>{key}
          <input aria-label={key} type="number" min="0" max="1" step="0.01" value={Number.isFinite(weights[key]) ? weights[key] : ""}
            onChange={event => { invalidate(); setDraft({ versionId, weights: { ...weights, [key]: event.target.value === "" ? NaN : Number(event.target.value) } }); }} /></label>)}
        <p>Weights must sum to one. Edits are simulation intent only, not a new version.</p>
        <h4>Stored thresholds — read-only metadata</h4>
        {Object.entries(detail.data.thresholds).map(([key, value]) => <p key={key}>{key}: {value}</p>)}
        <p>Threshold edits/effects are unavailable for this projection.</p>
      </>}
    </section>
    <section><h3>Authoritative target selection</h3>
      {directory.loading && <p role="status">Loading institute directory</p>}
      <Failure failure={directory.failure} retry={() => { setTargets([]); directory.retry(); }} />
      {directory.data?.items.length === 0 && <p role="status">No institutes available</p>}
      {directory.data?.items.map(institute => <label key={institute.instituteId} style={{ display: "block" }}>
        <input type="checkbox" aria-label={`Select ${institute.registeredName}`} checked={targets.includes(institute.instituteId)}
          disabled={!targets.includes(institute.instituteId) && targets.length >= 20}
          onChange={() => { invalidate(); setTargets(current => current.includes(institute.instituteId) ? current.filter(id => id !== institute.instituteId) : [...current, institute.instituteId]); }} />
        {institute.registeredName} ({institute.instituteId})</label>)}
      <button disabled={targetCursors.length < 2 || directory.loading} onClick={() => { setTargets([]); setTargetCursors(current => current.slice(0, -1)); }}>Previous targets</button>
      <button disabled={!directory.data?.nextCursor} onClick={() => { setTargets([]); setTargetCursors(current => [...current, directory.data!.nextCursor!]); }}>Next targets</button>
      <button onClick={() => { setTargets([]); directory.retry(); }}>Refresh targets</button>
      <label style={{ display: "block" }}>Academic year ID<input aria-label="Academic year ID" value={year} onChange={event => { invalidate(); setYear(event.target.value); }} /></label>
      <p>Choose 1–20 targets and one explicit existing year. No all-institute expansion.</p>
      {!valid && <p role="status">Validation: enter a year, select targets, and use five finite sum-one weights.</p>}
      <button disabled={!ready || !valid || visible?.loading} onClick={() => void simulate()}>Run simulation</button>
    </section>
    {visible?.loading && <p role="status">Running read-only simulation</p>}
    <Failure failure={visible?.failure ?? null} retry={() => void simulate()} />
    {result?.availability === "empty" && <p role="status">Empty population: no selected Student-year summaries. No scores are fabricated.</p>}
    {result?.availability === "available" && <section aria-label="Authoritative simulation results">
      <h3>Five-state projected comparison</h3><p>Evaluated: {result.metadata.evaluatedAt}. Year: {result.metadata.academicYearId}.</p>
      <p>Students: {result.before.studentCount}. Institutes: {result.before.instituteCount}.</p>
      <p>Before average: {result.before.averageProjectedRiskScore.toFixed(2)}</p>
      <p>Projected average: {result.after.averageProjectedRiskScore.toFixed(2)}</p>
      <p>Average delta: {result.delta.averageProjectedRiskScore.toFixed(2)}</p>
      <table><thead><tr><th>State</th><th>Before count / %</th><th>Projected count / %</th><th>Delta count / points</th></tr></thead>
        <tbody>{riskStates.map(state => <tr key={state}><th scope="row">{state}</th>
          <td>{result.before.riskDistribution[state].count} / {result.before.riskDistribution[state].percent}</td>
          <td>{result.after.riskDistribution[state].count} / {result.after.riskDistribution[state].percent}</td>
          <td>{result.delta.riskDistribution[state].count} / {result.delta.riskDistribution[state].percent}</td></tr>)}</tbody></table>
      {result.institutes.map(institute => <p key={institute.instituteId}>{institute.instituteId}: {institute.beforeAverageProjectedRiskScore} → {institute.projectedAverageRiskScore}; source {institute.currentCalibrationSourcePath}; {institute.studentCount} summaries.</p>)}
    </section>}
    <VendorCalibrationPublish versionId={versionId} targets={targets} ready={ready} onComplete={() => { invalidate(); detail.retry(); directory.retry(); }} />
    <section aria-label="Unavailable calibration capabilities"><h3>Unavailable capabilities</h3>
      <p>Discipline, cluster movement, batch delta, alerts, stability and production risk outcomes have no authoritative output.</p>
      <p>Creation, draft, scheduled activation and dry-run deployment remain unavailable. BWM-039 supports only immediate selected-version publishing and explicit inverse restoration. Server audit history is available in the Audit workspace (BWM-040).</p>
      <button disabled>Create version</button><button disabled>Schedule activation</button>
    </section>
  </section>;
}
