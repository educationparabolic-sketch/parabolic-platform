import * as functions from "firebase-functions";
import {supportAttachmentService} from "../services/supportAttachments";

export const handleSupportAttachmentCleanupSchedule = async (): Promise<void> => {
  await supportAttachmentService.cleanupExpired();
};

export const supportAttachmentCleanupDaily = functions.pubsub
  .schedule("0 3 * * *")
  .timeZone("UTC")
  .onRun(handleSupportAttachmentCleanupSchedule);
