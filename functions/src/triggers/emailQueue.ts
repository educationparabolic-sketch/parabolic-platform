import * as functions from "firebase-functions";
import {
  adminSettingsCommunicationService,
} from "../services/adminSettingsCommunication";

export const handleEmailQueueSchedule = async (): Promise<void> => {
  const processedCount = await adminSettingsCommunicationService
    .processDueCommunications(50);
  functions.logger.info("Processed due Admin settings communications.", {
    processedCount,
  });
};

export const processEmailQueue = functions.pubsub
  .schedule("every 1 minutes")
  .timeZone("UTC")
  .onRun(handleEmailQueueSchedule);
