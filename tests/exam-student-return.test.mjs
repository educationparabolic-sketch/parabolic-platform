import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const source = await readFile(new URL("../apps/exam/src/studentReturn.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const {resolveStudentReturnUrl: resolve} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const exam = "https://exam.example.test";
test("Student return uses only a distinct configured HTTPS origin and the fixed path", () => {
  assert.equal(resolve("https://portal.example.test/", exam), "https://portal.example.test/student/my-tests");
  for (const value of [undefined, "", "/student/my-tests", "//evil.test", exam, `${exam}/`,
    "https://user:secret@portal.test", "javascript:alert(1)", "data:text/html,hello", "http://portal.test",
    "https://portal.test/path", "https://portal.test/../", "https://portal.test/?", "https://portal.test/#",
    "https://portal.test?redirect=https://evil.test", "https://portal.test#launch=secret", "https://portal.test//",
    "https://127.0.0.1", "https://127.0.0.2", "https://[::1]", "https://localhost", "https://sub.localhost", "https://localhost.", "https://sub.localhost.", "https://[::ffff:7f00:1]",
    "https://portal.test\\student", "https://portal.test\n.evil.test"]) assert.equal(resolve(value, exam), null, String(value));
});
test("loopback requires explicit isolated Auth emulator configuration and distinct local origins", () => {
  const portal = "http://127.0.0.1:5000", localExam = "http://127.0.0.1:5005", auth = "http://127.0.0.1:9099";
  assert.equal(resolve(portal, localExam, auth), `${portal}/student/my-tests`);
  assert.equal(resolve(portal, localExam), null);
  assert.equal(resolve(portal, localExam, "http://127.0.0.1:9099/path"), null);
  assert.equal(resolve(portal, exam, auth), null);
  assert.equal(resolve(portal, localExam, "https://127.0.0.1:9099"), null);
  assert.equal(resolve(portal, localExam, "http://auth.example.test"), null);
  assert.equal(resolve(localExam, localExam, auth), null);
});
