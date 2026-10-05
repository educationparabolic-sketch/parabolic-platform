import * as functions from "firebase-functions";
import {
  governanceSnapshotAggregationService,
} from "../services/governanceSnapshotAggregation";
import {systemEventTopologyService} from "../services/systemEventTopology";

export const handleGovernanceSnapshotSchedule = async (
  context: functions.EventContext,
): Promise<void> => {
  await systemEventTopologyService.executeEventHandler(
    "GovernanceSnapshotScheduled",
    "governanceSnapshotMonthly",
    {
      eventId: context.eventId,
    },
    async () => governanceSnapshotAggregationService.generateMonthlySnapshots(),
  );
};

export const governanceSnapshotMonthly = functions.pubsub
  .schedule("0 0 1 * *")
  .timeZone("UTC")
  .onRun(handleGovernanceSnapshotSchedule);
