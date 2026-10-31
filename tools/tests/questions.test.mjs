import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import * as Q from '../lib/questions.mjs';

const tpl = (f) => fs.readFileSync(path.join(repoRoot, 'tools', 'templates', 'idea', f), 'utf8');
function makeIdea() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'q-'));
  fs.mkdirSync(path.join(dir, 'record'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'status.md'), tpl('status.md').replace(/\{\{id\}\}/, 'WI-014').replace(/\{\{(\w+)\}\}/g, 'x'));
  return { name: 'demo', dir };
}

test('questions get sequential ids that use the work item number', () => {
  const idea = makeIdea();
  assert.equal(Q.ask(idea, 'griswold', { question: 'Paginate GET /intake?', assumption: 'Yes, page size 50' }), 'Q-014-01');
  assert.equal(Q.ask(idea, 'adria', { question: 'Which date format?', blocking: true }), 'Q-014-02');
  assert.equal(Q.readAll(idea).length, 2);
});

test('a non-blocking question must state its assumption; characters are checked', () => {
  const idea = makeIdea();
  assert.throws(() => Q.ask(idea, 'wirt', { question: 'Index email?' }), /assumption/);
  assert.throws(() => Q.ask(idea, 'bob', { question: 'x', assumption: 'y' }), /not a character/);
  assert.throws(() => Q.ask(idea, 'wirt', { question: '', blocking: true }), /question is required/);
});

test('an assumption is logged, answered, and reviewed at checkpoint', () => {
  const idea = makeIdea();
  const id = Q.ask(idea, 'griswold', { question: 'Paginate GET /intake?', assumption: 'Paginated, page size 50, per the list-endpoint standard' });
  let q = Q.readAll(idea)[0];
  assert.equal(q.pending, true);
  assert.equal(q.decider, 'cain');
  assert.equal(Q.needsReview(idea).length, 1);                 // waiting for the checkpoint review

  Q.answer(idea, id, { text: 'Yes, paginate. Max page size 100. Cost: $0 (no change)', by: 'cain' });
  q = Q.readAll(idea)[0];
  assert.equal(q.pending, false);
  assert.match(q.answer, /answered by cain/);
  assert.match(q.answer, /\$0/);                                // a "$" in the text survives intact

  Q.reviewOne(idea, id, { decision: 'keep', by: 'cain', note: 'matches standard' });
  assert.equal(Q.needsReview(idea).length, 0);
  assert.match(Q.readAll(idea)[0].reviewed, /keep by cain/);
});

test('escalation goes to the CEO, and only the CEO can accept an assumption', () => {
  const idea = makeIdea();
  const id = Q.ask(idea, 'farnham', { question: 'Is a 5 percent flaky rate acceptable?', assumption: 'No' });
  assert.throws(() => Q.escalate(idea, id, ''), /why/);
  Q.escalate(idea, id, 'quality bar is a CEO decision');
  const q = Q.readAll(idea)[0];
  assert.equal(q.pending, true);
  assert.equal(q.decider, 'ceo');
  assert.throws(() => Q.acceptAssumption(idea, id, 'cain'), /only the CEO/);
  Q.acceptAssumption(idea, id, 'ceo');
  assert.match(Q.readAll(idea)[0].answer, /accepted as assumed \(by ceo/);
});

test('only Cain or the CEO answer; only Cain reviews', () => {
  const idea = makeIdea();
  const id = Q.ask(idea, 'wirt', { question: 'x?', assumption: 'y' });
  assert.throws(() => Q.answer(idea, id, { text: 'z', by: 'wirt' }), /only Cain or the CEO/);
  assert.throws(() => Q.reviewOne(idea, id, { decision: 'keep', by: 'wirt' }), /Cain reviews/);
  assert.throws(() => Q.reviewOne(idea, id, { decision: 'maybe', by: 'cain' }), /keep or revise/);
  assert.throws(() => Q.answer(idea, 'Q-014-99', { text: 'z', by: 'cain' }), /no question/);
});

test('the debrief lists assumptions that were never answered', () => {
  const idea = makeIdea();
  const a = Q.ask(idea, 'griswold', { question: 'a?', assumption: 'A' });
  const b = Q.ask(idea, 'adria', { question: 'b?', assumption: 'B' });
  Q.answer(idea, a, { text: 'ok', by: 'cain' });
  const rows = Q.debriefAssumptions(idea);
  assert.deepEqual(rows.map((r) => [r.id, r.closed]), [[a, true], [b, false]]);
});

test('blocking questions have no assumption to review', () => {
  const idea = makeIdea();
  const id = Q.ask(idea, 'adria', { question: 'Brand colours?', blocking: true });
  assert.equal(Q.needsReview(idea).length, 0);
  assert.throws(() => Q.reviewOne(idea, id, { decision: 'keep', by: 'cain' }), /blocking/);
  assert.throws(() => Q.acceptAssumption(idea, id, 'ceo'), /blocking/);
});
