import { useEffect, useMemo, useState } from "react";
import { useGlobalPortalState } from "../../../../../shared/services/globalPortalState";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import { UiStatCard } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  STUDENT_PERFORMANCE_FALLBACK_DATASET,
  fetchStudentPerformanceDataset,
  shouldUseLiveApi,
  type StudentPerformanceDataset,
  type StudentPerformancePoint,
} from "../performance/studentPerformanceDataset";
import { isStudentDebugMode } from "../../services/studentDebugMode";

const LICENSE_LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

interface DisciplineMetricCard {
  label: string;
  value: string;
  helper: string;
  progressWidth: string;
}

function formatPercent(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatUnsignedPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function getProgressWidth(value: number, mode: "standard" | "delta" = "standard"): string {
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

function StudentDisciplinePage() {
  const globalState = useGlobalPortalState();
  const debugMode = isStudentDebugMode();
  const [dataset, setDataset] = useState<StudentPerformanceDataset>(STUDENT_PERFORMANCE_FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDiscipline() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(STUDENT_PERFORMANCE_FALLBACK_DATASET);
        setInlineMessage(
          "Showing practice discipline trends so you can explore this page.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const apiDataset = await fetchStudentPerformanceDataset(10);
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setInlineMessage("Your discipline trends are up to date.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason =
          error instanceof ApiClientError ?
            error.message :
            "Failed to load student discipline summary.";
        setDataset(STUDENT_PERFORMANCE_FALLBACK_DATASET);
        setInlineMessage(`${reason} Showing practice discipline trends for now.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDiscipline();

    return () => {
      isMounted = false;
    };
  }, []);

  const activeLicenseLayer = useMemo<LicenseLayer>(() => {
    const resolvedLayer = globalState.licenseLayer ?? dataset.licenseLayer;
    return LICENSE_LAYER_ORDER[resolvedLayer] > LICENSE_LAYER_ORDER.L2 ? "L2" : resolvedLayer;
  }, [dataset.licenseLayer, globalState.licenseLayer]);

  const latestTimelinePoint = useMemo(() => getLatestTimelinePoint(dataset), [dataset]);

  const overviewCards = useMemo(() => {
    return [
      {
        label: "Discipline Index",
        value: isLoading ? "..." : formatUnsignedPercent(dataset.disciplineIndex),
        helper: "Execution maturity score",
      },
      {
        label: "Phase Compliance %",
        value: isLoading ? "..." : formatUnsignedPercent(dataset.phaseCompliancePercent),
        helper: "Planned pace adherence",
      },
      {
        label: "Guess Probability Cluster",
        value:
          isLoading ?
            "..." :
            `${dataset.guessProbabilityCluster} (${formatUnsignedPercent(dataset.guessProbabilityPercent)})`,
        helper: "Confidence pattern",
      },
    ];
  }, [
    dataset.disciplineIndex,
    dataset.guessProbabilityCluster,
    dataset.guessProbabilityPercent,
    dataset.phaseCompliancePercent,
    isLoading,
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
        value: `${dataset.guessProbabilityCluster} (${formatUnsignedPercent(dataset.guessProbabilityPercent)})`,
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
      {debugMode ? <p className="student-content-eyebrow">Build 151</p> : null}
      <h2 id="student-discipline-title">Student Discipline</h2>
      <p className="student-content-copy">
        Track execution habits with lightweight progress bars that stay motivational and easy to act on.
      </p>
      {debugMode ? <p className="student-dashboard-layer-badge">License Layer: {activeLicenseLayer}</p> : null}
      {isLoading ? <p className="student-learning-state" role="status">Preparing your discipline trends...</p> : null}

      {debugMode && inlineMessage ? <p className="student-discipline-inline-note">{inlineMessage}</p> : null}

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
                <span>{isLoading ? "..." : card.value}</span>
              </header>
              <p>{card.helper}</p>
              <div className="student-discipline-progress-track" aria-hidden="true">
                <span style={{ width: isLoading ? "0%" : card.progressWidth }} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export default StudentDisciplinePage;
