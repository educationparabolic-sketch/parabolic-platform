import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import {
  fetchDashboardDataset,
  type RunAnalyticsRecord,
} from "../analytics/analyticsDataset";
import TestsWorkspaceNav from "./TestsWorkspaceNav";

const apiClient = getPortalApiClient("admin");

interface TemplateAnalyticsRunRow {
  runId: string;
  runName: string;
  completedOn: string;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  phaseAdherenceVariance: number;
  riskShiftPercent: number;
}

interface TemplateAnalyticsDetailRecord {
  id: string;
  templateName: string;
  examType: string;
  status: string;
  runCount: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  phaseAdherenceVariance: number;
  riskShiftAveragePercent: number;
  effectivenessRating: number;
  runs: TemplateAnalyticsRunRow[];
}

const TEMPLATE_ANALYTICS_DETAILS: TemplateAnalyticsDetailRecord[] = [
  {
    id: "tmpl-001",
    templateName: "JEE Mains Mock - Set A",
    examType: "JEEMains",
    status: "draft",
    runCount: 3,
    avgRawScorePercent: 66,
    avgAccuracyPercent: 74,
    phaseAdherenceVariance: 7,
    riskShiftAveragePercent: 14,
    effectivenessRating: 73,
    runs: [
      {
        runId: "run-2026-0410-001",
        runName: "Alpha Mock",
        completedOn: "2026-04-10T06:30:00.000Z",
        avgRawScorePercent: 68,
        avgAccuracyPercent: 76,
        phaseAdherenceVariance: 6,
        riskShiftPercent: 12,
      },
      {
        runId: "run-2026-0407-002",
        runName: "Beta Mock",
        completedOn: "2026-04-07T06:30:00.000Z",
        avgRawScorePercent: 64,
        avgAccuracyPercent: 72,
        phaseAdherenceVariance: 8,
        riskShiftPercent: 16,
      },
      {
        runId: "run-2026-0404-001",
        runName: "Gamma Mock",
        completedOn: "2026-04-04T06:30:00.000Z",
        avgRawScorePercent: 66,
        avgAccuracyPercent: 73,
        phaseAdherenceVariance: 7,
        riskShiftPercent: 14,
      },
    ],
  },
  {
    id: "tmpl-002",
    templateName: "NEET Revision - Biology Focus",
    examType: "NEET",
    status: "assigned",
    runCount: 4,
    avgRawScorePercent: 61,
    avgAccuracyPercent: 70,
    phaseAdherenceVariance: 9,
    riskShiftAveragePercent: 19,
    effectivenessRating: 66,
    runs: [
      {
        runId: "run-2026-0409-003",
        runName: "Biology Focus / Beta",
        completedOn: "2026-04-09T05:00:00.000Z",
        avgRawScorePercent: 62,
        avgAccuracyPercent: 71,
        phaseAdherenceVariance: 8,
        riskShiftPercent: 18,
      },
      {
        runId: "run-2026-0406-002",
        runName: "Biology Focus / Alpha",
        completedOn: "2026-04-06T05:00:00.000Z",
        avgRawScorePercent: 58,
        avgAccuracyPercent: 68,
        phaseAdherenceVariance: 10,
        riskShiftPercent: 22,
      },
      {
        runId: "run-2026-0402-001",
        runName: "Revision Camp",
        completedOn: "2026-04-02T05:00:00.000Z",
        avgRawScorePercent: 64,
        avgAccuracyPercent: 73,
        phaseAdherenceVariance: 7,
        riskShiftPercent: 15,
      },
      {
        runId: "run-2026-0329-001",
        runName: "Deep Drill",
        completedOn: "2026-03-29T05:00:00.000Z",
        avgRawScorePercent: 60,
        avgAccuracyPercent: 69,
        phaseAdherenceVariance: 9,
        riskShiftPercent: 20,
      },
    ],
  },
];

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function toChartPoints(
  runs: TemplateAnalyticsRunRow[],
  selector: (run: TemplateAnalyticsRunRow) => number,
): UiChartPoint[] {
  return runs.map((run) => ({
    label: formatIsoDate(run.completedOn),
    value: selector(run),
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
  return slug.length > 0 ? `tmpl-test-analytics-${slug}` : `tmpl-test-analytics-${index + 1}`;
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

function buildRunRow(run: RunAnalyticsRecord): TemplateAnalyticsRunRow {
  const riskShiftPercent =
    run.riskDistribution.high + run.riskDistribution.critical + Math.round(run.guessRatePercent * 0.25);

  return {
    runId: run.runId,
    runName: run.runName,
    completedOn: run.startedAt,
    avgRawScorePercent: run.avgRawScorePercent,
    avgAccuracyPercent: run.avgAccuracyPercent,
    phaseAdherenceVariance: Math.round(
      Math.abs(run.avgPhaseAdherencePercent - run.followedPhaseSplitPercent),
    ),
    riskShiftPercent: Math.max(0, Math.min(100, riskShiftPercent)),
  };
}

async function resolveTemplateStatuses(): Promise<Map<string, string>> {
  try {
    const payload = await apiClient.get<unknown>("/admin/tests");
    if (!Array.isArray(payload)) {
      return new Map();
    }

    const statuses = new Map<string, string>();
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const templateName = typeof record.templateName === "string" ? record.templateName.trim() : "";
      const status = typeof record.status === "string" ? record.status.trim() : "";
      if (templateName.length > 0 && status.length > 0) {
        statuses.set(templateName, status);
      }
    }

    return statuses;
  } catch {
    return new Map();
  }
}

function buildTemplateAnalyticsDetails(
  runs: RunAnalyticsRecord[],
  statuses: Map<string, string>,
): TemplateAnalyticsDetailRecord[] {
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
      const runRows = sortedRuns.map(buildRunRow);
      const avgRawScorePercent = Math.round(average(runRows.map((run) => run.avgRawScorePercent)));
      const avgAccuracyPercent = Math.round(average(runRows.map((run) => run.avgAccuracyPercent)));
      const phaseAdherenceVariance = Math.round(variance(sortedRuns.map((run) => run.avgPhaseAdherencePercent)));
      const riskShiftAveragePercent = Math.round(average(runRows.map((run) => run.riskShiftPercent)));
      const avgDisciplineIndex = Math.round(average(sortedRuns.map((run) => run.disciplineIndexAverage)));
      const effectivenessRating = Math.max(
        0,
        Math.min(
          100,
          Math.round((avgRawScorePercent * 0.4) + (avgDisciplineIndex * 0.3) + ((100 - riskShiftAveragePercent) * 0.3)),
        ),
      );

      return {
        id: toTemplateId(templateName, index),
        templateName,
        examType: inferExamType(templateName),
        status: statuses.get(templateName) ?? "ready",
        runCount: runRows.length,
        avgRawScorePercent,
        avgAccuracyPercent,
        phaseAdherenceVariance,
        riskShiftAveragePercent,
        effectivenessRating,
        runs: runRows,
      };
    })
    .sort((left, right) => right.runCount - left.runCount || left.templateName.localeCompare(right.templateName));
}

function AdminTestTemplateAnalyticsDetailPage() {
  const params = useParams<{ testId?: string }>();
  const [templates, setTemplates] = useState<TemplateAnalyticsDetailRecord[]>(TEMPLATE_ANALYTICS_DETAILS);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTemplateAnalyticsDetail() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setTemplates(TEMPLATE_ANALYTICS_DETAILS);
        setInlineMessage(
          "Local mode detected. Loaded deterministic template analytics detail fixtures for the dedicated tests workspace.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const [dataset, statuses] = await Promise.all([
          fetchDashboardDataset(),
          resolveTemplateStatuses(),
        ]);
        if (!isMounted) {
          return;
        }

        const liveTemplates = buildTemplateAnalyticsDetails(dataset.runAnalytics, statuses);
        setTemplates(liveTemplates.length > 0 ? liveTemplates : TEMPLATE_ANALYTICS_DETAILS);
        setInlineMessage("Live mode enabled: test template analytics detail hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load test template analytics detail.";
        setTemplates(TEMPLATE_ANALYTICS_DETAILS);
        setInlineMessage(`${reason} Falling back to deterministic template analytics detail fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadTemplateAnalyticsDetail();

    return () => {
      isMounted = false;
    };
  }, []);

  const template = useMemo(() => {
    return templates.find((entry) => entry.id === params.testId) ?? templates[0] ?? null;
  }, [params.testId, templates]);

  const rawTrend = useMemo(
    () => (template ? toChartPoints(template.runs, (run) => run.avgRawScorePercent) : []),
    [template],
  );
  const accuracyTrend = useMemo(
    () => (template ? toChartPoints(template.runs, (run) => run.avgAccuracyPercent) : []),
    [template],
  );
  const riskShiftTrend = useMemo(
    () => (template ? toChartPoints(template.runs, (run) => run.riskShiftPercent) : []),
    [template],
  );

  const runColumns = useMemo<UiTableColumn<TemplateAnalyticsRunRow>[]>(
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
        id: "completed",
        header: "Completed",
        render: (run) => formatIsoDate(run.completedOn),
      },
      {
        id: "raw",
        header: "Avg Raw",
        render: (run) => `${run.avgRawScorePercent}%`,
      },
      {
        id: "accuracy",
        header: "Avg Accuracy",
        render: (run) => `${run.avgAccuracyPercent}%`,
      },
      {
        id: "phase",
        header: "Phase Variance",
        render: (run) => run.phaseAdherenceVariance,
      },
      {
        id: "risk",
        header: "Risk Shift",
        render: (run) => `${run.riskShiftPercent}%`,
      },
    ],
    [],
  );

  if (!template) {
    return null;
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-test-template-analytics-detail-title">
      <p className="admin-content-eyebrow">Template Analytics Detail Workspace</p>
      <h2 id="admin-test-template-analytics-detail-title">Cross-Run Template Analytics View</h2>
      <p className="admin-content-copy">
        This dedicated route keeps <code>/admin/tests/analytics/{`{testId}`}</code> separate from the broader test
        analytics overview. It focuses on a single template’s cross-run outcome quality using summary-safe averages,
        variance, and risk-shift signals, now hydrating from the live admin analytics payload when available.
      </p>

      <TestsWorkspaceNav />

      {inlineMessage ? <p className="admin-analytics-inline-note">{inlineMessage}</p> : null}

      <div className="admin-risk-summary-card">
        <h4>Focused Analytics Template</h4>
        <p>
          <strong>{template.templateName}</strong> · {template.examType} · {template.status}
        </p>
        <small>Route: /admin/tests/analytics/{template.id}</small>
      </div>

      {isLoading ? <p className="admin-analytics-inline-note">Loading test template analytics detail...</p> : null}

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Run Count</p>
          <h3>{template.runCount}</h3>
          <small>tracked structural comparisons</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Avg Raw Score</p>
          <h3>{template.avgRawScorePercent}%</h3>
          <small>cross-run average raw percent</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Avg Accuracy</p>
          <h3>{template.avgAccuracyPercent}%</h3>
          <small>cross-run average accuracy</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Effectiveness Rating</p>
          <h3>{template.effectivenessRating}</h3>
          <small>precomputed structural quality signal</small>
        </article>
      </div>

      <div className="admin-analytics-chart-grid">
        <UiChartContainer
          title="Raw Score Trend"
          subtitle="Average raw score per run"
          data={rawTrend}
          maxValue={100}
          variant="line"
        />
        <UiChartContainer
          title="Accuracy Trend"
          subtitle="Average accuracy per run"
          data={accuracyTrend}
          maxValue={100}
          variant="line"
        />
        <UiChartContainer
          title="Risk Shift Trend"
          subtitle="Template-level risk distribution movement"
          data={riskShiftTrend}
          maxValue={100}
          variant="line"
        />
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Phase Adherence Variance</h4>
          <p>{template.phaseAdherenceVariance} point spread across recent runs.</p>
          <small>Tracks how consistently the template holds timing structure.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Average Risk Shift</h4>
          <p>{template.riskShiftAveragePercent}% risk-distribution movement across template usage.</p>
          <small>Highlights whether execution risk expands or settles from run to run.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Single-Template Focus</h4>
          <p>This workspace isolates one template instead of folding the drill-down back into the shared analytics list.</p>
          <small>Dedicated route separation for `GBL-003`.</small>
        </article>
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-test-template-analytics-runs-title">
        <h3 id="admin-test-template-analytics-runs-title">Run Comparison Table</h3>
        <UiTable
          caption="Template analytics run comparison"
          columns={runColumns}
          rows={template.runs}
          rowKey={(row) => row.runId}
          emptyStateText="No template analytics runs available."
        />
      </section>
    </section>
  );
}

export default AdminTestTemplateAnalyticsDetailPage;
