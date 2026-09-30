import {createHash, randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {deleteApp, initializeApp} = require(
  "../../functions/node_modules/firebase-admin/lib/app/index.js",
);
const {getAuth} = require(
  "../../functions/node_modules/firebase-admin/lib/auth/index.js",
);
const {getFirestore, Timestamp} = require(
  "../../functions/node_modules/firebase-admin/lib/firestore/index.js",
);
const {getStorage} = require(
  "../../functions/node_modules/firebase-admin/lib/storage/index.js",
);

const projectId = "demo-parabolic-test";
const suffix = randomUUID().slice(0, 8);
const instituteId = `bwm032_support_${suffix}`;
const otherInstituteId = `bwm032_support_other_${suffix}`;
const password = "bwm-032-support-proof";
const bucketName = `${projectId}.appspot.com`;
const accounts = [];
const identities = {};
let app;
let auth;
let db;
let bucket;

test.use({bypassCSP: true});
test.setTimeout(300_000);

const entitlement = ({layer = "L0", state = "active", version} = {}) => ({
  expiryDate: state === "expired" ?
    "2000-01-01T00:00:00.000Z" : "2099-12-31T00:00:00.000Z",
  featureFlags: {},
  gracePeriodEndsAt: state === "grace" ?
    "2099-12-30T00:00:00.000Z" : null,
  licenseLayer: layer,
  licenseState: state,
  licenseVersion: version ?? `support-license-${suffix}`,
});

async function createAccount(label, claims) {
  const email = `${label}-${suffix}@example.test`;
  const user = await auth.createUser({email, password});
  accounts.push(user.uid);
  await auth.setCustomUserClaims(user.uid, claims);
  return {email, password, uid: user.uid};
}

async function idToken(request, identity) {
  const response = await request.post(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key",
    {data: {
      email: identity.email,
      password: identity.password,
      returnSecureToken: true,
    }},
  );
  const payload = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  return payload.idToken;
}

async function rawSupport(request, {
  bearer,
  data,
  method = "GET",
  params,
  path = "/api/v1/admin/support/tickets",
} = {}) {
  const options = {
    ...(data === undefined ? {} : {data}),
    headers: bearer ? {Authorization: `Bearer ${bearer}`} : {},
    ...(params === undefined ? {} : {params}),
  };
  const response = method === "POST" ?
    await request.post(path, options) : await request.get(path, options);
  return {envelope: await response.json(), response};
}

async function support(request, options, status = 200) {
  const result = await rawSupport(request, options);
  expect(result.response.status(), JSON.stringify(result.envelope)).toBe(status);
  expect(result.envelope.success).toBe(status < 400);
  expect(result.envelope.requestId).toBeTruthy();
  return status < 400 ? result.envelope.data : result.envelope.error;
}

async function login(page, identity) {
  await page.addInitScript(() => {
    if (window.location.pathname === "/admin/index.html") {
      window.history.replaceState(null, "", "/admin/help");
    }
  });
  await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
  await page.locator("input[type=email]").fill(identity.email);
  await page.locator("input[type=password]").fill(identity.password);
  await page.getByRole("button", {name: /login/i}).click();
  await expect(page.getByRole("heading", {name: "Help & Support", exact: true}))
    .toBeVisible({timeout: 60_000});
}

async function seedInstitute(id, users) {
  const settingsUsers = Object.fromEntries(users.map(({identity, name, role}) => [
    identity.uid,
    {
      displayName: name,
      email: identity.email,
      role,
      status: "active",
    },
  ]));
  await db.doc(`institutes/${id}`).set({
    instituteId: id,
    settingsUsers,
    status: "active",
  });
}

const filterKeys = (category, priority, status) => {
  const filters = [
    `category=${category}`,
    `priority=${priority}`,
    `status=${status}`,
  ];
  const keys = ["all"];
  for (let mask = 1; mask < 8; mask += 1) {
    keys.push(filters.filter((_filter, index) =>
      (mask & (1 << index)) !== 0).join("|"));
  }
  return keys;
};

async function seedMessagePages(ticketId, existingCount) {
  const ticket = db.doc(
    `institutes/${instituteId}/supportTickets/${ticketId}`,
  );
  const batch = db.batch();
  const start = Timestamp.now().toMillis() + 60_000;
  const addedCount = 26 - existingCount;
  for (let index = 0; index < addedCount; index += 1) {
    const digest = createHash("sha256")
      .update(`${ticketId}:browser-message:${index}`).digest("hex").slice(0, 40);
    const messageId = `support_message_${digest}`;
    batch.create(ticket.collection("messages").doc(messageId), {
      attachments: [],
      authorDisplayName: "Persisted Support Operator",
      authorType: "support",
      authorUserId: `support_operator_${suffix}`,
      body: `Persisted pagination message ${index + 1}`,
      createdAt: Timestamp.fromMillis(start + index * 1_000),
      messageId,
      schemaVersion: 1,
      ticketId,
    });
  }
  batch.update(ticket, {
    lastMessageAt: Timestamp.fromMillis(start + (addedCount - 1) * 1_000),
    messageCount: 26,
    updatedAt: Timestamp.fromMillis(start + (addedCount - 1) * 1_000),
  });
  await batch.commit();
}

async function seedTicketPages(createdTicketId) {
  const batch = db.batch();
  const start = Timestamp.now().toMillis() + 120_000;
  for (let index = 0; index < 25; index += 1) {
    const digest = createHash("sha256")
      .update(`${instituteId}:browser-ticket:${index}`).digest("hex").slice(0, 40);
    const ticketId = `support_ticket_${digest}`;
    const timestamp = Timestamp.fromMillis(start + index * 1_000);
    batch.create(db.doc(
      `institutes/${instituteId}/supportTickets/${ticketId}`,
    ), {
      assignedOperatorUserId: null,
      assignedTeam: "platform_support",
      category: "technical_issue",
      createdAt: timestamp,
      createdByUserId: identities.admin.uid,
      displayId: `SUP-${digest.slice(0, 10).toUpperCase()}`,
      filterKeys: filterKeys("technical_issue", "normal", "open"),
      instituteId,
      lastMessageAt: timestamp,
      messageCount: 1,
      priority: "normal",
      revision: 1,
      schemaVersion: 1,
      sourceRoute: "/admin/help",
      status: "open",
      subject: `Pagination support request ${index + 1}`,
      ticketId,
      updatedAt: timestamp,
      vendorFilterKeys: ["all"],
    });
  }
  batch.set(db.doc(
    `institutes/${instituteId}/supportTicketStats/current`,
  ), {
    awaitingInstitute: 0,
    closed: 0,
    inProgress: 0,
    open: 26,
    resolved: 0,
    schemaVersion: 1,
    updatedAt: Timestamp.fromMillis(start + 25_000),
    urgentNotClosed: 1,
  });
  await batch.commit();
  expect((await db.doc(
    `institutes/${instituteId}/supportTickets/${createdTicketId}`,
  ).get()).exists).toBe(true);
}

test.beforeAll(async () => {
  for (const [key, expected] of Object.entries({
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    PROJECT_ID: projectId,
    SUPPORT_ATTACHMENTS_BUCKET: bucketName,
  })) {
    expect(process.env[key], key).toBe(expected);
  }
  app = initializeApp({projectId, storageBucket: bucketName}, `admin-support-${suffix}`);
  auth = getAuth(app);
  db = getFirestore(app);
  bucket = getStorage(app).bucket(bucketName);
  await Promise.all([
    db.recursiveDelete(db.doc(`institutes/${instituteId}`)),
    db.recursiveDelete(db.doc(`institutes/${otherInstituteId}`)),
  ]);

  identities.admin = await createAccount("support-admin", {
    instituteId,
    ...entitlement(),
    role: "admin",
  });
  identities.teacher = await createAccount("support-teacher", {
    instituteId,
    ...entitlement(),
    role: "teacher",
  });
  identities.director = await createAccount("support-director", {
    instituteId,
    ...entitlement({layer: "L3"}),
    role: "director",
  });
  identities.lowDirector = await createAccount("support-low-director", {
    instituteId,
    ...entitlement({layer: "L2"}),
    role: "director",
  });
  identities.suspended = await createAccount("support-suspended", {
    instituteId,
    ...entitlement(),
    isSuspended: true,
    role: "admin",
  });
  identities.incomplete = await createAccount("support-incomplete", {
    instituteId,
    licenseLayer: "L0",
    role: "admin",
  });
  identities.grace = await createAccount("support-grace", {
    instituteId,
    ...entitlement({state: "grace"}),
    role: "admin",
  });
  identities.expired = await createAccount("support-expired", {
    instituteId,
    ...entitlement({state: "expired"}),
    role: "admin",
  });
  identities.student = await createAccount("support-student", {
    instituteId,
    ...entitlement(),
    role: "student",
  });
  identities.noTenant = await createAccount("support-no-tenant", {
    ...entitlement(),
    role: "admin",
  });
  identities.otherAdmin = await createAccount("support-other-admin", {
    instituteId: otherInstituteId,
    ...entitlement(),
    role: "admin",
  });

  await seedInstitute(instituteId, [
    {identity: identities.admin, name: "Support Administrator", role: "admin"},
    {identity: identities.teacher, name: "Support Teacher", role: "teacher"},
    {identity: identities.director, name: "Support Director", role: "director"},
    {identity: identities.lowDirector, name: "Low Layer Director", role: "director"},
    {identity: identities.suspended, name: "Suspended Administrator", role: "admin"},
    {identity: identities.incomplete, name: "Incomplete Administrator", role: "admin"},
    {identity: identities.grace, name: "Grace Administrator", role: "admin"},
    {identity: identities.expired, name: "Expired Administrator", role: "admin"},
  ]);
  await seedInstitute(otherInstituteId, [
    {identity: identities.otherAdmin, name: "Other Administrator", role: "admin"},
  ]);
});

test.afterAll(async () => {
  if (!app) return;
  try {
    const notifications = await db.collection("emailQueue")
      .where("instituteId", "in", [instituteId, otherInstituteId]).get();
    await Promise.all(notifications.docs.map((document) => document.ref.delete()));
    await Promise.all([
      db.recursiveDelete(db.doc(`institutes/${instituteId}`)),
      db.recursiveDelete(db.doc(`institutes/${otherInstituteId}`)),
    ]);
    const prefix = createHash("sha256").update(instituteId)
      .digest("hex").slice(0, 40);
    await bucket.deleteFiles({
      force: true,
      prefix: `institutes/${prefix}/support-attachments/`,
    });
    await auth.deleteUsers(accounts);
  } finally {
    await deleteApp(app);
  }
});

test("support persists through real Auth, Functions, Firestore, Storage, and a fresh Admin browser", async ({
  browser,
  page,
  request,
}) => {
  const bearer = {};
  for (const [name, identity] of Object.entries(identities)) {
    bearer[name] = await idToken(request, identity);
  }

  for (const [identityName, status, code] of [
    [null, 401, "UNAUTHORIZED"],
    ["student", 403, "FORBIDDEN"],
    ["lowDirector", 403, "LICENSE_RESTRICTED"],
    ["suspended", 403, "FORBIDDEN"],
    ["incomplete", 403, "LICENSE_RESTRICTED"],
    ["grace", 403, "LICENSE_RESTRICTED"],
    ["expired", 403, "LICENSE_RESTRICTED"],
    ["noTenant", 403, "TENANT_MISMATCH"],
  ]) {
    const error = await support(request, {
      bearer: identityName ? bearer[identityName] : null,
    }, status);
    expect(error.code).toBe(code);
  }
  expect((await support(request, {bearer: bearer.teacher})).items).toEqual([]);
  expect((await support(request, {bearer: bearer.director})).items).toEqual([]);

  const externalRequests = [];
  const supportRequests = [];
  page.on("request", (entry) => {
    if (entry.url().includes("/api/v1/admin/support/")) {
      supportRequests.push({
        method: entry.method(),
        postData: entry.method() === "POST" ? entry.postDataJSON() : null,
        url: entry.url(),
      });
    }
    if (/^https?:/u.test(entry.url())) {
      const hostname = new URL(entry.url()).hostname;
      if (hostname !== "127.0.0.1" && hostname !== "localhost") {
        externalRequests.push(entry.url());
      }
    }
  });

  await login(page, identities.admin);
  await expect(page.getByText("No authoritative requests match these filters."))
    .toBeVisible({timeout: 60_000});
  const subject = `Persistent support request ${suffix}`;
  const description = "The no-mock support workflow must persist across browser contexts.";
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
  ]);
  await page.getByRole("button", {name: "Create Support Request"}).click();
  await page.locator("#support-category").selectOption("technical_issue");
  await page.locator("#support-priority").selectOption("urgent");
  await page.locator("#support-subject").fill(subject);
  await page.locator("#support-entity").fill(`run-${suffix}`);
  await page.locator("#support-description").fill(description);
  await page.locator("#support-attachments").setInputFiles({
    buffer: pngBytes,
    mimeType: "image/png",
    name: `support-${suffix}.png`,
  });
  await page.getByRole("button", {name: "Submit Request"}).click();
  await expect(page.getByRole("status"))
    .toContainText("confirmed by an authoritative reload; notification queued", {
      timeout: 60_000,
    });
  await expect(page.getByRole("button", {name: new RegExp(subject, "u")}))
    .toBeVisible();
  await expect(page.getByRole("button", {name: new RegExp(`support-${suffix}\\.png`, "u")}))
    .toContainText("Download");

  const createRequest = supportRequests.find((entry) =>
    entry.method === "POST" && entry.url.endsWith("/api/v1/admin/support/tickets"));
  expect(createRequest).toBeTruthy();
  expect(Object.keys(createRequest.postData).sort()).toEqual([
    "affectedEntityId",
    "attachments",
    "category",
    "description",
    "idempotencyKey",
    "priority",
    "sourceRoute",
    "subject",
  ]);
  for (const forbidden of [
    "actorId", "actorRole", "assignedTeam", "authorType", "instituteId",
    "status", "ticketId", "updatedAt",
  ]) {
    expect(createRequest.postData[forbidden]).toBeUndefined();
  }
  const createIndex = supportRequests.indexOf(createRequest);
  expect(supportRequests.slice(createIndex + 1).some((entry) =>
    entry.method === "GET" &&
    entry.url.includes("/api/v1/admin/support/tickets"))).toBe(true);

  const ticketSnapshot = (await db.collection(
    `institutes/${instituteId}/supportTickets`,
  ).where("subject", "==", subject).get()).docs[0];
  expect(ticketSnapshot).toBeTruthy();
  const ticketId = ticketSnapshot.id;
  const displayId = ticketSnapshot.get("displayId");
  expect(ticketSnapshot.get("createdByUserId")).toBe(identities.admin.uid);
  expect(ticketSnapshot.get("assignedTeam")).toBe("platform_support");

  const foreignDetail = await support(request, {
    bearer: bearer.otherAdmin,
    path: `/api/v1/admin/support/tickets/${ticketId}`,
  }, 404);
  expect(foreignDetail.code).toBe("NOT_FOUND");

  const attachmentSnapshot = (await db.collection(
    `institutes/${instituteId}/supportAttachments`,
  ).get()).docs[0];
  expect(attachmentSnapshot).toBeTruthy();
  expect(attachmentSnapshot.get("state")).toBe("committed");
  const objectPath = attachmentSnapshot.get("objectPath");
  expect(objectPath).not.toContain(instituteId);
  expect((await bucket.file(objectPath).exists())[0]).toBe(true);
  const foreignDownload = await support(request, {
    bearer: bearer.otherAdmin,
    path: `/api/v1/admin/support/tickets/${ticketId}/attachments/` +
      `${attachmentSnapshot.id}/download`,
  }, 404);
  expect(foreignDownload.code).toBe("NOT_FOUND");

  const concurrentBodies = ["Concurrent institute reply A", "Concurrent institute reply B"]
    .map((body) => ({
      action: "ADD_INSTITUTE_REPLY",
      attachments: [],
      body,
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    }));
  const concurrentResults = await Promise.all(concurrentBodies.map((data) =>
    rawSupport(request, {
      bearer: bearer.admin,
      data,
      method: "POST",
      path: `/api/v1/admin/support/tickets/${ticketId}/commands`,
    })));
  expect(concurrentResults.map((result) => result.response.status()).sort())
    .toEqual([200, 409]);
  const winnerIndex = concurrentResults.findIndex(
    (result) => result.response.status() === 200,
  );
  const replay = await support(request, {
    bearer: bearer.admin,
    data: concurrentBodies[winnerIndex],
    method: "POST",
    path: `/api/v1/admin/support/tickets/${ticketId}/commands`,
  });
  expect(replay.disposition).toBe("replayed");
  expect(replay.ticket.revision).toBe(2);

  await page.getByRole("button", {name: "Reload ticket"}).click();
  await expect(page.getByText(concurrentBodies[winnerIndex].body, {exact: true}))
    .toBeVisible({timeout: 60_000});
  const browserReply = `Fresh institute evidence ${suffix}`;
  await page.locator("#support-reply").fill(browserReply);
  await page.getByRole("button", {name: "Add Reply"}).click();
  await expect(page.getByRole("status"))
    .toContainText("Reply confirmed", {timeout: 60_000});
  await expect(page.getByText(browserReply, {exact: true})).toBeVisible();

  await page.getByRole("button", {name: "Mark Resolved"}).click();
  await expect(page.getByRole("status")).toContainText("is now Resolved");
  await page.getByRole("button", {name: "Close Request"}).click();
  await expect(page.getByRole("status")).toContainText("is now Closed");
  await page.getByRole("button", {name: "Reopen Request"}).click();
  await expect(page.getByRole("status")).toContainText("is now Open");

  await seedMessagePages(ticketId, 3);
  await page.getByRole("button", {name: "Reload ticket"}).click();
  const messagePagination = page.locator(
    ".admin-support-ticket-detail .admin-support-pagination",
  );
  await expect(messagePagination).toContainText("Message page 1");
  await messagePagination.getByRole("button", {name: "Next messages"}).click();
  await expect(messagePagination).toContainText("Message page 2");
  await expect(page.getByText("Persisted pagination message 23", {exact: true}))
    .toBeVisible();
  await messagePagination.getByRole("button", {name: "Previous messages"}).click();
  await expect(messagePagination).toContainText("Message page 1");

  await seedTicketPages(ticketId);
  const freshContext = await browser.newContext({bypassCSP: true});
  const freshPage = await freshContext.newPage();
  await login(freshPage, identities.admin);
  await freshPage.locator("#support-search").fill(displayId);
  await freshPage.locator(".admin-support-filters")
    .getByRole("button", {name: "Apply"}).click();
  await expect(freshPage.getByRole("button", {name: new RegExp(subject, "u")}))
    .toBeVisible({timeout: 60_000});
  await freshPage.getByRole("button", {name: new RegExp(subject, "u")}).click();
  await expect(freshPage.getByText(browserReply, {exact: true}))
    .toBeVisible({timeout: 60_000});
  expect(await freshPage.evaluate(() => Object.keys(localStorage)
    .filter((key) => /support|ticket/iu.test(key)))).toEqual([]);

  await freshPage.locator(".admin-support-filters")
    .getByRole("button", {name: "Reset"}).click();
  const ticketPagination = freshPage.locator(
    ".admin-support-registry .admin-support-pagination",
  );
  await expect(ticketPagination).toContainText("Page 1");
  await expect(ticketPagination.getByRole("button", {name: "Next"}))
    .toBeEnabled({timeout: 60_000});
  await ticketPagination.getByRole("button", {name: "Next"}).click();
  await expect(ticketPagination).toContainText("Page 2");
  await expect(freshPage.getByRole("button", {name: new RegExp(subject, "u")}))
    .toBeVisible({timeout: 60_000});
  await freshContext.close();

  await Promise.all([
    attachmentSnapshot.ref.update({state: "deleted"}),
    bucket.file(objectPath).delete(),
  ]);
  await page.getByRole("button", {name: "Reload ticket"}).click();
  await expect(page.getByRole("button", {
    name: new RegExp(`support-${suffix}\\.png`, "u"),
  })).toContainText("Unavailable", {timeout: 60_000});
  await expect(page.getByRole("button", {
    name: new RegExp(`support-${suffix}\\.png`, "u"),
  })).toBeDisabled();

  const [commands, audits, notifications, attachments] = await Promise.all([
    db.collection(`institutes/${instituteId}/supportCommands`).get(),
    db.collection(`institutes/${instituteId}/auditLogs`).get(),
    db.collection("emailQueue").where("instituteId", "==", instituteId).get(),
    db.collection(`institutes/${instituteId}/supportAttachments`).get(),
  ]);
  expect(commands.size).toBe(6);
  expect(audits.size).toBe(6);
  expect(notifications.size).toBe(6);
  expect(attachments.size).toBe(1);
  for (const notification of notifications.docs) {
    expect(notification.get("source")).toBe("admin_support");
    expect(notification.get("status")).toBe("pending");
    expect(JSON.stringify(notification.data())).not.toMatch(
      /Fresh institute evidence|contentBase64|support-.*\.png/u,
    );
  }
  expect(externalRequests).toEqual([]);
});
