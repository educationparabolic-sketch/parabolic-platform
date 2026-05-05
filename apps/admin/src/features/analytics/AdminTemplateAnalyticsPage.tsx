import { useMemo } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { formatIsoDate, formatPercent, shouldUseLiveApi } from "./analyticsDataset";

interface TemplateAnalyticsRunRecord {
  runId: string;
  runName: string;
  completedOn: string;
  mode: string;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  phaseAdherencePercent: number;
  stabilityIndex: number;
  riskShiftPercent: number;
  disciplineStressScore: number;
}

interface TemplateAnalyticsRecord {
  templateId: string;
  templateName: string;
  academicYear: string;
  examType: string;
  totalRuns: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  rawVariance: number;
  phaseAdherenceVariance: number;
  avgDisciplineIndex: number;
  templateEffectivenessRating: number;
  runs: TemplateAnalyticsRunRecord[];
}

const TEMPLATE_ANALYTICS_FIXTURES: TemplateAnalyticsRecord[] = [
  {
    templateId: "tmpl-001",
    templateName: "JEE Mains Mock - Set A",
    academicYear: "2026",
    examType: "JEEMains",
    totalRuns: 3,
    avgRawScorePercent: 66,
    avgAccuracyPercent: 74,
    rawVariance: 10,
    phaseAdherenceVariance: 7,
    avgDisciplineIndex: 71,
    templateEffectivenessRating: 73,
    runs: [
      {
        runId: "run-2026-0410-001",
        runName: "JEE Mains Mock - Set A / Alpha",
        completedOn: "2026-04-10T06:30:00.000Z",
        mode: "Controlled",
        avgRawScorePercent: 68,
        avgAccuracyPercent: 76,
        phaseAdherencePercent: 81,
        stabilityIndex: 78,
        riskShiftPercent: 12,
        disciplineStressScore: 28,
      },
      {
        runId: "run-2026-0407-002",
        runName: "JEE Mains Mock - Set A / Beta",
        completedOn: "2026-04-07T06:30:00.000Z",
        mode: "Operational",
        avgRawScorePercent: 64,
        avgAccuracyPercent: 72,
        phaseAdherencePercent: 76,
        stabilityIndex: 70,
        riskShiftPercent: 16,
        disciplineStressScore: 34,
      },
      {
        runId: "run-2026-0404-001",
        runName: "JEE Mains Mock - Set A / Gamma",
        completedOn: "2026-04-04T06:30:00.000Z",
        mode: "Diagnostic",
        avgRawScorePercent: 66,
        avgAccuracyPercent: 73,
        phaseAdherencePercent: 79,
        stabilityIndex: 74,
        riskShiftPercent: 14,
        disciplineStressScore: 31,
      },
    ],
  },
  {
    templateId: "tmpl-002",
    templateName: "NEET Revision - Biology Focus",
    academicYear: "2026",
    examType: "NEET",
    totalRuns: 4,
    avgRawScorePercent: 61,
    avgAccuracyPercent: 70,
    rawVariance: 14,
    phaseAdherenceVariance: 9,
    avgDisciplineIndex: 66,
    templateEffectivenessRating: 66,
    runs: [
      {
        runId: "run-2026-0409-003",
        runName: "Biology Focus / Beta",
        completedOn: "2026-04-09T05:00:00.000Z",
        mode: "Diagnostic",
        avgRawScorePercent: 62,
        avgAccuracyPercent: 71,
        phaseAdherencePercent: 75,
        stabilityIndex: 67,
        riskShiftPercent: 18,
        disciplineStressScore: 37,
      },
      {
        runId: "run-2026-0406-002",
        runName: "Biology Focus / Alpha",
        completedOn: "2026-04-06T05:00:00.000Z",
        mode: "Operational",
        avgRawScorePercent: 58,
        avgAccuracyPercent: 68,
        phaseAdherencePercent: 72,
        stabilityIndex: 63,
        riskShiftPercent: 22,
        disciplineStressScore: 41,
      },
      {
        runId: "run-2026-0402-001",
        runName: "Biology Focus / Revision Camp",
        completedOn: "2026-04-02T05:00:00.000Z",
        mode: "Controlled",
        avgRawScorePercent: 64,
        avgAccuracyPercent: 73,
        phaseAdherencePercent: 79,
        stabilityIndex: 72,
        riskShiftPercent: 15,
        disciplineStressScore: 30,
      },
      {
        runId: "run-2026-0329-001",
        runName: "Biology Focus / Deep Drill",
        completedOn: "2026-03-29T05:00:00.000Z",
        mode: "Operational",
        avgRawScorePercent: 60,
        avgAccuracyPercent: 69,
        phaseAdherencePercent: 74,
        stabilityIndex: 64,
        riskShiftPercent: 20,
        disciplineStressScore: 39,
      },
    ],
  },
];

function buildRunComparisonChart(template: TemplateAnalyticsRecord): UiChartPoint[] {
  return template.runs.map((run) => ({
    label: formatIsoDate(run.completedOn),
    value: run.avgRawScorePercent,
  }));
}

function buildAccuracyTrendChart(template: TemplateAnalyticsRecord): UiChartPoint[] {
  return template.runs.map((run) => ({
    label: formatIsoDate(run.completedOn),
    value: run.avgAccuracyPercent,
  }));
}

function buildStabilityChart(template: TemplateAnalyticsRecord): UiChartPoint[] {
  return template.runs.map((run) => ({
    label: formatIsoDate(run.completedOn),
    value: run.stabilityIndex,
  }));
}

function buildRiskShiftChart(template: TemplateAnalyticsRecord): UiChartPoint[] {
  return template.runs.map((run) => ({
    label: run.mode,
    value: run.riskShiftPercent,
  }));
}

function AdminTemplateAnalyticsPage() {
  const navigate = useNavigate();
  const params = useParams<{ testId?: string }>();
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;

  const selectedTemplate = useMemo(() => {
    return (
      TEMPLATE_ANALYTICS_FIXTURES.find((entry) => entry.templateId === params.testId) ??
      TEMPLATE_ANALYTICS_FIXTURES[0] ??
      null
    );
  }, [params.testId]);

  const runComparisonChart = useMemo(
    () => (selectedTemplate ? buildRunComparisonChart(selectedTemplate) : []),
    [selectedTemplate],
  );
  const accuracyTrendChart = useMemo(
    () => (selectedTemplate ? buildAccuracyTrendChart(selectedTemplate) : []),
    [selectedTemplate],
  );
  const stabilityChart = useMemo(
    () => (selectedTemplate ? buildStabilityChart(selectedTemplate) : []),
    [selectedTemplate],
  );
  const riskShiftChart = useMemo(
    () => (selectedTemplate ? buildRiskShiftChart(selectedTemplate) : []),
    [selectedTemplate],
  );

  const kpis = useMemo(() => {
    if (!selectedTemplate) {
      return [];
    }

    const base = [
      {
        label: "Tracked Runs",
        value: String(selectedTemplate.totalRuns),
        helper: "templateAnalytics summary",
      },
      {
        label: "Avg Raw Score",
        value: formatPercent(selectedTemplate.avgRawScorePercent),
        helper: "cross-run template outcome",
      },
      {
        label: "Avg Accuracy",
        value: formatPercent(selectedTemplate.avgAccuracyPercent),
        helper: "cross-run template outcome",
      },
      {
        label: "Raw Variance",
        value: String(selectedTemplate.rawVariance),
        helper: "structural consistency indicator",
      },
    ];

    if (!isL2OrAbove) {
      return base;
    }

    return [
      ...base,
      {
        label: "Effectiveness Rating",
        value: String(selectedTemplate.templateEffectivenessRating),
        helper: "precomputed structural score",
      },
      {
        label: "Avg Discipline Index",
        value: formatPercent(selectedTemplate.avgDisciplineIndex),
        helper: "L2 discipline view",
      },
      {
        label: "Phase Variance",
        value: String(selectedTemplate.phaseAdherenceVariance),
        helper: "phase adherence spread",
      },
    ];
  }, [isL2OrAbove, selectedTemplate]);

  const runColumns = useMemo<UiTableColumn<TemplateAnalyticsRunRecord>[]>(
    () => [
      {
        id: "run",
        header: "Run",
        render: (run) => (
          <div className="admin-analytics-run-cell">
            <strong>{run.runName}</strong>
            <small>{run.runId}</small>
          </div>
        ),
      },
      {
        id: "mode",
        header: "Mode",
        render: (run) => (
          <div className="admin-analytics-mode-cell">
            <strong>{run.mode}</strong>
            <small>{formatIsoDate(run.completedOn)}</small>
          </div>
        ),
      },
      {
        id: "raw",
        header: "Raw / Accuracy",
        render: (run) => (
          <div className="admin-analytics-score-cell">
            <strong>{formatPercent(run.avgRawScorePercent)}</strong>
            <small>{formatPercent(run.avgAccuracyPercent)} accuracy</small>
          </div>
        ),
      },
      {
        id: "phase",
        header: "Phase Adherence",
        render: (run) => formatPercent(run.phaseAdherencePercent),
      },
      {
        id: "stability",
        header: "Stability Index",
        render: (run) => run.stabilityIndex,
      },
      {
        id: "risk",
        header: "Risk Shift",
        render: (run) => formatPercent(run.riskShiftPercent),
      },
    ],
    [],
  );

  const inlineMessage = shouldUseLiveApi() ?
    "Dedicated template route is mounted. Live templateAnalytics hydration remains tracked separately while this workspace uses summary-safe structural fixtures." :
    "Local mode detected. Loaded deterministic templateAnalytics fixtures for the dedicated template workspace.";

  return (
    <section className="admin-content-card" aria-labelledby="admin-template-analytics-title">
      <p className="admin-content-eyebrow">Analytics Template Workspace</p>
      <h2 id="admin-template-analytics-title">Template Performance Drill-Down</h2>
      <p className="admin-content-copy">
        This dedicated analytics route isolates <code>/admin/analytics/template/:testId</code> from overview, run,
        and student analytics. It stays on summary-safe <code>templateAnalytics</code> style inputs for structural
        quality review instead of recomputing from raw sessions.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/analytics/overview">
          Analytics Overview
        </NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/analytics/run/run-2026-0410-001">
          Sample Run Analytics
        </NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/analytics/student/std-1004">
          Sample Student Analytics
        </NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/tests/analytics">
          Test Template Workspace
        </NavLink>
      </p>

      <p className="admin-analytics-inline-note">{inlineMessage}</p>

      <div className="admin-risk-summary-card">
        <h4>Template Selection</h4>
        <p>
          Select a template analytics summary to compare cross-run structural quality, consistency, and execution
          stress without leaving the analytics module.
        </p>
        <small>Route: /admin/analytics/template/{selectedTemplate?.templateId ?? "templateId"}</small>
      </div>

      <div className="admin-analytics-filter-grid">
        <label htmlFor="admin-template-analytics-template">
          Template
          <select
            id="admin-template-analytics-template"
            value={selectedTemplate?.templateId ?? ""}
            onChange={(event) => {
              navigate(`/admin/analytics/template/${event.target.value}`);
            }}
          >
            {TEMPLATE_ANALYTICS_FIXTURES.map((entry) => (
              <option key={entry.templateId} value={entry.templateId}>
                {entry.templateName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedTemplate ? (
        <>
          <div className="admin-analytics-run-detail-header">
            <div>
              <h3>{selectedTemplate.templateName}</h3>
              <p>
                {selectedTemplate.examType} template · {selectedTemplate.academicYear} academic year ·{" "}
                {selectedTemplate.totalRuns} tracked runs
              </p>
            </div>
            <div className="admin-analytics-run-source-chip">templateAnalytics summary</div>
          </div>

          <div className="admin-analytics-kpi-grid">
            {kpis.map((kpi) => (
              <article key={kpi.label} className="admin-analytics-kpi-card">
                <p>{kpi.label}</p>
                <h3>{kpi.value}</h3>
                <small>{kpi.helper}</small>
              </article>
            ))}
          </div>

          <div className="admin-analytics-chart-grid">
            <UiChartContainer
              title="Run Comparison"
              subtitle="Average raw score by run"
              data={runComparisonChart}
              maxValue={100}
              variant="line"
            />
            <UiChartContainer
              title="Accuracy Trend"
              subtitle="Average accuracy by run"
              data={accuracyTrendChart}
              maxValue={100}
              variant="line"
            />
            <UiChartContainer
              title="Risk Shift Per Run"
              subtitle="Structural risk movement across template usage"
              data={riskShiftChart}
              maxValue={100}
            />
            {isL2OrAbove ? (
              <UiChartContainer
                title="Stability Index"
                subtitle="Execution stability trajectory across runs"
                data={stabilityChart}
                maxValue={100}
                variant="line"
              />
            ) : null}
          </div>

          <div className="admin-analytics-compliance-panel">
            <article className="admin-risk-summary-card">
              <h4>L1 Structural Snapshot</h4>
              <p>
                Raw variance sits at {selectedTemplate.rawVariance}, while the template averages{" "}
                {formatPercent(selectedTemplate.avgRawScorePercent)} raw and{" "}
                {formatPercent(selectedTemplate.avgAccuracyPercent)} accuracy across tracked runs.
              </p>
              <small>Cross-run structural quality evaluation</small>
            </article>
            <article className="admin-risk-summary-card">
              <h4>Phase Consistency</h4>
              <p>
                Phase adherence variance is {selectedTemplate.phaseAdherenceVariance}, showing how evenly this template
                holds timing structure from one run to the next.
              </p>
              <small>Derived from summary-only phase adherence snapshots</small>
            </article>
            {isL2OrAbove ? (
              <article className="admin-risk-summary-card">
                <h4>L2 Effectiveness</h4>
                <p>
                  Template effectiveness is rated {selectedTemplate.templateEffectivenessRating} with an average
                  discipline index of {formatPercent(selectedTemplate.avgDisciplineIndex)}.
                </p>
                <small>Structural stress and discipline signals unlock at L2+</small>
              </article>
            ) : null}
          </div>

          <section className="admin-analytics-run-summary" aria-labelledby="admin-template-analytics-runs-title">
            <h3 id="admin-template-analytics-runs-title">Tracked Template Runs</h3>
            <UiTable
              caption="Template analytics run comparison"
              columns={runColumns}
              rows={selectedTemplate.runs}
              rowKey={(row) => row.runId}
              emptyStateText="No run summaries are available for this template."
            />
          </section>
        </>
      ) : null}
    </section>
  );
}

export default AdminTemplateAnalyticsPage;
