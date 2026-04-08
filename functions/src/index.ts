import * as functions from "firebase-functions";
import {sendErrorResponse} from "./services/apiResponse";
import {registerGlobalErrorHandlers} from "./services/errorReporting";
import {createRequestLogger} from "./services/logging";
import {handleExamStartRequest} from "./api/examStart";
import {handleExamSessionAnswersRequest} from "./api/examSessionAnswers";
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
import {
  handleVendorCalibrationSimulationRequest,
} from "./api/vendorCalibrationSimulation";
import {
  handleStripeWebhookRequest,
} from "./api/stripeWebhook";
import {
  handleAdminGovernanceSnapshotsRequest,
} from "./api/adminGovernanceSnapshots";
import {
  handleAdminGovernanceReportsRequest,
} from "./api/adminGovernanceReports";
import {
  handleAdminAcademicYearArchiveRequest,
} from "./api/adminAcademicYearArchive";
import {
  handleAdminStudentDataExportRequest,
} from "./api/adminStudentDataExport";
import {
  handleAdminStudentSoftDeleteRequest,
} from "./api/adminStudentSoftDelete";
import {runAssignmentOnCreate} from "./triggers/assignmentCreation";
import {
  questionBankOnCreate,
  questionBankOnUpdate,
} from "./triggers/questionIngestion";
import {examSessionOnUpdate} from "./triggers/sessionSubmission";
import {instituteStudentOnWrite} from "./triggers/studentUsageMetering";
import {studentYearMetricsOnWrite} from "./triggers/studentYearMetrics";
import {testTemplateOnCreate} from "./triggers/templateCreation";
import {governanceSnapshotMonthly} from "./triggers/governanceSnapshot";
import {billingSnapshotMonthly} from "./triggers/billingSnapshot";
import {dataRetentionPolicyDaily} from "./triggers/dataRetentionPolicy";
import {
  failureRecoveryDispatch,
  failureRecoveryRetrySweep,
} from "./triggers/failureRecovery";
import {systemEventTopologyService} from "./services/systemEventTopology";
import {loadEnvironmentConfig} from "./utils/environment";

registerGlobalErrorHandlers();
systemEventTopologyService.assertTopologyInvariants();

export {questionBankOnCreate};
export {questionBankOnUpdate};
export {runAssignmentOnCreate};
export {examSessionOnUpdate};
export {instituteStudentOnWrite};
export {studentYearMetricsOnWrite};
export {testTemplateOnCreate};
export {governanceSnapshotMonthly};
export {billingSnapshotMonthly};
export {dataRetentionPolicyDaily};
export {failureRecoveryDispatch};
export {failureRecoveryRetrySweep};
export const examStart = functions.https.onRequest(handleExamStartRequest);
export const examSessionAnswers = functions.https.onRequest(
  handleExamSessionAnswersRequest,
);
export const examSessionSubmit = functions.https.onRequest(
  handleExamSessionSubmitRequest,
);
export const internalEmailQueue = functions.https.onRequest(
  handleInternalEmailQueueRequest,
);
export const vendorSimulationEnvironment = functions.https.onRequest(
  handleVendorSimulationEnvironmentRequest,
);
export const vendorSimulationStudents = functions.https.onRequest(
  handleVendorSimulationStudentsRequest,
);
export const vendorSimulationSessions = functions.https.onRequest(
  handleVendorSimulationSessionsRequest,
);
export const vendorSimulationLoad = functions.https.onRequest(
  handleVendorSimulationLoadRequest,
);
export const vendorSimulationValidation = functions.https.onRequest(
  handleVendorSimulationValidationRequest,
);
export const vendorIntelligenceInitialize = functions.https.onRequest(
  handleVendorIntelligenceInitializeRequest,
);
export const vendorRevenueAnalytics = functions.https.onRequest(
  handleVendorRevenueAnalyticsRequest,
);
export const vendorLayerDistribution = functions.https.onRequest(
  handleVendorLayerDistributionRequest,
);
export const vendorChurnTracking = functions.https.onRequest(
  handleVendorChurnTrackingRequest,
);
export const vendorRevenueForecasting = functions.https.onRequest(
  handleVendorRevenueForecastingRequest,
);
export const vendorLicenseUpdate = functions.https.onRequest(
  handleVendorLicenseUpdateRequest,
);
export const vendorCalibrationPush = functions.https.onRequest(
  handleVendorCalibrationPushRequest,
);
export const vendorCalibrationSimulation = functions.https.onRequest(
  handleVendorCalibrationSimulationRequest,
);
export const stripeWebhook = functions.https.onRequest(
  handleStripeWebhookRequest,
);
export const adminGovernanceSnapshots = functions.https.onRequest(
  handleAdminGovernanceSnapshotsRequest,
);
export const adminGovernanceReports = functions.https.onRequest(
  handleAdminGovernanceReportsRequest,
);
export const adminAcademicYearArchive = functions.https.onRequest(
  handleAdminAcademicYearArchiveRequest,
);
export const adminStudentDataExport = functions.https.onRequest(
  handleAdminStudentDataExportRequest,
);
export const adminStudentSoftDelete = functions.https.onRequest(
  handleAdminStudentSoftDeleteRequest,
);

export const helloWorld = functions.https.onRequest(async (
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
});
