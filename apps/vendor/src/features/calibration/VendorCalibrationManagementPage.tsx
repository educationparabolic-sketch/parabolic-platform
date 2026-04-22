import { useMemo, useState } from "react";
import {
  UiForm,
  UiFormField,
  UiStatCard,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  appendCalibrationAuditRecord,
  getCalibrationAuditRecords,
  getVendorCalibrationDataset,
  pushCalibrationVersion,
  runCalibrationSimulation,
  type CalibrationPushScope,
  type CalibrationSimulationMode,
  type CalibrationThresholdDraft,
  type CalibrationWeightsDraft,
  type VendorCalibrationVersionRecord,
} from "./vendorCalibrationDataset";

const SIMULATION_MODES: CalibrationSimulationMode[] = [
  "SingleInstitute",
  "SelectedInstitutes",
  "AllInstitutes",
];

const PUSH_SCOPES: CalibrationPushScope[] = ["ApplyGlobally", "ApplyToSelectedInstitutes"];

function formatDateLabel(value: string | null): string {
  if (!value) {
    return "Not scheduled";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function toHumanLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .trim();
}

function toFixed(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0.00";
}

function VendorCalibrationManagementPage() {
  const dataset = useMemo(() => getVendorCalibrationDataset(), []);
  const [versions, setVersions] = useState<VendorCalibrationVersionRecord[]>(dataset.versions);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(dataset.versions[0]?.versionId ?? "");
  const [simulationMode, setSimulationMode] = useState<CalibrationSimulationMode>("SelectedInstitutes");
  const [selectedInstituteIds, setSelectedInstituteIds] = useState<string[]>(
    dataset.institutes.slice(0, 2).map((entry) => entry.instituteId),
  );
  const [scheduleActivationDate, setScheduleActivationDate] = useState<string>("");
  const [draftModeOnly, setDraftModeOnly] = useState<boolean>(true);
  const [pushScope, setPushScope] = useState<CalibrationPushScope>("ApplyToSelectedInstitutes");
  const [operatorNote, setOperatorNote] = useState<string>("");
  const [pushResultLine, setPushResultLine] = useState<string>("");
  const [activityLines, setActivityLines] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [weights, setWeights] = useState<CalibrationWeightsDraft>(() => {
    return dataset.versions[0]?.weights ?? {
      guessWeight: 0.2,
      phaseDeviationWeight: 0.2,
      easyNeglectWeight: 0.2,
      hardBiasWeight: 0.2,
      consecutiveWrongWeight: 0.2,
    };
  });

  const [thresholds, setThresholds] = useState<CalibrationThresholdDraft>(() => {
    return dataset.versions[0]?.thresholds ?? {
      guessFactorPerDifficulty: 1,
      phaseTolerancePercent: 10,
      hardBiasDeviationAllowance: 15,
      stabilityVarianceThreshold: 10,
      minTimeMultiplier: 0.7,
      maxTimeMultiplier: 1.3,
    };
  });

  const [simulationSummary, setSimulationSummary] = useState(dataset.baselineComparison);
  const [simulationMeta, setSimulationMeta] = useState<{
    generatedAt: string;
    engineSource: "api" | "local-fallback";
    mode: CalibrationSimulationMode;
    instituteIds: string[];
  } | null>(null);

  const selectedVersion = useMemo(() => {
    return versions.find((entry) => entry.versionId === selectedVersionId) ?? versions[0] ?? null;
  }, [versions, selectedVersionId]);

  const auditRecords = getCalibrationAuditRecords(dataset).slice(0, 6);

  const weightSum = useMemo(() => {
    return (
      weights.guessWeight +
      weights.phaseDeviationWeight +
      weights.easyNeglectWeight +
      weights.hardBiasWeight +
      weights.consecutiveWrongWeight
    );
  }, [weights]);

  const weightIssues = useMemo(() => {
    const issues: string[] = [];

    for (const [key, value] of Object.entries(weights)) {
      if (value < 0 || value > 1) {
        issues.push(`${toHumanLabel(key)} must be between 0 and 1.`);
      }
    }

    if (Math.abs(weightSum - 1) > 0.0001) {
      issues.push(`Risk weights must sum to 1. Current sum: ${toFixed(weightSum, 3)}.`);
    }

    if (thresholds.minTimeMultiplier > thresholds.maxTimeMultiplier) {
      issues.push("MinTimeMultiplier cannot exceed MaxTimeMultiplier.");
    }

    return issues;
  }, [thresholds.maxTimeMultiplier, thresholds.minTimeMultiplier, weightSum, weights]);

  const canSimulate = weightIssues.length === 0 && selectedInstituteIds.length > 0;

  const versionColumns = useMemo<Array<UiTableColumn<VendorCalibrationVersionRecord>>>(() => {
    return [
      {
        id: "versionId",
        header: "Version",
        render: (row) => (
          <button
            type="button"
            className="vendor-link-button"
            onClick={() => {
              setSelectedVersionId(row.versionId);
              setWeights(row.weights);
              setThresholds(row.thresholds);
            }}
          >
            {row.versionId}
          </button>
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        render: (row) => formatDateLabel(row.createdAt),
      },
      {
        id: "activationDate",
        header: "Activation",
        render: (row) => formatDateLabel(row.activationDate),
      },
      {
        id: "scope",
        header: "Affected Institutes",
        render: (row) => String(row.affectedInstitutes.length),
      },
      {
        id: "rollback",
        header: "Rollback",
        render: (row) => toHumanLabel(row.rollbackStatus),
      },
    ];
  }, []);

  function toggleInstitute(instituteId: string) {
    setSelectedInstituteIds((previous) => {
      if (previous.includes(instituteId)) {
        return previous.filter((entry) => entry !== instituteId);
      }

      return [...previous, instituteId];
    });
  }

  async function handleSimulate() {
    setErrorMessage("");

    if (!canSimulate) {
      setErrorMessage("Resolve guardrail issues before running simulation.");
      return;
    }

    setIsSimulating(true);

    try {
      const result = await runCalibrationSimulation({
        dataset,
        mode: simulationMode,
        selectedInstituteIds,
        weights,
      });

      setSimulationSummary(result.comparison);
      setSimulationMeta({
        generatedAt: result.generatedAt,
        engineSource: result.engineSource,
        mode: result.mode,
        instituteIds: result.instituteIds,
      });

      const simulationLine = `${new Date().toISOString()} | Simulation ${result.engineSource} | ${result.mode} | institutes=${result.instituteIds.length}`;
      setActivityLines((previous) => [simulationLine, ...previous].slice(0, 8));

      appendCalibrationAuditRecord({
        id: `audit_simulation_${Date.now()}`,
        actionType: "SimulationExecuted",
        actorUid: "vendor.ops@parabolic.local",
        actorRole: "Vendor",
        targetCollection: "auditLogs",
        targetId: `calibrationVersions/${selectedVersion?.versionId ?? "draft"}`,
        eventScope: simulationMode === "AllInstitutes" ? "Global" : "SelectedInstitutes",
        instituteIds: result.instituteIds,
        calibrationVersionId: selectedVersion?.versionId ?? "draft",
        note: `Simulation completed using ${result.summarySources.join(", ")} (${result.engineSource}).`,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Simulation failed.");
    } finally {
      setIsSimulating(false);
    }
  }

  async function handlePush() {
    setErrorMessage("");

    if (!selectedVersion) {
      setErrorMessage("Select a calibration version before push.");
      return;
    }

    if (pushScope === "ApplyToSelectedInstitutes" && selectedInstituteIds.length === 0) {
      setErrorMessage("Select at least one institute for scoped deployment.");
      return;
    }

    setIsPushing(true);

    try {
      const result = await pushCalibrationVersion({
        dataset,
        versionId: selectedVersion.versionId,
        pushScope,
        selectedInstituteIds,
      });

      const targetInstituteIds =
        pushScope === "ApplyGlobally"
          ? dataset.institutes.map((entry) => entry.instituteId)
          : selectedInstituteIds;

      const activationDescriptor = scheduleActivationDate || "Immediate";
      const line = `${new Date().toISOString()} | Push ${selectedVersion.versionId} | ${result.engineSource} | ${pushScope} | institutes=${result.deployedInstituteCount} | draft=${draftModeOnly ? "yes" : "no"} | activation=${activationDescriptor}`;
      setPushResultLine(line);
      setActivityLines((previous) => [line, ...previous].slice(0, 8));

      appendCalibrationAuditRecord({
        id: `audit_push_${Date.now()}`,
        actionType: "CalibrationPush",
        actorUid: "vendor.ops@parabolic.local",
        actorRole: "Vendor",
        targetCollection: "auditLogs",
        targetId: `calibrationVersions/${selectedVersion.versionId}`,
        eventScope: pushScope === "ApplyGlobally" ? "Global" : "SelectedInstitutes",
        instituteIds: targetInstituteIds,
        calibrationVersionId: selectedVersion.versionId,
        calibrationSourcePath: `globalCalibration/${selectedVersion.versionId}`,
        note: operatorNote.trim() || `Calibration push completed (${result.engineSource}).`,
        createdAt: new Date().toISOString(),
      });

      setOperatorNote("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Push failed.");
    } finally {
      setIsPushing(false);
    }
  }

  function queueRollback(versionId: string) {
    appendCalibrationAuditRecord({
      id: `audit_rollback_${Date.now()}`,
      actionType: "RollbackQueued",
      actorUid: "vendor.ops@parabolic.local",
      actorRole: "Vendor",
      targetCollection: "auditLogs",
      targetId: `calibrationVersions/${versionId}`,
      eventScope: "Global",
      instituteIds: [],
      calibrationVersionId: versionId,
      note: "Rollback queued from version history panel.",
      createdAt: new Date().toISOString(),
    });

    setVersions((previous) =>
      previous.map((entry) => {
        if (entry.versionId !== versionId || entry.rollbackStatus === "rolled_back") {
          return entry;
        }

        return {
          ...entry,
          rollbackStatus: "rollback_queued",
        };
      }),
    );

    const line = `${new Date().toISOString()} | Rollback queued for ${versionId}`;
    setActivityLines((previous) => [line, ...previous].slice(0, 8));
  }

  return (
    <section className="vendor-content-card" aria-labelledby="vendor-calibration-title">
      <p className="vendor-content-eyebrow">Build 138</p>
      <h2 id="vendor-calibration-title">Global Calibration Control</h2>
      <p className="vendor-content-copy">
        Manage calibration versions with summary-only simulation, guarded parameter editing, scoped deployment,
        and immutable audit traceability.
      </p>

      <div className="vendor-overview-grid">
        <UiStatCard title="Calibration Versions" value={String(versions.length)} helper="Source: calibrationVersions" />
        <UiStatCard title="Selected Institutes" value={String(selectedInstituteIds.length)} helper="Push or simulation target set" />
        <UiStatCard title="Weight Sum" value={toFixed(weightSum, 3)} helper="Must equal 1.000 before simulation" />
        <UiStatCard title="Risk Delta" value={toFixed(simulationSummary.afterAverageRiskScore - simulationSummary.beforeAverageRiskScore, 2)} helper="After - before projected risk score" />
        <UiStatCard title="Discipline Delta" value={toFixed(simulationSummary.afterDisciplineIndex - simulationSummary.beforeDisciplineIndex, 2)} helper="Before/after discipline index shift" />
        <UiStatCard title="Alert Delta" value={String(simulationSummary.estimatedAlertDelta)} helper="Estimated alert increase/decrease" />
      </div>

      <UiTable
        caption="Calibration version history"
        columns={versionColumns}
        rows={versions}
        rowKey={(row) => row.versionId}
        emptyStateText="No calibration versions found."
      />

      <div className="vendor-section-grid">
        <UiForm
          title="Parameter editor with guardrails"
          description="Editable risk weights, thresholds, and timing multipliers. Guardrails block invalid submissions."
          submitLabel="Validate parameters"
          onSubmit={(event) => {
            event.preventDefault();
          }}
          footer={
            <button
              type="button"
              onClick={() => {
                if (!selectedVersion) {
                  return;
                }

                setWeights(selectedVersion.weights);
                setThresholds(selectedVersion.thresholds);
              }}
            >
              Reset to selected version
            </button>
          }
        >
          <UiFormField label="GuessWeight" htmlFor="vendor-cal-guess">
            <input
              id="vendor-cal-guess"
              type="number"
              min={0}
              max={1}
              step="0.01"
              value={weights.guessWeight}
              onChange={(event) => {
                setWeights((previous) => ({ ...previous, guessWeight: Number(event.target.value) }));
              }}
            />
          </UiFormField>

          <UiFormField label="PhaseDeviationWeight" htmlFor="vendor-cal-phase">
            <input
              id="vendor-cal-phase"
              type="number"
              min={0}
              max={1}
              step="0.01"
              value={weights.phaseDeviationWeight}
              onChange={(event) => {
                setWeights((previous) => ({ ...previous, phaseDeviationWeight: Number(event.target.value) }));
              }}
            />
          </UiFormField>

          <UiFormField label="EasyNeglectWeight" htmlFor="vendor-cal-easy-neglect">
            <input
              id="vendor-cal-easy-neglect"
              type="number"
              min={0}
              max={1}
              step="0.01"
              value={weights.easyNeglectWeight}
              onChange={(event) => {
                setWeights((previous) => ({ ...previous, easyNeglectWeight: Number(event.target.value) }));
              }}
            />
          </UiFormField>

          <UiFormField label="HardBiasWeight" htmlFor="vendor-cal-hard-bias">
            <input
              id="vendor-cal-hard-bias"
              type="number"
              min={0}
              max={1}
              step="0.01"
              value={weights.hardBiasWeight}
              onChange={(event) => {
                setWeights((previous) => ({ ...previous, hardBiasWeight: Number(event.target.value) }));
              }}
            />
          </UiFormField>

          <UiFormField label="ConsecutiveWrongWeight" htmlFor="vendor-cal-wrong-streak">
            <input
              id="vendor-cal-wrong-streak"
              type="number"
              min={0}
              max={1}
              step="0.01"
              value={weights.consecutiveWrongWeight}
              onChange={(event) => {
                setWeights((previous) => ({
                  ...previous,
                  consecutiveWrongWeight: Number(event.target.value),
                }));
              }}
            />
          </UiFormField>

          <UiFormField label="GuessFactorPerDifficulty" htmlFor="vendor-cal-guess-factor">
            <input
              id="vendor-cal-guess-factor"
              type="number"
              min={0.5}
              max={2}
              step="0.05"
              value={thresholds.guessFactorPerDifficulty}
              onChange={(event) => {
                setThresholds((previous) => ({
                  ...previous,
                  guessFactorPerDifficulty: Number(event.target.value),
                }));
              }}
            />
          </UiFormField>

          <UiFormField label="PhaseTolerancePercent" htmlFor="vendor-cal-phase-tolerance">
            <input
              id="vendor-cal-phase-tolerance"
              type="number"
              min={0}
              max={50}
              step="1"
              value={thresholds.phaseTolerancePercent}
              onChange={(event) => {
                setThresholds((previous) => ({
                  ...previous,
                  phaseTolerancePercent: Number(event.target.value),
                }));
              }}
            />
          </UiFormField>

          <UiFormField label="HardBiasDeviationAllowance" htmlFor="vendor-cal-hard-allowance">
            <input
              id="vendor-cal-hard-allowance"
              type="number"
              min={0}
              max={60}
              step="1"
              value={thresholds.hardBiasDeviationAllowance}
              onChange={(event) => {
                setThresholds((previous) => ({
                  ...previous,
                  hardBiasDeviationAllowance: Number(event.target.value),
                }));
              }}
            />
          </UiFormField>

          <UiFormField label="StabilityVarianceThreshold" htmlFor="vendor-cal-stability-threshold">
            <input
              id="vendor-cal-stability-threshold"
              type="number"
              min={0}
              max={40}
              step="1"
              value={thresholds.stabilityVarianceThreshold}
              onChange={(event) => {
                setThresholds((previous) => ({
                  ...previous,
                  stabilityVarianceThreshold: Number(event.target.value),
                }));
              }}
            />
          </UiFormField>

          <UiFormField label="MinTimeMultiplier" htmlFor="vendor-cal-min-time">
            <input
              id="vendor-cal-min-time"
              type="number"
              min={0.5}
              max={1.5}
              step="0.05"
              value={thresholds.minTimeMultiplier}
              onChange={(event) => {
                setThresholds((previous) => ({
                  ...previous,
                  minTimeMultiplier: Number(event.target.value),
                }));
              }}
            />
          </UiFormField>

          <UiFormField label="MaxTimeMultiplier" htmlFor="vendor-cal-max-time">
            <input
              id="vendor-cal-max-time"
              type="number"
              min={1}
              max={2}
              step="0.05"
              value={thresholds.maxTimeMultiplier}
              onChange={(event) => {
                setThresholds((previous) => ({
                  ...previous,
                  maxTimeMultiplier: Number(event.target.value),
                }));
              }}
            />
          </UiFormField>

          {weightIssues.length > 0 ? (
            <ul className="vendor-validation-list">
              {weightIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="vendor-content-note">All guardrails pass for simulation and push readiness.</p>
          )}
        </UiForm>

        <UiForm
          title="Calibration simulation engine"
          description="Uses stored summary components only: studentYearMetrics, runAnalytics, riskComponents, and disciplineComponents."
          submitLabel={isSimulating ? "Simulating..." : "Run simulation"}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSimulate();
          }}
          footer={
            <button type="button" onClick={() => void handleSimulate()} disabled={isSimulating || !canSimulate}>
              Simulate now
            </button>
          }
        >
          <UiFormField label="Simulation mode" htmlFor="vendor-cal-simulation-mode">
            <select
              id="vendor-cal-simulation-mode"
              value={simulationMode}
              onChange={(event) => {
                setSimulationMode(event.target.value as CalibrationSimulationMode);
              }}
            >
              {SIMULATION_MODES.map((entry) => (
                <option key={entry} value={entry}>
                  {toHumanLabel(entry)}
                </option>
              ))}
            </select>
          </UiFormField>

          <fieldset className="vendor-checkbox-list">
            <legend>Target institutes</legend>
            {dataset.institutes.map((institute) => (
              <label key={institute.instituteId}>
                <input
                  type="checkbox"
                  checked={selectedInstituteIds.includes(institute.instituteId)}
                  disabled={simulationMode === "AllInstitutes"}
                  onChange={() => {
                    toggleInstitute(institute.instituteId);
                  }}
                />
                <span>{institute.instituteName}</span>
              </label>
            ))}
          </fieldset>

          <div className="vendor-impact-grid">
            <UiStatCard title="Before Risk" value={toFixed(simulationSummary.beforeAverageRiskScore)} helper="Projected baseline" />
            <UiStatCard title="After Risk" value={toFixed(simulationSummary.afterAverageRiskScore)} helper="Projected with current draft" />
            <UiStatCard title="Before Discipline" value={toFixed(simulationSummary.beforeDisciplineIndex)} helper="Current discipline index" />
            <UiStatCard title="After Discipline" value={toFixed(simulationSummary.afterDisciplineIndex)} helper="Projected discipline index" />
            <UiStatCard title="Cluster Movement" value={`${toFixed(simulationSummary.clusterMovementPercent)}%`} helper="Cross-cluster reassignment" />
            <UiStatCard title="Batch Delta" value={`${toFixed(simulationSummary.batchLevelDeltaPercent)}%`} helper="Batch-level impact" />
          </div>

          <div className="vendor-impact-list">
            <p>
              RiskDistributionShift: low {toFixed(simulationSummary.riskDistributionShift.low.percent)}%, medium {toFixed(simulationSummary.riskDistributionShift.medium.percent)}%, high {toFixed(simulationSummary.riskDistributionShift.high.percent)}%
            </p>
            <p>
              StabilityImpact: <strong>{toHumanLabel(simulationSummary.stabilityImpact)}</strong> | EstimatedAlertIncreaseDecrease: <strong>{simulationSummary.estimatedAlertDelta}</strong>
            </p>
            <p>
              No raw session recomputation performed. Historical metrics remain immutable during simulation.
            </p>
          </div>

          {simulationMeta ? (
            <p className="vendor-content-note">
              Last simulation: {formatDateLabel(simulationMeta.generatedAt)} ({simulationMeta.engineSource}) | mode {simulationMeta.mode} | institutes {simulationMeta.instituteIds.length}
            </p>
          ) : null}
        </UiForm>
      </div>

      <div className="vendor-section-grid vendor-section-grid-actions">
        <UiForm
          title="Push to institutes"
          description="Deploy calibration globally or to selected institutes with optional activation scheduling and draft mode."
          submitLabel={isPushing ? "Pushing..." : "Push calibration"}
          onSubmit={(event) => {
            event.preventDefault();
            void handlePush();
          }}
        >
          <UiFormField label="Selected version" htmlFor="vendor-cal-version-select">
            <select
              id="vendor-cal-version-select"
              value={selectedVersion?.versionId ?? ""}
              onChange={(event) => {
                const versionId = event.target.value;
                setSelectedVersionId(versionId);
                const version = versions.find((entry) => entry.versionId === versionId);

                if (version) {
                  setWeights(version.weights);
                  setThresholds(version.thresholds);
                }
              }}
            >
              {versions.map((entry) => (
                <option key={entry.versionId} value={entry.versionId}>
                  {entry.versionId} {entry.isActive ? "(Active)" : ""}
                </option>
              ))}
            </select>
          </UiFormField>

          <UiFormField label="Push scope" htmlFor="vendor-cal-push-scope">
            <select
              id="vendor-cal-push-scope"
              value={pushScope}
              onChange={(event) => {
                setPushScope(event.target.value as CalibrationPushScope);
              }}
            >
              {PUSH_SCOPES.map((entry) => (
                <option key={entry} value={entry}>
                  {toHumanLabel(entry)}
                </option>
              ))}
            </select>
          </UiFormField>

          <UiFormField label="ScheduleActivationDate" htmlFor="vendor-cal-schedule">
            <input
              id="vendor-cal-schedule"
              type="date"
              value={scheduleActivationDate}
              onChange={(event) => {
                setScheduleActivationDate(event.target.value);
              }}
            />
          </UiFormField>

          <label className="vendor-inline-checkbox" htmlFor="vendor-cal-draft-mode">
            <input
              id="vendor-cal-draft-mode"
              type="checkbox"
              checked={draftModeOnly}
              onChange={(event) => {
                setDraftModeOnly(event.target.checked);
              }}
            />
            <span>DraftModeOnly</span>
          </label>

          <UiFormField label="Operator note" htmlFor="vendor-cal-operator-note" helper="Stored in immutable audit log entry.">
            <textarea
              id="vendor-cal-operator-note"
              value={operatorNote}
              onChange={(event) => {
                setOperatorNote(event.target.value);
              }}
              placeholder="Deployment reason or override details"
              rows={3}
            />
          </UiFormField>

          {pushResultLine ? <p className="vendor-content-note">{pushResultLine}</p> : null}
        </UiForm>

        <section className="ui-form-card" aria-label="Rollback support and activity feed">
          <header className="ui-form-header">
            <h3>Rollback and activity trace</h3>
            <p>Version history supports rollback queueing while preserving immutable historical records.</p>
          </header>

          <div className="vendor-rollback-buttons">
            {versions.map((entry) => (
              <button
                key={entry.versionId}
                type="button"
                onClick={() => {
                  queueRollback(entry.versionId);
                }}
                disabled={entry.rollbackStatus === "rolled_back"}
              >
                Queue rollback: {entry.versionId} ({toHumanLabel(entry.rollbackStatus)})
              </button>
            ))}
          </div>

          <ul className="vendor-activity-feed">
            {activityLines.length === 0 ? <li>No local actions yet.</li> : null}
            {activityLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>

      <UiTable
        caption="Latest immutable calibration audit records"
        columns={[
          {
            id: "createdAt",
            header: "Timestamp",
            render: (row) => formatDateLabel(row.createdAt),
          },
          {
            id: "actionType",
            header: "Action",
            render: (row) => row.actionType,
          },
          {
            id: "actorUid",
            header: "Actor",
            render: (row) => row.actorUid,
          },
          {
            id: "scope",
            header: "Scope",
            render: (row) => row.eventScope,
          },
          {
            id: "target",
            header: "Target",
            render: (row) => row.targetId,
          },
          {
            id: "note",
            header: "Note",
            render: (row) => row.note,
          },
        ]}
        rows={auditRecords}
        rowKey={(row) => row.id}
        emptyStateText="No calibration audit records."
      />

      {selectedVersion ? (
        <section className="vendor-boundary-note">
          <p>
            Selected version <strong>{selectedVersion.versionId}</strong> | created by {selectedVersion.createdBy} | activation {formatDateLabel(selectedVersion.activationDate)}
          </p>
          <ul>
            {selectedVersion.parameterChanges.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {errorMessage ? (
        <p className="vendor-login-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

export default VendorCalibrationManagementPage;
