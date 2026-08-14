export const firebaseEmulatorHarness = Object.freeze({
  firebaseCliVersion: "15.9.0",
  projectId: "demo-parabolic-test",
  services: Object.freeze([
    "auth",
    "firestore",
    "functions",
    "hosting:portal",
    "storage",
  ]),
  ports: Object.freeze({
    auth: 9099,
    firestore: 8080,
    functions: 5001,
    hosting: 5000,
    storage: 9199,
  }),
});
