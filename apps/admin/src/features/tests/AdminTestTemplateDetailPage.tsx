import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import TestsWorkspaceNav from "./TestsWorkspaceNav";

type TemplateStatus = "draft" | "ready" | "assigned" | "archived" | "deprecated";

interface TimingWindow {
  minSeconds: number;
  maxSeconds: number;
}

interface DifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

interface TestTemplateDetailRecord {
  id: string;
  templateName: string;
  examType: string;
  selectionMethod: string;
  totalDurationMinutes: number;
  selectedQuestionIds: string[];
  difficultyDistribution: DifficultyDistribution;
  allowedModes: string[];
  timingProfile: Record<keyof DifficultyDistribution, TimingWindow>;
  status: TemplateStatus;
  updatedAt: string;
  canonicalId: string;
}

interface TimingRow {
  difficulty: string;
  minSeconds: number;
  maxSeconds: number;
}

const TEMPLATE_DETAILS: TestTemplateDetailRecord[] = [
  {
    id: "tmpl-001",
    templateName: "JEE Mains Mock - Set A",
    examType: "JEEMains",
    selectionMethod: "manual",
    totalDurationMinutes: 180,
    selectedQuestionIds: ["q-101", "q-102", "q-104", "q-105", "q-107", "q-108"],
    difficultyDistribution: { easy: 3, medium: 3, hard: 0 },
    allowedModes: ["Operational", "Diagnostic", "Controlled"],
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    status: "draft",
    updatedAt: "2026-04-10T08:30:00.000Z",
    canonicalId: "14a94be7286349e2624b0ef42f9eaa9f4c89eb2d270218071b060962fce6057f",
  },
  {
    id: "tmpl-002",
    templateName: "NEET Revision - Biology Focus",
    examType: "NEET",
    selectionMethod: "round_robin",
    totalDurationMinutes: 200,
    selectedQuestionIds: ["q-101", "q-103", "q-104", "q-106", "q-108", "q-109"],
    difficultyDistribution: { easy: 2, medium: 2, hard: 2 },
    allowedModes: ["Operational", "Diagnostic", "Controlled", "Hard"],
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    status: "assigned",
    updatedAt: "2026-04-08T11:45:00.000Z",
    canonicalId: "da6cf95d845169f18f6f0f260fa8535f89b7afe29158416f1572a5f9f29407f5",
  },
];

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function AdminTestTemplateDetailPage() {
  const navigate = useNavigate();
  const params = useParams<{ testId?: string }>();

  const template = useMemo(() => {
    return TEMPLATE_DETAILS.find((entry) => entry.id === params.testId) ?? TEMPLATE_DETAILS[0] ?? null;
  }, [params.testId]);

  const timingRows = useMemo(
    () =>
      template ?
        [
          { difficulty: "Easy", ...template.timingProfile.easy },
          { difficulty: "Medium", ...template.timingProfile.medium },
          { difficulty: "Hard", ...template.timingProfile.hard },
        ] :
        [],
    [template],
  );

  const timingColumns = useMemo<UiTableColumn<TimingRow>[]>(
    () => [
      { id: "difficulty", header: "Difficulty", render: (row) => row.difficulty },
      { id: "min", header: "Min Seconds", render: (row) => row.minSeconds },
      { id: "max", header: "Max Seconds", render: (row) => row.maxSeconds },
    ],
    [],
  );

  if (!template) {
    return null;
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-test-template-detail-title">
      <p className="admin-content-eyebrow">Test Template Detail Workspace</p>
      <h2 id="admin-test-template-detail-title">Template Snapshot and Lifecycle View</h2>
      <p className="admin-content-copy">
        This dedicated route keeps <code>/admin/tests/{`{testId}`}</code> separate from the shared test library and
        create flows. It surfaces the immutable structural snapshot, capability ceiling, and lifecycle state for a
        single test template.
      </p>

      <TestsWorkspaceNav />

      <div className="admin-risk-summary-card">
        <h4>Focused Template</h4>
        <p>
          <strong>{template.templateName}</strong> · {template.examType} · {template.status}
        </p>
        <small>Route: /admin/tests/{template.id}</small>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Total Questions</p>
          <h3>{template.selectedQuestionIds.length}</h3>
          <small>frozen structural snapshot</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Selection Method</p>
          <h3>{template.selectionMethod}</h3>
          <small>x to y template selection mode</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Duration</p>
          <h3>{template.totalDurationMinutes}m</h3>
          <small>stored template duration</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Allowed Modes</p>
          <h3>{template.allowedModes.length}</h3>
          <small>assignment-time capability ceiling</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Difficulty Distribution</h4>
          <p>
            Easy {template.difficultyDistribution.easy} · Medium {template.difficultyDistribution.medium} · Hard{" "}
            {template.difficultyDistribution.hard}
          </p>
          <small>structural balance snapshot</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Mode Capability Ceiling</h4>
          <p>{template.allowedModes.join(", ")}</p>
          <small>assignment may choose within this fixed capability envelope</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Canonical Identity</h4>
          <p>
            {template.canonicalId.slice(0, 24)}...
          </p>
          <small>duplicate prevention hash stored with the template</small>
        </article>
      </div>

      <section className="admin-analytics-run-summary" aria-labelledby="admin-test-template-timing-title">
        <h3 id="admin-test-template-timing-title">Timing Profile Snapshot</h3>
        <UiTable
          caption="Template timing profile by difficulty"
          columns={timingColumns}
          rows={timingRows}
          rowKey={(row) => row.difficulty}
          emptyStateText="No timing profile available."
        />
      </section>

      <div className="admin-risk-summary-card">
        <h4>Lifecycle Guardrails</h4>
        <p>
          Draft and ready templates may still move through review, but once first assignment occurs the structural
          snapshot becomes immutable. Last updated {formatIsoDate(template.updatedAt)}.
        </p>
        <small>Dedicated detail page separates lifecycle review from broader library actions.</small>
      </div>

      <p className="admin-analytics-inline-link-row">
        <button
          type="button"
          className="admin-compact-button"
          onClick={() => {
            navigate("/admin/tests/library");
          }}
        >
          Return to Library
        </button>
      </p>
    </section>
  );
}

export default AdminTestTemplateDetailPage;
