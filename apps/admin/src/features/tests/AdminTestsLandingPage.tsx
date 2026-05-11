import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";

const apiClient = getPortalApiClient("admin");

type TemplateStatus = "draft" | "ready" | "assigned" | "archived" | "deprecated";

interface TestTemplateRecord {
  id: string;
  templateName: string;
  examType: string;
  selectionMethod: string;
  totalDurationMinutes: number;
  selectedQuestionIds: string[];
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  timingProfile: {
    easy: { minSeconds: number; maxSeconds: number };
    medium: { minSeconds: number; maxSeconds: number };
    hard: { minSeconds: number; maxSeconds: number };
  };
  status: TemplateStatus;
  updatedAt: string;
  canonicalId: string;
}

const FALLBACK_TEMPLATES: TestTemplateRecord[] = [
  {
    id: "tmpl-001",
    canonicalId: "14a94be7286349e2624b0ef42f9eaa9f4c89eb2d270218071b060962fce6057f",
    templateName: "JEE Mains Mock - Set A",
    examType: "JEEMains",
    selectionMethod: "manual",
    totalDurationMinutes: 180,
    selectedQuestionIds: ["q-101", "q-102", "q-104", "q-105", "q-107", "q-108"],
    difficultyDistribution: { easy: 3, medium: 3, hard: 0 },
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    status: "draft",
    updatedAt: "2026-04-10T08:30:00.000Z",
  },
  {
    id: "tmpl-002",
    canonicalId: "da6cf95d845169f18f6f0f260fa8535f89b7afe29158416f1572a5f9f29407f5",
    templateName: "NEET Revision - Biology Focus",
    examType: "NEET",
    selectionMethod: "round_robin",
    totalDurationMinutes: 200,
    selectedQuestionIds: ["q-101", "q-103", "q-104", "q-106", "q-108", "q-109"],
    difficultyDistribution: { easy: 2, medium: 2, hard: 2 },
    timingProfile: {
      easy: { minSeconds: 30, maxSeconds: 60 },
      medium: { minSeconds: 60, maxSeconds: 150 },
      hard: { minSeconds: 150, maxSeconds: 210 },
    },
    status: "assigned",
    updatedAt: "2026-04-08T11:45:00.000Z",
  },
];

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
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

function toTemplateStatus(value: unknown): TemplateStatus {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "draft" || normalized === "ready" || normalized === "assigned" || normalized === "archived" || normalized === "deprecated") {
    return normalized;
  }
  return "draft";
}

function normalizeTemplateRecord(value: unknown, index: number): TestTemplateRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = FALLBACK_TEMPLATES[index] ?? FALLBACK_TEMPLATES[0];
  const difficultySource =
    record.difficultyDistribution && typeof record.difficultyDistribution === "object" ?
      (record.difficultyDistribution as Record<string, unknown>) :
      {};
  const timingProfileSource =
    record.timingProfile && typeof record.timingProfile === "object" ?
      (record.timingProfile as Record<string, unknown>) :
      {};
  const questionIdsSource = record.selectedQuestionIds ?? record.questionIds;
  const selectedQuestionIds = Array.isArray(questionIdsSource) ?
    questionIdsSource.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) :
    fallback?.selectedQuestionIds ?? [];

  return {
    id: toNonEmptyString(record.id, `tmpl-${index + 1}`),
    canonicalId: toNonEmptyString(record.canonicalId, fallback?.canonicalId ?? `canonical-${index + 1}`),
    templateName: toNonEmptyString(record.templateName, fallback?.templateName ?? `Template ${index + 1}`),
    examType: toNonEmptyString(record.examType, fallback?.examType ?? "General"),
    selectionMethod: toNonEmptyString(record.selectionMethod, fallback?.selectionMethod ?? "manual"),
    totalDurationMinutes: Math.max(30, toNumberOrZero(record.totalDurationMinutes ?? record.durationMinutes)),
    selectedQuestionIds,
    difficultyDistribution: {
      easy: Math.max(0, toNumberOrZero(difficultySource.easy)),
      medium: Math.max(0, toNumberOrZero(difficultySource.medium)),
      hard: Math.max(0, toNumberOrZero(difficultySource.hard)),
    },
    timingProfile: {
      easy: {
        minSeconds: Math.max(1, toNumberOrZero((timingProfileSource.easy as Record<string, unknown> | undefined)?.minSeconds ?? 30)),
        maxSeconds: Math.max(1, toNumberOrZero((timingProfileSource.easy as Record<string, unknown> | undefined)?.maxSeconds ?? 60)),
      },
      medium: {
        minSeconds: Math.max(1, toNumberOrZero((timingProfileSource.medium as Record<string, unknown> | undefined)?.minSeconds ?? 60)),
        maxSeconds: Math.max(1, toNumberOrZero((timingProfileSource.medium as Record<string, unknown> | undefined)?.maxSeconds ?? 150)),
      },
      hard: {
        minSeconds: Math.max(1, toNumberOrZero((timingProfileSource.hard as Record<string, unknown> | undefined)?.minSeconds ?? 150)),
        maxSeconds: Math.max(1, toNumberOrZero((timingProfileSource.hard as Record<string, unknown> | undefined)?.maxSeconds ?? 210)),
      },
    },
    status: toTemplateStatus(record.status),
    updatedAt: toNonEmptyString(record.updatedAt, fallback?.updatedAt ?? new Date(0).toISOString()),
  };
}

async function fetchTemplatesFromApi(): Promise<TestTemplateRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/tests");
  if (!Array.isArray(payload)) {
    throw new Error("GET /admin/tests returned an invalid payload.");
  }

  const templates = payload
    .map((entry, index) => normalizeTemplateRecord(entry, index))
    .filter((entry): entry is TestTemplateRecord => Boolean(entry));

  if (templates.length === 0) {
    throw new Error("GET /admin/tests did not include any templates.");
  }

  return templates;
}

const TEST_WORKSPACES = [
  {
    title: "Create Test",
    description: "Template authoring workspace for question selection, timing profiles, draft save, and publish flow.",
    to: "/admin/tests/create",
    meta: "Authoring and duplicate-check workflow",
  },
  {
    title: "Test Library",
    description: "Central library for saved templates, lifecycle review, detail drill-in, and edit-or-publish actions.",
    to: "/admin/tests/library",
    meta: "Primary template operations workspace",
  },
  {
    title: "Template Analytics",
    description: "Cross-template outcome review for effectiveness, average scores, and reusable template quality signals.",
    to: "/admin/tests/analytics",
    meta: "Analytics and performance visibility",
  },
  {
    title: "Distribution Review",
    description: "Structural review for difficulty balance, question composition, and timing-shape visibility.",
    to: "/admin/tests/distribution",
    meta: "Composition and balance checks",
  },
  {
    title: "Template Settings",
    description: "Lifecycle rules, capability ceilings, and immutable-structure guidance for templates after assignment.",
    to: "/admin/tests/settings",
    meta: "Governance and template guardrails",
  },
] as const;

function AdminTestsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const [templates, setTemplates] = useState<TestTemplateRecord[]>(FALLBACK_TEMPLATES);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setTemplates(FALLBACK_TEMPLATES);
        setInlineMessage("Local mode detected. Loaded deterministic tests landing fixtures from template summaries.");
        setIsLoading(false);
        return;
      }

      try {
        const nextTemplates = await fetchTemplatesFromApi();
        if (!isMounted) {
          return;
        }

        setTemplates(nextTemplates);
        setInlineMessage("Live mode enabled: tests landing hydrated from GET /admin/tests.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load tests landing.";
        setTemplates(FALLBACK_TEMPLATES);
        setInlineMessage(`${reason} Falling back to deterministic test fixtures.`);
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

  const readyOrAssignedCount = useMemo(
    () => templates.filter((template) => template.status === "ready" || template.status === "assigned").length,
    [templates],
  );
  const draftCount = useMemo(
    () => templates.filter((template) => template.status === "draft").length,
    [templates],
  );
  const totalQuestions = useMemo(
    () => templates.reduce((sum, template) => sum + template.selectedQuestionIds.length, 0),
    [templates],
  );
  const testsWorkspaces = useMemo(
    () => TEST_WORKSPACES.map((workspace) => {
      switch (workspace.to) {
        case "/admin/tests/create":
          return {
            ...workspace,
            meta: `${draftCount} editable drafts currently remain in the template pool`,
          };
        case "/admin/tests/library":
          return {
            ...workspace,
            meta: `${templates.length} templates indexed from the current test registry`,
          };
        case "/admin/tests/analytics":
          return {
            ...workspace,
            meta: `${readyOrAssignedCount} reusable templates are analytics-eligible`,
          };
        case "/admin/tests/distribution":
          return {
            ...workspace,
            meta: `${totalQuestions} frozen question slots represented across indexed templates`,
          };
        case "/admin/tests/settings":
          return {
            ...workspace,
            meta: `${templates.filter((template) => template.status === "assigned").length} assigned templates are structurally locked`,
          };
        default:
          return workspace;
      }
    }),
    [draftCount, readyOrAssignedCount, templates, totalQuestions],
  );
  const note = isLoading ?
    "Loading tests landing summary from GET /admin/tests..." :
    `${inlineMessage ?? "Tests landing workspace ready."} Role: ${accessContext.role ?? "unknown"}. Current layer: ${accessContext.licenseLayer ?? "unlicensed"}.`;

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Tests Workspace"
      title="Dedicated Tests Landing Workspace"
      description={[
        "This route turns /admin/tests into a dedicated workspace index instead of redirecting directly into the template library.",
        "Template operations are grouped into focused destinations for authoring, library review, analytics, distribution checks, and settings guidance.",
      ]}
      note={note}
      stats={[
        {
          label: "Workspaces",
          value: String(TEST_WORKSPACES.length),
          detail: "Dedicated test management destinations",
        },
        {
          label: "Templates Indexed",
          value: String(templates.length),
          detail: "templates loaded from the current test registry",
        },
        {
          label: "Ready Or Assigned",
          value: String(readyOrAssignedCount),
          detail: "templates available for reuse or already structurally locked",
        },
        {
          label: "Drafts",
          value: String(draftCount),
          detail: "editable templates before structural lock",
        },
      ]}
      links={testsWorkspaces}
    />
  );
}

export default AdminTestsLandingPage;
