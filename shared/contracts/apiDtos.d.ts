/**
 * Transport DTOs shared by frontend portal adapters and Functions handlers.
 *
 * Keep backend-only validated request/context types in `functions/src/types` and
 * view-model types inside their owning portal. Only wire-level request/result
 * shapes belong here.
 */

export interface AdminStudentOnboardingResendRequest {
  instituteId?: string;
  studentId?: string;
}

export interface AdminStudentOnboardingResendResult {
  jobId: string;
  jobPath: string;
  queuedAt: string;
  recipientEmail: string;
  status: "pending";
  studentId: string;
}

export interface StudentBulkIngestionStudentInput {
  batch?: string;
  batchId?: string;
  class?: string;
  email?: string;
  enrollmentYear?: string;
  fullName?: string;
  name?: string;
  parentEmail?: string;
  phone?: string;
  studentId?: string;
}

export interface StudentBulkIngestionRequest {
  commit?: boolean;
  csvContent?: string;
  deactivateMissing?: boolean;
  instituteId: string;
  students?: StudentBulkIngestionStudentInput[];
}

export type StudentBulkIngestionRowAction =
  | "create"
  | "update"
  | "deactivate"
  | "none";

export interface StudentBulkIngestionRowResult {
  action: StudentBulkIngestionRowAction;
  email: string | null;
  errors: string[];
  fullName: string | null;
  rowNumber: number;
  studentId: string | null;
}

export interface StudentBulkIngestionSummary {
  created: number;
  deactivationCandidates: number;
  deactivated: number;
  invalid: number;
  onboardingEmailsQueued: number;
  received: number;
  updated: number;
  valid: number;
}

export interface StudentBulkIngestionResult {
  commitRequested: boolean;
  committed: boolean;
  deactivateMissing: boolean;
  rows: StudentBulkIngestionRowResult[];
  summary: StudentBulkIngestionSummary;
}

export type InterventionActionType =
  | "ASSIGN_REMEDIAL_TEST"
  | "SEND_ALERT"
  | "TRACK_OUTCOME"
  | "LIST_ACTIONS";

export type InterventionOutcomeStatus =
  | "pending"
  | "improving"
  | "no_change"
  | "escalated"
  | "resolved";

export interface AdminInterventionRequest {
  instituteId: string;
  yearId: string;
  actionType: InterventionActionType;
  studentId?: string;
  remedialTestId?: string;
  alertMessage?: string;
  outcomeStatus?: InterventionOutcomeStatus;
  outcomeNotes?: string;
  limit?: number;
}

export interface InterventionActionRecord {
  interventionId: string;
  actionType: InterventionActionType;
  instituteId: string;
  yearId: string;
  studentId?: string;
  studentName?: string;
  riskCluster?: string;
  remedialTestId?: string;
  alertMessage?: string;
  outcomeStatus?: InterventionOutcomeStatus;
  outcomeNotes?: string;
  auditId?: string;
  auditPath?: string;
  timestamp: string;
}

export interface AdminInterventionResult {
  mode: "action" | "list";
  action?: InterventionActionRecord;
  actions: InterventionActionRecord[];
}

export type QuestionAssetKind =
  | "questionImage"
  | "solutionImage"
  | "solutionPdf";

export type QuestionAssetExtension = "png" | "webp" | "pdf";

export interface QuestionAssetUploadRequest {
  assetKind: QuestionAssetKind;
  contentBase64: string;
  extension: QuestionAssetExtension;
  instituteId: string;
  questionId: string;
  version: number;
}

export interface QuestionAssetUploadResult {
  assetKind: QuestionAssetKind;
  cdnPath: string;
  contentType: string;
  previewSignedUrl: string;
  questionId: string;
  uploaded: true;
  version: number;
}

export interface AdminQuestionLibraryRecord {
  academicYear: string;
  additionalTag: string;
  chapter: string;
  correctAnswer: string;
  difficulty: "easy" | "medium" | "hard";
  examType: string;
  id: string;
  internalNotes: string;
  lastUsedDate: string | null;
  marks: number;
  negativeMarks: number;
  primaryTag: string;
  prompt: string;
  questionImageFile: string;
  questionImagePreviewUrl: string;
  questionType: string;
  secondaryTag: string;
  simulationLink: string;
  solutionImageFile: string;
  solutionImagePreviewUrl: string;
  status: "active" | "used" | "archived" | "deprecated";
  subject: string;
  thermalState: "hot" | "warm" | "cold";
  topic: string;
  tutorialVideoLink: string;
  uniqueKey: string;
  usedCount: number;
  version: number;
}

export interface AdminQuestionLibraryResult {
  questions: AdminQuestionLibraryRecord[];
}

export interface QuestionBulkUploadQuestionInput {
  chapter?: string;
  correctAnswer?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  examType?: string;
  marks?: number | string;
  negativeMarks?: number | string;
  parentQuestionId?: string | null;
  questionId?: string;
  questionImageUrl?: string;
  questionTextKeywords?: string[] | string;
  questionType?: string;
  simulationLink?: string | null;
  solutionImageUrl?: string;
  status?: "active" | "used" | "archived" | "deprecated";
  subject?: string;
  tags?: string[] | string;
  tutorialVideoLink?: string | null;
  uniqueKey?: string;
  version?: number | string;
}

export interface QuestionBulkUploadRequest {
  commit?: boolean;
  csvContent?: string;
  instituteId: string;
  questions?: QuestionBulkUploadQuestionInput[];
}

export type QuestionBulkUploadRowAction = "create" | "update" | "none";

export interface QuestionBulkUploadRowResult {
  action: QuestionBulkUploadRowAction;
  errors: string[];
  questionId: string | null;
  rowNumber: number;
  uniqueKey: string | null;
  version: number;
  warnings: string[];
}

export interface QuestionBulkUploadSummary {
  created: number;
  invalid: number;
  received: number;
  updated: number;
  valid: number;
  warnings: number;
}

export interface QuestionBulkUploadResult {
  commitRequested: boolean;
  committed: boolean;
  rows: QuestionBulkUploadRowResult[];
  summary: QuestionBulkUploadSummary;
  uploadLogId: string | null;
  uploadLogPath: string | null;
}

export type AdminTestTemplateStatus =
  | "draft"
  | "ready"
  | "assigned"
  | "archived"
  | "deprecated";

export type AdminTestSelectionMethod =
  | "manual"
  | "shuffle_slice"
  | "offset_limit"
  | "round_robin"
  | "upload_set";

export interface AdminTestDifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

export interface AdminTestTimingWindow {
  minSeconds: number;
  recommendedSeconds: number;
  maxSeconds: number;
}

export interface AdminTestTimingProfile {
  easy: AdminTestTimingWindow;
  medium: AdminTestTimingWindow;
  hard: AdminTestTimingWindow;
}

export interface AdminTestExamSnapshot {
  defaultDurationMinutes: number;
  difficultyTimingMapping: AdminTestTimingProfile;
  markingScheme: string;
  sectionStructure: string[];
}

export interface AdminTestPhaseSplitRow {
  difficulty: "easy" | "medium" | "hard";
  focus: string;
  load: number;
  minutes: number;
  phase: string;
  percent: number;
  questionCount: number;
  weight: number;
}

export interface AdminTestPhaseConfigSnapshot {
  difficultyWeights: {
    easy: number;
    medium: number;
    hard: number;
  };
  phaseSplit: AdminTestPhaseSplitRow[];
  totalLoad: number;
}

export interface AdminTestTemplateRecord {
  id: string;
  canonicalId: string;
  templateName: string;
  examType: string;
  examSnapshot: AdminTestExamSnapshot;
  phaseConfigSnapshot: AdminTestPhaseConfigSnapshot;
  selectionMethod: AdminTestSelectionMethod;
  totalDurationMinutes: number;
  selectedQuestionIds: string[];
  difficultyDistribution: AdminTestDifficultyDistribution;
  timingProfile: AdminTestTimingProfile;
  status: AdminTestTemplateStatus;
  totalRuns: number;
  updatedAt: string;
  version: number;
}

export interface AdminTestTemplateCreateRequest {
  canonicalId: string;
  difficultyDistribution: AdminTestDifficultyDistribution;
  examType: string;
  examSnapshot: AdminTestExamSnapshot;
  phaseConfigSnapshot: AdminTestPhaseConfigSnapshot;
  questionIds: string[];
  selectionMethod: AdminTestSelectionMethod;
  templateName: string;
  timingProfile: AdminTestTimingProfile;
  totalDurationMinutes: number;
}

export type AdminTestTemplateListResult = AdminTestTemplateRecord[];

export interface AdminTestTemplateCreateResult {
  template: AdminTestTemplateRecord;
}

export interface AdminTestTemplateUpdateRequest {
  canonicalId: string;
  difficultyDistribution: AdminTestDifficultyDistribution;
  examType: string;
  examSnapshot: AdminTestExamSnapshot;
  expectedVersion: number;
  phaseConfigSnapshot: AdminTestPhaseConfigSnapshot;
  questionIds: string[];
  selectionMethod: AdminTestSelectionMethod;
  templateName: string;
  timingProfile: AdminTestTimingProfile;
  totalDurationMinutes: number;
}

export interface AdminTestTemplateUpdateResult {
  template: AdminTestTemplateRecord;
}

export interface AdminTestTemplateLifecycleRequest {
  expectedVersion: number;
}

export interface AdminTestTemplateLifecycleResult {
  auditId: string;
  auditPath: string;
  template: AdminTestTemplateRecord;
}

export type AdminRunMode =
  | "Operational"
  | "Diagnostic"
  | "Controlled"
  | "Hard";

export type AdminRunStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "stopped"
  | "cancelled";

export interface AdminRunProctoringPolicy {
  browserIntegrityGuardEnabled: boolean;
  faceIdentityGazeGuardEnabled: boolean;
}

export interface AdminRunCreateRequest {
  academicYear: string;
  attemptLimit: number;
  endWindow: string;
  expectedTemplateVersion: number;
  gracePeriodMinutes: number;
  idempotencyKey: string;
  mode: AdminRunMode;
  proctoringPolicy: AdminRunProctoringPolicy;
  recipientStudentIds: string[];
  shuffleQuestionOrder: boolean;
  startWindow: string;
  testId: string;
  timezone: string;
}

export interface AdminRunRecord {
  academicYear: string;
  attemptLimit: number;
  canonicalId: string;
  createdAt: string;
  endWindow: string;
  gracePeriodMinutes: number;
  id: string;
  mode: AdminRunMode;
  proctoringPolicy: AdminRunProctoringPolicy;
  recipientCount: number;
  recipientStudentIds: string[];
  runPath: string;
  shuffleQuestionOrder: boolean;
  startWindow: string;
  status: AdminRunStatus;
  templateVersion: number;
  testId: string;
  timezone: string;
}

export interface AdminRunCreateResult {
  disposition: "created" | "replayed";
  run: AdminRunRecord;
}

export interface AdminRunListResult {
  nextCursor: string | null;
  runs: AdminRunRecord[];
}

export interface AdminRunDetailResult {
  run: AdminRunRecord;
}

export type StudentLicenseLayer = "L0" | "L1" | "L2" | "L3";

export type StudentRiskState = "low" | "medium" | "high" | "critical";

export interface StudentDashboardTrendPoint {
  label: string;
  value: number;
}

export interface StudentDashboardUpcomingTest {
  runId: string;
  testName: string;
  mode: AdminRunMode;
  startAt: string;
  endAt: string;
  durationMinutes: number;
}

export interface StudentDashboardRecentResult {
  runId: string;
  testName: string;
  completedAt: string;
  rawScorePercent: number;
  accuracyPercent: number;
}

export interface StudentDashboardResult {
  licenseLayer: StudentLicenseLayer;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  batchRank: number | null;
  disciplineIndex: number;
  testsAttempted: number;
  riskState: StudentRiskState;
  phaseAdherencePercent: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  timeMisallocationPercent: number;
  behaviorSummaryTag: string;
  controlledModeImprovementDeltaPercent: number;
  guessProbabilityPercent: number;
  executionStabilityFlag: string;
  phaseComplianceMiniTrend: StudentDashboardTrendPoint[];
  upcomingTests: StudentDashboardUpcomingTest[];
  recentResults: StudentDashboardRecentResult[];
}

export type StudentTestStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "archived";

export interface StudentTestRecord {
  testId: string;
  runId: string;
  sessionId: string | null;
  testName: string;
  status: StudentTestStatus;
  mode: AdminRunMode;
  startWindow: string;
  endWindow: string;
  durationMinutes: number;
  rawScorePercent: number | null;
  accuracyPercent: number | null;
  timeUsedMinutes: number | null;
  rankInBatch: number | null;
  completedAt: string | null;
  sessionLink: string | null;
  academicYear: string;
  currentAcademicYear: boolean;
  archivedSummary: string | null;
  summaryPdfUrl: string | null;
  attemptStatusLabel: string | null;
  attemptedQuestions: number | null;
  totalQuestions: number | null;
  flaggedQuestions: number | null;
}

export interface StudentTestsResult {
  tests: StudentTestRecord[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export type StudentExamLaunchIntent = "start" | "resume";

export type StudentExamLaunchDisposition =
  | "created"
  | "replayed"
  | "resumed";

export type StudentExamSessionStatus =
  | "created"
  | "started"
  | "active";

export interface StudentExamLaunchRequest {
  intent: StudentExamLaunchIntent;
  runId: string;
}

export interface StudentExamLaunchResult {
  disposition: StudentExamLaunchDisposition;
  examUrl: string;
  launchCredential: string;
  sessionId: string;
  status: StudentExamSessionStatus;
}

export type StudentPerformanceRiskState =
  | "Stable"
  | "Improving"
  | "Building Discipline";

export interface StudentPerformancePoint {
  runId: string;
  runLabel: string;
  completedAt: string;
  riskState: StudentPerformanceRiskState;
  timeAllocationBalancePercent: number;
  rawScorePercent: number;
  accuracyPercent: number;
  phaseAdherencePercent: number;
  guessRatePercent: number;
  disciplineIndex: number;
  minTimeViolationPercent: number;
  maxTimeViolationPercent: number;
  overstayFrequencyPercent: number;
  timeSpentMinutes: number;
  rankInBatch: number | null;
}

export interface StudentTopicPerformanceEntry {
  topic: string;
  rawScorePercent: number;
  accuracyPercent: number;
}

export interface StudentControlledModeComparison {
  baselineLabel: string;
  currentLabel: string;
  phaseAdherenceDeltaPercent: number;
  disciplineIndexDeltaPercent: number;
  minTimeViolationDeltaPercent: number;
  maxTimeViolationDeltaPercent: number;
  guessRateDeltaPercent: number;
}

export interface StudentPerformanceResult {
  licenseLayer: StudentLicenseLayer;
  disciplineIndex: number;
  phaseCompliancePercent: number;
  controlledModeImprovementPercent: number;
  overstayFrequencyPercent: number;
  guessProbabilityPercent: number;
  guessProbabilityCluster: "Low" | "Medium" | "High";
  easyNeglectFrequencyPercent: number;
  hardBiasFrequencyPercent: number;
  timeAllocationBalancePercent: number;
  controlledModeComparison: StudentControlledModeComparison;
  timeline: StudentPerformancePoint[];
  topicPerformanceBreakdown: StudentTopicPerformanceEntry[];
}

export type StudentInsightPattern =
  | "Easy Neglect"
  | "Guess Detection"
  | "Late-Phase Drop"
  | "Rushed Pattern"
  | "Skip Burst"
  | "No Pattern Yet";

export interface StudentInsightSnapshot {
  snapshotId: string;
  generatedAt: string;
  rawScorePercent: number;
  accuracyPercent: number;
  easyNeglectFrequencyPercent: number;
  guessDetectionPercent: number;
  latePhaseDropPercent: number;
  rushedPatternFrequencyPercent: number;
  skipBurstFrequencyPercent: number;
  dominantPattern: StudentInsightPattern;
}

export interface StudentTopicWeaknessInsight {
  topic: string;
  weaknessPercent: number;
  feedback: string;
  tutorialVideoLink: string | null;
  simulationLink: string | null;
}

export interface StudentInsightsResult {
  licenseLayer: StudentLicenseLayer;
  mostFrequentBehaviorPattern: StudentInsightPattern;
  topicWeaknessSummary: StudentTopicWeaknessInsight[];
  latePhaseDropIndicatorPercent: number;
  rushedPatternFrequencyPercent: number;
  skipBurstIndicatorPercent: number;
  guessDetectionAlertPercent: number;
  phaseAdherenceFeedback: string;
  disciplineImprovementSuggestions: string[];
  archivedSummaryOnlyCount: number;
  currentYearSolutionAccessOnly: true;
  snapshots: StudentInsightSnapshot[];
}

export interface StudentSolutionItem {
  questionId: string;
  questionImageUrl: string;
  solutionImageUrl: string;
  correctAnswer: string;
  studentAnswer: string;
  tutorialVideoLink: string | null;
  simulationLink: string | null;
}

export interface StudentSolutionsResult {
  hasMore: boolean;
  items: StudentSolutionItem[];
  page: number;
  pageSize: number;
  releasedAt: string;
  runId: string;
  testId: string;
  total: number;
}

export interface VendorCalibrationPushRequest {
  targetInstitutes: string[];
  versionId: string;
}

export interface DeployedInstituteCalibrationResult {
  calibrationPath: string;
  calibrationHistoryPath: string;
  instituteId: string;
  licensePath: string;
  compatibilityLicensePath: string;
}

export interface DeployCalibrationVersionResult {
  calibrationSourcePath: string;
  deployedInstituteCount: number;
  deployedInstitutes: DeployedInstituteCalibrationResult[];
  deploymentLogId: string;
  vendorCalibrationLogPath: string;
  versionId: string;
}
