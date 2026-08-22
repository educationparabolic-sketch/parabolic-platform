import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
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
const instituteId = "inst_bwm_012_question_browser";
const otherInstituteId = "inst_bwm_012_other";
const questionAssetsBucket = process.env.QUESTION_ASSETS_BUCKET ??
  `${projectId}.appspot.com`;
const expectedCdnHost = "assets.bwm-012.example.test";
const pngContentBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
let adminApp;
let firestore;
let storageBucket;
let teacherEmail;
let teacherPassword;
let teacherUid;
let studentEmail;
let studentPassword;
let studentUid;
let resourcesCleaned = false;

test.use({bypassCSP: true});

async function cleanupResources() {
  if (!adminApp || resourcesCleaned) {
    return;
  }

  const [files] = await storageBucket.getFiles({prefix: `${instituteId}/`});
  await Promise.all(files.map((file) => file.delete({ignoreNotFound: true})));
  await firestore.recursiveDelete(
    firestore.collection("institutes").doc(instituteId),
  );
  await firestore.recursiveDelete(
    firestore.collection("institutes").doc(otherInstituteId),
  );
  const userIds = [teacherUid, studentUid].filter(Boolean);
  if (userIds.length > 0) {
    await getAuth(adminApp).deleteUsers(userIds);
  }
  resourcesCleaned = true;
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

function expectSafeSignedAsset(cdnPath, signedUrl, questionId, fileName) {
  expect(cdnPath).toBe(
    `${instituteId}/questions/${questionId}/v1/${fileName}`,
  );
  const parsedUrl = new URL(signedUrl);
  expect(parsedUrl.protocol).toBe("https:");
  expect(parsedUrl.hostname).toBe(expectedCdnHost);
  expect(parsedUrl.pathname).toBe(`/${cdnPath}`);
  expect(parsedUrl.searchParams.get("Expires")).toBeTruthy();
  expect(parsedUrl.searchParams.get("KeyName")).toBe("bwm-012-test-key");
  expect(parsedUrl.searchParams.get("Signature")).toBeTruthy();
}

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  expect(storageHost).toBeTruthy();

  adminApp = initializeApp(
    {projectId, storageBucket: questionAssetsBucket},
    `question-creation-${Date.now()}`,
  );
  firestore = getFirestore(adminApp);
  storageBucket = getStorage(adminApp).bucket(questionAssetsBucket);
  const auth = getAuth(adminApp);

  teacherEmail = `question-teacher-${Date.now()}@example.test`;
  teacherPassword = "bwm-012-question-teacher";
  const teacher = await auth.createUser({
    email: teacherEmail,
    password: teacherPassword,
  });
  teacherUid = teacher.uid;
  await auth.setCustomUserClaims(teacherUid, {
    instituteId,
    licenseLayer: "L3",
    role: "teacher",
  });

  studentEmail = `question-student-${Date.now()}@example.test`;
  studentPassword = "bwm-012-question-student";
  const student = await auth.createUser({
    email: studentEmail,
    password: studentPassword,
  });
  studentUid = student.uid;
  await auth.setCustomUserClaims(studentUid, {
    instituteId,
    licenseLayer: "L2",
    role: "student",
    studentId: "student-bwm-012",
  });

  await Promise.all([
    firestore.collection("institutes").doc(instituteId).set({
      profile: {instituteName: "BWM-012 Question Institute"},
    }),
    firestore.collection("institutes").doc(otherInstituteId).set({
      profile: {instituteName: "BWM-012 Other Institute"},
    }),
  ]);
});

test.afterAll(async () => {
  if (adminApp) {
    await cleanupResources();
    await deleteApp(adminApp);
  }
});

test(
  "Admin creates and safely reloads an image question with retry-safe access boundaries",
  async ({page, request}) => {
    test.setTimeout(240_000);

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
    const negativeRequestBody = {
      assetKind: "questionImage",
      contentBase64: pngContentBase64,
      extension: "png",
      instituteId,
      questionId: "negative-probe",
      version: 1,
    };

    const roleDenied = await request.post(
      "/api/v1/admin/questions/assets",
      {
        data: negativeRequestBody,
        headers: {Authorization: `Bearer ${studentToken}`},
      },
    );
    expect(roleDenied.status()).toBe(403);
    expect((await roleDenied.json()).error.code).toBe("FORBIDDEN");

    const tenantDenied = await request.post(
      "/api/v1/admin/questions/assets",
      {
        data: {...negativeRequestBody, instituteId: otherInstituteId},
        headers: {Authorization: `Bearer ${teacherToken}`},
      },
    );
    expect(tenantDenied.status()).toBe(403);
    expect((await tenantDenied.json()).error.code).toBe("TENANT_MISMATCH");

    await page.addInitScript(() => {
      window.history.replaceState(
        null,
        "",
        "/admin/question-bank/upload-package",
      );
    });
    await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    await page.getByLabel("Email", {exact: true}).fill(teacherEmail);
    await page.getByLabel("Password", {exact: true}).fill(teacherPassword);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await expect(page).toHaveURL(/\/admin\/question-bank\/upload-package$/u);
    await expect(
      page.getByRole("heading", {name: "Bulk Question Upload", exact: true}),
    ).toBeVisible({timeout: 90_000});

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", {name: "Download Sample ZIP"}).click();
    const download = await downloadPromise;
    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
    const packageBytes = await readFile(downloadedPath);
    await page.getByLabel("Question Package (.zip)").setInputFiles({
      buffer: packageBytes,
      mimeType: "application/zip",
      name: "bwm-012-question-package.zip",
    });

    const validateResponsePromise = page.waitForResponse(
      (response) => {
        if (
          new URL(response.url()).pathname !==
            "/api/v1/admin/questions/bulk" ||
          response.status() !== 200
        ) {
          return false;
        }
        return response.request().postDataJSON()?.commit === false;
      },
      {timeout: 90_000},
    );
    await page.getByRole("button", {name: "Validate ZIP Package"}).click();
    const validateEnvelope = await (await validateResponsePromise).json();
    expect(validateEnvelope.success).toBe(true);
    expect(validateEnvelope.data.committed).toBe(false);
    expect(validateEnvelope.data.summary.valid).toBe(1);
    const authoritativeRow = validateEnvelope.data.rows[0];
    const questionId = authoritativeRow.questionId;
    expect(questionId).toBeTruthy();
    expect(authoritativeRow.version).toBe(1);
    await expect(
      page.getByText(/Validation successful for bwm-012-question-package\.zip/u),
    ).toBeVisible();

    let assetAttemptCount = 0;
    await page.route("**/api/v1/admin/questions/assets", async (route) => {
      assetAttemptCount += 1;
      if (assetAttemptCount === 2) {
        await route.abort("connectionfailed");
        return;
      }
      await route.continue();
    });
    const firstAssetResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/v1/admin/questions/assets" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("button", {name: "Final Upload"}).click();
    const firstAssetEnvelope = await (await firstAssetResponsePromise).json();
    expect(firstAssetEnvelope.data.assetKind).toBe("questionImage");
    await expect(page.locator(".admin-tests-inline-error")).toBeVisible({
      timeout: 30_000,
    });
    expect(assetAttemptCount).toBe(2);

    const questionPrefix = `${instituteId}/questions/${questionId}/v1/`;
    let [partialFiles] = await storageBucket.getFiles({prefix: questionPrefix});
    expect(partialFiles.map((file) => file.name)).toEqual([
      `${questionPrefix}question.png`,
    ]);
    expect(
      (await firestore
        .collection("institutes")
        .doc(instituteId)
        .collection("questionBank")
        .doc(questionId)
        .get()).exists,
    ).toBe(false);

    await page.unroute("**/api/v1/admin/questions/assets");
    const commitResponsePromise = page.waitForResponse(
      (response) => {
        if (
          new URL(response.url()).pathname !==
            "/api/v1/admin/questions/bulk" ||
          response.status() !== 200
        ) {
          return false;
        }
        return response.request().postDataJSON()?.commit === true;
      },
      {timeout: 90_000},
    );
    await page.getByRole("button", {name: "Final Upload"}).click();
    const commitEnvelope = await (await commitResponsePromise).json();
    expect(commitEnvelope.success).toBe(true);
    expect(commitEnvelope.data.committed).toBe(true);
    expect(commitEnvelope.data.summary.created).toBe(1);
    await expect(
      page.getByText("Upload successful. 1 questions were added and 0 existing versions were updated."),
    ).toBeVisible();

    const questionSnapshot = await firestore
      .collection("institutes")
      .doc(instituteId)
      .collection("questionBank")
      .doc(questionId)
      .get();
    expect(questionSnapshot.exists).toBe(true);
    expect(questionSnapshot.data().correctAnswer).toBe("A");
    expect(questionSnapshot.data().questionImageUrl).toBe(
      `${questionPrefix}question.png`,
    );
    expect(questionSnapshot.data().solutionImageUrl).toBe(
      `${questionPrefix}solution.png`,
    );

    const [committedFiles] = await storageBucket.getFiles({
      prefix: questionPrefix,
    });
    expect(committedFiles.map((file) => file.name).sort()).toEqual([
      `${questionPrefix}question.png`,
      `${questionPrefix}solution.png`,
    ]);
    for (const file of committedFiles) {
      const [metadata] = await file.getMetadata();
      expect(metadata.metadata.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
    }

    const libraryResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/v1/admin/questions/library" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await page.getByRole("link", {name: "Question Library"}).click();
    const libraryEnvelope = await (await libraryResponsePromise).json();
    const libraryQuestion = libraryEnvelope.data.questions.find(
      (question) => question.id === questionId,
    );
    expect(libraryQuestion).toBeTruthy();
    expect(libraryQuestion.correctAnswer).toBe("A");
    expectSafeSignedAsset(
      libraryQuestion.questionImageFile,
      libraryQuestion.questionImagePreviewUrl,
      questionId,
      "question.png",
    );
    expectSafeSignedAsset(
      libraryQuestion.solutionImageFile,
      libraryQuestion.solutionImagePreviewUrl,
      questionId,
      "solution.png",
    );
    expect(JSON.stringify(libraryQuestion)).not.toMatch(
      /bucketName|objectPath|storage\.googleapis|firebasestorage/iu,
    );

    const questionRow = page.getByRole("row").filter({hasText: questionId});
    await expect(questionRow).toContainText("jeemains-physics-001");
    const detailResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/v1/admin/questions/library" &&
        response.status() === 200,
      {timeout: 90_000},
    );
    await questionRow.getByRole("link", {name: "View"}).click();
    await detailResponsePromise;
    await expect(
      page.getByRole("heading", {name: questionId, exact: true}),
    ).toBeVisible();
    await expect(
      page.locator(".admin-question-library-definition-list").filter({
        hasText: "Correct Answer",
      }),
    ).toContainText("A");
    await page.getByRole("button", {
      name: `${questionPrefix}question.png`,
    }).click();
    const previewImage = page
      .getByRole("dialog", {name: "Question Image"})
      .getByRole("img");
    const previewImageUrl = await previewImage.getAttribute("src");
    expect(previewImageUrl).toBeTruthy();
    expectSafeSignedAsset(
      `${questionPrefix}question.png`,
      previewImageUrl,
      questionId,
      "question.png",
    );

    const uploadLog = await firestore.doc(
      commitEnvelope.data.uploadLogPath,
    ).get();
    expect(uploadLog.exists).toBe(true);
    const auditSnapshot = await firestore
      .collection("institutes")
      .doc(instituteId)
      .collection("auditLogs")
      .get();
    expect(auditSnapshot.size).toBe(3);

    await cleanupResources();
    const [remainingFiles] = await storageBucket.getFiles({
      prefix: `${instituteId}/`,
    });
    expect(remainingFiles).toHaveLength(0);
    expect(
      (await firestore.collection("institutes").doc(instituteId).get()).exists,
    ).toBe(false);
    await expect(
      getAuth(adminApp).getUser(teacherUid),
    ).rejects.toThrow();
  },
);
