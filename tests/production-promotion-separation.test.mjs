import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const workflowsDirectory = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const stagingWorkflowName = "frontend-ci-cd.yml";

function workflowJobs(source) {
  const jobsStart = source.indexOf("\njobs:\n");
  assert.ok(jobsStart >= 0, "workflow must contain a jobs block");
  const jobsSource = source.slice(jobsStart + 1);
  const matches = [...jobsSource.matchAll(/^  ([a-z][a-z0-9-]*):\n/gmu)];

  return new Map(
    matches.map((match, index) => {
      const nextMatch = matches[index + 1];
      const start = match.index;
      const end = nextMatch?.index ?? jobsSource.length;
      return [match[1], jobsSource.slice(start, end)];
    }),
  );
}

function workflowDispatchInputs(source) {
  const dispatchStart = source.indexOf("  workflow_dispatch:\n");
  const permissionsStart = source.indexOf("\npermissions:\n", dispatchStart);
  assert.ok(dispatchStart >= 0 && permissionsStart > dispatchStart);
  const dispatch = source.slice(dispatchStart, permissionsStart);

  return [...dispatch.matchAll(/^      ([a-z][a-z0-9_]*):\n/gmu)].map((match) => match[1]);
}

test("Firebase deployment remains staging-only across every workflow", async () => {
  const workflowNames = (await readdir(workflowsDirectory))
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort();
  assert.ok(workflowNames.length > 0, "at least one workflow must exist");

  let deploymentCommandCount = 0;
  for (const workflowName of workflowNames) {
    const source = await readFile(`${workflowsDirectory}/${workflowName}`, "utf8");
    const jobs = workflowJobs(source);

    for (const [jobName, job] of jobs) {
      const jobDeploymentCount = (job.match(/\bfirebase deploy\b/gu) ?? []).length;
      if (jobDeploymentCount === 0) {
        continue;
      }

      deploymentCommandCount += jobDeploymentCount;
      assert.equal(workflowName, stagingWorkflowName);
      assert.equal(jobName, "staging-deploy");
      assert.match(job, /environment:\n      name: staging/u);
      assert.match(job, /github\.ref_name == 'staging'/u);
      assert.match(job, /inputs\.deploy_staging == true/u);
      assert.match(job, /inputs\.staging_project_id == 'parabolic-dev'/u);
      assert.match(job, /FIREBASE_PROJECT_ID: \$\{\{ vars\.FIREBASE_PROJECT_ID \}\}/u);
      assert.equal((job.match(/--project "\$\{FIREBASE_PROJECT_ID\}"/gu) ?? []).length, 4);
      assert.doesNotMatch(job, /\bproduction\b|github\.ref_name == 'main'/u);
    }

    assert.doesNotMatch(source, /deploy_production|production_project_id|production-deploy/iu);
    assert.doesNotMatch(source, /environment:\n\s+name: production/u);
    assert.doesNotMatch(source, /--project (?:"[^"]*prod[^"]*"|[^\s]*prod[^\s]*)/iu);
  }

  assert.equal(deploymentCommandCount, 3, "only the three ordered staging deploys may exist");
});

test("manual dispatch and tracked Firebase aliases expose no production promotion input", async () => {
  const workflow = await readFile(`${workflowsDirectory}/${stagingWorkflowName}`, "utf8");
  assert.deepEqual(workflowDispatchInputs(workflow), ["deploy_staging", "staging_project_id"]);

  const firebaseRc = JSON.parse(await readFile(`${repositoryRoot}/.firebaserc`, "utf8"));
  assert.equal(firebaseRc.projects.default, "parabolic-dev");
  assert.deepEqual(Object.keys(firebaseRc.targets).sort(), [
    "demo-parabolic-test",
    "parabolic-dev",
  ]);
  assert.doesNotMatch(JSON.stringify(firebaseRc), /parabolic-prod|production/iu);
});
