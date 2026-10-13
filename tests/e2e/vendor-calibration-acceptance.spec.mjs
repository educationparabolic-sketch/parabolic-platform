import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {getFirebaseAdminApp, getFirestore} = require("../../functions/lib/utils/firebaseAdmin");
const prefix = "/api/v1/vendor/calibration/";
const weights = {guessWeight: 1, phaseWeight: 0, easyNeglectWeight: 0, hardBiasWeight: 0, wrongStreakWeight: 0};
const phaseWeights = {...weights, guessWeight: 0, phaseWeight: 1};
const states = ["Stable", "Drift-Prone", "Impulsive", "Overextended", "Volatile"];
const versionIds = Array.from({length: 27}, (_, i) => `cal_accept_${String(i).padStart(2, "0")}`);
const instituteIds = Array.from({length: 27}, (_, i) => `inst_cal_accept_${String(i).padStart(2, "0")}`);
const [instituteA, instituteB] = instituteIds;
const metricPath = `institutes/${instituteA}/academicYears/2026/studentYearMetrics/s0`;
const privateStudent = `institutes/${instituteA}/students/private`;
const privateSession = `institutes/${instituteA}/academicYears/2026/runs/private/sessions/private`;
const auditKey = "vendor-build-138-calibration-audit";
// Local HTTP Auth emulator only; this does not qualify production CSP.
test.use({bypassCSP: true});
test.setTimeout(360000);

test("calibration permanent real authority, selection, recovery, denial and isolation acceptance", async ({page, browser, request}) => {
  expect(process.env.PROJECT_ID).toBe("demo-parabolic-test");
  expect(process.env.GCLOUD_PROJECT).toBe("demo-parabolic-test");
  expect(process.env.GOOGLE_CLOUD_PROJECT).toBe("demo-parabolic-test");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  expect(process.env.FIREBASE_EMULATOR_HUB).toMatch(/^(127\.0\.0\.1|localhost):\d+$/u);
  const app = getFirebaseAdminApp(), db = getFirestore(), auth = app.auth();
  const users = [], contexts = [], requests = [], responseJobs = [], external = [];
  let vendorToken;
  const observe = async target => {
    target.setDefaultTimeout(60000);
    target.on("request", req => {
      if (/^https?:/u.test(req.url()) && !["127.0.0.1", "localhost"].includes(new URL(req.url()).hostname)) external.push(req.url());
      if (req.url().includes(prefix) || req.url().includes("/api/v1/vendor/institutes")) {
        requests.push({url: req.url(), method: req.method(), body: req.postDataJSON()});
        if (target === page && !vendorToken && req.headers().authorization) vendorToken = req.headers().authorization.replace(/^Bearer /u, "");
      }
    });
    target.on("response", response => {
      if (response.url().includes(prefix)) responseJobs.push(response.json().then(body => ({url: response.url(), status: response.status(), body})).catch(() => null));
    });
    // Abort remote traffic; never synthesize an API response.
    await target.route("https://**/*", route => route.abort("failed"));
    await target.addInitScript(({auditKey}) => {
      if (location.pathname === "/index.html") history.replaceState(null, "", "/vendor/calibration");
      // Deliberately hostile legacy browser state must neither render nor change.
      if (!localStorage.getItem(auditKey)) localStorage.setItem(auditKey, JSON.stringify([{logId: "FORGED_LOCAL_CALIBRATION", actionType: "CalibrationPushed", actorUid: "forged", actorRole: "Vendor", targetCollection: "auditLogs", targetId: "forged", eventScope: "Global", instituteIds: [], calibrationVersionId: "FORGED_LOCAL_VERSION", note: "FORGED_LOCAL_CALIBRATION", createdAt: "2026-01-01T00:00:00.000Z"}]));
    }, {auditKey});
  };
  const makeAccount = async (claims = {role: "vendor", isVendor: true, licenseLayer: "L0"}) => {
    const email = `cal-accept-${randomUUID()}@example.test`, password = "local-calibration-acceptance-only";
    const user = await auth.createUser({email, password}); users.push(user.uid);
    await auth.setCustomUserClaims(user.uid, claims);
    return {...user, email, password};
  };
  const tokenFor = async account => {
    const response = await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {data: {email: account.email, password: account.password, returnSecureToken: true}});
    expect(response.status()).toBe(200); return (await response.json()).idToken;
  };
  const signIn = async (target, account) => {
    await target.goto("/index.html");
    await target.getByLabel("Email", {exact: true}).fill(account.email);
    await target.getByLabel("Password", {exact: true}).fill(account.password);
    await target.getByRole("button", {name: "Login", exact: true}).click();
  };
  const call = async (path, method = "GET", body, token = vendorToken) => page.evaluate(async ({url, method, body, token}) => {
    const response = await fetch(url, {method, headers: {"Content-Type": "application/json", ...(token ? {Authorization: `Bearer ${token}`} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json()};
  }, {url: `${prefix}${path}`, method, body, token});
  const versionData = (versionId, actor) => ({schemaVersion: 1, versionId, weights, isActive: versionId === versionIds[0], createdBy: actor,
    createdAt: "2026-01-01T00:00:00.000Z", activationDate: versionId === versionIds[0] ? "2026-01-01T00:00:00.000Z" : null,
    thresholds: {guessFactorEasy: 1, guessFactorMedium: 1, guessFactorHard: 1, phaseDeviationThreshold: 20}});
  const workspace = page.locator(".vendor-calibration-page");
  const section = title => workspace.locator(":scope > section").filter({has: page.getByRole("heading", {name: title, exact: true})});
  const versions = section("Authoritative versions"), detail = section("Selected version and proposed weights"), directory = section("Authoritative target selection");
  const run = () => workspace.getByRole("button", {name: "Run simulation", exact: true});
  const results = workspace.getByLabel("Authoritative simulation results");
  const choose = async () => {
    await versions.getByRole("button", {name: `${versionIds[0]} (Active)`, exact: true}).click();
    await expect(workspace.getByLabel("guessWeight", {exact: true})).toHaveValue("1");
  };
  const selectA = () => workspace.getByLabel("Select Calibration Acceptance A", {exact: true}).check();
  const selectB = () => workspace.getByLabel("Select Calibration Acceptance B", {exact: true}).check();
  const year = value => workspace.getByLabel("Academic year ID", {exact: true}).fill(value);
  const phase = async () => {await workspace.getByLabel("guessWeight", {exact: true}).fill("0"); await workspace.getByLabel("phaseWeight", {exact: true}).fill("1");};
  const exactResult = async (before, after, students, institutes) => {
    await expect(results.getByText(`Before average: ${before}`, {exact: true})).toBeVisible();
    await expect(results.getByText(`Projected average: ${after}`, {exact: true})).toBeVisible();
    await expect(results.getByText(`Students: ${students}. Institutes: ${institutes}.`, {exact: true})).toBeVisible();
  };
  const retry = root => root.getByRole("button", {name: "Retry authority", exact: true}).click();
  const allRoutesDenied = async (token, status) => {
    for (const [path, method, body] of [["versions", "GET"], [`versions/${versionIds[0]}`, "GET"], ["simulate", "POST", {academicYearId: "2026", institutes: [instituteA], weights}], ["push", "POST", {targetInstitutes: [instituteA], versionId: versionIds[0]}]]) {
      expect((await call(path, method, body, token)).status).toBe(status);
    }
  };
  try {
    const account = await makeAccount();
    const batch = db.batch();
    for (const id of versionIds) batch.set(db.doc(`globalCalibration/${id}`), versionData(id, account.uid));
    for (const [i, id] of instituteIds.entries()) batch.set(db.doc(`institutes/${id}`), {instituteId: id, instituteRevision: 1,
      registeredName: i < 2 ? `Calibration Acceptance ${i === 0 ? "A" : "B"}` : `Calibration Acceptance Filler ${i}`, status: "active", vendorLifecycleState: "active", settingsRevision: 0,
      settingsUsers: {}, primaryAdminUserId: null, pendingPrimaryAdministrator: null, vendorAccountReference: null, createdAt: new Date("2026-01-01"), updatedAt: new Date(i < 2 ? "2026-02-01" : "2026-01-01")});
    for (const id of [instituteA, instituteB]) for (const y of ["2024", "2025", "2026"]) batch.set(db.doc(`institutes/${id}/academicYears/${y}`), {academicYearId: y});
    const signal = (guess, phase) => ({avgGuessRatePercent: guess, avgPhaseAdherencePercent: phase, easyNeglectRatePercent: 0, hardBiasRatePercent: 0, wrongStreakActive: false});
    for (let i = 0; i < 5; i++) batch.set(db.doc(`institutes/${instituteA}/academicYears/2026/studentYearMetrics/s${i}`), signal(i * 25, 100 - i * 20));
    for (let i = 0; i < 2; i++) batch.set(db.doc(`institutes/${instituteB}/academicYears/2026/studentYearMetrics/s${i}`), signal(100, 100));
    batch.set(db.doc(`institutes/${instituteA}/academicYears/2025/studentYearMetrics/s0`), signal(25, 80));
    batch.set(db.doc(privateStudent), {name: "DO_NOT_EXPOSE_CAL_STUDENT", answerMap: "SECRET_CAL_ANSWER"});
    batch.set(db.doc(privateSession), {answerMap: "SECRET_CAL_SESSION"});
    await batch.commit();
    const originalMetric = (await db.doc(metricPath).get()).data();
    const originalInstitutes = await Promise.all(instituteIds.map(async id => ({id, data: (await db.doc(`institutes/${id}`).get()).data()})));
    // Qualify the real gateway and absorb emulator cold start before UI timing.
    expect((await request.get(`${prefix}versions`, {timeout: 120000})).status()).toBe(401);
    await observe(page); await signIn(page, account);
    await expect(workspace).toBeVisible({timeout: 60000});
    const initialAudit = await page.evaluate(key => localStorage.getItem(key), auditKey);

    await test.step("bounded real version and target pages; exact edited-weight request and five-state distributions", async () => {
      await expect(versions.getByRole("button", {name: /cal_accept_\d\d \(/u})).toHaveCount(25);
      await versions.getByRole("button", {name: "Next versions", exact: true}).click();
      await expect(versions.getByRole("button", {name: /cal_accept_\d\d \(/u})).toHaveCount(2);
      await versions.getByRole("button", {name: "Previous versions", exact: true}).click(); await choose();
      await selectA();
      await directory.getByRole("button", {name: "Next targets", exact: true}).click();
      await expect(directory.getByRole("checkbox")).toHaveCount(2);
      await directory.getByRole("button", {name: "Previous targets", exact: true}).click();
      await expect(workspace.getByLabel("Select Calibration Acceptance A", {exact: true})).not.toBeChecked();
      await selectA(); await year("2026"); await phase(); await run().click();
      await exactResult("50.00", "40.00", 5, 1);
      await expect(results.getByText("Average delta: -10.00", {exact: true})).toBeVisible();
      for (const [i, state] of states.entries()) {
        await expect(results.getByRole("row").filter({has: page.getByRole("rowheader", {name: state, exact: true})}).getByRole("cell")).toHaveText(["1 / 20", i === 0 ? "2 / 40" : i === 4 ? "0 / 0" : "1 / 20", i === 0 ? "1 / 20" : i === 4 ? "-1 / -20" : "0 / 0"]);
      }
      const last = requests.filter(req => req.url.endsWith("/simulate")).at(-1);
      expect(last.body).toEqual({academicYearId: "2026", institutes: [instituteA], weights: phaseWeights});
      expect(last.method).toBe("POST"); expect(vendorToken).toBeTruthy();
    });

    await test.step("target/year/weight changes erase stale results permanently and reload rereads authority", async () => {
      await selectB(); await expect(results).toHaveCount(0); await run().click(); await exactResult("64.29", "28.57", 7, 2);
      await workspace.getByLabel("Select Calibration Acceptance A", {exact: true}).uncheck();
      await run().click(); await exactResult("100.00", "0.00", 2, 1);
      await workspace.getByLabel("Select Calibration Acceptance B", {exact: true}).uncheck(); await selectA();
      await year("2025"); await run().click(); await exactResult("25.00", "20.00", 1, 1);
      await year("2026"); await year("2025"); await expect(results).toHaveCount(0);
      await workspace.getByLabel("phaseWeight", {exact: true}).fill("0.9"); await expect(run()).toBeDisabled();
      await workspace.getByLabel("phaseWeight", {exact: true}).fill("1"); await expect(results).toHaveCount(0);
      await page.reload(); await expect(workspace.getByText("Select a server version to initialize proposed weights.", {exact: true})).toBeVisible();
      await expect(results).toHaveCount(0); await expect(workspace.getByLabel("Academic year ID", {exact: true})).toHaveValue("");
      await expect(workspace.getByLabel("Select Calibration Acceptance A", {exact: true})).not.toBeChecked();
      await db.doc(`globalCalibration/${versionIds[0]}`).update({weights: phaseWeights});
      await chooseAfterServerEdit();
      await db.doc(`globalCalibration/${versionIds[0]}`).update({weights});
      await versions.getByRole("button", {name: "Refresh versions", exact: true}).click(); await choose(); await phase(); await selectA(); await year("2026");
    });

    await test.step("invalid intent, missing year, authoritative empty, malformed summary and real 500 recovery", async () => {
      const posted = requests.filter(req => req.url.endsWith("/simulate")).length;
      await workspace.getByLabel("phaseWeight", {exact: true}).fill("2"); await expect(run()).toBeDisabled();
      await expect(workspace.getByRole("status").filter({hasText: "Validation:"})).toBeVisible();
      expect(requests.filter(req => req.url.endsWith("/simulate"))).toHaveLength(posted);
      await workspace.getByLabel("phaseWeight", {exact: true}).fill("1");
      for (const body of [{academicYearId: "2026", institutes: [instituteA], weights, actorId: "forged"}, {institutes: [instituteA], strategyProfileParameters: weights}, {academicYearId: "2026", institutes: [instituteA, instituteA], weights}]) expect((await call("simulate", "POST", body)).status).toBe(400);
      await year("missing_year"); await run().click(); await expect(workspace.getByRole("alert")).toContainText("unavailable:"); await expect(results).toHaveCount(0);
      await year("2025"); await selectB(); await run().click();
      await expect(workspace.getByRole("alert")).toContainText("unavailable:"); await expect(results).toHaveCount(0);
      await workspace.getByLabel("Select Calibration Acceptance B", {exact: true}).uncheck();
      await year("2024"); await run().click(); await expect(workspace.getByText(/^Empty population:/u)).toBeVisible(); await expect(results).toHaveCount(0);
      const empty = await call("simulate", "POST", {academicYearId: "2024", institutes: [instituteA], weights: phaseWeights});
      expect(empty.status).toBe(200); expect(empty.body.data).toMatchObject({availability: "empty", before: null, after: null, delta: null, institutes: []});
      await year("2026"); await db.doc(metricPath).update({avgGuessRatePercent: "malformed"});
      await run().click(); await expect(workspace.getByRole("alert")).toContainText("unavailable:"); await expect(results).toHaveCount(0);
      await db.doc(metricPath).set(originalMetric); await retry(workspace); await exactResult("50.00", "40.00", 5, 1);
      // A transport failure is a failure, not a fabricated backend result.
      const abortSimulation = route => route.abort("failed");
      await page.route(`**${prefix}simulate`, abortSimulation);
      await run().click(); await expect(workspace.getByRole("alert")).toContainText("unavailable:"); await expect(results).toHaveCount(0);
      await page.unroute(`**${prefix}simulate`, abortSimulation);
      await retry(workspace); await exactResult("50.00", "40.00", 5, 1);
    });

    await test.step("detail/list malformed authority, empty versions and retry do not retain fixtures", async () => {
      await versions.getByRole("button", {name: `${versionIds[1]} (Inactive)`, exact: true}).click();
      await expect(detail).toContainText(`globalCalibration/${versionIds[1]}`);
      await db.doc(`globalCalibration/${versionIds[0]}`).update({thresholds: {guessFactorEasy: "bad"}});
      await versions.getByRole("button", {name: `${versionIds[0]} (Active)`, exact: true}).click();
      await expect(detail.getByRole("alert")).toContainText("unavailable:"); await expect(run()).toBeDisabled(); await expect(results).toHaveCount(0);
      await db.doc(`globalCalibration/${versionIds[0]}`).set(versionData(versionIds[0], account.uid));
      await retry(detail); await expect(workspace.getByLabel("guessWeight", {exact: true})).toHaveValue("1");
      // Malformed page lookahead must also fail closed, not be skipped.
      await db.doc(`globalCalibration/${versionIds[25]}`).update({weights: {guessWeight: 9}});
      await versions.getByRole("button", {name: "Refresh versions", exact: true}).click();
      await expect(versions.getByRole("alert")).toContainText("unavailable:"); await expect(run()).toBeDisabled();
      await db.doc(`globalCalibration/${versionIds[25]}`).set(versionData(versionIds[25], account.uid)); await retry(versions);
      await expect(versions.getByRole("button", {name: /cal_accept_\d\d \(/u})).toHaveCount(25);
      await Promise.all(versionIds.map(id => db.doc(`globalCalibration/${id}`).delete()));
      await versions.getByRole("button", {name: "Refresh versions", exact: true}).click();
      await expect(versions.getByText("No calibration versions available", {exact: true})).toBeVisible(); await expect(run()).toBeDisabled();
      const restore = db.batch(); for (const id of versionIds) restore.set(db.doc(`globalCalibration/${id}`), versionData(id, account.uid)); await restore.commit();
      await versions.getByRole("button", {name: "Refresh versions", exact: true}).click(); await choose(); await phase(); await selectA(); await year("2026");
      await run().click(); await exactResult("50.00", "40.00", 5, 1);
      // Remove only owned directory documents, keeping child summary fixtures intact.
      await Promise.all(instituteIds.map(id => db.doc(`institutes/${id}`).delete()));
      await directory.getByRole("button", {name: "Refresh targets", exact: true}).click();
      await expect(directory.getByText("No institutes available", {exact: true})).toBeVisible();
      await expect(results).toHaveCount(0); await expect(run()).toBeDisabled();
      const restoreInstitutes = db.batch();
      for (const {id, data} of originalInstitutes) restoreInstitutes.set(db.doc(`institutes/${id}`), data);
      await restoreInstitutes.commit(); await directory.getByRole("button", {name: "Refresh targets", exact: true}).click();
      await selectA(); await run().click(); await exactResult("50.00", "40.00", 5, 1);
    });

    await test.step("fresh browser receives only server authority and wrong-role mounting is denied", async () => {
      const context = await browser.newContext({baseURL: "http://127.0.0.1:5000", bypassCSP: true}); contexts.push(context);
      const target = await context.newPage(); await observe(target); await signIn(target, account);
      const fresh = target.locator(".vendor-calibration-page");
      await expect(fresh.getByText("Select a server version to initialize proposed weights.", {exact: true})).toBeVisible({timeout: 60000});
      await expect(fresh.getByLabel("Authoritative simulation results")).toHaveCount(0);
      await expect(fresh.getByLabel("Academic year ID", {exact: true})).toHaveValue(""); await context.close();
      const wrong = await makeAccount({role: "admin", isVendor: false, licenseLayer: "L0"});
      const wrongContext = await browser.newContext({baseURL: "http://127.0.0.1:5000", bypassCSP: true}); contexts.push(wrongContext);
      const wrongPage = await wrongContext.newPage(); await observe(wrongPage); await signIn(wrongPage, wrong);
      await expect(wrongPage.getByRole("heading", {name: "Vendor role required", exact: true})).toBeVisible();
      await expect(wrongPage.locator(".vendor-calibration-page")).toHaveCount(0); await wrongContext.close();
    });

    await test.step("all routes deny unauthenticated/wrong/current-demoted/suspended/disabled/revoked authority", async () => {
      await allRoutesDenied(null, 401);
      for (const role of ["admin", "director", "teacher", "student"]) {
        const denied = await makeAccount({role, isVendor: false, licenseLayer: "L0"}); await allRoutesDenied(await tokenFor(denied), 403);
      }
      for (const claims of [{role: "admin", isVendor: true, licenseLayer: "L0"}, {role: "vendor", isVendor: true, isSuspended: true, licenseLayer: "L0"}]) {
        await auth.setCustomUserClaims(account.uid, claims); await allRoutesDenied(vendorToken, 403);
        await versions.getByRole("button", {name: "Refresh versions", exact: true}).click();
        await expect(versions.getByRole("alert")).toContainText("permission:"); await expect(results).toHaveCount(0);
        await auth.setCustomUserClaims(account.uid, {role: "vendor", isVendor: true, isSuspended: false, licenseLayer: "L0"});
        await retry(versions); await choose(); await phase(); await year("2026"); await run().click(); await exactResult("50.00", "40.00", 5, 1);
      }
      for (const kind of ["disabled", "revoked"]) {
        const denied = await makeAccount(), token = await tokenFor(denied);
        if (kind === "disabled") await auth.updateUser(denied.uid, {disabled: true});
        else {await page.waitForTimeout(1100); await auth.revokeRefreshTokens(denied.uid);}
        await allRoutesDenied(token, 401);
      }
    });

    await test.step("raw-session denial, source immutability, no live local/static authority and unsupported modes", async () => {
      for (const path of [privateStudent, privateSession, metricPath]) {
        const status = await page.evaluate(async ({path, token}) => (await fetch(`http://127.0.0.1:8080/v1/projects/demo-parabolic-test/databases/(default)/documents/${path}`, {headers: {Authorization: `Bearer ${token}`}})).status, {path, token: vendorToken});
        expect(status).toBe(403);
      }
      expect((await db.doc(metricPath).get()).data()).toEqual(originalMetric);
      expect((await db.doc(privateStudent).get()).data()).toEqual({name: "DO_NOT_EXPOSE_CAL_STUDENT", answerMap: "SECRET_CAL_ANSWER"});
      expect((await db.doc(privateSession).get()).data()).toEqual({answerMap: "SECRET_CAL_SESSION"});
      for (const name of ["Create version", "Publish calibration", "Schedule activation", "Rollback"]) await expect(workspace.getByRole("button", {name, exact: true})).toBeDisabled();
      await expect(workspace.getByLabel("Unavailable calibration capabilities")).toContainText("BWM-039");
      await expect(workspace.getByLabel("Unavailable calibration capabilities")).toContainText("BWM-040");
      await expect(workspace).not.toContainText(/FORGED_LOCAL|North Star Academy|Riverdale Test Hub|SECRET_CAL/u);
      const storage = await page.evaluate(key => ({audit: localStorage.getItem(key), keys: [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(k => /calibration|simulation|weights|targets/iu.test(k))}), auditKey);
      expect(storage.audit).toBe(initialAudit); expect(storage.keys).toEqual([auditKey]);
      const responses = (await Promise.all(responseJobs)).filter(Boolean);
      for (const status of [200, 400, 401, 403, 500]) expect(responses.some(response => response.status === status)).toBe(true);
      expect(responses.filter(response => response.url.endsWith("/push")).every(response => [401, 403].includes(response.status))).toBe(true);
      const simulation = responses.find(response => response.url.endsWith("/simulate") && response.status === 200 && response.body.data.availability === "available");
      expect(Object.keys(simulation.body).sort()).toEqual(["code", "data", "message", "requestId", "success", "timestamp"]);
      expect(Object.keys(simulation.body.data).sort()).toEqual(["after", "availability", "before", "delta", "institutes", "metadata", "proposedWeights"]);
      expect(simulation.body.data.metadata).toMatchObject({schemaVersion: 1, model: "risk_projection_v1", population: "student_year_summaries", academicYearId: "2026", sources: [{instituteId: instituteA, academicYearId: "2026", calibrationVersion: versionIds[0], calibrationSourcePath: `globalCalibration/${versionIds[0]}`, summaryDocumentCount: 5}]});
      expect(Object.keys(simulation.body.data.before.riskDistribution).sort()).toEqual([...states].sort());
      expect(Object.values(simulation.body.data.metadata.unsupportedOutputs)).toEqual(Array(6).fill("unavailable"));
      expect(JSON.stringify(responses)).not.toMatch(/DO_NOT_EXPOSE_CAL_STUDENT|SECRET_CAL_ANSWER|SECRET_CAL_SESSION|answerMap/u);
      for (const req of requests) expect(new URL(req.url).origin).toBe("http://127.0.0.1:5000");
      expect(external).toEqual([]);
    });
    async function chooseAfterServerEdit() {
      await versions.getByRole("button", {name: `${versionIds[0]} (Active)`, exact: true}).click();
      await expect(workspace.getByLabel("guessWeight", {exact: true})).toHaveValue("0");
      await expect(workspace.getByLabel("phaseWeight", {exact: true})).toHaveValue("1");
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    // Only explicitly named demo fixtures owned by this suite; never reset a database.
    await Promise.all(instituteIds.map(id => db.recursiveDelete(db.doc(`institutes/${id}`))));
    await Promise.all(versionIds.map(id => db.doc(`globalCalibration/${id}`).delete()));
    await Promise.all(users.map(uid => auth.deleteUser(uid))); await app.delete();
  }
});
