import * as functions from "firebase-functions";
import {
  claimPropagationScheduleService,
  ProcessClaimPropagationScheduleResult,
} from "../services/claimPropagation";
import {systemEventTopologyService} from "../services/systemEventTopology";

export const handleClaimPropagationSchedule = async (
  workerId: string,
): Promise<ProcessClaimPropagationScheduleResult> =>
  systemEventTopologyService.executeEventHandler(
    "ClaimPropagationSweepScheduled",
    "claimPropagationSweepEveryMinute",
    {eventId: workerId},
    async () => {
      const result = await claimPropagationScheduleService.execute(workerId);
      functions.logger.info("Processed scheduled claim propagation work.", result);
      return result;
    },
  );

export const claimPropagationSweepEveryMinute = functions.pubsub
  .schedule("every 1 minutes")
  .timeZone("UTC")
  .onRun((context) => handleClaimPropagationSchedule(context.eventId));
