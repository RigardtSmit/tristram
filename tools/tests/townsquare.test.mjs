import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { factory, buildCycleOne, PLAN } from './helpers.mjs';

// An item that failed cycle 3: the seeded backend bug is never fixed.
function blocked() {
  const x = factory(); buildCycleOne(x);
  x.tool('cycle.mjs', 'end', 'demo');
  for (const cycle of [2, 3]) { x.tool('cycle.mjs', 'start', 'demo'); x.f('plan.md', PLAN(cycle, 'api')); x.tool('cycle.mjs', 'end', 'demo'); }
  assert.equal(x.status().state, 'BLOCKED_FOR_CEO');
  return x;
}
const ts = (x) => path.join(x.dir, 'town-square');

test('Town Square: statements are recorded in order, the summary quotes what it relies on, and option A sends the item to Lazarus with its known defects', () => {
  const x = blocked();
  const o = x.tool('townsquare.mjs', 'open', 'demo');
  assert.match(o.stdout, /Summoned: cain, griswold/, o.stderr);
  assert.match(x.tool('townsquare.mjs', 'open', 'demo').stderr, /already open/);
  assert.equal(x.tool('townsquare.mjs', 'say', 'demo', '--speaker', 'cain', '--text', 'DEF-001-01 persisted in all three cycles; I think the sum is wrong.').stdout.trim(), 'S1');
  assert.equal(x.tool('townsquare.mjs', 'say', 'demo', '--speaker', 'griswold', '--text', 'I never changed impl.js after cycle 1. One more cycle would fix it.').stdout.trim(), 'S2');
  assert.equal(x.tool('townsquare.mjs', 'say', 'demo', '--speaker', 'ceo', '--text', 'Is it a showstopper?').stdout.trim(), 'S3');
  assert.match(x.tool('townsquare.mjs', 'say', 'demo', '--speaker', 'bob', '--text', 'hi').stderr, /speaker must be one of/);
  const opts = x.tool('townsquare.mjs', 'options', 'demo').stdout;
  assert.match(opts, /DEF-001-01 \(griswold, api_check\).*1:raised 2:persisted 3:persisted/);
  assert.match(opts, /A\. Send to Lazarus[\s\S]*B \(griswold\)\. Return to griswold[\s\S]*C\. Stop the item/);

  assert.match(x.tool('townsquare.mjs', 'decide', 'demo', 'A', '--by', 'cain').stderr, /the CEO decides/);
  assert.match(x.tool('townsquare.mjs', 'decide', 'demo', 'A', '--by', 'ceo', '--rely', 'S9').stderr, /no statement S9/);
  const d = x.tool('townsquare.mjs', 'decide', 'demo', 'A', '--by', 'ceo', '--reason', 'cosmetic for now', '--rely', 'S1,S3');
  assert.equal(d.status, 0, d.stderr);
  assert.equal(x.status().state, 'IN_REVIEW');

  const files = fs.readdirSync(ts(x)).sort();
  assert.equal(files.length, 2);
  const transcript = fs.readFileSync(path.join(ts(x), files.find((f) => f.endsWith('-transcript.md'))), 'utf8');
  assert.ok(transcript.indexOf('[S1]') < transcript.indexOf('[S2]') && transcript.indexOf('[S2]') < transcript.indexOf('[S3]'));
  const summary = fs.readFileSync(path.join(ts(x), files.find((f) => f.endsWith('-summary.md'))), 'utf8');
  assert.match(summary, /Decision: \*\*A\. send to Lazarus\*\*/);
  assert.match(summary, /> cain: DEF-001-01 persisted in all three cycles; I think the sum is wrong\.  \(S1\)/);   // quoted verbatim
  assert.doesNotMatch(summary, /never changed impl\.js/);                                                         // S2 was not relied on
  assert.match(fs.readFileSync(path.join(x.dir, 'record', 'accepted-defects.md'), 'utf8'), /DEF-001-01/);

  // Lazarus can now give a verdict, and the accepted defect is named in it
  const v = x.tool('review.mjs', 'verdict', 'demo', 'READY', '--by', 'lazarus');
  assert.equal(v.status, 0, v.stderr);
  assert.match(fs.readFileSync(path.join(x.dir, 'reviews', 'review-3.md'), 'utf8'), /Known and accepted by CEO: DEF-001-01/);
});

test('Town Square option B returns the item to a named character with the CEO\'s direction', () => {
  const x = blocked();
  assert.match(x.tool('townsquare.mjs', 'decide', 'demo', 'B', '--by', 'ceo').stderr, /B needs --to/);
  assert.match(x.tool('townsquare.mjs', 'decide', 'demo', 'B', '--by', 'ceo', '--to', 'adria', '--direction', 'x').stderr, /adria owns no open defect/);
  const d = x.tool('townsquare.mjs', 'decide', 'demo', 'B', '--by', 'ceo', '--to', 'griswold', '--direction', 'Fix add() and nothing else');
  assert.equal(d.status, 0, d.stderr);
  assert.equal(x.status().state, 'BUILDING');
  assert.match(x.tool('cycle.mjs', 'start', 'demo').stdout, /CEO direction from Town Square .*for griswold: Fix add\(\) and nothing else/);
  assert.equal(fs.readdirSync(ts(x)).length, 2);                                       // a decision without a session still leaves a record
});

test('Town Square option C stops the item, and the CEO can decide from the queue', () => {
  const x = blocked();
  x.tool('queue.mjs', 'build');
  const q = JSON.parse(fs.readFileSync(path.join(x.root, 'ceo', 'queue.json'), 'utf8')).find((e) => e.type === 'BLOCKED_FOR_CEO');
  assert.deepEqual(q.options, ['send_to_lazarus', 'return_to:griswold', 'stop']);
  const d = x.tool('queue.mjs', 'decide', q.id, 'stop', '--note', 'not worth more budget');
  assert.equal(d.status, 0, d.stderr);
  assert.equal(x.status().state, 'STOPPED');
  const summary = fs.readFileSync(path.join(ts(x), fs.readdirSync(ts(x)).find((f) => f.endsWith('-summary.md'))), 'utf8');
  assert.match(summary, /Decision: \*\*C\. stop the item\*\*[\s\S]*Reason: not worth more budget/);
});

test('resume: a checkpoint that is not a real commit is refused, and an interrupted cycle end is repeated without double counting', () => {
  const x = factory(); buildCycleOne(x);
  assert.match(x.tool('resume.mjs', 'demo').stdout, /Next: Run \/cycle demo/);
  assert.equal(x.tool('cycle.mjs', 'end', 'demo').status, 1);                         // cycle 1 ends with DEF-001-01, cycle 2 begins
  // the process died after PRE_REVIEW began and the defect was recorded, before the item moved on
  fs.writeFileSync(path.join(x.dir, 'status.md'), fs.readFileSync(path.join(x.dir, 'status.md'), 'utf8').replace('state: BUILDING', 'state: PRE_REVIEW').replace('cycle: 2', 'cycle: 1'));
  const r = x.tool('resume.mjs', 'demo');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /repeating it \(nothing is counted twice\)/);
  assert.deepEqual([x.status().state, x.status().cycle], ['BUILDING', '2']);
  assert.match(x.tool('defects.mjs', 'list', 'demo', '--all').stdout, /DEF-001-01\s+open\s+griswold[^\n]*1:raised(?! 1:)/);   // raised once, not twice

  fs.writeFileSync(path.join(x.dir, 'status.md'), fs.readFileSync(path.join(x.dir, 'status.md'), 'utf8').replace('checkpoint: none', 'checkpoint: schema frozen v1 @ deadbeef1'));
  assert.match(x.tool('resume.mjs', 'demo').stderr, /checkpoint commit deadbeef1 .* does not exist/);
  fs.writeFileSync(path.join(x.dir, 'artifacts', 'half.json.tmp'), '{');
  fs.writeFileSync(path.join(x.dir, 'status.md'), fs.readFileSync(path.join(x.dir, 'status.md'), 'utf8').replace(/checkpoint: .*/, 'checkpoint: none'));
  assert.match(x.tool('resume.mjs', 'demo').stderr, /unfinished writes found[\s\S]*half\.json\.tmp/);
});
