import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  fetchDashboardDataset,
  formatIsoDate,
  formatPercent,
  shouldUseLiveApi,
  type RunAnalyticsRecord,
  type TemplateAnalyticsRecord,
  type TemplateAnalyticsRunRecord,
} from "./analyticsDataset";
import AnalyticsWorkspaceNav from "./AnalyticsWorkspaceNav";

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
    avgRiskShiftPercent: 14,
    avgDisciplineStressScore: 31,
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
    avgRiskShiftPercent: 19,
    avgDisciplineStressScore: 37,
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

function normalizeTemplateName(runName: string): string {
  return runName.split("/")[0]?.trim() || runName.trim();
}

function inferExamType(templateName: string): string {
  const normalized = templateName.toLowerCase();
  if (normalized.includes("neet")) {
    return "NEET";
  }
  if (normalized.includes("jee")) {
    return "JEEMains";
  }
  if (normalized.includes("foundation")) {
    return "Foundation";
  }
  return "General";
}

function toTemplateId(templateName: string, index: number): string {
  const slug = templateName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? `tmpl-live-${slug}` : `tmpl-live-${index + 1}`;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = average(values);
  return average(values.map((value) => (value - mean) ** 2));
}

function buildTemplateRunRecord(run: RunAnalyticsRecord): TemplateAnalyticsRunRecord {
  const riskShiftPercent =
    run.riskDistribution.high + run.riskDistribution.critical + Math.round(run.guessRatePercent * 0.25);
  const stabilityIndex = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        run.disciplineIndexAverage -
          ((run.guessRatePercent + run.pacingGuardrailViolationPercent + run.structuralOverridePercent) / 3),
      ),
    ),
  );

  return {
    runId: run.runId,
    runName: run.runName,
    completedOn: run.startedAt,
    mode: run.mode,
    avgRawScorePercent: run.avgRawScorePercent,
    avgAccuracyPercent: run.avgAccuracyPercent,
    phaseAdherencePercent: run.avgPhaseAdherencePercent,
    stabilityIndex,
    riskShiftPercent: Math.max(0, Math.min(100, riskShiftPercent)),
    disciplineStressScore: Math.max(0, Math.min(100, Math.round(100 - run.disciplineIndexAverage + run.guessRatePercent * 0.4))),
  };
}

function buildTemplateAnalyticsFromRuns(runs: RunAnalyticsRecord[]): TemplateAnalyticsRecord[] {
  const groupedRuns = new Map<string, RunAnalyticsRecord[]>();

  for (const run of runs) {
    const templateName = normalizeTemplateName(run.runName);
    const existing = groupedRuns.get(templateName) ?? [];
    existing.push(run);
    groupedRuns.set(templateName, existing);
  }

  return [...groupedRuns.entries()]
    .map(([templateName, templateRuns], index) => {
      const sortedRuns = [...templateRuns].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
      const runRecords = sortedRuns.map(buildTemplateRunRecord);
      const avgRawScorePercent = Math.round(average(runRecords.map((run) => run.avgRawScorePercent)));
      const avgAccuracyPercent = Math.round(average(runRecords.map((run) => run.avgAccuracyPercent)));
      const avgDisciplineIndex = Math.round(average(sortedRuns.map((run) => run.disciplineIndexAverage)));
      const rawVariance = Math.round(variance(runRecords.map((run) => run.avgRawScorePercent)));
      const phaseAdherenceVariance = Math.round(variance(runRecords.map((run) => run.phaseAdherencePercent)));
      const averageRiskShift = average(runRecords.map((run) => run.riskShiftPercent));
      const avgRiskShiftPercent = Math.round(averageRiskShift);
      const avgDisciplineStressScore = Math.round(average(runRecords.map((run) => run.disciplineStressScore)));
      const templateEffectivenessRating = Math.max(
        0,
        Math.min(
          100,
          Math.round((avgRawScorePercent * 0.4) + (avgDisciplineIndex * 0.3) + ((100 - averageRiskShift) * 0.3)),
        ),
      );

      return {
        templateId: toTemplateId(templateName, index),
        templateName,
        academicYear: sortedRuns[0]?.academicYear ?? "2026",
        examType: inferExamType(templateName),
        totalRuns: runRecords.length,
        avgRawScorePercent,
        avgAccuracyPercent,
        rawVariance,
        phaseAdherenceVariance,
        avgRiskShiftPercent,
        avgDisciplineStressScore,
        avgDisciplineIndex,
        templateEffectivenessRating,
        runs: runRecords,
      };
    })
    .sort((left, right) => right.totalRuns - left.totalRuns || left.templateName.localeCompare(right.templateName));
}

function AdminTemplateAnalyticsPage() {
  const navigate = useNavigate();
  const params = useParams<{ testId?: string }>();
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL1OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const [templates, setTemplates] = useState<TemplateAnalyticsRecord[]>(TEMPLATE_ANALYTICS_FIXTURES);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTemplates() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setTemplates(TEMPLATE_ANALYTICS_FIXTURES);
        setInlineMessage("Local mode detected. Loaded deterministic templateAnalytics fixtures for the dedicated template workspace.");
        setIsLoading(false);
        return;
      }

      try {
        const dataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        const liveTemplates = dataset.templateAnalytics.length > 0 ?
          dataset.templateAnalytics :
          buildTemplateAnalyticsFromRuns(dataset.runAnalytics);
        setTemplates(liveTemplates.length > 0 ? liveTemplates : TEMPLATE_ANALYTICS_FIXTURES);
        setInlineMessage(
          dataset.templateAnalytics.length > 0 ?
            "Live mode enabled: template analytics hydrated from templateAnalytics summaries in GET /admin/analytics." :
            "Live mode enabled: templateAnalytics was empty, so the workspace derived a temporary summary from runAnalytics.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load template analytics data.";
        setTemplates(TEMPLATE_ANALYTICS_FIXTURES);
        setInlineMessage(`${reason} Falling back to deterministic templateAnalytics fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedTemplate = useMemo(() => {
    return (
      templates.find((entry) => entry.templateId === params.testId) ??
      templates[0] ??
      null
    );
  }, [params.testId, templates]);

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

  const l1Kpis = useMemo(() => {
    if (!selectedTemplate) {
      return [];
    }

    return [
      {
        label: "Number of Runs",
        value: String(selectedTemplate.totalRuns),
        helper: "templateAnalytics run count",
      },
      {
        label: "Avg Raw Score",
        value: formatPercent(selectedTemplate.avgRawScorePercent),
        helper: "L1 cross-run outcome",
      },
      {
        label: "Avg Accuracy",
        value: formatPercent(selectedTemplate.avgAccuracyPercent),
        helper: "L1 cross-run outcome",
      },
      {
        label: "Raw Variance",
        value: String(selectedTemplate.rawVariance),
        helper: "L1 structural consistency",
      },
    ];
  }, [selectedTemplate]);

  const l2Kpis = useMemo(() => {
    if (!selectedTemplate || !isL2OrAbove) {
      return [];
    }

    return [
      {
        label: "Stability Index",
        value: String(Math.round(average(selectedTemplate.runs.map((run) => run.stabilityIndex)))),
        helper: "average stability per run",
      },
      {
        label: "Phase Variance",
        value: String(selectedTemplate.phaseAdherenceVariance),
        helper: "phase adherence spread",
      },
      {
        label: "Risk Shift",
        value: formatPercent(selectedTemplate.avgRiskShiftPercent),
        helper: "average risk movement",
      },
      {
        label: "Discipline Stress",
        value: String(selectedTemplate.avgDisciplineStressScore),
        helper: "execution strain score",
      },
      {
        label: "Effectiveness Rating",
        value: String(selectedTemplate.templateEffectivenessRating),
        helper: "precomputed template score",
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
      ...(isL2OrAbove
        ? [
            {
              id: "phase",
              header: "Phase Adherence",
              render: (run: TemplateAnalyticsRunRecord) => formatPercent(run.phaseAdherencePercent),
            },
            {
              id: "stability",
              header: "Stability Index",
              render: (run: TemplateAnalyticsRunRecord) => run.stabilityIndex,
            },
            {
              id: "risk",
              header: "Risk Shift",
              render: (run: TemplateAnalyticsRunRecord) => formatPercent(run.riskShiftPercent),
            },
            {
              id: "discipline",
              header: "Discipline Stress",
              render: (run: TemplateAnalyticsRunRecord) => run.disciplineStressScore,
            },
          ]
        : []),
    ],
    [isL2OrAbove],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-template-analytics-title">
      <p className="admin-content-eyebrow">Analytics Template Workspace</p>
      <h2 id="admin-template-analytics-title">Template Performance Drill-Down</h2>
      <p className="admin-content-copy">
        This dedicated analytics route isolates <code>/admin/analytics/template/:testId</code> from overview, run,
        and student analytics. It now hydrates template-level structural summaries from the live admin analytics
        payload when available, while preserving deterministic fixture coverage in local mode.
      </p>

      <AnalyticsWorkspaceNav />

      {inlineMessage ? <p className="admin-analytics-inline-note">{inlineMessage}</p> : null}

      <div className="admin-risk-summary-card">
        <h4>Template Selection</h4>
        <p>
          Select a template analytics summary to compare cross-run structural quality, consistency, and execution
          stress without leaving the analytics module.
        </p>
        <small>Route: /admin/analytics/template/{selectedTemplate?.templateId ?? "templateId"}</small>
      </div>

      {isLoading ? <p className="admin-analytics-inline-note">Loading template analytics summaries...</p> : null}

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
            {templates.map((entry) => (
              <option key={entry.templateId} value={entry.templateId}>
                {entry.templateName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!isL1OrAbove ? (
        <div className="admin-risk-summary-card">
          <h4>Template Analytics Locked</h4>
          <p>
            The By Template workspace starts at L1. L0 users keep the clean yearly overview without cross-run
            structural quality or execution diagnostics.
          </p>
          <small>Visibility matrix: By Template has no L0 metric surface.</small>
        </div>
      ) : selectedTemplate ? (
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

          <h3 className="admin-tests-analytics-section-title">L1 Structural Quality</h3>
          <div className="admin-analytics-kpi-grid">
            {l1Kpis.map((kpi) => (
              <article key={kpi.label} className="admin-analytics-kpi-card">
                <p>{kpi.label}</p>
                <h3>{kpi.value}</h3>
                <small>{kpi.helper}</small>
              </article>
            ))}
          </div>

          {isL2OrAbove ? (
            <>
              <h3 className="admin-tests-analytics-section-title">L2 Execution Quality</h3>
              <div className="admin-analytics-kpi-grid">
                {l2Kpis.map((kpi) => (
                  <article key={kpi.label} className="admin-analytics-kpi-card">
                    <p>{kpi.label}</p>
                    <h3>{kpi.value}</h3>
                    <small>{kpi.helper}</small>
                  </article>
                ))}
              </div>
            </>
          ) : null}

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
            {isL2OrAbove ? (
              <>
                <UiChartContainer
                  title="Risk Shift Per Run"
                  subtitle="Structural risk movement across template usage"
                  data={riskShiftChart}
                  maxValue={100}
                />
                <UiChartContainer
                  title="Stability Index Per Run"
                  subtitle="Execution stability trajectory across runs"
                  data={stabilityChart}
                  maxValue={100}
                  variant="line"
                />
              </>
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
            {isL2OrAbove ? (
              <>
                <article className="admin-risk-summary-card">
                  <h4>Phase Consistency</h4>
                  <p>
                    Phase adherence variance is {selectedTemplate.phaseAdherenceVariance}, showing how evenly this
                    template holds timing structure from one run to the next.
                  </p>
                  <small>Derived from summary-only phase adherence snapshots</small>
                </article>
                <article className="admin-risk-summary-card">
                  <h4>L2 Effectiveness</h4>
                  <p>
                    Template effectiveness is rated {selectedTemplate.templateEffectivenessRating} with an average
                    discipline index of {formatPercent(selectedTemplate.avgDisciplineIndex)} and discipline stress score
                    of {selectedTemplate.avgDisciplineStressScore}.
                  </p>
                  <small>Structural stress and discipline signals unlock at L2+</small>
                </article>
              </>
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
