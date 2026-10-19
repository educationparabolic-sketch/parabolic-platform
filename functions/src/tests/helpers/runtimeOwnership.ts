import {createHash, randomUUID} from "node:crypto";
import {entryBinding, planRuntimeCommand, closeRuntimeOwnership} from "../../services/examRuntimeOwnership";

export const fixtureOwnerProof = Buffer.alloc(32, 7).toString("base64url");
export const runtimeOwnerForTest = (studentUid: string) => ({
  studentUid, launchNonce: "fixture-owned-nonce", proof: fixtureOwnerProof, generation: 1,
});
// Supplies explicit v2 persisted authority to existing domain regression fixtures.
export function ownedSessionFixture(data: Record<string, unknown>) {
  const identity = {
    instituteId: String(data.instituteId), yearId: String(data.yearId), runId: String(data.runId),
    sessionId: String(data.sessionId), studentId: String(data.studentId),
    studentUid: String(data.studentUid ?? data.studentId), launchNonce: "fixture-owned-nonce",
  };
  const token = "fixture-issued-token";
  const issued = {...data, ...identity, runtimeOwnershipVersion: 2, status: "created",
    launchCredentialHashes: [createHash("sha256").update(token).digest("hex")]};
  const {owner} = planRuntimeCommand(issued, identity, {
    operation: "launch", commandId: randomUUID(), token, nextOwnerProof: fixtureOwnerProof,
  }, {}, Date.now());
  return {...data, studentUid: identity.studentUid, runtimeOwnershipVersion: 2,
    identityStatusEntryBindings: [entryBinding(identity)], runtimeOwnership: owner,
    ...(["submitted", "terminated"].includes(String(data.status)) ?
      closeRuntimeOwnership({runtimeOwnership: owner}, Date.now()) : {})};
}
