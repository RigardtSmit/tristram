import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { repoRoot } from '../lib/paths.mjs';

// These tests run the real scripts against a scratch factory in a temp folder.

function scratchFactory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fac-'));
  const dir = path.join(root, 'ideas', '2026-01-01-demo');
  for (const d of ['artifacts/schema/migrations', 'record', 'questions', 'decisions']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const tpl = fs.readFileSync(path.join(repoRoot, 'tools', 'templates', 'idea', 'status.md'), 'utf8');
  fs.writeFileSync(path.join(dir, 'status.md'), tpl.replace(/\{\{id\}\}/, 'WI-001').replace(/\{\{name\}\}/g, 'demo').replace(/\{\{(\w+)\}\}/g, 'x'));
  return { root, dir, schema: path.join(dir, 'artifacts', 'schema') };
}
const write = (f, text) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

const GOOD_UP = `CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), total_cents INTEGER NOT NULL CHECK (total_cents >= 0));
CREATE INDEX idx_orders_user_id ON orders(user_id);`;
const GOOD_DOWN = 'DROP TABLE orders;\nDROP TABLE users;';

// db_check finds ideas through findIdea(), which reads the factory root from tools/lib/paths.mjs. For tests we point
// the scripts at the scratch factory by running them with a copy of the tools folder.
function withTools(factory) {
  const copy = path.join(factory.root, 'tools');
  fs.cpSync(path.join(repoRoot, 'tools'), copy, { recursive: true, filter: (s) => !s.includes('local-assets') && !s.includes(`${path.sep}dist`) });
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(factory.root, 'node_modules'), 'junction');
  return (script, args) => spawnSync(process.execPath, ['--no-warnings', path.join(copy, script), ...args], { encoding: 'utf8' });
}

test('a good schema passes, rolls back, and freezes as v1 only through Cain', () => {
  const f = scratchFactory(); const tool = withTools(f);
  write(path.join(f.schema, 'migrations', '001_core.up.sql'), GOOD_UP);
  write(path.join(f.schema, 'migrations', '001_core.down.sql'), GOOD_DOWN);
  write(path.join(f.schema, 'seed.sql'), "INSERT INTO users (email) VALUES ('ada@example.com');");
  assert.equal(tool('contract.mjs', ['init', 'demo', 'schema']).status, 0);
  const r = tool('checks/db_check.mjs', ['demo']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /PASS migrations roll back to an empty database/);
  assert.match(fs.readFileSync(path.join(f.dir, 'cycles', 'cycle-1', 'checks.md'), 'utf8'), /db_check .*\(PASS\)/);
  const bad = tool('contract.mjs', ['freeze', 'demo', 'schema', '--by', 'wirt']);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Cain freezes/);
  const ok = tool('contract.mjs', ['freeze', 'demo', 'schema', '--by', 'cain']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(fs.readFileSync(path.join(f.schema, 'CONTRACT.md'), 'utf8'), /\*\*Status:\*\* FROZEN[\s\S]*\*\*Version:\*\* v1/);
  assert.equal(tool('contract.mjs', ['verify', 'demo', 'schema']).status, 0);
  assert.notEqual(tool('contract.mjs', ['freeze', 'demo', 'schema', '--by', 'cain']).status, 0);   // already frozen
});

test('a frozen schema cannot change without a contract change', () => {
  const f = scratchFactory(); const tool = withTools(f);
  write(path.join(f.schema, 'migrations', '001_core.up.sql'), GOOD_UP);
  write(path.join(f.schema, 'migrations', '001_core.down.sql'), GOOD_DOWN);
  tool('contract.mjs', ['init', 'demo', 'schema']);
  assert.equal(tool('contract.mjs', ['freeze', 'demo', 'schema', '--by', 'cain']).status, 0);
  write(path.join(f.schema, 'migrations', '001_core.up.sql'), GOOD_UP + '\nCREATE INDEX idx_extra ON users(created_at);');
  assert.equal(tool('contract.mjs', ['verify', 'demo', 'schema']).status, 1);
  const r = tool('checks/db_check.mjs', ['demo']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL frozen contract is unchanged/);
});

test('db_check reports defects: missing key, unindexed foreign key, bad names, no rollback', () => {
  const f = scratchFactory(); const tool = withTools(f);
  write(path.join(f.schema, 'migrations', '001_bad.up.sql'), 'CREATE TABLE Users (Id INTEGER PRIMARY KEY, email TEXT);\nCREATE TABLE notes (note TEXT, user_id INTEGER REFERENCES Users(Id));');
  write(path.join(f.schema, 'migrations', '001_bad.down.sql'), 'DROP TABLE notes;');
  const r = tool('checks/db_check.mjs', ['demo']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Users" is not lowercase snake_case/);
  assert.match(r.stdout, /notes" has no primary key/);
  assert.match(r.stdout, /foreign key "notes.user_id" has no index/);
  assert.match(r.stdout, /after rolling back everything these tables remain: Users/);
});

test('db_check refuses unapproved destructive operations, missing downs, and real-looking personal data', () => {
  const f = scratchFactory(); const tool = withTools(f);
  write(path.join(f.schema, 'migrations', '001_core.up.sql'), GOOD_UP);
  write(path.join(f.schema, 'migrations', '001_core.down.sql'), GOOD_DOWN);
  write(path.join(f.schema, 'migrations', '002_cleanup.up.sql'), 'DROP INDEX idx_orders_user_id;');
  write(path.join(f.schema, 'seed.sql'), "INSERT INTO users (email) VALUES ('jane.doe@gmail.com');");
  const r = tool('checks/db_check.mjs', ['demo']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /002_cleanup.up.sql has no matching .down.sql/);
  assert.match(r.stdout, /contains DROP, TRUNCATE or an unfiltered DELETE/);
  write(path.join(f.schema, 'migrations', '002_cleanup.up.sql'), '-- approved-by-ceo: 2026-01-02\nDROP INDEX idx_orders_user_id;');
  write(path.join(f.schema, 'migrations', '002_cleanup.down.sql'), 'CREATE INDEX idx_orders_user_id ON orders(user_id);');
  const r2 = tool('checks/db_check.mjs', ['demo']);
  assert.match(r2.stdout, /FAIL no real personal data in seed: looks real: jane.doe@gmail.com/);
  assert.doesNotMatch(r2.stdout, /unfiltered DELETE/);
});

test('a missing schema is a defect, and a non-sqlite engine is an environment failure (exit 2)', () => {
  const f = scratchFactory(); const tool = withTools(f);
  fs.rmSync(path.join(f.schema, 'migrations'), { recursive: true });
  assert.equal(tool('checks/db_check.mjs', ['demo']).status, 1);
  fs.mkdirSync(path.join(f.schema, 'migrations'));
  write(path.join(f.schema, 'migrations', '001_core.up.sql'), GOOD_UP);
  write(path.join(f.schema, 'migrations', '001_core.down.sql'), GOOD_DOWN);
  tool('contract.mjs', ['init', 'demo', 'schema', '--engine', 'postgres']);
  const r = tool('checks/db_check.mjs', ['demo']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no scratch adapter for engine "postgres"/);
});

test('checkpoint commits the idea, records the hash, refuses unfinished writes, and is safe to repeat', () => {
  const f = scratchFactory(); const tool = withTools(f);
  const g = (...a) => execFileSync('git', a, { cwd: f.root, encoding: 'utf8' }).trim();
  g('init', '-q', '-b', 'idea/demo'); g('config', 'user.email', 't@example.com'); g('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(f.root, '.gitignore'), 'node_modules\n');
  g('add', '-A'); g('commit', '-q', '-m', 'base');
  write(path.join(f.schema, 'migrations', '001_core.up.sql'), GOOD_UP);
  write(path.join(f.dir, 'questions', 'griswold.md'), '');
  tool('questions.mjs', ['ask', 'demo', '--from', 'griswold', '--question', 'Paginate?', '--assumption', 'yes']);
  write(path.join(f.dir, 'artifacts', 'half.sql.tmp'), 'x');
  const blocked = tool('checkpoint.mjs', ['demo', '--step', 'draft', '--character', 'wirt']);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /unfinished writes/);
  fs.rmSync(path.join(f.dir, 'artifacts', 'half.sql.tmp'));
  const r = tool('checkpoint.mjs', ['demo', '--step', 'schema draft', '--character', 'wirt']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Cain must review 1 assumption/);
  assert.match(g('log', '--format=%s', '-3'), /checkpoint: WI-001 schema draft \(cycle 0, wirt\)/);
  assert.match(fs.readFileSync(path.join(f.dir, 'status.md'), 'utf8'), /^checkpoint: schema draft @ [0-9a-f]{7}/m);
  const again = tool('checkpoint.mjs', ['demo', '--step', 'schema draft', '--character', 'wirt']);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /nothing new to commit/);
});
