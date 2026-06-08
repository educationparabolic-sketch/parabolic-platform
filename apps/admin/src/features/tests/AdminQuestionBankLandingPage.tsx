import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";
import { QUESTION_BANK } from "./testTemplateFixtures";

const apiClient = getPortalApiClient("admin");

interface QuestionBankLandingSummary {
  totalQuestions: number;
  activeTags: number;
  imbalanceWarnings: number;
  latestUploadDate: string;
  latestUploadRows: number;
  usedQuestions: number;
}

const QUESTION_BANK_WORKSPACES = [
  {
    title: "Bulk Upload",
    to: "/admin/question-bank/upload-package",
    description: "Upload a workbook package, validate the rows, and review import issues in one guided flow.",
    meta: "Workbook and asset intake",
  },
  {
    title: "Question Library",
    to: "/admin/question-bank/library",
    description: "Search questions, review usage, manage versions, and update allowed metadata safely.",
    meta: "Search, review, and upkeep",
  },
  {
    title: "Overall Distribution Overview",
    to: "/admin/question-bank/distribution",
    description: "Review coverage, difficulty balance, and chapter distribution across the full question bank.",
    meta: "Coverage and balance review",
  },
  {
    title: "Tag Management",
    to: "/admin/question-bank/tags",
    description: "Create, rename, merge, and retire tags used across the question bank.",
    meta: "Question taxonomy controls",
  },
] as const;

const FALLBACK_SUMMARY: QuestionBankLandingSummary = {
  totalQuestions: QUESTION_BANK.length,
  activeTags: new Set(
    QUESTION_BANK.flatMap((question) => [question.primaryTag, question.secondaryTag]).filter((tag) => tag !== "none"),
  ).size,
  imbalanceWarnings: 2,
  latestUploadDate: "2026-04-12T08:30:00.000Z",
  latestUploadRows: 124,
  usedQuestions: QUESTION_BANK.filter((question) => question.usedCount > 0).length,
};

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

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

async function fetchQuestionBankLandingSummary(): Promise<QuestionBankLandingSummary> {
  const [libraryPayload, distributionPayload, uploadLogsPayload] = await Promise.all([
    apiClient.get<unknown>("/admin/questions/library", {
      query: { limit: "250" },
    }),
    apiClient.get<unknown>("/admin/questions/distribution", {
      query: { limit: "6" },
    }),
    apiClient.get<unknown>("/admin/questions/upload-logs"),
  ]);

  if (!libraryPayload || typeof libraryPayload !== "object") {
    throw new Error("GET /admin/questions/library returned an invalid payload.");
  }
  if (!distributionPayload || typeof distributionPayload !== "object") {
    throw new Error("GET /admin/questions/distribution returned an invalid payload.");
  }
  if (!uploadLogsPayload || typeof uploadLogsPayload !== "object") {
    throw new Error("GET /admin/questions/upload-logs returned an invalid payload.");
  }

  const libraryResponse = libraryPayload as {
    data?: {
      questions?: unknown;
    };
  };
  const distributionResponse = distributionPayload as {
    data?: {
      summary?: unknown;
    };
  };
  const uploadLogsResponse = uploadLogsPayload as {
    data?: {
      logs?: unknown;
    };
  };

  const questions = Array.isArray(libraryResponse.data?.questions) ? libraryResponse.data?.questions : [];
  const distributionSummary =
    distributionResponse.data?.summary && typeof distributionResponse.data.summary === "object" ?
      (distributionResponse.data.summary as Record<string, unknown>) :
      null;
  const uploadLogs = Array.isArray(uploadLogsResponse.data?.logs) ? uploadLogsResponse.data?.logs : [];

  if (questions.length === 0 || !distributionSummary) {
    throw new Error("Question bank landing summary is missing required admin question data.");
  }

  const activeTags = new Set<string>();
  let usedQuestions = 0;

  questions.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const record = entry as Record<string, unknown>;
    const primaryTag = toNonEmptyString(record.primaryTag);
    const secondaryTag = toNonEmptyString(record.secondaryTag);

    if (primaryTag.length > 0 && primaryTag !== "none") {
      activeTags.add(primaryTag);
    }
    if (secondaryTag.length > 0 && secondaryTag !== "none") {
      activeTags.add(secondaryTag);
    }
    if (toNumberOrZero(record.usedCount) > 0) {
      usedQuestions += 1;
    }
  });

  const latestUpload = uploadLogs.reduce<Record<string, unknown> | null>((latest, entry) => {
    if (!entry || typeof entry !== "object") {
      return latest;
    }

    const current = entry as Record<string, unknown>;
    const currentTimestamp = Date.parse(toNonEmptyString(current.timestamp, new Date(0).toISOString()));
    const latestTimestamp =
      latest ? Date.parse(toNonEmptyString(latest.timestamp, new Date(0).toISOString())) : Number.NEGATIVE_INFINITY;

    return currentTimestamp > latestTimestamp ? current : latest;
  }, null);

  return {
    totalQuestions: Math.max(0, questions.length),
    activeTags: Math.max(0, activeTags.size),
    imbalanceWarnings: Math.max(0, toNumberOrZero(distributionSummary.imbalanceWarnings)),
    latestUploadDate: toNonEmptyString(latestUpload?.timestamp, FALLBACK_SUMMARY.latestUploadDate),
    latestUploadRows: Math.max(0, toNumberOrZero(latestUpload?.totalRows ?? FALLBACK_SUMMARY.latestUploadRows)),
    usedQuestions: Math.max(0, usedQuestions),
  };
}

function AdminQuestionBankLandingPage() {
  const [summary, setSummary] = useState<QuestionBankLandingSummary>(FALLBACK_SUMMARY);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function hydrate(): Promise<void> {
      if (!shouldUseLiveApi()) {
        setSummary(FALLBACK_SUMMARY);
        setInlineMessage("Question bank workspaces are ready.");
        return;
      }

      try {
        const nextSummary = await fetchQuestionBankLandingSummary();
        if (!isActive) {
          return;
        }

        setSummary(nextSummary);
        setInlineMessage("Question bank workspaces are ready.");
      } catch (error) {
        if (!isActive) {
          return;
        }

        const reason =
          error instanceof ApiClientError ? error.message : "Failed to load question bank landing summary.";
        setSummary(FALLBACK_SUMMARY);
        setInlineMessage(reason);
      }
    }

    void hydrate();

    return () => {
      isActive = false;
    };
  }, []);

  const stats = useMemo(
    () => [
      {
        label: "Tracked Questions",
        value: String(summary.totalQuestions),
        detail: `${summary.usedQuestions} already used in delivered work`,
      },
      {
        label: "Active Tags",
        value: String(summary.activeTags),
        detail: "currently in use across the question bank",
      },
      {
        label: "Imbalance Warnings",
        value: String(summary.imbalanceWarnings),
        detail: "areas that may need coverage review",
      },
      {
        label: "Latest Upload",
        value: formatIsoDate(summary.latestUploadDate),
        detail: `${summary.latestUploadRows} rows in the latest package`,
      },
    ],
    [summary],
  );

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Question Bank"
      title="Question Bank"
      description={[
        "Choose the question bank workspace you want to open.",
        "Use bulk upload for intake, question library for question-level work, tags for taxonomy, and distribution overview for overall balance review.",
      ]}
      note={inlineMessage ?? "Question bank workspaces are ready."}
      stats={stats}
      links={QUESTION_BANK_WORKSPACES.map((workspace) => ({ ...workspace }))}
    />
  );
}

export default AdminQuestionBankLandingPage;
