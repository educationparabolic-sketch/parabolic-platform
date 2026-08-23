import {createRequire} from "node:module";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {
  deleteApp,
  initializeApp,
} = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const {
  getAuth,
} = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const {
  getFirestore,
  Timestamp,
} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");

const projectId = "demo-parabolic-test";
const instituteId = "inst_bwm_013_template_browser";
const otherInstituteId = "inst_bwm_013_template_other";
const yearId = "2026";
const questionId = "question-bwm-013-browser";
const studentId = "student-bwm-013-browser";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let adminApp;
let firestore;
let teacherEmail;
let teacherPassword;
let teacherUid;
let studentEmail;
let studentPassword;
let studentUid;
let otherTeacherEmail;
let otherTeacherPassword;
let otherTeacherUid;

test.use({bypassCSP: true});

function templateMutationBody(templateName, canonicalId) {
  return {
    canonicalId,
    difficultyDistribution: {easy: 1, hard: 0, medium: 0},
    examType: "JEEMains",
    questionIds: [questionId],
    selectionMethod: "manual",
    templateName,
    timingProfile: {
      easy: {maxSeconds: 60, minSeconds: 30, recommendedSeconds: 45},
      hard: {maxSeconds: 210, minSeconds: 150, recommendedSeconds: 180},
      medium: {maxSeconds: 150, minSeconds: 60, recommendedSeconds: 105},
    },
    totalDurationMinutes: 180,
  };
}

async function signInThroughAuthEmulator(request, email, password) {
  const response = await request.post(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=demo-api-key",
    {data: {email, password, returnSecureToken: true}},
  );
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.idToken).toBeTruthy();
  return payload.idToken;
}

async function createTemplateThroughApi(request, token, name, canonicalId) {
  const response = await request.post("/api/v1/admin/tests", {
    data: templateMutationBody(name, canonicalId),
    headers: {Authorization: `Bearer ${token}`},
  });
  expect(response.status()).toBe(201);
  const envelope = await response.json();
  expect(envelope.success).toBe(true);
  expect(envelope.data.template.status).toBe("draft");
  expect(envelope.data.template.version).toBe(1);
  return envelope.data.template;
}

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();

  adminApp = initializeApp(
    {projectId},
    `admin-template-lifecycle-${Date.now()}`,
  );
  firestore = getFirestore(adminApp);
  const auth = getAuth(adminApp);

  await Promise.all([
    firestore.recursiveDelete(
      firestore.collection("institutes").doc(instituteId),
    ),
    firestore.recursiveDelete(
      firestore.collection("institutes").doc(otherInstituteId),
    ),
  ]);

  teacherEmail = `template-teacher-${Date.now()}@example.test`;
  teacherPassword = "bwm-013-template-teacher";
  const teacher = await auth.createUser({
    email: teacherEmail,
    password: teacherPassword,
  });
  teacherUid = teacher.uid;
  await auth.setCustomUserClaims(teacherUid, {
    instituteId,
    licenseLayer: "L1",
    role: "teacher",
  });

  studentEmail = `template-student-${Date.now()}@example.test`;
  studentPassword = "bwm-013-template-student";
  const student = await auth.createUser({
    email: studentEmail,
    password: studentPassword,
  });
  studentUid = student.uid;
  await auth.setCustomUserClaims(studentUid, {
    instituteId,
    licenseLayer: "L1",
    role: "student",
    studentId,
  });

  otherTeacherEmail = `template-other-${Date.now()}@example.test`;
  otherTeacherPassword = "bwm-013-template-other";
  const otherTeacher = await auth.createUser({
    email: otherTeacherEmail,
    password: otherTeacherPassword,
  });
  otherTeacherUid = otherTeacher.uid;
  await auth.setCustomUserClaims(otherTeacherUid, {
    instituteId: otherInstituteId,
    licenseLayer: "L1",
    role: "teacher",
  });

  const institute = firestore.collection("institutes").doc(instituteId);
  await Promise.all([
    institute.set({
      calibrationVersion: "cal-bwm-013",
      profile: {instituteName: "BWM-013 Template Institute"},
    }),
    firestore.collection("institutes").doc(otherInstituteId).set({
      profile: {instituteName: "BWM-013 Other Institute"},
    }),
    institute.collection("academicYears").doc(yearId).set({
      label: yearId,
      locked: false,
      status: "Active",
    }),
    institute.collection("license").doc("main").set({
      currentLayer: "L1",
      featureFlags: {controlledMode: false, hardMode: false},
    }),
    institute.collection("students").doc(studentId).set({
      status: "active",
      studentId,
    }),
    institute.collection("questionBank").doc(questionId).set({
      academicYear: yearId,
      additionalTag: "browser-proof",
      chapter: "Kinematics",
      correctAnswer: "A",
      createdAt: Timestamp.now(),
      difficulty: "Easy",
      examType: "JEEMains",
      internalNotes: null,
      lastUsedAt: null,
      marks: 4,
      negativeMarks: 1,
      parentQuestionId: null,
      primaryTag: "mechanics",
      questionId,
      questionImageUrl: "",
      questionType: "MCQ",
      simulationLink: null,
      solutionImageUrl: "",
      status: "active",
      subject: "Physics",
      tags: ["mechanics", "motion"],
      topic: "Motion",
      tutorialVideoLink: null,
      uniqueKey: "bwm-013-browser-question",
      usedCount: 0,
      version: 1,
    }),
    institute.collection("tests").doc("archived-seed").set({
      canonicalId: "archived-seed-canonical",
      createdAt: Timestamp.now(),
      difficultyDistribution: {easy: 1, hard: 0, medium: 0},
      examType: "JEEMains",
      questionIds: [questionId],
      selectionMethod: "manual",
      status: "archived",
      templateName: "Archived hydration seed",
      testId: "archived-seed",
      timingProfile: {
        easy: {max: 60, min: 30, recommended: 45},
        hard: {max: 210, min: 150, recommended: 180},
        medium: {max: 150, min: 60, recommended: 105},
      },
      totalDurationMinutes: 180,
      totalRuns: 0,
      updatedAt: Timestamp.now(),
      version: 1,
    }),
  ]);
});

test.afterAll(async () => {
  if (!adminApp) {
    return;
  }

  await Promise.all([
    firestore.recursiveDelete(
      firestore.collection("institutes").doc(instituteId),
    ),
    firestore.recursiveDelete(
      firestore.collection("institutes").doc(otherInstituteId),
    ),
  ]);
  const userIds = [teacherUid, studentUid, otherTeacherUid].filter(Boolean);
  if (userIds.length > 0) {
    await getAuth(adminApp).deleteUsers(userIds);
  }
  await deleteApp(adminApp);
});

test(
  "Admin completes the authoritative template lifecycle without network mocks",
  async ({page, request}) => {
    test.setTimeout(300_000);

    const teacherToken = await signInThroughAuthEmulator(
      request,
      teacherEmail,
      teacherPassword,
    );
    const studentToken = await signInThroughAuthEmulator(
      request,
      studentEmail,
      studentPassword,
    );
    const otherTeacherToken = await signInThroughAuthEmulator(
      request,
      otherTeacherEmail,
      otherTeacherPassword,
    );

    const roleDenied = await request.post("/api/v1/admin/tests", {
      data: templateMutationBody(
        "Student must not create",
        "student-denied-canonical",
      ),
      headers: {Authorization: `Bearer ${studentToken}`},
    });
    expect(roleDenied.status()).toBe(403);
    expect((await roleDenied.json()).error.code).toBe("FORBIDDEN");

    const draftForGuard = await createTemplateThroughApi(
      request,
      teacherToken,
      "Draft assignment guard",
      "draft-assignment-guard-canonical",
    );
    const now = Date.now();
    const draftAssignment = await request.post("/api/v1/admin/runs", {
      data: {
        academicYear: yearId,
        attemptLimit: 1,
        endWindow: new Date(now + 90 * 60 * 1000).toISOString(),
        expectedTemplateVersion: draftForGuard.version,
        gracePeriodMinutes: 5,
        idempotencyKey: "bwm-013-draft-assignment-guard",
        mode: "Operational",
        proctoringPolicy: {
          browserIntegrityGuardEnabled: true,
          faceIdentityGazeGuardEnabled: false,
        },
        recipientStudentIds: [studentId],
        shuffleQuestionOrder: false,
        startWindow: new Date(now + 30 * 60 * 1000).toISOString(),
        testId: draftForGuard.id,
        timezone: "Asia/Kolkata",
      },
      headers: {Authorization: `Bearer ${teacherToken}`},
    });
    expect(draftAssignment.status()).toBe(400);
    const draftAssignmentEnvelope = await draftAssignment.json();
    expect(draftAssignmentEnvelope.error.code).toBe("VALIDATION_ERROR");
    expect(draftAssignmentEnvelope.error.message).toContain(
      "Template status must be \"ready\" or \"assigned\"",
    );
    expect(
      (await firestore
        .doc(
          `institutes/${instituteId}/academicYears/${yearId}/runs/` +
            "run-bwm-013-draft-rejection",
        )
        .get()).exists,
    ).toBe(false);

    const firstConcurrentUpdate = {
      ...templateMutationBody(
        "Concurrent update A",
        "draft-assignment-guard-v2-a",
      ),
      expectedVersion: 1,
    };
    const secondConcurrentUpdate = {
      ...templateMutationBody(
        "Concurrent update B",
        "draft-assignment-guard-v2-b",
      ),
      expectedVersion: 1,
    };
    const concurrentUpdateResponses = await Promise.all([
      request.patch(`/api/v1/admin/tests/${draftForGuard.id}`, {
        data: firstConcurrentUpdate,
        headers: {Authorization: `Bearer ${teacherToken}`},
      }),
      request.patch(`/api/v1/admin/tests/${draftForGuard.id}`, {
        data: secondConcurrentUpdate,
        headers: {Authorization: `Bearer ${teacherToken}`},
      }),
    ]);
    expect(concurrentUpdateResponses.map((response) => response.status()).sort())
      .toEqual([200, 409]);
    const successfulConcurrentUpdate = concurrentUpdateResponses.find(
      (response) => response.status() === 200,
    );
    const successfulConcurrentEnvelope = await successfulConcurrentUpdate.json();
    expect(successfulConcurrentEnvelope.data.template.version).toBe(2);
    const concurrentVersionOne = await firestore.doc(
      `institutes/${instituteId}/tests/${draftForGuard.id}/` +
        "versionSnapshots/1",
    ).get();
    expect(concurrentVersionOne.exists).toBe(true);
    expect(concurrentVersionOne.data().templateName).toBe(
      "Draft assignment guard",
    );

    const lifecycleConcurrencyTemplate = await createTemplateThroughApi(
      request,
      teacherToken,
      "Lifecycle concurrency",
      "lifecycle-concurrency-canonical",
    );
    const concurrentPublishResponses = await Promise.all([
      request.post(
        `/api/v1/admin/tests/${lifecycleConcurrencyTemplate.id}/publish`,
        {
          data: {expectedVersion: 1},
          headers: {Authorization: `Bearer ${teacherToken}`},
        },
      ),
      request.post(
        `/api/v1/admin/tests/${lifecycleConcurrencyTemplate.id}/publish`,
        {
          data: {expectedVersion: 1},
          headers: {Authorization: `Bearer ${teacherToken}`},
        },
      ),
    ]);
    expect(concurrentPublishResponses.map((response) => response.status()))
      .toEqual([200, 200]);
    const concurrentPublishEnvelopes = await Promise.all(
      concurrentPublishResponses.map((response) => response.json()),
    );
    expect(concurrentPublishEnvelopes[0].data.auditId).toBe(
      concurrentPublishEnvelopes[1].data.auditId,
    );
    expect(concurrentPublishEnvelopes[0].data.template.status).toBe("ready");

    const initialTemplatesResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/tests" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    const initialQuestionsResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/v1/admin/questions/library" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.addInitScript(() => {
      window.history.replaceState(null, "", "/admin/tests/create");
    });
    await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    await page.getByLabel("Email", {exact: true}).fill(teacherEmail);
    await page.getByLabel("Password", {exact: true}).fill(teacherPassword);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await Promise.all([initialTemplatesResponse, initialQuestionsResponse]);
    await expect(
      page.getByRole("heading", {name: "Teacher Test Workspace"}),
    ).toBeVisible({timeout: 90_000});

    const createdName = "BWM-013 Browser Template";
    await page.getByLabel("Template Name").fill(createdName);
    await page.getByRole("button", {
      name: "Continue to Choose Questions",
    }).click();
    await page.getByLabel("How Many Questions Do You Want?").fill("1");
    const questionRow = page.getByRole("row").filter({hasText: questionId});
    await questionRow.getByRole("checkbox").check();
    await page.getByRole("button", {
      name: "Continue to Timing Strategy",
    }).click();
    await page.getByRole("button", {name: "Continue to Review Time"}).click();

    const createResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/tests" &&
        response.request().method() === "POST" &&
        response.status() === 201,
      {timeout: 90_000},
    );
    const createReloadPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/tests" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("button", {name: "Create Test"}).click();
    const createEnvelope = await (await createResponsePromise).json();
    await createReloadPromise;
    const browserTemplate = createEnvelope.data.template;
    expect(browserTemplate.id).toBeTruthy();
    expect(browserTemplate.status).toBe("draft");
    expect(browserTemplate.version).toBe(1);
    await expect(page.getByText(
      new RegExp(`Draft template created as ${browserTemplate.id}`),
    )).toBeVisible();

    const otherTenantDenied = await request.post(
      `/api/v1/admin/tests/${browserTemplate.id}/publish`,
      {
        data: {expectedVersion: 1},
        headers: {Authorization: `Bearer ${otherTeacherToken}`},
      },
    );
    expect(otherTenantDenied.status()).toBe(404);
    expect((await otherTenantDenied.json()).error.code).toBe("NOT_FOUND");
    const studentPublishDenied = await request.post(
      `/api/v1/admin/tests/${browserTemplate.id}/publish`,
      {
        data: {expectedVersion: 1},
        headers: {Authorization: `Bearer ${studentToken}`},
      },
    );
    expect(studentPublishDenied.status()).toBe(403);
    expect((await studentPublishDenied.json()).error.code).toBe("FORBIDDEN");

    await page.getByRole("link", {name: "Test Library"}).click();
    let templateRow = page.getByRole("row").filter({hasText: createdName});
    await expect(templateRow).toBeVisible();
    await templateRow.getByRole("button", {name: "Edit"}).click();

    const editedName = "BWM-013 Browser Template Edited";
    await page.getByLabel("Template Name").fill(editedName);
    await page.getByRole("button", {
      name: "Continue to Choose Questions",
    }).click();
    await page.getByRole("button", {
      name: "Continue to Timing Strategy",
    }).click();
    await page.getByRole("button", {name: "Continue to Review Time"}).click();

    const updateResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/tests/${browserTemplate.id}` &&
        response.request().method() === "PATCH" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    const updateReloadPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/tests" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("button", {name: "Save Test Changes"}).click();
    const updateEnvelope = await (await updateResponsePromise).json();
    await updateReloadPromise;
    expect(updateEnvelope.data.template.id).toBe(browserTemplate.id);
    expect(updateEnvelope.data.template.version).toBe(2);

    const browserVersionOneReference = firestore.doc(
      `institutes/${instituteId}/tests/${browserTemplate.id}/` +
        "versionSnapshots/1",
    );
    const browserVersionOne = await browserVersionOneReference.get();
    expect(browserVersionOne.exists).toBe(true);
    expect(browserVersionOne.data().templateName).toBe(createdName);
    expect(browserVersionOne.data().version).toBe(1);

    await page.getByRole("link", {name: "Test Library"}).click();
    templateRow = page.getByRole("row").filter({hasText: editedName});
    await expect(templateRow).toBeVisible();
    await templateRow.getByRole("button", {name: "Ready"}).click();

    const publishResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/tests/${browserTemplate.id}/publish` &&
        response.status() === 200,
      {timeout: 90_000},
    );
    const publishReloadPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/tests" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("button", {name: "Confirm Mark Ready"}).click();
    const publishEnvelope = await (await publishResponsePromise).json();
    await publishReloadPromise;
    expect(publishEnvelope.data.template.status).toBe("ready");
    expect(publishEnvelope.data.template.version).toBe(2);
    await expect(page.getByText(
      new RegExp(`published with audit ${publishEnvelope.data.auditId}`),
    )).toBeVisible();

    const publishRetry = await request.post(
      `/api/v1/admin/tests/${browserTemplate.id}/publish`,
      {
        data: {expectedVersion: 2},
        headers: {Authorization: `Bearer ${teacherToken}`},
      },
    );
    expect(publishRetry.status()).toBe(200);
    const publishRetryEnvelope = await publishRetry.json();
    expect(publishRetryEnvelope.data.auditId).toBe(
      publishEnvelope.data.auditId,
    );

    templateRow = page.getByRole("row").filter({hasText: editedName});
    const archiveResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/tests/${browserTemplate.id}/archive` &&
        response.status() === 200,
      {timeout: 90_000},
    );
    const archiveReloadPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/tests" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await templateRow.getByRole("button", {name: "Archive"}).click();
    const archiveEnvelope = await (await archiveResponsePromise).json();
    await archiveReloadPromise;
    expect(archiveEnvelope.data.template.status).toBe("archived");
    expect(archiveEnvelope.data.template.version).toBe(2);
    await expect(page.getByText(
      new RegExp(`archived with audit ${archiveEnvelope.data.auditId}`),
    )).toBeVisible();

    const archiveRetry = await request.post(
      `/api/v1/admin/tests/${browserTemplate.id}/archive`,
      {
        data: {expectedVersion: 2},
        headers: {Authorization: `Bearer ${teacherToken}`},
      },
    );
    expect(archiveRetry.status()).toBe(200);
    expect((await archiveRetry.json()).data.auditId).toBe(
      archiveEnvelope.data.auditId,
    );

    const finalTemplate = await firestore.doc(
      `institutes/${instituteId}/tests/${browserTemplate.id}`,
    ).get();
    expect(finalTemplate.data().status).toBe("archived");
    expect(finalTemplate.data().version).toBe(2);
    expect((await browserVersionOneReference.get()).data().templateName)
      .toBe(createdName);
    expect((await firestore.doc(
      `institutes/${instituteId}/tests/${browserTemplate.id}/` +
        "versionSnapshots/2",
    ).get()).exists).toBe(false);

    const auditSnapshot = await firestore
      .collection("institutes")
      .doc(instituteId)
      .collection("auditLogs")
      .get();
    const browserAudits = auditSnapshot.docs
      .map((document) => document.data())
      .filter((audit) => audit.targetId === browserTemplate.id);
    expect(browserAudits).toHaveLength(2);
    expect(browserAudits.map((audit) => audit.actionType).sort()).toEqual([
      "ACTIVATE_TEST_TEMPLATE",
      "ARCHIVE_TEST_TEMPLATE",
    ]);
    expect(browserAudits.every((audit) => audit.timestamp instanceof Timestamp))
      .toBe(true);
    const publishAudit = browserAudits.find(
      (audit) => audit.actionType === "ACTIVATE_TEST_TEMPLATE",
    );
    const archiveAudit = browserAudits.find(
      (audit) => audit.actionType === "ARCHIVE_TEST_TEMPLATE",
    );
    expect(publishAudit.before.status).toBe("draft");
    expect(publishAudit.after.status).toBe("ready");
    expect(archiveAudit.before.status).toBe("ready");
    expect(archiveAudit.after.status).toBe("archived");
  },
);
