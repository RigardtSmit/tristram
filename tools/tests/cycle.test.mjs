import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { factory, PLAN, API, buildCycleOne } from './helpers.mjs';

test('a seeded defect is caught in cycle 1 and fixed in cycle 2', () => {
  const x = factory(); buildCycleOne(x);
  const c1 = x.tool('cycle.mjs', 'end', 'demo');
  assert.equal(c1.status, 1, c1.stdout + c1.stderr);
  assert.match(c1.stdout, /api_check\s+DEFECT \(1\)/);
  assert.match(c1.stdout, /DEF-001-01/);
  assert.match(c1.stdout, /Cycle 2 of 3 starts/);
  assert.deepEqual([x.status().state, x.status().cycle], ['BUILDING', '2']);

  // cycle 2: only Griswold has anything to do; the fix is the whole change
  const st = x.tool('cycle.mjs', 'start', 'demo');
  assert.match(st.stdout, /Carried over[\s\S]*griswold[\s\S]*DEF-001-01/);
  assert.match(st.stdout, /plan\.md for cycle 2/);                              // the old plan is for cycle 1
  x.f('plan.md', PLAN(2, 'api'));
  x.f('artifacts/backend/impl.js', 'export const add = (a, b) => a + b;\n');
  const c2 = x.tool('cycle.mjs', 'end', 'demo');
  assert.equal(c2.status, 0, c2.stdout + c2.stderr);
  assert.match(c2.stdout, /ready for Lazarus/);
  assert.equal(x.status().state, 'PRE_REVIEW');
  const defects = x.tool('defects.mjs', 'list', 'demo', '--all').stdout;
  assert.match(defects, /DEF-001-01\s+fixed\s+griswold[\s\S]*1:raised 2:fixed/);
  assert.match(fs.readFileSync(path.join(x.dir, 'cycles', 'cycle-1', 'defects.md'), 'utf8'), /DEF-001-01 \| griswold \| api_check \| raised/);
  assert.match(fs.readFileSync(path.join(x.dir, 'cycles', 'cycle-2', 'defects.md'), 'utf8'), /DEF-001-01 \| griswold \| api_check \| fixed/);
});

test('a defect that is never fixed persists, and cycle 3 ends in BLOCKED_FOR_CEO', () => {
  const x = factory(); buildCycleOne(x);
  assert.equal(x.tool('cycle.mjs', 'end', 'demo').status, 1);
  for (const cycle of [2, 3]) {
    x.tool('cycle.mjs', 'start', 'demo'); x.f('plan.md', PLAN(cycle, 'api'));
    assert.equal(x.tool('cycle.mjs', 'end', 'demo').status, 1);
  }
  assert.equal(x.status().state, 'BLOCKED_FOR_CEO');
  assert.equal(x.status().stage, 'town-square');
  assert.match(x.tool('defects.mjs', 'list', 'demo').stdout, /1:raised 2:persisted 3:persisted/);
  assert.match(x.tool('cycle.mjs', 'start', 'demo').stderr, /BLOCKED_FOR_CEO/);
});

test('an environment failure blocks the item without using up a cycle', () => {
  const x = factory(); buildCycleOne(x);
  x.f('artifacts/schema/CONTRACT.md', fs.readFileSync(path.join(x.dir, 'artifacts/schema/CONTRACT.md'), 'utf8').replace('**Engine:** sqlite', '**Engine:** postgres'));
  const r = x.tool('cycle.mjs', 'end', 'demo');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /db_check\s+ENVIRONMENT FAILURE/);
  assert.deepEqual([x.status().state, x.status().cycle], ['ENVIRONMENT_BLOCKED', '1']);
  assert.match(fs.readFileSync(path.join(x.dir, 'cycles', 'cycle-1', 'env.md'), 'utf8'), /no scratch adapter for engine "postgres"/);
  assert.doesNotMatch(x.tool('defects.mjs', 'list', 'demo', '--all').stdout, /db_check/);   // not a defect
});

test('handovers: a claimed freeze must be real, addressees acknowledge, and versions are tracked', () => {
  const x = factory(); buildCycleOne(x);
  assert.match(x.tool('handover.mjs', 'create', 'demo', '--from', 'griswold', '--to', 'adria', '--contract', 'api.yaml FROZEN v2').stderr, /contract is FROZEN v1/);
  const ok = x.tool('handover.mjs', 'create', 'demo', '--from', 'griswold', '--to', 'adria,farnham', '--contract', 'api.yaml FROZEN v1', '--changed', 'POST /leads returns 422', '--mocks', '1, 2');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /HO-001-001/);
  assert.match(x.tool('handover.mjs', 'ack', 'demo', 'HO-001-001', '--by', 'wirt', '--version', 'api.yaml FROZEN v1').stderr, /addressed to adria, farnham/);
  assert.equal(x.tool('handover.mjs', 'ack', 'demo', 'HO-001-001', '--by', 'adria', '--version', 'api.yaml FROZEN v1').status, 0);
  const s = x.tool('handover.mjs', 'summary', 'demo').stdout;
  assert.match(s, /adria\s+api\.yaml FROZEN v1/);
  assert.match(s, /farnham: HO-001-001/);                                       // not yet acknowledged
  assert.match(x.tool('handover.mjs', 'list', 'demo', '--to', 'farnham', '--unread').stdout, /HO-001-001/);
});

test('mocks come from the frozen contract, include error responses, and can be served', async () => {
  const x = factory(); buildCycleOne(x);
  const data = JSON.parse(fs.readFileSync(path.join(x.dir, 'artifacts/ui/mocks/mock-data.json'), 'utf8'));
  assert.equal(data.contract, 'api.yaml FROZEN v1');
  const create = data.operations.find((o) => o.operationId === 'createLead');
  assert.deepEqual(Object.keys(create.responses), ['201', '422']);
  assert.equal(create.responses['201'].body.email, 'ada@example.com');          // generated from format: email
  const md = fs.readFileSync(path.join(x.dir, 'artifacts/ui/mocks.md'), 'utf8');
  assert.match(md, /\| 1 \| GET \/leads \| listLeads \| 200, 400 \| mock \|/);
  assert.match(x.tool('mocks.mjs', 'replace', 'demo', '1', '--by', 'griswold').stderr, /Adria replaces/);
  assert.equal(x.tool('mocks.mjs', 'replace', 'demo', '1', '--by', 'adria').status, 0);
  assert.match(fs.readFileSync(path.join(x.dir, 'artifacts/ui/mocks.md'), 'utf8'), /listLeads \| 200, 400 \| replaced \|/);

  const { serve } = await import(path.join(x.root, 'tools', 'lib', 'mocks.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
  const { findIdea } = await import(path.join(x.root, 'tools', 'lib', 'idea.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
  const server = await serve(findIdea('demo', x.root), 0);
  const port = server.address().port;
  const get = (p) => new Promise((res) => http.get({ port, path: p, host: '127.0.0.1' }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ status: r.statusCode, body: b })); }));
  assert.equal((await get('/leads/5')).status, 200);
  assert.equal((await get('/leads/5?mock_status=404')).status, 404);
  assert.equal((await get('/nope')).status, 404);
  server.close();
});

test('ui_check fails when a mock is reachable from the production build, or the mocks are stale', () => {
  const x = factory(); buildCycleOne(x);
  assert.equal(x.tool('checks/ui_check.mjs', 'demo').status, 0);
  x.f('artifacts/ui/build.js', "import fs from 'node:fs'; fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/index.html', '<script src=\"/mocks/mock-data.json\"></script>');\n");
  const r = x.tool('checks/ui_check.mjs', 'demo');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL no mock is reachable from the production build: the built output references the mocks/);
  x.f('artifacts/ui/build.js', "import fs from 'node:fs'; fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/index.html', 'ok');\n");
  x.f('artifacts/ui/mocks.md', fs.readFileSync(path.join(x.dir, 'artifacts/ui/mocks.md'), 'utf8').replace('FROZEN v1', 'FROZEN v0'));
  assert.match(x.tool('checks/ui_check.mjs', 'demo').stdout, /FAIL mocks are generated from the current frozen contract/);
});

test('ui_check fails when a ready handover lists mocks that were not replaced', () => {
  const x = factory(); buildCycleOne(x);
  x.tool('handover.mjs', 'create', 'demo', '--from', 'griswold', '--to', 'adria', '--contract', 'api.yaml FROZEN v1', '--ready', '--mocks', '1');
  assert.match(x.tool('checks/ui_check.mjs', 'demo').stdout, /FAIL mocks are replaced once the backend is ready: still mocked although a ready handover lists them: 1 \(GET \/leads\)/);
  x.tool('mocks.mjs', 'replace', 'demo', '1', '--by', 'adria');
  assert.doesNotMatch(x.tool('checks/ui_check.mjs', 'demo').stdout, /FAIL mocks are replaced/);
});

test('test_check demands a test for every acceptance criterion and a criterion for every test', () => {
  const x = factory(); buildCycleOne(x);
  assert.equal(x.tool('checks/test_check.mjs', 'demo').status, 0);
  x.f('artifacts/tests/orphan.test.js', "import test from 'node:test';\ntest('does something', () => {});\n");
  assert.match(x.tool('checks/test_check.mjs', 'demo').stdout, /FAIL every test traces to an acceptance criterion: no AC-NN reference in: orphan.test.js/);
  fs.rmSync(path.join(x.dir, 'artifacts/tests/orphan.test.js'));
  const brief = fs.readFileSync(path.join(x.dir, 'brief.md'), 'utf8').replace('| AC-01 |', '| AC-02 | Duplicates are refused | REQ-01 |\n| AC-01 |');
  x.f('brief.md', brief);
  assert.match(x.tool('checks/test_check.mjs', 'demo').stdout, /FAIL every acceptance criterion has a test: no test for: AC-02/);
});

test('api_check enforces the API standard on the contract', () => {
  const x = factory(); buildCycleOne(x);
  const bad = API.replace(', maximum: 100', '').replace('"422": { description: invalid, content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } } }', '"500": { description: oops }');
  fs.rmSync(path.join(x.dir, 'artifacts/backend/CONTRACT.md'));
  x.f('artifacts/backend/api.yaml', bad);
  const r = x.tool('checks/api_check.mjs', 'demo', '--contract-only');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /page-size parameter "limit" has no maximum/);
  assert.match(r.stdout, /takes a body but does not document 422/);
});

test('plan validation catches an unusable plan', () => {
  const x = factory(); buildCycleOne(x);
  assert.equal(x.tool('plan.mjs', 'validate', 'demo').status, 0);
  x.f('plan.md', PLAN(1).replace('| W-04 | farnham | tests for AC-01 | api.yaml |\n', '').replace('| W-03 | adria', '| W-03 | bob'));
  const r = x.tool('plan.mjs', 'validate', 'demo');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /"bob", who is not a character/);
  assert.match(r.stdout, /area "tests" is in the plan but farnham has no work item/);
  assert.match(x.tool('plan.mjs', 'validate', 'demo').stdout, /area "ui" is in the plan but adria has no work item/);
});

test('a change request changes one field: only the affected owners re-run, and the brief is versioned', () => {
  const x = factory(); buildCycleOne(x);
  assert.equal(x.tool('cycle.mjs', 'end', 'demo').status, 1);                      // cycle 1 ends with the seeded defect
  x.f('artifacts/backend/impl.js', 'export const add = (a, b) => a + b;\n');
  x.tool('cycle.mjs', 'start', 'demo'); x.f('plan.md', PLAN(2, 'api'));
  assert.equal(x.tool('cycle.mjs', 'end', 'demo').status, 0);                      // clean: PRE_REVIEW, cycle 2
  x.f('artifacts/traceability.md', '| Requirement | Acceptance criteria | Design | Schema | API | UI | Tests |\n|---|---|---|---|---|---|---|\n| REQ-01 | AC-01 | d | leads | POST /leads | form | leads.test.js |\n');
  assert.match(x.tool('change.mjs', 'impact', 'demo', 'REQ-01').stdout, /API\s+POST \/leads/);

  const open = x.tool('change.mjs', 'open', 'demo', '--title', 'Leads carry a phone number', '--why', 'Sales wants to call back', '--by', 'ceo');
  assert.match(open.stdout, /CR-001/);
  assert.match(x.tool('change.mjs', 'submit', 'demo', 'CR-001').stderr, /change map has no rows/);
  const cr = path.join(x.dir, 'changes', 'CR-001.md');
  fs.writeFileSync(cr, fs.readFileSync(cr, 'utf8').replace('|---|---|---|---|---|\n', '|---|---|---|---|---|\n| REQ-01 | email required | email, phone optional | Cain | yes |\n| backend/impl | add(a, b) | add(a, b), phone | Griswold | yes |\n| ui/form | email field | email and phone field | Adria | no |\n'));
  assert.equal(x.tool('change.mjs', 'submit', 'demo', 'CR-001').status, 0);
  const q = JSON.parse(fs.readFileSync(path.join(x.root, 'ceo', 'queue.json'), 'utf8')).find((e) => e.type === 'CHANGE_REQUEST');
  assert.deepEqual(q.options, ['approve', 'reject', 'narrow']);
  assert.match(x.tool('change.mjs', 'decide', 'demo', 'CR-001', 'approve', '--by', 'cain').stderr, /decided by the CEO/);

  const d = x.tool('queue.mjs', 'decide', q.id, 'approve');
  assert.equal(d.status, 0, d.stderr);
  assert.match(d.stdout, /re-run api/);
  assert.deepEqual([x.status().state, x.status().cycle, x.status().brief], ['BUILDING', '3', 'v2 accepted']);
  const brief = fs.readFileSync(path.join(x.dir, 'brief.md'), 'utf8');
  assert.match(brief, /\*\*Version:\*\* v2/);
  assert.match(brief, /- v2: CR-001 Leads carry a phone number \(changes REQ-01\)/);

  const st = x.tool('cycle.mjs', 'start', 'demo');
  assert.match(st.stdout, /Change CR-001 .* Cain plans only: api/);
  x.f('plan.md', PLAN(3, 'api, ui'));                                               // ui is not affected
  assert.match(x.tool('plan.mjs', 'validate', 'demo').stdout, /area "ui" is not affected by CR-001; only api re-run/);
  x.f('plan.md', PLAN(3, 'api'));
  const v = x.tool('plan.mjs', 'validate', 'demo');
  assert.equal(v.status, 0, v.stdout + v.stderr);
});
