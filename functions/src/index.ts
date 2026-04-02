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
import {runAssignmentOnCreate} from "./triggers/assignmentCreation";
import {questionBankOnCreate} from "./triggers/questionIngestion";
import {examSessionOnUpdate} from "./triggers/sessionSubmission";
import {studentYearMetricsOnWrite} from "./triggers/studentYearMetrics";
import {testTemplateOnCreate} from "./triggers/templateCreation";
import {loadEnvironmentConfig} from "./utils/environment";

registerGlobalErrorHandlers();

export {questionBankOnCreate};
export {runAssignmentOnCreate};
export {examSessionOnUpdate};
export {studentYearMetricsOnWrite};
export {testTemplateOnCreate};
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
