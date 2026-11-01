// The first end-to-end run (SPEC 21: demo-form). A real git repository, a real worktree, and only the factory's own commands.
// What the characters would write is written by this test; everything the factory decides is left to the tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { repoRoot } from '../lib/paths.mjs';
import { PLAN, API, UP } from './helpers.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

function village() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'village-'));
  for (const f of git(repoRoot, 'ls-files').split('\n')) {
    if (f.startsWith('tools/map/mock')) continue;
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, f), path.join(root, f));
  }
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(root, 'node_modules'), 'junction');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'village');
  return root;
}

test('demo-form: an idea goes from briefing to a merged, closed item, with a fake test caught on the way', () => {
  const root = village();
  const tool = (script, ...args) => spawnSync(process.execPath, ['--no-warnings', path.join(root, 'tools', script), ...args], { encoding: 'utf8', cwd: root });
  const ok = (r, label) => { assert.equal(r.status, 0, `${label}: ${r.stdout}${r.stderr}`); return r.stdout; };
  const NAME = 'demo-form', FOLDER = `2026-01-01-${NAME}`;
  const wt = path.join(root, '.worktrees', NAME), dir = path.join(wt, 'ideas', FOLDER);
  const f = (rel, text) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const status = () => Object.fromEntries([...fs.readFileSync(path.join(dir, 'status.md'), 'utf8').matchAll(/^([a-z_]+): (.*)$/gm)].map((m) => [m[1], m[2]]));
  const queue = () => { tool('queue.mjs', 'build'); return JSON.parse(fs.readFileSync(path.join(root, 'ceo', 'queue.json'), 'utf8')); };
  const brief = () => fs.readFileSync(path.join(dir, 'brief.md'), 'utf8');
  let seq = 0;
  // one invocation by a character, recorded the way the SubagentStop hook does it
  const invoke = (agent, tokens, extra = {}) => {
    const id = `msg_${++seq}`, file = path.join(root, `t${seq}.jsonl`);
    const lines = [{ type: 'user', timestamp: new Date(Date.now() - 60000).toISOString(), message: { role: 'user', content: `Work on ideas/${FOLDER} as ${agent}` } },
      { type: 'assistant', timestamp: new Date().toISOString(), message: { id, model: 'claude-test', usage: { input_tokens: 10, output_tokens: tokens, cache_creation_input_tokens: 0, cache_read_input_tokens: 5000 }, content: [{ type: 'tool_use', id: `tu${seq}`, name: 'Read', input: {} }] } }];
    fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    return ok(tool('budget.mjs', 'record', '--transcript', file, '--agent', agent), `record ${agent}`);
  };
  const checkpoint = (step, who) => ok(tool('checkpoint.mjs', NAME, '--step', step, '--character', who), `checkpoint ${step}`);

  // ---- 1. the CEO brings an idea in ------------------------------------------------------------------------------
  ok(tool('new-idea.mjs', NAME, '--date', '2026-01-01'), 'new-idea');
  assert.equal(git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  assert.equal(git(wt, 'rev-parse', '--abbrev-ref', 'HEAD'), `idea/${NAME}`);
  assert.equal(status().state, 'BRIEFING');
  assert.match(tool('cycle.mjs', 'start', NAME).stderr, /build is blocked/);                  // no build before the brief and stack are accepted

  // ---- 2. briefing: brief, stack proposal, CEO approvals -----------------------------------------------------------
  f('brief.md', brief().replace('| REQ-01 | |', '| REQ-01 | Visitors can join the list with an email address |').replace('| AC-01 | | REQ-01 |', '| AC-01 | A valid email is stored | REQ-01 |'));
  ok(tool('questions.mjs', 'ask', NAME, '--from', 'adria', '--question', 'Should the form show a thank-you page?', '--assumption', 'A short inline message is enough'), 'question');
  f('decisions/ADR-001-stack.md', fs.readFileSync(path.join(root, 'tools', 'templates', 'idea', 'ADR-001-stack.md'), 'utf8').replace(/\{\{(\w+)\}\}/g, NAME));   // Cain proposes the stack
  invoke('cain', 4000);
  assert.deepEqual(queue().map((e) => e.type), ['STACK_APPROVAL']);                          // the unanswered question is non-blocking, so it is not in the CEO queue
  ok(tool('idea.mjs', 'accept-brief', NAME, '--by', 'ceo'), 'accept-brief');
  const q = queue().find((e) => e.type === 'STACK_APPROVAL');
  ok(tool('queue.mjs', 'decide', q.id, 'approve_option_a'), 'approve stack');
  ok(tool('budget.mjs', 'set-size', NAME, 'S', '--by', 'ceo'), 'size');
  assert.equal(status().active_stack, 'ADR-001 option A');

  // ---- 3. cycle 1: the village builds in parallel ----------------------------------------------------------------------
  ok(tool('cycle.mjs', 'start', NAME), 'cycle start');
  assert.deepEqual([status().state, status().cycle], ['BUILDING', '1']);
  f('plan.md', PLAN(1));
  ok(tool('plan.mjs', 'validate', NAME), 'plan');
  f('artifacts/design.md', '# Design\n\nA table, two endpoints, a form.\n');
  f('artifacts/traceability.md', '| Requirement | Acceptance criteria | Design | Schema | API | UI | Tests |\n|---|---|---|---|---|---|---|\n| REQ-01 | AC-01 | design.md | leads | POST /leads | form | leads.test.js |\n');
  invoke('cain', 9000); checkpoint('plan written', 'cain');
  f('artifacts/schema/migrations/001_leads.up.sql', UP);
  f('artifacts/schema/migrations/001_leads.down.sql', 'DROP TABLE leads;');
  ok(tool('contract.mjs', 'init', NAME, 'schema'), 'init schema');
  ok(tool('contract.mjs', 'freeze', NAME, 'schema', '--by', 'cain'), 'freeze schema');
  invoke('wirt', 12000); checkpoint('schema frozen v1', 'wirt');
  f('artifacts/backend/api.yaml', API);
  ok(tool('contract.mjs', 'init', NAME, 'api'), 'init api');
  ok(tool('contract.mjs', 'freeze', NAME, 'api', '--by', 'cain'), 'freeze api');
  ok(tool('mocks.mjs', 'generate', NAME), 'mocks');
  ok(tool('handover.mjs', 'create', NAME, '--from', 'griswold', '--to', 'adria,farnham', '--contract', 'api.yaml FROZEN v1', '--changed', 'initial contract', '--mocks', '1, 2'), 'handover');
  f('artifacts/backend/factory.json', '{"test":"node --test"}');
  f('artifacts/backend/package.json', '{"type":"module"}');
  f('artifacts/backend/impl.js', 'export const add = (a, b) => a + b + 1;   // seeded bug\n');
  f('artifacts/backend/leads.test.js', "import test from 'node:test'; import assert from 'node:assert/strict'; import { add } from './impl.js';\ntest('AC-01 stores a valid email (sum check)', () => assert.equal(add(1, 2), 3));\n");
  invoke('griswold', 30000); checkpoint('api frozen v1, endpoints drafted', 'griswold');
  f('artifacts/ui/package.json', '{"type":"module"}');
  f('artifacts/ui/app.js', "const API = process.env.API_URL; // mock server in development\nconsole.log('loading', 'empty', 'error', API);\n");
  f('artifacts/ui/build.js', "import fs from 'node:fs'; fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/index.html', '<p>form</p>');\n");
  f('artifacts/ui/factory.json', '{"build":"node build.js","dist":"dist"}');
  invoke('adria', 22000); checkpoint('form built against mocks', 'adria');
  f('artifacts/tests/package.json', '{"type":"module"}');
  f('artifacts/tests/factory.json', '{"test":"node --test"}');
  f('artifacts/tests/leads.test.js', "import test from 'node:test'; import assert from 'node:assert/strict';\ntest('AC-01 a valid email is accepted', () => assert.ok('ada@example.com'.includes('@')));\n");
  f('artifacts/tests/fake.test.js', "import test from 'node:test'; import assert from 'node:assert/strict';\ntest('AC-01 the form works', () => assert.ok(true));\n");
  invoke('farnham', 15000); checkpoint('tests written', 'farnham');

  const c1 = tool('cycle.mjs', 'end', NAME);
  assert.equal(c1.status, 1, c1.stdout + c1.stderr);
  assert.match(c1.stdout, /api_check\s+DEFECT \(1\)[\s\S]*DEF-001-01/);                       // the seeded bug is caught by a script, not a person
  assert.match(c1.stdout, /Cycle 2 of 3 starts/);

  // ---- 4. cycle 2: only Griswold has work; then Lazarus rejects the fake test -------------------------------------------
  const s2 = ok(tool('cycle.mjs', 'start', NAME), 'cycle 2 start');
  assert.match(s2, /griswold:[\s\S]*DEF-001-01/);
  f('plan.md', PLAN(2, 'api'));
  f('artifacts/backend/impl.js', 'export const add = (a, b) => a + b;\n');
  invoke('griswold', 6000); checkpoint('DEF-001-01 fixed', 'griswold');
  ok(tool('cycle.mjs', 'end', NAME), 'cycle 2 end');
  assert.equal(status().state, 'PRE_REVIEW');
  ok(tool('review.mjs', 'start', NAME, '--by', 'lazarus'), 'review 1');
  const flag = ok(tool('review.mjs', 'flags', NAME), 'flags').match(/TQ-\w+/)[0];
  ok(tool('review.mjs', 'flag', NAME, flag, 'confirm', '--by', 'lazarus', '--reason', 'assert.ok(true) proves nothing about the form'), 'flag');
  ok(tool('review.mjs', 'verdict', NAME, 'NOT_READY', '--by', 'lazarus'), 'verdict 1');
  assert.deepEqual([status().state, status().cycle], ['BUILDING', '3']);
  invoke('lazarus', 18000);
  assert.match(fs.readFileSync(path.join(dir, 'reviews', 'review-2.md'), 'utf8'), /Test quality: REJECTED[\s\S]*fake\.test\.js[\s\S]*Returned to: Farnham/);

  // ---- 5. cycle 3: Farnham writes a real test; Lazarus says READY -----------------------------------------------------------
  ok(tool('cycle.mjs', 'start', NAME), 'cycle 3 start');
  f('plan.md', PLAN(3, 'tests'));
  fs.rmSync(path.join(dir, 'artifacts/tests/fake.test.js'));
  f('artifacts/tests/leads.test.js', "import test from 'node:test'; import assert from 'node:assert/strict';\ntest('AC-01 a valid email is accepted', () => assert.match('ada@example.com', /^[^@\\s]+@[^@\\s]+$/));\ntest('AC-01 an address without @ is refused', () => assert.doesNotMatch('ada.example.com', /@/));\n");
  invoke('farnham', 9000); checkpoint('fake test replaced', 'farnham');
  ok(tool('cycle.mjs', 'end', NAME), 'cycle 3 end');
  const start2 = ok(tool('review.mjs', 'start', NAME, '--by', 'lazarus'), 'review 2');
  // replacing the fake test is flagged as a deleted test and a rewritten assertion; Lazarus reads each and decides
  assert.match(start2, /deleted-test[\s\S]*assertion-changed/);
  assert.match(tool('review.mjs', 'verdict', NAME, 'READY', '--by', 'lazarus').stderr, /review every test-quality flag/);
  for (const id of start2.match(/TQ-\w+/g)) ok(tool('review.mjs', 'flag', NAME, id, 'dismiss', '--by', 'lazarus', '--reason', 'the weak test was replaced by a stronger one, as the last review required'), 'dismiss');
  ok(tool('review.mjs', 'verdict', NAME, 'READY', '--by', 'lazarus', '--improvement', 'Add rate limiting after launch'), 'verdict 2');
  invoke('lazarus', 11000);
  assert.equal(status().state, 'DEBRIEF');
  assert.match(fs.readFileSync(path.join(dir, 'reviews', 'review-3.md'), 'utf8'), /VERDICT: READY/);

  // ---- 6. debrief: a lesson, approved by the CEO -------------------------------------------------------------------------
  ok(tool('lessons.mjs', 'candidate', NAME, '--title', 'A passing test must be able to fail', '--tags', 'testing,farnham', '--trigger', 'A test asserted a constant and passed', '--rule', 'Every test asserts a value that depends on the code under test', '--evidence', 'reviews/review-2.md', '--by', 'ogden'), 'candidate');
  ok(tool('lessons.mjs', 'recommend', NAME, 'LC-01', 'approve', '--reason', 'review-2 rejected exactly this', '--by', 'lazarus'), 'recommend');
  const lq = queue().find((e) => e.type === 'LESSON_APPROVAL');
  assert.ok(lq, 'the lesson waits in the CEO queue');
  assert.match(tool('debrief.mjs', 'close', NAME, '--by', 'ogden').stderr, /LC-01/);
  ok(tool('queue.mjs', 'decide', lq.id, 'approve'), 'approve lesson');
  ok(tool('debrief.mjs', 'close', NAME, '--by', 'ogden'), 'close');
  assert.equal(status().state, 'CLOSED');

  // ---- 7. merged to main; the next idea would see the lesson ---------------------------------------------------------------
  assert.match(tool('merge.mjs', NAME).stderr, /the CEO's decision/);
  ok(tool('merge.mjs', NAME, '--by', 'ceo'), 'merge');
  assert.ok(!fs.existsSync(wt), 'the worktree is removed');
  assert.match(git(root, 'branch', '--list', `idea/${NAME}`), /idea\/demo-form/);              // the branch is kept
  const merged = path.join(root, 'ideas', FOLDER);
  assert.match(fs.readFileSync(path.join(merged, 'record', 'debrief.md'), 'utf8'), /closed after 3 cycle/);
  assert.ok(fs.existsSync(path.join(root, 'knowledge', 'lessons', 'L-0001-a-passing-test-must-be-able-to-fail.md')));
  ok(tool('checks/lessons_check.mjs'), 'lessons_check');
  assert.match(git(root, 'log', '--oneline'), /checkpoint: WI-001 DEF-001-01 fixed/);
  assert.deepEqual(queue().filter((e) => e.item === FOLDER), []);                             // nothing is left waiting for the CEO

  // ---- 8. the numbers add up ------------------------------------------------------------------------------------------------
  const metrics = fs.readFileSync(path.join(merged, 'record', 'metrics.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(metrics.length, 10);                                                                // one record per invocation
  const spent = metrics.reduce((s, m) => s + m.tokens_in + m.tokens_out, 0);
  const text = ok(tool('metrics.mjs'), 'metrics');
  assert.match(text, new RegExp(`${spent.toLocaleString('en-US')} tokens, 10 invocation`));
  assert.match(text, /cycle 3/);
  ok(tool('dashboard.mjs'), 'dashboard');
  assert.match(fs.readFileSync(path.join(root, 'knowledge', 'roster', 'dashboard.html'), 'utf8'), /"invocations":10/);
  assert.match(ok(tool('budget.mjs', 'show', NAME), 'budget'), /size S/);
  const transitions = fs.readFileSync(path.join(merged, 'record', 'transitions.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.to).map((e) => e.to);
  assert.deepEqual(transitions, ['BRIEFING', 'BUILDING', 'PRE_REVIEW', 'BUILDING', 'PRE_REVIEW', 'IN_REVIEW', 'NOT_READY', 'BUILDING', 'PRE_REVIEW', 'IN_REVIEW', 'DEBRIEF', 'CLOSED']);
});
