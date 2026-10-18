import {createRequire} from "node:module";
import {expect, test} from "playwright/test";
const require = createRequire(import.meta.url);
const {seedStudentSolutionsFixture} = require("../../functions/lib/tests/studentSolutionsFixture.js");
const {getFirebaseAdminApp} = require("../../functions/lib/utils/firebaseAdmin.js");
test.use({bypassCSP: true});
test.setTimeout(180000);
test("mounted solution review uses exact released run, nullable images and visible denial", async ({page}) => {
  const f = await seedStudentSolutionsFixture("browser", false);
  const other = await seedStudentSolutionsFixture("browser-other", false);
  await other.run.delete(); // The other tenant has no resource at the probed run ID.
  const peerUid = `${f.uid}-peer`;
  let peerCreated = false;
  try {
    // Live bank edits must not rewrite the immutable attempted answer shown by the mounted UI.
    await f.institute.collection("questionBank").doc(f.ids[0]).update({correctAnswer: "D", revision: 99});
    await page.addInitScript(() => window.history.replaceState(null, "", "/student/dashboard"));
    await page.goto("/student/index.html", {waitUntil: "domcontentloaded"});
    await page.getByLabel("Email", {exact: true}).fill(f.email);
    await page.getByLabel("Password", {exact: true}).fill(f.password);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await page.getByRole("navigation", {name: "Student navigation"})
      .getByRole("link", {name: /^My Tests\b/}).click();
    await expect.poll(() => Date.now() >= f.end, {timeout: 60000}).toBe(true);
    await page.getByRole("button", {name: "Refresh tests", exact: true}).click();
    await expect(page.getByRole("article").filter({hasText: "Owned Completed Test"})).toBeVisible({timeout: 60000});
    const solutionResponse = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/tests/${f.testId}/solutions`) && r.status() === 200);
    await page.getByRole("button", {name: "View Solutions", exact: true}).click();
    const response = await solutionResponse;
    expect(new URL(response.url()).searchParams.get("runId")).toBe(f.runId);
    expect(new URL(response.url()).searchParams.has("page")).toBe(false);
    await expect(page.getByRole("region", {name: "Solution review"})).toContainText("Correct Answer: A");
    await expect(page.getByText("Question image unavailable.", {exact: true}).first()).toBeVisible();
    async function read(query, token = f.token, testId = f.testId) {
      return page.evaluate(async ({token, path}) => {
        const response = await fetch(path, {headers: {authorization: `Bearer ${token}`}});
        return {status: response.status, cache: response.headers.get("cache-control"), body: await response.json()};
      }, {token, path: `/api/v1/student/tests/${testId}/solutions${query}`});
    }
    await expect.poll(async () => (await read(`?runId=${f.runId}&pageSize=1`)).status,
      {timeout: 60000}).toBe(200);
    const first = await read(`?runId=${f.runId}&pageSize=1`);
    expect(first.cache).toBe("private, max-age=0, no-store");
    expect(first.body.data.page.items[0].correctAnswer).toBe("A");
    expect(first.body.data.page.items[0].studentAnswer).toBe("B");
    expect(JSON.stringify(first.body.data)).not.toMatch(/solutionSnapshot|answerMap|objectPath/u);
    const second = await read(`?runId=${f.runId}&pageSize=1&cursor=${first.body.data.page.nextCursor}`);
    expect(second.body.data.page.items[0].correctAnswer).toBe("C");
    expect((await read(`?runId=${f.runId}&yearId=other`)).status).toBe(400);
    const auth = getFirebaseAdminApp().auth();
    await auth.createUser({uid: peerUid, email: `${peerUid}@emulator.test`, password: f.password});
    peerCreated = true;
    await auth.setCustomUserClaims(peerUid, {...f.claims, studentId: peerUid});
    await f.institute.collection("students").doc(peerUid).set({studentId: peerUid, status: "active", deleted: false});
    const peerResponse = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo", {
      method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({email: `${peerUid}@emulator.test`, password: f.password, returnSecureToken: true}),
    });
    expect(peerResponse.status).toBe(200);
    const peerToken = (await peerResponse.json()).idToken;
    for (const result of [await read(`?runId=${f.runId}`, peerToken),
      await read(`?runId=${f.runId}`, other.token), await read("?runId=wrong-run"),
      await read(`?runId=${f.runId}`, f.token, "wrong-test")]) {
      expect(result.status).toBe(404);
      expect(result.body.data).toBeUndefined();
      expect(JSON.stringify(result.body)).not.toMatch(/correctAnswer|questionImageUrl|Signature=|solutionSnapshot|answerMap/u);
    }
    await f.run.update({solutionsReleased: false});
    expect((await read(`?runId=${f.runId}`)).status).toBe(403);
    await page.getByRole("button", {name: "Refresh solutions", exact: true}).click();
    await expect(page.getByRole("alert").filter({hasText: "solutions could not be loaded"})).toBeVisible();
    await expect(page.getByText(/Correct Answer: A/)).toHaveCount(0);
  } finally {
    if (peerCreated) await getFirebaseAdminApp().auth().deleteUser(peerUid);
    await other.cleanup();
    await f.cleanup();
    await getFirebaseAdminApp().delete();
  }
});
