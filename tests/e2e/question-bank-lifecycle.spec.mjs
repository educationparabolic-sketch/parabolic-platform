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
} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");
const {
  getStorage,
} = require("../../functions/node_modules/firebase-admin/lib/storage/index.js");

const projectId = "demo-parabolic-test";
const instituteId = "inst_bwm_027_lifecycle_browser";
const otherInstituteId = "inst_bwm_027_lifecycle_other";
const questionAssetsBucket = process.env.QUESTION_ASSETS_BUCKET ??
  `${projectId}.appspot.com`;
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let adminApp;
let firestore;
let storageBucket;
let resourcesCleaned = false;
const users = {};

test.use({bypassCSP: true});

function question(questionId, overrides = {}) {
  const createdAt = overrides.createdAt ?? new Date("2026-09-10T12:00:00.000Z");
  return {
    academicYear: "2026-2027",
    additionalTag: "Mechanics",
    chapter: "Motion",
    correctAnswer: "A",
    createdAt,
    difficulty: "Medium",
    examType: "JEEMains",
    internalNotes: null,
    lastUsedAcademicYear: null,
    lastUsedAt: null,
    marks: 4,
    negativeMarks: 1,
    parentQuestionId: null,
    primaryTag: "Kinematics",
    questionId,
    questionImageUrl: "",
    questionText: `Authoritative prompt for ${questionId}`,
    questionType: "MCQ",
    revision: 1,
    searchTokens: [questionId.toLowerCase(), "motion"],
    secondaryTag: "Velocity",
    simulationLink: null,
    solutionImageUrl: "",
    status: "active",
    subject: "Physics",
    tags: ["Kinematics", "Velocity", "Mechanics"],
    topic: "Uniform motion",
    tutorialVideoLink: null,
    uniqueKey: `KEY-${questionId}`,
    updatedAt: createdAt,
    usedCount: 0,
    usedInTemplate: false,
    version: 1,
    ...overrides,
  };
}

async function createUser(auth, key, claims) {
  const email = `${key}-${Date.now()}@example.test`;
  const password = `bwm-027-${key}-password`;
  const created = await auth.createUser({email, password});
  await auth.setCustomUserClaims(created.uid, claims);
  users[key] = {email, password, uid: created.uid};
}

async function signIn(request, key) {
  const user = users[key];
  const response = await request.post(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=demo-api-key",
    {data: {email: user.email, password: user.password, returnSecureToken: true}},
  );
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.idToken).toBeTruthy();
  return payload.idToken;
}

async function cleanupResources() {
  if (!adminApp || resourcesCleaned) return;
  for (const targetInstituteId of [instituteId, otherInstituteId]) {
    const [files] = await storageBucket.getFiles({prefix: `${targetInstituteId}/`});
    await Promise.all(files.map((file) => file.delete({ignoreNotFound: true})));
    await firestore.recursiveDelete(
      firestore.collection("institutes").doc(targetInstituteId),
    );
  }
  const userIds = Object.values(users).map((user) => user.uid);
  if (userIds.length > 0) await getAuth(adminApp).deleteUsers(userIds);
  resourcesCleaned = true;
}

async function expectApiError(response, status, code) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.success).toBe(false);
  expect(body.error.code).toBe(code);
}

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  expect(process.env.FIREBASE_STORAGE_EMULATOR_HOST).toBeTruthy();
  adminApp = initializeApp(
    {projectId, storageBucket: questionAssetsBucket},
    `question-lifecycle-${Date.now()}`,
  );
  firestore = getFirestore(adminApp);
  storageBucket = getStorage(adminApp).bucket(questionAssetsBucket);
  const auth = getAuth(adminApp);
  await Promise.all([
    createUser(auth, "teacher", {
      instituteId, licenseLayer: "L3", role: "teacher",
    }),
    createUser(auth, "student", {
      instituteId, licenseLayer: "L2", role: "student",
      studentId: "student-bwm-027",
    }),
    createUser(auth, "missing_tenant", {
      licenseLayer: "L3", role: "teacher",
    }),
    createUser(auth, "missing_license", {
      instituteId, role: "teacher",
    }),
    createUser(auth, "suspended", {
      instituteId, isSuspended: true, licenseLayer: "L3", role: "teacher",
    }),
    createUser(auth, "other_tenant", {
      instituteId: otherInstituteId, licenseLayer: "L3", role: "teacher",
    }),
  ]);

  const institute = firestore.collection("institutes").doc(instituteId);
  const otherInstitute = firestore.collection("institutes").doc(otherInstituteId);
  await Promise.all([
    institute.set({profile: {instituteName: "BWM-027 Lifecycle Institute"}}),
    otherInstitute.set({profile: {instituteName: "BWM-027 Other Institute"}}),
    institute.collection("academicYears").doc("2026-2027").set({status: "active"}),
    otherInstitute.collection("academicYears").doc("2026-2027").set({status: "active"}),
    institute.collection("questionBank").doc("browser-open-v1").set(question(
      "browser-open-v1",
      {createdAt: new Date("2026-09-12T12:00:00.000Z")},
    )),
    institute.collection("questionBank").doc("browser-used-v1").set(question(
      "browser-used-v1",
      {
        createdAt: new Date("2026-09-11T12:00:00.000Z"),
        lastUsedAcademicYear: "2026-2027",
        lastUsedAt: new Date("2026-09-11T14:00:00.000Z"),
        status: "used",
        usedCount: 2,
        usedInTemplate: true,
      },
    )),
    institute.collection("questionBank").doc("browser-race-v1").set(question(
      "browser-race-v1",
      {createdAt: new Date("2026-09-10T12:00:00.000Z")},
    )),
    institute.collection("questionBank").doc("browser-archive-v1").set(question(
      "browser-archive-v1",
      {createdAt: new Date("2023-01-01T00:00:00.000Z")},
    )),
    institute.collection("tests").doc("browser-assigned-template").set({
      lastUsedAt: new Date("2026-09-11T14:00:00.000Z"),
      questionIds: ["browser-used-v1"],
      status: "assigned",
      templateName: "Browser Assigned Template",
      testId: "browser-assigned-template",
      totalRuns: 2,
      version: 1,
    }),
    institute.collection("tagDictionary")
      .doc("question_tag_governance_state").set({dictionaryRevision: 1}),
    institute.collection("tagDictionary")
      .doc("question_tag_projection_state").set({backfillComplete: true}),
  ]);
});

test.afterAll(async () => {
  if (!adminApp) return;
  await cleanupResources();
  await deleteApp(adminApp);
});

test(
  "Question Bank lifecycle is authoritative across security, pagination, mutations, and reload",
  async ({page, request}) => {
    test.setTimeout(360_000);
    const [teacherToken, studentToken, missingTenantToken, missingLicenseToken,
      suspendedToken, otherTenantToken] = await Promise.all([
      signIn(request, "teacher"),
      signIn(request, "student"),
      signIn(request, "missing_tenant"),
      signIn(request, "missing_license"),
      signIn(request, "suspended"),
      signIn(request, "other_tenant"),
    ]);
    const headers = {Authorization: `Bearer ${teacherToken}`};

    const deniedBody = {
      contentBase64: "UEsDBAoAAAAAA",
      examType: "JEEMains",
      fileName: "denied.zip",
      idempotencyKey: "bwm-027-denied-package",
      subject: "Physics",
    };
    await expectApiError(await request.post(
      "/api/v1/admin/questions/packages/validate",
      {data: deniedBody, headers: {Authorization: `Bearer ${studentToken}`}},
    ), 403, "FORBIDDEN");
    await expectApiError(await request.post(
      "/api/v1/admin/questions/packages/validate",
      {data: deniedBody, headers: {Authorization: `Bearer ${missingTenantToken}`}},
    ), 403, "TENANT_MISMATCH");
    await expectApiError(await request.post(
      "/api/v1/admin/questions/packages/validate",
      {data: deniedBody, headers: {Authorization: `Bearer ${missingLicenseToken}`}},
    ), 401, "UNAUTHORIZED");
    await expectApiError(await request.post(
      "/api/v1/admin/questions/packages/validate",
      {data: deniedBody, headers: {Authorization: `Bearer ${suspendedToken}`}},
    ), 403, "FORBIDDEN");
    await expectApiError(await request.get(
      "/api/v1/admin/questions/library/browser-open-v1",
      {headers: {Authorization: `Bearer ${otherTenantToken}`}},
    ), 404, "NOT_FOUND");

    const firstPageResponse = await request.get(
      "/api/v1/admin/questions/library?limit=2",
      {headers},
    );
    expect(firstPageResponse.status()).toBe(200);
    const firstPage = (await firstPageResponse.json()).data;
    expect(firstPage.questions).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();
    const secondPageResponse = await request.get(
      `/api/v1/admin/questions/library?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      {headers},
    );
    expect(secondPageResponse.status()).toBe(200);
    const secondPage = (await secondPageResponse.json()).data;
    expect(secondPage.questions).toHaveLength(2);
    expect(new Set([
      ...firstPage.questions.map((entry) => entry.id),
      ...secondPage.questions.map((entry) => entry.id),
    ]).size).toBe(4);
    await expectApiError(await request.get(
      `/api/v1/admin/questions/library?limit=2&subject=Physics&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      {headers},
    ), 400, "VALIDATION_ERROR");

    const archiveResponse = await request.post(
      "/api/v1/admin/questions/browser-archive-v1/lifecycle",
      {
        data: {
          action: "archive",
          expectedRevision: 1,
          idempotencyKey: "bwm-027-browser-archive",
          reason: "Permanent browser archive proof.",
        },
        headers,
      },
    );
    expect(archiveResponse.status()).toBe(200);
    const archiveResult = (await archiveResponse.json()).data;
    expect(archiveResult.status).toBe("archived");
    expect(archiveResult.thermalState).toBe("cold");
    const archivedDetail = await request.get(
      "/api/v1/admin/questions/library/browser-archive-v1",
      {headers},
    );
    expect(archivedDetail.status()).toBe(200);
    expect((await archivedDetail.json()).data.question.status).toBe("archived");

    const raceRequests = ["a", "b"].map((suffix) => request.post(
      "/api/v1/admin/questions/browser-race-v1/lifecycle",
      {
        data: {
          action: "deprecate",
          expectedRevision: 1,
          idempotencyKey: `bwm-027-browser-race-${suffix}`,
          reason: "Permanent concurrency proof.",
        },
        headers,
      },
    ));
    const raceResponses = await Promise.all(raceRequests);
    expect(raceResponses.map((response) => response.status()).sort()).toEqual([
      200, 409,
    ]);
    const raceQuestion = await firestore.doc(
      `institutes/${instituteId}/questionBank/browser-race-v1`,
    ).get();
    expect(raceQuestion.get("revision")).toBe(2);
    expect(raceQuestion.get("status")).toBe("deprecated");

    await page.addInitScript(() => {
      window.history.replaceState(null, "", "/admin/question-bank/library");
    });
    await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    await page.getByLabel("Email", {exact: true}).fill(users.teacher.email);
    await page.getByLabel("Password", {exact: true}).fill(users.teacher.password);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await expect(page).toHaveURL(/\/admin\/question-bank\/library$/u);
    await expect(page.getByRole("heading", {
      name: "Question Library", exact: true,
    })).toBeVisible({timeout: 90_000});

    let openRow = page.getByRole("row").filter({hasText: "browser-open-v1"});
    await expect(openRow).toBeVisible();
    await openRow.getByRole("button", {name: "Metadata"}).click();
    await page.locator("#admin-question-metadata-topic").fill("Browser verified topic");
    await page.locator("#admin-question-metadata-solution-image-upload")
      .setInputFiles({buffer: pngBytes, mimeType: "image/png", name: "solution.png"});
    await page.getByRole("button", {name: "Save Metadata Changes"}).click();
    await expect(page.getByText(
      "Metadata saved and reloaded for browser-open-v1.",
    )).toBeVisible({timeout: 90_000});
    let openSnapshot = await firestore.doc(
      `institutes/${instituteId}/questionBank/browser-open-v1`,
    ).get();
    expect(openSnapshot.get("revision")).toBe(2);
    expect(openSnapshot.get("topic")).toBe("Browser verified topic");
    expect(openSnapshot.get("solutionImageUrl")).toBe(
      `${instituteId}/questions/browser-open-v1/v1/solution-r2.png`,
    );
    await page.getByRole("button", {name: "Close", exact: true}).click();

    openRow = page.getByRole("row").filter({hasText: "browser-open-v1"});
    await openRow.getByRole("button", {name: "Structure"}).click();
    await page.locator("#admin-question-structure-marks").fill("5");
    await page.locator("#admin-question-structure-question-image-upload")
      .setInputFiles({buffer: pngBytes, mimeType: "image/png", name: "question.png"});
    await page.getByRole("button", {name: "Save Structure Changes"}).click();
    await expect(page.getByText(
      "Structure saved and reloaded for browser-open-v1.",
    )).toBeVisible({timeout: 90_000});
    openSnapshot = await firestore.doc(
      `institutes/${instituteId}/questionBank/browser-open-v1`,
    ).get();
    expect(openSnapshot.get("revision")).toBe(3);
    expect(openSnapshot.get("marks")).toBe(5);
    expect(openSnapshot.get("questionImageUrl")).toBe(
      `${instituteId}/questions/browser-open-v1/v1/question-r3.png`,
    );
    await page.getByRole("button", {name: "Close", exact: true}).click();

    const usedRow = page.getByRole("row").filter({hasText: "browser-used-v1"});
    await expect(usedRow.getByRole("button", {name: "Structure"})).toBeDisabled();
    await expect(usedRow.getByRole("button", {name: "Version"})).toBeEnabled();
    const versionResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname ===
        "/api/v1/admin/questions/browser-used-v1/versions" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await usedRow.getByRole("button", {name: "Version"}).click();
    const versionResult = (await (await versionResponsePromise).json()).data;
    await expect(page.getByText(
      `Created and reloaded successor ${versionResult.successorQuestionId}.`,
    )).toBeVisible({timeout: 90_000});
    const [sourceVersion, successorVersion] = await Promise.all([
      firestore.doc(
        `institutes/${instituteId}/questionBank/browser-used-v1`,
      ).get(),
      firestore.doc(
        `institutes/${instituteId}/questionBank/${versionResult.successorQuestionId}`,
      ).get(),
    ]);
    expect(sourceVersion.get("status")).toBe("deprecated");
    expect(sourceVersion.get("revision")).toBe(2);
    expect(successorVersion.exists).toBe(true);
    expect(successorVersion.get("parentQuestionId")).toBe("browser-used-v1");
    expect(successorVersion.get("version")).toBe(2);

    openRow = page.getByRole("row").filter({hasText: "browser-open-v1"});
    await openRow.getByRole("button", {name: "Deprecate"}).click();
    await expect(page.getByText(
      "browser-open-v1 is deprecated and the authoritative library has been reloaded.",
    )).toBeVisible({timeout: 90_000});
    expect((await firestore.doc(
      `institutes/${instituteId}/questionBank/browser-open-v1`,
    ).get()).get("revision")).toBe(4);

    await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    await expect(page.getByRole("heading", {
      name: "Question Library", exact: true,
    })).toBeVisible({timeout: 90_000});
    await expect(page.getByRole("row").filter({hasText: "browser-open-v1"}))
      .toContainText("deprecated");

    await page.getByRole("link", {
      name: "Tag Management",
      exact: true,
    }).first().click();
    await expect(page.getByRole("heading", {
      name: "Tag Management", exact: true,
    })).toBeVisible({timeout: 90_000});
    await page.getByLabel("New Name", {exact: true}).fill("Browser Verified");
    await page.getByRole("button", {name: "Apply Tag Change"}).click();
    await expect(page.getByText(
      "Create Tag applied and reloaded at revision 2.",
    )).toBeVisible({timeout: 90_000});
    await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    await expect(page.getByRole("heading", {
      name: "Question Library", exact: true,
    })).toBeVisible({timeout: 90_000});
    await page.getByRole("link", {
      name: "Tag Management",
      exact: true,
    }).first().click();
    await expect(page.getByRole("row").filter({hasText: "Browser Verified"}))
      .toBeVisible({timeout: 90_000});

    const governanceState = await firestore.doc(
      `institutes/${instituteId}/tagDictionary/question_tag_governance_state`,
    ).get();
    expect(governanceState.get("dictionaryRevision")).toBe(2);
    const audits = await firestore.collection("institutes").doc(instituteId)
      .collection("auditLogs").get();
    const actionTypes = audits.docs.map((document) => document.get("actionType"));
    expect(actionTypes.filter((action) => action === "UPDATE_QUESTION_METADATA"))
      .toHaveLength(1);
    expect(actionTypes.filter((action) => action === "UPDATE_QUESTION_STRUCTURE"))
      .toHaveLength(1);
    expect(actionTypes.filter((action) => action === "CREATE_QUESTION_VERSION"))
      .toHaveLength(1);
    expect(actionTypes.filter((action) => action === "MUTATE_QUESTION_TAGS"))
      .toHaveLength(1);
    expect(actionTypes.filter((action) => action === "ARCHIVE_QUESTION"))
      .toHaveLength(1);
    expect(actionTypes.filter((action) => action === "DEPRECATE_QUESTION"))
      .toHaveLength(2);
    expect(audits.size).toBe(7);

    const [managedAssets] = await storageBucket.getFiles({
      prefix: `${instituteId}/questions/browser-open-v1/v1/`,
    });
    expect(managedAssets.map((file) => file.name).sort()).toEqual([
      `${instituteId}/questions/browser-open-v1/v1/question-r3.png`,
      `${instituteId}/questions/browser-open-v1/v1/solution-r2.png`,
    ]);

    await cleanupResources();
    expect((await firestore.collection("institutes").doc(instituteId).get()).exists)
      .toBe(false);
    const [remainingFiles] = await storageBucket.getFiles({
      prefix: `${instituteId}/`,
    });
    expect(remainingFiles).toHaveLength(0);
  },
);
