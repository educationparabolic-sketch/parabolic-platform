import {onRequest} from "firebase-functions/https";
import {loadEnvironmentConfig} from "./utils/environment";

const environmentConfig = loadEnvironmentConfig();

export const helloWorld = onRequest((req, res) => {
  const message =
    "Parabolic Platform backend is running in " +
    `${environmentConfig.nodeEnv} mode for ` +
    `${environmentConfig.projectId}.`;

  res.send(message);
});
