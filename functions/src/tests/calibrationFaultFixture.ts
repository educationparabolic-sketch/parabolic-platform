import assert from "node:assert/strict";
import {Firestore, Transaction} from "firebase-admin/firestore";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

/** Test-only SDK instrumentation: real emulator reads/transactions, no fake commits. */
export interface CalibrationFaultPoint {
  phase: "reservation" | "effects" | "failure";
  beforeRead?: number;
  afterRead?: number;
  afterWrite?: number;
  afterCommit?: boolean;
  recoveryRead?: boolean;
}
export const calibrationFaultPoints = (kind: "rollout" | "rollback"): CalibrationFaultPoint[] => {
  const points: CalibrationFaultPoint[] = [];
  const reads = {reservation: kind === "rollout" ? 1 : 2, effects: kind === "rollout" ? 2 : 3, failure: 1};
  // Two explicit targets exercise first/last target, every write category and both journals.
  const writes = {reservation: 1, effects: kind === "rollout" ? 12 : 11, failure: 2};
  for (const phase of ["reservation", "effects", "failure"] as const) {
    for (let n = 1; n <= reads[phase]; n++) points.push({phase, beforeRead: n}, {phase, afterRead: n});
    for (let n = 1; n <= writes[phase]; n++) points.push({phase, afterWrite: n});
    points.push({phase, afterCommit: true});
  }
  points.push({phase: "effects", afterCommit: true, recoveryRead: true});
  return points;
};
export const faultMatrixFirestore = (db: Firestore, point: CalibrationFaultPoint) => {
  assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, "demo-parabolic-test");
  assert.equal(getFirebaseAdminApp().options.projectId, "demo-parabolic-test");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(127\.0\.0\.1|localhost):\d+$/);
  assert.ok(process.env.FIREBASE_EMULATOR_HUB);
  const phases = ["reservation", "effects", "failure"] as const;
  let invocation = 0;
  let armed = false;
  let fired = 0;
  const fault = (): never => {
    fired++; throw new Error("PRIVATE_MATRIX_FAULT");
  };
  const firestore = new Proxy(db, {get(target, property) {
    if (property === "runTransaction") {
      return async (callback: (tx: Transaction) => Promise<unknown>) => {
        const phase = phases[invocation++];
        const value = await target.runTransaction(async (tx) => {
          let reads = 0;
          let writes = 0;
          const instrumented = new Proxy(tx, {get(transaction, name) {
            const method = Reflect.get(transaction, name);
            if (name === "get" || name === "getAll") {
              return async (...args: unknown[]) => {
                reads++;
                if (phase === point.phase && reads === point.beforeRead) fault();
                const read = await Reflect.apply(method, transaction, args);
                if (phase === point.phase && reads === point.afterRead) fault();
                return read;
              };
            }
            if (name === "create" || name === "update") {
              return (...args: unknown[]) => {
                const queued = Reflect.apply(method, transaction, args);
                writes++;
                if (phase === point.phase && writes === point.afterWrite) fault();
                return queued;
              };
            }
            return typeof method === "function" ? method.bind(transaction) : method;
          }});
          return callback(instrumented);
        });
        if (phase === point.phase && point.afterCommit) {
          armed = Boolean(point.recoveryRead); fault();
        }
        return value;
      };
    }
    if (property === "doc") {
      return (path: string) => {
        const reference = target.doc(path);
        return new Proxy(reference, {get(document, name) {
          const method = Reflect.get(document, name);
          if (name === "get" && armed && path.startsWith("vendorCalibrationRollouts/")) return async () => fault();
          return typeof method === "function" ? method.bind(document) : method;
        }});
      };
    }
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  }});
  return {firestore, fired: () => fired};
};
