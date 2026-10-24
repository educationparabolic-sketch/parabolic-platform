import {guardBackgroundDiagnostics} from "../services/diagnosticDisclosure";
import {createLogger} from "../services/logging";
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
      createLogger("claimPropagationTrigger").info("Processed scheduled claim propagation work.", {...result});
      return result;
    },
  );

export const claimPropagationSweepEveryMinute = functions.pubsub
  .schedule("every 1 minutes")
  .timeZone("UTC")
  .onRun(guardBackgroundDiagnostics((context: functions.EventContext) =>
    handleClaimPropagationSchedule(context.eventId)));
