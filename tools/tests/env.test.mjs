import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { factory, PLAN, buildCycleOne } from './helpers.mjs';

const queue = (x) => JSON.parse(fs.readFileSync(path.join(x.root, 'ceo', 'queue.json'), 'utf8'));
const withEnv = (vars, fn) => {
  const old = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try { return fn(); } finally { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};
const breakDatabase = (x) => x.f('artifacts/schema/CONTRACT.md', fs.readFileSync(path.join(x.dir, 'artifacts/schema/CONTRACT.md'), 'utf8').replace('**Engine:** sqlite', '**Engine:** postgres'));
const fixDatabase = (x) => x.f('artifacts/schema/CONTRACT.md', fs.readFileSync(path.join(x.dir, 'artifacts/schema/CONTRACT.md'), 'utf8').replace('**Engine:** postgres', '**Engine:** sqlite'));

test('a stopped scratch database produces a red portal and no cycle increment', () => {
  const x = factory(); buildCycleOne(x);
  x.f('artifacts/backend/impl.js', 'export const add = (a, b) => a + b;\n');        // fix the seeded bug so only the environment is wrong
  breakDatabase(x);

  const end = x.tool('cycle.mjs', 'end', 'demo');
  assert.equal(end.status, 2, end.stdout + end.stderr);
  assert.deepEqual([x.status().state, x.status().cycle], ['ENVIRONMENT_BLOCKED', '1']);
  assert.match(x.status().env_block, /no scratch adapter/);
  assert.deepEqual(queue(x).filter((e) => e.type === 'ENVIRONMENT_BLOCKED'), []);   // not raised to the CEO yet

  // the owning engineer gets two attempts
  assert.equal(x.tool('env.mjs', 'attempt', 'demo', '--by', 'griswold', '--note', 'x').status, 1);   // not his block
  assert.match(x.tool('env.mjs', 'status', 'demo').stdout, /wirt tries \(2 attempt/);
  assert.equal(x.tool('env.mjs', 'attempt', 'demo', '--by', 'wirt', '--note', 'restarted the scratch service', '--outcome', 'failed').status, 0);
  assert.equal(x.tool('env.mjs', 'attempt', 'demo', '--by', 'wirt', '--note', 'cleared its data folder', '--outcome', 'failed').status, 0);
  assert.match(x.tool('env.mjs', 'attempt', 'demo', '--by', 'wirt', '--note', 'third try').stderr, /2 attempts are used/);
  assert.equal(x.tool('env.mjs', 'recheck', 'demo').status, 2);                       // still failing

  // only Cain confirms and escalates, and only after both attempts
  assert.match(x.tool('env.mjs', 'escalate', 'demo', '--by', 'wirt', '--reason', 'r').stderr, /Cain confirms/);
  const esc = x.tool('env.mjs', 'escalate', 'demo', '--by', 'cain', '--reason', 'the scratch database is a service outside the factory');
  assert.equal(esc.status, 0, esc.stderr);
  const red = queue(x).filter((e) => e.colour === 'red');
  assert.equal(red.length, 1);
  assert.match(red[0].id, /^CQ-\d{4}-\d{2}-\d{2}-001$/);
  assert.equal(red[0].type, 'ENVIRONMENT_BLOCKED');
  assert.equal(red[0].location, 'wirt');                                              // the portal floats over Wirt's place on the map
  assert.deepEqual(red[0].options, ['resume_when_fixed', 'stop']);
  assert.match(x.tool('queue.mjs', 'list').stdout, /\[RED \].*ENVIRONMENT_BLOCKED/);

  // fixed: the item resumes at the same cycle and carries on
  fixDatabase(x);
  const res = x.tool('env.mjs', 'resume', 'demo', '--by', 'cain');
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual([x.status().state, x.status().cycle, x.status().env_block], ['BUILDING', '1', 'none']);
  assert.equal(queue(x).filter((e) => e.colour === 'red').length, 0);                 // the portal clears
  const again = x.tool('cycle.mjs', 'end', 'demo');
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.equal(x.status().state, 'PRE_REVIEW');
  assert.equal(x.status().cycle, '1');                                                // never counted as a cycle
});

test('an engineer can raise an environment block mid-build, and the CEO can decide from the queue', () => {
  const x = factory(); buildCycleOne(x);
  const r = x.tool('env.mjs', 'raise', 'demo', '--check', 'db_check', '--by', 'wirt', '--cause', 'scratch database unreachable');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(x.status().state, 'ENVIRONMENT_BLOCKED');
  x.tool('env.mjs', 'attempt', 'demo', '--by', 'wirt', '--note', 'a');
  x.tool('env.mjs', 'attempt', 'demo', '--by', 'wirt', '--note', 'b');
  x.tool('env.mjs', 'escalate', 'demo', '--by', 'cain', '--reason', 'external');
  const id = queue(x)[0].id;
  assert.equal(x.tool('queue.mjs', 'decide', id, 'approve_option_a').status, 1);      // not an option for this item
  const d = x.tool('queue.mjs', 'decide', id, 'resume_when_fixed', '--note', 'service restarted');
  assert.equal(d.status, 0, d.stderr);
  assert.deepEqual([x.status().state, x.status().cycle], ['BUILDING', '1']);
  assert.match(fs.readFileSync(path.join(x.dir, 'record', 'ceo-decisions.md'), 'utf8'), /ENVIRONMENT_BLOCKED: resume_when_fixed \(service restarted\)/);
  assert.equal(queue(x).length, 0);
});

test('a timeout is retried twice before it counts as an environment failure', () => {
  const x = factory(); buildCycleOne(x);
  x.f('artifacts/backend/impl.js', 'export const add = (a, b) => a + b;\n');
  x.f('artifacts/ui/hang.js', 'setTimeout(() => {}, 60000);\n');
  x.f('artifacts/ui/factory.json', '{"build":"node hang.js","dist":"dist"}');
  const r = withEnv({ TRISTRAM_CMD_TIMEOUT_MS: '500', TRISTRAM_RETRY_WAIT_MS: '20' }, () => x.tool('cycle.mjs', 'end', 'demo'));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /ui_check\s+ENVIRONMENT FAILURE \(after 2 retries\)/);
  assert.equal(x.status().state, 'ENVIRONMENT_BLOCKED');
  assert.equal(x.status().cycle, '1');
});

test('a check that passes only on a retry is logged, flagged gold, and not a clean pass', () => {
  const x = factory(); buildCycleOne(x);
  x.f('artifacts/backend/impl.js', 'export const add = (a, b) => a + b;\n');
  x.f('artifacts/ui/slow-once.js', "import fs from 'node:fs';\nconst n = fs.existsSync('.n') ? Number(fs.readFileSync('.n')) : 0;\nfs.writeFileSync('.n', String(n + 1));\nif (n < 1) setTimeout(() => {}, 60000);\nelse { fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/index.html', 'ok'); }\n");
  x.f('artifacts/ui/factory.json', '{"build":"node slow-once.js","dist":"dist"}');
  const r = withEnv({ TRISTRAM_CMD_TIMEOUT_MS: '1500', TRISTRAM_RETRY_WAIT_MS: '20' }, () => x.tool('cycle.mjs', 'end', 'demo'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ui_check\s+pass, but only after 1 retry: NOT A CLEAN PASS/);
  assert.match(fs.readFileSync(path.join(x.dir, 'record', 'flaky.jsonl'), 'utf8'), /"check":"ui_check".*"event":"retry-pass"/);
  const gold = queue(x).filter((e) => e.colour === 'gold');
  assert.equal(gold.length, 1);
  assert.equal(gold[0].type, 'FLAKY_CHECK');
  assert.match(fs.readFileSync(path.join(x.dir, 'record', 'log.md'), 'utf8'), /ui_check passed only after 1 retry: not a clean pass/);
});

test('the queue lists stack approval, escalated questions and a blocked item, with stable ids', () => {
  const x = factory();
  fs.writeFileSync(path.join(x.dir, 'decisions', 'ADR-001-stack.md'), fs.readFileSync(path.join(x.dir, 'decisions', 'ADR-001-stack.md'), 'utf8'));
  x.tool('questions.mjs', 'ask', 'demo', '--from', 'adria', '--question', 'Which brand colours?', '--blocking');
  x.tool('questions.mjs', 'escalate', 'demo', 'Q-001-01', '--reason', 'a product decision');
  x.tool('queue.mjs', 'build');
  const first = queue(x);
  assert.deepEqual(first.map((e) => e.type).sort(), ['QUESTION', 'STACK_APPROVAL']);
  assert.ok(first.every((e) => e.colour === 'blue'));
  const q = first.find((e) => e.type === 'QUESTION');
  assert.equal(q.location, 'adria');
  assert.deepEqual(q.options, ['answer']);                                           // blocking: needs an answer, not an acceptance
  // ids do not change when the queue is rebuilt, and new items get the next number
  x.tool('queue.mjs', 'build');
  assert.deepEqual(queue(x).map((e) => e.id).sort(), first.map((e) => e.id).sort());
  x.tool('questions.mjs', 'ask', 'demo', '--from', 'wirt', '--question', 'Soft delete?', '--blocking');
  x.tool('questions.mjs', 'escalate', 'demo', 'Q-001-02', '--reason', 'policy');
  x.tool('queue.mjs', 'build');
  assert.equal(new Set(queue(x).map((e) => e.id)).size, 3);

  // answering clears the entry; blocked after cycle 3 appears with return options for the owners
  x.tool('questions.mjs', 'answer', 'demo', 'Q-001-01', '--by', 'ceo', '--answer', 'dark teal');
  x.tool('queue.mjs', 'build');
  assert.equal(queue(x).filter((e) => e.type === 'QUESTION').length, 1);
});

test('a blocked item shows in the queue with its owners as return options, and the CEO can stop it', () => {
  const x = factory(); buildCycleOne(x);
  x.tool('cycle.mjs', 'end', 'demo');
  for (const cycle of [2, 3]) { x.tool('cycle.mjs', 'start', 'demo'); x.f('plan.md', PLAN(cycle, 'api')); x.tool('cycle.mjs', 'end', 'demo'); }
  assert.equal(x.status().state, 'BLOCKED_FOR_CEO');
  x.tool('queue.mjs', 'build');
  const b = queue(x).find((e) => e.type === 'BLOCKED_FOR_CEO');
  assert.equal(b.colour, 'blue');
  assert.deepEqual(b.options, ['send_to_lazarus', 'return_to:griswold', 'stop']);
  assert.match(b.summary, /DEF-001-01/);
  assert.equal(x.tool('queue.mjs', 'decide', b.id, 'stop').status, 0);
  assert.equal(x.status().state, 'STOPPED');
  assert.equal(queue(x).length, 0);
});
