import assert from "node:assert/strict";
import test from "node:test";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const projectId = process.env.GCLOUD_PROJECT ?? "parabolic-platform-build-10-tests";
const databasePath = `projects/${projectId}/databases/(default)`;
const documentsBaseUrl =
  `http://${emulatorHost}/v1/${databasePath}/documents`;

type FirestoreScalar = string | number | boolean;

interface FirestoreErrorResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

const toFirestoreValue = (
  value: FirestoreScalar,
): Record<string, string | number | boolean> => {
  if (typeof value === "string") {
    return {stringValue: value};
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ?
      {integerValue: String(value)} :
      {doubleValue: value};
  }

  return {booleanValue: value};
};

const toFirestoreFields = (
  payload: Record<string, FirestoreScalar>,
): Record<string, Record<string, string | number | boolean>> =>
  Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, toFirestoreValue(value)]),
  );

const buildDocumentName = (documentPath: string): string =>
  `${databasePath}/documents/${documentPath}`;

const parseErrorResponse = async (
  response: Response,
): Promise<FirestoreErrorResponse> => {
  try {
    return await response.json() as FirestoreErrorResponse;
  } catch {
    return {};
  }
};

const assertPermissionDenied = async (response: Response): Promise<void> => {
  assert.equal(response.ok, false);
  assert.equal(response.status, 403);

  const errorResponse = await parseErrorResponse(response);
  const errorMessage = errorResponse.error?.message ?? "";
  const errorStatus = errorResponse.error?.status ?? "";

  assert.match(
    `${errorStatus} ${errorMessage}`,
    /PERMISSION_DENIED/i,
  );
};

const createProtectedDocument = async (
  documentPath: string,
  payload: Record<string, FirestoreScalar>,
): Promise<Response> => {
  const documentName = buildDocumentName(documentPath);

  return fetch(
    `${documentsBaseUrl}:commit`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: documentName,
              fields: toFirestoreFields(payload),
            },
            currentDocument: {
              exists: false,
            },
          },
          {
            transform: {
              document: documentName,
              fieldTransforms: [
                {
                  fieldPath: "timestamp",
                  setToServerValue: "REQUEST_TIME",
                },
              ],
            },
          },
        ],
      }),
    },
  );
};

const createProtectedDocumentWithoutServerTimestamp = async (
  documentPath: string,
  payload: Record<string, FirestoreScalar>,
): Promise<Response> =>
  fetch(
    `${documentsBaseUrl}/${documentPath}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: toFirestoreFields(payload),
      }),
    },
  );

const updateProtectedDocument = async (
  documentPath: string,
  payload: Record<string, FirestoreScalar>,
): Promise<Response> => {
  const query = new URLSearchParams();

  Object.keys(payload).forEach((fieldPath) => {
    query.append("updateMask.fieldPaths", fieldPath);
  });

  return fetch(
    `${documentsBaseUrl}/${documentPath}?${query.toString()}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: toFirestoreFields(payload),
      }),
    },
  );
};

const deleteProtectedDocument = async (
  documentPath: string,
): Promise<Response> =>
  fetch(
    `${documentsBaseUrl}:commit`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        writes: [
          {
            delete: buildDocumentName(documentPath),
            currentDocument: {
              exists: true,
            },
          },
        ],
      }),
    },
  );

const protectedCollections = [
  {
    path: "auditLogs/build-10-root-audit",
    createPayload: {
      actionType: "TEST_AUDIT_TAMPER_PROTECTION",
      actorRole: "vendor",
      actorUid: "vendor_010",
      auditId: "build-10-root-audit",
      targetCollection: "systemFlags",
      targetId: "flag_010",
    },
  },
  {
    path: "vendorAuditLogs/build-10-vendor-audit",
    createPayload: {
      actionType: "TEST_VENDOR_TAMPER_PROTECTION",
      actorRole: "vendor",
      actorUid: "vendor_011",
      auditId: "build-10-vendor-audit",
      targetCollection: "vendorConfig",
      targetId: "pricing_010",
    },
  },
  {
    path: "institutes/inst_010/auditLogs/build-10-institute-audit",
    createPayload: {
      actionType: "TEST_INSTITUTE_TAMPER_PROTECTION",
      actorRole: "admin",
      actorUid: "admin_010",
      auditId: "build-10-institute-audit",
      instituteId: "inst_010",
      targetCollection: "students",
      targetId: "student_010",
    },
  },
  {
    path: "institutes/inst_010/licenseHistory/build-10-license-history",
    createPayload: {
      actorId: "vendor_012",
      billingPlan: "governance_plan",
      effectiveDate: "2026-03-19",
      entryId: "build-10-license-history",
      instituteId: "inst_010",
      layer: "L3",
      reason: "Upgrade approved",
    },
  },
  {
    path: "institutes/inst_010/overrideLogs/build-10-override-log",
    createPayload: {
      instituteId: "inst_010",
      justification: "Emergency forced submission",
      overrideId: "build-10-override-log",
      overrideType: "FORCE_SUBMIT",
      performedBy: "admin_010",
      runId: "run_010",
      sessionId: "session_010",
      studentId: "student_010",
    },
  },
] as const;

test("protected audit collections accept create requests with server timestamps", async () => {
  for (const collection of protectedCollections) {
    const response = await createProtectedDocument(
      collection.path,
      collection.createPayload,
    );

    assert.equal(
      response.ok,
      true,
      `Expected create to succeed for ${collection.path}.`,
    );
  }
});

test("protected audit collections reject client timestamp writes", async () => {
  for (const collection of protectedCollections) {
    const response = await createProtectedDocumentWithoutServerTimestamp(
      `${collection.path}-client-write`,
      {
        ...collection.createPayload,
        timestamp: "2026-03-19T00:00:00.000Z",
      },
    );

    await assertPermissionDenied(response);
  }
});

test("protected audit collections reject update requests", async () => {
  for (const collection of protectedCollections) {
    const response = await updateProtectedDocument(
      collection.path,
      {actorUid: "tampered_actor"},
    );

    await assertPermissionDenied(response);
  }
});

test("protected audit collections reject delete requests", async () => {
  for (const collection of protectedCollections) {
    const response = await deleteProtectedDocument(collection.path);
    await assertPermissionDenied(response);
  }
});
