import * as functions from "firebase-functions";
import {billingSnapshotService} from "../services/billingSnapshot";
import {systemEventTopologyService} from "../services/systemEventTopology";
import {
  vendorIntelligenceRollupService,
} from "../services/vendorIntelligenceRollup";

export const handleBillingSnapshotSchedule = async (
  context: functions.EventContext,
): Promise<void> => {
  await systemEventTopologyService.executeEventHandler(
    "BillingMeterUpdated",
    "billingSnapshotMonthly",
    {
      eventId: context.eventId,
    },
    async () => {
      const billingResult =
        await billingSnapshotService.generateBillingSnapshots();
      return systemEventTopologyService.executeEventHandler(
        "VendorAggregatesUpdated",
        "billingSnapshotMonthly",
        {
          eventId: context.eventId,
        },
        async () => {
          const rollupResult =
            await vendorIntelligenceRollupService.generateMonthlyRollup({
              monthId: billingResult.cycleId,
              workerId: context.eventId,
            });
          if (rollupResult.state !== "complete") {
            throw new Error(
              "Vendor intelligence rollup requires another bounded retry.",
            );
          }
          return rollupResult;
        },
      );
    },
  );
};

export const billingSnapshotMonthly = functions.pubsub
  .schedule("0 1 1 * *")
  .timeZone("UTC")
  .onRun(handleBillingSnapshotSchedule);
