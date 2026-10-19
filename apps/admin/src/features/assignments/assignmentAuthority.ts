import { adaptExamProctoringPolicyV1 } from "../../../../../shared/services/portalResponseAdapters";
import type {
  AdminRunCreateRequest,
  AdminRunCreateResult,
  AdminRunRecord,
  AdminRunLifecycleResult,
  AdminRunVersionedRecord,
} from "../../../../../shared/contracts/apiDtos";

function assertEqual<T>(
  field: string,
  actual: T,
  expected: T,
): void {
  if (actual !== expected) {
    throw new Error(
      `POST /admin/runs replay returned ${field} ${String(actual)}; ` +
      `expected ${String(expected)}.`,
    );
  }
}

function assertStringArrayEqual(
  field: string,
  actual: readonly string[],
  expected: readonly string[],
): void {
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error(
      `POST /admin/runs replay returned different ${field}.`,
    );
  }
}

function assertRunMatchesRequest(
  request: AdminRunCreateRequest,
  run: AdminRunRecord,
): void {
  adaptExamProctoringPolicyV1(run.proctoringPolicy, "POST /admin/runs replay");
  assertEqual("contractVersion", run.proctoringPolicy.contractVersion, request.proctoringPolicy.contractVersion);
  assertEqual("academicYear", run.academicYear, request.academicYear);
  assertEqual("attemptLimit", run.attemptLimit, request.attemptLimit);
  assertEqual("endWindow", run.endWindow, request.endWindow);
  assertEqual(
    "gracePeriodMinutes",
    run.gracePeriodMinutes,
    request.gracePeriodMinutes,
  );
  assertEqual("mode", run.mode, request.mode);
  assertEqual(
    "browserIntegrityGuardEnabled",
    run.proctoringPolicy.browserIntegrityGuardEnabled,
    request.proctoringPolicy.browserIntegrityGuardEnabled,
  );
  assertEqual(
    "cameraReadiness",
    run.proctoringPolicy.cameraReadiness,
    request.proctoringPolicy.cameraReadiness,
  );
  assertStringArrayEqual(
    "recipientStudentIds",
    run.recipientStudentIds,
    request.recipientStudentIds,
  );
  assertEqual(
    "recipientCount",
    run.recipientCount,
    request.recipientStudentIds.length,
  );
  assertEqual(
    "shuffleQuestionOrder",
    run.shuffleQuestionOrder,
    request.shuffleQuestionOrder,
  );
  assertEqual("startWindow", run.startWindow, request.startWindow);
  assertEqual(
    "templateVersion",
    run.templateVersion,
    request.expectedTemplateVersion,
  );
  assertEqual("testId", run.testId, request.testId);
  assertEqual("timezone", run.timezone, request.timezone);
  assertEqual("status", run.status, "scheduled");

  if (!run.id || !run.canonicalId || Number.isNaN(Date.parse(run.createdAt))) {
    throw new Error(
      "POST /admin/runs replay omitted authoritative identity metadata.",
    );
  }

  if (!run.runPath.endsWith(`/runs/${run.id}`)) {
    throw new Error(
      "POST /admin/runs replay returned a runPath that does not match its ID.",
    );
  }
}

export function reconcileCreatedRun(
  request: AdminRunCreateRequest,
  createResult: AdminRunCreateResult,
  replayResult: AdminRunCreateResult,
): AdminRunRecord {
  if (replayResult.disposition !== "replayed") {
    throw new Error(
      "POST /admin/runs retry did not return the persisted run replay.",
    );
  }

  assertRunMatchesRequest(request, createResult.run);
  assertRunMatchesRequest(request, replayResult.run);

  if (JSON.stringify(createResult.run) !== JSON.stringify(replayResult.run)) {
    throw new Error(
      "POST /admin/runs replay did not match the authoritative create result.",
    );
  }

  return replayResult.run;
}


/** Confirm only the addressed run's completed canonical stop, even if policy is unavailable. */
export function assertTerminatedRunAcknowledgement(
  previous: AdminRunVersionedRecord,
  result: AdminRunLifecycleResult,
): void {
  if (result.recoveryState !== "complete" || result.run.status !== "terminated" ||
      result.run.id !== previous.id || result.run.runPath !== previous.runPath ||
      result.run.canonicalId !== previous.canonicalId || result.run.revision <= previous.revision) {
    throw new Error("Termination did not acknowledge the addressed run at a later authoritative revision.");
  }
}
