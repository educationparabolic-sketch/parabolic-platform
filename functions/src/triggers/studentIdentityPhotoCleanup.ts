import {guardBackgroundDiagnostics} from "../services/diagnosticDisclosure";
import {createLogger} from "../services/logging";
import * as functions from "firebase-functions";
import {StudentIdentityPhotoLifecycleService} from "../services/studentIdentityPhotoLifecycle";

export const handleStudentIdentityPhotoCleanupSchedule = async (): Promise<void> => {
  const result = await new StudentIdentityPhotoLifecycleService().cleanupExpired();
  createLogger("studentIdentityPhotoCleanupTrigger").info("Identity photo cleanup batch completed.", result);
};

export const studentIdentityPhotoCleanupEvery15Minutes = functions
  .runWith({timeoutSeconds: 540, memory: "256MB", maxInstances: 1})
  .pubsub.schedule("every 15 minutes")
  .timeZone("UTC")
  .onRun(guardBackgroundDiagnostics(handleStudentIdentityPhotoCleanupSchedule));
