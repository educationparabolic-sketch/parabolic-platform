import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = path.join(repositoryRoot, ".firebase", "bwm-004-verification");
const sourceRoot = path.join(repositoryRoot, "verification", "bwm-004");
const canonicalConfig = JSON.parse(
  await fs.readFile(path.join(repositoryRoot, "firebase.json"), "utf8"),
);
const generatedConfig = JSON.parse(
  await fs.readFile(path.join(outputRoot, "firebase.json"), "utf8"),
);
const rootFirebaseRc = JSON.parse(
  await fs.readFile(path.join(repositoryRoot, ".firebaserc"), "utf8"),
);
const generatedFirebaseRc = JSON.parse(
  await fs.readFile(path.join(outputRoot, ".firebaserc"), "utf8"),
);

test("the generated deployment package cannot consume portal production bundles", async () => {
  assert.deepEqual(generatedFirebaseRc, rootFirebaseRc);
  assert.deepEqual(generatedConfig.functions, [
    {
      source: "functions",
      codebase: "default",
      disallowLegacyRuntimeConfig: true,
      ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
    },
  ]);

  assert.equal(generatedConfig.hosting.length, canonicalConfig.hosting.length);
  for (const canonicalHosting of canonicalConfig.hosting) {
    const generatedHosting = generatedConfig.hosting.find(
      ({target}) => target === canonicalHosting.target,
    );
    assert.ok(generatedHosting, `Missing generated ${canonicalHosting.target} target`);
    assert.equal(generatedHosting.public, `hosting/${canonicalHosting.target}`);
    assert.deepEqual(
      {...generatedHosting, public: canonicalHosting.public},
      canonicalHosting,
      `${canonicalHosting.target} must retain the reviewed rewrites and headers`,
    );
  }

  const sourceText = await Promise.all([
    "functions/handler.js",
    "functions/index.js",
    "functions/package.json",
    "hosting/portal/admin/index.html",
    "hosting/portal/student/index.html",
    "hosting/exam/index.html",
    "hosting/vendor/index.html",
  ].map((relativePath) => fs.readFile(path.join(sourceRoot, relativePath), "utf8")));
  const serializedArtifact = sourceText.join("\n");
  assert.doesNotMatch(serializedArtifact, /localhost|127\.0\.0\.1|apps\/.+\/dist/i);
  assert.doesNotMatch(serializedArtifact, /password|private[_ -]?key|bearer\s|api[_ -]?key/i);
});

test("the minimal API probe returns JSON failures without CORS grants", () => {
  const require = createRequire(import.meta.url);
  const {handleApiV1} = require(
    path.join(outputRoot, "functions", "handler.js"),
  );

  function invoke(method) {
    const headers = new Map();
    const response = {
      body: null,
      statusCode: null,
      set(key, value) {
        headers.set(key.toLowerCase(), value);
        return this;
      },
      status(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    handleApiV1({method}, response);
    return {headers, response};
  }

  const getResult = invoke("GET");
  assert.equal(getResult.response.statusCode, 404);
  assert.equal(getResult.response.body.error.code, "NOT_FOUND");

  const optionsResult = invoke("OPTIONS");
  assert.equal(optionsResult.response.statusCode, 405);
  assert.equal(optionsResult.response.body.error.code, "METHOD_NOT_ALLOWED");
  assert.equal(optionsResult.headers.get("allow"), "GET");
  assert.equal(optionsResult.headers.has("access-control-allow-origin"), false);
  assert.equal(optionsResult.headers.has("access-control-allow-credentials"), false);
});
