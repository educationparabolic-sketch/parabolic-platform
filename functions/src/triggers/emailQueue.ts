import * as functions from "firebase-functions";
import {
  adminSettingsCommunicationService,
} from "../services/adminSettingsCommunication";
import {supportNotificationService} from "../services/supportNotifications";

export const handleEmailQueueSchedule = async (): Promise<void> => {
  const [adminSettingsProcessed, supportProcessed] = await Promise.all([
    adminSettingsCommunicationService.processDueCommunications(50),
    supportNotificationService.processDueNotifications(50),
  ]);
  functions.logger.info("Processed due asynchronous email communications.", {
    adminSettingsProcessed,
    supportProcessed,
  });
};

export const processEmailQueue = functions.pubsub
  .schedule("every 1 minutes")
  .timeZone("UTC")
  .onRun(handleEmailQueueSchedule);
