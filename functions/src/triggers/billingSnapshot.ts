import * as functions from "firebase-functions";
import {billingSnapshotService} from "../services/billingSnapshot";

export const handleBillingSnapshotSchedule = async (): Promise<void> => {
  await billingSnapshotService.generateBillingSnapshots();
};

export const billingSnapshotMonthly = functions.pubsub
  .schedule("0 1 1 * *")
  .timeZone("UTC")
  .onRun(handleBillingSnapshotSchedule);
