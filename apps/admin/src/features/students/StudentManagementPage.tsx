import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createApiClient, ApiClientError } from "../../../../../shared/services/apiClient";
import {
  UiForm,
  UiFormField,
  UiModal,
  UiPagination,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";

const apiClient = createApiClient({ baseUrl: "/" });
const STUDENT_STATUSES = ["invited", "active", "inactive", "archived", "suspended"] as const;

const FALLBACK_STUDENTS: StudentRecord[] = [
  {
    id: "student-001",
    studentId: "STU-001",
    fullName: "Aarav Menon",
    email: "aarav.menon@school.local",
    batch: "Batch-A",
    status: "active",
    testsAttempted: 6,
    avgRawScorePercent: 74,
    avgAccuracyPercent: 81,
    lastActive: "2026-04-09",
  },
  {
    id: "student-002",
    studentId: "STU-002",
    fullName: "Diya Sharma",
    email: "diya.sharma@school.local",
    batch: "Batch-A",
    status: "inactive",
    testsAttempted: 4,
    avgRawScorePercent: 68,
    avgAccuracyPercent: 73,
    lastActive: "2026-04-02",
  },
  {
    id: "student-003",
    studentId: "STU-003",
    fullName: "Kabir Gupta",
    email: "kabir.gupta@school.local",
    batch: "Batch-B",
    status: "active",
    testsAttempted: 8,
    avgRawScorePercent: 83,
    avgAccuracyPercent: 87,
    lastActive: "2026-04-10",
  },
  {
    id: "student-004",
    studentId: "STU-004",
    fullName: "Naina Iyer",
    email: "naina.iyer@school.local",
    batch: "Batch-C",
    status: "suspended",
    testsAttempted: 2,
    avgRawScorePercent: 59,
    avgAccuracyPercent: 65,
    lastActive: "2026-03-29",
  },
  {
    id: "student-005",
    studentId: "STU-005",
    fullName: "Rehan Patel",
    email: "rehan.patel@school.local",
    batch: "Batch-B",
    status: "invited",
    testsAttempted: 0,
    avgRawScorePercent: 0,
    avgAccuracyPercent: 0,
    lastActive: null,
  },
];

type StudentStatus = (typeof STUDENT_STATUSES)[number];

interface StudentRecord {
  id: string;
  studentId: string;
  fullName: string;
  email: string;
  batch: string;
  status: StudentStatus;
  testsAttempted: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  lastActive: string | null;
}

interface StudentFilterState {
  query: string;
  status: StudentStatus | "all";
  batch: string;
}

interface EditDraft {
  id: string;
  fullName: string;
  email: string;
  batch: string;
}

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

  return {
    id: toNonEmptyString(record.id) ?? studentId,
    studentId,
    fullName,
    email,
    batch,
    status: toStudentStatus(record.status),
    testsAttempted: toNumberOrZero(record.testsAttempted),
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
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

function statusToTone(status: StudentStatus): "live" | "idle" | "alert" {
  if (status === "active") {
    return "live";
  }

  if (status === "invited" || status === "inactive") {
    return "idle";
  }

  return "alert";
}

function StudentManagementPage() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<StudentFilterState>({
    query: "",
    status: "all",
    batch: "all",
  });
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [batchAssignmentValue, setBatchAssignmentValue] = useState("Batch-A");
  const [editingStudent, setEditingStudent] = useState<EditDraft | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let isMounted = true;

    async function loadStudents() {
      setIsLoading(true);
      setLoadMessage(null);

      if (!shouldUseLiveApi()) {
        setStudents(FALLBACK_STUDENTS);
        setLoadMessage("Local mode detected. Loaded deterministic student fixtures for Build 117 workflows.");
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
        setLoadMessage(`${fallbackReason} Loaded deterministic local student fixtures for Build 117 UI workflows.`);
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

  const uniqueBatches = useMemo(() => {
    const batches = new Set<string>();
    students.forEach((student) => batches.add(student.batch));
    return ["all", ...Array.from(batches).sort((left, right) => left.localeCompare(right))];
  }, [students]);

  const filteredStudents = useMemo(() => {
    const loweredQuery = filters.query.trim().toLowerCase();

    return students.filter((student) => {
      const queryMatches =
        loweredQuery.length === 0 ||
        student.studentId.toLowerCase().includes(loweredQuery) ||
        student.fullName.toLowerCase().includes(loweredQuery) ||
        student.email.toLowerCase().includes(loweredQuery);

      const statusMatches = filters.status === "all" || student.status === filters.status;
      const batchMatches = filters.batch === "all" || student.batch === filters.batch;

      return queryMatches && statusMatches && batchMatches;
    });
  }, [filters.batch, filters.query, filters.status, students]);

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filteredStudents.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const allVisibleSelected =
    pageRows.length > 0 && pageRows.every((student) => selectedStudentIds.includes(student.id));

  function toggleVisibleSelection() {
    if (pageRows.length === 0) {
      return;
    }

    setSelectedStudentIds((currentSelection) => {
      if (allVisibleSelected) {
        return currentSelection.filter((studentId) => !pageRows.some((row) => row.id === studentId));
      }

      const merged = new Set(currentSelection);
      pageRows.forEach((row) => merged.add(row.id));
      return Array.from(merged);
    });
  }

  function toggleSingleSelection(studentId: string) {
    setSelectedStudentIds((currentSelection) =>
      currentSelection.includes(studentId) ?
        currentSelection.filter((id) => id !== studentId) :
        [...currentSelection, studentId],
    );
  }

  function applyBatchAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedBatch = batchAssignmentValue.trim();
    if (!normalizedBatch || selectedStudentIds.length === 0) {
      return;
    }

    setStudents((current) =>
      current.map((student) =>
        selectedStudentIds.includes(student.id) ?
          {
            ...student,
            batch: normalizedBatch,
          } :
          student,
      ),
    );

    setSelectedStudentIds([]);
  }

  function toggleStudentActivation(studentId: string) {
    setStudents((current) =>
      current.map((student) => {
        if (student.id !== studentId) {
          return student;
        }

        return {
          ...student,
          status: student.status === "active" ? "inactive" : "active",
        };
      }),
    );
  }

  function openEditModal(studentId: string) {
    const student = students.find((entry) => entry.id === studentId);
    if (!student) {
      return;
    }

    setEditingStudent({
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      batch: student.batch,
    });
  }

  function saveEditChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingStudent) {
      return;
    }

    setStudents((current) =>
      current.map((student) =>
        student.id === editingStudent.id ?
          {
            ...student,
            fullName: editingStudent.fullName.trim() || student.fullName,
            email: editingStudent.email.trim() || student.email,
            batch: editingStudent.batch.trim() || student.batch,
          } :
          student,
      ),
    );

    setEditingStudent(null);
  }

  const studentColumns: UiTableColumn<StudentRecord>[] = [
    {
      id: "select",
      header: "Select",
      className: "admin-student-select-col",
      render: (student) => (
        <input
          type="checkbox"
          aria-label={`Select ${student.studentId}`}
          checked={selectedStudentIds.includes(student.id)}
          onChange={() => toggleSingleSelection(student.id)}
        />
      ),
    },
    {
      id: "studentId",
      header: "Student ID",
      render: (student) => student.studentId,
    },
    {
      id: "name",
      header: "Name",
      render: (student) => (
        <div className="admin-student-name-cell">
          <strong>{student.fullName}</strong>
          <small>{student.email}</small>
        </div>
      ),
    },
    {
      id: "batch",
      header: "Batch",
      render: (student) => student.batch,
    },
    {
      id: "status",
      header: "Status",
      render: (student) => (
        <span className={`admin-student-status admin-student-status-${statusToTone(student.status)}`}>{student.status}</span>
      ),
    },
    {
      id: "metrics",
      header: "Current Year Metrics",
      render: (student) => (
        <div className="admin-student-metrics-cell">
          <span>Tests: {student.testsAttempted}</span>
          <span>Raw: {student.avgRawScorePercent.toFixed(1)}%</span>
          <span>Accuracy: {student.avgAccuracyPercent.toFixed(1)}%</span>
        </div>
      ),
    },
    {
      id: "lastActive",
      header: "Last Active",
      render: (student) => formatDateLabel(student.lastActive),
    },
    {
      id: "actions",
      header: "Actions",
      className: "admin-student-actions-col",
      render: (student) => (
        <div className="admin-student-row-actions">
          <button type="button" onClick={() => openEditModal(student.id)}>
            Edit
          </button>
          <button type="button" onClick={() => toggleStudentActivation(student.id)}>
            {student.status === "active" ? "Deactivate" : "Activate"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-students-title">
      <p className="admin-content-eyebrow">Build 117</p>
      <h2 id="admin-students-title">Student Management Interface</h2>
      <p className="admin-content-copy">
        Manage institute students with architecture-aligned list operations: filtering, batch assignment,
        activation controls, and profile editing.
      </p>

      {loadMessage ? <p className="admin-student-inline-note">{loadMessage}</p> : null}
      {isLoading ? <p className="admin-student-inline-note">Loading students from GET /admin/students...</p> : null}

      <div className="admin-student-grid">
        <UiForm
          title="Search & Filters"
          description="Filter by student identity, status, and batch scope."
          submitLabel="Apply"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
          }}
        >
          <UiFormField label="Search" htmlFor="admin-student-search" helper="Match by ID, name, or email.">
            <input
              id="admin-student-search"
              type="search"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Search students"
            />
          </UiFormField>
          <UiFormField label="Status" htmlFor="admin-student-status-filter">
            <select
              id="admin-student-status-filter"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as StudentFilterState["status"],
                }))
              }
            >
              <option value="all">All</option>
              {STUDENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Batch" htmlFor="admin-student-batch-filter">
            <select
              id="admin-student-batch-filter"
              value={filters.batch}
              onChange={(event) => setFilters((current) => ({ ...current, batch: event.target.value }))}
            >
              {uniqueBatches.map((batch) => (
                <option key={batch} value={batch}>
                  {batch === "all" ? "All" : batch}
                </option>
              ))}
            </select>
          </UiFormField>
        </UiForm>

        <UiForm
          title="Batch Assignment"
          description="Assign selected students to a target batch."
          submitLabel="Assign Batch"
          onSubmit={applyBatchAssignment}
          footer={<span className="admin-student-form-footnote">Selected students: {selectedStudentIds.length}</span>}
        >
          <UiFormField
            label="Target Batch"
            htmlFor="admin-student-target-batch"
            helper="Use an existing batch name or enter a new one."
          >
            <input
              id="admin-student-target-batch"
              type="text"
              value={batchAssignmentValue}
              onChange={(event) => setBatchAssignmentValue(event.target.value)}
            />
          </UiFormField>
        </UiForm>
      </div>

      <div className="admin-student-table-toolbar">
        <button type="button" onClick={toggleVisibleSelection}>
          {allVisibleSelected ? "Unselect visible" : "Select visible"}
        </button>
        <span>
          Showing {pageRows.length} of {filteredStudents.length} filtered students
        </span>
      </div>

      <UiTable
        caption="Institute Students"
        columns={studentColumns}
        rows={pageRows}
        rowKey={(row) => row.id}
        emptyStateText="No students match the current filters."
      />

      <div className="admin-student-pagination-row">
        <UiPagination
          page={currentPage}
          pageSize={pageSize}
          totalItems={filteredStudents.length}
          onPageChange={setPage}
        />
      </div>

      <UiModal
        isOpen={Boolean(editingStudent)}
        title="Edit Student Details"
        description="Update identity and batch details for the selected student."
        onClose={() => setEditingStudent(null)}
      >
        {editingStudent ? (
          <form className="admin-student-edit-form" onSubmit={saveEditChanges}>
            <UiFormField label="Full Name" htmlFor="admin-edit-student-name">
              <input
                id="admin-edit-student-name"
                type="text"
                value={editingStudent.fullName}
                onChange={(event) =>
                  setEditingStudent((current) =>
                    current ?
                      {
                        ...current,
                        fullName: event.target.value,
                      } :
                      null,
                  )
                }
              />
            </UiFormField>
            <UiFormField label="Email" htmlFor="admin-edit-student-email">
              <input
                id="admin-edit-student-email"
                type="email"
                value={editingStudent.email}
                onChange={(event) =>
                  setEditingStudent((current) =>
                    current ?
                      {
                        ...current,
                        email: event.target.value,
                      } :
                      null,
                  )
                }
              />
            </UiFormField>
            <UiFormField label="Batch" htmlFor="admin-edit-student-batch">
              <input
                id="admin-edit-student-batch"
                type="text"
                value={editingStudent.batch}
                onChange={(event) =>
                  setEditingStudent((current) =>
                    current ?
                      {
                        ...current,
                        batch: event.target.value,
                      } :
                      null,
                  )
                }
              />
            </UiFormField>
            <div className="admin-student-edit-actions">
              <button type="submit">Save Details</button>
              <button type="button" onClick={() => setEditingStudent(null)}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </UiModal>
    </section>
  );
}

export default StudentManagementPage;
