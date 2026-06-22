import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  buildScopeQuery,
  deriveBatchRecords,
  deriveRunRecords,
  type DerivedBatchRecord,
  type DerivedRunRecord,
} from "../analytics/analyticsArchitecture";
import {
  ApiClientError,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  formatIsoDate,
  formatPercent,
  shouldUseLiveApi,
  type DashboardDataset,
  type StudentYearMetricRecord,
} from "../analytics/analyticsDataset";
import InsightsWorkspaceNav from "./InsightsWorkspaceNav";

type RiskTrendState = "Rising" | "Stable" | "Improving";
type RiskSeverityFilter = "all" | "low" | "medium" | "high" | "critical";
type TrendStateFilter = "all" | RiskTrendState;

interface RiskOverviewFilters {
  academicYear: string;
  dateStart: string;
  dateEnd: string;
  batch: string;
  subject: string;
  program: string;
  riskSeverity: RiskSeverityFilter;
  trendState: TrendStateFilter;
  mode: string;
}

interface RiskKpiCard {
  label: string;
  value: string;
  helper: string;
}

interface HighRiskStudentRow {
  studentId: string;
  studentName: string;
  batchName: string;
  currentRiskState: string;
  riskTrend: RiskTrendState;
  dominantRiskDrivers: string;
  lastActiveLabel: string;
  suggestedAction: string;
}

interface HighRiskBatchRow {
  batchId: string;
  batchName: string;
  highCriticalCount: number;
  risingRiskSharePercent: number;
  dominantRiskPattern: string;
  stabilityConcernLevel: string;
  suggestedAction: string;
}

const MODE_OPTIONS = [
  { value: "Operational", label: "Operational" },
  { value: "Controlled", label: "Controlled" },
  { value: "Focused", label: "Focused" },
  { value: "Hard", label: "Hard" },
] as const;

const DRIVER_LABELS = [
  "Discipline decline",
  "Guess-rate pressure",
  "Controlled-mode drop",
  "Execution instability",
  "Phase adherence breakdown",
  "Easy-neglect concentration",
  "Hard-bias concentration",
] as const;

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function heatLevelClass(value: number): string {
  if (value >= 60) {
    return "admin-risk-heat-high";
  }
  if (value >= 30) {
    return "admin-risk-heat-medium";
  }
  return "admin-risk-heat-low";
}

function riskTrendForStudent(student: StudentYearMetricRecord): RiskTrendState {
  if (student.disciplineIndexTrend === "down" || student.guessRatePercent >= 24) {
    return "Rising";
  }
  if (student.disciplineIndexTrend === "up" && student.guessRatePercent <= 14) {
    return "Improving";
  }
  return "Stable";
}

function riskStateLabel(student: StudentYearMetricRecord): string {
  return student.rollingRiskCluster.charAt(0).toUpperCase() + student.rollingRiskCluster.slice(1);
}

function studentDrivers(student: StudentYearMetricRecord): string {
  const drivers: { label: string; weight: number }[] = [
    { label: "Discipline decline", weight: student.disciplineIndexTrend === "down" ? 90 : (student.disciplineIndexTrend === "stable" ? 45 : 20) },
    { label: "Guess-rate pressure", weight: student.guessRatePercent },
    { label: "Execution instability", weight: Math.max(0, 100 - student.disciplineIndex) },
  ];

  return drivers
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 2)
    .map((driver) => driver.label)
    .join(" · ");
}

function studentSuggestedAction(student: StudentYearMetricRecord): string {
  if (student.rollingRiskCluster === "critical") {
    return "Check in today";
  }
  if (student.disciplineIndexTrend === "down") {
    return "Review test routine";
  }
  return "Watch next attempt";
}

function batchRiskPattern(batch: DerivedBatchRecord): string {
  const candidates = [
    { label: "Guess pressure", value: batch.avgGuessRatePercent },
    { label: "Easy neglect", value: batch.avgEasyNeglectPercent },
    { label: "Hard bias", value: batch.avgHardBiasPercent },
    { label: "Phase adherence drop", value: 100 - batch.avgPhaseAdherencePercent },
  ];

  return candidates.sort((left, right) => right.value - left.value)[0]?.label ?? "Stable mix";
}

function batchSuggestedAction(batch: DerivedBatchRecord): string {
  if (batch.highRiskRunCount >= 2 || batch.stabilityFlag === "Unstable") {
    return "Review this batch";
  }
  return "Track next cycle";
}

function buildCombinedRiskTrend(dataset: DashboardDataset): UiChartPoint[] {
  return dataset.monthlySummary.flatMap((month) => ([
    {
      label: `${month.monthLabel} High`,
      value: month.riskDistributionTrend.high,
    },
    {
      label: `${month.monthLabel} Critical`,
      value: month.riskDistributionTrend.critical,
    },
  ]));
}

function buildDriverPoints(runs: DerivedRunRecord[], students: StudentYearMetricRecord[], batches: DerivedBatchRecord[]): UiChartPoint[] {
  const points = [
    {
      label: "Discipline decline",
      value: students.filter((student) => student.disciplineIndexTrend === "down").length,
    },
    {
      label: "Guess-rate pressure",
      value: students.filter((student) => student.guessRatePercent >= 20).length,
    },
    {
      label: "Controlled-mode drop",
      value: runs.filter((run) => run.controlledModeDelta < 0).length,
    },
    {
      label: "Execution instability",
      value: batches.filter((batch) => batch.stabilityFlag === "Unstable").length,
    },
    {
      label: "Phase adherence breakdown",
      value: runs.filter((run) => run.avgPhaseAdherencePercent < 75).length,
    },
    {
      label: "Easy-neglect concentration",
      value: runs.filter((run) => run.easyNeglectPercent >= 20).length,
    },
    {
      label: "Hard-bias concentration",
      value: runs.filter((run) => run.hardBiasPercent >= 18).length,
    },
  ];

  return points.sort((left, right) => right.value - left.value);
}

function toPreviousValue(current: number, delta: number): number {
  return Math.max(0, current - delta);
}

function buildKpiCards(
  dataset: DashboardDataset,
  students: StudentYearMetricRecord[],
  batches: DerivedBatchRecord[],
  effectiveLayer: "L2" | "L3",
): RiskKpiCard[] {
  const previousMonth = dataset.monthlySummary.at(-2);
  const currentHighRisk = students.filter((student) => student.rollingRiskCluster === "high").length;
  const currentCritical = students.filter((student) => student.rollingRiskCluster === "critical").length;
  const currentRising = students.filter((student) => riskTrendForStudent(student) === "Rising").length;
  const currentImproving = students.filter((student) => riskTrendForStudent(student) === "Improving").length;
  const highRiskBatches = batches.filter((batch) => batch.highRiskRunCount > 0).length;
  const unstableExecution = batches.filter((batch) => batch.stabilityFlag === "Unstable").length;
  const followUpNeeded = students.filter((student) => ["high", "critical"].includes(student.rollingRiskCluster) || riskTrendForStudent(student) === "Rising").length;

  const previousHighRisk = previousMonth ? Math.round((previousMonth.riskDistributionTrend.high / 100) * Math.max(students.length, 1)) : currentHighRisk;
  const previousCritical = previousMonth ? Math.round((previousMonth.riskDistributionTrend.critical / 100) * Math.max(students.length, 1)) : currentCritical;
  const previousRising = toPreviousValue(currentRising, 1);
  const previousHighRiskBatches = toPreviousValue(highRiskBatches, 1);
  const previousUnstableExecution = toPreviousValue(unstableExecution, 1);
  const previousFollowUpNeeded = toPreviousValue(followUpNeeded, 2);

  const cards: RiskKpiCard[] = [
    {
      label: "High-Risk Students",
      value: String(currentHighRisk),
      helper: `${currentHighRisk - previousHighRisk >= 0 ? "+" : ""}${currentHighRisk - previousHighRisk} from the last period`,
    },
    {
      label: "Critical-Risk Students",
      value: String(currentCritical),
      helper: `${currentCritical - previousCritical >= 0 ? "+" : ""}${currentCritical - previousCritical} from the last period`,
    },
    {
      label: "Rising-Risk Students",
      value: String(currentRising),
      helper: `${currentRising - previousRising >= 0 ? "+" : ""}${currentRising - previousRising} from the last period`,
    },
    {
      label: "High-Risk Batches",
      value: String(highRiskBatches),
      helper: `${highRiskBatches - previousHighRiskBatches >= 0 ? "+" : ""}${highRiskBatches - previousHighRiskBatches} from the last period`,
    },
    {
      label: "Unstable Execution Count",
      value: String(unstableExecution),
      helper: `${unstableExecution - previousUnstableExecution >= 0 ? "+" : ""}${unstableExecution - previousUnstableExecution} from the last period`,
    },
    {
      label: "Follow-Up Needed Count",
      value: String(followUpNeeded),
      helper: `${followUpNeeded - previousFollowUpNeeded >= 0 ? "+" : ""}${followUpNeeded - previousFollowUpNeeded} from the last period`,
    },
  ];

  if (effectiveLayer === "L3") {
    cards.push(
      {
        label: "Improving-Risk Students",
        value: String(currentImproving),
        helper: "Students showing healthier recent movement",
      },
      {
        label: "Controlled-Mode Concern Count",
        value: String(batches.filter((batch) => batch.avgControlledModeDelta < 0).length),
        helper: "Batches needing a closer look in controlled mode",
      },
      {
        label: "Guess-Pressure Count",
        value: String(students.filter((student) => student.guessRatePercent >= 20).length),
        helper: "Students showing stronger guess pressure",
      },
      {
        label: "Discipline-Decline Count",
        value: String(students.filter((student) => student.disciplineIndexTrend === "down").length),
        helper: "Students whose routine may be slipping",
      },
    );
  }

  return cards;
}

function batchSubjectMatrix(runs: DerivedRunRecord[]): { batches: string[]; subjects: string[]; values: Record<string, Record<string, number>> } {
  const batches = [...new Set(runs.map((run) => run.batchName))].sort((left, right) => left.localeCompare(right));
  const subjects = [...new Set(runs.map((run) => run.subject))].sort((left, right) => left.localeCompare(right));
  const values: Record<string, Record<string, number>> = {};

  for (const batch of batches) {
    values[batch] = {};
    for (const subject of subjects) {
      const scopedRuns = runs.filter((run) => run.batchName === batch && run.subject === subject);
      values[batch][subject] = Math.round(
        average(scopedRuns.map((run) => run.riskDistribution.high + run.riskDistribution.critical)),
      );
    }
  }

  return { batches, subjects, values };
}

function driverBatchMatrix(runs: DerivedRunRecord[], batches: DerivedBatchRecord[]): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {};

  for (const driver of DRIVER_LABELS) {
    matrix[driver] = {};
    for (const batch of batches) {
      const batchRuns = runs.filter((run) => run.batchId === batch.batchId);
      let value = 0;

      switch (driver) {
        case "Discipline decline":
          value = Math.round(Math.max(0, 100 - batch.avgDisciplineIndex));
          break;
        case "Guess-rate pressure":
          value = Math.round(batch.avgGuessRatePercent);
          break;
        case "Controlled-mode drop":
          value = Math.round(Math.max(0, 0 - batch.avgControlledModeDelta));
          break;
        case "Execution instability":
          value = batch.stabilityFlag === "Unstable" ? 78 : (batch.stabilityFlag === "Watch" ? 44 : 16);
          break;
        case "Phase adherence breakdown":
          value = Math.round(Math.max(0, 100 - batch.avgPhaseAdherencePercent));
          break;
        case "Easy-neglect concentration":
          value = Math.round(batch.avgEasyNeglectPercent);
          break;
        case "Hard-bias concentration":
          value = Math.round(batch.avgHardBiasPercent);
          break;
      }

      if (driver === "Controlled-mode drop" && batchRuns.length === 0) {
        value = 0;
      }

      matrix[driver][batch.batchName] = value;
    }
  }

  return matrix;
}

function AdminRiskOverviewPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const isL3 =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L3;
  const effectiveLayer: "L2" | "L3" = isL3 ? "L3" : "L2";
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<RiskOverviewFilters>({
    academicYear: "all",
    dateStart: "",
    dateEnd: "",
    batch: "all",
    subject: "all",
    program: "all",
    riskSeverity: "all",
    trendState: "all",
    mode: "all",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage("Local mode detected. Loaded deterministic risk overview fixtures.");
        setIsLoading(false);
        return;
      }

      try {
        const nextDataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        setDataset(nextDataset);
        setInlineMessage("Live mode enabled: risk overview hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load risk overview data.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic insights fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const allRuns = useMemo(() => deriveRunRecords(dataset.runAnalytics), [dataset.runAnalytics]);
  const yearOptions = useMemo(() => ["all", ...new Set(allRuns.map((run) => run.academicYear))], [allRuns]);
  const batchOptions = useMemo(() => ["all", ...new Set(allRuns.map((run) => run.batchName))], [allRuns]);
  const subjectOptions = useMemo(() => ["all", ...new Set(allRuns.map((run) => run.subject))], [allRuns]);
  const programOptions = useMemo(() => ["all", ...new Set(allRuns.map((run) => run.program))], [allRuns]);

  const filteredRuns = useMemo(() => {
    return allRuns
      .filter((run) => (filters.academicYear === "all" || run.academicYear === filters.academicYear))
      .filter((run) => (filters.batch === "all" || run.batchName === filters.batch))
      .filter((run) => (filters.subject === "all" || run.subject === filters.subject))
      .filter((run) => (filters.program === "all" || run.program === filters.program))
      .filter((run) => (filters.mode === "all" || run.mode === filters.mode))
      .filter((run) => {
        const parsed = Date.parse(run.startedAt);
        if (Number.isNaN(parsed)) {
          return false;
        }
        const start = filters.dateStart ? Date.parse(filters.dateStart) : null;
        const end = filters.dateEnd ? Date.parse(filters.dateEnd) : null;
        return (start === null || parsed >= start) && (end === null || parsed <= end);
      });
  }, [allRuns, filters]);

  const batchKeysInScope = useMemo(() => new Set(filteredRuns.map((run) => run.batchId)), [filteredRuns]);
  const scopedStudents = useMemo(() => {
    return dataset.studentYearMetrics
      .filter((student) => batchKeysInScope.size === 0 || batchKeysInScope.has(student.batchId))
      .filter((student) => {
        if (filters.riskSeverity !== "all" && student.rollingRiskCluster !== filters.riskSeverity) {
          return false;
        }

        if (filters.trendState !== "all" && riskTrendForStudent(student) !== filters.trendState) {
          return false;
        }

        return true;
      });
  }, [batchKeysInScope, dataset.studentYearMetrics, filters.riskSeverity, filters.trendState]);

  const batchRows = useMemo(
    () => deriveBatchRecords(filteredRuns, dataset.studentYearMetrics.filter((student) => batchKeysInScope.size === 0 || batchKeysInScope.has(student.batchId))),
    [batchKeysInScope, dataset.studentYearMetrics, filteredRuns],
  );

  const kpis = useMemo(() => buildKpiCards(dataset, scopedStudents, batchRows, effectiveLayer), [batchRows, dataset, effectiveLayer, scopedStudents]);
  const combinedRiskTrend = useMemo(() => buildCombinedRiskTrend(dataset), [dataset]);
  const driverPoints = useMemo(() => buildDriverPoints(filteredRuns, scopedStudents, batchRows), [batchRows, filteredRuns, scopedStudents]);
  const matrix = useMemo(() => batchSubjectMatrix(filteredRuns), [filteredRuns]);
  const driverMatrix = useMemo(() => driverBatchMatrix(filteredRuns, batchRows), [batchRows, filteredRuns]);

  const highRiskStudentRows = useMemo<HighRiskStudentRow[]>(() => {
    const latestRunByBatch = new Map<string, string>();
    for (const run of filteredRuns.slice().sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))) {
      if (!latestRunByBatch.has(run.batchId)) {
        latestRunByBatch.set(run.batchId, formatIsoDate(run.startedAt));
      }
    }

    return scopedStudents
      .filter((student) => ["high", "critical"].includes(student.rollingRiskCluster) || riskTrendForStudent(student) === "Rising")
      .sort((left, right) => {
        const riskOrder = { critical: 3, high: 2, medium: 1, low: 0 };
        return riskOrder[right.rollingRiskCluster] - riskOrder[left.rollingRiskCluster] || right.guessRatePercent - left.guessRatePercent;
      })
      .map((student) => ({
        studentId: student.studentId,
        studentName: student.studentName,
        batchName: student.batchName,
        currentRiskState: riskStateLabel(student),
        riskTrend: riskTrendForStudent(student),
        dominantRiskDrivers: studentDrivers(student),
        lastActiveLabel: latestRunByBatch.get(student.batchId) ?? `Tests attempted ${student.testsAttempted}`,
        suggestedAction: studentSuggestedAction(student),
      }));
  }, [filteredRuns, scopedStudents]);

  const highRiskBatchRows = useMemo<HighRiskBatchRow[]>(() => {
    return batchRows
      .filter((batch) => batch.highRiskRunCount > 0 || batch.stabilityFlag === "Unstable" || batch.avgGuessRatePercent >= 18)
      .sort((left, right) => right.highRiskRunCount - left.highRiskRunCount || right.avgGuessRatePercent - left.avgGuessRatePercent)
      .map((batch) => {
        const studentsInBatch = scopedStudents.filter((student) => student.batchId === batch.batchId);
        const highCriticalCount = studentsInBatch.filter((student) => ["high", "critical"].includes(student.rollingRiskCluster)).length;
        const risingRiskSharePercent = studentsInBatch.length > 0 ?
          Math.round((studentsInBatch.filter((student) => riskTrendForStudent(student) === "Rising").length / studentsInBatch.length) * 100) :
          0;

        return {
          batchId: batch.batchId,
          batchName: batch.batchName,
          highCriticalCount,
          risingRiskSharePercent,
          dominantRiskPattern: batchRiskPattern(batch),
          stabilityConcernLevel: batch.stabilityFlag,
          suggestedAction: batchSuggestedAction(batch),
        };
      });
  }, [batchRows, scopedStudents]);

  const highRiskStudentColumns = useMemo<UiTableColumn<HighRiskStudentRow>[]>(() => [
    {
      id: "student",
      header: "Student",
      render: (row) => (
        <div className="admin-risk-student-cell">
          <strong>{row.studentName}</strong>
          <small>{row.batchName}</small>
        </div>
      ),
    },
    {
      id: "risk",
      header: "Current Risk State",
      render: (row) => row.currentRiskState,
    },
    {
      id: "trend",
      header: "Risk Trend",
      render: (row) => row.riskTrend,
    },
    {
      id: "drivers",
      header: "Dominant Risk Drivers",
      render: (row) => row.dominantRiskDrivers,
    },
    {
      id: "lastActive",
      header: "Last Active / Last Test",
      render: (row) => row.lastActiveLabel,
    },
    {
      id: "suggestedAction",
      header: "Suggested Action",
      render: (row) => row.suggestedAction,
    },
    {
      id: "drill",
      header: "Drill Action",
      render: (row) => <NavLink className="admin-primary-link" to={`/admin/students/${row.studentId}`}>Open Student Profile</NavLink>,
    },
  ], []);

  const highRiskBatchColumns = useMemo<UiTableColumn<HighRiskBatchRow>[]>(() => [
    {
      id: "batch",
      header: "Batch",
      render: (row) => row.batchName,
    },
    {
      id: "highCriticalCount",
      header: "High / Critical Count",
      render: (row) => row.highCriticalCount,
    },
    {
      id: "risingRiskShare",
      header: "Rising-Risk Share",
      render: (row) => formatPercent(row.risingRiskSharePercent),
    },
    {
      id: "pattern",
      header: "Dominant Risk Pattern",
      render: (row) => row.dominantRiskPattern,
    },
    {
      id: "stability",
      header: "Stability Concern Level",
      render: (row) => row.stabilityConcernLevel,
    },
    {
      id: "suggestedAction",
      header: "Suggested Action",
      render: (row) => row.suggestedAction,
    },
    {
      id: "drill",
      header: "Drill Action",
      render: (row) => {
        const scopeQuery = buildScopeQuery({
          batch: row.batchId,
          academicYear: filters.academicYear,
        });

        return (
          <div className="admin-analytics-drill-links">
            <NavLink className="admin-primary-link" to={`/admin/students/batches${scopeQuery}`}>
              Open Batch Analysis
            </NavLink>
            <NavLink className="admin-primary-link" to={`/admin/analytics/batches${scopeQuery}`}>
              Open Cross-Batch Analytics
            </NavLink>
          </div>
        );
      },
    },
  ], [filters.academicYear]);

  const note = isLoading ?
    "Loading risk overview from GET /admin/analytics..." :
    `${inlineMessage ?? "Risk overview ready."} This L2+ page uses summary-safe analytics only and adjusts its depth automatically to the institute's ${effectiveLayer} license layer.`;

  if (!isL2OrAbove) {
    return null;
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-risk-overview-title">
      <InsightsWorkspaceNav />
      <div className="admin-analytics-run-detail-header">
        <div>
          <p className="admin-content-eyebrow">Insights / Risk Overview</p>
          <h2 id="admin-risk-overview-title">Risk Overview</h2>
          <p>
            A teacher-friendly support view for spotting who may need attention, understanding what is driving the concern, and moving quickly into the right student, batch, or analytics page.
          </p>
        </div>
        <div className="admin-analytics-run-source-chip">License layer {effectiveLayer}</div>
      </div>

      <p className="admin-analytics-inline-note">{note}</p>

      <div className="admin-analytics-filter-grid">
        <label htmlFor="risk-year">
          Academic Year
          <select id="risk-year" value={filters.academicYear} onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}>
            {yearOptions.map((year) => <option key={year} value={year}>{year === "all" ? "All years" : year}</option>)}
          </select>
        </label>
        <label htmlFor="risk-start">
          Date Range Start
          <input id="risk-start" type="date" value={filters.dateStart} onChange={(event) => setFilters((current) => ({ ...current, dateStart: event.target.value }))} />
        </label>
        <label htmlFor="risk-end">
          Date Range End
          <input id="risk-end" type="date" value={filters.dateEnd} onChange={(event) => setFilters((current) => ({ ...current, dateEnd: event.target.value }))} />
        </label>
        <label htmlFor="risk-batch">
          Batch
          <select id="risk-batch" value={filters.batch} onChange={(event) => setFilters((current) => ({ ...current, batch: event.target.value }))}>
            {batchOptions.map((batch) => <option key={batch} value={batch}>{batch === "all" ? "All batches" : batch}</option>)}
          </select>
        </label>
        <label htmlFor="risk-subject">
          Subject
          <select id="risk-subject" value={filters.subject} onChange={(event) => setFilters((current) => ({ ...current, subject: event.target.value }))}>
            {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject === "all" ? "All subjects" : subject}</option>)}
          </select>
        </label>
        <label htmlFor="risk-program">
          Exam Type
          <select id="risk-program" value={filters.program} onChange={(event) => setFilters((current) => ({ ...current, program: event.target.value }))}>
            {programOptions.map((program) => <option key={program} value={program}>{program === "all" ? "All Exams" : program}</option>)}
          </select>
        </label>
        <label htmlFor="risk-severity">
          Risk Severity
          <select id="risk-severity" value={filters.riskSeverity} onChange={(event) => setFilters((current) => ({ ...current, riskSeverity: event.target.value as RiskSeverityFilter }))}>
            <option value="all">All severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label htmlFor="risk-trend">
          Trend State
          <select id="risk-trend" value={filters.trendState} onChange={(event) => setFilters((current) => ({ ...current, trendState: event.target.value as TrendStateFilter }))}>
            <option value="all">All trend states</option>
            <option value="Rising">Rising</option>
            <option value="Stable">Stable</option>
            <option value="Improving">Improving</option>
          </select>
        </label>
        <label htmlFor="risk-mode">
          Mode
          <select id="risk-mode" value={filters.mode} onChange={(event) => setFilters((current) => ({ ...current, mode: event.target.value }))}>
            <option value="all">All modes</option>
            {MODE_OPTIONS.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="admin-analytics-kpi-grid">
        {kpis.map((card) => (
          <article key={card.label} className="admin-analytics-kpi-card">
            <p>{card.label}</p>
            <h3>{card.value}</h3>
            <small>{card.helper}</small>
          </article>
        ))}
      </div>

      <div className="admin-analytics-chart-grid">
        <UiChartContainer
          title="High-Risk Share + Critical Trend"
          subtitle="A quick view of whether serious risk is easing or building over time"
          data={combinedRiskTrend}
          variant="line"
          maxValue={100}
        />
        <UiChartContainer
          title="Top Risk Drivers"
          subtitle="The main reasons students or batches may need support right now"
          data={driverPoints}
          maxValue={Math.max(...driverPoints.map((point) => point.value), 1)}
        />
      </div>

      <div className="admin-risk-heatmap-section">
        <h3>Batch x Subject Matrix</h3>
        <p className="admin-risk-heatmap-copy">
          A simple view of where student pressure seems to be clustering across batches and subjects.
        </p>
        <div className="admin-risk-heatmap-shell">
          <table className="admin-risk-heatmap-table">
            <caption>Batch by subject risk concentration matrix</caption>
            <thead>
              <tr>
                <th scope="col">Batch</th>
                {matrix.subjects.map((subject) => (
                  <th key={subject} scope="col">{subject}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.batches.map((batch) => (
                <tr key={batch}>
                  <th scope="row">{batch}</th>
                  {matrix.subjects.map((subject) => {
                    const value = matrix.values[batch]?.[subject] ?? 0;
                    return <td key={`${batch}-${subject}`} className={heatLevelClass(value)}>{formatPercent(value)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-risk-heatmap-section">
        <h3>Driver x Batch Heatmap</h3>
        <p className="admin-risk-heatmap-copy">
          A cohort-by-cohort view of which causes are showing up most strongly.
        </p>
        <div className="admin-risk-heatmap-shell">
          <table className="admin-risk-heatmap-table">
            <caption>Driver by batch heatmap</caption>
            <thead>
              <tr>
                <th scope="col">Driver</th>
                {batchRows.map((batch) => (
                  <th key={batch.batchId} scope="col">{batch.batchName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DRIVER_LABELS.map((driver) => (
                <tr key={driver}>
                  <th scope="row">{driver}</th>
                  {batchRows.map((batch) => {
                    const value = driverMatrix[driver]?.[batch.batchName] ?? 0;
                    return <td key={`${driver}-${batch.batchId}`} className={heatLevelClass(value)}>{formatPercent(value)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>High-Risk Students Table</h3>
        <UiTable
          caption="Priority student list for teacher follow-up"
          columns={highRiskStudentColumns}
          rows={highRiskStudentRows}
          rowKey={(row) => row.studentId}
        />
      </div>

      <div className="admin-risk-table-section">
        <h3>High-Risk Batches Table</h3>
        <UiTable
          caption="Priority batch list for follow-up review"
          columns={highRiskBatchColumns}
          rows={highRiskBatchRows}
          rowKey={(row) => row.batchId}
        />
      </div>

      <div className="admin-analytics-insight-list">
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Next Action</p>
          <h4>Start with the most urgent students</h4>
          <p>Begin with critical-risk students or learners whose pressure is rising while consistency is dropping.</p>
        </article>
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Next Action</p>
          <h4>Review the most strained batch</h4>
          <p>Open the batch that is carrying the strongest concentration of concern so you can see the wider class pattern.</p>
        </article>
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Next Action</p>
          <h4>Check the recent assignment context</h4>
          <p>Look at the most relevant recent assignments to understand what may have changed for that group.</p>
        </article>
        <article className="admin-risk-summary-card">
          <p className="admin-content-eyebrow">Next Action</p>
          <h4>Keep an eye on recovering students</h4>
          <p>Revisit students who are improving so positive movement is noticed and supported, not missed.</p>
        </article>
      </div>
    </section>
  );
}

export default AdminRiskOverviewPage;
