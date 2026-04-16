import assert from "node:assert/strict";
import test from "node:test";
import {createAdminSettingsHandler} from "../api/adminSettings";
import {AdminSettingsValidationError} from "../types/adminSettings";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_125",
  licenseLayer: "L3",
  role: "admin",
  uid: "admin_build_125",
  ...overrides,
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
    success: boolean;
  };

  assert.equal(errorResponse.error.code, expectedCode);
  assert.equal(errorResponse.error.message, expectedMessage);
  assert.equal(errorResponse.success, false);
};

test("admin settings handler accepts snapshot read request", async () => {
  const handler = createAdminSettingsHandler({
    executeRequest: async () => ({
      actionType: "GET_SETTINGS_SNAPSHOT",
      snapshot: {
        academicYears: [],
        executionPolicy: {
          advancedControls: {
            adaptivePhaseEnabled: true,
            hardModeAvailable: false,
            manualOverrideAllowed: false,
          },
          alertFrequencyPolicy: {
            alertCooldownInterval: 10,
            escalationThreshold: 3,
            maxAlertsPerSection: 2,
          },
          phaseSplit: {
            phase1Percent: 30,
            phase2Percent: 40,
            phase3Percent: 30,
          },
          timingPresets: {},
        },
        dataArchiveControls: {
          dataRetentionPolicy: {
            autoArchiveSchedule: "monthly",
            autoExportThreshold: 1000,
            rawSessionRetentionYears: 2,
          },
          storageSummary: {
            activeSessionCount: 0,
            archivedAcademicYears: 0,
            bigQueryArchiveSize: "Unknown",
            firestoreHotUsage: "Unknown",
          },
        },
        featureFlags: {
          enableBetaUi: false,
          enableExperimentalAnalytics: false,
          enableLlmMonthlySummary: false,
          toggleAdvancedPhaseVisualization: false,
        },
        layerConfiguration: {
          currentLayer: "L3",
          eligibilityStatus: "Eligible",
          featureFlags: {},
        },
        profile: {
          academicYearFormat: "YYYY-YY",
          contactEmail: "ops@example.org",
          contactPhone: "+1-555-0100",
          defaultExamType: "JEE_MAIN",
          instituteName: "Build 125 Institute",
          logoReference: "logos/build-125.png",
          timeZone: "Asia/Kolkata",
        },
        security: {
          allowMultipleAdminSessions: false,
          emailConfiguration: {
            notificationToggles: true,
            senderName: "Build 125",
          },
          examControls: {
            blockRightClick: true,
            enforceFullscreen: true,
            tabSwitchWarning: true,
            tamperDetectionAlerts: false,
          },
          forceLogoutOnPasswordChange: true,
          sessionTimeoutDuration: 30,
        },
        users: [],
      },
    }),
    verifyIdToken: async () => createAdminToken() as never,
  });

  const request = createMockRequest({
    body: {
      actionType: "GET_SETTINGS_SNAPSHOT",
      instituteId: "inst_build_125",
    },
    headers: {
      authorization: "Bearer build_125_token",
    },
    path: "/admin/settings",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin settings handler rejects non-admin/director role", async () => {
  const handler = createAdminSettingsHandler({
    executeRequest: async () => {
      throw new Error("executeRequest should not be called");
    },
    verifyIdToken: async () =>
      createAdminToken({role: "teacher"}) as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        actionType: "GET_SETTINGS_SNAPSHOT",
        instituteId: "inst_build_125",
      },
      headers: {
        authorization: "Bearer build_125_teacher",
      },
      path: "/admin/settings",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin and director roles can access settings configuration.",
  );
});

test("admin settings handler allows director snapshot read", async () => {
  const handler = createAdminSettingsHandler({
    executeRequest: async () => ({
      actionType: "GET_SETTINGS_SNAPSHOT",
      snapshot: {
        academicYears: [],
        dataArchiveControls: {
          dataRetentionPolicy: {
            autoArchiveSchedule: "monthly",
            autoExportThreshold: 1000,
            rawSessionRetentionYears: 2,
          },
          storageSummary: {
            activeSessionCount: 0,
            archivedAcademicYears: 0,
            bigQueryArchiveSize: "Unknown",
            firestoreHotUsage: "Unknown",
          },
        },
        executionPolicy: {
          advancedControls: {
            adaptivePhaseEnabled: true,
            hardModeAvailable: false,
            manualOverrideAllowed: false,
          },
          alertFrequencyPolicy: {
            alertCooldownInterval: 10,
            escalationThreshold: 3,
            maxAlertsPerSection: 2,
          },
          phaseSplit: {
            phase1Percent: 30,
            phase2Percent: 40,
            phase3Percent: 30,
          },
          timingPresets: {},
        },
        featureFlags: {
          enableBetaUi: false,
          enableExperimentalAnalytics: false,
          enableLlmMonthlySummary: false,
          toggleAdvancedPhaseVisualization: false,
        },
        layerConfiguration: {
          currentLayer: "L3",
          eligibilityStatus: "Eligible",
          featureFlags: {},
        },
        profile: {
          academicYearFormat: "YYYY-YY",
          contactEmail: "ops@example.org",
          contactPhone: "+1-555-0100",
          defaultExamType: "JEE_MAIN",
          instituteName: "Build 125 Institute",
          logoReference: "logos/build-125.png",
          timeZone: "Asia/Kolkata",
        },
        security: {
          allowMultipleAdminSessions: false,
          emailConfiguration: {
            notificationToggles: true,
            senderName: "Build 125",
          },
          examControls: {
            blockRightClick: true,
            enforceFullscreen: true,
            tabSwitchWarning: true,
            tamperDetectionAlerts: false,
          },
          forceLogoutOnPasswordChange: true,
          sessionTimeoutDuration: 30,
        },
        users: [],
      },
    }),
    verifyIdToken: async () => createAdminToken({role: "director", uid: "director_build_125"}) as never,
  });

  const request = createMockRequest({
    body: {
      actionType: "GET_SETTINGS_SNAPSHOT",
      instituteId: "inst_build_125",
    },
    headers: {
      authorization: "Bearer build_125_director",
    },
    path: "/admin/settings",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin settings handler maps validation errors", async () => {
  const handler = createAdminSettingsHandler({
    executeRequest: async () => {
      throw new AdminSettingsValidationError(
        "VALIDATION_ERROR",
        "executionPolicy.phaseSplit must sum to 100.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const request = createMockRequest({
    body: {
      actionType: "UPDATE_EXECUTION_POLICY",
      executionPolicy: {
        advancedControls: {
          adaptivePhaseEnabled: true,
          hardModeAvailable: false,
          manualOverrideAllowed: false,
        },
        alertFrequencyPolicy: {
          alertCooldownInterval: 10,
          escalationThreshold: 3,
          maxAlertsPerSection: 2,
        },
        phaseSplit: {
          phase1Percent: 10,
          phase2Percent: 10,
          phase3Percent: 10,
        },
        timingPresets: {
          JEE_MAIN: {
            easy: {max: 120, min: 30},
            hard: {max: 240, min: 90},
            medium: {max: 180, min: 60},
          },
        },
      },
      instituteId: "inst_build_125",
    },
    headers: {
      authorization: "Bearer build_125_token",
    },
    path: "/admin/settings",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "executionPolicy.phaseSplit must sum to 100.",
  );
});
