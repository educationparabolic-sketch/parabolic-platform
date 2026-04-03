import * as functions from "firebase-functions";
import {
  governanceSnapshotAggregationService,
} from "../services/governanceSnapshotAggregation";

export const handleGovernanceSnapshotSchedule = async (
): Promise<void> => {
  await governanceSnapshotAggregationService.generateMonthlySnapshots();
};

export const governanceSnapshotMonthly = functions.pubsub
  .schedule("0 0 1 * *")
  .timeZone("UTC")
  .onRun(handleGovernanceSnapshotSchedule);
