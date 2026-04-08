import * as functions from "firebase-functions";
import {billingSnapshotService} from "../services/billingSnapshot";
import {systemEventTopologyService} from "../services/systemEventTopology";

export const handleBillingSnapshotSchedule = async (
  context: functions.EventContext,
): Promise<void> => {
  await systemEventTopologyService.executeEventHandler(
    "BillingMeterUpdated",
    "billingSnapshotMonthly",
    {
      eventId: context.eventId,
    },
    async () => billingSnapshotService.generateBillingSnapshots(),
  );
};

export const billingSnapshotMonthly = functions.pubsub
  .schedule("0 1 1 * *")
  .timeZone("UTC")
  .onRun(handleBillingSnapshotSchedule);
