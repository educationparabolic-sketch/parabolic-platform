import * as functions from "firebase-functions";
import {loadEnvironmentConfig} from "./utils/environment";

export const helloWorld = functions.https.onRequest(async (
  req: functions.https.Request,
  res: functions.Response,
) => {
  const environmentConfig = await loadEnvironmentConfig();

  const message =
    "Parabolic Platform backend is running in " +
    `${environmentConfig.nodeEnv} mode for ` +
    `${environmentConfig.projectId}.`;

  res.send(message);
});
