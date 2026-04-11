import {useCallback, useEffect, useMemo, useState} from "react";
import {NavLink} from "react-router-dom";
import {UiTable, type UiTableColumn} from "../../../../../shared/ui/components";
import {
  ApiClientError,
  buildHighRiskCandidates,
  createInterventionAction,
  fetchInterventionDataset,
  formatPercent,
  listInterventionActions,
  shouldUseLiveApi,
  type HighRiskInterventionCandidate,
  type InterventionActionRecord,
  type InterventionOutcomeStatus,
} from "./interventionDataset";

const INTERVENTION_INSTITUTE_ID = "inst-build-124";
const INTERVENTION_YEAR_ID = "2026";

const OUTCOME_OPTIONS: InterventionOutcomeStatus[] = [
  "pending",
  "improving",
  "no_change",
  "escalated",
  "resolved",
];

interface OutcomeDraftState {
  [studentId: string]: {
    notes: string;
    status: InterventionOutcomeStatus;
  };
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().replace("T", " ").slice(0, 16);
}

function InterventionToolsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingByStudent, setIsSubmittingByStudent] = useState<Record<string, boolean>>({});
  const [highRiskStudents, setHighRiskStudents] = useState<HighRiskInterventionCandidate[]>([]);
  const [history, setHistory] = useState<InterventionActionRecord[]>([]);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [outcomeDrafts, setOutcomeDrafts] = useState<OutcomeDraftState>({});

  const totalPendingOutcomes = useMemo(
    () => history.filter((entry) => entry.actionType === "TRACK_OUTCOME" && entry.outcomeStatus === "pending").length,
    [history],
  );

  const criticalStudents = useMemo(
    () => highRiskStudents.filter((entry) => entry.rollingRiskCluster === "critical").length,
    [highRiskStudents],
  );

  const hydratedStudents = useMemo(
    () => highRiskStudents.slice(0, 12),
    [highRiskStudents],
  );

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const [dataset, interventionHistory] = await Promise.all([
          fetchInterventionDataset(),
          listInterventionActions({
            instituteId: INTERVENTION_INSTITUTE_ID,
            yearId: INTERVENTION_YEAR_ID,
          }),
        ]);

        if (!isMounted) {
          return;
        }

        const candidates = buildHighRiskCandidates(dataset);
        setHighRiskStudents(candidates);
        setHistory(interventionHistory);
        setOutcomeDrafts(
          Object.fromEntries(
            candidates.map((student) => [
              student.studentId,
              {
                notes: "",
                status: student.suggestedOutcomeStatus,
              },
            ]),
          ),
        );

        if (!shouldUseLiveApi()) {
          setInlineMessage(
            "Local mode detected. Loaded deterministic intervention candidates and audit-history fixtures for Build 124.",
          );
        } else {
          setInlineMessage("Live mode enabled: intervention tools hydrated from GET /admin/analytics and POST /admin/interventions.");
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load intervention tools.";
        setInlineMessage(`${reason} Falling back to local deterministic intervention fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  const submitAction = useCallback(async (
    student: HighRiskInterventionCandidate,
    actionType: "ASSIGN_REMEDIAL_TEST" | "SEND_ALERT" | "TRACK_OUTCOME",
  ): Promise<void> => {
    setIsSubmittingByStudent((current) => ({
      ...current,
      [student.studentId]: true,
    }));
    setInlineMessage(null);

    const draft = outcomeDrafts[student.studentId] ?? {
      notes: "",
      status: "pending",
    };

    try {
      const action = await createInterventionAction({
        actionType,
        alertMessage:
          actionType === "SEND_ALERT" ?
            student.suggestedAlertMessage :
            undefined,
        instituteId: INTERVENTION_INSTITUTE_ID,
        outcomeNotes:
          actionType === "TRACK_OUTCOME" ?
            draft.notes || `Outcome updated for ${student.studentName}.` :
            undefined,
        outcomeStatus:
          actionType === "TRACK_OUTCOME" ?
            draft.status :
            undefined,
        remedialTestId:
          actionType === "ASSIGN_REMEDIAL_TEST" ?
            student.suggestedRemedialTestId :
            undefined,
        studentId: student.studentId,
        yearId: INTERVENTION_YEAR_ID,
      });

      setHistory((current) => [action, ...current]);
      setInlineMessage(`${actionType.replaceAll("_", " ")} logged for ${student.studentName}. Immutable audit entry captured.`);
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.message : "Intervention request failed.";
      setInlineMessage(reason);
    } finally {
      setIsSubmittingByStudent((current) => ({
        ...current,
        [student.studentId]: false,
      }));
    }
  }, [outcomeDrafts]);

  const interventionColumns = useMemo<UiTableColumn<HighRiskInterventionCandidate>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        render: (student) => (
          <div className="admin-risk-student-cell">
            <strong>{student.studentName}</strong>
            <small>{student.studentId}</small>
          </div>
        ),
      },
      {
        id: "risk",
        header: "Risk",
        render: (student) => (
          <span className={`admin-risk-chip admin-risk-chip-${student.rollingRiskCluster}`}>
            {student.rollingRiskCluster}
          </span>
        ),
      },
      {
        id: "signals",
        header: "Signals",
        render: (student) => (
          <div className="admin-intervention-signal-cell">
            <small>Guess-rate: {formatPercent(student.guessRatePercent)}</small>
            <small>Discipline: {formatPercent(student.disciplineIndex)}</small>
            <small>Priority: {student.interventionPriority}</small>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Intervention Actions",
        render: (student) => {
          const draft = outcomeDrafts[student.studentId] ?? {
            notes: "",
            status: "pending",
          };
          const isSubmitting = Boolean(isSubmittingByStudent[student.studentId]);

          return (
            <div className="admin-intervention-action-cell">
              <button
                type="button"
                className="admin-compact-button"
                disabled={isSubmitting}
                onClick={() => {
                  void submitAction(student, "ASSIGN_REMEDIAL_TEST");
                }}
              >
                Assign Remedial
              </button>
              <button
                type="button"
                className="admin-compact-button"
                disabled={isSubmitting}
                onClick={() => {
                  void submitAction(student, "SEND_ALERT");
                }}
              >
                Send Alert
              </button>
              <div className="admin-intervention-outcome-editor">
                <select
                  value={draft.status}
                  onChange={(event) => {
                    const nextStatus = event.target.value as InterventionOutcomeStatus;
                    setOutcomeDrafts((current) => ({
                      ...current,
                      [student.studentId]: {
                        notes: current[student.studentId]?.notes ?? "",
                        status: nextStatus,
                      },
                    }));
                  }}
                >
                  {OUTCOME_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <input
                  value={draft.notes}
                  placeholder="Outcome notes"
                  onChange={(event) => {
                    const nextNotes = event.target.value;
                    setOutcomeDrafts((current) => ({
                      ...current,
                      [student.studentId]: {
                        notes: nextNotes,
                        status: current[student.studentId]?.status ?? "pending",
                      },
                    }));
                  }}
                />
                <button
                  type="button"
                  className="admin-compact-button"
                  disabled={isSubmitting}
                  onClick={() => {
                    void submitAction(student, "TRACK_OUTCOME");
                  }}
                >
                  Track Outcome
                </button>
              </div>
            </div>
          );
        },
      },
    ],
    [isSubmittingByStudent, outcomeDrafts, submitAction],
  );

  const historyColumns = useMemo<UiTableColumn<InterventionActionRecord>[]>(
    () => [
      {
        id: "timestamp",
        header: "Timestamp",
        render: (entry) => formatTimestamp(entry.timestamp),
      },
      {
        id: "student",
        header: "Student",
        render: (entry) => (
          <div className="admin-risk-student-cell">
            <strong>{entry.studentName ?? entry.studentId ?? "Unknown"}</strong>
            <small>{entry.studentId ?? "N/A"}</small>
          </div>
        ),
      },
      {
        id: "action",
        header: "Action",
        render: (entry) => (
          <div className="admin-intervention-history-cell">
            <strong>{entry.actionType.replaceAll("_", " ")}</strong>
            <small>{entry.remedialTestId ?? entry.alertMessage ?? entry.outcomeStatus ?? "No payload"}</small>
          </div>
        ),
      },
      {
        id: "audit",
        header: "Audit",
        render: (entry) => (
          <div className="admin-intervention-history-cell">
            <strong>{entry.auditId ?? "local-fixture"}</strong>
            <small>{entry.auditPath ?? "institutes/{instituteId}/auditLogs/{auditId}"}</small>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-intervention-tools-title">
      <p className="admin-content-eyebrow">Intervention Tools</p>
      <h2 id="admin-intervention-tools-title">High-Risk Intervention Workflow</h2>
      <p className="admin-content-copy">
        Identify high-risk students from <code>studentYearMetrics</code>, assign targeted remedial tests, send
        intervention alerts, and track intervention outcomes with immutable audit logs.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/analytics/risk-insights">
          Back to Risk Insights
        </NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/governance">
          Open Governance Dashboard
        </NavLink>
      </p>

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading intervention tools..." : inlineMessage ?? "Intervention tools ready."}
      </p>

      <div className="admin-intervention-kpi-grid">
        <article className="admin-intervention-kpi-card">
          <p>High-Risk Students</p>
          <h3>{highRiskStudents.length}</h3>
          <small>high + critical clusters</small>
        </article>
        <article className="admin-intervention-kpi-card">
          <p>Critical Priority</p>
          <h3>{criticalStudents}</h3>
          <small>requires immediate remediation</small>
        </article>
        <article className="admin-intervention-kpi-card">
          <p>Audit Actions</p>
          <h3>{history.length}</h3>
          <small>POST /admin/interventions</small>
        </article>
        <article className="admin-intervention-kpi-card">
          <p>Pending Outcomes</p>
          <h3>{totalPendingOutcomes}</h3>
          <small>track and close loop</small>
        </article>
      </div>

      <section className="admin-intervention-table-section" aria-labelledby="admin-intervention-candidates-title">
        <h3 id="admin-intervention-candidates-title">High-Risk Student Intervention Queue</h3>
        <UiTable
          caption="High-risk intervention actions for remedial assignment, alerts, and outcome tracking"
          columns={interventionColumns}
          rows={hydratedStudents}
          rowKey={(row) => row.studentId}
          emptyStateText="No high-risk students currently require intervention."
        />
      </section>

      <section className="admin-intervention-table-section" aria-labelledby="admin-intervention-history-title">
        <h3 id="admin-intervention-history-title">Intervention Audit Timeline</h3>
        <UiTable
          caption="Immutable intervention action timeline from institute audit logs"
          columns={historyColumns}
          rows={history}
          rowKey={(row, index) => `${row.interventionId}-${index}`}
          emptyStateText="No intervention actions available."
        />
      </section>
    </section>
  );
}

export default InterventionToolsPage;
