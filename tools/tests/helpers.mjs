import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { repoRoot } from '../lib/paths.mjs';

// A whole scratch factory in a temp folder, driven only through the real command-line tools.
export function factory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyc-'));
  const dir = path.join(root, 'ideas', '2026-01-01-demo');
  for (const d of ['record', 'questions', 'decisions', 'handovers', 'cycles', 'artifacts/schema/migrations', 'artifacts/backend', 'artifacts/ui', 'artifacts/tests']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const tpl = (f) => fs.readFileSync(path.join(repoRoot, 'tools', 'templates', 'idea', f), 'utf8');
  const fill = (t) => t.replace(/\{\{id\}\}/, 'WI-001').replace(/\{\{(\w+)\}\}/g, 'demo');
  fs.writeFileSync(path.join(dir, 'status.md'), fill(tpl('status.md')));
  fs.writeFileSync(path.join(dir, 'brief.md'), fill(tpl('brief.md')).replace('| REQ-01 | |', '| REQ-01 | Visitors can join the list |').replace('| AC-01 | | REQ-01 |', '| AC-01 | A valid email is stored | REQ-01 |'));
  fs.writeFileSync(path.join(dir, 'decisions', 'ADR-001-stack.md'), fill(tpl('ADR-001-stack.md')));
  fs.cpSync(path.join(repoRoot, 'tools'), path.join(root, 'tools'), { recursive: true, filter: (s) => !s.includes('local-assets') && !s.includes(`${path.sep}dist`) });
  fs.cpSync(path.join(repoRoot, 'config'), path.join(root, 'config'), { recursive: true });
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(root, 'node_modules'), 'junction');
  const spawn = { spawnSync };
  const tool = (script, ...args) => spawnSync(process.execPath, ['--no-warnings', path.join(root, 'tools', script), ...args], { encoding: 'utf8' });
  const f = (rel, text) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const status = () => Object.fromEntries([...fs.readFileSync(path.join(dir, 'status.md'), 'utf8').matchAll(/^([a-z_]+): (.*)$/gm)].map((m) => [m[1], m[2]]));
  return { root, dir, tool, f, status, spawn };
}

export const PLAN = (cycle, areas = 'schema, api, ui, tests') => `# Plan\n\n**Cycle:** ${cycle}\n**Areas:** ${areas}\n\n## Work items\n\n| ID | Character | Work | Needs |\n|---|---|---|---|\n| W-01 | wirt | leads table | brief |\n| W-02 | griswold | POST and GET /leads | schema |\n| W-03 | adria | sign-up form | api.yaml |\n| W-04 | farnham | tests for AC-01 | api.yaml |\n\n## Dependencies\n\n| Artifact | Needed by | From | At contract version |\n|---|---|---|---|\n| schema | griswold | wirt | FROZEN v1 |\n| api.yaml | adria, farnham | griswold | FROZEN v1 |\n\n## Parallel steps\n\n- Adria and Farnham start once api.yaml is frozen.\n`;

export const API = `openapi: 3.0.3
info: { title: Leads, version: "1" }
paths:
  /leads:
    get:
      operationId: listLeads
      parameters:
        - { name: limit, in: query, schema: { type: integer, maximum: 100, default: 50 } }
      responses:
        "200": { description: ok, content: { application/json: { schema: { type: object, properties: { items: { type: array, items: { $ref: "#/components/schemas/Lead" } } } } } } }
        "400": { description: bad, content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } } }
    post:
      operationId: createLead
      requestBody: { content: { application/json: { schema: { $ref: "#/components/schemas/Lead" } } } }
      responses:
        "201": { description: created, content: { application/json: { schema: { $ref: "#/components/schemas/Lead" } } } }
        "422": { description: invalid, content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } } }
  /leads/{id}:
    get:
      operationId: getLead
      parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ]
      responses:
        "200": { description: ok, content: { application/json: { schema: { $ref: "#/components/schemas/Lead" } } } }
        "404": { description: missing, content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } } }
components:
  schemas:
    Lead: { type: object, properties: { id: { type: integer }, email: { type: string, format: email } }, required: [email] }
    Error: { type: object, properties: { message: { type: string } } }
`;

export const UP = 'CREATE TABLE leads (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);';

// Builds everything cycle 1 needs. The backend ships with a seeded bug (add() returns the wrong sum).
export function buildCycleOne(x) {
  const { tool, f } = x;
  assert.equal(tool('idea.mjs', 'accept-brief', 'demo', '--by', 'ceo').status, 0);
  assert.equal(tool('idea.mjs', 'accept-stack', 'demo', '--by', 'ceo', '--option', 'A').status, 0);
  const s = tool('cycle.mjs', 'start', 'demo');
  assert.equal(s.status, 0, s.stderr);
  f('plan.md', PLAN(1));
  f('artifacts/schema/migrations/001_leads.up.sql', UP);
  f('artifacts/schema/migrations/001_leads.down.sql', 'DROP TABLE leads;');
  tool('contract.mjs', 'init', 'demo', 'schema');
  assert.equal(tool('contract.mjs', 'freeze', 'demo', 'schema', '--by', 'cain').status, 0);
  f('artifacts/backend/api.yaml', API);
  tool('contract.mjs', 'init', 'demo', 'api');
  const fr = tool('contract.mjs', 'freeze', 'demo', 'api', '--by', 'cain');
  assert.equal(fr.status, 0, fr.stdout + fr.stderr);
  f('artifacts/backend/factory.json', '{"test":"node --test"}');
  f('artifacts/backend/impl.js', 'export const add = (a, b) => a + b + 1;   // seeded bug\n');
  f('artifacts/backend/leads.test.js', "import test from 'node:test'; import assert from 'node:assert/strict'; import { add } from './impl.js';\ntest('AC-01 stores a valid email (sum check)', () => assert.equal(add(1, 2), 3));\n");
  f('artifacts/backend/package.json', '{"type":"module"}');
  assert.equal(tool('mocks.mjs', 'generate', 'demo').status, 0);
  f('artifacts/ui/package.json', '{"type":"module"}');
  f('artifacts/ui/app.js', "const API = process.env.API_URL; // points at the mock server in development\nconsole.log('loading', 'empty', 'error', API);\n");
  f('artifacts/ui/build.js', "import fs from 'node:fs'; fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/index.html', '<p>ok</p>');\n");
  f('artifacts/ui/factory.json', '{"build":"node build.js","dist":"dist"}');
  f('artifacts/tests/package.json', '{"type":"module"}');
  f('artifacts/tests/factory.json', '{"test":"node --test"}');
  f('artifacts/tests/leads.test.js', "import test from 'node:test'; import assert from 'node:assert/strict';\ntest('AC-01 a valid email is accepted', () => assert.ok('ada@example.com'.includes('@')));\n");
}

