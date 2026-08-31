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
      status: "submitted",
      submissionReason: "manual",
      submittedAt: "2026-03-25T09:59:59.000Z",
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
        alreadySubmitted: true,
        disciplineIndex: 76,
        guessRatePercent: 22.22,
        maxTimeViolationPercent: 33.33,
        minTimeViolationPercent: 11.11,
        operationalDataAccessPolicy: {
          allowedOperationalCollections: ["sessions"],
          archiveExportPolicy: "BigQuery export only during academic-year archive",
          liveSessionPath:
            "institutes/inst_40/academicYears/2026/runs/run_40/sessions/session_40",
          prohibitedRuntimeSources: [
            "runAnalytics",
            "studentYearMetrics",
            "questionAnalytics",
            "BigQuery",
          ],
          summarySinksAfterSubmission: [
            "runAnalytics",
            "studentYearMetrics",
            "questionAnalytics",
          ],
          tier: "HOT",
          writeModel: "incremental session document updates",
        },
        rawScorePercent: 72,
        riskState: "Drift-Prone",
        phaseAdherencePercent: 88.89,
        status: "submitted",
        submissionReason: "manual",
        submittedAt: "2026-03-25T09:59:59.000Z",
      },
      message: "Session submission already finalized.",
      requestId: "req_build_40",
      success: true,
      timestamp: "2026-03-25T10:00:00.000Z",
    });

    assert.equal("guessRate" in response.data, false);
    assert.equal("idempotent" in response.data, false);
    assert.equal(response.data.alreadySubmitted, true);
    assert.equal(response.data.status, "submitted");
    assert.equal("operationalDataAccessPolicy" in response.data, true);
    assert.equal("phaseAdherencePercent" in response.data, true);
    assert.equal("sessionPath" in response.data, false);
  },
);
