import { useMemo } from "react";
import { UiStatCard } from "../../../../../shared/ui/components";
import {
  fetchStudentPerformanceDataset,
  type StudentPerformanceDataset,
  type StudentPerformancePoint,
} from "../performance/studentPerformanceDataset";
import StudentSummaryRead from "../../services/StudentSummaryRead";

interface DisciplineMetricCard {
  label: string;
  value: string;
  helper: string;
  progressWidth: string;
}

function formatPercent(value: number | null): string {
  if (value === null) return "Unavailable";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatUnsignedPercent(value: number | null): string {
  if (value === null) return "Unavailable";
  return `${Math.round(value)}%`;
}

function getProgressWidth(value: number | null, mode: "standard" | "delta" = "standard"): string {
  if (value === null) return "0%";
  if (mode === "delta") {
    return `${Math.max(0, Math.min(100, Math.round(value + 50)))}%`;
  }

  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function getLatestTimelinePoint(
  dataset: StudentPerformanceDataset,
): StudentPerformancePoint | undefined {
  return dataset.timeline[dataset.timeline.length - 1];
}

function loadDiscipline() { return fetchStudentPerformanceDataset(10); }
function StudentDisciplinePage() {
  return <StudentSummaryRead load={loadDiscipline} label="discipline">
    {(dataset) => <DisciplineContent dataset={dataset} />}
  </StudentSummaryRead>;
}
function DisciplineContent({dataset}: {dataset: StudentPerformanceDataset}) {
  const latestTimelinePoint = useMemo(() => getLatestTimelinePoint(dataset), [dataset]);

  const overviewCards = useMemo(() => {
    return [
      {
        label: "Discipline Index",
        value: formatUnsignedPercent(dataset.disciplineIndex),
        helper: "Execution maturity score",
      },
      {
        label: "Phase Compliance %",
        value: formatUnsignedPercent(dataset.phaseCompliancePercent),
        helper: "Planned pace adherence",
      },
      {
        label: "Guess Probability Cluster",
        value: `${dataset.guessProbabilityCluster ?? "Unavailable"} (${formatUnsignedPercent(dataset.guessProbabilityPercent)})`,
        helper: "Confidence pattern",
      },
    ];
  }, [
    dataset.disciplineIndex,
    dataset.guessProbabilityCluster,
    dataset.guessProbabilityPercent,
    dataset.phaseCompliancePercent,
  ]);

  const disciplineMetricCards = useMemo<DisciplineMetricCard[]>(() => {
    return [
      {
        label: "Discipline Index",
        value: formatUnsignedPercent(dataset.disciplineIndex),
        helper: "0-100 maturity score",
        progressWidth: getProgressWidth(dataset.disciplineIndex),
      },
      {
        label: "Phase Compliance %",
        value: formatUnsignedPercent(dataset.phaseCompliancePercent),
        helper: "Keeps phase pacing steady",
        progressWidth: getProgressWidth(dataset.phaseCompliancePercent),
      },
      {
        label: "Controlled Mode Improvement %",
        value: formatPercent(dataset.controlledModeImprovementPercent),
        helper: "Lift versus uncontrolled attempts",
        progressWidth: getProgressWidth(dataset.controlledModeImprovementPercent, "delta"),
      },
      {
        label: "Overstay Frequency",
        value: formatUnsignedPercent(dataset.overstayFrequencyPercent),
        helper: "Lower is better",
        progressWidth: getProgressWidth(dataset.overstayFrequencyPercent),
      },
      {
        label: "Guess Probability Cluster",
        value: `${dataset.guessProbabilityCluster ?? "Unavailable"} (${formatUnsignedPercent(dataset.guessProbabilityPercent)})`,
        helper: "Interpretive confidence band",
        progressWidth: getProgressWidth(dataset.guessProbabilityPercent),
      },
    ];
  }, [
    dataset.controlledModeImprovementPercent,
    dataset.disciplineIndex,
    dataset.guessProbabilityCluster,
    dataset.guessProbabilityPercent,
    dataset.overstayFrequencyPercent,
    dataset.phaseCompliancePercent,
  ]);

  return (
    <section className="student-content-card student-discipline-page" aria-labelledby="student-discipline-title">
      <h2 id="student-discipline-title">Student Discipline</h2>
      <p className="student-content-copy">
        Track execution habits with lightweight progress bars that stay motivational and easy to act on.
      </p>

      <p>Academic year: {dataset.scope.yearId}</p>

      <div className="student-discipline-kpi-grid">
        {overviewCards.map((card) => (
          <UiStatCard key={card.label} title={card.label} value={card.value} helper={card.helper} />
        ))}
      </div>

      <section className="student-discipline-summary-strip" aria-label="Discipline summary">
        <p>
          Discipline stays separate from scores here so you can focus on repeatable exam habits.
        </p>
        <p>
          Latest run snapshot:
          {" "}
          <strong>
            {latestTimelinePoint ?
              `${formatUnsignedPercent(latestTimelinePoint.phaseAdherencePercent)} phase adherence, ${formatUnsignedPercent(latestTimelinePoint.overstayFrequencyPercent)} overstay frequency, ${formatUnsignedPercent(latestTimelinePoint.guessRatePercent)} guess rate.` :
              "No recent run summary available."}
          </strong>
        </p>
      </section>

      <section className="student-discipline-progress-section" aria-label="Execution maturity metrics">
        <h3>Execution Maturity Signals</h3>
        <div className="student-discipline-progress-grid">
          {disciplineMetricCards.map((card) => (
            <article key={card.label} className="student-discipline-progress-card">
              <header>
                <strong>{card.label}</strong>
                <span>{card.value}</span>
              </header>
              <p>{card.helper}</p>
              {!card.value.includes("Unavailable") ? <div className="student-discipline-progress-track" aria-hidden="true">
                <span style={{ width: card.progressWidth }} />
              </div> : null}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export default StudentDisciplinePage;
