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
const instituteId = "inst_bwm_014_assignment_browser";
const otherInstituteId = "inst_bwm_014_assignment_other";
const yearId = "2026";
const templateId = "test-bwm-014-assignment";
const canonicalId = "canonical-bwm-014-assignment";
const templateName = "BWM-014 Authoritative Assignment";
const questionId = "question-bwm-014-assignment";
const studentId = "student-bwm-014-recipient";
const studentName = "BWM-014 Recipient Student";
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

function toLocalDateTimeInput(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
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

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();

  adminApp = initializeApp(
    {projectId},
    `admin-assignment-lifecycle-${Date.now()}`,
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

  teacherEmail = `assignment-teacher-${Date.now()}@example.test`;
  teacherPassword = "bwm-014-assignment-teacher";
  const teacher = await auth.createUser({
    email: teacherEmail,
    password: teacherPassword,
  });
  teacherUid = teacher.uid;
  await auth.setCustomUserClaims(teacherUid, {
    instituteId,
    licenseLayer: "L2",
    role: "teacher",
  });

  studentEmail = `assignment-student-${Date.now()}@example.test`;
  studentPassword = "bwm-014-assignment-student";
  const student = await auth.createUser({
    email: studentEmail,
    password: studentPassword,
  });
  studentUid = student.uid;
  await auth.setCustomUserClaims(studentUid, {
    instituteId,
    licenseLayer: "L2",
    role: "student",
    studentId,
  });

  otherTeacherEmail = `assignment-other-${Date.now()}@example.test`;
  otherTeacherPassword = "bwm-014-assignment-other";
  const otherTeacher = await auth.createUser({
    email: otherTeacherEmail,
    password: otherTeacherPassword,
  });
  otherTeacherUid = otherTeacher.uid;
  await auth.setCustomUserClaims(otherTeacherUid, {
    instituteId: otherInstituteId,
    licenseLayer: "L2",
    role: "teacher",
  });

  const institute = firestore.collection("institutes").doc(instituteId);
  const year = institute.collection("academicYears").doc(yearId);
  const otherInstitute = firestore
    .collection("institutes")
    .doc(otherInstituteId);
  await Promise.all([
    institute.set({
      calibrationVersion: "cal-bwm-014",
      profile: {instituteName: "BWM-014 Assignment Institute"},
    }),
    year.set({label: yearId, locked: false, status: "Active"}),
    institute.collection("license").doc("main").set({
      currentLayer: "L2",
      featureFlags: {controlledMode: true, hardMode: true},
    }),
    institute.collection("students").doc(studentId).set({
      batchId: "batch-bwm-014",
      batchName: "BWM-014 Batch",
      email: studentEmail,
      fullName: studentName,
      status: "active",
      studentId,
    }),
    year.collection("studentYearMetrics").doc(studentId).set({
      avgAccuracyPercent: 79,
      avgRawScorePercent: 68,
      batchId: "batch-bwm-014",
      batchName: "BWM-014 Batch",
      disciplineIndex: 84,
      rollingRiskCluster: "low",
      studentId,
      studentName,
      topicWeaknessSummary: "Kinematics",
    }),
    institute.collection("questionBank").doc(questionId).set({
      academicYear: yearId,
      additionalTag: "assignment-browser-proof",
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
      uniqueKey: "bwm-014-assignment-browser-question",
      usedCount: 0,
      version: 1,
    }),
    otherInstitute.set({
      calibrationVersion: "cal-bwm-014-other",
      profile: {instituteName: "BWM-014 Other Institute"},
    }),
    otherInstitute.collection("academicYears").doc(yearId).set({
      label: yearId,
      locked: false,
      status: "Active",
    }),
    otherInstitute.collection("license").doc("main").set({
      currentLayer: "L2",
      featureFlags: {controlledMode: true, hardMode: true},
    }),
  ]);

  await institute.collection("tests").doc(templateId).set({
    allowedModes: ["Operational", "Diagnostic", "Controlled", "Hard"],
    canonicalId,
    createdAt: Timestamp.now(),
    difficultyDistribution: {easy: 1, hard: 0, medium: 0},
    examType: "JEEMains",
    phaseConfigSnapshot: {
      phase1Percent: 100,
      phase2Percent: 0,
      phase3Percent: 0,
    },
    questionIds: [questionId],
    selectionMethod: "manual",
    status: "ready",
    templateName,
    testId: templateId,
    timingProfile: {
      easy: {max: 60, min: 30, recommended: 45},
      hard: {max: 210, min: 150, recommended: 180},
      medium: {max: 150, min: 60, recommended: 105},
    },
    totalDurationMinutes: 30,
    totalRuns: 0,
    updatedAt: Timestamp.now(),
    version: 1,
  });
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
  "Admin completes the authoritative assignment lifecycle without mocks",
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

    const studentListDenied = await request.get("/api/v1/admin/runs", {
      headers: {Authorization: `Bearer ${studentToken}`},
    });
    expect(studentListDenied.status()).toBe(403);
    expect((await studentListDenied.json()).error.code).toBe("FORBIDDEN");

    const otherTenantList = await request.get("/api/v1/admin/runs", {
      headers: {Authorization: `Bearer ${otherTeacherToken}`},
    });
    expect(otherTenantList.status()).toBe(200);
    expect((await otherTenantList.json()).data.runs).toEqual([]);

    let analyticsRequestCount = 0;
    const createResponses = [];
    page.on("request", (browserRequest) => {
      if (new URL(browserRequest.url()).pathname === "/api/v1/admin/analytics") {
        analyticsRequestCount += 1;
      }
    });
    page.on("response", (response) => {
      if (
        new URL(response.url()).pathname === "/api/v1/admin/runs" &&
        response.request().method() === "POST"
      ) {
        createResponses.push(response);
      }
    });

    const initialTemplatesResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/tests" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    const initialStudentsResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/students" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.addInitScript(() => {
      const route = window.sessionStorage.getItem(
        "bwm014.adminAssignmentRoute",
      ) ?? "/admin/assignments/create";
      window.history.replaceState(null, "", route);
    });
    await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    await page.getByLabel("Email", {exact: true}).fill(teacherEmail);
    await page.getByLabel("Password", {exact: true}).fill(teacherPassword);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await Promise.all([initialTemplatesResponse, initialStudentsResponse]);
    await expect(page.locator("#admin-assignments-title"))
      .toBeVisible({timeout: 90_000});

    const templateChoice = page.getByLabel(templateName, {exact: false});
    await expect(templateChoice).toBeVisible();
    await templateChoice.check();
    await page.getByRole("button", {name: "Continue to Mode Selection"})
      .click();
    await page.getByLabel("Operational", {exact: false}).check();
    await page.getByRole("button", {name: "Continue to Recipient Selection"})
      .click();
    await page.getByLabel("Selecting by Individual Student").check();
    const recipientRow = page.getByRole("row").filter({hasText: studentId});
    await expect(recipientRow).toContainText(studentName);
    await recipientRow.getByRole("checkbox").check();
    await expect(
      page.getByLabel("Recipient resolution preview").getByText(
        "1",
        {exact: true},
      ).first(),
    ).toBeVisible();
    await page.getByRole("button", {name: "Continue to Schedule"}).click();

    const scheduledStart = new Date(Date.now() + (2 * 60 * 60 * 1000));
    scheduledStart.setSeconds(0, 0);
    await page.getByLabel("Test Starts").fill(
      toLocalDateTimeInput(scheduledStart),
    );
    await page.getByLabel("Shuffle Question Order").check();
    await page.getByRole("button", {name: "Review Final Snapshot"}).click();
    await expect(page.getByLabel("Assignment confirmation snapshot"))
      .toContainText("1 student");

    const listResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/runs" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("button", {
      name: "Schedule And Publish Assignment",
    }).click();
    await listResponsePromise;
    await expect.poll(() => createResponses.length, {timeout: 90_000})
      .toBe(2);

    const createEnvelopes = await Promise.all(
      createResponses.map((response) => response.json()),
    );
    expect(createResponses.map((response) => response.status()).sort())
      .toEqual([200, 201]);
    expect(createEnvelopes.map((envelope) => envelope.data.disposition).sort())
      .toEqual(["created", "replayed"]);
    const createdRun = createEnvelopes[0].data.run;
    expect(createEnvelopes[1].data.run).toEqual(createdRun);
    expect(createdRun.recipientStudentIds).toEqual([studentId]);
    expect(createdRun.recipientCount).toBe(1);
    expect(createdRun.testId).toBe(templateId);
    expect(createdRun.templateVersion).toBe(1);
    expect(createdRun.status).toBe("scheduled");
    expect(createdRun.shuffleQuestionOrder).toBe(true);

    await expect(page.locator("#admin-assignments-title"))
      .toHaveText("Assignment List");
    await expect(page.locator("#admin-assignments-title"))
      .toBeVisible();
    let createdRow = page.getByRole("row").filter({hasText: createdRun.id});
    await expect(createdRow).toContainText(templateName);
    await expect(createdRow).toContainText(canonicalId);
    await expect(createdRow).toContainText("1 authoritative recipients");

    await page.evaluate(() => {
      window.sessionStorage.setItem(
        "bwm014.adminAssignmentRoute",
        "/admin/assignments/list",
      );
    });
    const reloadListResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/admin/runs" &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    const reloadEnvelope = await (await reloadListResponse).json();
    expect(reloadEnvelope.data.runs.map((run) => run.id))
      .toContain(createdRun.id);
    createdRow = page.getByRole("row").filter({hasText: createdRun.id});
    await expect(createdRow).toBeVisible();

    const detailResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/runs/${createdRun.id}` &&
        response.request().method() === "GET" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await createdRow.getByRole("button", {name: "View Details"}).click();
    const detailEnvelope = await (await detailResponsePromise).json();
    expect(detailEnvelope.data.run).toEqual(createdRun);
    await expect(page.getByRole("heading", {
      name: "Authoritative Assignment Detail",
    })).toBeVisible();
    await expect(page.getByRole("heading", {name: createdRun.id}))
      .toBeVisible();
    await expect(page.getByText(studentId, {exact: true})).toBeVisible();
    await expect(page.getByRole("heading", {
      name: "Outcome analytics unavailable in this contract",
    })).toBeVisible();
    expect(analyticsRequestCount).toBe(0);

    const persistedRun = await firestore.doc(createdRun.runPath).get();
    expect(persistedRun.exists).toBe(true);
    expect(persistedRun.data().recipientStudentIds).toEqual([studentId]);
    expect(persistedRun.data().recipientCount).toBe(1);
    expect(persistedRun.data().canonicalId).toBe(canonicalId);
    expect(persistedRun.data().templateVersion).toBe("1");

    const otherTenantDetail = await request.get(
      `/api/v1/admin/runs/${createdRun.id}`,
      {headers: {Authorization: `Bearer ${otherTeacherToken}`}},
    );
    expect(otherTenantDetail.status()).toBe(404);
    expect((await otherTenantDetail.json()).error.code).toBe("NOT_FOUND");
    const studentDetailDenied = await request.get(
      `/api/v1/admin/runs/${createdRun.id}`,
      {headers: {Authorization: `Bearer ${studentToken}`}},
    );
    expect(studentDetailDenied.status()).toBe(403);
    expect((await studentDetailDenied.json()).error.code).toBe("FORBIDDEN");

    const uiRequestPayload = createResponses[0].request().postDataJSON();
    const concurrentPayload = {
      ...uiRequestPayload,
      idempotencyKey: "bwm-014-concurrent-browser-proof",
    };
    const concurrentResponses = await Promise.all([
      request.post("/api/v1/admin/runs", {
        data: concurrentPayload,
        headers: {Authorization: `Bearer ${teacherToken}`},
      }),
      request.post("/api/v1/admin/runs", {
        data: concurrentPayload,
        headers: {Authorization: `Bearer ${teacherToken}`},
      }),
    ]);
    expect(concurrentResponses.map((response) => response.status()).sort())
      .toEqual([200, 201]);
    const concurrentEnvelopes = await Promise.all(
      concurrentResponses.map((response) => response.json()),
    );
    expect(
      concurrentEnvelopes.map((envelope) => envelope.data.disposition).sort(),
    ).toEqual(["created", "replayed"]);
    expect(concurrentEnvelopes[0].data.run.id)
      .toBe(concurrentEnvelopes[1].data.run.id);
    expect(concurrentEnvelopes[0].data.run.recipientStudentIds)
      .toEqual([studentId]);

    const finalRuns = await firestore
      .collection("institutes")
      .doc(instituteId)
      .collection("academicYears")
      .doc(yearId)
      .collection("runs")
      .get();
    expect(finalRuns.size).toBe(2);
    const finalTemplate = await firestore
      .collection("institutes")
      .doc(instituteId)
      .collection("tests")
      .doc(templateId)
      .get();
    expect(finalTemplate.data().totalRuns).toBe(2);
  },
);
