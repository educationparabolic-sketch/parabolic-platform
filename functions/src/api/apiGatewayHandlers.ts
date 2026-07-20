import * as functions from "firebase-functions";
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
import {handleAdminQuestionsBulkRequest} from "./adminQuestionsBulk";
import {
  handleAdminQuestionUploadLogsRequest,
} from "./adminQuestionUploadLogs";
import {handleAdminRunsRequest} from "./adminRuns";
import {handleAdminSettingsRequest} from "./adminSettings";
import {
  handleAdminStudentOnboardingResendRequest,
} from "./adminStudentOnboardingResend";
import {handleAdminStudentsRequest} from "./adminStudents";
import {handleAdminStudentsBulkRequest} from "./adminStudentsBulk";
import {handleAdminTestsRequest} from "./adminTests";
import {handleExamSessionAnswersRequest} from "./examSessionAnswers";
import {handleExamSessionEntryRequest} from "./examSessionEntry";
import {handleExamSessionSubmitRequest} from "./examSessionSubmit";
import {handleExamStartRequest} from "./examStart";
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
  adminAnalytics: handleAdminAnalyticsRequest,
  adminGovernanceSnapshots: handleAdminGovernanceSnapshotsRequest,
  adminInterventions: handleAdminInterventionsRequest,
  adminLicensing: handleAdminLicensingRequest,
  adminOverview: handleAdminOverviewRequest,
  adminQuestionDistribution: handleAdminQuestionDistributionRequest,
  adminQuestionLibrary: handleAdminQuestionLibraryRequest,
  adminQuestionsBulk: handleAdminQuestionsBulkRequest,
  adminQuestionUploadLogs: handleAdminQuestionUploadLogsRequest,
  adminRuns: handleAdminRunsRequest,
  adminSettings: handleAdminSettingsRequest,
  adminStudentOnboardingResend: handleAdminStudentOnboardingResendRequest,
  adminStudents: handleAdminStudentsRequest,
  adminStudentsBulk: handleAdminStudentsBulkRequest,
  adminTests: handleAdminTestsRequest,
  examSessionAnswers: handleExamSessionAnswersRequest,
  examSessionEntry: handleExamSessionEntryRequest,
  examSessionSubmit: handleExamSessionSubmitRequest,
  examStart: handleExamStartRequest,
  vendorCalibrationPush: handleVendorCalibrationPushRequest,
  vendorCalibrationSimulation: handleVendorCalibrationSimulationRequest,
});
