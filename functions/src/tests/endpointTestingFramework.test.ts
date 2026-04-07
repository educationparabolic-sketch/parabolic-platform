import assert from "node:assert/strict";
import test from "node:test";
import {
  createExamStartHandler,
} from "../api/examStart";
import {
  createExamSessionAnswersHandler,
} from "../api/examSessionAnswers";
import {
  createExamSessionSubmitHandler,
} from "../api/examSessionSubmit";
import {
  createInternalEmailQueueHandler,
} from "../api/internalEmailQueue";
import {
  createVendorSimulationEnvironmentHandler,
} from "../api/vendorSimulationEnvironment";
import {
  createVendorSimulationStudentsHandler,
} from "../api/vendorSimulationStudents";
import {
  createVendorSimulationSessionsHandler,
} from "../api/vendorSimulationSessions";
import {
  createVendorSimulationLoadHandler,
} from "../api/vendorSimulationLoad";
import {
  createVendorSimulationValidationHandler,
} from "../api/vendorSimulationValidation";
import {
  createVendorIntelligenceInitializeHandler,
} from "../api/vendorIntelligenceInitialize";
import {
  createVendorRevenueAnalyticsHandler,
} from "../api/vendorRevenueAnalytics";
import {
  createVendorLayerDistributionHandler,
} from "../api/vendorLayerDistribution";
import {
  createVendorChurnTrackingHandler,
} from "../api/vendorChurnTracking";
import {
  createVendorRevenueForecastingHandler,
} from "../api/vendorRevenueForecasting";
import {
  createVendorLicenseUpdateHandler,
} from "../api/vendorLicenseUpdate";
import {
  createVendorCalibrationPushHandler,
} from "../api/vendorCalibrationPush";
import {
  createVendorCalibrationSimulationHandler,
} from "../api/vendorCalibrationSimulation";
import {
  createAdminGovernanceSnapshotsHandler,
} from "../api/adminGovernanceSnapshots";
import {
  createAdminGovernanceReportsHandler,
} from "../api/adminGovernanceReports";
import {
  createAdminAcademicYearArchiveHandler,
} from "../api/adminAcademicYearArchive";
import {
  createAdminStudentDataExportHandler,
} from "../api/adminStudentDataExport";
import {SessionStartValidationError} from "../services/session";
import {
  SimulationEnvironmentValidationError,
} from "../services/simulationEnvironment";
import {
  SimulationStudentGenerationValidationError,
} from "../services/simulationStudentGenerator";
import {
  SimulationSessionGenerationValidationError,
} from "../services/simulationSessionGenerator";
import {
  LoadSimulationValidationError,
} from "../services/loadSimulation";
import {
  SimulationValidationError,
} from "../services/simulationValidation";
import {SubmissionValidationError} from "../services/submission";
import {
  LicenseManagementValidationError,
} from "../types/licenseManagement";
import {
  CalibrationDeploymentError,
} from "../types/calibrationDeployment";
import {
  CalibrationSimulationError,
} from "../types/calibrationSimulation";
import {
  AcademicYearArchiveValidationError,
} from "../types/archivePipeline";
import {
  StudentDataExportValidationError,
} from "../types/studentDataExport";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";
import {PersistAnswerBatchResult} from "../types/sessionAnswerBatch";
import {SubmissionResult} from "../types/submission";
import {EnvironmentConfig} from "../types/environment";

const createStudentToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_50",
  licenseLayer: "L1",
  role: "student",
  studentId: "student_build_50",
  uid: "uid_build_50",
  ...overrides,
});

const createServiceToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_50",
  licenseLayer: "L0",
  role: "service",
  uid: "svc_build_50",
  ...overrides,
});

const createVendorToken = (overrides: Record<string, unknown> = {}) => ({
  licenseLayer: "L0",
  role: "vendor",
  uid: "vendor_build_76",
  ...overrides,
});

const createDirectorToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_89",
  licenseLayer: "L3",
  role: "director",
  uid: "director_build_89",
  ...overrides,
});

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_103",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_103",
  ...overrides,
});

const createEnvironmentConfig = (
  nodeEnv: EnvironmentConfig["nodeEnv"],
): EnvironmentConfig => ({
  assetDelivery: {
    buckets: {
      questionAssets: "bucket-question-assets",
      reports: "bucket-reports",
    },
    cdnBaseUrl: "https://cdn.example.com",
  },
  endpoints: {
    appBaseUrl: "http://localhost:5173",
    examBaseUrl: "http://localhost:4173",
    vendorBaseUrl: "http://localhost:6173",
  },
  nodeEnv,
  projectId: "parabolic-platform-build-76-tests",
  secretMetadata: {
    aiApiKey: {
      envVar: "AI_API_KEY",
      secretNameEnvVar: "AI_API_KEY_SECRET_NAME",
      source: "unconfigured",
    },
    emailProviderKey: {
      envVar: "EMAIL_PROVIDER_KEY",
      secretNameEnvVar: "EMAIL_PROVIDER_KEY_SECRET_NAME",
      source: "unconfigured",
    },
    stripeSecretKey: {
      envVar: "STRIPE_SECRET_KEY",
      secretNameEnvVar: "STRIPE_SECRET_KEY_SECRET_NAME",
      source: "unconfigured",
    },
    stripeWebhookSecret: {
      envVar: "STRIPE_WEBHOOK_SECRET",
      secretNameEnvVar: "STRIPE_WEBHOOK_SECRET_SECRET_NAME",
      source: "unconfigured",
    },
  },
  secrets: {},
});

const assertStructuredError = (
  responseBody: unknown,
  expectedCode: string,
  expectedMessage: string,
): void => {
  const errorResponse = responseBody as {
    error: {
      code: string;
      message: string;
    };
    meta: {
      requestId: string;
      timestamp: string;
    };
    success: boolean;
  };

  assert.equal(errorResponse.error.code, expectedCode);
  assert.equal(errorResponse.error.message, expectedMessage);
  assert.equal(errorResponse.success, false);
  assert.equal(typeof errorResponse.meta.requestId, "string");
  assert.equal(typeof errorResponse.meta.timestamp, "string");
};

test("exam start handler accepts a valid student request", async () => {
  const handler = createExamStartHandler({
    startSession: async () => ({
      sessionId: "session_build_50",
      sessionPath:
        "institutes/inst_build_50/academicYears/2026/runs/run_build_50/" +
        "sessions/session_build_50",
      sessionToken: "session_token_build_50",
      status: "created",
    }),
    verifyIdToken: async () => createStudentToken() as never,
  });
  const request = createMockRequest({
    body: {
      instituteId: "inst_build_50",
      runId: "run_build_50",
      yearId: "2026",
    },
    headers: {
      authorization: "Bearer build_50_token",
    },
    path: "/exam/start",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal(
    (response.body as {code: string}).code,
    "OK",
  );
  assert.equal(
    (response.body as {data: {sessionId: string}}).data.sessionId,
    "session_build_50",
  );
});

test("exam start handler rejects missing authentication", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 401);
  assertStructuredError(
    response.body,
    "UNAUTHORIZED",
    "Missing authorization header.",
  );
});

test("exam start handler rejects tokens missing required claims", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () =>
      createStudentToken({licenseLayer: undefined}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_62_missing_claims",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 401);
  assertStructuredError(
    response.body,
    "UNAUTHORIZED",
    "Authentication token is missing required claims.",
  );
});

test("exam start handler rejects role violations", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () => createStudentToken({role: "admin"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_admin",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only students can start exam sessions.",
  );
});

test("exam start handler rejects cross-tenant access", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () =>
      createStudentToken({instituteId: "inst_other_build_50"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_tenant",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "TENANT_MISMATCH",
    "Token instituteId does not match request instituteId.",
  );
});

test("exam start handler surfaces license restriction failures", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new SessionStartValidationError(
        "LICENSE_RESTRICTED",
        "Institute license is required before starting sessions.",
      );
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_license",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "LICENSE_RESTRICTED",
    "Institute license is required before starting sessions.",
  );
});

test("exam start handler rejects invalid payloads", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_invalid",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"runId\" must be a non-empty string.",
  );
});

test(
  "admin student data export handler accepts an admin approval",
  async () => {
    const handler = createAdminStudentDataExportHandler({
      generateExport: async () => ({
        approvedBy: "admin_build_103",
        download: {
          accessContext: "dataExportDownload",
          cdnPath: "inst_build_103/reports/2026/04/student_103-data-export.csv",
          expiresAt: "2026-04-08T00:00:00.000Z",
          expiresInSeconds: 86400,
          signedUrl: "https://cdn.example.com/export.csv",
        },
        expiresAt: "2026-04-08T00:00:00.000Z",
        exportHash: "hash_103",
        generatedAt: "2026-04-07T00:00:00.000Z",
        includeAiSummaries: true,
        instituteId: "inst_build_103",
        records: {
          academicYearCount: 1,
          aiSummaryCount: 1,
          metricDocumentCount: 1,
          sessionCount: 2,
        },
        requestedBy: "student_103",
        storage: {
          bucketName: "bucket-reports",
          objectPath:
          "inst_build_103/reports/2026/04/" +
          "student_103-data-export.csv",
        },
        studentId: "student_103",
      }),
      verifyIdToken: async () => createAdminToken() as never,
    });
    const response = createMockResponse();

    await handler(
    createMockRequest({
      body: {
        includeAiSummaries: true,
        instituteId: "inst_build_103",
        studentId: "student_103",
      },
      headers: {
        authorization: "Bearer build_103_admin",
      },
      path: "/admin/students/data-export",
    }) as never,
    response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {studentId: string}}).data.studentId,
      "student_103",
    );
  },
);

test(
  "admin student data export handler rejects non-approver roles",
  async () => {
    const handler = createAdminStudentDataExportHandler({
      generateExport: async () => {
        throw new Error("generateExport should not be called");
      },
      verifyIdToken: async () => createAdminToken({role: "teacher"}) as never,
    });
    const response = createMockResponse();

    await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_103",
        studentId: "student_103",
      },
      headers: {
        authorization: "Bearer build_103_teacher",
      },
      path: "/admin/students/data-export",
    }) as never,
    response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only admin, director, and vendor roles can approve data exports.",
    );
  },
);

test(
  "admin student data export handler surfaces validation failures",
  async () => {
    const handler = createAdminStudentDataExportHandler({
      generateExport: async () => {
        throw new StudentDataExportValidationError(
          "NOT_FOUND",
          "Student record was not found for export.",
        );
      },
      verifyIdToken: async () => createAdminToken() as never,
    });
    const response = createMockResponse();

    await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_103",
        studentId: "student_404",
      },
      headers: {
        authorization: "Bearer build_103_missing_student",
      },
      path: "/admin/students/data-export",
    }) as never,
    response as never,
    );

    assert.equal(response.statusCode, 404);
    assertStructuredError(
      response.body,
      "NOT_FOUND",
      "Student record was not found for export.",
    );
  },
);

test(
  "admin governance snapshots handler accepts an L3 director request",
  async () => {
    const handler = createAdminGovernanceSnapshotsHandler({
      readSnapshots: async () => ({
        instituteId: "inst_build_89",
        snapshots: [
          {
            academicYear: "2026",
            avgAccuracyPercent: 74,
            avgPhaseAdherence: 71,
            avgRawScorePercent: 65,
            createdAt: "2026-04-01T00:00:00.000Z",
            disciplineMean: 72,
            disciplineTrend: 1.2,
            disciplineVariance: 6.4,
            documentId: "2026_03",
            documentPath:
              "institutes/inst_build_89/academicYears/2026/" +
              "governanceSnapshots/2026_03",
            easyNeglectPercent: 8,
            executionIntegrityScore: 79,
            generatedAt: "2026-04-01T00:00:00.000Z",
            hardBiasPercent: 6,
            immutable: true,
            instituteId: "inst_build_89",
            month: "2026-03",
            overrideFrequency: 2,
            phaseCompliancePercent: 71,
            riskClusterDistribution: {
              driftProne: 18,
              impulsive: 9,
              overextended: 4,
              stable: 61,
              volatile: 8,
            },
            riskDistribution: {
              driftProne: 18,
              impulsive: 9,
              overextended: 4,
              stable: 61,
              volatile: 8,
            },
            rushPatternPercent: 11,
            schemaVersion: 1,
            skipBurstPercent: 4,
            stabilityIndex: 79,
            templateVarianceMean: 5.4,
            wrongStreakPercent: 2,
          },
        ],
        yearId: "2026",
      }),
      verifyIdToken: async () => createDirectorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          instituteId: "inst_build_89",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_89_director",
        },
        path: "/admin/governance/snapshots",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {snapshots: Array<{month: string}>}})
        .data.snapshots[0]?.month,
      "2026-03",
    );
  },
);

test(
  "admin governance snapshots handler rejects non-director institute roles",
  async () => {
    const handler = createAdminGovernanceSnapshotsHandler({
      readSnapshots: async () => {
        throw new Error("readSnapshots should not be called");
      },
      verifyIdToken: async () =>
        createDirectorToken({role: "teacher"}) as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          instituteId: "inst_build_89",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_89_teacher",
        },
        path: "/admin/governance/snapshots",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only director and vendor roles can access governance snapshots.",
    );
  },
);

test(
  "admin governance snapshots handler rejects director requests below L3",
  async () => {
    const handler = createAdminGovernanceSnapshotsHandler({
      readSnapshots: async () => {
        throw new Error("readSnapshots should not be called");
      },
      verifyIdToken: async () =>
        createDirectorToken({licenseLayer: "L2"}) as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          instituteId: "inst_build_89",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_89_l2",
        },
        path: "/admin/governance/snapshots",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "LICENSE_RESTRICTED",
      "Governance access requires license layer L3.",
    );
  },
);

test(
  "admin governance snapshots handler enforces tenant isolation for directors",
  async () => {
    const handler = createAdminGovernanceSnapshotsHandler({
      readSnapshots: async () => {
        throw new Error("readSnapshots should not be called");
      },
      verifyIdToken: async () =>
        createDirectorToken({instituteId: "inst_other_build_89"}) as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          instituteId: "inst_build_89",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_89_tenant",
        },
        path: "/admin/governance/snapshots",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "TENANT_MISMATCH",
      "Token instituteId does not match request instituteId.",
    );
  },
);

test(
  "admin governance snapshots handler allows vendor cross-institute access",
  async () => {
    const handler = createAdminGovernanceSnapshotsHandler({
      readSnapshots: async (input) => ({
        instituteId: input.instituteId ?? "inst_vendor_target_build_89",
        snapshots: [],
        yearId: input.yearId ?? "2026",
      }),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          instituteId: "inst_vendor_target_build_89",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_89_vendor",
        },
        path: "/admin/governance/snapshots",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(
      (response.body as {data: {instituteId: string}}).data.instituteId,
      "inst_vendor_target_build_89",
    );
  },
);

test(
  "admin governance reports handler accepts an L3 director request",
  async () => {
    const handler = createAdminGovernanceReportsHandler({
      generateReport: async () => ({
        disciplineDeviation: {
          deviationLevel: "watch",
          disciplineMean: 72,
          disciplineTrend: -2.5,
          disciplineVariance: 8.6,
          summary: "Discipline indicators require governance review.",
        },
        governanceIndicators: {
          executionIntegrityScore: 68,
          overrideFrequency: 6,
          phaseCompliancePercent: 71,
          stabilityIndex: 61,
        },
        header: {
          academicYear: "2026",
          calibrationVersion: "cal_v2026_03",
          generatedAt: "2026-04-03T10:00:00.000Z",
          instituteId: "inst_build_90",
          month: "2026-03",
          schemaVersion: 1,
          snapshotDocumentPath:
            "institutes/inst_build_90/academicYears/2026/" +
            "governanceSnapshots/2026_03",
        },
        incidentTimeline: [
          {
            at: "2026-04-01T00:00:00.000Z",
            source: "snapshot",
            summary: "Monthly governance snapshot sealed.",
          },
        ],
        majorIncidentAlerts: [
          {
            affectedRunIds: ["run_build_90"],
            calibrationVersion: "cal_v2026_03",
            recoveryActions: [
              "Review override FORCE_SUBMIT performed by dir_1",
            ],
            severity: "high",
            summary: "Override activity exceeded threshold.",
            timeline: [
              {
                at: "2026-04-01T00:00:00.000Z",
                source: "snapshot",
                summary: "Monthly governance snapshot sealed.",
              },
            ],
            title: "Override Spike",
            type: "override_spike",
            userActionsInvolved: ["FORCE_SUBMIT"],
          },
        ],
        pdfExport: {
          bucketName: "bucket-reports",
          cdnPath: "inst_build_90/reports/2026/03/governance.pdf",
          contentType: "application/pdf",
          fileName: "governance.pdf",
          gsUri: "gs://bucket-reports/inst_build_90/reports/2026/03/governance.pdf",
          objectPath: "inst_build_90/reports/2026/03/governance.pdf",
        },
        performance: {
          avgAccuracyPercent: 74,
          avgRawScorePercent: 66,
          disciplineMean: 72,
          stabilityIndex: 61,
          templateVarianceMean: 5.5,
        },
        requestedMonth: "2026-03",
        riskDistribution: {
          driftProne: 18,
          impulsive: 10,
          overextended: 12,
          stable: 50,
          volatile: 10,
        },
        summary: {
          affectedRunCount: 1,
          incidentCount: 1,
          recoveryActionCount: 1,
        },
        yearId: "2026",
      }),
      verifyIdToken: async () =>
        createDirectorToken({
          instituteId: "inst_build_90",
          uid: "director_build_90",
        }) as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          includePdfExport: true,
          instituteId: "inst_build_90",
          month: "2026-03",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_90_director",
        },
        path: "/admin/governance/reports",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {
        data: {majorIncidentAlerts: Array<{type: string}>};
      }).data.majorIncidentAlerts[0]?.type,
      "override_spike",
    );
  },
);

test(
  "admin governance reports handler rejects non-director institute roles",
  async () => {
    const handler = createAdminGovernanceReportsHandler({
      generateReport: async () => {
        throw new Error("generateReport should not be called");
      },
      verifyIdToken: async () =>
        createDirectorToken({
          instituteId: "inst_build_90",
          role: "teacher",
        }) as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          instituteId: "inst_build_90",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_90_teacher",
        },
        path: "/admin/governance/reports",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only director and vendor roles can access governance reports.",
    );
  },
);

test(
  "admin governance reports handler rejects invalid month format",
  async () => {
    const handler = createAdminGovernanceReportsHandler({
      generateReport: async () => {
        throw new Error("generateReport should not be called");
      },
      verifyIdToken: async () =>
        createDirectorToken({
          instituteId: "inst_build_90",
          uid: "director_build_90_validation",
        }) as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          instituteId: "inst_build_90",
          month: "03-2026",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_90_invalid_month",
        },
        path: "/admin/governance/reports",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 400);
    assertStructuredError(
      response.body,
      "VALIDATION_ERROR",
      "Field \"month\" must match the YYYY-MM format.",
    );
  },
);

test(
  "admin governance reports handler allows vendor cross-institute access",
  async () => {
    const handler = createAdminGovernanceReportsHandler({
      generateReport: async (input) => ({
        disciplineDeviation: {
          deviationLevel: "none",
          disciplineMean: 74,
          disciplineTrend: 1.5,
          disciplineVariance: 5.8,
          summary: "No material discipline deviation detected for the month.",
        },
        governanceIndicators: {
          executionIntegrityScore: 82,
          overrideFrequency: 1,
          phaseCompliancePercent: 77,
          stabilityIndex: 80,
        },
        header: {
          academicYear: input.yearId ?? "2026",
          calibrationVersion: null,
          generatedAt: "2026-04-03T10:00:00.000Z",
          instituteId: input.instituteId ?? "inst_vendor_target_build_90",
          month: input.month ?? "2026-03",
          schemaVersion: 1,
          snapshotDocumentPath:
            `institutes/${input.instituteId ?? "inst_vendor_target_build_90"}` +
            `/academicYears/${input.yearId ?? "2026"}/` +
            "governanceSnapshots/2026_03",
        },
        incidentTimeline: [],
        majorIncidentAlerts: [],
        performance: {
          avgAccuracyPercent: 76,
          avgRawScorePercent: 69,
          disciplineMean: 74,
          stabilityIndex: 80,
          templateVarianceMean: 4.8,
        },
        requestedMonth: input.month,
        riskDistribution: {
          driftProne: 15,
          impulsive: 7,
          overextended: 4,
          stable: 66,
          volatile: 8,
        },
        summary: {
          affectedRunCount: 0,
          incidentCount: 0,
          recoveryActionCount: 0,
        },
        yearId: input.yearId ?? "2026",
      }),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          includePdfExport: false,
          instituteId: "inst_vendor_target_build_90",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_90_vendor",
        },
        path: "/admin/governance/reports",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(
      (response.body as {data: {header: {instituteId: string}}})
        .data.header.instituteId,
      "inst_vendor_target_build_90",
    );
  },
);

test(
  "admin academic year archive handler accepts a vendor-authorized request",
  async () => {
    const handler = createAdminAcademicYearArchiveHandler({
      archiveAcademicYear: async (input) => ({
        academicYearPath:
          `institutes/${input.instituteId}/academicYears/${input.yearId}`,
        archived: true,
        archivedAt: "2026-04-07T00:00:00.000Z",
        bigQuery: {
          datasetId: `institute_${input.instituteId}_archive`,
          projectId: "parabolic-platform-build-101-tests",
          rowsExported: 12,
          sessionsTableId: `sessions_${input.yearId}`,
          skipped: false,
        },
        idempotent: false,
        instituteId: input.instituteId,
        snapshotPath:
          `institutes/${input.instituteId}/academicYears/${input.yearId}/` +
          `governanceSnapshots/${input.yearId}`,
        status: "archived",
        yearId: input.yearId,
      }),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          doubleConfirm: true,
          instituteId: "inst_build_101",
          yearId: "2026",
        },
        headers: {
          "authorization": "Bearer build_101_vendor",
          "user-agent": "node-test",
        },
        path: "/admin/academicYear/archive",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {bigQuery: {rowsExported: number}}})
        .data.bigQuery.rowsExported,
      12,
    );
  },
);

test(
  "admin academic year archive handler requires double confirmation",
  async () => {
    const handler = createAdminAcademicYearArchiveHandler({
      archiveAcademicYear: async () => {
        throw new Error("archiveAcademicYear should not be called");
      },
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          doubleConfirm: false,
          instituteId: "inst_build_101",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_101_vendor",
        },
        path: "/admin/academicYear/archive",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 400);
    assertStructuredError(
      response.body,
      "VALIDATION_ERROR",
      "Field \"doubleConfirm\" must be true to confirm archive execution.",
    );
  },
);

test(
  "admin academic year archive handler surfaces archive validation failures",
  async () => {
    const handler = createAdminAcademicYearArchiveHandler({
      archiveAcademicYear: async () => {
        throw new AcademicYearArchiveValidationError(
          "VALIDATION_ERROR",
          "Archive requires all active sessions to be closed before execution.",
        );
      },
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          doubleConfirm: true,
          instituteId: "inst_build_101",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_101_vendor",
        },
        path: "/admin/academicYear/archive",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 400);
    assertStructuredError(
      response.body,
      "VALIDATION_ERROR",
      "Archive requires all active sessions to be closed before execution.",
    );
  },
);

test("exam session answers handler accepts a valid request", async () => {
  const handler = createExamSessionAnswersHandler({
    persistIncrementalAnswers: async (): Promise<PersistAnswerBatchResult> => ({
      blockedQuestionIds: [],
      ignoredQuestionIds: [],
      lockedQuestionIds: [],
      maxTimeEnforcementLevel: "none",
      maxTimeViolations: [],
      minTimeEnforcementLevel: "none",
      minTimeViolations: [],
      persistedQuestionIds: ["q1"],
      sessionPath:
        "institutes/inst_build_50/academicYears/2026/runs/run_build_50/" +
        "sessions/session_build_50",
      timingMetricsExport: {
        averageTimePerQuestion: 30,
        disciplineIndexInputs: {
          impulsiveAnsweringRiskPercent: 0,
          overthinkingRiskPercent: 0,
        },
        maxTimeViolationCount: 0,
        maxTimeViolationPercent: 0,
        minTimeViolationCount: 0,
        minTimeViolationPercent: 0,
        phaseDeviationFlags: {
          hasMaxTimeDeviation: false,
          hasMinTimeDeviation: false,
        },
        questionLevelCumulativeTimeRecords: [],
        serverValidatedTimingMetrics: {
          evaluatedQuestionCount: 1,
          persistedQuestionCount: 1,
          totalCumulativeTimeSpent: 30,
        },
      },
    }),
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        answers: [],
        instituteId: "inst_build_50",
        millisecondsSinceLastWrite: 5000,
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_answers",
      },
      path: "/exam/session/session_build_50/answers",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(
    (response.body as {data: {persistedQuestionIds: string[]}})
      .data.persistedQuestionIds[0],
    "q1",
  );
});

test("exam session answers handler rejects invalid payloads", async () => {
  const handler = createExamSessionAnswersHandler({
    persistIncrementalAnswers: async () => {
      throw new Error("persistIncrementalAnswers should not be called");
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        answers: [],
        instituteId: "inst_build_50",
        millisecondsSinceLastWrite: -1,
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_answers_invalid",
      },
      path: "/exam/session/session_build_50/answers",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"millisecondsSinceLastWrite\" must be a non-negative integer.",
  );
});

test("exam session answers handler rejects cross-tenant access", async () => {
  const handler = createExamSessionAnswersHandler({
    persistIncrementalAnswers: async () => {
      throw new Error("persistIncrementalAnswers should not be called");
    },
    verifyIdToken: async () =>
      createStudentToken({instituteId: "inst_other_build_50"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        answers: [],
        instituteId: "inst_build_50",
        millisecondsSinceLastWrite: 5000,
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_answers_tenant",
      },
      path: "/exam/session/session_build_50/answers",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "TENANT_MISMATCH",
    "Token instituteId does not match request instituteId.",
  );
});

test("exam session submit handler accepts a valid request", async () => {
  const handler = createExamSessionSubmitHandler({
    submitSession: async (): Promise<SubmissionResult> => ({
      accuracyPercent: 80,
      consecutiveWrongStreakMax: 1,
      disciplineIndex: 72,
      easyRemainingAfterPhase1Percent: 0,
      guessRate: 0,
      hardInPhase1Percent: 0,
      idempotent: false,
      maxTimeViolationPercent: 0,
      minTimeViolationPercent: 0,
      phaseAdherencePercent: 100,
      rawScorePercent: 78,
      riskState: "Stable",
      sessionPath:
        "institutes/inst_build_50/academicYears/2026/runs/run_build_50/" +
        "sessions/session_build_50",
      skipBurstCount: 0,
    }),
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_submit",
      },
      path: "/exam/session/session_build_50/submit",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(
    (response.body as {data: {rawScorePercent: number}})
      .data.rawScorePercent,
    78,
  );
});

test("exam session submit handler rejects cross-tenant access", async () => {
  const handler = createExamSessionSubmitHandler({
    submitSession: async () => {
      throw new Error("submitSession should not be called");
    },
    verifyIdToken: async () =>
      createStudentToken({instituteId: "inst_other_build_50"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_submit_tenant",
      },
      path: "/exam/session/session_build_50/submit",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "TENANT_MISMATCH",
    "Token instituteId does not match request instituteId.",
  );
});

test(
  "exam session submit handler surfaces deterministic submission errors",
  async () => {
    const handler = createExamSessionSubmitHandler({
      submitSession: async () => {
        throw new SubmissionValidationError(
          "SESSION_NOT_ACTIVE",
          "Session must be active before submission.",
        );
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          instituteId: "inst_build_50",
          runId: "run_build_50",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_50_submit_locked",
        },
        path: "/exam/session/session_build_50/submit",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 409);
    assertStructuredError(
      response.body,
      "SESSION_NOT_ACTIVE",
      "Session must be active before submission.",
    );
  },
);

test(
  "internal email queue handler rejects missing authentication",
  async () => {
    const handler = createInternalEmailQueueHandler({
      enqueueEmailJob: async () => {
        throw new Error("enqueueEmailJob should not be called");
      },
      verifyIdToken: async () => createServiceToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          payload: {
            instituteId: "inst_build_50",
          },
          recipientEmail: "alerts.build50@example.com",
          templateType: "high_risk_student_alert",
        },
        path: "/internal/email/queue",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 401);
    assertStructuredError(
      response.body,
      "UNAUTHORIZED",
      "Missing authorization header.",
    );
  },
);

test(
  "vendor simulation environment handler accepts a valid vendor request",
  async () => {
    const handler = createVendorSimulationEnvironmentHandler({
      initializeSimulationEnvironment: async (input) => ({
        environmentPath: `institutes/sim_${input.simulationId}`,
        metadata: {
          calibrationVersion: input.calibrationVersion,
          instituteId: `sim_${input.simulationId}`,
          parameterSnapshot: input.parameterSnapshot,
          riskModelVersion: input.riskModelVersion,
          runCount: input.parameterSnapshot.runCount,
          simulationId: input.simulationId,
          simulationVersion: input.simulationVersion,
          studentCount: input.parameterSnapshot.studentCountPerInstitute,
        },
        wasCreated: true,
      }),
      loadEnvironmentConfig: async () => createEnvironmentConfig("development"),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const request = createMockRequest({
      body: {
        calibrationVersion: "cal_v2026_01",
        parameterSnapshot: {
          archiveSimulationEnabled: true,
          difficultyDistribution: "realistic",
          instituteCount: 5,
          loadIntensity: "medium",
          riskDistributionBias: "balanced",
          runCount: 20,
          studentCountPerInstitute: 200,
          timingAggressiveness: "moderate",
        },
        riskModelVersion: "risk_v3",
        simulationId: "build_76_environment",
        simulationVersion: "sim_v1_preview",
      },
      headers: {
        authorization: "Bearer build_76_vendor",
      },
      path: "/vendor/simulation/environment",
    });
    const response = createMockResponse();

    await handler(request as never, response as never);

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {environmentPath: string}}).data.environmentPath,
      "institutes/sim_build_76_environment",
    );
  },
);

test(
  "vendor simulation environment handler rejects role violations",
  async () => {
    const handler = createVendorSimulationEnvironmentHandler({
      initializeSimulationEnvironment: async () => {
        throw new Error("initializeSimulationEnvironment should not be called");
      },
      loadEnvironmentConfig: async () => {
        throw new Error("loadEnvironmentConfig should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          calibrationVersion: "cal_v2026_01",
          parameterSnapshot: {
            archiveSimulationEnabled: true,
            difficultyDistribution: "realistic",
            instituteCount: 5,
            loadIntensity: "medium",
            riskDistributionBias: "balanced",
            runCount: 20,
            studentCountPerInstitute: 200,
            timingAggressiveness: "moderate",
          },
          riskModelVersion: "risk_v3",
          simulationId: "build_76_environment",
          simulationVersion: "sim_v1_preview",
        },
        headers: {
          authorization: "Bearer build_76_student",
        },
        path: "/vendor/simulation/environment",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can initialize simulation environments.",
    );
  },
);

test(
  "vendor simulation environment handler surfaces environment guards",
  async () => {
    const handler = createVendorSimulationEnvironmentHandler({
      initializeSimulationEnvironment: async () => {
        throw new SimulationEnvironmentValidationError(
          "FORBIDDEN",
          "Synthetic simulation environments can only run in development, " +
            "staging, or test environments.",
        );
      },
      loadEnvironmentConfig: async () => createEnvironmentConfig("production"),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          calibrationVersion: "cal_v2026_01",
          parameterSnapshot: {
            archiveSimulationEnabled: true,
            difficultyDistribution: "realistic",
            instituteCount: 5,
            loadIntensity: "medium",
            riskDistributionBias: "balanced",
            runCount: 20,
            studentCountPerInstitute: 200,
            timingAggressiveness: "moderate",
          },
          riskModelVersion: "risk_v3",
          simulationId: "build_76_environment",
          simulationVersion: "sim_v1_preview",
        },
        headers: {
          authorization: "Bearer build_76_vendor",
        },
        path: "/vendor/simulation/environment",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Synthetic simulation environments can only run in development, " +
        "staging, or test environments.",
    );
  },
);

test(
  "vendor simulation students handler accepts a valid vendor request",
  async () => {
    const handler = createVendorSimulationStudentsHandler({
      generateSyntheticStudents: async (input) => ({
        existingCount: 0,
        generatedCount: 200,
        instituteId: `sim_${input.simulationId}`,
        simulationId: input.simulationId,
        simulationVersion: "sim_v1_preview",
        studentsPath: `institutes/sim_${input.simulationId}/students`,
        topicIds: input.topicIds ?? ["kinematics", "calculus"],
        totalStudentCount: 200,
      }),
      loadEnvironmentConfig: async () => createEnvironmentConfig("development"),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const request = createMockRequest({
      body: {
        simulationId: "build_77_students",
        topicIds: ["kinematics", "calculus", "probability"],
      },
      headers: {
        authorization: "Bearer build_77_vendor",
      },
      path: "/vendor/simulation/students",
    });
    const response = createMockResponse();

    await handler(request as never, response as never);

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {generatedCount: number}}).data.generatedCount,
      200,
    );
  },
);

test(
  "vendor simulation students handler rejects role violations",
  async () => {
    const handler = createVendorSimulationStudentsHandler({
      generateSyntheticStudents: async () => {
        throw new Error("generateSyntheticStudents should not be called");
      },
      loadEnvironmentConfig: async () => {
        throw new Error("loadEnvironmentConfig should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          simulationId: "build_77_students",
        },
        headers: {
          authorization: "Bearer build_77_student",
        },
        path: "/vendor/simulation/students",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can generate synthetic students.",
    );
  },
);

test(
  "vendor simulation students handler surfaces missing environments",
  async () => {
    const handler = createVendorSimulationStudentsHandler({
      generateSyntheticStudents: async () => {
        throw new SimulationStudentGenerationValidationError(
          "NOT_FOUND",
          "Simulation environment must be initialized before generating " +
            "synthetic students.",
        );
      },
      loadEnvironmentConfig: async () => createEnvironmentConfig("development"),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          simulationId: "build_77_missing_environment",
        },
        headers: {
          authorization: "Bearer build_77_vendor",
        },
        path: "/vendor/simulation/students",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 404);
    assertStructuredError(
      response.body,
      "NOT_FOUND",
      "Simulation environment must be initialized before generating " +
        "synthetic students.",
    );
  },
);

test(
  "vendor simulation sessions handler accepts a valid vendor request",
  async () => {
    const handler = createVendorSimulationSessionsHandler({
      generateSyntheticSessions: async (input) => ({
        existingRunCount: 0,
        existingSessionCount: 0,
        generatedRunCount: 2,
        generatedSessionCount: 400,
        instituteId: `sim_${input.simulationId}`,
        runCount: 2,
        sessionsRootPath:
          `institutes/sim_${input.simulationId}/academicYears/` +
          `${input.yearId}/runs`,
        simulationId: input.simulationId,
        simulationVersion: "sim_v1_preview",
        totalStudentCount: 200,
        yearId: input.yearId,
      }),
      loadEnvironmentConfig: async () => createEnvironmentConfig("development"),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const request = createMockRequest({
      body: {
        simulationId: "build_78_sessions",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_78_vendor",
      },
      path: "/vendor/simulation/sessions",
    });
    const response = createMockResponse();

    await handler(request as never, response as never);

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {generatedSessionCount: number}})
        .data.generatedSessionCount,
      400,
    );
  },
);

test(
  "vendor simulation sessions handler rejects role violations",
  async () => {
    const handler = createVendorSimulationSessionsHandler({
      generateSyntheticSessions: async () => {
        throw new Error("generateSyntheticSessions should not be called");
      },
      loadEnvironmentConfig: async () => {
        throw new Error("loadEnvironmentConfig should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          simulationId: "build_78_sessions",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_78_student",
        },
        path: "/vendor/simulation/sessions",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can generate synthetic sessions.",
    );
  },
);

test(
  "vendor simulation sessions handler surfaces missing student prerequisites",
  async () => {
    const handler = createVendorSimulationSessionsHandler({
      generateSyntheticSessions: async () => {
        throw new SimulationSessionGenerationValidationError(
          "NOT_FOUND",
          "Synthetic students must be generated before synthetic sessions.",
        );
      },
      loadEnvironmentConfig: async () => createEnvironmentConfig("development"),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          simulationId: "build_78_missing_students",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_78_vendor",
        },
        path: "/vendor/simulation/sessions",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 404);
    assertStructuredError(
      response.body,
      "NOT_FOUND",
      "Synthetic students must be generated before synthetic sessions.",
    );
  },
);

test(
  "vendor simulation load handler accepts a valid vendor request",
  async () => {
    const handler = createVendorSimulationLoadHandler({
      loadEnvironmentConfig: async () => createEnvironmentConfig("development"),
      runLoadSimulation: async (input) => ({
        analyticsDocumentsCreated: {
          insightSnapshotCount: 12,
          runAnalyticsCount: 2,
          studentYearMetricsCount: 6,
        },
        environmentPath: `institutes/sim_${input.simulationId}`,
        generatedReport: {
          calibrationVersion: "cal_v2026_01",
          completedAt: "server_timestamp" as never,
          createdAt: "server_timestamp" as never,
          failedScenarioCount: 0,
          instituteId: `sim_${input.simulationId}`,
          outputMetrics: {
            averageLatencyMs: 14.2,
            maxFunctionInvocationTimeMs: 104.6,
            overallEstimatedReadAmplification: 3.5,
            totalExecutedOperations: 420,
            totalTransactionConflicts: 0,
          },
          parameterSnapshot: {
            archiveSimulationEnabled: true,
            difficultyDistribution: "realistic",
            instituteCount: 1,
            loadIntensity: "low",
            riskDistributionBias: "balanced",
            runCount: 2,
            studentCountPerInstitute: 6,
            timingAggressiveness: "moderate",
          },
          reportId: `load_${input.simulationId}_${input.yearId}`,
          riskModelVersion: "risk_v3",
          runCount: 2,
          scenarioSummaries: [],
          simulationId: input.simulationId,
          simulationVersion: "sim_v1_preview",
          status: "completed",
          studentCount: 6,
          totalSyntheticSessions: 12,
          yearId: input.yearId,
        },
        reportPath:
          "vendor/simulationReports/reports/" +
          `load_${input.simulationId}_${input.yearId}`,
        reusedExistingReport: false,
      }),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          simulationId: "build_79_load",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_79_vendor",
        },
        path: "/vendor/simulation/load",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {reportPath: string}}).data.reportPath,
      "vendor/simulationReports/reports/load_build_79_load_2026",
    );
  },
);

test(
  "vendor simulation load handler rejects role violations",
  async () => {
    const handler = createVendorSimulationLoadHandler({
      loadEnvironmentConfig: async () => {
        throw new Error("loadEnvironmentConfig should not be called");
      },
      runLoadSimulation: async () => {
        throw new Error("runLoadSimulation should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          simulationId: "build_79_load",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_79_student",
        },
        path: "/vendor/simulation/load",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can run simulation load tests.",
    );
  },
);

test(
  "vendor simulation load handler surfaces missing simulation prerequisites",
  async () => {
    const handler = createVendorSimulationLoadHandler({
      loadEnvironmentConfig: async () => createEnvironmentConfig("development"),
      runLoadSimulation: async () => {
        throw new LoadSimulationValidationError(
          "NOT_FOUND",
          "Synthetic sessions must be generated before load simulation.",
        );
      },
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          simulationId: "build_79_missing_sessions",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_79_vendor",
        },
        path: "/vendor/simulation/load",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 404);
    assertStructuredError(
      response.body,
      "NOT_FOUND",
      "Synthetic sessions must be generated before load simulation.",
    );
  },
);

test(
  "vendor simulation validation handler accepts a valid vendor request",
  async () => {
    const handler = createVendorSimulationValidationHandler({
      loadEnvironmentConfig: async () => createEnvironmentConfig("development"),
      runSimulationValidation: async (input) => ({
        environmentPath: `institutes/sim_${input.simulationId}`,
        reportPath:
          "vendor/simulationReports/reports/" +
          `validation_${input.simulationId}_${input.yearId}`,
        reusedExistingReport: false,
        validationReport: {
          actualPatterns: {},
          actualRiskDistribution: {
            "Drift-Prone": 1,
            "Impulsive": 2,
            "Overextended": 0,
            "Stable": 3,
            "Volatile": 0,
          },
          calibrationVersion: "cal_v2026_01",
          completedAt: "server_timestamp" as never,
          controlledModeImprovement: {
            available: false,
            controlledDisciplineAverage: 78.2,
            controlledPhaseAdherenceAverage: 84.4,
            disciplineLiftPercent: null,
            nonControlledDisciplineAverage: null,
            nonControlledPhaseAdherenceAverage: null,
            phaseAdherenceLiftPercent: null,
          },
          createdAt: "server_timestamp" as never,
          environmentPath: `institutes/sim_${input.simulationId}`,
          expectedPatterns: {},
          expectedRiskDistribution: {
            "Drift-Prone": 1,
            "Impulsive": 1,
            "Overextended": 1,
            "Stable": 3,
            "Volatile": 0,
          },
          instituteId: `sim_${input.simulationId}`,
          parameterSnapshot: {
            archiveSimulationEnabled: true,
            difficultyDistribution: "realistic",
            instituteCount: 1,
            loadIntensity: "low",
            riskDistributionBias: "balanced",
            runCount: 2,
            studentCountPerInstitute: 6,
            timingAggressiveness: "moderate",
          },
          patternDetectionAccuracy: {
            accuracyPercent: 88,
            matchedStudents: 5,
            perPatternAccuracy: {
              easyNeglectActive: 100,
              hardBiasActive: 80,
              rushPatternActive: 80,
              skipBurstActive: 100,
              wrongStreakActive: 80,
            },
            totalStudentsCompared: 5,
          },
          phaseAdherenceVariation: {
            actualStudentAverage: 82,
            actualStudentStandardDeviation: 6.2,
            expectedSessionAverage: 80.5,
            expectedSessionStandardDeviation: 8.1,
            variationDelta: 1.5,
          },
          recommendedCalibrationActions: [],
          reportId: `validation_${input.simulationId}_${input.yearId}`,
          riskClusterStability: {
            averageSeverityDrift: 0.2,
            exactMatchPercent: 80,
            matchedStudents: 4,
            totalStudentsCompared: 5,
          },
          riskDistributionAlignmentPercent: 83.33,
          riskDistributionDelta: {
            "Drift-Prone": 0,
            "Impulsive": 1,
            "Overextended": -1,
            "Stable": 0,
            "Volatile": 0,
          },
          riskModelVersion: "risk_v3",
          simulationId: input.simulationId,
          simulationVersion: "sim_v1_preview",
          sourceLoadReportPath:
            "vendor/simulationReports/reports/" +
            `load_${input.simulationId}_${input.yearId}`,
          stabilityIndexBehavior: {
            actualStabilityIndex: 79.2,
            expectedStabilityIndex: 81.5,
            stabilityDelta: -2.3,
          },
          status: "completed",
          totalStudentsCompared: 6,
          validatedAt: "server_timestamp" as never,
          validationVersion: "build_80_v1",
          yearId: input.yearId,
        },
      }),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          simulationId: "build_80_validation",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_80_vendor",
        },
        path: "/vendor/simulation/validation",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {reportPath: string}}).data.reportPath,
      "vendor/simulationReports/reports/validation_build_80_validation_2026",
    );
  },
);

test(
  "vendor simulation validation handler rejects role violations",
  async () => {
    const handler = createVendorSimulationValidationHandler({
      loadEnvironmentConfig: async () => {
        throw new Error("loadEnvironmentConfig should not be called");
      },
      runSimulationValidation: async () => {
        throw new Error("runSimulationValidation should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          simulationId: "build_80_validation",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_80_student",
        },
        path: "/vendor/simulation/validation",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can run simulation intelligence validation.",
    );
  },
);

test(
  "vendor simulation validation handler surfaces missing analytics " +
    "prerequisites",
  async () => {
    const handler = createVendorSimulationValidationHandler({
      loadEnvironmentConfig: async () =>
        createEnvironmentConfig("development"),
      runSimulationValidation: async () => {
        throw new SimulationValidationError(
          "NOT_FOUND",
          "Simulation analytics outputs must exist before intelligence " +
            "validation.",
        );
      },
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          simulationId: "build_80_missing_analytics",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_80_vendor",
        },
        path: "/vendor/simulation/validation",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 404);
    assertStructuredError(
      response.body,
      "NOT_FOUND",
      "Simulation analytics outputs must exist before intelligence validation.",
    );
  },
);

test(
  "vendor license update handler accepts a valid vendor request",
  async () => {
    const handler = createVendorLicenseUpdateHandler({
      updateInstituteLicense: async (request) => ({
        activeStudentLimit: 250,
        billingPlan: request.billingPlan,
        compatibilityLicensePath: "institutes/inst_build_93/license/main",
        instituteId: request.instituteId,
        licenseHistoryEntryId: "history_build_94",
        licenseHistoryPath:
          "institutes/inst_build_93/licenseHistory/history_build_94",
        licensePath: "institutes/inst_build_93/license/current",
        newLayer: request.newLayer,
        planId: "L2",
        planName: "Controlled",
        previousLayer: "L1",
      }),
      verifyIdToken: async () => createVendorToken({
        uid: "vendor_build_93",
      }) as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          billingPlan: "Controlled",
          instituteId: "inst_build_93",
          newLayer: "L2",
        },
        headers: {
          authorization: "Bearer build_93_vendor",
        },
        path: "/vendor/license/update",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {newLayer: string}}).data.newLayer,
      "L2",
    );
    assert.equal(
      (
        response.body as {
          data: {licenseHistoryEntryId: string};
        }
      ).data.licenseHistoryEntryId,
      "history_build_94",
    );
  },
);

test(
  "vendor license update handler rejects invalid request payloads",
  async () => {
    const handler = createVendorLicenseUpdateHandler({
      updateInstituteLicense: async () => {
        throw new Error("updateInstituteLicense should not be called");
      },
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          billingPlan: "Controlled",
          instituteId: "inst_build_93",
        },
        headers: {
          authorization: "Bearer build_93_vendor",
        },
        path: "/vendor/license/update",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 400);
    assertStructuredError(
      response.body,
      "VALIDATION_ERROR",
      "License field \"newLayer\" must be a string.",
    );
  },
);

test(
  "vendor license update handler rejects role violations",
  async () => {
    const handler = createVendorLicenseUpdateHandler({
      updateInstituteLicense: async () => {
        throw new Error("updateInstituteLicense should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          billingPlan: "Controlled",
          instituteId: "inst_build_93",
          newLayer: "L2",
        },
        headers: {
          authorization: "Bearer build_93_student",
        },
        path: "/vendor/license/update",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can update institute licenses.",
    );
  },
);

test(
  "vendor license update handler maps service validation errors",
  async () => {
    const handler = createVendorLicenseUpdateHandler({
      updateInstituteLicense: async () => {
        throw new LicenseManagementValidationError(
          "NOT_FOUND",
          "Institute \"inst_build_93\" does not exist.",
        );
      },
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          billingPlan: "Controlled",
          instituteId: "inst_build_93",
          newLayer: "L2",
        },
        headers: {
          authorization: "Bearer build_93_vendor",
        },
        path: "/vendor/license/update",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 404);
    assertStructuredError(
      response.body,
      "NOT_FOUND",
      "Institute \"inst_build_93\" does not exist.",
    );
  },
);

test(
  "vendor intelligence initialization handler accepts a valid vendor request",
  async () => {
    const handler = createVendorIntelligenceInitializeHandler({
      initializePlatform: async () => ({
        moduleStatus: {
          adoptionMeasurement: "pending",
          calibrationImpact: "pending",
          churnTracking: "pending",
          growthForecasting: "pending",
          layerDistribution: "pending",
          revenueIntelligence: "pending",
          upgradeConversion: "pending",
        },
        readySourceCount: 2,
        snapshotMonth: "2026-04",
        sourceReadiness: {
          billingSnapshots: {
            accessPattern: "collection",
            collectionPath: "billingSnapshots",
            isAvailable: false,
          },
          governanceSnapshots: {
            accessPattern: "collectionGroup",
            collectionPath:
              "institutes/{instituteId}/academicYears/{yearId}/" +
              "governanceSnapshots",
            isAvailable: true,
          },
          licenseHistory: {
            accessPattern: "collectionGroup",
            collectionPath: "institutes/{instituteId}/licenseHistory",
            isAvailable: false,
          },
          usageMeter: {
            accessPattern: "collectionGroup",
            collectionPath: "institutes/{instituteId}/usageMeter",
            isAvailable: true,
          },
          vendorAggregates: {
            accessPattern: "collection",
            collectionPath: "vendorAggregates",
            isAvailable: false,
          },
        },
        totalSourceCount: 5,
      }),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        headers: {
          authorization: "Bearer build_81_vendor",
        },
        path: "/vendor/intelligence/initialize",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {readySourceCount: number}}).data
        .readySourceCount,
      2,
    );
  },
);

test(
  "vendor calibration simulation handler accepts a valid vendor request",
  async () => {
    const handler = createVendorCalibrationSimulationHandler({
      simulateCalibrationImpact: async (request) => ({
        after: {
          averageProjectedRiskScore: 32.5,
          instituteCount: request.institutes.length,
          riskDistribution: {
            "Drift-Prone": {count: 1, percent: 50},
            "Impulsive": {count: 1, percent: 50},
            "Overextended": {count: 0, percent: 0},
            "Stable": {count: 0, percent: 0},
            "Volatile": {count: 0, percent: 0},
          },
          studentCount: 2,
        },
        before: {
          averageProjectedRiskScore: 25,
          instituteCount: request.institutes.length,
          riskDistribution: {
            "Drift-Prone": {count: 0, percent: 0},
            "Impulsive": {count: 1, percent: 50},
            "Overextended": {count: 0, percent: 0},
            "Stable": {count: 1, percent: 50},
            "Volatile": {count: 0, percent: 0},
          },
          studentCount: 2,
        },
        delta: {
          averageProjectedRiskScore: 7.5,
          riskDistribution: {
            "Drift-Prone": {count: 1, percent: 50},
            "Impulsive": {count: 0, percent: 0},
            "Overextended": {count: 0, percent: 0},
            "Stable": {count: -1, percent: -50},
            "Volatile": {count: 0, percent: 0},
          },
          studentCount: 0,
        },
        institutes: [
          {
            beforeAverageProjectedRiskScore: 25,
            currentCalibrationSourcePath:
              "globalCalibration/cal_v2026_04",
            currentCalibrationVersion: "cal_v2026_04",
            instituteId: request.institutes[0] ?? "inst_build_98_a",
            projectedAverageRiskScore: 32.5,
            riskDistributionDelta: {
              "Drift-Prone": 1,
              "Impulsive": 0,
              "Overextended": 0,
              "Stable": -1,
              "Volatile": 0,
            },
            studentCount: 2,
          },
        ],
        proposedWeights: request.weights,
      }),
      verifyIdToken: async () => createVendorToken({
        uid: "vendor_build_98",
      }) as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          institutes: ["inst_build_98_a"],
          weights: {
            easyNeglectWeight: 0.15,
            guessWeight: 0.45,
            hardBiasWeight: 0.1,
            phaseWeight: 0.15,
            wrongStreakWeight: 0.15,
          },
        },
        headers: {
          authorization: "Bearer build_98_vendor",
        },
        path: "/vendor/calibration/simulate",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (
        response.body as {
          data: {delta: {averageProjectedRiskScore: number}};
        }
      ).data.delta.averageProjectedRiskScore,
      7.5,
    );
  },
);

test(
  "vendor calibration simulation handler rejects invalid request payloads",
  async () => {
    const handler = createVendorCalibrationSimulationHandler({
      simulateCalibrationImpact: async () => {
        throw new Error("simulateCalibrationImpact should not be called");
      },
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          weights: {
            easyNeglectWeight: 0.15,
          },
        },
        headers: {
          authorization: "Bearer build_98_vendor",
        },
        path: "/vendor/calibration/simulate",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 400);
    assertStructuredError(
      response.body,
      "VALIDATION_ERROR",
      "Calibration field \"institutes\" must be an array.",
    );
  },
);

test(
  "vendor calibration simulation handler maps service validation errors",
  async () => {
    const handler = createVendorCalibrationSimulationHandler({
      simulateCalibrationImpact: async () => {
        throw new CalibrationSimulationError(
          "NOT_FOUND",
          "Institute \"inst_build_98_missing\" does not have aggregated " +
            "student metrics available for simulation.",
        );
      },
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          institutes: ["inst_build_98_missing"],
          weights: {
            easyNeglectWeight: 0.15,
            guessWeight: 0.45,
            hardBiasWeight: 0.1,
            phaseWeight: 0.15,
            wrongStreakWeight: 0.15,
          },
        },
        headers: {
          authorization: "Bearer build_98_vendor",
        },
        path: "/vendor/calibration/simulate",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 404);
    assertStructuredError(
      response.body,
      "NOT_FOUND",
      "Institute \"inst_build_98_missing\" does not have aggregated " +
        "student metrics available for simulation.",
    );
  },
);

test(
  "vendor calibration push handler accepts a valid vendor request",
  async () => {
    const handler = createVendorCalibrationPushHandler({
      deployCalibrationVersion: async (request) => ({
        calibrationSourcePath: "globalCalibration/cal_v2026_04",
        deployedInstituteCount: request.targetInstitutes.length,
        deploymentLogId: "build_99_handler_log",
        deployedInstitutes: request.targetInstitutes.map((instituteId) => ({
          calibrationPath:
            `institutes/${instituteId}/calibration/${request.versionId}`,
          calibrationHistoryPath:
            `institutes/${instituteId}/calibrationHistory/` +
            "build_99_handler_log",
          compatibilityLicensePath: `institutes/${instituteId}/license/main`,
          instituteId,
          licensePath: `institutes/${instituteId}/license/current`,
        })),
        vendorCalibrationLogPath:
          "vendorCalibrationLogs/build_99_handler_log",
        versionId: request.versionId,
      }),
      verifyIdToken: async () => createVendorToken({
        uid: "vendor_build_97",
      }) as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          targetInstitutes: ["inst_build_97_a", "inst_build_97_b"],
          versionId: "cal_v2026_04",
        },
        headers: {
          authorization: "Bearer build_97_vendor",
        },
        path: "/vendor/calibration/push",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (
        response.body as {
          data: {deployedInstituteCount: number};
        }
      ).data.deployedInstituteCount,
      2,
    );
    assert.equal(
      (
        response.body as {
          data: {versionId: string};
        }
      ).data.versionId,
      "cal_v2026_04",
    );
  },
);

test(
  "vendor calibration push handler rejects invalid request payloads",
  async () => {
    const handler = createVendorCalibrationPushHandler({
      deployCalibrationVersion: async () => {
        throw new Error("deployCalibrationVersion should not be called");
      },
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          versionId: "cal_v2026_04",
        },
        headers: {
          authorization: "Bearer build_97_vendor",
        },
        path: "/vendor/calibration/push",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 400);
    assertStructuredError(
      response.body,
      "VALIDATION_ERROR",
      "Calibration field \"targetInstitutes\" must be an array.",
    );
  },
);

test(
  "vendor calibration push handler rejects role violations",
  async () => {
    const handler = createVendorCalibrationPushHandler({
      deployCalibrationVersion: async () => {
        throw new Error("deployCalibrationVersion should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          targetInstitutes: ["inst_build_97_a"],
          versionId: "cal_v2026_04",
        },
        headers: {
          authorization: "Bearer build_97_student",
        },
        path: "/vendor/calibration/push",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can deploy calibration models.",
    );
  },
);

test(
  "vendor calibration push handler maps service validation errors",
  async () => {
    const handler = createVendorCalibrationPushHandler({
      deployCalibrationVersion: async () => {
        throw new CalibrationDeploymentError(
          "NOT_FOUND",
          "Calibration version \"cal_v2026_04\" does not exist.",
        );
      },
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          targetInstitutes: ["inst_build_97_a"],
          versionId: "cal_v2026_04",
        },
        headers: {
          authorization: "Bearer build_97_vendor",
        },
        path: "/vendor/calibration/push",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 404);
    assertStructuredError(
      response.body,
      "NOT_FOUND",
      "Calibration version \"cal_v2026_04\" does not exist.",
    );
  },
);

test(
  "vendor intelligence initialization handler rejects role violations",
  async () => {
    const handler = createVendorIntelligenceInitializeHandler({
      initializePlatform: async () => {
        throw new Error("initializePlatform should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        headers: {
          authorization: "Bearer build_81_student",
        },
        path: "/vendor/intelligence/initialize",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can initialize the vendor intelligence platform.",
    );
  },
);

test(
  "vendor revenue analytics handler accepts a valid vendor request",
  async () => {
    const handler = createVendorRevenueAnalyticsHandler({
      computeRevenueAnalytics: async () => ({
        activePayingInstitutes: 2,
        averageRevenuePerInstitute: 3000,
        averageRevenuePerStudent: 20,
        currentCycleId: "2026-04",
        instituteRevenue: [
          {
            activeStudentCount: 120,
            annualRecurringRevenue: 43200,
            averageRevenuePerStudent: 20,
            currentLayer: "L2",
            cycleId: "2026-04",
            instituteId: "inst_build_82_a",
            instituteName: "Build 82 Institute A",
            monthlyRecurringRevenue: 3600,
          },
        ],
        monthlySnapshots: [
          {
            activePayingInstitutes: 2,
            averageRevenuePerInstitute: 3000,
            averageRevenuePerStudent: 20,
            cycleId: "2026-04",
            monthOverMonthGrowthPercent: 20,
            revenueByLayer: {
              L0: 0,
              L1: 2400,
              L2: 3600,
              L3: 0,
            },
            revenueVolatilityIndex: 0.09,
            totalARR: 72000,
            totalMRR: 6000,
            totalStudents: 300,
          },
        ],
        revenueByLayer: {
          L0: 0,
          L1: 2400,
          L2: 3600,
          L3: 0,
        },
        revenueVolatilityIndex: 0.09,
        snapshotMonth: "2026-04",
        totalARR: 72000,
        totalMRR: 6000,
      }),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        headers: {
          authorization: "Bearer build_82_vendor",
        },
        path: "/vendor/intelligence/revenue",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (response.body as {data: {totalMRR: number}}).data.totalMRR,
      6000,
    );
  },
);

test(
  "vendor revenue analytics handler rejects role violations",
  async () => {
    const handler = createVendorRevenueAnalyticsHandler({
      computeRevenueAnalytics: async () => {
        throw new Error("computeRevenueAnalytics should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        headers: {
          authorization: "Bearer build_82_student",
        },
        path: "/vendor/intelligence/revenue",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can access vendor revenue analytics.",
    );
  },
);

test(
  "vendor layer distribution handler accepts a valid vendor request",
  async () => {
    const handler = createVendorLayerDistributionHandler({
      computeLayerDistribution: async () => ({
        averageTimeInLayerDays: [
          {
            averageDays: null,
            instituteCount: 0,
            layer: "L0",
          },
          {
            averageDays: 49,
            instituteCount: 2,
            layer: "L1",
          },
          {
            averageDays: 36.5,
            instituteCount: 2,
            layer: "L2",
          },
          {
            averageDays: 15,
            instituteCount: 1,
            layer: "L3",
          },
        ],
        currentLayerPercentages: {
          L0: 0,
          L1: 33.33,
          L2: 33.33,
          L3: 33.33,
        },
        instituteCountByLayer: {
          L0: 0,
          L1: 1,
          L2: 1,
          L3: 1,
        },
        migrationVelocity: [
          {
            conversionRatePercent: 100,
            fromLayer: "L0",
            migrationsPerMonth: 0.75,
            observedMonthCount: 4,
            targetLayerInstituteCount: 3,
            toLayer: "L1",
            transitionedInstituteCount: 3,
          },
        ],
        snapshotMonth: "2026-04",
        totalInstitutes: 3,
        upgradeFrequencyByInstituteSize: [
          {
            averageUpgradesPerInstitute: 2,
            bucket: "small",
            instituteCount: 1,
            institutesWithUpgradeCount: 1,
            upgradeFrequencyPercent: 100,
            upgradeTransitionCount: 2,
          },
        ],
      }),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        headers: {
          authorization: "Bearer build_83_vendor",
        },
        path: "/vendor/intelligence/layer-distribution",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (
        response.body as {
          data: {currentLayerPercentages: {L1: number}};
        }
      ).data.currentLayerPercentages.L1,
      33.33,
    );
  },
);

test(
  "vendor layer distribution handler rejects role violations",
  async () => {
    const handler = createVendorLayerDistributionHandler({
      computeLayerDistribution: async () => {
        throw new Error("computeLayerDistribution should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        headers: {
          authorization: "Bearer build_83_student",
        },
        path: "/vendor/intelligence/layer-distribution",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can access vendor layer distribution analytics.",
    );
  },
);

test(
  "vendor churn tracking handler accepts a valid vendor request",
  async () => {
    const handler = createVendorChurnTrackingHandler({
      computeChurnTracking: async () => ({
        churnByInstituteSize: [
          {
            baselineInstituteCount: 2,
            bucket: "medium",
            churnRate: 0.5,
            lostInstituteCount: 1,
          },
        ],
        churnByLayer: [
          {
            baselineInstituteCount: 2,
            churnRate: 0.5,
            layer: "L2",
            lostInstituteCount: 1,
          },
        ],
        currentCycleDowngrades: [
          {
            effectiveDate: "2026-04-05T00:00:00.000Z",
            fromLayer: "L2",
            instituteId: "inst_build_84_c",
            instituteName: "Build 84 Institute C",
            toLayer: "L1",
          },
        ],
        engagementDeclines: [
          {
            currentActiveStudents: 180,
            currentLayer: "L1",
            declineCount: 40,
            dropOffRate: 0.1818,
            instituteId: "inst_build_84_c",
            instituteName: "Build 84 Institute C",
            previousActiveStudents: 220,
            sizeBucket: "medium",
          },
        ],
        inactiveInstituteCount: 1,
        inactiveInstitutes: [
          {
            currentLayer: "L2",
            inactiveDays: 31,
            instituteId: "inst_build_84_b",
            instituteName: "Build 84 Institute B",
            lastActivityAt: "2026-03-20T00:00:00.000Z",
          },
        ],
        monthlyChurn: {
          baselineInstituteCount: 4,
          churnRate: 0.25,
          currentCycleId: "2026-04",
          lostInstituteCount: 1,
          previousCycleId: "2026-03",
          retainedInstituteCount: 3,
        },
        snapshotMonth: "2026-04",
      }),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        headers: {
          authorization: "Bearer build_84_vendor",
        },
        path: "/vendor/intelligence/churn",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (
        response.body as {
          data: {monthlyChurn: {lostInstituteCount: number}};
        }
      ).data.monthlyChurn.lostInstituteCount,
      1,
    );
  },
);

test(
  "vendor churn tracking handler rejects role violations",
  async () => {
    const handler = createVendorChurnTrackingHandler({
      computeChurnTracking: async () => {
        throw new Error("computeChurnTracking should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        headers: {
          authorization: "Bearer build_84_student",
        },
        path: "/vendor/intelligence/churn",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can access vendor churn tracking analytics.",
    );
  },
);

test(
  "vendor revenue forecasting handler accepts a valid vendor request",
  async () => {
    const handler = createVendorRevenueForecastingHandler({
      computeRevenueForecast: async () => ({
        infrastructureCostRevenueRatio: {
          currentCostToRevenueRatioPercent: 1.79,
          currentEstimatedMonthlyCostInr: 1250,
          projectedCostToRevenueRatioPercent3Months: 2,
          projectedCostToRevenueRatioPercent6Months: 1.99,
          projectedEstimatedMonthlyCostInr3Months: 2000,
          projectedEstimatedMonthlyCostInr6Months: 2587.5,
        },
        instituteAcquisitionProjection: {
          averageNetNewInstitutesPerMonth: 1,
          currentInstituteCount: 5,
          projectedAcquisitionRatePerMonth: 1,
          projectedInstituteCount3Months: 8,
          projectedInstituteCount6Months: 11,
        },
        observedCycleCount: 4,
        revenueGrowthProjection: {
          averageMonthlyGrowthRatePercent: 14.29,
          averageMonthlyRevenueDelta: 10000,
          currentMRR: 70000,
          projectedARR6Months: 1560000,
          projectedMRR3Months: 100000,
          projectedMRR6Months: 130000,
        },
        snapshotMonth: "2026-04",
        studentVolumeTrend: {
          averageMonthlyGrowthRatePercent: 20,
          averageMonthlyStudentDelta: 100,
          currentActiveStudents: 500,
          projectedActiveStudents3Months: 800,
          projectedActiveStudents6Months: 1100,
          source: "usageMeter",
        },
        upgradeProbability: {
          currentUpgradeableInstituteCount: 4,
          observedUpgradeCountTrailing6Months: 2,
          projectedUpgradeCountNext6Months: 2,
          trailing6MonthUpgradeProbabilityPercent: 50,
        },
      }),
      verifyIdToken: async () => createVendorToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        headers: {
          authorization: "Bearer build_85_vendor",
        },
        path: "/vendor/intelligence/revenue-forecasting",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal(
      (
        response.body as {
          data: {revenueGrowthProjection: {projectedMRR6Months: number}};
        }
      ).data.revenueGrowthProjection.projectedMRR6Months,
      130000,
    );
  },
);

test(
  "vendor revenue forecasting handler rejects role violations",
  async () => {
    const handler = createVendorRevenueForecastingHandler({
      computeRevenueForecast: async () => {
        throw new Error("computeRevenueForecast should not be called");
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        headers: {
          authorization: "Bearer build_85_student",
        },
        path: "/vendor/intelligence/revenue-forecasting",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assertStructuredError(
      response.body,
      "FORBIDDEN",
      "Only vendor roles can access vendor revenue forecasting.",
    );
  },
);
