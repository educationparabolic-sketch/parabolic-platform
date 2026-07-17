import { useMemo, useState } from "react";
import { UiChartContainer, UiFormField, UiStatCard } from "../../../../../shared/ui/components";
import {
  getVendorIntelligenceDataset,
  type TopicWeaknessCluster,
} from "./vendorIntelligenceDataset";

type IntelligenceView = "portfolio" | "student" | "weakness";
type TrendRange = "3" | "6";

const VIEW_OPTIONS: Array<{ id: IntelligenceView; label: string }> = [
  { id: "portfolio", label: "Portfolio" },
  { id: "student", label: "Student Intelligence" },
  { id: "weakness", label: "Weakness Clusters" },
];

function formatMonth(month: string): string {
  const parsed = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-IN");
}

function formatBehaviorLabel(metric: string): string {
  const labels: Record<string, string> = {
    GlobalHardBiasFrequency: "Hard Bias Frequency",
    GlobalEasyNeglectFrequency: "Easy Neglect Frequency",
    ControlledModeEffectivenessGlobal: "Controlled Mode Effectiveness",
  };
  return labels[metric] ?? metric;
}

function severityRank(severity: TopicWeaknessCluster["severity"]): number {
  return { high: 3, medium: 2, low: 1 }[severity];
}

function VendorIntelligenceDashboardPage() {
  const dataset = useMemo(() => getVendorIntelligenceDataset(), []);
  const [activeView, setActiveView] = useState<IntelligenceView>("portfolio");
  const [trendRange, setTrendRange] = useState<TrendRange>("6");
  const [examType, setExamType] = useState("all");

  const latestTrend = dataset.monthlyTrend.at(-1);
  const visibleTrend = useMemo(
    () => dataset.monthlyTrend.slice(-Number(trendRange)),
    [dataset.monthlyTrend, trendRange],
  );
  const examTypes = useMemo(
    () => [...new Set(dataset.disciplineIndexByExamType.map((entry) => entry.examType))],
    [dataset.disciplineIndexByExamType],
  );
  const visibleDiscipline = useMemo(
    () =>
      dataset.disciplineIndexByExamType.filter(
        (entry) => examType === "all" || entry.examType === examType,
      ),
    [dataset.disciplineIndexByExamType, examType],
  );
  const visibleClusters = useMemo(
    () =>
      dataset.topicWeaknessClusters
        .filter((cluster) => examType === "all" || cluster.examType === examType)
        .sort((left, right) => severityRank(right.severity) - severityRank(left.severity)),
    [dataset.topicWeaknessClusters, examType],
  );
  const globalDiscipline =
    dataset.disciplineIndexByExamType.reduce((sum, entry) => sum + entry.disciplineIndex, 0) /
    dataset.disciplineIndexByExamType.length;
  const upgradeMetric = dataset.kpis.find((metric) => metric.id === "UpgradeConversionRate");
  const instituteGrowthMetric = dataset.kpis.find((metric) => metric.id === "InstituteGrowthRate");
  const studentGrowthMetric = dataset.kpis.find((metric) => metric.id === "ActiveStudentGrowth");
  const churnMetric = dataset.kpis.find((metric) => metric.id === "ChurnRate");

  const instituteTrendPoints = visibleTrend.map((entry) => ({
    label: formatMonth(entry.month),
    value: entry.activeInstitutes,
  }));
  const studentTrendPoints = visibleTrend.map((entry) => ({
    label: formatMonth(entry.month),
    value: Math.round(entry.activeStudents / 100),
  }));
  const layerDistributionPoints = dataset.layerDistribution.map((entry) => ({
    label: entry.layer === "TRIAL" ? "Trial" : entry.layer,
    value: entry.instituteCount,
  }));
  const behaviorSignalPoints = dataset.behaviorSignals.map((entry) => ({
    label: formatBehaviorLabel(entry.metric),
    value: Number(entry.percentage.toFixed(1)),
  }));

  return (
    <section
      className="vendor-content-card admin-content-card vendor-intelligence-page"
      aria-labelledby="vendor-intelligence-title"
    >
      <header className="vendor-intelligence-heading">
        <div>
          <p className="vendor-content-eyebrow">Cross-institute analytics</p>
          <h2 id="vendor-intelligence-title">Global Intelligence</h2>
          <p>Aggregated portfolio and student-intelligence signals across active institutes.</p>
        </div>
        <div className="vendor-intelligence-freshness">
          <span>Data posture</span>
          <strong>Summary aggregates only</strong>
          <small>Latest reporting period: Apr 2026</small>
        </div>
      </header>

      <div className="vendor-intelligence-summary">
        <UiStatCard
          title="Active Institutes"
          value={formatNumber(latestTrend?.activeInstitutes ?? 0)}
          helper={`${instituteGrowthMetric?.value ?? "-"} month over month`}
        />
        <UiStatCard
          title="Active Students"
          value={formatNumber(latestTrend?.activeStudents ?? 0)}
          helper={`${studentGrowthMetric?.value ?? "-"} month over month`}
        />
        <UiStatCard
          title="Global Discipline Index"
          value={globalDiscipline.toFixed(1)}
          helper="Average across configured exam types"
        />
        <UiStatCard
          title="Upgrade Conversion"
          value={upgradeMetric?.value ?? "-"}
          helper="Institutes moving to a higher layer"
        />
      </div>

      <div className="vendor-intelligence-controls">
        <nav className="vendor-intelligence-tabs" aria-label="Global intelligence views">
          {VIEW_OPTIONS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={activeView === view.id ? "vendor-intelligence-tab-active" : ""}
              onClick={() => setActiveView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </nav>
        <div className="vendor-intelligence-filter-group">
          <UiFormField label="Trend range" htmlFor="vendor-intelligence-range">
            <select
              id="vendor-intelligence-range"
              value={trendRange}
              onChange={(event) => setTrendRange(event.target.value as TrendRange)}
            >
              <option value="3">Last 3 months</option>
              <option value="6">Last 6 months</option>
            </select>
          </UiFormField>
          <UiFormField label="Exam type" htmlFor="vendor-intelligence-exam">
            <select
              id="vendor-intelligence-exam"
              value={examType}
              onChange={(event) => setExamType(event.target.value)}
            >
              <option value="all">All exam types</option>
              {examTypes.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </UiFormField>
        </div>
      </div>

      {activeView === "portfolio" ? (
        <div className="vendor-intelligence-view">
          <section className="vendor-intelligence-section-heading">
            <div>
              <h3>Institute portfolio</h3>
              <p>Growth, retention, and subscription distribution across the vendor account.</p>
            </div>
            <span className="vendor-status vendor-status-completed">Reporting current</span>
          </section>

          <div className="vendor-intelligence-chart-grid vendor-intelligence-portfolio-grid">
            <UiChartContainer
              title="Active Institute Trend"
              subtitle="Active subscriptions by month"
              variant="line"
              data={instituteTrendPoints}
            />
            <UiChartContainer
              title="Active Student Trend"
              subtitle="Student count shown in hundreds"
              variant="line"
              data={studentTrendPoints}
            />
            <UiChartContainer
              title="Subscription Distribution"
              subtitle="Trial and active license layers"
              variant="pie"
              data={layerDistributionPoints}
            />
          </div>

          <section
            className="vendor-intelligence-trend-table"
            aria-labelledby="portfolio-history-title"
          >
            <header>
              <div>
                <h3 id="portfolio-history-title">Portfolio history</h3>
                <p>Monthly operating trend for the selected reporting range.</p>
              </div>
              <div className="vendor-intelligence-inline-metrics">
                <span>
                  Current churn <strong>{churnMetric?.value ?? "-"}</strong>
                </span>
                <span>
                  Upgrade conversion <strong>{upgradeMetric?.value ?? "-"}</strong>
                </span>
              </div>
            </header>
            <div className="vendor-intelligence-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Active institutes</th>
                    <th>Active students</th>
                    <th>Churn</th>
                  </tr>
                </thead>
                <tbody>
                  {[...visibleTrend].reverse().map((entry) => (
                    <tr key={entry.month}>
                      <td>{formatMonth(entry.month)}</td>
                      <td>{formatNumber(entry.activeInstitutes)}</td>
                      <td>{formatNumber(entry.activeStudents)}</td>
                      <td>{entry.churnRatePercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {activeView === "student" ? (
        <div className="vendor-intelligence-view">
          <section className="vendor-intelligence-section-heading">
            <div>
              <h3>Student intelligence signals</h3>
              <p>Global behavior and discipline summaries; no student-level records are exposed.</p>
            </div>
            <span className="vendor-result-count">
              {examType === "all" ? "All exam types" : examType}
            </span>
          </section>

          <div className="vendor-intelligence-student-grid">
            <UiChartContainer
              title="Behavior Signals"
              subtitle="Global frequency and effectiveness percentages"
              variant="bar"
              maxValue={100}
              data={behaviorSignalPoints}
            />
            <section className="vendor-intelligence-discipline" aria-labelledby="discipline-title">
              <header>
                <h3 id="discipline-title">Discipline Index</h3>
                <p>Aggregate score by exam type.</p>
              </header>
              <div>
                {visibleDiscipline.map((entry) => (
                  <div key={entry.examType} className="vendor-intelligence-discipline-row">
                    <span>{entry.examType}</span>
                    <div aria-hidden="true">
                      <i style={{ width: `${entry.disciplineIndex}%` }} />
                    </div>
                    <strong>{entry.disciplineIndex.toFixed(1)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section
            className="vendor-intelligence-signal-register"
            aria-labelledby="signal-register-title"
          >
            <header>
              <h3 id="signal-register-title">Signal register</h3>
              <p>Current aggregate values used by this intelligence view.</p>
            </header>
            <div>
              {dataset.behaviorSignals.map((signal) => (
                <article key={signal.metric}>
                  <span>{formatBehaviorLabel(signal.metric)}</span>
                  <strong>{signal.percentage.toFixed(1)}%</strong>
                  <small>Global aggregate</small>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeView === "weakness" ? (
        <div className="vendor-intelligence-view">
          <section className="vendor-intelligence-section-heading">
            <div>
              <h3>Topic weakness clusters</h3>
              <p>Recurring topic-level weaknesses grouped across institutes.</p>
            </div>
            <span className="vendor-result-count">{visibleClusters.length} clusters</span>
          </section>

          <div className="vendor-intelligence-cluster-list">
            {visibleClusters.map((cluster) => (
              <article key={cluster.clusterId} className="vendor-intelligence-cluster">
                <header>
                  <div>
                    <span>{cluster.examType}</span>
                    <h3>{cluster.dominantTopics[0]}</h3>
                  </div>
                  <span
                    className={`vendor-status vendor-intelligence-severity-${cluster.severity}`}
                  >
                    {cluster.severity} severity
                  </span>
                </header>
                <p>{cluster.instituteCount} institutes contribute to this aggregate cluster.</p>
                <div>
                  {cluster.dominantTopics.map((topic) => (
                    <span key={topic}>{topic}</span>
                  ))}
                </div>
                <footer>
                  <span>Cluster ID</span>
                  <code>{cluster.clusterId}</code>
                </footer>
              </article>
            ))}
            {visibleClusters.length === 0 ? (
              <p className="vendor-institute-empty">No weakness clusters match this exam type.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <footer
        className="vendor-intelligence-boundary"
        aria-label="Global intelligence data boundary"
      >
        <div>
          <strong>Aggregate-only data boundary</strong>
          <span>No cross-institute raw session or student record access.</span>
        </div>
        <code>{dataset.sourceCollections.join(" + ")}</code>
      </footer>
    </section>
  );
}

export default VendorIntelligenceDashboardPage;
