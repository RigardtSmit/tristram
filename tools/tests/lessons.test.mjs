import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { factory, buildCycleOne, PLAN } from './helpers.mjs';

const queue = (x) => JSON.parse(fs.readFileSync(path.join(x.root, 'ceo', 'queue.json'), 'utf8'));
const toDebrief = (x) => {
  buildCycleOne(x);
  x.f('artifacts/backend/impl.js', 'export const add = (a, b) => a + b;\n');
  assert.equal(x.tool('cycle.mjs', 'end', 'demo').status, 0);
  assert.equal(x.tool('review.mjs', 'start', 'demo', '--by', 'lazarus').status, 0);
  assert.equal(x.tool('review.mjs', 'verdict', 'demo', 'READY', '--by', 'lazarus').status, 0);
};
const CAND = ['candidate', 'demo', '--title', 'List endpoints need a maximum page size', '--tags', 'api,griswold', '--trigger', 'An endpoint returned unbounded result sets', '--rule', 'Every list endpoint enforces a maximum page size', '--evidence', 'DEF-001-01', '--by', 'ogden'];

test('a lesson is only a candidate until the CEO approves it; approval writes the library and the next idea uses it', () => {
  const x = factory(); toDebrief(x);
  assert.equal(x.status().state, 'DEBRIEF');
  assert.match(x.tool('lessons.mjs', 'candidate', ...CAND.slice(1, -2), '--by', 'cain').stderr, /Ogden drafts/);
  const c = x.tool('lessons.mjs', ...CAND);
  assert.match(c.stdout, /LC-01 drafted \(PENDING\)/, c.stderr);
  assert.equal(queue(x).filter((e) => e.type === 'LESSON_APPROVAL').length, 0);          // not shown until Lazarus has judged the evidence
  assert.match(x.tool('lessons.mjs', 'decide', 'demo', 'LC-01', 'approve', '--by', 'ceo').stderr, /Lazarus has not recommended/);
  assert.match(x.tool('lessons.mjs', 'recommend', 'demo', 'LC-01', 'approve', '--reason', 'the defect history shows it', '--by', 'ogden').stderr, /Lazarus recommends/);
  assert.equal(x.tool('lessons.mjs', 'recommend', 'demo', 'LC-01', 'approve', '--reason', 'DEF-001-01 was exactly this', '--by', 'lazarus').status, 0);
  assert.deepEqual(fs.readdirSync(path.join(x.root, 'knowledge', 'lessons')), []);          // still not a rule
  x.tool('queue.mjs', 'build');
  const q = queue(x).find((e) => e.type === 'LESSON_APPROVAL');
  assert.equal(q.colour, 'blue');
  assert.deepEqual(q.options, ['approve', 'reject']);

  // the debrief cannot close while a candidate is undecided
  assert.match(x.tool('debrief.mjs', 'close', 'demo', '--by', 'ogden').stderr, /LC-01/);
  assert.match(x.tool('lessons.mjs', 'decide', 'demo', 'LC-01', 'approve', '--by', 'ogden').stderr, /only when the CEO approves/);
  const d = x.tool('queue.mjs', 'decide', q.id, 'approve', '--rule', 'Every list endpoint enforces and documents a maximum page size');
  assert.equal(d.status, 0, d.stderr);
  assert.match(d.stdout, /as L-0001/);
  const lib = fs.readdirSync(path.join(x.root, 'knowledge', 'lessons'));
  assert.deepEqual(lib.sort(), ['INDEX.md', 'L-0001-list-endpoints-need-a-maximum-page-size.md']);
  const text = fs.readFileSync(path.join(x.root, 'knowledge', 'lessons', lib.find((f) => f.startsWith('L-0001'))), 'utf8');
  assert.match(text, /id: L-0001\ntitle: List endpoints need a maximum page size\ntags: \[api, griswold\]\nsource: ideas\/2026-01-01-demo\//);
  assert.match(text, /approved: \d{4}-\d{2}-\d{2} \(Debrief; Lazarus recommended approve, edited by the CEO\)/);
  assert.match(text, /\*\*Rule:\*\* Every list endpoint enforces and documents a maximum page size/);
  assert.match(fs.readFileSync(path.join(x.root, 'knowledge', 'lessons', 'INDEX.md'), 'utf8'), /- L-0001 \[api, griswold\] List endpoints need/);
  assert.equal(x.tool('checks/lessons_check.mjs').status, 0);

  const close = x.tool('debrief.mjs', 'close', 'demo', '--by', 'ogden');
  assert.equal(close.status, 0, close.stderr);
  assert.equal(x.status().state, 'CLOSED');
  const debrief = fs.readFileSync(path.join(x.dir, 'record', 'debrief.md'), 'utf8');
  assert.match(debrief, /closed after 1 cycle/);
  assert.match(debrief, /LC-01 List endpoints need a maximum page size: APPROVED as L-0001/);

  // the next idea in the same village is told about it when its cycle starts
  const dir2 = path.join(x.root, 'ideas', '2026-01-02-next');
  for (const s of ['record', 'questions', 'decisions', 'cycles', 'artifacts']) fs.mkdirSync(path.join(dir2, s), { recursive: true });
  fs.writeFileSync(path.join(dir2, 'status.md'), fs.readFileSync(path.join(x.dir, 'status.md'), 'utf8').replace(/name: demo/, 'name: next').replace(/folder: .*/, 'folder: ideas/2026-01-02-next').replace('id: WI-001', 'id: WI-002').replace(/state: \w+/, 'state: BRIEFING').replace(/cycle: \d+/, 'cycle: 0'));
  fs.writeFileSync(path.join(dir2, 'brief.md'), fs.readFileSync(path.join(x.dir, 'brief.md'), 'utf8').replace(/\*\*Status:\*\*.*/, '**Status:** DRAFT'));
  fs.copyFileSync(path.join(x.dir, 'decisions', 'ADR-001-stack.md'), path.join(dir2, 'decisions', 'ADR-001-stack.md'));
  fs.writeFileSync(path.join(dir2, 'decisions', 'ADR-001-stack.md'), fs.readFileSync(path.join(dir2, 'decisions', 'ADR-001-stack.md'), 'utf8').replace(/\*\*Status:\*\*.*/, '**Status:** PROPOSED').replace(/\*\*Decision:\*\*.*\n?/, ''));
  assert.equal(x.tool('idea.mjs', 'accept-brief', 'next', '--by', 'ceo').status, 0);
  assert.equal(x.tool('idea.mjs', 'accept-stack', 'next', '--by', 'ceo', '--option', 'A').status, 0);
  fs.writeFileSync(path.join(dir2, 'plan.md'), PLAN(1, 'api'));
  const s = x.tool('cycle.mjs', 'start', 'next');
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stdout, /Approved lessons that apply.*L-0001 List endpoints need a maximum page size/);
});

test('a rejected candidate never reaches the library, and a library lesson without a recorded approval fails the check', () => {
  const x = factory(); toDebrief(x);
  x.tool('lessons.mjs', ...CAND);
  x.tool('lessons.mjs', 'recommend', 'demo', 'LC-01', 'reject', '--reason', 'one-off', '--by', 'lazarus');
  assert.match(x.tool('lessons.mjs', 'decide', 'demo', 'LC-01', 'reject', '--by', 'ceo', '--note', 'agreed').stdout, /REJECTED/);
  assert.deepEqual(fs.readdirSync(path.join(x.root, 'knowledge', 'lessons')), []);
  assert.equal(x.tool('debrief.mjs', 'close', 'demo', '--by', 'ogden').status, 0);
  // a lesson file planted without going through approval is caught
  fs.mkdirSync(path.join(x.root, 'knowledge', 'lessons'), { recursive: true });
  fs.writeFileSync(path.join(x.root, 'knowledge', 'lessons', 'L-0001-planted.md'), '---\nid: L-0001\ntitle: Planted\ntags: [api]\nsource: ideas/2026-01-01-demo/\napproved: 2026-01-01 (Debrief; Lazarus recommended approve)\n---\n\n**Rule:** do the thing\n');
  const r = x.tool('checks/lessons_check.mjs');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /L-0001: the CEO's approval is not recorded/);
});
