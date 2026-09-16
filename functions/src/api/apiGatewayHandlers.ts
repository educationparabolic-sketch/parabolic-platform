import * as functions from "firebase-functions";
import {
  handleAdminAssignmentOperationsRequest,
} from "./adminAssignmentOperations";
import {
  handleAdminAcademicYearArchiveRequest,
} from "./adminAcademicYearArchive";
import {handleAdminAnalyticsRequest} from "./adminAnalytics";
import {
  handleAdminGovernanceSnapshotsRequest,
} from "./adminGovernanceSnapshots";
import {handleAdminInterventionsRequest} from "./adminInterventions";
import {handleAdminLicensingRequest} from "./adminLicensing";
import {handleAdminOverviewRequest} from "./adminOverview";
import {
  handleAdminQuestionDistributionRequest,
} from "./adminQuestionDistribution";
import {handleAdminQuestionLibraryRequest} from "./adminQuestionLibrary";
import {handleAdminQuestionMutationsRequest} from "./adminQuestionMutations";
import {handleAdminQuestionPackagesRequest} from "./adminQuestionPackages";
import {handleAdminQuestionTagsRequest} from "./adminQuestionTags";
import {
  handleAdminQuestionUploadLogsRequest,
} from "./adminQuestionUploadLogs";
import {handleAdminRunsRequest} from "./adminRuns";
import {handleAdminSettingsRequest} from "./adminSettings";
import {
  handleAdminStudentOnboardingResendRequest,
} from "./adminStudentOnboardingResend";
import {
  handleAdminStudentMutationsRequest,
} from "./adminStudentMutations";
import {handleAdminStudentsRequest} from "./adminStudents";
import {handleAdminStudentsBulkRequest} from "./adminStudentsBulk";
import {
  handleAdminStudentDataExportRequest,
} from "./adminStudentDataExport";
import {
  handleAdminStudentSoftDeleteRequest,
} from "./adminStudentSoftDelete";
import {handleAdminTestsRequest} from "./adminTests";
import {handleExamSessionAnswersRequest} from "./examSessionAnswers";
import {handleExamSessionActivateRequest} from "./examSessionActivate";
import {handleExamSessionEntryRequest} from "./examSessionEntry";
import {handleExamSessionSubmitRequest} from "./examSessionSubmit";
import {handleExamStartRequest} from "./examStart";
import {handleStudentDashboardRequest} from "./studentDashboard";
import {handleStudentInsightsRequest} from "./studentInsights";
import {handleStudentPerformanceRequest} from "./studentPerformance";
import {handleStudentSolutionsRequest} from "./studentSolutions";
import {handleStudentTestsRequest} from "./studentTests";
import {
  handleVendorCalibrationPushRequest,
} from "./vendorCalibrationPush";
import {
  handleVendorCalibrationSimulationRequest,
} from "./vendorCalibrationSimulation";

export type ApiGatewayHandler = (
  request: functions.https.Request,
  response: functions.Response,
) => Promise<void> | void;

export const API_GATEWAY_HANDLERS: Readonly<
Record<string, ApiGatewayHandler>
> = Object.freeze({
  adminAcademicYearArchive: handleAdminAcademicYearArchiveRequest,
  adminAssignmentOperations: handleAdminAssignmentOperationsRequest,
  adminAnalytics: handleAdminAnalyticsRequest,
  adminGovernanceSnapshots: handleAdminGovernanceSnapshotsRequest,
  adminInterventions: handleAdminInterventionsRequest,
  adminLicensing: handleAdminLicensingRequest,
  adminOverview: handleAdminOverviewRequest,
  adminQuestionDistribution: handleAdminQuestionDistributionRequest,
  adminQuestionLibrary: handleAdminQuestionLibraryRequest,
  adminQuestionMutations: handleAdminQuestionMutationsRequest,
  adminQuestionPackages: handleAdminQuestionPackagesRequest,
  adminQuestionTags: handleAdminQuestionTagsRequest,
  adminQuestionUploadLogs: handleAdminQuestionUploadLogsRequest,
  adminRuns: handleAdminRunsRequest,
  adminSettings: handleAdminSettingsRequest,
  adminStudentDataExport: handleAdminStudentDataExportRequest,
  adminStudentMutations: handleAdminStudentMutationsRequest,
  adminStudentOnboardingResend: handleAdminStudentOnboardingResendRequest,
  adminStudentSoftDelete: handleAdminStudentSoftDeleteRequest,
  adminStudents: handleAdminStudentsRequest,
  adminStudentsBulk: handleAdminStudentsBulkRequest,
  adminTests: handleAdminTestsRequest,
  examSessionAnswers: handleExamSessionAnswersRequest,
  examSessionActivate: handleExamSessionActivateRequest,
  examSessionEntry: handleExamSessionEntryRequest,
  examSessionSubmit: handleExamSessionSubmitRequest,
  examStart: handleExamStartRequest,
  studentDashboard: handleStudentDashboardRequest,
  studentInsights: handleStudentInsightsRequest,
  studentPerformance: handleStudentPerformanceRequest,
  studentSolutions: handleStudentSolutionsRequest,
  studentTests: handleStudentTestsRequest,
  vendorCalibrationPush: handleVendorCalibrationPushRequest,
  vendorCalibrationSimulation: handleVendorCalibrationSimulationRequest,
});
