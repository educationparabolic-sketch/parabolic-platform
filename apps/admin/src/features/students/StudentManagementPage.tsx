import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import {
  UiForm,
  UiFormField,
  UiModal,
  UiPagination,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";

const apiClient = getPortalApiClient("admin");
const STUDENT_STATUSES = ["invited", "active", "inactive", "archived", "suspended"] as const;
const RISK_STATES = ["low", "medium", "high", "critical"] as const;

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

interface StudentFilterState {
  query: string;
  academicYear: string;
  status: StudentStatus | "all";
  batch: string;
  rawScoreMin: string;
  rawScoreMax: string;
  accuracyMin: string;
  accuracyMax: string;
  scorePercentileMin: string;
  scorePercentileMax: string;
  riskState: StudentRiskState | "all";
  disciplineMin: string;
  disciplineMax: string;
  lastActiveStart: string;
  lastActiveEnd: string;
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

function isWithinNumberRange(value: number, minRaw: string, maxRaw: string): boolean {
  const minValue = minRaw.trim().length > 0 ? Number(minRaw) : null;
  const maxValue = maxRaw.trim().length > 0 ? Number(maxRaw) : null;

  if (minValue !== null && Number.isFinite(minValue) && value < minValue) {
    return false;
  }

  if (maxValue !== null && Number.isFinite(maxValue) && value > maxValue) {
    return false;
  }

  return true;
}

function isWithinOptionalNumberRange(value: number | null, minRaw: string, maxRaw: string): boolean {
  const hasMin = minRaw.trim().length > 0;
  const hasMax = maxRaw.trim().length > 0;
  if (!hasMin && !hasMax) {
    return true;
  }

  if (value === null) {
    return false;
  }

  return isWithinNumberRange(value, minRaw, maxRaw);
}

function toEpochDay(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function StudentManagementPage() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<StudentFilterState>({
    query: "",
    academicYear: "",
    status: "all",
    batch: "all",
    rawScoreMin: "",
    rawScoreMax: "",
    accuracyMin: "",
    accuracyMax: "",
    scorePercentileMin: "",
    scorePercentileMax: "",
    riskState: "all",
    disciplineMin: "",
    disciplineMax: "",
    lastActiveStart: "",
    lastActiveEnd: "",
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

  const uniqueAcademicYears = useMemo(() => {
    const years = new Set<string>();
    students.forEach((student) => years.add(student.academicYear));
    return Array.from(years).sort((left, right) => right.localeCompare(left));
  }, [students]);

  useEffect(() => {
    if (uniqueAcademicYears.length === 0) {
      if (filters.academicYear !== "") {
        setFilters((current) => ({ ...current, academicYear: "" }));
      }
      return;
    }

    const hasSelectedYear = uniqueAcademicYears.includes(filters.academicYear);
    if (!hasSelectedYear) {
      setFilters((current) => ({
        ...current,
        academicYear: uniqueAcademicYears[0],
      }));
      setPage(1);
    }
  }, [filters.academicYear, uniqueAcademicYears]);

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
      const academicYearMatches = filters.academicYear.length > 0 && student.academicYear === filters.academicYear;
      const rawScoreMatches = isWithinNumberRange(student.avgRawScorePercent, filters.rawScoreMin, filters.rawScoreMax);
      const accuracyMatches = isWithinNumberRange(student.avgAccuracyPercent, filters.accuracyMin, filters.accuracyMax);
      const scorePercentileMatches =
        isWithinOptionalNumberRange(student.scorePercentile, filters.scorePercentileMin, filters.scorePercentileMax);
      const riskStateMatches = filters.riskState === "all" || student.riskState === filters.riskState;
      const disciplineMatches = isWithinNumberRange(student.disciplineIndex, filters.disciplineMin, filters.disciplineMax);
      const lastActiveEpoch = toEpochDay(student.lastActive);
      const filterDateStart = toEpochDay(filters.lastActiveStart);
      const filterDateEnd = toEpochDay(filters.lastActiveEnd);
      const hasDateFilter = filterDateStart !== null || filterDateEnd !== null;
      const lastActiveMatches =
        !hasDateFilter ||
        (lastActiveEpoch !== null &&
          (filterDateStart === null || lastActiveEpoch >= filterDateStart) &&
          (filterDateEnd === null || lastActiveEpoch <= filterDateEnd));

      return (
        queryMatches &&
        statusMatches &&
        batchMatches &&
        academicYearMatches &&
        rawScoreMatches &&
        accuracyMatches &&
        scorePercentileMatches &&
        riskStateMatches &&
        disciplineMatches &&
        lastActiveMatches
      );
    });
  }, [filters, students]);

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
          description="Filter by student identity, year, status, batch, score bands, percentile, risk, discipline, and last active date."
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
          <UiFormField
            label="Academic Year"
            htmlFor="admin-student-academic-year-filter"
            helper="Required scope from studentYearMetrics."
          >
            <select
              id="admin-student-academic-year-filter"
              value={filters.academicYear}
              onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}
            >
              {uniqueAcademicYears.length === 0 ? <option value="">No years available</option> : null}
              {uniqueAcademicYears.map((academicYear) => (
                <option key={academicYear} value={academicYear}>
                  {academicYear}
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
          <UiFormField label="Avg Raw Score Min %" htmlFor="admin-student-raw-min">
            <input
              id="admin-student-raw-min"
              type="number"
              min="0"
              max="100"
              value={filters.rawScoreMin}
              onChange={(event) => setFilters((current) => ({ ...current, rawScoreMin: event.target.value }))}
            />
          </UiFormField>
          <UiFormField label="Avg Raw Score Max %" htmlFor="admin-student-raw-max">
            <input
              id="admin-student-raw-max"
              type="number"
              min="0"
              max="100"
              value={filters.rawScoreMax}
              onChange={(event) => setFilters((current) => ({ ...current, rawScoreMax: event.target.value }))}
            />
          </UiFormField>
          <UiFormField label="Avg Accuracy Min %" htmlFor="admin-student-accuracy-min">
            <input
              id="admin-student-accuracy-min"
              type="number"
              min="0"
              max="100"
              value={filters.accuracyMin}
              onChange={(event) => setFilters((current) => ({ ...current, accuracyMin: event.target.value }))}
            />
          </UiFormField>
          <UiFormField label="Avg Accuracy Max %" htmlFor="admin-student-accuracy-max">
            <input
              id="admin-student-accuracy-max"
              type="number"
              min="0"
              max="100"
              value={filters.accuracyMax}
              onChange={(event) => setFilters((current) => ({ ...current, accuracyMax: event.target.value }))}
            />
          </UiFormField>
          <UiFormField label="Score Percentile Min" htmlFor="admin-student-percentile-min">
            <input
              id="admin-student-percentile-min"
              type="number"
              min="0"
              max="100"
              value={filters.scorePercentileMin}
              onChange={(event) => setFilters((current) => ({ ...current, scorePercentileMin: event.target.value }))}
            />
          </UiFormField>
          <UiFormField label="Score Percentile Max" htmlFor="admin-student-percentile-max">
            <input
              id="admin-student-percentile-max"
              type="number"
              min="0"
              max="100"
              value={filters.scorePercentileMax}
              onChange={(event) => setFilters((current) => ({ ...current, scorePercentileMax: event.target.value }))}
            />
          </UiFormField>
          <UiFormField label="Risk State" htmlFor="admin-student-risk-filter">
            <select
              id="admin-student-risk-filter"
              value={filters.riskState}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  riskState: event.target.value as StudentFilterState["riskState"],
                }))
              }
            >
              <option value="all">All</option>
              {RISK_STATES.map((riskState) => (
                <option key={riskState} value={riskState}>
                  {riskState}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Discipline Min" htmlFor="admin-student-discipline-min">
            <input
              id="admin-student-discipline-min"
              type="number"
              min="0"
              max="100"
              value={filters.disciplineMin}
              onChange={(event) => setFilters((current) => ({ ...current, disciplineMin: event.target.value }))}
            />
          </UiFormField>
          <UiFormField label="Discipline Max" htmlFor="admin-student-discipline-max">
            <input
              id="admin-student-discipline-max"
              type="number"
              min="0"
              max="100"
              value={filters.disciplineMax}
              onChange={(event) => setFilters((current) => ({ ...current, disciplineMax: event.target.value }))}
            />
          </UiFormField>
          <UiFormField label="Last Active From" htmlFor="admin-student-last-active-start">
            <input
              id="admin-student-last-active-start"
              type="date"
              value={filters.lastActiveStart}
              onChange={(event) => setFilters((current) => ({ ...current, lastActiveStart: event.target.value }))}
            />
          </UiFormField>
          <UiFormField label="Last Active To" htmlFor="admin-student-last-active-end">
            <input
              id="admin-student-last-active-end"
              type="date"
              value={filters.lastActiveEnd}
              onChange={(event) => setFilters((current) => ({ ...current, lastActiveEnd: event.target.value }))}
            />
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
