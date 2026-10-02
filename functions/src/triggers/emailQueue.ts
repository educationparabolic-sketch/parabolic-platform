import * as functions from "firebase-functions";
import {
  adminSettingsCommunicationService,
} from "../services/adminSettingsCommunication";
import {supportNotificationService} from "../services/supportNotifications";
import {
  vendorAdministratorCommunicationService,
} from "../services/vendorAdministratorCommunication";

export const handleEmailQueueSchedule = async (): Promise<void> => {
  const [adminSettingsProcessed, supportProcessed, vendorAdministratorProcessed] = await Promise.all([
    adminSettingsCommunicationService.processDueCommunications(50),
    supportNotificationService.processDueNotifications(50),
    vendorAdministratorCommunicationService.processDueCommunications(50),
  ]);
  functions.logger.info("Processed due asynchronous email communications.", {
    adminSettingsProcessed,
    supportProcessed,
    vendorAdministratorProcessed,
  });
};

export const processEmailQueue = functions.pubsub
  .schedule("every 1 minutes")
  .timeZone("UTC")
  .onRun(handleEmailQueueSchedule);
