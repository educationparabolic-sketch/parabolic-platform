import * as functions from "firebase-functions";
import {loadEnvironmentConfig} from "./utils/environment";

export const helloWorld = functions.https.onRequest((req: functions.https.Request, res: functions.Response) => {
  const environmentConfig = loadEnvironmentConfig(); // ✅ moved inside

  const message =
    "Parabolic Platform backend is running in " +
    `${environmentConfig.nodeEnv} mode for ` +
    `${environmentConfig.projectId}.`;

  res.send(message);
});