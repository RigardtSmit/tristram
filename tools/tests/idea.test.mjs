// Run with: node --test tools/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import { gate, acceptBrief, acceptStack, transition, parseStatus, TRANSITIONS, STATES } from '../lib/idea.mjs';

const tpl = (f) => fs.readFileSync(path.join(repoRoot, 'tools', 'templates', 'idea', f), 'utf8');
const fill = (t) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => ({ id: 'WI-001', name: 'demo', folder: '2026-01-01-demo', branch: 'idea/demo', worktree: '.worktrees/demo', created: '2026-01-01T00:00:00Z' }[k] ?? ''));

function makeIdea() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idea-'));
  fs.mkdirSync(path.join(dir, 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'record'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'status.md'), fill(tpl('status.md')));
  fs.writeFileSync(path.join(dir, 'brief.md'), fill(tpl('brief.md')));
  return { name: 'demo', dir };
}
const fillBrief = (idea) => {
  const f = path.join(idea.dir, 'brief.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('| REQ-01 | |', '| REQ-01 | Users can sign up |').replace('| AC-01 | | REQ-01 |', '| AC-01 | Sign-up returns 201 | REQ-01 |'));
};
const writeAdr = (idea) => fs.writeFileSync(path.join(idea.dir, 'decisions', 'ADR-001-stack.md'), fill(tpl('ADR-001-stack.md')));
const state = (idea) => parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));

test('every state has a transition list and only known targets', () => {
  for (const s of STATES) assert.ok(TRANSITIONS[s], s);
  for (const [from, tos] of Object.entries(TRANSITIONS)) for (const to of tos) assert.ok(STATES.includes(to), `${from} -> ${to}`);
});

test('a new idea starts in BRIEFING with the build gate closed', () => {
  const idea = makeIdea();
  assert.equal(state(idea).state, 'BRIEFING');
  const g = gate(idea.dir);
  assert.equal(g.ok, false);
  assert.equal(g.problems.length, 2);
});

test('build is blocked until the brief and the stack are both accepted', () => {
  const idea = makeIdea();
  assert.throws(() => transition(idea, 'BUILDING'), /build is blocked/);
  fillBrief(idea); writeAdr(idea);
  acceptBrief(idea, 'ceo');
  assert.throws(() => transition(idea, 'BUILDING'), /ADR-001 is PROPOSED/);
  acceptStack(idea, 'ceo', 'A');
  assert.equal(gate(idea.dir).ok, true);
  const r = transition(idea, 'BUILDING');
  assert.deepEqual([r.from, r.to, r.cycle], ['BRIEFING', 'BUILDING', 1]);
  assert.equal(state(idea).stage, 'build');
  assert.match(state(idea).active_stack, /ADR-001 option A/);
});

test('approvals need the CEO and a real brief', () => {
  const idea = makeIdea();
  assert.throws(() => acceptBrief(idea, undefined), /CEO decision/);
  assert.throws(() => acceptBrief(idea, 'ceo'), /Fill in the brief/);
  fillBrief(idea);
  assert.throws(() => acceptStack(idea, 'ceo', 'A'), /ADR-001-stack.md is missing/);
  writeAdr(idea);
  assert.throws(() => acceptStack(idea, 'cain', 'A'), /CEO decision/);
  assert.throws(() => acceptStack(idea, 'ceo'), /which option/);
});

test('invalid moves are refused and terminal states stay terminal', () => {
  const idea = makeIdea();
  assert.throws(() => transition(idea, 'CLOSED'), /cannot move from BRIEFING to CLOSED/);
  transition(idea, 'STOPPED');
  assert.throws(() => transition(idea, 'BUILDING'), /terminal/);
});

test('problems start a new cycle, and cycle 3 ends in BLOCKED_FOR_CEO', () => {
  const idea = makeIdea();
  fillBrief(idea); writeAdr(idea); acceptBrief(idea, 'ceo'); acceptStack(idea, 'ceo', 'A');
  transition(idea, 'BUILDING');                       // cycle 1
  transition(idea, 'PRE_REVIEW');
  assert.equal(transition(idea, 'BUILDING').cycle, 2); // pre-review failed
  transition(idea, 'PRE_REVIEW'); transition(idea, 'IN_REVIEW'); transition(idea, 'NOT_READY');
  assert.equal(transition(idea, 'BUILDING').cycle, 3); // Lazarus said NOT READY
  transition(idea, 'PRE_REVIEW'); transition(idea, 'IN_REVIEW'); transition(idea, 'NOT_READY');
  assert.throws(() => transition(idea, 'BUILDING'), /cycle 3 of 3 is used up/);
  transition(idea, 'BLOCKED_FOR_CEO');
  assert.equal(state(idea).stage, 'town-square');
});

test('environment blocks resume with the same cycle', () => {
  const idea = makeIdea();
  fillBrief(idea); writeAdr(idea); acceptBrief(idea, 'ceo'); acceptStack(idea, 'ceo', 'A');
  transition(idea, 'BUILDING'); transition(idea, 'PRE_REVIEW'); transition(idea, 'BUILDING');
  transition(idea, 'ENVIRONMENT_BLOCKED');
  assert.equal(transition(idea, 'BUILDING').cycle, 2);
});

test('every move is logged and timestamped', () => {
  const idea = makeIdea();
  transition(idea, 'STOPPED', { note: 'test', actor: 'ceo' });
  const lines = fs.readFileSync(path.join(idea.dir, 'record', 'transitions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].to, 'STOPPED');
  assert.match(fs.readFileSync(path.join(idea.dir, 'record', 'log.md'), 'utf8'), /status BRIEFING -> STOPPED/);
  assert.match(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'), /\| BRIEFING \| STOPPED \| test \|/);
});
