import type {
  AdminRunCreateRequest,
  AdminRunCreateResult,
  AdminRunRecord,
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
    "faceIdentityGazeGuardEnabled",
    run.proctoringPolicy.faceIdentityGazeGuardEnabled,
    request.proctoringPolicy.faceIdentityGazeGuardEnabled,
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
