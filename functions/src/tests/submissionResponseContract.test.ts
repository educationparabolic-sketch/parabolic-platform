import assert from "node:assert/strict";
import test from "node:test";
import {buildSubmissionSuccessResponse} from "../api/examSessionSubmit";
import {SubmissionResult} from "../types/submission";

test(
  "buildSubmissionSuccessResponse exposes only architecture-approved fields",
  () => {
    const result: SubmissionResult = {
      accuracyPercent: 81,
      consecutiveWrongStreakMax: 2,
      disciplineIndex: 76,
      easyRemainingAfterPhase1Percent: 12.5,
      guessRate: 22.22,
      hardInPhase1Percent: 18.5,
      idempotent: true,
      maxTimeViolationPercent: 33.33,
      minTimeViolationPercent: 11.11,
      phaseAdherencePercent: 88.89,
      rawScorePercent: 72,
      riskState: "Drift-Prone",
      sessionPath:
        "institutes/inst_40/academicYears/2026/runs/run_40/sessions/session_40",
      skipBurstCount: 0,
    };

    const response = buildSubmissionSuccessResponse(
      result,
      "req_build_40",
      "2026-03-25T10:00:00.000Z",
    );

    assert.deepEqual(response, {
      code: "OK",
      data: {
        accuracyPercent: 81,
        disciplineIndex: 76,
        rawScorePercent: 72,
        riskState: "Drift-Prone",
      },
      message: "Session submitted successfully.",
      requestId: "req_build_40",
      success: true,
      timestamp: "2026-03-25T10:00:00.000Z",
    });

    assert.equal("guessRate" in response.data, false);
    assert.equal("idempotent" in response.data, false);
    assert.equal("maxTimeViolationPercent" in response.data, false);
    assert.equal("minTimeViolationPercent" in response.data, false);
    assert.equal("phaseAdherencePercent" in response.data, false);
    assert.equal("sessionPath" in response.data, false);
  },
);
