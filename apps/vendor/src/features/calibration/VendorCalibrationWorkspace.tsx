import { useMemo, useState } from "react";
import {
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
  type StrategyProfileParameters,
  type VendorCalibrationVersionRecord,
} from "./vendorCalibrationDataset";

type CalibrationWorkspace = "parameters" | "simulation" | "deployment" | "history";
type StrategyParameterKey = keyof StrategyProfileParameters;

interface ParameterDefinition<Key extends string> {
  key: Key;
  label: string;
  description: string;
  output: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const PHASE_ADHERENCE_PARAMETERS: Array<ParameterDefinition<StrategyParameterKey>> = [
  {
    key: "objectiveWeight",
    label: "objectiveWeight",
    description: "Objective-score contribution to phase adherence.",
    output: "Phase adherence",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "timingWeight",
    label: "timingWeight",
    description: "Timing-score contribution to controlled-mode phase adherence.",
    output: "Phase adherence",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "P1CoverageWeight",
    label: "P1CoverageWeight",
    description: "Question-coverage contribution to the P1 objective score.",
    output: "P1 objective score",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "P1RoutingWeight",
    label: "P1RoutingWeight",
    description: "Proper-routing contribution to the P1 objective score.",
    output: "P1 objective score",
    min: 0,
    max: 1,
    step: 0.01,
  },
];

const GUESS_RATE_PARAMETERS: Array<ParameterDefinition<StrategyParameterKey>> = [
  {
    key: "easyGuessFactor",
    label: "easyGuessFactor",
    description: "Minimum-time factor used for easy-question guess detection.",
    output: "Guess rate",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "mediumGuessFactor",
    label: "mediumGuessFactor",
    description: "Minimum-time factor used for medium-question guess detection.",
    output: "Guess rate",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "hardGuessFactor",
    label: "hardGuessFactor",
    description: "Minimum-time factor used for hard-question guess detection.",
    output: "Guess rate",
    min: 0,
    max: 1,
    step: 0.01,
  },
];

const EASY_NEGLECT_PARAMETERS: Array<ParameterDefinition<StrategyParameterKey>> = [
  {
    key: "easyNeglectThreshold",
    label: "easyNeglectThreshold",
    description: "Easy-attempt rate below which a run is classified as easy neglect.",
    output: "Easy neglect rate",
    min: 0,
    max: 1,
    step: 0.01,
  },
];

const HARD_BIAS_PARAMETERS: Array<ParameterDefinition<StrategyParameterKey>> = [
  {
    key: "hardBiasToleranceFactor",
    label: "hardBiasToleranceFactor",
    description: "Expected-hard-ratio multiplier used as the hard-bias allowance.",
    output: "Hard bias rate",
    min: 0,
    max: 1,
    step: 0.01,
  },
];

const RISK_SCORE_PARAMETERS: Array<ParameterDefinition<StrategyParameterKey>> = [
  {
    key: "riskGuessWeight",
    label: "riskGuessWeight",
    description: "Guess-rate contribution to the normalized risk score.",
    output: "Risk score",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "riskPhaseWeight",
    label: "riskPhaseWeight",
    description: "Phase-risk contribution to the normalized risk score.",
    output: "Risk score",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "riskOverstayWeight",
    label: "riskOverstayWeight",
    description: "Overstay-rate contribution to the normalized risk score.",
    output: "Risk score",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "riskEasyNeglectWeight",
    label: "riskEasyNeglectWeight",
    description: "Easy-neglect-rate contribution to the normalized risk score.",
    output: "Risk score",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "riskHardBiasWeight",
    label: "riskHardBiasWeight",
    description: "Hard-bias-rate contribution to the normalized risk score.",
    output: "Risk score",
    min: 0,
    max: 1,
    step: 0.01,
  },
];

const WORKSPACE_TABS: Array<{ id: CalibrationWorkspace; label: string }> = [
  { id: "parameters", label: "Parameters" },
  { id: "simulation", label: "Simulation" },
  { id: "deployment", label: "Deployment" },
  { id: "history", label: "History" },
];

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase())
    .trim();
}

function fixed(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0.00";
}

function VendorCalibrationWorkspace() {
  const dataset = useMemo(() => getVendorCalibrationDataset(), []);
  const [workspace, setWorkspace] = useState<CalibrationWorkspace>("parameters");
  const [versions, setVersions] = useState<VendorCalibrationVersionRecord[]>(dataset.versions);
  const [selectedVersionId, setSelectedVersionId] = useState(dataset.versions[0]?.versionId ?? "");
  const [parameters, setParameters] = useState<StrategyProfileParameters>(
    dataset.versions[0]?.parameters,
  );
  const [simulationMode, setSimulationMode] =
    useState<CalibrationSimulationMode>("SelectedInstitutes");
  const [simulationInstituteIds, setSimulationInstituteIds] = useState(
    dataset.institutes.slice(0, 2).map((item) => item.instituteId),
  );
  const [deploymentInstituteIds, setDeploymentInstituteIds] = useState(
    dataset.institutes.slice(0, 2).map((item) => item.instituteId),
  );
  const [pushScope, setPushScope] = useState<CalibrationPushScope>("ApplyToSelectedInstitutes");
  const [activationDate, setActivationDate] = useState("");
  const [draftModeOnly, setDraftModeOnly] = useState(true);
  const [operatorNote, setOperatorNote] = useState("");
  const [simulationSummary, setSimulationSummary] = useState(dataset.baselineComparison);
  const [simulationMeta, setSimulationMeta] = useState<{
    generatedAt: string;
    engineSource: "api" | "local-fallback";
    instituteIds: string[];
  } | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const selectedVersion =
    versions.find((version) => version.versionId === selectedVersionId) ?? versions[0] ?? null;
  const activeVersion = versions.find((version) => version.isActive) ?? null;
  const riskWeightTotal =
    parameters.riskGuessWeight +
    parameters.riskPhaseWeight +
    parameters.riskOverstayWeight +
    parameters.riskEasyNeglectWeight +
    parameters.riskHardBiasWeight;
  const issues: string[] = [];

  for (const [key, value] of Object.entries(parameters)) {
    if (!Number.isFinite(value) || value < 0 || value > 1)
      issues.push(`${humanize(key)} must be between 0 and 1.`);
  }
  if (Math.abs(riskWeightTotal - 1) > 0.0001)
    issues.push(`Risk score weights must total 1.00. Current total: ${fixed(riskWeightTotal, 3)}.`);

  const riskDelta =
    simulationSummary.afterAverageRiskScore - simulationSummary.beforeAverageRiskScore;
  const disciplineDelta =
    simulationSummary.afterDisciplineIndex - simulationSummary.beforeDisciplineIndex;
  const targetStudentCount = dataset.institutes
    .filter((institute) => simulationInstituteIds.includes(institute.instituteId))
    .reduce((sum, institute) => sum + institute.studentCount, 0);
  const canSimulate =
    issues.length === 0 &&
    (simulationMode === "AllInstitutes" || simulationInstituteIds.length > 0);
  const canDeploy =
    Boolean(selectedVersion) &&
    (pushScope === "ApplyGlobally" || deploymentInstituteIds.length > 0);
  const auditRecords = getCalibrationAuditRecords(dataset).slice(0, 8);

  const versionColumns: Array<UiTableColumn<VendorCalibrationVersionRecord>> = [
    {
      id: "version",
      header: "Version",
      render: (row) => (
        <button type="button" className="vendor-link-button" onClick={() => loadVersion(row)}>
          {row.versionId}
        </button>
      ),
    },
    { id: "created", header: "Created", render: (row) => formatDate(row.createdAt) },
    {
      id: "status",
      header: "Status",
      render: (row) => (
        <span className={`vendor-status vendor-status-${row.isActive ? "active" : "draft"}`}>
          {row.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    { id: "scope", header: "Institutes", render: (row) => String(row.affectedInstitutes.length) },
    { id: "rollback", header: "Rollback", render: (row) => humanize(row.rollbackStatus) },
  ];

  function loadVersion(version: VendorCalibrationVersionRecord) {
    setSelectedVersionId(version.versionId);
    setParameters({ ...version.parameters });
    setMessage(`Loaded ${version.versionId}.`);
  }

  function toggleTarget(kind: "simulation" | "deployment", instituteId: string) {
    const setter = kind === "simulation" ? setSimulationInstituteIds : setDeploymentInstituteIds;
    setter((current) =>
      current.includes(instituteId)
        ? current.filter((id) => id !== instituteId)
        : [...current, instituteId],
    );
  }

  async function simulate() {
    if (!canSimulate) {
      setMessage("Resolve guardrails and select a simulation target.");
      return;
    }
    setIsSimulating(true);
    setMessage("");
    try {
      const result = await runCalibrationSimulation({
        dataset,
        mode: simulationMode,
        selectedInstituteIds: simulationInstituteIds,
        parameters,
      });
      setSimulationSummary(result.comparison);
      setSimulationMeta({
        generatedAt: result.generatedAt,
        engineSource: result.engineSource,
        instituteIds: result.instituteIds,
      });
      setActivity((current) =>
        [
          `${result.generatedAt} | Simulation | ${result.mode} | ${result.instituteIds.length} institutes`,
          ...current,
        ].slice(0, 8),
      );
      appendCalibrationAuditRecord({
        id: `audit_sim_${Date.now()}`,
        actionType: "SimulationExecuted",
        actorUid: "vendor.current",
        actorRole: "Vendor",
        targetCollection: "auditLogs",
        targetId: `calibrationVersions/${selectedVersionId || "draft"}`,
        eventScope: simulationMode === "AllInstitutes" ? "Global" : "SelectedInstitutes",
        instituteIds: result.instituteIds,
        calibrationVersionId: selectedVersionId || "draft",
        note: `Simulation completed using ${result.engineSource}.`,
        createdAt: result.generatedAt,
      });
      setMessage(
        `Simulation completed for ${result.instituteIds.length} institute${result.instituteIds.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Simulation failed.");
    } finally {
      setIsSimulating(false);
    }
  }

  async function deploy() {
    if (!canDeploy || !selectedVersion) {
      setMessage("Select a calibration version and deployment scope before publishing.");
      return;
    }
    setIsPushing(true);
    setMessage("");
    try {
      const result = await pushCalibrationVersion({
        dataset,
        versionId: selectedVersion.versionId,
        pushScope,
        selectedInstituteIds: deploymentInstituteIds,
      });
      const instituteIds =
        pushScope === "ApplyGlobally"
          ? dataset.institutes.map((item) => item.instituteId)
          : deploymentInstituteIds;
      const createdAt = new Date().toISOString();
      const line = `${createdAt} | Deployment | ${selectedVersion.versionId} | ${result.deployedInstituteCount} institutes`;
      setActivity((current) => [line, ...current].slice(0, 8));
      appendCalibrationAuditRecord({
        id: `audit_push_${Date.now()}`,
        actionType: "CalibrationPush",
        actorUid: "vendor.current",
        actorRole: "Vendor",
        targetCollection: "auditLogs",
        targetId: `calibrationVersions/${selectedVersion.versionId}`,
        eventScope: pushScope === "ApplyGlobally" ? "Global" : "SelectedInstitutes",
        instituteIds,
        calibrationVersionId: selectedVersion.versionId,
        calibrationSourcePath: `globalCalibration/${selectedVersion.versionId}`,
        note: operatorNote.trim() || `Calibration deployed using ${result.engineSource}.`,
        createdAt,
      });
      setMessage(
        `${selectedVersion.versionId} queued for ${activationDate || "immediate"} activation.`,
      );
      setOperatorNote("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deployment failed.");
    } finally {
      setIsPushing(false);
    }
  }

  function queueRollback(version: VendorCalibrationVersionRecord) {
    if (version.rollbackStatus === "rolled_back") return;
    const createdAt = new Date().toISOString();
    setVersions((current) =>
      current.map((item) =>
        item.versionId === version.versionId
          ? { ...item, rollbackStatus: "rollback_queued" }
          : item,
      ),
    );
    setActivity((current) =>
      [`${createdAt} | Rollback queued | ${version.versionId}`, ...current].slice(0, 8),
    );
    appendCalibrationAuditRecord({
      id: `audit_rollback_${Date.now()}`,
      actionType: "RollbackQueued",
      actorUid: "vendor.current",
      actorRole: "Vendor",
      targetCollection: "auditLogs",
      targetId: `calibrationVersions/${version.versionId}`,
      eventScope: "Global",
      instituteIds: [],
      calibrationVersionId: version.versionId,
      note: "Rollback queued from calibration history.",
      createdAt,
    });
  }

  function renderParameterGroup(
    title: string,
    description: string,
    definitions: Array<ParameterDefinition<StrategyParameterKey>>,
  ) {
    return (
      <section className="vendor-calibration-parameter-group">
        <header>
          <div>
            <h4>{title}</h4>
            <p>{description}</p>
          </div>
          <span>{definitions.length} parameters</span>
        </header>
        <div className="vendor-calibration-parameter-list">
          {definitions.map((parameter) => {
            const value = parameters[parameter.key];
            return (
              <div key={parameter.key} className="vendor-calibration-parameter-row">
                <div>
                  <strong>{parameter.label}</strong>
                  <p>{parameter.description}</p>
                  <small>Affects: {parameter.output}</small>
                </div>
                <label>
                  <span>Value</span>
                  <div>
                    <input
                      type="number"
                      min={parameter.min}
                      max={parameter.max}
                      step={parameter.step}
                      value={value}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setParameters((current) => ({
                          ...current,
                          [parameter.key]: next,
                        }));
                      }}
                    />
                    <span>{parameter.unit ?? "value"}</span>
                  </div>
                  <small>
                    {parameter.min} to {parameter.max}
                  </small>
                </label>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section
      className="vendor-content-card admin-content-card vendor-calibration-page"
      aria-labelledby="vendor-calibration-title"
    >
      <header className="vendor-calibration-heading">
        <div>
          <p className="vendor-content-eyebrow">Student intelligence controls</p>
          <h2 id="vendor-calibration-title">Student Intelligence Calibration</h2>
          <p>
            Vendor-controlled Strategy Profile parameters used by phase adherence, guess rate, easy
            neglect, hard bias, and risk score calculations.
          </p>
        </div>
        <div className="vendor-calibration-active-version">
          <span>Active version</span>
          <strong>{activeVersion?.versionId ?? "None"}</strong>
          <small>Activated {formatDate(activeVersion?.activationDate ?? null)}</small>
        </div>
      </header>

      <div className="vendor-calibration-summary">
        <UiStatCard title="Parameters" value="14" helper="Across five Strategy Profile groups" />
        <UiStatCard
          title="Risk Weight Total"
          value={fixed(riskWeightTotal, 3)}
          helper={issues.length === 0 ? "Guardrail passed" : "Requires correction"}
        />
        <UiStatCard
          title="Simulation Scope"
          value={String(simulationMeta?.instituteIds.length ?? 0)}
          helper={
            simulationMeta
              ? `Last run ${formatDate(simulationMeta.generatedAt)}`
              : "No current simulation"
          }
        />
        <UiStatCard
          title="Projected Risk Delta"
          value={fixed(riskDelta, 2)}
          helper="After minus baseline"
        />
      </div>

      <nav className="vendor-calibration-tabs" aria-label="Calibration workspace">
        {WORKSPACE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={workspace === tab.id ? "vendor-calibration-tab-active" : ""}
            onClick={() => setWorkspace(tab.id)}
          >
            {tab.label}
            {tab.id === "parameters" && issues.length > 0 ? <span>{issues.length}</span> : null}
          </button>
        ))}
      </nav>

      {message ? (
        <p className="vendor-calibration-message" role="status">
          {message}
        </p>
      ) : null}

      {workspace === "parameters" ? (
        <div className="vendor-calibration-editor-layout">
          <aside className="vendor-calibration-version-rail">
            <header>
              <h3>Calibration versions</h3>
              <span>{versions.length}</span>
            </header>
            {versions.map((version) => (
              <button
                key={version.versionId}
                type="button"
                className={
                  selectedVersion?.versionId === version.versionId
                    ? "vendor-calibration-version-active"
                    : ""
                }
                onClick={() => loadVersion(version)}
              >
                <span>
                  <strong>{version.versionId}</strong>
                  <small>
                    {formatDate(version.createdAt)} | {version.createdBy}
                  </small>
                </span>
                <span
                  className={`vendor-status vendor-status-${version.isActive ? "active" : "draft"}`}
                >
                  {version.isActive ? "Active" : "Draft"}
                </span>
              </button>
            ))}
          </aside>
          <main className="vendor-calibration-editor">
            <div className="vendor-section-heading">
              <div>
                <h3>Parameter definition</h3>
                <p>
                  {selectedVersion?.versionId ?? "Unsaved draft"} | Vendor-controlled Strategy
                  Profile
                </p>
              </div>
              <button
                type="button"
                className="vendor-secondary-button"
                onClick={() => selectedVersion && loadVersion(selectedVersion)}
              >
                Reset values
              </button>
            </div>
            {renderParameterGroup(
              "Phase Adherence Parameters",
              "Weights used by phase objective, timing, P1 coverage, and P1 routing calculations.",
              PHASE_ADHERENCE_PARAMETERS,
            )}
            {renderParameterGroup(
              "Guess Rate Parameters",
              "Difficulty-specific factors used to calculate the per-question guess threshold.",
              GUESS_RATE_PARAMETERS,
            )}
            {renderParameterGroup(
              "Easy Neglect Parameter",
              "Easy-attempt-rate threshold used to classify easy neglect per run.",
              EASY_NEGLECT_PARAMETERS,
            )}
            {renderParameterGroup(
              "Hard Bias Parameter",
              "Tolerance factor applied to the expected hard-question ratio.",
              HARD_BIAS_PARAMETERS,
            )}
            {renderParameterGroup(
              "Risk Score Weights",
              "Contributions used by the normalized risk score. The total must equal 1.00.",
              RISK_SCORE_PARAMETERS,
            )}
            <footer className="vendor-calibration-editor-footer">
              <div
                className={
                  issues.length === 0 ? "vendor-calibration-valid" : "vendor-calibration-invalid"
                }
              >
                <strong>
                  {issues.length === 0
                    ? "All guardrails passed"
                    : `${issues.length} guardrail issue${issues.length === 1 ? "" : "s"}`}
                </strong>
                {issues.length > 0 ? (
                  <ul>
                    {issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Parameters are ready for simulation and deployment review.</p>
                )}
              </div>
              <button
                type="button"
                className="vendor-primary-action"
                onClick={() => setWorkspace("simulation")}
              >
                Open simulation
              </button>
            </footer>
          </main>
        </div>
      ) : null}

      {workspace === "simulation" ? (
        <section className="vendor-calibration-workspace-panel">
          <div className="vendor-section-heading">
            <div>
              <h3>Impact simulation</h3>
              <p>Summary-level projection across student risk and discipline metrics.</p>
            </div>
            <button
              type="button"
              className="vendor-primary-action"
              disabled={!canSimulate || isSimulating}
              onClick={() => void simulate()}
            >
              {isSimulating ? "Running..." : "Run simulation"}
            </button>
          </div>
          <div className="vendor-calibration-simulation-layout">
            <aside>
              <h4>Simulation scope</h4>
              <div className="vendor-calibration-segmented">
                {(
                  [
                    "SingleInstitute",
                    "SelectedInstitutes",
                    "AllInstitutes",
                  ] as CalibrationSimulationMode[]
                ).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={simulationMode === mode ? "vendor-calibration-segment-active" : ""}
                    onClick={() => setSimulationMode(mode)}
                  >
                    {humanize(mode)}
                  </button>
                ))}
              </div>
              <div className="vendor-calibration-institute-list">
                {dataset.institutes.map((institute) => (
                  <label key={institute.instituteId}>
                    <input
                      type={simulationMode === "SingleInstitute" ? "radio" : "checkbox"}
                      name="simulation-institute"
                      checked={
                        simulationMode === "AllInstitutes" ||
                        simulationInstituteIds.includes(institute.instituteId)
                      }
                      disabled={simulationMode === "AllInstitutes"}
                      onChange={() =>
                        simulationMode === "SingleInstitute"
                          ? setSimulationInstituteIds([institute.instituteId])
                          : toggleTarget("simulation", institute.instituteId)
                      }
                    />
                    <span>
                      <strong>{institute.instituteName}</strong>
                      <small>{institute.studentCount.toLocaleString("en-IN")} students</small>
                    </span>
                  </label>
                ))}
              </div>
              <p className="vendor-calibration-target-total">
                Evidence population:{" "}
                <strong>
                  {simulationMode === "AllInstitutes"
                    ? dataset.institutes
                        .reduce((sum, item) => sum + item.studentCount, 0)
                        .toLocaleString("en-IN")
                    : targetStudentCount.toLocaleString("en-IN")}
                </strong>{" "}
                students
              </p>
            </aside>
            <main>
              <div className="vendor-calibration-impact-grid">
                <UiStatCard
                  title="Risk Score"
                  value={`${fixed(simulationSummary.beforeAverageRiskScore)} → ${fixed(simulationSummary.afterAverageRiskScore)}`}
                  helper={`Delta ${fixed(riskDelta)}`}
                />
                <UiStatCard
                  title="Discipline Index"
                  value={`${fixed(simulationSummary.beforeDisciplineIndex)} → ${fixed(simulationSummary.afterDisciplineIndex)}`}
                  helper={`Delta ${fixed(disciplineDelta)}`}
                />
                <UiStatCard
                  title="Cluster Movement"
                  value={`${fixed(simulationSummary.clusterMovementPercent)}%`}
                  helper="Projected reassignment"
                />
                <UiStatCard
                  title="Alert Delta"
                  value={String(simulationSummary.estimatedAlertDelta)}
                  helper="Projected alert volume"
                />
              </div>
              <section className="vendor-calibration-distribution">
                <h4>Risk distribution movement</h4>
                {(["low", "medium", "high"] as const).map((risk) => (
                  <div key={risk}>
                    <strong>{humanize(risk)}</strong>
                    <span>
                      {simulationSummary.riskDistributionShift[risk].count > 0 ? "+" : ""}
                      {simulationSummary.riskDistributionShift[risk].count} students
                    </span>
                    <span>{fixed(simulationSummary.riskDistributionShift[risk].percent)}%</span>
                  </div>
                ))}
              </section>
              <div className="vendor-calibration-simulation-meta">
                <span>Stability impact</span>
                <strong>{humanize(simulationSummary.stabilityImpact)}</strong>
                <span>Engine</span>
                <strong>{simulationMeta?.engineSource ?? "Not run"}</strong>
              </div>
            </main>
          </div>
        </section>
      ) : null}

      {workspace === "deployment" ? (
        <section className="vendor-calibration-workspace-panel">
          <div className="vendor-section-heading">
            <div>
              <h3>Controlled deployment</h3>
              <p>Publish a simulated version globally or to a selected institute set.</p>
            </div>
            <span className={`vendor-status vendor-status-${canDeploy ? "active" : "pending"}`}>
              {canDeploy ? "Ready" : "Blocked"}
            </span>
          </div>
          <div className="vendor-calibration-deployment-layout">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void deploy();
              }}
            >
              <div className="vendor-onboarding-form-grid">
                <UiFormField label="Calibration version" htmlFor="cal-deploy-version">
                  <select
                    id="cal-deploy-version"
                    value={selectedVersionId}
                    onChange={(event) => {
                      const version = versions.find(
                        (item) => item.versionId === event.target.value,
                      );
                      if (version) loadVersion(version);
                    }}
                  >
                    {versions.map((version) => (
                      <option key={version.versionId} value={version.versionId}>
                        {version.versionId}
                        {version.isActive ? " (Active)" : ""}
                      </option>
                    ))}
                  </select>
                </UiFormField>
                <UiFormField label="Activation date" htmlFor="cal-activation-date">
                  <input
                    id="cal-activation-date"
                    type="date"
                    value={activationDate}
                    onChange={(event) => setActivationDate(event.target.value)}
                  />
                </UiFormField>
              </div>
              <fieldset className="vendor-calibration-scope">
                <legend>Deployment scope</legend>
                <label>
                  <input
                    type="radio"
                    name="push-scope"
                    checked={pushScope === "ApplyToSelectedInstitutes"}
                    onChange={() => setPushScope("ApplyToSelectedInstitutes")}
                  />
                  Selected institutes
                </label>
                <label>
                  <input
                    type="radio"
                    name="push-scope"
                    checked={pushScope === "ApplyGlobally"}
                    onChange={() => setPushScope("ApplyGlobally")}
                  />
                  All institutes
                </label>
              </fieldset>
              {pushScope === "ApplyToSelectedInstitutes" ? (
                <div className="vendor-calibration-deploy-targets">
                  {dataset.institutes.map((institute) => (
                    <label key={institute.instituteId}>
                      <input
                        type="checkbox"
                        checked={deploymentInstituteIds.includes(institute.instituteId)}
                        onChange={() => toggleTarget("deployment", institute.instituteId)}
                      />
                      {institute.instituteName}
                    </label>
                  ))}
                </div>
              ) : null}
              <label className="vendor-inline-checkbox">
                <input
                  type="checkbox"
                  checked={draftModeOnly}
                  onChange={(event) => setDraftModeOnly(event.target.checked)}
                />
                <span>Stage as draft before activation</span>
              </label>
              <UiFormField
                label="Deployment note"
                htmlFor="cal-deploy-note"
                helper="Stored with the immutable calibration audit record."
              >
                <textarea
                  id="cal-deploy-note"
                  rows={4}
                  value={operatorNote}
                  onChange={(event) => setOperatorNote(event.target.value)}
                />
              </UiFormField>
              <button
                type="submit"
                className="vendor-primary-action"
                disabled={!canDeploy || isPushing}
              >
                {isPushing
                  ? "Publishing..."
                  : draftModeOnly
                    ? "Stage deployment"
                    : "Publish calibration"}
              </button>
            </form>
            <aside className="vendor-calibration-release-checklist">
              <h4>Release checks</h4>
              <div className={issues.length === 0 ? "complete" : "advisory"}>
                <span>{issues.length === 0 ? "Complete" : "Review"}</span>
                <strong>Parameter guardrails</strong>
                <small>
                  {issues.length === 0
                    ? "All parameter values are valid."
                    : `${issues.length} issues require correction.`}
                </small>
              </div>
              <div className={simulationMeta ? "complete" : "advisory"}>
                <span>{simulationMeta ? "Complete" : "Recommended"}</span>
                <strong>Impact simulation</strong>
                <small>
                  {simulationMeta
                    ? `${simulationMeta.instituteIds.length} institutes simulated on ${formatDate(simulationMeta.generatedAt)}.`
                    : "Run a simulation using the current parameter values."}
                </small>
              </div>
              <div
                className={
                  pushScope === "ApplyGlobally" || deploymentInstituteIds.length > 0
                    ? "complete"
                    : "blocked"
                }
              >
                <span>
                  {pushScope === "ApplyGlobally" || deploymentInstituteIds.length > 0
                    ? "Complete"
                    : "Required"}
                </span>
                <strong>Deployment scope</strong>
                <small>
                  {pushScope === "ApplyGlobally"
                    ? "All institutes"
                    : `${deploymentInstituteIds.length} selected institutes`}
                </small>
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {workspace === "history" ? (
        <section className="vendor-calibration-workspace-panel">
          <div className="vendor-section-heading">
            <div>
              <h3>Version and audit history</h3>
              <p>Immutable deployment history with controlled rollback.</p>
            </div>
          </div>
          <UiTable
            caption="Calibration versions"
            columns={versionColumns}
            rows={versions}
            rowKey={(row) => row.versionId}
            emptyStateText="No versions available."
          />
          {selectedVersion ? (
            <div className="vendor-calibration-history-detail">
              <div>
                <span>Selected version</span>
                <strong>{selectedVersion.versionId}</strong>
                <small>
                  Created by {selectedVersion.createdBy} on {formatDate(selectedVersion.createdAt)}
                </small>
              </div>
              <ul>
                {selectedVersion.parameterChanges.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
              <button
                type="button"
                className="vendor-secondary-button"
                disabled={selectedVersion.rollbackStatus === "rolled_back"}
                onClick={() => queueRollback(selectedVersion)}
              >
                Queue rollback
              </button>
            </div>
          ) : null}
          <h4 className="vendor-calibration-audit-title">Latest audit records</h4>
          <UiTable
            caption="Latest calibration audit records"
            columns={[
              { id: "date", header: "Date", render: (row) => formatDate(row.createdAt) },
              { id: "action", header: "Action", render: (row) => humanize(row.actionType) },
              { id: "actor", header: "Actor", render: (row) => row.actorUid },
              { id: "scope", header: "Scope", render: (row) => humanize(row.eventScope) },
              { id: "note", header: "Note", render: (row) => row.note },
            ]}
            rows={auditRecords}
            rowKey={(row) => row.id}
            emptyStateText="No audit records."
          />
          {activity.length > 0 ? (
            <section className="vendor-calibration-local-activity">
              <h4>Current session activity</h4>
              <ol>
                {activity.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </section>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

export default VendorCalibrationWorkspace;
