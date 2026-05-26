import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { fetchSettingsSnapshot } from "../settings/settingsDataset";
import {
  ApiClientError,
  FALLBACK_GOVERNANCE_DATASET,
  GOVERNANCE_RISK_CLUSTERS,
  fetchGovernanceDataset,
  formatPercent,
  shouldUseLiveApi,
  type GovernanceDashboardDataset,
  type GovernanceBatchRiskSummary,
  type GovernanceRequestContext,
  type GovernanceRiskCluster,
  type GovernanceSnapshotRecord,
  type GovernanceTemplateStabilityComparison,
} from "./governanceDataset";

type GovernanceSubpage =
  | "stability"
  | "integrity"
  | "override-audit"
  | "batch-risk"
  | "trends"
  | "reports";

interface GovernanceKpi {
  label: string;
  value: string;
  helper: string;
}

interface MonthComparison {
  label: string;
  metric: "index" | "percent";
  currentValue: number;
  previousValue: number;
}

interface GovernanceSectionDefinition {
  id: GovernanceSubpage;
  label: string;
  to: string;
  eyebrow: string;
  title: string;
  description: string;
}

interface GovernanceReportRow {
  id: string;
  period: string;
  generatedAt: string;
  stabilityIndex: number;
  executionIntegrity: number;
  overrideFrequency: number;
  academicYear: string;
  generatedBy: string;
  immutability: string;
}

interface StabilityThreshold {
  label: string;
  range: string;
  helper: string;
}

interface DifficultyHeatmapCell {
  difficulty: string;
  value: number;
  helper: string;
}

interface ControlledModeRow {
  mode: string;
  rawPercent: number;
  accuracyPercent: number;
  riskReductionPercent: number;
}

interface OverrideImpactRow {
  scenario: string;
  rawPercent: number;
  accuracyShiftPercent: number;
  riskEscalationDelta: number;
}

interface GovernanceTrendFilters {
  academicYear: string;
  batchId: string;
  examType: string;
}

interface PatternRecurrenceRow {
  pattern: string;
  repeatedHighRiskMonths: number;
  totalMonths: number;
  recurrencePercent: number;
}

interface GovernanceSnapshotSealRow {
  id: string;
  period: string;
  generatedAt: string;
  sealState: "Active monthly accumulator" | "Sealed historical month";
  storageTreatment: string;
  mutationTreatment: string;
  loadTreatment: string;
}

interface GovernanceReportSectionRow {
  section: string;
  source: string;
  includedContent: string;
}

interface GovernanceReportWorkflowStep {
  title: string;
  detail: string;
}

const FALLBACK_GOVERNANCE_INSTITUTE_ID = "demo-institute";
const FALLBACK_GOVERNANCE_YEAR_ID = "2026";

const governanceSealPolicyCards = [
  {
    title: "Nightly Snapshot",
    detail: "The current month can refresh through the governance accumulator before monthly close.",
  },
  {
    title: "End-of-Month Seal",
    detail: "Closed months become immutable governanceSnapshots/{YYYY-MM} records.",
  },
  {
    title: "Historical Rule",
    detail: "Past months are never recomputed, aggregated on read, or rebuilt from raw sessions.",
  },
  {
    title: "Archive Continuity",
    detail: "Sealed snapshots remain reportable for longitudinal trends, PDF packets, and accreditation evidence.",
  },
];

const governanceReportSections: GovernanceReportSectionRow[] = [
  {
    section: "1. Stability Index Summary",
    source: "governanceSnapshots/{YYYY-MM}.stabilityIndex",
    includedContent: "Index value, threshold interpretation, 12-month stability trend, and latest month context.",
  },
  {
    section: "2. Risk Distribution",
    source: "governanceSnapshots/{YYYY-MM}.riskDistribution",
    includedContent: "Stable, Drift-Prone, Impulsive, Overextended, and Volatile institutional mix.",
  },
  {
    section: "3. Discipline Trajectory",
    source: "governanceSnapshots/{YYYY-MM}.disciplineIndex*",
    includedContent: "Rolling 30-day, year-to-date, YoY movement, phase compliance, and integrity trajectory.",
  },
  {
    section: "4. Override Audit Summary",
    source: "overrideAuditSummary + governanceSnapshots",
    includedContent: "Override frequency, impact analysis, and repeated override pattern summary without teacher names.",
  },
  {
    section: "5. Batch Comparison",
    source: "batchRiskSummaries",
    includedContent: "Batch risk matrix, discipline metrics, raw stability score, and accuracy stability score.",
  },
  {
    section: "6. Strategic Recommendations",
    source: "Insights Engine summaries",
    includedContent: "Manual, advisory planning recommendations derived from summary-safe insights outputs.",
  },
];

const governanceReportWorkflowSteps: GovernanceReportWorkflowStep[] = [
  {
    title: "Prepare PDF Packet",
    detail: "Assemble sections from immutable snapshot documents only; no live aggregation or session scan is allowed.",
  },
  {
    title: "Director Review",
    detail: "Attach timestamp, academic year, generated-by metadata, and immutable source-period identifier.",
  },
  {
    title: "Export PDF",
    detail: "Use the packet for trustee review, strategic planning, or accreditation documentation.",
  },
  {
    title: "Archive Packet",
    detail: "Retain exported reports alongside sealed governance periods without recomputing historical months.",
  },
];

const GOVERNANCE_SECTIONS: GovernanceSectionDefinition[] = [
  {
    id: "stability",
    label: "Institutional Stability",
    to: "/admin/governance/stability",
    eyebrow: "Governance / Stability",
    title: "Institutional Stability",
    description:
      "Dedicated stability workspace for reading institutional consistency through immutable governance snapshots.",
  },
  {
    id: "integrity",
    label: "Execution Integrity",
    to: "/admin/governance/integrity",
    eyebrow: "Governance / Integrity",
    title: "Execution Integrity",
    description:
      "Director-only integrity workspace focused on structural discipline, compliance movement, and execution quality signals.",
  },
  {
    id: "override-audit",
    label: "Override Audit",
    to: "/admin/governance/override-audit",
    eyebrow: "Governance / Override Audit",
    title: "Override Audit",
    description:
      "Read-only override governance surface for tracking override frequency and its relationship to institutional stability.",
  },
  {
    id: "batch-risk",
    label: "Batch Risk Map",
    to: "/admin/governance/batch-risk",
    eyebrow: "Governance / Batch Risk",
    title: "Batch Risk Map",
    description:
      "Strategic cohort risk workspace for comparing the institutional risk mix across immutable monthly governance snapshots.",
  },
  {
    id: "trends",
    label: "Longitudinal Trends",
    to: "/admin/governance/trends",
    eyebrow: "Governance / Trends",
    title: "Longitudinal Trends",
    description:
      "Cross-month governance trend workspace for stability, compliance, override behavior, and execution trajectory.",
  },
  {
    id: "reports",
    label: "Governance Reports",
    to: "/admin/governance/reports",
    eyebrow: "Governance / Reports",
    title: "Governance Reports",
    description:
      "Immutable report-preparation workspace that packages governance snapshot records into export-ready institutional reporting views.",
  },
];

function clusterLabel(cluster: GovernanceRiskCluster): string {
  if (cluster === "driftProne") {
    return "Drift Prone";
  }
  if (cluster === "overextended") {
    return "Overextended";
  }
  return cluster.charAt(0).toUpperCase() + cluster.slice(1);
}

function monthLabel(month: string): string {
  const [year, monthValue] = month.split("-");
  const parsedYear = Number(year);
  const parsedMonth = Number(monthValue);

  if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    return month;
  }

  const date = new Date(Date.UTC(parsedYear, parsedMonth - 1, 1));
  return date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().replace("T", " ").slice(0, 16);
}

function stabilityBand(value: number): string {
  if (value > 75) {
    return "Stable";
  }

  if (value >= 60) {
    return "Watch zone";
  }

  return "Unstable";
}

function resolveGovernanceSubpage(pathname: string): GovernanceSubpage {
  const matched = GOVERNANCE_SECTIONS.find((section) => pathname.startsWith(section.to));
  return matched?.id ?? "stability";
}

function toTrend(snapshots: GovernanceSnapshotRecord[], selector: (snapshot: GovernanceSnapshotRecord) => number): UiChartPoint[] {
  return snapshots.map((snapshot) => ({
    label: monthLabel(snapshot.month),
    value: Math.round(selector(snapshot)),
  }));
}

function buildRiskDistribution(snapshot: GovernanceSnapshotRecord | null): UiChartPoint[] {
  return GOVERNANCE_RISK_CLUSTERS.map((cluster) => ({
    label: clusterLabel(cluster),
    value: Math.round(snapshot?.riskDistribution[cluster] ?? 0),
  }));
}

function buildRiskHistory(
  snapshots: GovernanceSnapshotRecord[],
  cluster: GovernanceRiskCluster,
): UiChartPoint[] {
  return snapshots.map((snapshot) => ({
    label: monthLabel(snapshot.month),
    value: Math.round(snapshot.riskDistribution[cluster] ?? 0),
  }));
}

function getDominantRiskPattern(snapshot: GovernanceSnapshotRecord): GovernanceRiskCluster {
  const highRiskClusters: GovernanceRiskCluster[] = ["driftProne", "impulsive", "overextended", "volatile"];
  return highRiskClusters.reduce((dominant, cluster) =>
    snapshot.riskDistribution[cluster] > snapshot.riskDistribution[dominant] ? cluster : dominant,
  "driftProne");
}

function uniqueSortedValues(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) =>
    left.localeCompare(right),
  );
}

function GovernanceWorkspaceNav() {
  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/governance">
        Governance Landing
      </NavLink>
      {GOVERNANCE_SECTIONS.map((section) => (
        <NavLink key={section.id} className="admin-primary-link" to={section.to}>
          {section.label}
        </NavLink>
      ))}
    </div>
  );
}

function decodeIdTokenClaims(idToken: string | null): Record<string, unknown> | null {
  if (!idToken) {
    return null;
  }

  const segments = idToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  try {
    const payloadSegment = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
    const payload = atob(paddedPayload);
    const claims = JSON.parse(payload);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function resolveGovernanceRequestContext(idToken: string | null): Promise<GovernanceRequestContext> {
  const claims = decodeIdTokenClaims(idToken);
  const instituteId =
    typeof claims?.instituteId === "string" && claims.instituteId.trim().length > 0 ?
      claims.instituteId :
      FALLBACK_GOVERNANCE_INSTITUTE_ID;
  const settingsSnapshot = await fetchSettingsSnapshot(instituteId);
  const activeAcademicYear =
    settingsSnapshot.academicYears.find((entry) => entry.status === "Active") ??
    settingsSnapshot.academicYears[0] ??
    null;

  return {
    instituteId,
    yearId: activeAcademicYear?.yearId?.trim() || FALLBACK_GOVERNANCE_YEAR_ID,
  };
}

function GovernanceMonitoringDashboardPage() {
  const { session } = useAuthProvider();
  const location = useLocation();
  const [dataset, setDataset] = useState<GovernanceDashboardDataset>(FALLBACK_GOVERNANCE_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [trendFilters, setTrendFilters] = useState<GovernanceTrendFilters>({
    academicYear: "all",
    batchId: "all",
    examType: "all",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_GOVERNANCE_DATASET);
        setInlineMessage("Local mode detected. Loaded deterministic governanceSnapshots fixtures for Build 123.");
        setIsLoading(false);
        return;
      }

      try {
        const requestContext = await resolveGovernanceRequestContext(session.idToken);
        const apiDataset = await fetchGovernanceDataset(requestContext);
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setInlineMessage(
          `Live mode enabled: governance dashboard hydrated from POST /admin/governance/snapshots for ${requestContext.instituteId} (${requestContext.yearId}).`,
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load governance snapshot data.";
        setDataset(FALLBACK_GOVERNANCE_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic Build 123 fixtures.`);
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
  }, [session.idToken]);

  const currentSubpage = useMemo(() => resolveGovernanceSubpage(location.pathname), [location.pathname]);
  const currentSection = GOVERNANCE_SECTIONS.find((section) => section.id === currentSubpage) ?? GOVERNANCE_SECTIONS[0];

  const orderedSnapshots = useMemo(
    () => [...dataset.snapshots].sort((left, right) => left.month.localeCompare(right.month)),
    [dataset.snapshots],
  );

  const trendFilterOptions = useMemo(
    () => ({
      academicYears: uniqueSortedValues(orderedSnapshots.map((snapshot) => snapshot.academicYear)),
      batches: uniqueSortedValues(orderedSnapshots.map((snapshot) => snapshot.batchName)),
      examTypes: uniqueSortedValues(orderedSnapshots.map((snapshot) => snapshot.examType)),
    }),
    [orderedSnapshots],
  );

  const filteredTrendSnapshots = useMemo(
    () =>
      orderedSnapshots.filter((snapshot) => {
        const academicYearMatches =
          trendFilters.academicYear === "all" || snapshot.academicYear === trendFilters.academicYear;
        const batchMatches = trendFilters.batchId === "all" || snapshot.batchName === trendFilters.batchId;
        const examTypeMatches = trendFilters.examType === "all" || snapshot.examType === trendFilters.examType;
        return academicYearMatches && batchMatches && examTypeMatches;
      }),
    [orderedSnapshots, trendFilters],
  );

  const latestSnapshot = orderedSnapshots[orderedSnapshots.length - 1] ?? null;
  const previousSnapshot = orderedSnapshots[orderedSnapshots.length - 2] ?? null;

  const monthComparison = useMemo<MonthComparison[]>(() => {
    if (!latestSnapshot || !previousSnapshot) {
      return [];
    }

    return [
      {
        label: "Stability Index",
        metric: "index",
        currentValue: latestSnapshot.stabilityIndex,
        previousValue: previousSnapshot.stabilityIndex,
      },
      {
        label: "Phase Adherence",
        metric: "percent",
        currentValue: latestSnapshot.phaseCompliancePercent,
        previousValue: previousSnapshot.phaseCompliancePercent,
      },
      {
        label: "Override Frequency",
        metric: "percent",
        currentValue: latestSnapshot.overrideFrequency,
        previousValue: previousSnapshot.overrideFrequency,
      },
      {
        label: "Execution Integrity",
        metric: "percent",
        currentValue: latestSnapshot.executionIntegrityScore,
        previousValue: previousSnapshot.executionIntegrityScore,
      },
    ];
  }, [latestSnapshot, previousSnapshot]);

  const stabilityTrend = useMemo(() => toTrend(orderedSnapshots, (snapshot) => snapshot.stabilityIndex), [orderedSnapshots]);
  const twelveMonthStabilityTrend = useMemo(
    () => toTrend(orderedSnapshots.slice(-12), (snapshot) => snapshot.stabilityIndex),
    [orderedSnapshots],
  );
  const rawMarksDeviationTrend = useMemo(
    () => toTrend(orderedSnapshots.slice(-12), (snapshot) => snapshot.rawMarksStdDeviation),
    [orderedSnapshots],
  );
  const accuracyDeviationTrend = useMemo(
    () => toTrend(orderedSnapshots.slice(-12), (snapshot) => snapshot.accuracyStdDeviation),
    [orderedSnapshots],
  );
  const batchSpreadTrend = useMemo(
    () => toTrend(orderedSnapshots.slice(-12), (snapshot) => snapshot.batchToBatchSpreadPercent),
    [orderedSnapshots],
  );
  const phaseTrend = useMemo(
    () => toTrend(orderedSnapshots, (snapshot) => snapshot.phaseCompliancePercent),
    [orderedSnapshots],
  );
  const overrideTrend = useMemo(
    () => toTrend(orderedSnapshots, (snapshot) => snapshot.overrideFrequency),
    [orderedSnapshots],
  );
  const integrityTrend = useMemo(
    () => toTrend(orderedSnapshots, (snapshot) => snapshot.executionIntegrityScore),
    [orderedSnapshots],
  );
  const longitudinalStabilityTrend = useMemo(
    () => toTrend(filteredTrendSnapshots, (snapshot) => snapshot.stabilityIndex),
    [filteredTrendSnapshots],
  );
  const longitudinalPhaseTrend = useMemo(
    () => toTrend(filteredTrendSnapshots, (snapshot) => snapshot.phaseCompliancePercent),
    [filteredTrendSnapshots],
  );
  const longitudinalRiskReductionTrend = useMemo(
    () => toTrend(filteredTrendSnapshots, (snapshot) => snapshot.riskReductionPercent),
    [filteredTrendSnapshots],
  );
  const longitudinalControlledAdoptionTrend = useMemo(
    () => toTrend(filteredTrendSnapshots, (snapshot) => snapshot.controlledModeAdoptionPercent),
    [filteredTrendSnapshots],
  );
  const yearOverYearStability = useMemo<UiChartPoint[]>(
    () =>
      trendFilterOptions.academicYears.map((year) => {
        const yearSnapshots = orderedSnapshots.filter((snapshot) => {
          const batchMatches = trendFilters.batchId === "all" || snapshot.batchName === trendFilters.batchId;
          const examTypeMatches = trendFilters.examType === "all" || snapshot.examType === trendFilters.examType;
          return snapshot.academicYear === year && batchMatches && examTypeMatches;
        });
        const average =
          yearSnapshots.length > 0 ?
            yearSnapshots.reduce((sum, snapshot) => sum + snapshot.stabilityIndex, 0) / yearSnapshots.length :
            0;
        return {
          label: year,
          value: Math.round(average),
        };
      }),
    [orderedSnapshots, trendFilterOptions.academicYears, trendFilters.batchId, trendFilters.examType],
  );
  const patternRecurrenceRows = useMemo<PatternRecurrenceRow[]>(() => {
    const totalMonths = filteredTrendSnapshots.length;
    const counts = new Map<string, number>();
    filteredTrendSnapshots.forEach((snapshot) => {
      const pattern = clusterLabel(getDominantRiskPattern(snapshot));
      counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([pattern, repeatedHighRiskMonths]) => ({
        pattern,
        repeatedHighRiskMonths,
        totalMonths,
        recurrencePercent: totalMonths > 0 ? (repeatedHighRiskMonths / totalMonths) * 100 : 0,
      }))
      .sort((left, right) => right.recurrencePercent - left.recurrencePercent);
  }, [filteredTrendSnapshots]);
  const disciplineRollingTrend = useMemo(
    () => toTrend(orderedSnapshots, (snapshot) => snapshot.disciplineIndexRolling30Day),
    [orderedSnapshots],
  );
  const riskExposureTrend = useMemo(
    () => GOVERNANCE_RISK_CLUSTERS.map((cluster) => ({
      label: clusterLabel(cluster),
      value: Math.round(latestSnapshot?.riskDistribution[cluster] ?? 0),
    })),
    [latestSnapshot],
  );
  const latestRiskDistribution = useMemo<UiChartPoint[]>(
    () => buildRiskDistribution(latestSnapshot),
    [latestSnapshot],
  );
  const stableRiskTrend = useMemo(
    () => buildRiskHistory(orderedSnapshots, "stable"),
    [orderedSnapshots],
  );

  const stabilityThresholds = useMemo<StabilityThreshold[]>(
    () => [
      {
        label: "Stable",
        range: "Above 75",
        helper: "Low variance across raw score, accuracy, phase adherence, discipline, and risk fluctuation.",
      },
      {
        label: "Watch zone",
        range: "60-75",
        helper: "Moderate volatility; monitor cohort consistency before structural escalation.",
      },
      {
        label: "Unstable",
        range: "Below 60",
        helper: "High variance signal; review training, template, and execution consistency.",
      },
    ],
    [],
  );
  const difficultyHeatmap = useMemo<DifficultyHeatmapCell[]>(
    () => [
      {
        difficulty: "Easy",
        value: Math.round(latestSnapshot?.stabilityByDifficulty.easy ?? 0),
        helper: "Stability vs easy-question load",
      },
      {
        difficulty: "Medium",
        value: Math.round(latestSnapshot?.stabilityByDifficulty.medium ?? 0),
        helper: "Stability vs medium-question load",
      },
      {
        difficulty: "Hard",
        value: Math.round(latestSnapshot?.stabilityByDifficulty.hard ?? 0),
        helper: "Stability vs hard-question load",
      },
    ],
    [latestSnapshot],
  );
  const driftRiskTrend = useMemo(
    () => buildRiskHistory(orderedSnapshots, "driftProne"),
    [orderedSnapshots],
  );

  const snapshotColumns = useMemo<UiTableColumn<GovernanceSnapshotRecord>[]>(
    () => [
      {
        id: "month",
        header: "Month",
        render: (snapshot) => (
          <div className="admin-governance-month-cell">
            <strong>{monthLabel(snapshot.month)}</strong>
            <small>{snapshot.documentId}</small>
          </div>
        ),
      },
      {
        id: "stability",
        header: "Stability Index",
        render: (snapshot) => Math.round(snapshot.stabilityIndex),
      },
      {
        id: "phaseAdherence",
        header: "Phase Adherence",
        render: (snapshot) => formatPercent(snapshot.phaseCompliancePercent),
      },
      {
        id: "overrideFrequency",
        header: "Override Frequency",
        render: (snapshot) => formatPercent(snapshot.overrideFrequency),
      },
      {
        id: "executionIntegrity",
        header: "Execution Integrity",
        render: (snapshot) => formatPercent(snapshot.executionIntegrityScore),
      },
    ],
    [],
  );

  const reportRows = useMemo<GovernanceReportRow[]>(
    () =>
      [...orderedSnapshots].reverse().map((snapshot) => ({
        id: snapshot.documentId,
        period: monthLabel(snapshot.month),
        generatedAt: formatTimestamp(snapshot.generatedAt),
        stabilityIndex: Math.round(snapshot.stabilityIndex),
        executionIntegrity: Math.round(snapshot.executionIntegrityScore),
        overrideFrequency: Math.round(snapshot.overrideFrequency),
        academicYear: snapshot.academicYear,
        generatedBy: "Director",
        immutability: "Immutable snapshot packet",
      })),
    [orderedSnapshots],
  );

  const snapshotSealRows = useMemo<GovernanceSnapshotSealRow[]>(
    () =>
      [...orderedSnapshots].reverse().map((snapshot, index) => {
        const isLatest = index === 0;

        return {
          id: snapshot.documentId,
          period: monthLabel(snapshot.month),
          generatedAt: formatTimestamp(snapshot.generatedAt),
          sealState: isLatest ? "Active monthly accumulator" : "Sealed historical month",
          storageTreatment: isLatest ? "Nightly refreshed summary document" : "Archived immutable snapshot",
          mutationTreatment: isLatest ? "May refresh before monthly close" : "Read-only; no recompute or overwrite",
          loadTreatment: "Read governanceSnapshots document; never scan sessions/rawAttempts",
        };
      }),
    [orderedSnapshots],
  );

  const reportColumns = useMemo<UiTableColumn<GovernanceReportRow>[]>(
    () => [
      {
        id: "period",
        header: "Report Period",
        render: (row) => (
          <div className="admin-governance-month-cell">
            <strong>{row.period}</strong>
            <small>{row.id}</small>
          </div>
        ),
      },
      {
        id: "generatedAt",
        header: "Timestamp",
        render: (row) => row.generatedAt,
      },
      {
        id: "academicYear",
        header: "Academic Year",
        render: (row) => row.academicYear,
      },
      {
        id: "generatedBy",
        header: "Generated By",
        render: (row) => row.generatedBy,
      },
      {
        id: "stabilityIndex",
        header: "Stability",
        render: (row) => row.stabilityIndex,
      },
      {
        id: "executionIntegrity",
        header: "Integrity",
        render: (row) => `${row.executionIntegrity}%`,
      },
      {
        id: "overrideFrequency",
        header: "Override Share",
        render: (row) => `${row.overrideFrequency}%`,
      },
      {
        id: "immutability",
        header: "Status",
        render: (row) => row.immutability,
      },
    ],
    [],
  );

  const snapshotSealColumns = useMemo<UiTableColumn<GovernanceSnapshotSealRow>[]>(
    () => [
      {
        id: "period",
        header: "Snapshot Period",
        render: (row) => (
          <div className="admin-governance-month-cell">
            <strong>{row.period}</strong>
            <small>{row.id}</small>
          </div>
        ),
      },
      {
        id: "generatedAt",
        header: "Generated At",
        render: (row) => row.generatedAt,
      },
      {
        id: "sealState",
        header: "Seal State",
        render: (row) => row.sealState,
      },
      {
        id: "storageTreatment",
        header: "Storage Treatment",
        render: (row) => row.storageTreatment,
      },
      {
        id: "mutationTreatment",
        header: "Mutation Treatment",
        render: (row) => row.mutationTreatment,
      },
      {
        id: "loadTreatment",
        header: "Load Treatment",
        render: (row) => row.loadTreatment,
      },
    ],
    [],
  );

  const reportSectionColumns = useMemo<UiTableColumn<GovernanceReportSectionRow>[]>(
    () => [
      {
        id: "section",
        header: "PDF Section",
        render: (row) => row.section,
      },
      {
        id: "source",
        header: "Snapshot Source",
        render: (row) => <code>{row.source}</code>,
      },
      {
        id: "includedContent",
        header: "Included Content",
        render: (row) => row.includedContent,
      },
    ],
    [],
  );

  const templateStabilityColumns = useMemo<UiTableColumn<GovernanceTemplateStabilityComparison>[]>(
    () => [
      {
        id: "template",
        header: "Template",
        render: (row) => (
          <div className="admin-governance-month-cell">
            <strong>{row.templateName}</strong>
            <small>{row.templateId} · {row.runCount} runs</small>
          </div>
        ),
      },
      {
        id: "rawDelta",
        header: "Raw Delta",
        render: (row) => formatPercent(row.rawDeltaPercent),
      },
      {
        id: "accuracyDelta",
        header: "Accuracy Delta",
        render: (row) => formatPercent(row.accuracyDeltaPercent),
      },
      {
        id: "riskShift",
        header: "Risk Shift",
        render: (row) => formatPercent(row.riskShiftAcrossBatchesPercent),
      },
      {
        id: "stabilityPair",
        header: "Template vs Batch",
        render: (row) => `${Math.round(row.templateStabilityIndex)} / ${Math.round(row.latestBatchStabilityIndex)}`,
      },
      {
        id: "interpretation",
        header: "Interpretation",
        render: (row) => row.interpretation,
      },
    ],
    [],
  );

  const controlledModeRows = useMemo<ControlledModeRow[]>(
    () => [
      {
        mode: "Controlled Mode Lift",
        rawPercent: latestSnapshot?.controlledModeRawImprovementPercent ?? 0,
        accuracyPercent: latestSnapshot?.controlledModeAccuracyImprovementPercent ?? 0,
        riskReductionPercent: latestSnapshot?.riskReductionPercent ?? 0,
      },
      {
        mode: "Operational Baseline",
        rawPercent: 0,
        accuracyPercent: 0,
        riskReductionPercent: 0,
      },
    ],
    [latestSnapshot],
  );

  const controlledModeColumns = useMemo<UiTableColumn<ControlledModeRow>[]>(
    () => [
      {
        id: "mode",
        header: "Mode",
        render: (row) => row.mode,
      },
      {
        id: "raw",
        header: "Raw %",
        render: (row) => formatPercent(row.rawPercent),
      },
      {
        id: "accuracy",
        header: "Accuracy %",
        render: (row) => formatPercent(row.accuracyPercent),
      },
      {
        id: "riskReduction",
        header: "Risk Reduction",
        render: (row) => formatPercent(row.riskReductionPercent),
      },
    ],
    [],
  );

  const overrideFrequencyBreakdown = useMemo<UiChartPoint[]>(
    () => [
      {
        label: "Per Run",
        value: Math.round(latestSnapshot?.overrideFrequencyPerRun ?? 0),
      },
      {
        label: "Per Batch",
        value: Math.round(latestSnapshot?.overrideFrequencyPerBatch ?? 0),
      },
      {
        label: "Per Teacher",
        value: Math.round(latestSnapshot?.overrideFrequencyPerTeacherAggregated ?? 0),
      },
    ],
    [latestSnapshot],
  );

  const overrideImpactRows = useMemo<OverrideImpactRow[]>(
    () => [
      {
        scenario: "Override Used",
        rawPercent: latestSnapshot?.overrideRawMarksWithOverridePercent ?? 0,
        accuracyShiftPercent: latestSnapshot?.overrideAccuracyShiftPercent ?? 0,
        riskEscalationDelta: latestSnapshot?.overrideRiskEscalationDelta ?? 0,
      },
      {
        scenario: "No Override",
        rawPercent: latestSnapshot?.overrideRawMarksWithoutOverridePercent ?? 0,
        accuracyShiftPercent: 0,
        riskEscalationDelta: 0,
      },
    ],
    [latestSnapshot],
  );

  const overrideImpactColumns = useMemo<UiTableColumn<OverrideImpactRow>[]>(
    () => [
      {
        id: "scenario",
        header: "Scenario",
        render: (row) => row.scenario,
      },
      {
        id: "raw",
        header: "Raw Marks",
        render: (row) => formatPercent(row.rawPercent),
      },
      {
        id: "accuracyShift",
        header: "Accuracy Shift",
        render: (row) => `${row.accuracyShiftPercent > 0 ? "+" : ""}${Math.round(row.accuracyShiftPercent)} pts`,
      },
      {
        id: "riskEscalation",
        header: "Risk Escalation",
        render: (row) => `${Math.round(row.riskEscalationDelta)} pts`,
      },
    ],
    [],
  );

  const batchRiskColumns = useMemo<UiTableColumn<GovernanceBatchRiskSummary>[]>(
    () => [
      {
        id: "batch",
        header: "Batch",
        render: (row) => (
          <div className="admin-governance-month-cell">
            <strong>{row.batchName}</strong>
            <small>{row.batchId}</small>
          </div>
        ),
      },
      {
        id: "stable",
        header: "Stable",
        render: (row) => formatPercent(row.riskDistribution.stable),
      },
      {
        id: "drift",
        header: "Drift",
        render: (row) => formatPercent(row.riskDistribution.driftProne),
      },
      {
        id: "impulsive",
        header: "Impulsive",
        render: (row) => formatPercent(row.riskDistribution.impulsive),
      },
      {
        id: "overextended",
        header: "Overextended",
        render: (row) => formatPercent(row.riskDistribution.overextended),
      },
      {
        id: "discipline",
        header: "Avg Discipline",
        render: (row) => formatPercent(row.avgDisciplineIndex),
      },
      {
        id: "phase",
        header: "Avg Phase",
        render: (row) => formatPercent(row.avgPhaseAdherencePercent),
      },
      {
        id: "rawStability",
        header: "Raw Stability",
        render: (row) => formatPercent(row.rawStabilityScorePercent),
      },
      {
        id: "accuracyStability",
        header: "Accuracy Stability",
        render: (row) => formatPercent(row.accuracyStabilityScorePercent),
      },
    ],
    [],
  );

  const patternRecurrenceColumns = useMemo<UiTableColumn<PatternRecurrenceRow>[]>(
    () => [
      {
        id: "pattern",
        header: "Recurring Risk Pattern",
        render: (row) => row.pattern,
      },
      {
        id: "repeatedMonths",
        header: "Repeated High-Risk Months",
        render: (row) => row.repeatedHighRiskMonths,
      },
      {
        id: "totalMonths",
        header: "Total Months",
        render: (row) => row.totalMonths,
      },
      {
        id: "recurrence",
        header: "Pattern Recurrence Index",
        render: (row) => formatPercent(row.recurrencePercent),
      },
    ],
    [],
  );

  const sectionKpis = useMemo<Record<GovernanceSubpage, GovernanceKpi[]>>(() => {
    const stableShare = latestSnapshot?.riskDistribution.stable ?? 0;
    const driftShare = latestSnapshot?.riskDistribution.driftProne ?? 0;
    const impulsiveShare = latestSnapshot?.riskDistribution.impulsive ?? 0;
    const overextendedShare = latestSnapshot?.riskDistribution.overextended ?? 0;

    return {
      stability: [
        {
          label: "Stability Index",
          value: `${Math.round(latestSnapshot?.stabilityIndex ?? 0)}`,
          helper: "0-100 institutional stability",
        },
        {
          label: "Execution Integrity",
          value: formatPercent(latestSnapshot?.executionIntegrityScore ?? 0),
          helper: "current structural execution quality",
        },
        {
          label: "Stable Share",
          value: formatPercent(stableShare),
          helper: "latest stable cluster coverage",
        },
        {
          label: "Snapshot Coverage",
          value: `${orderedSnapshots.length}`,
          helper: "immutable monthly records",
        },
      ],
      integrity: [
        {
          label: "Phase Adherence",
          value: formatPercent(latestSnapshot?.phaseCompliancePercent ?? 0),
          helper: "monthly compliance rate",
        },
        {
          label: "Execution Integrity",
          value: formatPercent(latestSnapshot?.executionIntegrityScore ?? 0),
          helper: "institutional discipline quality",
        },
        {
          label: "Stable Share",
          value: formatPercent(stableShare),
          helper: "students in stable execution cluster",
        },
        {
          label: "Drift Share",
          value: formatPercent(driftShare),
          helper: "students trending away from structure",
        },
      ],
      "override-audit": [
        {
          label: "Override Frequency",
          value: formatPercent(latestSnapshot?.overrideFrequency ?? 0),
          helper: "share of runs using overrides",
        },
        {
          label: "Integrity After Override",
          value: formatPercent(latestSnapshot?.executionIntegrityScore ?? 0),
          helper: "paired institutional integrity score",
        },
        {
          label: "Stability Index",
          value: `${Math.round(latestSnapshot?.stabilityIndex ?? 0)}`,
          helper: "context for override movement",
        },
        {
          label: "Month Delta",
          value:
            latestSnapshot && previousSnapshot ?
              `${Math.round(latestSnapshot.overrideFrequency - previousSnapshot.overrideFrequency)} pts` :
              "0 pts",
          helper: "change from previous snapshot",
        },
      ],
      "batch-risk": [
        {
          label: "Stable",
          value: formatPercent(stableShare),
          helper: "latest batch mix in stable cluster",
        },
        {
          label: "Drift Prone",
          value: formatPercent(driftShare),
          helper: "latest drift-prone mix",
        },
        {
          label: "Impulsive",
          value: formatPercent(impulsiveShare),
          helper: "latest impulsive share",
        },
        {
          label: "Overextended",
          value: formatPercent(overextendedShare),
          helper: "latest overextended share",
        },
      ],
      trends: [
        {
          label: "Latest Stability",
          value: `${Math.round(latestSnapshot?.stabilityIndex ?? 0)}`,
          helper: "current index level",
        },
        {
          label: "Phase Trend",
          value: formatPercent(latestSnapshot?.phaseCompliancePercent ?? 0),
          helper: "latest compliance mark",
        },
        {
          label: "Override Trend",
          value: formatPercent(latestSnapshot?.overrideFrequency ?? 0),
          helper: "latest override mark",
        },
        {
          label: "Integrity Trend",
          value: formatPercent(latestSnapshot?.executionIntegrityScore ?? 0),
          helper: "latest integrity mark",
        },
      ],
      reports: [
        {
          label: "Reportable Months",
          value: `${orderedSnapshots.length}`,
          helper: "immutable governance periods",
        },
        {
          label: "Latest Snapshot",
          value: latestSnapshot ? monthLabel(latestSnapshot.month) : "-",
          helper: "current report anchor period",
        },
        {
          label: "Avg Stability",
          value:
            orderedSnapshots.length > 0 ?
              `${Math.round(orderedSnapshots.reduce((sum, snapshot) => sum + snapshot.stabilityIndex, 0) / orderedSnapshots.length)}` :
              "0",
          helper: "mean stability across loaded snapshots",
        },
        {
          label: "Avg Integrity",
          value:
            orderedSnapshots.length > 0 ?
              `${Math.round(orderedSnapshots.reduce((sum, snapshot) => sum + snapshot.executionIntegrityScore, 0) / orderedSnapshots.length)}%` :
              "0%",
          helper: "mean execution integrity across snapshots",
        },
      ],
    };
  }, [latestSnapshot, orderedSnapshots, previousSnapshot]);

  function renderMonthComparison() {
    if (monthComparison.length === 0) {
      return null;
    }

    return (
      <section className="admin-governance-comparison">
        <h3>
          Month-to-Month Comparison ({monthLabel(previousSnapshot?.month ?? "")} to {monthLabel(latestSnapshot?.month ?? "")})
        </h3>
        <div className="admin-governance-comparison-grid">
          {monthComparison.map((metric) => {
            const delta = metric.currentValue - metric.previousValue;
            const trend = delta > 0 ? "up" : delta < 0 ? "down" : "stable";
            const currentDisplay =
              metric.metric === "index" ?
                `${Math.round(metric.currentValue)}` :
                formatPercent(metric.currentValue);
            const previousDisplay =
              metric.metric === "index" ?
                `${Math.round(metric.previousValue)}` :
                formatPercent(metric.previousValue);

            return (
              <article key={metric.label} className={`admin-governance-comparison-card admin-governance-comparison-${trend}`}>
                <p>{metric.label}</p>
                <h4>{currentDisplay}</h4>
                <small>
                  Previous {previousDisplay} ({delta >= 0 ? "+" : ""}
                  {Math.round(delta)})
                </small>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderSectionContent() {
    if (currentSubpage === "stability") {
      const stabilityIndex = Math.round(latestSnapshot?.stabilityIndex ?? 0);
      const gaugeRotation = Math.round((Math.max(0, Math.min(100, stabilityIndex)) / 100) * 180 - 90);

      return (
        <>
          <section className="admin-governance-stability-overview" aria-labelledby="admin-governance-stability-overview-title">
            <div>
              <p className="admin-content-eyebrow">Stability Index</p>
              <h3 id="admin-governance-stability-overview-title">{stabilityIndex}</h3>
              <p>
                Current band: <strong>{stabilityBand(stabilityIndex)}</strong>. Composite score derived from normalized
                variance of raw marks, accuracy, phase adherence, discipline index, and risk-state fluctuation.
              </p>
              <small>Source: governanceSnapshots/{latestSnapshot?.documentId ?? "YYYY_MM"}</small>
            </div>
            <div className="admin-governance-gauge" aria-label={`Stability index gauge ${stabilityIndex}`}>
              <div className="admin-governance-gauge-arc" />
              <div className="admin-governance-gauge-needle" style={{ transform: `rotate(${gaugeRotation}deg)` }} />
              <div className="admin-governance-gauge-value">{stabilityIndex}</div>
            </div>
          </section>
          <section className="admin-governance-threshold-grid" aria-label="Institutional stability thresholds">
            {stabilityThresholds.map((threshold) => (
              <article key={threshold.label} className="admin-governance-threshold-card">
                <p>{threshold.label}</p>
                <h4>{threshold.range}</h4>
                <small>{threshold.helper}</small>
              </article>
            ))}
          </section>
          {renderMonthComparison()}
          <div className="admin-governance-chart-grid">
            <UiChartContainer
              title="12-Month Stability Trend"
              subtitle="Institutional stability trajectory from the latest 12 immutable monthly snapshots"
              data={twelveMonthStabilityTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Stable Cluster Share"
              subtitle="Latest governance risk mix centered on the stable cohort"
              data={latestRiskDistribution}
              variant="pie"
            />
          </div>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-variability-title">
            <h3 id="admin-governance-variability-title">Performance Variability</h3>
            <p className="admin-governance-section-copy">
              Variability is read from governance snapshot summaries only: raw marks standard deviation, accuracy
              standard deviation, batch-to-batch spread, and stability by difficulty level.
            </p>
            <div className="admin-governance-chart-grid">
              <UiChartContainer
                title="Raw Marks Std Deviation"
                subtitle="12-month volatility timeline for raw score percentage"
                data={rawMarksDeviationTrend}
                variant="line"
                maxValue={40}
              />
              <UiChartContainer
                title="Accuracy Std Deviation"
                subtitle="12-month volatility timeline for accuracy percentage"
                data={accuracyDeviationTrend}
                variant="line"
                maxValue={40}
              />
              <UiChartContainer
                title="Batch-to-Batch Spread"
                subtitle="Institutional cohort spread comparison across snapshots"
                data={batchSpreadTrend}
                variant="bar"
                maxValue={40}
              />
              <div className="admin-governance-difficulty-heatmap">
                <h4>Stability vs Difficulty Level</h4>
                {difficultyHeatmap.map((cell) => (
                  <article key={cell.difficulty} className="admin-governance-heatmap-cell">
                    <span>{cell.difficulty}</span>
                    <strong>{formatPercent(cell.value)}</strong>
                    <div style={{ width: `${Math.max(8, Math.min(100, cell.value))}%` }} />
                    <small>{cell.helper}</small>
                  </article>
                ))}
              </div>
            </div>
          </section>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-template-stability-title">
            <h3 id="admin-governance-template-stability-title">Template Stability Comparison</h3>
            <p className="admin-governance-section-copy">
              Reused templates are compared from precomputed template stability summaries: raw delta across runs,
              accuracy delta, risk shift across batches, and the interpretation pair for template-vs-batch stability.
            </p>
            <UiTable
              caption="Template stability comparison from summary snapshots"
              columns={templateStabilityColumns}
              rows={dataset.templateStabilityComparisons}
              rowKey={(row) => row.templateId}
              emptyStateText="No reused-template stability comparisons are currently available."
            />
          </section>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-table-title">
            <h3 id="admin-governance-table-title">Governance Snapshot Timeline</h3>
            <UiTable
              caption="Month-by-month institutional stability records"
              columns={snapshotColumns}
              rows={[...orderedSnapshots].reverse()}
              rowKey={(snapshot) => snapshot.documentId}
              emptyStateText="No governance snapshots are currently available."
            />
          </section>
        </>
      );
    }

    if (currentSubpage === "integrity") {
      return (
        <>
          {renderMonthComparison()}
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-controlled-mode-title">
            <h3 id="admin-governance-controlled-mode-title">Controlled Mode Effectiveness</h3>
            <p className="admin-governance-section-copy">
              Controlled Mode comparison is read from governance summaries: average raw improvement, average accuracy
              improvement, and risk reduction. No student-level session records are scanned here.
            </p>
            <UiTable
              caption="Controlled Mode effectiveness comparison"
              columns={controlledModeColumns}
              rows={controlledModeRows}
              rowKey={(row) => row.mode}
            />
          </section>
          <section className="admin-governance-threshold-grid" aria-label="Discipline index trajectory">
            <article className="admin-governance-threshold-card">
              <p>Rolling 30-Day</p>
              <h4>{formatPercent(latestSnapshot?.disciplineIndexRolling30Day ?? 0)}</h4>
              <small>Institution-wide average discipline index over the latest rolling window.</small>
            </article>
            <article className="admin-governance-threshold-card">
              <p>Year-to-Date</p>
              <h4>{formatPercent(latestSnapshot?.disciplineIndexYearToDate ?? 0)}</h4>
              <small>Current-year structural discipline baseline.</small>
            </article>
            <article className="admin-governance-threshold-card">
              <p>YoY Change</p>
              <h4>{Math.round(latestSnapshot?.disciplineIndexYearOverYear ?? 0)} pts</h4>
              <small>Comparison against the previous governance year.</small>
            </article>
          </section>
          <div className="admin-governance-chart-grid">
            <UiChartContainer
              title="Phase Compliance Trend"
              subtitle="Monthly phase discipline trajectory"
              data={phaseTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Discipline Index Trajectory"
              subtitle="Rolling 30-day institution-wide average discipline index"
              data={disciplineRollingTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Execution Integrity Trend"
              subtitle="Institution-wide structural execution quality"
              data={integrityTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Structural Risk Exposure"
              subtitle="Latest institutional behavioral fingerprint by risk state"
              data={riskExposureTrend}
              variant="bar"
              maxValue={100}
            />
          </div>
        </>
      );
    }

    if (currentSubpage === "override-audit") {
      return (
        <>
          {renderMonthComparison()}
          <div className="admin-governance-chart-grid">
            <UiChartContainer
              title="Override Frequency Trend"
              subtitle="Monthly override usage across governance snapshots"
              data={overrideTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Stability vs Override Context"
              subtitle="Read override movement together with institutional stability"
              data={stabilityTrend}
              variant="bar"
              maxValue={100}
            />
            <UiChartContainer
              title="Override Frequency Breakdown"
              subtitle="Per run, per batch, and per-teacher aggregated share; no teacher names shown"
              data={overrideFrequencyBreakdown}
              variant="bar"
              maxValue={100}
            />
          </div>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-override-impact-title">
            <h3 id="admin-governance-override-impact-title">Override Impact Analysis</h3>
            <p className="admin-governance-section-copy">
              Compare raw marks, accuracy shift, and risk escalation when overrides are used versus the no-override
              baseline. These are aggregate governance summaries from overrideAuditSummary records.
            </p>
            <UiTable
              caption="Override impact comparison"
              columns={overrideImpactColumns}
              rows={overrideImpactRows}
              rowKey={(row) => row.scenario}
            />
          </section>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-repeated-override-title">
            <h3 id="admin-governance-repeated-override-title">Repeated Override Pattern</h3>
            <article className="admin-governance-report-copy">
              <p>
                {latestSnapshot?.repeatedOverridePatternLabel ?? "Controlled Mode bypassed"}{" "}
                {Math.round(latestSnapshot?.repeatedOverridePatternCount ?? 0)} times this month.
              </p>
              <small>
                Shown as a structural pattern only. No teacher names are surfaced in the main governance dashboard.
              </small>
            </article>
          </section>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-audit-title">
            <h3 id="admin-governance-audit-title">Override Audit Timeline</h3>
            <UiTable
              caption="Month-by-month override share and governance context"
              columns={snapshotColumns}
              rows={[...orderedSnapshots].reverse()}
              rowKey={(snapshot) => snapshot.documentId}
              emptyStateText="No override audit records are currently available."
            />
          </section>
        </>
      );
    }

    if (currentSubpage === "batch-risk") {
      return (
        <>
          <div className="admin-governance-chart-grid">
            <UiChartContainer
              title="Latest Batch Risk Mix"
              subtitle="Current governance risk distribution across institutional batches"
              data={latestRiskDistribution}
              variant="pie"
            />
            <UiChartContainer
              title="Stable Share Trend"
              subtitle="Monthly movement in the stable cohort"
              data={stableRiskTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Drift-Prone Share Trend"
              subtitle="Monthly movement in drift-prone exposure"
              data={driftRiskTrend}
              variant="line"
              maxValue={100}
            />
          </div>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-batch-risk-title">
            <h3 id="admin-governance-batch-risk-title">Batch Risk Snapshot Matrix</h3>
            <p className="admin-governance-section-copy">
              Batch risk is read from governance snapshot summaries. The matrix compares risk-state intensity and
              discipline metrics across cohorts to identify training inconsistency.
            </p>
            <UiTable
              caption="Batch risk-state matrix and discipline metrics"
              columns={batchRiskColumns}
              rows={dataset.batchRiskSummaries}
              rowKey={(row) => row.batchId}
              emptyStateText="No batch risk records are currently available."
            />
          </section>
        </>
      );
    }

    if (currentSubpage === "trends") {
      return (
        <>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-trends-filter-title">
            <h3 id="admin-governance-trends-filter-title">Longitudinal Trend Filters</h3>
            <p className="admin-governance-section-copy">
              Cross-year governance reads stay bounded to immutable governanceSnapshots. Filters narrow the displayed
              Academic Year, Batch, and Exam Type views without session-level recomputation.
            </p>
            <div className="admin-analytics-filter-grid">
              <label htmlFor="governance-trends-academic-year">
                Academic Year
                <select
                  id="governance-trends-academic-year"
                  value={trendFilters.academicYear}
                  onChange={(event) =>
                    setTrendFilters((current) => ({
                      ...current,
                      academicYear: event.target.value,
                    }))
                  }
                >
                  <option value="all">All academic years</option>
                  {trendFilterOptions.academicYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="governance-trends-batch">
                Batch
                <select
                  id="governance-trends-batch"
                  value={trendFilters.batchId}
                  onChange={(event) =>
                    setTrendFilters((current) => ({
                      ...current,
                      batchId: event.target.value,
                    }))
                  }
                >
                  <option value="all">All batches</option>
                  {trendFilterOptions.batches.map((batchName) => (
                    <option key={batchName} value={batchName}>
                      {batchName}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="governance-trends-exam-type">
                Exam Type
                <select
                  id="governance-trends-exam-type"
                  value={trendFilters.examType}
                  onChange={(event) =>
                    setTrendFilters((current) => ({
                      ...current,
                      examType: event.target.value,
                    }))
                  }
                >
                  <option value="all">All exam types</option>
                  {trendFilterOptions.examTypes.map((examType) => (
                    <option key={examType} value={examType}>
                      {examType}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <div className="admin-governance-chart-grid">
            <UiChartContainer
              title="Year-over-Year Stability"
              subtitle="Average Stability Index by academic year from governanceSnapshots"
              data={yearOverYearStability}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Filtered Stability Index"
              subtitle="Longitudinal stability trajectory for the selected filter set"
              data={longitudinalStabilityTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Phase Adherence Trend"
              subtitle="Discipline growth input: phase adherence percent"
              data={longitudinalPhaseTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Risk Reduction Trend"
              subtitle="Discipline growth input: risk reduction percent"
              data={longitudinalRiskReductionTrend}
              variant="line"
              maxValue={100}
            />
            <UiChartContainer
              title="Controlled Mode Adoption"
              subtitle="Discipline growth input: controlled-mode adoption percent"
              data={longitudinalControlledAdoptionTrend}
              variant="line"
              maxValue={100}
            />
          </div>
          <section className="admin-governance-table-section" aria-labelledby="admin-governance-pattern-recurrence-title">
            <h3 id="admin-governance-pattern-recurrence-title">Pattern Recurrence Index</h3>
            <p className="admin-governance-section-copy">
              Pattern recurrence is calculated as repeatedHighRiskMonths divided by totalMonths for the selected
              longitudinal filter set. Higher values indicate systemic pattern persistence.
            </p>
            <UiTable
              caption="Pattern recurrence by dominant high-risk state"
              columns={patternRecurrenceColumns}
              rows={patternRecurrenceRows}
              rowKey={(row) => row.pattern}
              emptyStateText="No longitudinal recurrence records are currently available."
            />
          </section>
        </>
      );
    }

    return (
      <>
        <section className="admin-governance-report-copy">
          <p>
            Governance reports are PDF-first institutional packets generated from immutable governance snapshots only.
            The packet is prepared for trustee review, strategic planning, and accreditation documentation without
            recomputing historical months or reading raw sessions.
          </p>
        </section>
        <div className="admin-governance-comparison-grid">
          {governanceReportWorkflowSteps.map((step) => (
            <article key={step.title} className="admin-governance-comparison-card">
              <p>{step.title}</p>
              <strong>{step.detail}</strong>
            </article>
          ))}
        </div>
        <div className="admin-governance-chart-grid">
          <UiChartContainer
            title="Report Stability Baseline"
            subtitle="Latest stability context included in governance report packets"
            data={stabilityTrend}
            variant="line"
            maxValue={100}
          />
          <UiChartContainer
            title="Report Integrity Baseline"
            subtitle="Latest execution integrity context included in governance report packets"
            data={integrityTrend}
            variant="line"
            maxValue={100}
          />
        </div>
        <section className="admin-governance-table-section" aria-labelledby="admin-governance-pdf-sections-title">
          <h3 id="admin-governance-pdf-sections-title">PDF Packet Sections</h3>
          <UiTable
            caption="Governance report sections generated from snapshot documents"
            columns={reportSectionColumns}
            rows={governanceReportSections}
            rowKey={(row) => row.section}
            emptyStateText="No governance report sections are configured."
          />
        </section>
        <section className="admin-governance-table-section" aria-labelledby="admin-governance-reports-title">
          <h3 id="admin-governance-reports-title">Governance Report Packets</h3>
          <p className="admin-governance-section-copy">
            Each packet carries timestamp, academic year, Director generation metadata, and immutable source-period
            status. Export actions should render the PDF from these rows rather than rebuilding metrics on demand.
          </p>
          <UiTable
            caption="Snapshot-backed governance report periods ready for export workflows"
            columns={reportColumns}
            rows={reportRows}
            rowKey={(row) => row.id}
            emptyStateText="No governance report packets are currently available."
          />
        </section>
        <section className="admin-governance-report-copy" aria-label="Governance report source policy">
          <p>
            Source policy: read <code>governanceSnapshots/{`{YYYY-MM}`}</code>, <code>overrideAuditSummary</code>,
            <code>batchRiskSummaries</code>, and Insights Engine recommendation summaries. Never scan sessions,
            rawAttempts, or per-question logs while preparing a governance report.
          </p>
        </section>
      </>
    );
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-governance-dashboard-title">
      <p className="admin-content-eyebrow">{currentSection.eyebrow}</p>
      <h2 id="admin-governance-dashboard-title">{currentSection.title}</h2>
      <p className="admin-content-copy">{currentSection.description}</p>

      <GovernanceWorkspaceNav />

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading governance monitoring dashboard..." : inlineMessage ?? "Governance dashboard ready."}
      </p>

      <div className="admin-governance-route-banner">
        <div>
          <strong>Mounted Route</strong>
          <span>{currentSection.to}</span>
        </div>
        <div>
          <strong>Snapshot Source</strong>
          <span>governanceSnapshots only</span>
        </div>
        <div>
          <strong>Latest Snapshot</strong>
          <span>{latestSnapshot ? monthLabel(latestSnapshot.month) : "No data"}</span>
        </div>
      </div>

      <div className="admin-governance-kpi-grid">
        {sectionKpis[currentSubpage].map((kpi) => (
          <article key={kpi.label} className="admin-governance-kpi-card">
            <p>{kpi.label}</p>
            <h3>{kpi.value}</h3>
            <small>{kpi.helper}</small>
          </article>
        ))}
      </div>

      <section className="admin-governance-table-section" aria-labelledby="admin-governance-sealed-month-title">
        <h3 id="admin-governance-sealed-month-title">Sealed Historical Month Treatment</h3>
        <p className="admin-governance-section-copy">
          Governance reads the current month as a nightly refreshed accumulator until monthly close. Earlier periods are
          sealed historical months: immutable, archive-retained, reportable, and never recomputed from raw sessions.
        </p>
        <div className="admin-governance-comparison-grid">
          {governanceSealPolicyCards.map((card) => (
            <article key={card.title} className="admin-governance-comparison-card">
              <p>{card.title}</p>
              <strong>{card.detail}</strong>
            </article>
          ))}
        </div>
        <UiTable
          caption="Governance snapshot seal register"
          columns={snapshotSealColumns}
          rows={snapshotSealRows}
          rowKey={(row) => row.id}
          emptyStateText="No governance snapshot seal records are currently available."
        />
      </section>

      {renderSectionContent()}
    </section>
  );
}

export default GovernanceMonitoringDashboardPage;
