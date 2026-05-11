import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("admin");

const STUDENT_WORKSPACES = [
  {
    title: "Student List",
    description: "Primary roster workspace for search, filtering, activation controls, and drill-in profile navigation.",
    to: "/admin/students/list",
    meta: "Roster operations and profile entry point",
  },
  {
    title: "Bulk Upload",
    description: "Dedicated CSV intake, validation, duplicate resolution, and account-creation workflow.",
    to: "/admin/students/bulk-upload",
    meta: "Admin-operated onboarding workflow",
  },
  {
    title: "Lifecycle",
    description: "Active, invited, and inactive learner review with next-step visibility for operator follow-through.",
    to: "/admin/students/lifecycle",
    meta: "Lifecycle health and reactivation review",
  },
  {
    title: "Batch Management",
    description: "Cohort-level roster organization and current-year summary visibility across institute batches.",
    to: "/admin/students/batches",
    meta: "Batch-level roster and metric summaries",
  },
  {
    title: "Archived Students",
    description: "Historical and suspended student visibility separated from active roster operations.",
    to: "/admin/students/archive",
    meta: "Read-heavy archive review",
  },
] as const;

interface StudentLandingRecord {
  id: string;
  studentId: string;
  batch: string;
  status: "invited" | "active" | "inactive" | "archived" | "suspended";
  academicYear: string;
}

const FALLBACK_STUDENTS: StudentLandingRecord[] = [
  { id: "student-001", studentId: "STU-001", batch: "Batch-A", status: "active", academicYear: "2025-26" },
  { id: "student-002", studentId: "STU-002", batch: "Batch-A", status: "inactive", academicYear: "2025-26" },
  { id: "student-003", studentId: "STU-003", batch: "Batch-B", status: "active", academicYear: "2025-26" },
  { id: "student-004", studentId: "STU-004", batch: "Batch-C", status: "suspended", academicYear: "2025-26" },
  { id: "student-005", studentId: "STU-005", batch: "Batch-B", status: "invited", academicYear: "2025-26" },
];

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toStudentStatus(
  value: unknown,
): StudentLandingRecord["status"] {
  if (typeof value !== "string") {
    return "inactive";
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "invited" ||
      normalized === "active" ||
      normalized === "inactive" ||
      normalized === "archived" ||
      normalized === "suspended" ?
      normalized :
      "inactive";
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

function normalizeStudentRecord(value: unknown, index: number): StudentLandingRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const studentId =
    toNonEmptyString(record.studentId) ?? toNonEmptyString(record.id) ?? toNonEmptyString(record.uid) ?? `student-${index + 1}`;

  return {
    id: toNonEmptyString(record.id) ?? studentId,
    studentId,
    batch: toNonEmptyString(record.batch) ?? toNonEmptyString(record.batchId) ?? "Unassigned",
    status: toStudentStatus(record.status),
    academicYear: toNonEmptyString(record.academicYear) ?? toNonEmptyString(record.year) ?? "2025-26",
  };
}

async function fetchStudentsFromApi(): Promise<StudentLandingRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/students");
  const rows = extractStudentArray(payload)
    .map((entry, index) => normalizeStudentRecord(entry, index))
    .filter((entry): entry is StudentLandingRecord => Boolean(entry));

  if (rows.length === 0) {
    throw new Error("No students were returned by GET /admin/students.");
  }

  return rows;
}

function shouldUseLiveApi(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  return hostname !== "127.0.0.1" && hostname !== "localhost";
}

function AdminStudentsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const [students, setStudents] = useState<StudentLandingRecord[]>(FALLBACK_STUDENTS);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStudents() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setStudents(FALLBACK_STUDENTS);
        setInlineMessage("Local mode detected. Loaded deterministic student landing fixtures.");
        setIsLoading(false);
        return;
      }

      try {
        const nextStudents = await fetchStudentsFromApi();
        if (!isMounted) {
          return;
        }

        setStudents(nextStudents);
        setInlineMessage("Live mode enabled: students landing hydrated from GET /admin/students.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load student landing.";
        setStudents(FALLBACK_STUDENTS);
        setInlineMessage(`${reason} Falling back to deterministic student fixtures.`);
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

  const workspaceCount = STUDENT_WORKSPACES.length;
  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "active").length,
    [students],
  );
  const invitedStudents = useMemo(
    () => students.filter((student) => student.status === "invited").length,
    [students],
  );
  const activeBatches = useMemo(
    () => new Set(students.filter((student) => student.status !== "archived").map((student) => student.batch)).size,
    [students],
  );
  const currentAcademicYear = students[0]?.academicYear ?? "Unknown";

  return (
    <section className="admin-content-card" aria-labelledby="admin-workspace-landing-title">
      <p className="admin-content-eyebrow">Students Workspace</p>
      <h2 id="admin-workspace-landing-title">Dedicated Student Landing Workspace</h2>
      <p className="admin-content-copy">
        This route turns <code>/admin/students</code> into a dedicated workspace index instead of dropping directly
        into the roster table.
      </p>
      <p className="admin-content-copy">
        Student operations are grouped into focused destinations for roster search, onboarding, lifecycle handling,
        batch organization, and archive review.
      </p>
      <p className="admin-settings-inline-note">
        {isLoading ? "Loading student landing..." : inlineMessage ?? "Student landing workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {accessContext.licenseLayer ?? "unlicensed"}. Student
        profiles remain available through the roster workspace.
      </p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Workspaces</p>
          <h3>{workspaceCount}</h3>
          <small>Dedicated student management destinations</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Active Students</p>
          <h3>{activeStudents}</h3>
          <small>{currentAcademicYear} roster scope</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Invited Students</p>
          <h3>{invitedStudents}</h3>
          <small>Onboarding queue from current roster feed</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Active Batches</p>
          <h3>{activeBatches}</h3>
          <small>Current non-archived batch coverage</small>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        {STUDENT_WORKSPACES.map((workspace) => (
          <article key={workspace.to} className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Students Workspace</p>
            <h4>{workspace.title}</h4>
            <p>{workspace.description}</p>
            <small>{workspace.meta}</small>
            <NavLink className="admin-primary-link" to={workspace.to}>
              Open Workspace
            </NavLink>
          </article>
        ))}
      </div>
    </section>
  );
}

export default AdminStudentsLandingPage;
