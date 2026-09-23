import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const read = (relativePath) =>
  readFile(path.join(repositoryRoot, relativePath), "utf8");

test("governance artifacts are durable, replayable, and publicly redacted", async () => {
  const [service, pdf, signer, sharedDtos] = await Promise.all([
    read("functions/src/services/governanceReportArtifacts.ts"),
    read("functions/src/services/governanceReportPdf.ts"),
    read("functions/src/services/signedUrl.ts"),
    read("shared/contracts/apiDtos.d.ts"),
  ]);

  assert.match(pdf, /%PDF-1\.4/u);
  assert.match(pdf, /xref\\n/u);
  assert.match(pdf, /%%EOF\\n/u);
  assert.match(service, /preconditionOpts: \{ifGenerationMatch: 0\}/u);
  assert.match(service, /await this\.ensureStoredArtifact/u);
  assert.match(service, /transaction\.create\(references\.report, report\)/u);
  assert.match(service, /transaction\.create\(references\.audit/u);
  assert.match(service, /GENERATE_GOVERNANCE_REPORT/u);
  assert.match(service, /status: "generating"/u);
  assert.match(service, /status: "complete"/u);
  assert.match(service, /collectionGroup\(REPORTS_COLLECTION\)/u);
  assert.match(service, /\.limit\(2\)/u);
  assert.match(service, /governanceReportDownload/u);
  assert.match(signer, /GOVERNANCE_REPORT_DOWNLOAD_EXPIRY_SECONDS = 10 \* 60/u);
  assert.doesNotMatch(
    sharedDtos.match(
      /export interface AdminGovernanceReportDownloadResult \{[\s\S]*?\n\}/u,
    )?.[0] ?? "",
    /bucketName|gsUri|objectPath/u,
  );
  assert.doesNotMatch(
    sharedDtos.match(
      /export interface AdminGovernanceReportRecord \{[\s\S]*?\n\}/u,
    )?.[0] ?? "",
    /bucketName|gsUri|objectPath|downloadUrl/u,
  );
});
