import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("admin");

const STUDENT_WORKSPACES = [
  {
    title: "Student List",
    description: "Open the main roster to search students, update status, and open student profiles.",
    to: "/admin/students/list",
    meta: "Main roster workspace",
  },
  {
    title: "Bulk Upload",
    description: "Upload a roster file, check the rows, and create student accounts in one guided flow.",
    to: "/admin/students/bulk-upload",
    meta: "Roster upload and onboarding",
  },
  {
    title: "Batch Analysis",
    description: "Review batch-level performance, behavior, and risk for the selected academic year.",
    to: "/admin/students/batches",
    meta: "Batch-level review",
  },
  {
    title: "Academic Year Archive",
    description: "Prepare year-end archive timing, review archived batches, and check what remains visible after archive.",
    to: "/admin/students/archive",
    meta: "Year-end archive review",
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
  const [students, setStudents] = useState<StudentLandingRecord[]>(FALLBACK_STUDENTS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadStudents() {
      setIsLoading(true);

      if (!shouldUseLiveApi()) {
        setStudents(FALLBACK_STUDENTS);
        setIsLoading(false);
        return;
      }

      try {
        const nextStudents = await fetchStudentsFromApi();
        if (!isMounted) {
          return;
        }

        setStudents(nextStudents);
      } catch {
        if (!isMounted) {
          return;
        }

        setStudents(FALLBACK_STUDENTS);
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
      <h2 id="admin-workspace-landing-title">Students</h2>
      <p className="admin-content-copy">
        Choose the student workspace you want to open.
      </p>
      <p className="admin-settings-inline-note">
        {isLoading ? "Loading student workspaces..." : "Student workspaces are ready."}
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
