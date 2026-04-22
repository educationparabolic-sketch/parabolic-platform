import { useMemo } from "react";
import {
  UiChartContainer,
  UiStatCard,
  UiTable,
  type UiChartPoint,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  getVendorIntelligenceDataset,
  type DisciplineIndexPoint,
  type TopicWeaknessCluster,
  type VendorMonthlyTrendPoint,
} from "./vendorIntelligenceDataset";

function formatMonth(month: string): string {
  const [year, monthIndex] = month.split("-");
  const parsed = new Date(`${year}-${monthIndex}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return month;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

function VendorIntelligenceDashboardPage() {
  const dataset = useMemo(() => getVendorIntelligenceDataset(), []);

  const mrrTrendPoints = useMemo<UiChartPoint[]>(() => {
    return dataset.monthlyTrend.map((entry) => ({
      label: formatMonth(entry.month),
      value: Math.round(entry.mrrUsd / 1000),
    }));
  }, [dataset.monthlyTrend]);

  const studentGrowthPoints = useMemo<UiChartPoint[]>(() => {
    return dataset.monthlyTrend.map((entry) => ({
      label: formatMonth(entry.month),
      value: Math.round(entry.activeStudents / 100),
    }));
  }, [dataset.monthlyTrend]);

  const layerDistributionPoints = useMemo<UiChartPoint[]>(() => {
    return dataset.layerDistribution.map((entry) => ({
      label: entry.layer,
      value: entry.instituteCount,
    }));
  }, [dataset.layerDistribution]);

  const behaviorSignalPoints = useMemo<UiChartPoint[]>(() => {
    return dataset.behaviorSignals.map((entry) => ({
      label: entry.metric
        .replace("Global", "")
        .replace("Frequency", " Freq")
        .replace("ControlledMode", "Controlled"),
      value: Number(entry.percentage.toFixed(1)),
    }));
  }, [dataset.behaviorSignals]);

  const disciplineColumns = useMemo<Array<UiTableColumn<DisciplineIndexPoint>>>(() => {
    return [
      {
        id: "examType",
        header: "Exam Type",
        render: (row) => row.examType,
      },
      {
        id: "disciplineIndex",
        header: "Discipline Index",
        render: (row) => row.disciplineIndex.toFixed(1),
      },
    ];
  }, []);

  const trendColumns = useMemo<Array<UiTableColumn<VendorMonthlyTrendPoint>>>(() => {
    return [
      {
        id: "month",
        header: "Month",
        render: (row) => formatMonth(row.month),
      },
      {
        id: "mrrUsd",
        header: "MRR",
        render: (row) => formatCurrency(row.mrrUsd),
      },
      {
        id: "activeInstitutes",
        header: "Active Institutes",
        render: (row) => formatNumber(row.activeInstitutes),
      },
      {
        id: "activeStudents",
        header: "Active Students",
        render: (row) => formatNumber(row.activeStudents),
      },
      {
        id: "churnRatePercent",
        header: "Churn",
        render: (row) => `${row.churnRatePercent.toFixed(1)}%`,
      },
    ];
  }, []);

  const weaknessColumns = useMemo<Array<UiTableColumn<TopicWeaknessCluster>>>(() => {
    return [
      {
        id: "examType",
        header: "Exam Type",
        render: (row) => row.examType,
      },
      {
        id: "instituteCount",
        header: "Institutes",
        render: (row) => String(row.instituteCount),
      },
      {
        id: "severity",
        header: "Severity",
        render: (row) => row.severity,
      },
      {
        id: "dominantTopics",
        header: "Dominant Topics",
        render: (row) => row.dominantTopics.join(", "),
      },
    ];
  }, []);

  return (
    <section className="vendor-content-card" aria-labelledby="vendor-intelligence-title">
      <p className="vendor-content-eyebrow">Build 139</p>
      <h2 id="vendor-intelligence-title">Vendor Intelligence Dashboard</h2>
      <p className="vendor-content-copy">
        Macro-level cross-institute intelligence and commercial performance metrics derived from aggregated
        collections only.
      </p>

      <div className="vendor-overview-grid">
        {dataset.kpis.map((metric) => (
          <UiStatCard key={metric.id} title={metric.label} value={metric.value} helper={metric.helper} />
        ))}
      </div>

      <div className="vendor-section-grid vendor-intelligence-chart-grid">
        <UiChartContainer
          title="MRR Trend (USD thousands)"
          subtitle="Monthly recurring revenue from billing aggregates"
          variant="line"
          data={mrrTrendPoints}
        />
        <UiChartContainer
          title="Active Student Growth (hundreds)"
          subtitle="Cross-institute active student expansion"
          variant="line"
          data={studentGrowthPoints}
        />
        <UiChartContainer
          title="Layer Distribution"
          subtitle="Institute distribution across L0-L3"
          variant="pie"
          data={layerDistributionPoints}
        />
        <UiChartContainer
          title="Behavior Signals (%)"
          subtitle="Hard-bias, easy-neglect, and controlled-mode effectiveness"
          variant="bar"
          maxValue={100}
          data={behaviorSignalPoints}
        />
      </div>

      <div className="vendor-section-grid">
        <UiTable
          caption="Discipline index by exam type"
          columns={disciplineColumns}
          rows={dataset.disciplineIndexByExamType}
          rowKey={(row) => row.examType}
          emptyStateText="No discipline index aggregates available."
        />

        <UiTable
          caption="Monthly business metrics"
          columns={trendColumns}
          rows={dataset.monthlyTrend}
          rowKey={(row) => row.month}
          emptyStateText="No business metrics available."
        />
      </div>

      <UiTable
        caption="Topic weakness clusters across institutes"
        columns={weaknessColumns}
        rows={dataset.topicWeaknessClusters}
        rowKey={(row) => row.clusterId}
        emptyStateText="No weakness clusters available."
      />

      <div className="vendor-boundary-note" role="note" aria-label="Vendor intelligence data boundaries">
        <p>Data boundary controls:</p>
        <ul>
          <li>Sources: vendorAggregates, billingRecords, licenseHistory.</li>
          <li>No cross-institute raw session scans.</li>
          <li>Dashboard outputs use precomputed aggregate summaries only.</li>
        </ul>
      </div>
    </section>
  );
}

export default VendorIntelligenceDashboardPage;
