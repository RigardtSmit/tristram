import test from 'node:test';
import assert from 'node:assert/strict';
import { scanFile, inventoryOf, compareInventory } from '../lib/testquality.mjs';

const rules = (file, text) => scanFile(file, text).map((f) => `${f.rule}:${f.test}`).sort();

test('the scanner flags every rejected pattern from SPEC 11.2', () => {
  const js = `
test('AC-01 always true', () => { expect(true).toBe(true); });
test('AC-01 nothing', () => { const r = add(1, 2); console.log(r); });
test('AC-01 just runs', () => { assert.doesNotThrow(() => add(1, 2)); });
test('AC-01 snapshot', () => { expect(render()).toMatchSnapshot(); });
test.skip('AC-01 skipped', () => { expect(add(1, 2)).toBe(3); });
test('AC-01 fine', () => { expect(add(1, 2)).toBe(3); });
vi.mock('./add.js');
`;
  assert.deepEqual(rules('a.test.js', js), [
    'always-true:AC-01 always true', 'mocks-unit:./add.js', 'no-assertions:AC-01 nothing', 'runs-only:AC-01 just runs', 'skipped:AC-01 skipped', 'snapshot:AC-01 snapshot',
  ]);
  assert.deepEqual(rules('b.test.js', "test('AC-01 node style', () => { assert.ok(true); });\ntest('AC-01 same', () => { assert.equal(3, 3); });"), ['always-true:AC-01 node style', 'always-true:AC-01 same']);
  const py = "def test_ok():\n    assert add(1, 2) == 3\n\ndef test_bad():\n    assert True\n\n@pytest.mark.skip\ndef test_skipped():\n    assert add(1, 2) == 3\n";
  assert.deepEqual(rules('test_x.py', py), ['always-true:test_bad', 'skipped:test_skipped']);
});

test('deleted tests and rewritten assertions are flagged against an earlier cycle', () => {
  const v1 = "test('AC-01 sum', () => { assert.equal(add(1, 2), 3); });\ntest('AC-02 other', () => { assert.equal(add(2, 2), 4); });";
  const v2 = "test('AC-01 sum', () => { assert.equal(add(1, 2), 4); });";            // expected value edited, one test deleted
  const flags = compareInventory(inventoryOf('a.test.js', v1), inventoryOf('a.test.js', v2));
  assert.deepEqual(flags.map((f) => `${f.rule}:${f.test}`).sort(), ['assertion-changed:AC-01 sum', 'deleted-test:AC-02 other']);
});

import fs from 'node:fs';
import path from 'node:path';
import { factory, buildCycleOne, PLAN } from './helpers.mjs';
import { decide } from '../lib/guard.mjs';
import { repoRoot } from '../lib/paths.mjs';

const fixClean = (x) => { x.f('artifacts/backend/impl.js', 'export const add = (a, b) => a + b;\n'); };
const SEEDED = "import test from 'node:test'; import assert from 'node:assert/strict';\ntest('AC-01 pretends to test', () => assert.ok(true));\n";

test('a seeded always-true test is flagged, Lazarus rejects it, and the item goes back to Farnham', () => {
  const x = factory(); buildCycleOne(x); fixClean(x);
  x.f('artifacts/tests/fake.test.js', SEEDED);
  const end = x.tool('cycle.mjs', 'end', 'demo');
  assert.equal(end.status, 0, end.stdout + end.stderr);                           // flags never fail the checks
  assert.match(fs.readFileSync(path.join(x.dir, 'cycles', 'cycle-1', 'checks.md'), 'utf8'), /WARN test-quality flag TQ-\w+ \(always-true\) fake\.test\.js:\d+ "AC-01 pretends to test"/);

  assert.match(x.tool('review.mjs', 'start', 'demo').stderr, /only Lazarus/);
  const start = x.tool('review.mjs', 'start', 'demo', '--by', 'lazarus');
  assert.equal(start.status, 0, start.stderr);
  assert.equal(x.status().state, 'IN_REVIEW');
  const id = start.stdout.match(/TQ-\w+/)[0];
  // a flag is not a verdict: he must look at each one before any verdict
  assert.match(x.tool('review.mjs', 'verdict', 'demo', 'READY', '--by', 'lazarus').stderr, /review every test-quality flag/);
  assert.match(x.tool('review.mjs', 'flag', 'demo', id, 'confirm', '--by', 'lazarus').stderr, /reason/);
  assert.equal(x.tool('review.mjs', 'flag', 'demo', id, 'confirm', '--by', 'lazarus', '--reason', 'asserts nothing about the email').status, 0);
  assert.match(x.tool('review.mjs', 'verdict', 'demo', 'READY', '--by', 'lazarus').stderr, /READY needs no findings and no confirmed/);
  const v = x.tool('review.mjs', 'verdict', 'demo', 'NOT_READY', '--by', 'lazarus', '--finding', 'griswold|POST /leads accepts an empty email and returns 500');
  assert.equal(v.status, 0, v.stderr);

  const review = fs.readFileSync(path.join(x.dir, 'reviews', 'review-1.md'), 'utf8');
  assert.match(review, /^VERDICT: NOT READY/);
  assert.match(review, /Test quality: REJECTED \(1 flag\(s\) reviewed\)\n  - fake\.test\.js:\d+ "AC-01 pretends to test"/);
  assert.match(review, /1\. Griswold: POST \/leads accepts an empty email and returns 500  \[DEF-001-\d+\]/);
  assert.match(review, /Returned to: Farnham \(test quality\), Griswold \(1\)/);
  assert.deepEqual([x.status().state, x.status().cycle], ['BUILDING', '2']);
  const d = x.tool('defects.mjs', 'list', 'demo').stdout;
  assert.match(d, /farnham.*test_quality|test_quality.*farnham/);
  assert.match(d, /griswold/);
});

test('a clean review gives READY and moves on to the debrief; a missed check blocks the review', () => {
  const x = factory(); buildCycleOne(x);
  assert.match(x.tool('review.mjs', 'start', 'demo', '--by', 'lazarus').stderr, /is BUILDING/);
  fixClean(x);
  assert.equal(x.tool('cycle.mjs', 'end', 'demo').status, 0);
  assert.equal(x.tool('review.mjs', 'start', 'demo', '--by', 'lazarus').status, 0);
  assert.match(x.tool('review.mjs', 'verdict', 'demo', 'NOT_READY', '--by', 'lazarus').stderr, /at least one named finding/);
  const v = x.tool('review.mjs', 'verdict', 'demo', 'READY', '--by', 'lazarus', '--improvement', 'Add a rate limit later');
  assert.equal(v.status, 0, v.stderr);
  assert.equal(x.status().state, 'DEBRIEF');
  assert.match(fs.readFileSync(path.join(x.dir, 'reviews', 'review-1.md'), 'utf8'), /VERDICT: READY[\s\S]*Test quality: ACCEPTED[\s\S]*Non-blocking improvements:\n1\. Add a rate limit later[\s\S]*Known and accepted by CEO: none/);
});

test('NOT READY on cycle 3 makes the item BLOCKED_FOR_CEO', () => {
  const x = factory(); buildCycleOne(x); fixClean(x);
  for (let c = 1; c <= 3; c++) {
    if (c > 1) { x.tool('cycle.mjs', 'start', 'demo'); x.f('plan.md', PLAN(c)); }
    assert.equal(x.tool('cycle.mjs', 'end', 'demo').status, 0);
    x.tool('review.mjs', 'start', 'demo', '--by', 'lazarus');
    assert.equal(x.tool('review.mjs', 'verdict', 'demo', 'NOT_READY', '--by', 'lazarus', '--finding', 'adria|submit has no disabled state').status, 0);
  }
  assert.equal(x.status().state, 'BLOCKED_FOR_CEO');
  assert.match(x.tool('defects.mjs', 'list', 'demo').stdout, /1:raised 2:persisted 3:persisted/);
});

test('the guard keeps each character inside its registry paths, and Lazarus read-only', () => {
  const g = (agent, tool, input) => decide({ agent, tool, input, root: repoRoot });
  const idea = path.join(repoRoot, 'ideas', '2026-01-01-demo');
  assert.equal(g('lazarus', 'Write', { file_path: path.join(idea, 'reviews', 'review-1.md') }).allow, true);
  assert.equal(g('lazarus', 'Write', { file_path: path.join(idea, 'artifacts', 'backend', 'impl.js') }).allow, false);
  assert.equal(g('griswold', 'Edit', { file_path: path.join(idea, 'artifacts', 'backend', 'impl.js') }).allow, true);
  assert.equal(g('griswold', 'Edit', { file_path: path.join(idea, 'artifacts', 'ui', 'app.js') }).allow, false);
  assert.equal(g('griswold', 'Write', { file_path: path.join(idea, 'record', 'metrics.jsonl') }).allow, false);
  assert.equal(g('ogden', 'Write', { file_path: path.join(idea, 'record', 'metrics.jsonl') }).allow, false);
  assert.equal(g('cain', 'Write', { file_path: path.join(repoRoot, '.worktrees', 'demo', 'ideas', '2026-01-01-demo', 'plan.md') }).allow, true);
  assert.equal(g('farnham', 'Write', { file_path: path.join(repoRoot, 'registry', 'cain.yaml') }).allow, false);
  assert.equal(g(undefined, 'Write', { file_path: path.join(repoRoot, 'registry', 'cain.yaml') }).allow, true);          // the main session is not a character
  for (const ok of ['ls ideas', 'cat ideas/x/brief.md | head -5', 'git log --oneline', 'grep -rn TODO ideas/x 2>&1', 'node tools/review.mjs flags demo']) assert.equal(g('lazarus', 'Bash', { command: ok }).allow, true, ok);
  for (const bad of ['npm test', 'echo hi > ideas/x/a.txt', 'git commit -am x', 'rm -rf ideas/x', 'sed -i s/a/b/ f', 'find . -delete', 'node ideas/x/impl.js']) assert.equal(g('lazarus', 'Bash', { command: bad }).allow, false, bad);
  assert.equal(g('griswold', 'Bash', { command: 'npm test' }).allow, true);
  assert.equal(g('griswold', 'Bash', { command: 'git push origin main' }).allow, false);
});

