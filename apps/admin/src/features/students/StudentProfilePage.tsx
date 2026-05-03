import { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import { UiStatCard, UiTable, type UiTableColumn } from "../../../../../shared/ui/components";

const apiClient = getPortalApiClient("admin");
const STUDENT_STATUSES = ["invited", "active", "inactive", "archived", "suspended"] as const;
const RISK_STATES = ["low", "medium", "high", "critical"] as const;

type StudentStatus = (typeof STUDENT_STATUSES)[number];
type StudentRiskState = (typeof RISK_STATES)[number];

interface StudentRecord {
  id: string;
  studentId: string;
  fullName: string;
  email: string;
  batch: string;
  status: StudentStatus;
  academicYear: string;
  testsAttempted: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  scorePercentile: number | null;
  riskState: StudentRiskState;
  disciplineIndex: number;
  lastActive: string | null;
}

const FALLBACK_STUDENTS: StudentRecord[] = [
  {
    id: "student-001",
    studentId: "STU-001",
    fullName: "Aarav Menon",
    email: "aarav.menon@school.local",
    batch: "Batch-A",
    status: "active",
    academicYear: "2025-26",
    testsAttempted: 6,
    avgRawScorePercent: 74,
    avgAccuracyPercent: 81,
    scorePercentile: 82,
    riskState: "low",
    disciplineIndex: 86,
    lastActive: "2026-04-09",
  },
  {
    id: "student-002",
    studentId: "STU-002",
    fullName: "Diya Sharma",
    email: "diya.sharma@school.local",
    batch: "Batch-A",
    status: "inactive",
    academicYear: "2025-26",
    testsAttempted: 4,
    avgRawScorePercent: 68,
    avgAccuracyPercent: 73,
    scorePercentile: 59,
    riskState: "medium",
    disciplineIndex: 63,
    lastActive: "2026-04-02",
  },
  {
    id: "student-003",
    studentId: "STU-003",
    fullName: "Kabir Gupta",
    email: "kabir.gupta@school.local",
    batch: "Batch-B",
    status: "active",
    academicYear: "2025-26",
    testsAttempted: 8,
    avgRawScorePercent: 83,
    avgAccuracyPercent: 87,
    scorePercentile: 91,
    riskState: "low",
    disciplineIndex: 90,
    lastActive: "2026-04-10",
  },
  {
    id: "student-004",
    studentId: "STU-004",
    fullName: "Naina Iyer",
    email: "naina.iyer@school.local",
    batch: "Batch-C",
    status: "suspended",
    academicYear: "2025-26",
    testsAttempted: 2,
    avgRawScorePercent: 59,
    avgAccuracyPercent: 65,
    scorePercentile: 37,
    riskState: "high",
    disciplineIndex: 42,
    lastActive: "2026-03-29",
  },
  {
    id: "student-005",
    studentId: "STU-005",
    fullName: "Rehan Patel",
    email: "rehan.patel@school.local",
    batch: "Batch-B",
    status: "invited",
    academicYear: "2025-26",
    testsAttempted: 0,
    avgRawScorePercent: 0,
    avgAccuracyPercent: 0,
    scorePercentile: null,
    riskState: "critical",
    disciplineIndex: 18,
    lastActive: null,
  },
];

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toStudentStatus(value: unknown): StudentStatus {
  if (typeof value !== "string") {
    return "inactive";
  }

  const normalized = value.trim().toLowerCase();
  return (STUDENT_STATUSES as readonly string[]).includes(normalized) ? (normalized as StudentStatus) : "inactive";
}

function toRiskState(value: unknown): StudentRiskState {
  if (typeof value !== "string") {
    return "medium";
  }

  const normalized = value.trim().toLowerCase();
  return (RISK_STATES as readonly string[]).includes(normalized) ? (normalized as StudentRiskState) : "medium";
}

function extractStudentArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const maybeWrapped = (payload as Record<string, unknown>).students;
    if (Array.isArray(maybeWrapped)) {
      return maybeWrapped;
    }
  }

  return [];
}

function normalizeStudentRecord(value: unknown, index: number): StudentRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const studentId =
    toNonEmptyString(record.studentId) ?? toNonEmptyString(record.id) ?? toNonEmptyString(record.uid) ?? `student-${index + 1}`;

  const fullName =
    toNonEmptyString(record.fullName) ?? toNonEmptyString(record.name) ?? `Student ${index + 1}`;

  const email = toNonEmptyString(record.email) ?? `${studentId.toLowerCase()}@unknown.local`;
  const batch = toNonEmptyString(record.batch) ?? toNonEmptyString(record.batchId) ?? "Unassigned";
  const scorePercentileRaw = record.scorePercentile ?? record.batchRelativePercentile;
  const scorePercentile =
    scorePercentileRaw === null || typeof scorePercentileRaw === "undefined" ? null : toNumberOrZero(scorePercentileRaw);

  return {
    id: toNonEmptyString(record.id) ?? studentId,
    studentId,
    fullName,
    email,
    batch,
    status: toStudentStatus(record.status),
    academicYear: toNonEmptyString(record.academicYear) ?? toNonEmptyString(record.year) ?? "2025-26",
    testsAttempted: toNumberOrZero(record.testsAttempted),
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
    scorePercentile,
    riskState: toRiskState(record.riskState ?? record.rollingRiskCluster),
    disciplineIndex: toNumberOrZero(record.disciplineIndex),
    lastActive: toNonEmptyString(record.lastActive),
  };
}

async function fetchStudentsFromApi(): Promise<StudentRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/students");
  const rows = extractStudentArray(payload)
    .map((entry, index) => normalizeStudentRecord(entry, index))
    .filter((entry): entry is StudentRecord => Boolean(entry));

  if (rows.length === 0) {
    throw new Error("No students were returned by GET /admin/students.");
  }

  return rows;
}

function shouldUseLiveApi(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  return hostname !== "127.0.0.1" && hostname !== "localhost";
}

function formatPercent(value: number | null): string {
  return value === null ? "Not available" : `${value.toFixed(1)}%`;
}

function formatDateLabel(value: string | null): string {
  if (!value) {
    return "Never";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function StudentProfilePage() {
  const params = useParams<{ studentId: string }>();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStudents() {
      setIsLoading(true);
      setLoadMessage(null);

      if (!shouldUseLiveApi()) {
        setStudents(FALLBACK_STUDENTS);
        setLoadMessage("Local mode detected. Loaded deterministic student fixtures for the dedicated profile workspace.");
        setIsLoading(false);
        return;
      }

      try {
        const apiStudents = await fetchStudentsFromApi();
        if (!isMounted) {
          return;
        }

        setStudents(apiStudents);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const fallbackReason =
          error instanceof ApiClientError ?
            `GET /admin/students failed with ${error.code} (${error.status}).` :
            "GET /admin/students is unavailable in local mode.";

        setStudents(FALLBACK_STUDENTS);
        setLoadMessage(`${fallbackReason} Loaded deterministic local student fixtures for the dedicated profile workspace.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadStudents();

    return () => {
      isMounted = false;
    };
  }, []);

  const student = useMemo(() => {
    if (!params.studentId) {
      return null;
    }

    return students.find((entry) => entry.id === params.studentId || entry.studentId === params.studentId) ?? null;
  }, [params.studentId, students]);

  const summaryColumns = useMemo<UiTableColumn<{ metric: string; value: string; helper: string }>[]>(
    () => [
      {
        id: "metric",
        header: "Metric",
        render: (row) => row.metric,
      },
      {
        id: "value",
        header: "Value",
        render: (row) => row.value,
      },
      {
        id: "helper",
        header: "Source / Intent",
        render: (row) => row.helper,
      },
    ],
    [],
  );

  if (!student && !isLoading) {
    return (
      <section className="admin-content-card" aria-labelledby="admin-student-profile-title">
        <p className="admin-content-eyebrow">Build 150</p>
        <h2 id="admin-student-profile-title">Student Profile</h2>
        <p className="admin-content-copy">
          No student matched <code>{params.studentId}</code>. Return to the student list and choose a valid roster record.
        </p>
        <NavLink className="admin-primary-link" to="/admin/students/list">
          Back to student list
        </NavLink>
      </section>
    );
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-student-profile-title">
      <p className="admin-content-eyebrow">Build 150</p>
      <h2 id="admin-student-profile-title">Student Profile</h2>
      <p className="admin-content-copy">
        Dedicated drill-down workspace for roster identity, lifecycle state, and current-year summary metrics sourced from
        summary documents rather than raw session scans.
      </p>

      <div className="admin-student-subnav" aria-label="Student profile actions">
        <NavLink className="admin-student-subnav-link admin-student-subnav-link-active" to={`/admin/students/${params.studentId ?? ""}`}>
          Profile Workspace
        </NavLink>
        <NavLink className="admin-student-subnav-link" to="/admin/students/list">
          Back to Student List
        </NavLink>
        <NavLink className="admin-student-subnav-link" to="/admin/students/lifecycle">
          Lifecycle Queue
        </NavLink>
      </div>

      {loadMessage ? <p className="admin-student-inline-note">{loadMessage}</p> : null}
      {isLoading ? <p className="admin-student-inline-note">Loading student profile from GET /admin/students...</p> : null}

      {student ? (
        <div className="admin-student-stack">
          <div className="admin-student-summary-grid">
            <article className="admin-student-summary-card">
              <h3>{student.fullName}</h3>
              <p>{student.studentId}</p>
              <p>{student.email}</p>
            </article>
            <article className="admin-student-summary-card">
              <h3>Roster Placement</h3>
              <p>Batch: {student.batch}</p>
              <p>Academic year: {student.academicYear}</p>
              <p>Last active: {formatDateLabel(student.lastActive)}</p>
            </article>
            <article className="admin-student-summary-card">
              <h3>Current Standing</h3>
              <p>Status: {student.status}</p>
              <p>Risk state: {student.riskState}</p>
              <p>Discipline index: {student.disciplineIndex.toFixed(0)}</p>
            </article>
          </div>

          <div className="admin-overview-stat-grid">
            <UiStatCard
              title="Tests Attempted"
              value={String(student.testsAttempted)}
              helper="Current academic year"
            />
            <UiStatCard
              title="Avg Raw Score %"
              value={student.avgRawScorePercent.toFixed(1)}
              helper="studentYearMetrics"
            />
            <UiStatCard
              title="Avg Accuracy %"
              value={student.avgAccuracyPercent.toFixed(1)}
              helper="studentYearMetrics"
            />
            <UiStatCard
              title="Score Percentile"
              value={formatPercent(student.scorePercentile)}
              helper="Batch-relative summary"
            />
          </div>

          <div className="admin-student-grid">
            <UiTable
              caption="Student profile summary"
              columns={summaryColumns}
              rows={[
                {
                  metric: "Profile identity",
                  value: `${student.fullName} (${student.studentId})`,
                  helper: "students collection identity fields",
                },
                {
                  metric: "Lifecycle state",
                  value: student.status,
                  helper: "invited / active / inactive / archived / suspended",
                },
                {
                  metric: "Academic scope",
                  value: `${student.academicYear} · ${student.batch}`,
                  helper: "year-scoped student roster placement",
                },
                {
                  metric: "Current-year results",
                  value: `Raw ${formatPercent(student.avgRawScorePercent)} | Accuracy ${formatPercent(student.avgAccuracyPercent)}`,
                  helper: "summary-only studentYearMetrics contract",
                },
                {
                  metric: "Execution posture",
                  value: `Risk ${student.riskState} · Discipline ${student.disciplineIndex.toFixed(0)}`,
                  helper: "layer-aware execution summary",
                },
                {
                  metric: "Last activity",
                  value: formatDateLabel(student.lastActive),
                  helper: "recent student portal activity marker",
                },
              ]}
              rowKey={(row) => row.metric}
              emptyStateText="No summary metrics are available."
            />

            <div className="admin-student-stack">
              <div className="admin-student-summary-card">
                <h3>Operator Guardrails</h3>
                <p>This dedicated screen is for profile drill-down and summary review only.</p>
                <p>Deeper charts, trend analytics, and risk timelines remain tracked separately in STU-008 through STU-010.</p>
              </div>
              <div className="admin-student-summary-card">
                <h3>Next Actions</h3>
                <p>Use Lifecycle for activation state changes, Batch Management for cohort updates, and the student list for bulk roster operations.</p>
              </div>
              <div className="admin-content-note">
                Data shown here stays within summary-document boundaries: current-year rollups, roster fields, and lifecycle status. Raw sessions,
                answer arrays, and per-question logs remain outside this UI surface.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default StudentProfilePage;
