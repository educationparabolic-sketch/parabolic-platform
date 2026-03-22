import * as functions from "firebase-functions";
import {registerGlobalErrorHandlers} from "./services/errorReporting";
import {createRequestLogger} from "./services/logging";
import {questionBankOnCreate} from "./triggers/questionIngestion";
import {testTemplateOnCreate} from "./triggers/templateCreation";
import {loadEnvironmentConfig} from "./utils/environment";

registerGlobalErrorHandlers();

export {questionBankOnCreate};
export {testTemplateOnCreate};

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
    res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Failed to load runtime configuration.",
      requestId: logger.getRequestId(),
      timestamp: new Date().toISOString(),
    });
  }
});
