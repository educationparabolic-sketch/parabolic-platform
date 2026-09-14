import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import {
  shouldUseLiveApi as shouldUseConfiguredLiveApi,
} from "../../../../../shared/services/frontendEnvironment";
import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";
import { QUESTION_BANK } from "./testTemplateFixtures";
import { getQuestionDistribution, getQuestionLibrary, getQuestionTags, getQuestionUploadLogs } from "./questionBankApi";

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
  return shouldUseConfiguredLiveApi();
}

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

async function fetchQuestionBankLandingSummary(): Promise<QuestionBankLandingSummary> {
  const [library, distribution, uploadLogs, tags] = await Promise.all([
    getQuestionLibrary({ limit: "100" }),
    getQuestionDistribution(),
    getQuestionUploadLogs(),
    getQuestionTags(),
  ]);
  const latestUpload = uploadLogs[0] ?? null;

  return {
    totalQuestions: distribution.totalQuestions,
    activeTags: tags.tags.filter((tag) => tag.status === "active").length,
    imbalanceWarnings: distribution.imbalanceWarnings,
    latestUploadDate: latestUpload?.timestamp ?? "No uploads",
    latestUploadRows: latestUpload?.totalRows ?? 0,
    usedQuestions: library.questions.filter((question) => question.usedInTemplate).length,
  };
}

function AdminQuestionBankLandingPage() {
  const [summary, setSummary] = useState<QuestionBankLandingSummary>(() => shouldUseLiveApi() ? {
    activeTags: 0, imbalanceWarnings: 0, latestUploadDate: "No uploads", latestUploadRows: 0,
    totalQuestions: 0, usedQuestions: 0,
  } : FALLBACK_SUMMARY);
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
        detail: `${summary.usedQuestions} active-template references in the loaded governed page`,
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
