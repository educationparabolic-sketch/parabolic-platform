import {useCallback, useEffect, useMemo, useState} from "react";
import {useAuthProvider} from "../../../../../shared/services/authProvider";
import {resolveGlobalPortalState} from "../../../../../shared/services/globalPortalState";
import {UiTable, type UiTableColumn} from "../../../../../shared/ui/components";
import {
  ApiClientError,
  buildHighRiskCandidates,
  createInterventionRecommendation,
  fetchInterventionDataset,
  listInterventionRecommendations,
  updateInterventionOutcome,
  type AdminInterventionRecommendationRecord,
  type AdminInterventionRecommendationStatus,
  type HighRiskInterventionCandidate,
} from "./interventionDataset";
import InsightsWorkspaceNav from "./InsightsWorkspaceNav";

type OutcomeStatus = Exclude<AdminInterventionRecommendationStatus, "pending">;

const OUTCOME_OPTIONS: OutcomeStatus[] = [
  "improving",
  "no_change",
  "escalated",
  "resolved",
];

interface OutcomeDraft {
  notes: string;
  status: OutcomeStatus;
}

const formatTimestamp = (value: string): string => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value :
    new Date(parsed).toISOString().replace("T", " ").slice(0, 16);
};

function InterventionToolsPage() {
  const {session} = useAuthProvider();
  const portalState = resolveGlobalPortalState({portal: "admin", session});
  const canRead = portalState.license.featureFlags.riskOverview;
  const canMutate = canRead &&
    (portalState.role === "teacher" || portalState.role === "admin");
  const [yearId, setYearId] = useState("");
  const [candidates, setCandidates] = useState<HighRiskInterventionCandidate[]>([]);
  const [timeline, setTimeline] = useState<AdminInterventionRecommendationRecord[]>([]);
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<string, OutcomeDraft>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadTimeline = useCallback(async (activeYearId: string) => {
    const result = await listInterventionRecommendations({
      limit: 50,
      yearId: activeYearId,
    });
    setTimeline(result.recommendations);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);
      if (!canRead) {
        setIsLoading(false);
        return;
      }
      try {
        const dataset = await fetchInterventionDataset();
        const activeYearId = dataset.yearBehaviorSummary.academicYear;
        const result = await listInterventionRecommendations({
          limit: 50,
          yearId: activeYearId,
        });
        if (mounted) {
          setYearId(activeYearId);
          setCandidates(buildHighRiskCandidates(dataset));
          setTimeline(result.recommendations);
        }
      } catch (error) {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message :
            "Failed to load intervention recommendations.");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [canRead]);

  const createRecommendation = useCallback(async (
    candidate: HighRiskInterventionCandidate,
    recommendationType: "remedial_test" | "student_message",
  ): Promise<void> => {
    if (!canMutate || !yearId || !candidate.sourceMetricsUpdatedAt) {
      return;
    }
    setPendingId(candidate.studentId);
    setMessage(null);
    try {
      await createInterventionRecommendation({
        idempotencyKey: crypto.randomUUID(),
        ...(recommendationType === "remedial_test" ? {
          recommendedTestId: candidate.suggestedRemedialTestId,
        } : {
          messageDraft: candidate.suggestedMessageDraft,
        }),
        recommendationType,
        sourceMetricsUpdatedAt: candidate.sourceMetricsUpdatedAt,
        studentId: candidate.studentId,
        yearId,
      });
      await reloadTimeline(yearId);
      setMessage(`Advisory ${recommendationType.replace("_", " ")} recommendation saved.`);
    } catch (error) {
      setMessage(error instanceof ApiClientError || error instanceof Error ?
        error.message : "Recommendation creation failed.");
    } finally {
      setPendingId(null);
    }
  }, [canMutate, reloadTimeline, yearId]);

  const updateOutcome = useCallback(async (
    recommendation: AdminInterventionRecommendationRecord,
  ): Promise<void> => {
    const draft = outcomeDrafts[recommendation.interventionId] ?? {
      notes: "",
      status: "improving" as const,
    };
    setPendingId(recommendation.interventionId);
    setMessage(null);
    try {
      await updateInterventionOutcome(recommendation.interventionId, {
        expectedRevision: recommendation.revision,
        idempotencyKey: crypto.randomUUID(),
        outcomeNotes: draft.notes || undefined,
        status: draft.status,
      });
      await reloadTimeline(yearId);
      setMessage("Outcome saved and reconciled from the authoritative timeline.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Outcome update failed.");
    } finally {
      setPendingId(null);
    }
  }, [outcomeDrafts, reloadTimeline, yearId]);

  const candidateColumns = useMemo<UiTableColumn<HighRiskInterventionCandidate>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        render: (row) => <div><strong>{row.studentName}</strong><small>{row.studentId}</small></div>,
      },
      {id: "risk", header: "Risk", render: (row) => row.rollingRiskCluster},
      {id: "discipline", header: "Discipline", render: (row) => Math.round(row.disciplineIndex)},
      {
        id: "actions",
        header: "Advisory actions",
        render: (row) => (
          <div className="admin-intervention-action-cell">
            <button
              type="button"
              className="admin-compact-button"
              disabled={!canMutate || !row.sourceMetricsUpdatedAt || pendingId !== null}
              onClick={() => void createRecommendation(row, "remedial_test")}
            >Recommend remedial test</button>
            <button
              type="button"
              className="admin-compact-button"
              disabled={!canMutate || !row.sourceMetricsUpdatedAt || pendingId !== null}
              onClick={() => void createRecommendation(row, "student_message")}
            >Draft student message</button>
            {!row.sourceMetricsUpdatedAt ? <small>Source metrics timestamp unavailable.</small> : null}
          </div>
        ),
      },
    ],
    [canMutate, createRecommendation, pendingId],
  );

  const timelineColumns = useMemo<UiTableColumn<AdminInterventionRecommendationRecord>[]>(
    () => [
      {id: "updated", header: "Updated", render: (row) => formatTimestamp(row.updatedAt)},
      {
        id: "student",
        header: "Student",
        render: (row) => <div><strong>{row.studentName}</strong><small>{row.studentId}</small></div>,
      },
      {
        id: "recommendation",
        header: "Recommendation",
        render: (row) => row.recommendedTestId ?? row.messageDraft ?? "Advisory only",
      },
      {id: "status", header: "Status", render: (row) => `${row.status} · rev ${row.revision}`},
      {
        id: "outcome",
        header: "Outcome",
        render: (row) => {
          const draft = outcomeDrafts[row.interventionId] ?? {
            notes: row.outcomeNotes ?? "",
            status: row.status === "pending" ? "improving" : row.status,
          };
          return (
            <div className="admin-intervention-outcome-editor">
              <select
                disabled={!canMutate || pendingId !== null}
                value={draft.status}
                onChange={(event) => setOutcomeDrafts((current) => ({
                  ...current,
                  [row.interventionId]: {
                    notes: draft.notes,
                    status: event.target.value as OutcomeStatus,
                  },
                }))}
              >
                {OUTCOME_OPTIONS.map((status) => <option key={status}>{status}</option>)}
              </select>
              <input
                disabled={!canMutate || pendingId !== null}
                placeholder="Outcome notes"
                value={draft.notes}
                onChange={(event) => setOutcomeDrafts((current) => ({
                  ...current,
                  [row.interventionId]: {notes: event.target.value, status: draft.status},
                }))}
              />
              <button
                type="button"
                className="admin-compact-button"
                disabled={!canMutate || pendingId !== null}
                onClick={() => void updateOutcome(row)}
              >{pendingId === row.interventionId ? "Saving…" : "Save outcome"}</button>
            </div>
          );
        },
      },
    ],
    [canMutate, outcomeDrafts, pendingId, updateOutcome],
  );

  return (
    <section className="admin-content-card" aria-labelledby="intervention-tools-title">
      <p className="admin-content-eyebrow">Insights / Interventions</p>
      <h2 id="intervention-tools-title">Intervention Recommendations</h2>
      <p className="admin-content-copy">
        Recommendations are advisory only. They do not assign a run or deliver a student message.
      </p>
      <InsightsWorkspaceNav />
      {!canRead ? (
        <p role="alert">Intervention access is disabled because riskOverview is not enabled.</p>
      ) : null}
      {portalState.role === "director" && canRead ? (
        <p role="status">Director access is read-only.</p>
      ) : null}
      {isLoading ? <p role="status">Loading authoritative intervention data…</p> : null}
      {loadError ? <p role="alert">{loadError}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {!isLoading && !loadError && canRead ? (
        <>
          <UiTable
            caption="High-risk candidates with source-bound advisory actions"
            columns={candidateColumns}
            rows={candidates}
            rowKey={(row) => row.studentId}
            emptyStateText="No high-risk candidates are available."
          />
          <UiTable
            caption="Authoritative intervention recommendation timeline"
            columns={timelineColumns}
            rows={timeline}
            rowKey={(row) => row.interventionId}
            emptyStateText="No intervention recommendations are available."
          />
        </>
      ) : null}
    </section>
  );
}

export default InterventionToolsPage;
