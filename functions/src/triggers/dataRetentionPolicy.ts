import {guardBackgroundDiagnostics} from "../services/diagnosticDisclosure";
import * as functions from "firebase-functions";
import {dataRetentionPolicyService} from "../services/dataRetentionPolicy";

export const handleDataRetentionPolicySchedule = async (): Promise<void> => {
  await dataRetentionPolicyService.executePolicy();
};

export const dataRetentionPolicyDaily = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone("UTC")
  .onRun(guardBackgroundDiagnostics(handleDataRetentionPolicySchedule));
