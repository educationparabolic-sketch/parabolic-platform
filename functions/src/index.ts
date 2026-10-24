import {guardHttpExport} from "./api/httpExportGuard";
import {handleExamSessionIntegrityEventsRequest} from "./api/examSessionIntegrityEvents";
import {handleStudentProfileRequest, handleAdminStudentIdentityPhotoMediaRequest,
  handleExamSessionIdentityStatusRequest} from "./api/studentProfile";
import * as functions from "firebase-functions";
import {handleApiV1Request} from "./api/apiGateway";
import {
  handleAdminAssignmentOperationsRequest,
} from "./api/adminAssignmentOperations";
import {sendErrorResponse} from "./services/apiResponse";
import {registerGlobalErrorHandlers} from "./services/errorReporting";
import {createRequestLogger} from "./services/logging";
import {handleExamStartRequest} from "./api/examStart";
import {handleExamSessionActivateRequest} from "./api/examSessionActivate";
import {handleExamSessionAnswersRequest} from "./api/examSessionAnswers";
import {handleExamSessionEntryRequest} from "./api/examSessionEntry";
import {handleExamSessionSubmitRequest} from "./api/examSessionSubmit";
import {handleInternalEmailQueueRequest} from "./api/internalEmailQueue";
import {
  handleVendorSimulationEnvironmentRequest,
} from "./api/vendorSimulationEnvironment";
import {
  handleVendorSimulationStudentsRequest,
} from "./api/vendorSimulationStudents";
import {
  handleVendorSimulationSessionsRequest,
} from "./api/vendorSimulationSessions";
import {
  handleVendorSimulationLoadRequest,
} from "./api/vendorSimulationLoad";
import {
  handleVendorSimulationValidationRequest,
} from "./api/vendorSimulationValidation";
import {
  handleVendorIntelligenceInitializeRequest,
} from "./api/vendorIntelligenceInitialize";
import {
  handleVendorRevenueAnalyticsRequest,
} from "./api/vendorRevenueAnalytics";
import {
  handleVendorLayerDistributionRequest,
} from "./api/vendorLayerDistribution";
import {
  handleVendorChurnTrackingRequest,
} from "./api/vendorChurnTracking";
import {
  handleVendorRevenueForecastingRequest,
} from "./api/vendorRevenueForecasting";
import {
  handleVendorLicenseUpdateRequest,
} from "./api/vendorLicenseUpdate";
import {
  handleVendorCalibrationPushRequest,
} from "./api/vendorCalibrationPush";
import {handleVendorCalibrationVersionsRequest} from "./api/vendorCalibrationVersions";
import {handleVendorCalibrationOperationsRequest} from "./api/vendorCalibrationOperations";
import {handleVendorAuditEventsRequest} from "./api/vendorAuditEvents";
import {handleVendorSystemHealthRequest} from "./api/vendorSystemHealth";
import {
  handleVendorCalibrationSimulationRequest,
} from "./api/vendorCalibrationSimulation";
import {
  handleStripeWebhookRequest,
} from "./api/stripeWebhook";
import {
  handleAdminGovernanceTransportRequest,
} from "./api/adminGovernanceTransport";
import {
  handleAdminInterventionMutationRequest,
  handleAdminInterventionTimelineRequest,
} from "./api/adminInterventionRecommendations";
import {
  handleAdminAcademicYearArchiveRequest,
} from "./api/adminAcademicYearArchive";
import {
  handleAdminStudentDataExportRequest,
} from "./api/adminStudentDataExport";
import {
  handleAdminStudentSoftDeleteRequest,
} from "./api/adminStudentSoftDelete";
import {
  handleAdminStudentsBulkRequest,
} from "./api/adminStudentsBulk";
import {
  handleAdminStudentsRequest,
} from "./api/adminStudents";
import {
  handleAdminStudentOnboardingResendRequest,
} from "./api/adminStudentOnboardingResend";
import {
  handleAdminStudentMutationsRequest,
} from "./api/adminStudentMutations";
import {
  handleAdminRunsRequest,
} from "./api/adminRuns";
import {
  handleStudentDashboardRequest,
} from "./api/studentDashboard";
import {
  handleStudentInsightsRequest,
} from "./api/studentInsights";
import {
  handleStudentPerformanceRequest,
} from "./api/studentPerformance";
import {
  handleStudentSolutionsRequest,
} from "./api/studentSolutions";
import {
  handleStudentTestsRequest,
} from "./api/studentTests";
import {
  handleAdminQuestionAssetsRequest,
} from "./api/adminQuestionAssets";
import {
  handleAdminQuestionLibraryRequest,
} from "./api/adminQuestionLibrary";
import {
  handleAdminQuestionUploadLogsRequest,
} from "./api/adminQuestionUploadLogs";
import {
  handleAdminQuestionDistributionRequest,
} from "./api/adminQuestionDistribution";
import {
  handleAdminQuestionsBulkRequest,
} from "./api/adminQuestionsBulk";
import {
  handleAdminQuestionTagsRequest,
} from "./api/adminQuestionTags";
import {
  handleAdminQuestionMutationsRequest,
} from "./api/adminQuestionMutations";
import {
  handleAdminQuestionPackagesRequest,
} from "./api/adminQuestionPackages";
import {
  handleAdminSettingsRequest,
} from "./api/adminSettings";
import {
  handleAdminLicensingRequest,
} from "./api/adminLicensing";
import {handleAdminSupportRequest} from "./api/adminSupport";
import {handleVendorSupportRequest} from "./api/vendorSupport";
import {handleVendorInstitutesRequest} from "./api/vendorInstitutes";
import {handleVendorCommercialRequest} from "./api/vendorCommercial";
import {
  handleAdminAnalyticsRequest,
} from "./api/adminAnalytics";
import {
  handleAdminOverviewRequest,
} from "./api/adminOverview";
import {
  handleAdminTestsRequest,
} from "./api/adminTests";
import {runAssignmentOnCreate} from "./triggers/assignmentCreation";
import {
  questionBankOnCreate,
  questionBankOnUpdate,
} from "./triggers/questionIngestion";
import {
  questionDistributionOnAnalyticsWrite,
  questionDistributionOnQuestionWrite,
  questionUsageOnTemplateWrite,
} from "./triggers/questionReadProjections";
import {examSessionOnUpdate} from "./triggers/sessionSubmission";
import {instituteStudentOnWrite} from "./triggers/studentUsageMetering";
import {studentYearMetricsOnWrite} from "./triggers/studentYearMetrics";
import {testTemplateOnCreate} from "./triggers/templateCreation";
import {governanceSnapshotMonthly} from "./triggers/governanceSnapshot";
import {billingSnapshotMonthly} from "./triggers/billingSnapshot";
import {dataRetentionPolicyDaily} from "./triggers/dataRetentionPolicy";
import {
  supportAttachmentCleanupDaily,
} from "./triggers/supportAttachmentCleanup";
import {studentIdentityPhotoCleanupEvery15Minutes} from "./triggers/studentIdentityPhotoCleanup";
import {processEmailQueue} from "./triggers/emailQueue";
import {
  failureRecoveryDispatch,
  failureRecoveryRetrySweep,
} from "./triggers/failureRecovery";
import {
  claimPropagationSweepEveryMinute,
} from "./triggers/claimPropagation";
import {systemEventTopologyService} from "./services/systemEventTopology";
import {loadEnvironmentConfig} from "./utils/environment";

registerGlobalErrorHandlers();
systemEventTopologyService.assertTopologyInvariants();

export {questionBankOnCreate};
export {questionBankOnUpdate};
export {questionDistributionOnAnalyticsWrite};
export {questionDistributionOnQuestionWrite};
export {questionUsageOnTemplateWrite};
export {runAssignmentOnCreate};
export {examSessionOnUpdate};
export {instituteStudentOnWrite};
export {studentYearMetricsOnWrite};
export {testTemplateOnCreate};
export {governanceSnapshotMonthly};
export {billingSnapshotMonthly};
export {dataRetentionPolicyDaily};
export {supportAttachmentCleanupDaily};
export {studentIdentityPhotoCleanupEvery15Minutes};
export {processEmailQueue};
export {failureRecoveryDispatch};
export {failureRecoveryRetrySweep};
export {claimPropagationSweepEveryMinute};
export const apiV1 = functions.https.onRequest(
  guardHttpExport("apiV1", handleApiV1Request),
);
export const examStart = functions.https.onRequest(
  guardHttpExport("examStart", handleExamStartRequest),
);
export const examSessionIntegrityEvents = functions.https.onRequest(
  guardHttpExport("examSessionIntegrityEvents", handleExamSessionIntegrityEventsRequest),
);
export const examSessionActivate = functions.https.onRequest(
  guardHttpExport("examSessionActivate", handleExamSessionActivateRequest),
);
export const examSessionAnswers = functions.https.onRequest(
  guardHttpExport("examSessionAnswers", handleExamSessionAnswersRequest),
);
export const examSessionEntry = functions.https.onRequest(
  guardHttpExport("examSessionEntry", handleExamSessionEntryRequest),
);
export const examSessionSubmit = functions.https.onRequest(
  guardHttpExport("examSessionSubmit", handleExamSessionSubmitRequest),
);
export const internalEmailQueue = functions.https.onRequest(
  guardHttpExport("internalEmailQueue", handleInternalEmailQueueRequest),
);
export const vendorSimulationEnvironment = functions.https.onRequest(
  guardHttpExport("vendorSimulationEnvironment", handleVendorSimulationEnvironmentRequest),
);
export const vendorSimulationStudents = functions.https.onRequest(
  guardHttpExport("vendorSimulationStudents", handleVendorSimulationStudentsRequest),
);
export const vendorSimulationSessions = functions.https.onRequest(
  guardHttpExport("vendorSimulationSessions", handleVendorSimulationSessionsRequest),
);
export const vendorSimulationLoad = functions.https.onRequest(
  guardHttpExport("vendorSimulationLoad", handleVendorSimulationLoadRequest),
);
export const vendorSimulationValidation = functions.https.onRequest(
  guardHttpExport("vendorSimulationValidation", handleVendorSimulationValidationRequest),
);
export const vendorIntelligenceInitialize = functions.https.onRequest(
  guardHttpExport("vendorIntelligenceInitialize", handleVendorIntelligenceInitializeRequest),
);
export const vendorRevenueAnalytics = functions.https.onRequest(
  guardHttpExport("vendorRevenueAnalytics", handleVendorRevenueAnalyticsRequest),
);
export const vendorLayerDistribution = functions.https.onRequest(
  guardHttpExport("vendorLayerDistribution", handleVendorLayerDistributionRequest),
);
export const vendorChurnTracking = functions.https.onRequest(
  guardHttpExport("vendorChurnTracking", handleVendorChurnTrackingRequest),
);
export const vendorRevenueForecasting = functions.https.onRequest(
  guardHttpExport("vendorRevenueForecasting", handleVendorRevenueForecastingRequest),
);
export const vendorLicenseUpdate = functions.https.onRequest(
  guardHttpExport("vendorLicenseUpdate", handleVendorLicenseUpdateRequest),
);
export const vendorCalibrationPush = functions.https.onRequest(
  guardHttpExport("vendorCalibrationPush", handleVendorCalibrationPushRequest),
);
export const vendorCalibrationVersions = functions.https.onRequest(
  guardHttpExport("vendorCalibrationVersions", handleVendorCalibrationVersionsRequest),
);
export const vendorCalibrationOperations = functions.https.onRequest(
  guardHttpExport("vendorCalibrationOperations", handleVendorCalibrationOperationsRequest),
);
export const vendorAuditEvents = functions.https.onRequest(
  guardHttpExport("vendorAuditEvents", handleVendorAuditEventsRequest),
);
export const vendorSystemHealth = functions.https.onRequest(
  guardHttpExport("vendorSystemHealth", handleVendorSystemHealthRequest),
);
export const vendorCalibrationSimulation = functions.https.onRequest(
  guardHttpExport("vendorCalibrationSimulation", handleVendorCalibrationSimulationRequest),
);
export const stripeWebhook = functions.https.onRequest(
  guardHttpExport("stripeWebhook", handleStripeWebhookRequest),
);
export const adminGovernanceTransport = functions.https.onRequest(
  guardHttpExport("adminGovernanceTransport", handleAdminGovernanceTransportRequest),
);
export const adminInterventionTimeline = functions.https.onRequest(
  guardHttpExport("adminInterventionTimeline", handleAdminInterventionTimelineRequest),
);
export const adminInterventionMutation = functions.https.onRequest(
  guardHttpExport("adminInterventionMutation", handleAdminInterventionMutationRequest),
);
export const adminAnalytics = functions.https.onRequest(
  guardHttpExport("adminAnalytics", handleAdminAnalyticsRequest),
);
export const adminAcademicYearArchive = functions.https.onRequest(
  guardHttpExport("adminAcademicYearArchive", handleAdminAcademicYearArchiveRequest),
);
export const adminStudentDataExport = functions.https.onRequest(
  guardHttpExport("adminStudentDataExport", handleAdminStudentDataExportRequest),
);
export const adminStudentSoftDelete = functions.https.onRequest(
  guardHttpExport("adminStudentSoftDelete", handleAdminStudentSoftDeleteRequest),
);
export const adminStudentsBulk = functions.https.onRequest(
  guardHttpExport("adminStudentsBulk", handleAdminStudentsBulkRequest),
);
export const adminStudents = functions.https.onRequest(
  guardHttpExport("adminStudents", handleAdminStudentsRequest),
);
export const adminStudentOnboardingResend = functions.https.onRequest(
  guardHttpExport("adminStudentOnboardingResend", handleAdminStudentOnboardingResendRequest),
);
export const adminStudentMutations = functions.https.onRequest(
  guardHttpExport("adminStudentMutations", handleAdminStudentMutationsRequest),
);
export const adminRuns = functions.https.onRequest(
  guardHttpExport("adminRuns", handleAdminRunsRequest),
);
export const adminAssignmentOperations = functions.https.onRequest(
  guardHttpExport("adminAssignmentOperations", handleAdminAssignmentOperationsRequest),
);
export const studentDashboard = functions.https.onRequest(
  guardHttpExport("studentDashboard", handleStudentDashboardRequest),
);
export const studentPerformance = functions.https.onRequest(
  guardHttpExport("studentPerformance", handleStudentPerformanceRequest),
);
export const studentInsights = functions.https.onRequest(
  guardHttpExport("studentInsights", handleStudentInsightsRequest),
);
export const studentSolutions = functions.https.onRequest(
  guardHttpExport("studentSolutions", handleStudentSolutionsRequest),
);
export const studentTests = functions.https.onRequest(
  guardHttpExport("studentTests", handleStudentTestsRequest),
);
export const adminQuestionAssets = functions.https.onRequest(
  guardHttpExport("adminQuestionAssets", handleAdminQuestionAssetsRequest),
);
export const adminQuestionLibrary = functions.https.onRequest(
  guardHttpExport("adminQuestionLibrary", handleAdminQuestionLibraryRequest),
);
export const adminQuestionUploadLogs = functions.https.onRequest(
  guardHttpExport("adminQuestionUploadLogs", handleAdminQuestionUploadLogsRequest),
);
export const adminQuestionDistribution = functions.https.onRequest(
  guardHttpExport("adminQuestionDistribution", handleAdminQuestionDistributionRequest),
);
export const adminQuestionsBulk = functions.https.onRequest(
  guardHttpExport("adminQuestionsBulk", handleAdminQuestionsBulkRequest),
);
export const adminQuestionTags = functions.https.onRequest(
  guardHttpExport("adminQuestionTags", handleAdminQuestionTagsRequest),
);
export const adminQuestionMutations = functions.https.onRequest(
  guardHttpExport("adminQuestionMutations", handleAdminQuestionMutationsRequest),
);
export const adminQuestionPackages = functions.https.onRequest(
  guardHttpExport("adminQuestionPackages", handleAdminQuestionPackagesRequest),
);
export const adminSettings = functions.https.onRequest(
  guardHttpExport("adminSettings", handleAdminSettingsRequest),
);
export const adminLicensing = functions.https.onRequest(
  guardHttpExport("adminLicensing", handleAdminLicensingRequest),
);
export const adminSupport = functions.https.onRequest(
  guardHttpExport("adminSupport", handleAdminSupportRequest),
);
export const vendorSupport = functions.https.onRequest(
  guardHttpExport("vendorSupport", handleVendorSupportRequest),
);
export const vendorInstitutes = functions.https.onRequest(
  guardHttpExport("vendorInstitutes", handleVendorInstitutesRequest),
);
export const vendorCommercial = functions.https.onRequest(
  guardHttpExport("vendorCommercial", handleVendorCommercialRequest),
);
export const adminOverview = functions.https.onRequest(
  guardHttpExport("adminOverview", handleAdminOverviewRequest),
);
export const adminTests = functions.https.onRequest(
  guardHttpExport("adminTests", handleAdminTestsRequest),
);

export const helloWorld = functions.https.onRequest(guardHttpExport("helloWorld", async (
  req: functions.https.Request,
  res: functions.Response,
) => {
  const logger = createRequestLogger("helloWorldApi", req);
  const startedAt = Date.now();

  try {
    const environmentConfig = await loadEnvironmentConfig();

    const message =
      "Parabolic Platform backend is running in " +
      `${environmentConfig.nodeEnv} mode for ` +
      `${environmentConfig.projectId}.`;

    logger.info("Health check request completed", {
      durationMs: Date.now() - startedAt,
      projectId: environmentConfig.projectId,
    });

    res.send(message);
  } catch (error) {
    logger.error("Health check request failed", {error});
    sendErrorResponse(
      res,
      logger.getRequestId(),
      "INTERNAL_ERROR",
      "Failed to load runtime configuration.",
    );
  }
}));

export const studentProfile = functions.https.onRequest(
  guardHttpExport("studentProfile", handleStudentProfileRequest),
);
export const adminStudentIdentityPhotoMedia = functions.https.onRequest(
  guardHttpExport("adminStudentIdentityPhotoMedia", handleAdminStudentIdentityPhotoMediaRequest),
);
export const examSessionIdentityStatus = functions.https.onRequest(
  guardHttpExport("examSessionIdentityStatus", handleExamSessionIdentityStatusRequest),
);
