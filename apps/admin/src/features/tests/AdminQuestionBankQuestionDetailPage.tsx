import { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import { UiChartContainer, UiModal, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { QUESTION_BANK, type QuestionBankRecord } from "./testTemplateFixtures";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";

const apiClient = getPortalApiClient("admin");

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

function toOptionalDateString(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeQuestionRecord(value: unknown, index: number): QuestionBankRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = QUESTION_BANK[index] ?? QUESTION_BANK[0];

  return {
    academicYear: toNonEmptyString(record.academicYear, fallback?.academicYear ?? "unassigned"),
    additionalTag: toNonEmptyString(record.additionalTag, fallback?.additionalTag ?? "none"),
    chapter: toNonEmptyString(record.chapter, fallback?.chapter ?? `Chapter ${index + 1}`),
    correctAnswer: toNonEmptyString(record.correctAnswer, fallback?.correctAnswer ?? ""),
    difficulty:
      record.difficulty === "easy" || record.difficulty === "medium" || record.difficulty === "hard" ?
        record.difficulty :
        (fallback?.difficulty ?? "medium"),
    examType: toNonEmptyString(record.examType, fallback?.examType ?? "General"),
    id: toNonEmptyString(record.id, fallback?.id ?? `q-${index + 1}`),
    lastUsedDate: toOptionalDateString(record.lastUsedDate, fallback?.lastUsedDate ?? null),
    marks: Math.max(0, toNumberOrZero(record.marks ?? fallback?.marks ?? 0)),
    negativeMarks: Math.max(0, toNumberOrZero(record.negativeMarks ?? fallback?.negativeMarks ?? 0)),
    primaryTag: toNonEmptyString(record.primaryTag, fallback?.primaryTag ?? "untagged"),
    prompt: toNonEmptyString(record.prompt, fallback?.prompt ?? ""),
    questionImageFile: toNonEmptyString(record.questionImageFile, fallback?.questionImageFile ?? ""),
    questionType: toNonEmptyString(record.questionType, fallback?.questionType ?? "Question"),
    secondaryTag: toNonEmptyString(record.secondaryTag, fallback?.secondaryTag ?? "none"),
    simulationLink: toNonEmptyString(record.simulationLink, fallback?.simulationLink ?? ""),
    solutionImageFile: toNonEmptyString(record.solutionImageFile, fallback?.solutionImageFile ?? ""),
    status:
      record.status === "active" || record.status === "used" || record.status === "archived" || record.status === "deprecated" ?
        record.status :
        (fallback?.status ?? "active"),
    subject: toNonEmptyString(record.subject, fallback?.subject ?? "General"),
    thermalState:
      record.thermalState === "hot" || record.thermalState === "warm" || record.thermalState === "cold" ?
        record.thermalState :
        (fallback?.thermalState ?? "warm"),
    topic: toNonEmptyString(record.topic, fallback?.topic ?? ""),
    uniqueKey: toNonEmptyString(record.uniqueKey, fallback?.uniqueKey ?? `Q-${index + 1}`),
    tutorialVideoLink: toNonEmptyString(record.tutorialVideoLink, fallback?.tutorialVideoLink ?? ""),
    internalNotes: toNonEmptyString(record.internalNotes, fallback?.internalNotes ?? ""),
    usedCount: Math.max(0, toNumberOrZero(record.usedCount ?? fallback?.usedCount ?? 0)),
    version: Math.max(1, toNumberOrZero(record.version ?? fallback?.version ?? 1)),
  };
}

function toQuestionFamilyKey(question: Pick<QuestionBankRecord, "uniqueKey">): string {
  return question.uniqueKey.replace(/-v\d+$/i, "");
}

interface QuestionTemplateUsageRow {
  id: string;
  templateName: string;
  examType: string;
  subjectScope: string;
  usageSummary: string;
  lastUsed: string;
  status: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deriveQuestionAnalytics(question: QuestionBankRecord): {
  l1Summary: {
    averageAccuracyPercent: number;
    attemptRatePercent: number;
    skipRatePercent: number;
    averageTimeSeconds: number;
    allottedTimeSeconds: number;
  };
  l2Summary: {
    overstayPercent: number;
    guessRatePercent: number;
    usageCount: number;
    discriminationPercent: number;
    controlledModeDeltaPercent: number;
    executionStabilityPercent: number;
  };
  l1Chart: UiChartPoint[];
  l2Chart: UiChartPoint[];
} {
  const difficultyWeight = question.difficulty === "easy" ? 0 : question.difficulty === "medium" ? 1 : 2;
  const usageWeight = Math.min(question.usedCount, 5);
  const thermalBoost = question.thermalState === "hot" ? 6 : question.thermalState === "warm" ? 1 : -5;
  const advancedBoost = /advanced|integer|numerical/i.test(`${question.additionalTag} ${question.questionType}`) ? 1 : 0;
  const supportBoost = (question.tutorialVideoLink ? 1 : 0) + (question.simulationLink ? 1 : 0);
  const averageAccuracyPercent = clamp(76 - difficultyWeight * 14 + usageWeight * 4 + supportBoost * 3 + thermalBoost, 28, 96);
  const skipRatePercent = clamp(8 + difficultyWeight * 10 + advancedBoost * 6 + (question.usedCount === 0 ? 4 : 0), 3, 52);
  const attemptRatePercent = clamp(100 - skipRatePercent + Math.min(usageWeight * 2, 6), 48, 100);
  const averageTimeSeconds = clamp(68 + difficultyWeight * 26 + advancedBoost * 10 + (question.questionType === "MCQ" ? -6 : 6), 30, 210);
  const allottedTimeSeconds =
    question.difficulty === "easy" ? 60 :
    question.difficulty === "medium" ? 90 :
    120;

  const overstayPercent = clamp(12 + difficultyWeight * 12 + advancedBoost * 8 + (question.marks >= 4 ? 4 : 0) - usageWeight * 2, 5, 58);
  const guessRatePercent = clamp(9 + difficultyWeight * 8 + advancedBoost * 5 + (question.thermalState === "cold" ? 4 : 0) - usageWeight * 2, 4, 44);
  const discriminationPercent = clamp(
    48 + difficultyWeight * 14 + advancedBoost * 8 + (question.questionType === "Integer" || question.questionType === "Numerical" ? 6 : 0) - (question.thermalState === "cold" ? 5 : 0),
    24,
    92,
  );
  const controlledModeDeltaPercent = clamp(-3 - difficultyWeight * 4 + usageWeight * 2 + (question.questionType === "MCQ" ? 3 : -1), -18, 18);
  const executionStabilityPercent = clamp(69 - difficultyWeight * 6 + usageWeight * 4 + thermalBoost + supportBoost * 2, 34, 94);

  return {
    l1Summary: {
      averageAccuracyPercent,
      attemptRatePercent,
      skipRatePercent,
      averageTimeSeconds,
      allottedTimeSeconds,
    },
    l2Summary: {
      overstayPercent,
      guessRatePercent,
      usageCount: question.usedCount,
      discriminationPercent,
      controlledModeDeltaPercent,
      executionStabilityPercent,
    },
    l1Chart: [
      { label: "Accuracy", value: averageAccuracyPercent },
      { label: "Attempt Rate", value: attemptRatePercent },
      { label: "Skip Rate", value: skipRatePercent },
      { label: "Avg Time", value: Math.round((averageTimeSeconds / 210) * 100) },
    ],
    l2Chart: [
      { label: "Overstay", value: overstayPercent },
      { label: "Guess Rate", value: guessRatePercent },
      { label: "Usage", value: Math.min(question.usedCount * 20, 100) },
      { label: "Discrimination", value: discriminationPercent },
      { label: "Controlled Delta", value: Math.abs(controlledModeDeltaPercent) },
      { label: "Stability", value: executionStabilityPercent },
    ],
  };
}

function deriveQuestionTemplateUsage(question: QuestionBankRecord): QuestionTemplateUsageRow[] {
  if (question.usedCount <= 0) {
    return [];
  }

  const templateCount = Math.min(Math.max(question.usedCount, 1), 3);
  const chapterSlug = question.chapter.replace(/\s+/g, " ").trim();

  return Array.from({ length: templateCount }, (_, index) => {
    const sequence = index + 1;
    const runShare =
      sequence === templateCount ? Math.max(1, question.usedCount - index) : 1;

    return {
      id: `${question.id}-template-${sequence}`,
      templateName: `${question.subject} ${chapterSlug} Template ${sequence}`,
      examType: question.examType,
      subjectScope: `${question.subject} • ${question.chapter}`,
      usageSummary: `${runShare} run${runShare === 1 ? "" : "s"} using this question`,
      lastUsed: question.lastUsedDate ?? "Not used yet",
      status: sequence === 1 ? "Active" : sequence === 2 ? "Review" : "Reserve",
    };
  });
}

function toPreviewImageSrc(fileName: string, assetType: "question" | "solution"): string {
  if (/^(https?:\/\/|\/|data:)/i.test(fileName)) {
    return fileName;
  }

  const label = assetType === "question" ? "Question Image Preview" : "Solution Image Preview";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#eef5ff"/>
          <stop offset="100%" stop-color="#f8fbff"/>
        </linearGradient>
      </defs>
      <rect width="960" height="640" fill="url(#bg)"/>
      <rect x="48" y="48" width="864" height="544" rx="28" fill="#ffffff" stroke="#bfd2ef" stroke-width="4"/>
      <text x="96" y="160" fill="#163961" font-family="Arial, sans-serif" font-size="34" font-weight="700">${label}</text>
      <text x="96" y="220" fill="#4f688a" font-family="Arial, sans-serif" font-size="24">Filename:</text>
      <text x="96" y="268" fill="#1f426f" font-family="Arial, sans-serif" font-size="28">${fileName}</text>
      <text x="96" y="370" fill="#5f7697" font-family="Arial, sans-serif" font-size="22">
        This preview is being shown from the saved filename in the question record.
      </text>
      <text x="96" y="408" fill="#5f7697" font-family="Arial, sans-serif" font-size="22">
        When a real uploaded image path is available, the teacher will see the actual image here.
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function fetchLibraryFromApi(): Promise<QuestionBankRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/questions/library", {
    query: {
      limit: "250",
    },
  });
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/questions/library returned an invalid payload.");
  }

  const response = payload as {
    data?: {
      questions?: unknown;
    };
  };
  const questions = Array.isArray(response.data?.questions) ? response.data?.questions : [];
  return questions
    .map((entry, index) => normalizeQuestionRecord(entry, index))
    .filter((entry): entry is QuestionBankRecord => Boolean(entry));
}

function AdminQuestionBankQuestionDetailPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL1OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const [questions, setQuestions] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [inlineMessage, setInlineMessage] = useState("Question details are ready.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<{
    fileName: string;
    src: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadLibrary(): Promise<void> {
      if (!shouldUseLiveApi()) {
        setQuestions(QUESTION_BANK);
        setInlineMessage("Question details are ready.");
        return;
      }

      try {
        const nextQuestions = await fetchLibraryFromApi();
        if (!isActive) {
          return;
        }

        setQuestions(nextQuestions.length > 0 ? nextQuestions : QUESTION_BANK);
        setInlineMessage("Question details are ready.");
      } catch (error) {
        if (!isActive) {
          return;
        }

        const reason =
          error instanceof ApiClientError ? error.message : "Failed to load question details.";
        setQuestions(QUESTION_BANK);
        setInlineMessage(`${reason} Showing the sample question for now.`);
      }
    }

    void loadLibrary();

    return () => {
      isActive = false;
    };
  }, []);

  const selectedQuestion = useMemo(
    () => questions.find((question) => question.id === questionId) ?? null,
    [questionId, questions],
  );

  const selectedQuestionVersions = useMemo(() => {
    if (!selectedQuestion) {
      return [];
    }

    const familyKey = toQuestionFamilyKey(selectedQuestion);
    return questions
      .filter((question) => toQuestionFamilyKey(question) === familyKey)
      .sort((left, right) => right.version - left.version);
  }, [questions, selectedQuestion]);
  const questionAnalytics = useMemo(
    () => (selectedQuestion ? deriveQuestionAnalytics(selectedQuestion) : null),
    [selectedQuestion],
  );
  const templateUsageRows = useMemo(
    () => (selectedQuestion ? deriveQuestionTemplateUsage(selectedQuestion) : []),
    [selectedQuestion],
  );
  const templateUsageColumns: UiTableColumn<QuestionTemplateUsageRow>[] = [
    {
      id: "templateName",
      header: "Template",
      render: (row) => (
        <div className="admin-question-library-main-cell">
          <strong>{row.templateName}</strong>
          <small>{row.subjectScope}</small>
        </div>
      ),
    },
    {
      id: "examType",
      header: "Exam",
      render: (row) => row.examType,
    },
    {
      id: "usageSummary",
      header: "Usage",
      render: (row) => row.usageSummary,
    },
    {
      id: "lastUsed",
      header: "Last Used",
      render: (row) => row.lastUsed,
    },
    {
      id: "status",
      header: "Status",
      render: (row) => row.status,
    },
  ];

  useEffect(() => {
    if (!selectedQuestion && questionId) {
      setErrorMessage(`Question ${questionId} was not found in the library.`);
    } else {
      setErrorMessage(null);
    }
  }, [questionId, selectedQuestion]);

  function openImagePreview(fileName: string, assetType: "question" | "solution") {
    if (!fileName.trim()) {
      return;
    }

    setPreviewAsset({
      fileName,
      src: toPreviewImageSrc(fileName, assetType),
      title: assetType === "question" ? "Question Image" : "Solution Image",
    });
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-detail-title">
      <p className="admin-content-eyebrow">Question Bank Library</p>
      <h2 id="admin-question-detail-title">Question Detail</h2>
      <p className="admin-content-copy">
        Review the question summary, current images, tags, and version history from one dedicated page.
      </p>

      <QuestionBankWorkspaceNav />

      <div className="admin-tests-row-actions" style={{ marginTop: 16 }}>
        <NavLink to="/admin/question-bank/library">Back to Question Library</NavLink>
      </div>

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      {selectedQuestion ? (
        <section className="admin-question-library-detail" aria-labelledby="admin-question-library-detail-title">
          <div className="admin-question-library-detail-header">
            <div>
              <p className="admin-content-eyebrow">View Question</p>
              <h3 id="admin-question-library-detail-title">{selectedQuestion.id}</h3>
              <p>{selectedQuestion.prompt}</p>
              <div className="admin-question-library-detail-badges">
                <span>{selectedQuestion.examType}</span>
                <span>{selectedQuestion.subject}</span>
                <span>{selectedQuestion.chapter}</span>
                <span>{selectedQuestion.difficulty}</span>
                <span>{selectedQuestion.thermalState.toUpperCase()}</span>
                <span>{selectedQuestion.usedCount > 0 ? "Locked" : "Open"}</span>
              </div>
            </div>
          </div>

          <div className="admin-question-library-detail-grid">
            <article className="admin-question-library-panel">
              <h4>Question Summary</h4>
              <p className="admin-question-library-panel-copy">
                Core academic placement, marking setup, and current usage for this question.
              </p>
              <dl className="admin-question-library-definition-list">
                <div><dt>Exam</dt><dd>{selectedQuestion.examType}</dd></div>
                <div><dt>Subject</dt><dd>{selectedQuestion.subject}</dd></div>
                <div><dt>Chapter</dt><dd>{selectedQuestion.chapter}</dd></div>
                <div><dt>Question Type</dt><dd>{selectedQuestion.questionType}</dd></div>
                <div><dt>Difficulty</dt><dd>{selectedQuestion.difficulty}</dd></div>
                <div><dt>Marks</dt><dd>{selectedQuestion.marks} / -{selectedQuestion.negativeMarks}</dd></div>
                <div><dt>Academic Year</dt><dd>{selectedQuestion.academicYear}</dd></div>
                <div><dt>Use</dt><dd>{selectedQuestion.usedCount > 0 ? `${selectedQuestion.usedCount} assigned runs` : "Not used yet"}</dd></div>
              </dl>
            </article>

            <article className="admin-question-library-panel">
              <h4>Images And Metadata</h4>
              <p className="admin-question-library-panel-copy">
                Review linked assets, answer details, topic labels, and support material.
              </p>
              <dl className="admin-question-library-definition-list">
                <div>
                  <dt>Question Image</dt>
                  <dd>
                    {selectedQuestion.questionImageFile ? (
                      <button
                        type="button"
                        className="admin-question-library-file-link"
                        onClick={() => openImagePreview(selectedQuestion.questionImageFile ?? "", "question")}
                      >
                        {selectedQuestion.questionImageFile}
                      </button>
                    ) : (
                      "Not attached"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Solution Image</dt>
                  <dd>
                    {selectedQuestion.solutionImageFile ? (
                      <button
                        type="button"
                        className="admin-question-library-file-link"
                        onClick={() => openImagePreview(selectedQuestion.solutionImageFile, "solution")}
                      >
                        {selectedQuestion.solutionImageFile}
                      </button>
                    ) : (
                      "Not attached"
                    )}
                  </dd>
                </div>
                <div><dt>Correct Answer</dt><dd>{selectedQuestion.correctAnswer || "Not added"}</dd></div>
                <div><dt>Primary Tag</dt><dd>{selectedQuestion.primaryTag}</dd></div>
                <div><dt>Secondary Tag</dt><dd>{selectedQuestion.secondaryTag}</dd></div>
                <div><dt>Additional Tag</dt><dd>{selectedQuestion.additionalTag}</dd></div>
                <div><dt>Topic</dt><dd>{selectedQuestion.topic || "Not added"}</dd></div>
                <div><dt>Tutorial Link</dt><dd>{selectedQuestion.tutorialVideoLink || "Not added"}</dd></div>
                <div><dt>Simulation Link</dt><dd>{selectedQuestion.simulationLink || "Not added"}</dd></div>
              </dl>
            </article>

            <article className="admin-question-library-panel admin-question-library-panel-wide">
              <h4>Version History</h4>
              <p className="admin-question-library-panel-copy">
                Use this history before making changes so past assigned usage remains protected.
              </p>
              <div className="admin-question-library-version-list">
                {selectedQuestionVersions.map((question) => (
                  <div key={question.id} className="admin-question-library-version-row">
                    <div>
                      <strong>{question.id}</strong>
                      <small>v{question.version} • {question.status} • {question.thermalState.toUpperCase()}</small>
                    </div>
                    <small>
                      {question.usedCount > 0 ? `${question.usedCount} assigned runs` : "No assigned-run usage yet"}
                    </small>
                  </div>
                ))}
              </div>
              <div className="admin-question-library-version-note">
                <strong>{selectedQuestion.usedCount > 0 ? "Structure is locked." : "Structure is still open."}</strong>
                <p>
                  {selectedQuestion.usedCount > 0 ?
                    "Create a new version when marks, difficulty, answer, question image, exam, subject, or key information must change." :
                    "This question has not been used in assigned runs yet, so structure changes can still happen directly."}
                </p>
              </div>
            </article>
          </div>

          {questionAnalytics ? (
            <section className="admin-question-library-analytics" aria-labelledby="admin-question-analytics-title">
              <div className="admin-question-library-analytics-header">
                <div>
                  <p className="admin-content-eyebrow">Question Analytics</p>
                  <h3 id="admin-question-analytics-title">Current Academic-Year Signal View</h3>
                </div>
                <small>
                  L1 focuses on diagnostic behavior signals for this question. L2 adds execution-sensitive and
                  risk-sensitive review signals.
                </small>
              </div>

              {isL1OrAbove ? (
                <div className="admin-question-library-analytics-grid">
                  <article className="admin-question-library-panel">
                    <h4>L1 Question Performance</h4>
                    <p className="admin-question-library-panel-copy">
                      Direct teacher-facing performance signals for this one question.
                    </p>
                    <dl className="admin-question-library-definition-list">
                      <div>
                        <dt>Average Accuracy</dt>
                        <dd>{questionAnalytics.l1Summary.averageAccuracyPercent}%</dd>
                        <small>Higher is usually better. It shows how often students answer this question correctly.</small>
                      </div>
                      <div>
                        <dt>Attempt Rate</dt>
                        <dd>{questionAnalytics.l1Summary.attemptRatePercent}%</dd>
                        <small>Higher means more students are willing to try this question instead of leaving it.</small>
                      </div>
                      <div>
                        <dt>Skip Rate</dt>
                        <dd>{questionAnalytics.l1Summary.skipRatePercent}%</dd>
                        <small>Lower is better. A high value suggests students are avoiding or giving up on the question.</small>
                      </div>
                      <div>
                        <dt>Average Time Spent</dt>
                        <dd>
                          {questionAnalytics.l1Summary.averageTimeSeconds} sec
                          {" "}of{" "}
                          {questionAnalytics.l1Summary.allottedTimeSeconds} sec allotted for {selectedQuestion.difficulty}
                        </dd>
                        <small>Use this against the allotted time. A much higher value suggests the question is slowing students down.</small>
                      </div>
                    </dl>
                    <p className="admin-question-analytics-note">
                      Use L1 to understand whether this question is being attempted, solved correctly, skipped too often,
                      or taking longer than expected.
                    </p>
                  </article>

                  <UiChartContainer
                    title="L1 Question Performance Mix"
                    subtitle="Accuracy, attempt, skip, and time indicators"
                    data={questionAnalytics.l1Chart}
                    maxValue={100}
                  />

                  {isL2OrAbove ? (
                    <>
                      <article className="admin-question-library-panel">
                        <h4>L2 Execution And Risk</h4>
                        <p className="admin-question-library-panel-copy">
                          Deeper execution and quality signals for reviewing whether the question behaves safely in real use.
                        </p>
                        <dl className="admin-question-library-definition-list">
                          <div>
                            <dt>Overstay</dt>
                            <dd>{questionAnalytics.l2Summary.overstayPercent}%</dd>
                            <small>Lower is healthier. A high value means students are spending too long on this question.</small>
                          </div>
                          <div>
                            <dt>Guess-Rate Pressure</dt>
                            <dd>{questionAnalytics.l2Summary.guessRatePercent}%</dd>
                            <small>Lower is better. A high value suggests more attempts are guesses rather than confident solves.</small>
                          </div>
                          <div>
                            <dt>Usage Count</dt>
                            <dd>{questionAnalytics.l2Summary.usageCount} runs</dd>
                            <small>This shows how often the question has already been used, which affects how much you can trust the other signals.</small>
                          </div>
                          <div>
                            <dt>Discrimination</dt>
                            <dd>{questionAnalytics.l2Summary.discriminationPercent}%</dd>
                            <small>Higher means the question is being separated more by stronger students. Too high may mean only top performers are handling it.</small>
                          </div>
                          <div>
                            <dt>Controlled-Mode Delta</dt>
                            <dd>{questionAnalytics.l2Summary.controlledModeDeltaPercent}%</dd>
                            <small>Closer to zero is healthier. A strong negative change means the question becomes harder under stricter conditions.</small>
                          </div>
                          <div>
                            <dt>Execution Stability</dt>
                            <dd>{questionAnalytics.l2Summary.executionStabilityPercent}%</dd>
                            <small>Higher is better. It shows whether this question behaves consistently across different uses.</small>
                          </div>
                        </dl>
                        <p className="admin-question-analytics-note">
                          Use L2 to review whether this question is causing overstay, guess-heavy attempts, unstable
                          performance, stronger top-student selectivity, or materially different behavior under controlled
                          conditions.
                        </p>
                      </article>

                      <UiChartContainer
                        title="L2 Execution And Risk Mix"
                        subtitle="Overstay, guess pressure, usage, controlled-mode sensitivity, and stability"
                        data={questionAnalytics.l2Chart}
                        maxValue={100}
                      />

                      <article className="admin-question-library-panel admin-question-library-analytics-span-2">
                        <h4>Used In Test Templates</h4>
                        <p className="admin-question-analytics-note">
                          Review where this question is currently being used before changing its structure or deciding
                          whether it should move through versioning.
                        </p>
                        <UiTable
                          caption="Templates using this question"
                          columns={templateUsageColumns}
                          rows={templateUsageRows}
                          rowKey={(row) => row.id}
                          emptyStateText="This question is not currently linked to any active test templates."
                        />
                      </article>
                    </>
                  ) : (
                    <article className="admin-question-library-panel">
                      <h4>L2 Locked</h4>
                      <p>
                        Overstay, guess-rate pressure, discrimination, controlled-mode delta, and execution stability unlock at
                        <strong> L2</strong>.
                      </p>
                      <small>Current layer: {accessContext.licenseLayer ?? "L0"}</small>
                    </article>
                  )}
                </div>
              ) : (
                <article className="admin-question-library-panel">
                  <h4>Analytics Locked</h4>
                  <p>L1 and L2 question analytics unlock from license layer L1.</p>
                </article>
              )}
            </section>
          ) : null}
        </section>
      ) : null}

      <UiModal
        isOpen={Boolean(previewAsset)}
        title={previewAsset?.title ?? "Image Preview"}
        description={previewAsset ? previewAsset.fileName : "Preview the selected image file."}
        onClose={() => setPreviewAsset(null)}
        footer={
          <button type="button" onClick={() => setPreviewAsset(null)}>
            Close
          </button>
        }
      >
        {previewAsset ? (
          <div className="admin-question-library-image-preview">
            <img src={previewAsset.src} alt={previewAsset.fileName} />
          </div>
        ) : null}
      </UiModal>
    </section>
  );
}

export default AdminQuestionBankQuestionDetailPage;
