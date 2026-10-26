import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {root, ts} from './helpers/vendor-action-inventory.mjs';
import {selectSuites} from '../scripts/frontend-test-ownership.mjs';

// Named critical obligations, not a percentage/code-coverage claim. Actual
// behavior runs in the owning suites; this gate prevents quietly dropping it.
const obligations = [
  [
    "exam",
    "exam-boundary-behavior",
    [
      "coalesced acquisition stores pending intent before the real HTTP dispatch and publishes only strict entry authority",
      "invalid bootstrap or unavailable intent storage prevents any acquisition HTTP request",
      "strict acquisition rejects foreign entry scope, hidden answers and false camera capabilities before active state",
      "answer dispatch freezes intent before queue waits and rejects foreign paths, queries and hidden dispatch",
      "lost submission uses strict canonical confirmation before replay and closes only on a real receipt",
      "malformed or foreign canonical confirmation never becomes submission success or a second mutation",
      "late canonical receipt after silent same-user scope replacement cannot close the original runtime",
      "strict transport keeps attestation denial recoverable while lease expiry prevents further answer dispatch"
    ]
  ],
  [
    "exam",
    "exam-recovery-boundary-behavior",
    [
      "typed server-first recovery preserves numeric and matrix truth, clear intent, review flags and immutable local counters",
      "mixed acknowledgement ordering is explicit and ignored or blocked writes cannot masquerade as persisted",
      "storage captures enqueued snapshot bytes but waits for transaction completion and current authority before durable success",
      "clock rejects invalid anchors and detached ordering and reanchors only from a new server receipt"
    ]
  ],
  [
    "exam",
    "exam-proctoring-behavior",
    [
      "overlapping camera permission completions and rejections cannot replace a newer consent cycle",
      "stalled preview play cannot block owner-loss cleanup or turn a zero-dimension preview into readiness",
      "reporting bursts batch at ten in order and only matching acknowledged events count as saved before the next five-second dispatch",
      "reporting deduplicates only same type and phase inside one second and stops a late failed flight after authority loss"
    ]
  ],
  [
    "exam",
    "exam-answer-recovery",
    [
      "schema 3 validates complete scope, every nested value, canonical response, counters and bounded bytes",
      "server-first merge reconstructs accepted/cleared answers, preserves only newer pending writes and reports conflicts/locks"
    ]
  ],
  [
    "exam",
    "exam-clock-transport",
    [
      "clock deducts full request time, recomputes elapsed, ignores both wall jumps and preserves ordering bounds",
      "question dwell excludes hidden/paused intervals and rejects throttled/sleep or backwards gaps"
    ]
  ],
  [
    "exam",
    "exam-launch-bootstrap",
    [
      "fragment capture cleans history synchronously and exposes only a one-shot secret",
      "invalid, ambiguous and legacy material is scrubbed without exposing a credential"
    ]
  ],
  [
    "exam",
    "exam-mounted-ownership",
    [
      "only bounded exact-scope token-free ownership records can be adopted",
      "lease receipts are closed, finite, canonical and bounded by server time, with conservative monotonic deadlines"
    ]
  ],
  [
    "exam",
    "exam-proctoring-runtime",
    [
      "queue preserves uncertain batch and ordering through exact 1/2/5 second retries, then explicit retry",
      "queue has one flight, coalesces, caps including flight, drops new and never persists or misacknowledges"
    ]
  ],
  [
    "exam",
    "exam-student-return",
    [
      "Student return uses only a distinct configured HTTPS origin and the fixed path",
      "loopback requires explicit isolated Auth emulator configuration and distinct local origins"
    ]
  ],
  [
    "exam",
    "exam-transport-ownership",
    [
      "429 renewal exhausts one coalesced budget without revocation or extending an uncertain receipt",
      "same-UID new-nonce token notification is terminal for the original document"
    ]
  ]
];

function titles(source) {
  const ast = ts.createSourceFile('proof.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), found = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'test' && ts.isStringLiteral(node.arguments[0])) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); return found;
}
function requireTitles(source, required) {
  const found = titles(source);
  for (const title of required) assert.equal(found.filter(value => value === title).length, 1, `Missing/duplicate executable obligation: ${title}`);
}
test('Exam critical behavioral obligations remain uniquely declared and selected by their owners', async () => {
  const manifest = JSON.parse(await readFile(`${root}/scripts/frontend-test-manifest.json`, 'utf8'));
  for (const [owner, suite, required] of obligations) {
    const file = `tests/${suite}.test.mjs`;
    assert.ok(selectSuites(manifest, owner).some(row => row.file === file && row.proof.includes('behavior')), file);
    requireTitles(await readFile(`${root}/${file}`, 'utf8'), required);
  }
});
test('removed, duplicated, skipped, TODO, focused and lookalike string declarations cannot satisfy critical proof ownership', () => {
  for (const source of ['', 'test.skip("proof", () => {});', 'test.todo("proof");', 'test.only("proof", () => {});',
    'const text = "proof";', 'test("proof", () => {}); test("proof", () => {});']) assert.throws(() => requireTitles(source, ['proof']));
  requireTitles('test("proof", () => {});', ['proof']);
});
