import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import type { AdminQuestionDetailResult, AdminQuestionTemplateUsageRecord } from "../../../../../shared/contracts/apiDtos";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { shouldUseLiveApi } from "../../../../../shared/services/frontendEnvironment";
import { UiModal, UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";
import { getQuestionDetail } from "./questionBankApi";

function AdminQuestionBankQuestionDetailPage() {
  const {questionId} = useParams<{questionId: string}>();
  const hasAuthoritativeDetail = Boolean(questionId && shouldUseLiveApi());
  const [detail, setDetail] = useState<AdminQuestionDetailResult | null>(null);
  const [isLoading, setIsLoading] = useState(hasAuthoritativeDetail);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<{fileName: string; src: string; title: string} | null>(null);

  useEffect(() => {
    let active = true;
    if (!questionId || !shouldUseLiveApi()) return () => { active = false; };
    void getQuestionDetail(questionId).then((result) => {
      if (active) setDetail(result);
    }).catch((error) => {
      if (active) setErrorMessage(error instanceof ApiClientError ? error.message : "Failed to load question detail.");
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [questionId]);

  const usageColumns: UiTableColumn<AdminQuestionTemplateUsageRecord>[] = [
    {id: "name", header: "Template", render: (row) => row.testName},
    {id: "status", header: "Status", render: (row) => row.status},
    {id: "runs", header: "Runs", render: (row) => row.runCount},
    {id: "lastUsed", header: "Last Used", render: (row) => row.lastUsedAt ?? "Not used"},
    {id: "version", header: "Version", render: (row) => `v${row.version}`},
  ];
  const question = detail?.question;

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-detail-title">
      <p className="admin-content-eyebrow">Question Bank Library</p>
      <h2 id="admin-question-detail-title">Question Detail</h2>
      <p className="admin-content-copy">Authoritative question, lineage, usage, and persisted analytics.</p>
      <QuestionBankWorkspaceNav />
      <div className="admin-tests-row-actions" style={{marginTop: 16}}><NavLink to="/admin/question-bank/library">Back to Question Library</NavLink></div>
      {isLoading ? <p className="admin-tests-inline-note">Loading authoritative question detail...</p> : null}
      {!hasAuthoritativeDetail ? <p className="admin-tests-inline-error">Authoritative question detail is available only in live API mode.</p> : null}
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}
      {question ? (
        <section className="admin-question-library-detail">
          <div className="admin-question-library-detail-header"><div><p className="admin-content-eyebrow">Question</p><h3>{question.id}</h3><p>{question.prompt}</p>
            <div className="admin-question-library-detail-badges"><span>{question.examType}</span><span>{question.subject}</span><span>{question.chapter}</span><span>{question.difficulty}</span><span>{question.thermalState.toUpperCase()}</span><span>revision {question.revision}</span></div>
          </div></div>
          <div className="admin-question-library-overview-strip">
            <article className="admin-question-library-overview-card"><p>Unique Key</p><strong>{question.uniqueKey}</strong><small>v{question.version}</small></article>
            <article className="admin-question-library-overview-card"><p>Marking</p><strong>{question.marks} / -{question.negativeMarks}</strong><small>{question.questionType}</small></article>
            <article className="admin-question-library-overview-card"><p>Usage</p><strong>{question.usedCount} runs</strong><small>{question.lastUsedDate ?? "Not used"}</small></article>
            <article className="admin-question-library-overview-card"><p>Lifecycle</p><strong>{question.status}</strong><small>{question.usedInTemplate ? "Active template reference" : "No active template reference"}</small></article>
          </div>
          <div className="admin-question-library-detail-grid">
            <article className="admin-question-library-panel"><h4>Question Setup</h4><dl className="admin-question-library-definition-list">
              <div><dt>Answer</dt><dd>{question.correctAnswer || "Not added"}</dd></div><div><dt>Academic Year</dt><dd>{question.academicYear}</dd></div>
              <div><dt>Primary Tag</dt><dd>{question.primaryTag}</dd></div><div><dt>Secondary Tag</dt><dd>{question.secondaryTag}</dd></div>
              <div><dt>Additional Tag</dt><dd>{question.additionalTag}</dd></div><div><dt>Topic</dt><dd>{question.topic || "Not added"}</dd></div>
              <div><dt>Internal Notes</dt><dd>{question.internalNotes || "Not added"}</dd></div><div><dt>Parent</dt><dd>{question.parentQuestionId ?? "Root version"}</dd></div>
            </dl></article>
            <article className="admin-question-library-panel"><h4>Managed Assets</h4><dl className="admin-question-library-definition-list">
              <div><dt>Question Image</dt><dd>{question.questionImageFile ? <button type="button" onClick={() => setPreviewAsset({fileName: question.questionImageFile, src: question.questionImagePreviewUrl, title: "Question Image"})}>{question.questionImageFile}</button> : "Not attached"}</dd></div>
              <div><dt>Solution Image</dt><dd>{question.solutionImageFile ? <button type="button" onClick={() => setPreviewAsset({fileName: question.solutionImageFile, src: question.solutionImagePreviewUrl, title: "Solution Image"})}>{question.solutionImageFile}</button> : "Not attached"}</dd></div>
              <div><dt>Tutorial</dt><dd>{question.tutorialVideoLink ? <a href={question.tutorialVideoLink} target="_blank" rel="noreferrer">Open tutorial</a> : "Not added"}</dd></div>
              <div><dt>Simulation</dt><dd>{question.simulationLink ? <a href={question.simulationLink} target="_blank" rel="noreferrer">Open simulation</a> : "Not added"}</dd></div>
            </dl></article>
            <article className="admin-question-library-panel admin-question-library-panel-wide"><h4>Version History</h4><div className="admin-question-library-version-list">
              {detail.versions.map((version) => <div key={version.questionId} className="admin-question-library-version-row"><strong>{version.questionId}</strong><small>v{version.version} · {version.status} · revision {version.revision}</small></div>)}
            </div></article>
            <article className="admin-question-library-panel admin-question-library-panel-wide"><h4>Persisted Analytics</h4>
              {detail.analytics ? <dl className="admin-question-library-definition-list"><div><dt>Accuracy</dt><dd>{detail.analytics.avgAccuracyWhenUsed}%</dd></div><div><dt>Average response</dt><dd>{Math.round(detail.analytics.averageResponseTimeMs / 1000)} sec</dd></div><div><dt>Guess rate</dt><dd>{detail.analytics.guessRate}%</dd></div><div><dt>Overstay</dt><dd>{detail.analytics.overstayRate}%</dd></div><div><dt>Discipline stress</dt><dd>{detail.analytics.disciplineStressIndex}</dd></div><div><dt>Risk impact</dt><dd>{detail.analytics.riskImpactScore}</dd></div></dl> : <p>No persisted analytics exist for this question yet.</p>}
            </article>
            <article className="admin-question-library-panel admin-question-library-panel-wide"><h4>Used In Test Templates</h4><UiTable caption="Authoritative template usage" columns={usageColumns} rows={detail.templateUsage} rowKey={(row) => row.testId} emptyStateText="No template usage exists." /></article>
          </div>
        </section>
      ) : null}
      <UiModal isOpen={Boolean(previewAsset)} title={previewAsset?.title ?? "Image Preview"} description={previewAsset?.fileName ?? ""} onClose={() => setPreviewAsset(null)} footer={<button type="button" onClick={() => setPreviewAsset(null)}>Close</button>}>
        {previewAsset ? <img className="admin-question-library-preview-image" src={previewAsset.src} alt={`${previewAsset.title}: ${previewAsset.fileName}`} /> : null}
      </UiModal>
    </section>
  );
}

export default AdminQuestionBankQuestionDetailPage;
