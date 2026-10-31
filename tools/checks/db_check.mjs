// Wirt's check (SPEC 6.2, 10, 11): applies and rolls back the migrations on a throwaway SQLite database
// and checks the database standard. Exit 0 pass, 1 defect, 2 environment failure.
// Usage: node db_check.mjs <idea-name>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findIdea, parseStatus } from '../lib/idea.mjs';
import { readContract, verify } from '../lib/contract.mjs';
import { nowIso } from '../lib/paths.mjs';

const name = process.argv[2];
if (!name) { console.error('usage: db_check <idea-name>'); process.exit(2); }

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch (err) {
  console.error(`db_check: environment failure: node:sqlite is not available (${err.message}). Needs Node 22.5 or newer.`);
  process.exit(2);
}

const idea = findIdea(name);
const dir = path.join(idea.dir, 'artifacts', 'schema');
const results = [];                      // { ok, warn, name, detail }
const pass = (n) => results.push({ ok: true, name: n });
const fail = (n, detail) => results.push({ ok: false, name: n, detail });
const warn = (n, detail) => results.push({ ok: true, warn: true, name: n, detail });

const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const MIGRATION = /^(\d{3})_([a-z0-9_]+)\.(up|down)\.sql$/;
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const singular = (t) => (t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.endsWith('s') ? t.slice(0, -1) : t);

// -- 1. files -------------------------------------------------------------------
const migDir = path.join(dir, 'migrations');
if (!fs.existsSync(migDir) || !fs.readdirSync(migDir).some((f) => f.endsWith('.sql'))) {
  fail('migrations exist', 'artifacts/schema/migrations/ has no .sql files');
  report(1);
}
const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
const ups = new Map(), downs = new Map();
for (const f of files) {
  const m = f.match(MIGRATION);
  if (!m) { fail('migration naming', `${f} must be NNN_snake_case.up.sql or .down.sql`); continue; }
  (m[3] === 'up' ? ups : downs).set(Number(m[1]), { file: f, number: Number(m[1]) });
}
const nums = [...ups.keys()].sort((a, b) => a - b);
if (nums.some((n, i) => n !== i + 1)) fail('migration numbering', `numbers must run 001, 002, ... without gaps; found ${nums.join(', ')}`);
for (const n of nums) if (!downs.has(n)) fail('reversible migrations', `${ups.get(n).file} has no matching .down.sql`);
for (const n of downs.keys()) if (!ups.has(n)) fail('reversible migrations', `${downs.get(n).file} has no matching .up.sql`);
if (!results.some((r) => !r.ok)) pass('migrations are named, numbered and reversible');

// -- 2. contract ----------------------------------------------------------------
const contract = readContract(idea, 'schema');
if (!contract) warn('schema contract', 'no CONTRACT.md yet; run: node tools/contract.mjs init <idea> schema');
else {
  const engine = (contract.engine || 'sqlite').toLowerCase();
  if (engine !== 'sqlite') { console.error(`db_check: environment failure: no scratch adapter for engine "${engine}" yet (only sqlite).`); process.exit(2); }
  const v = verify(idea, 'schema');
  if (!v.ok) fail('frozen contract is unchanged', v.problem); else pass(v.frozen ? `frozen contract ${v.version} is unchanged` : 'contract is DRAFT');
}

// -- 3. destructive operations in "up" migrations -----------------------------------
const DESTRUCTIVE = /\bDROP\s+(TABLE|COLUMN|INDEX|VIEW|TRIGGER)\b|\bTRUNCATE\b|\bDELETE\s+FROM\s+\w+\s*(;|$)/im;
for (const { file } of ups.values()) {
  const sql = read(path.join(migDir, file));
  if (DESTRUCTIVE.test(sql) && !/--\s*approved-by-ceo:/i.test(sql)) {
    fail('no destructive operations without CEO approval', `${file} contains DROP, TRUNCATE or an unfiltered DELETE. Add "-- approved-by-ceo: <date>" once the CEO has approved`);
  }
}
if (!results.some((r) => !r.ok && r.name.startsWith('no destructive'))) pass('no unapproved destructive operations');

// -- 4. scratch database ----------------------------------------------------------------
let tmp, dbFile, db;
try {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tristram-scratch-'));
  dbFile = path.join(tmp, 'scratch.db');
  db = new DatabaseSync(dbFile);
  db.exec('PRAGMA foreign_keys = ON');
} catch (err) {
  console.error(`db_check: environment failure: cannot create the scratch database: ${err.message}`);
  process.exit(2);
}

const applyAll = () => {
  for (const n of nums) {
    try { db.exec(read(path.join(migDir, ups.get(n).file))); }
    catch (err) { fail('migrations apply', `${ups.get(n).file}: ${err.message}`); return false; }
  }
  return true;
};
const tables = () => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);

if (results.every((r) => r.ok) && applyAll()) {
  pass('migrations apply on the scratch database');

  // -- 5. standards -----------------------------------------------------------------
  const problems = [];
  for (const t of tables()) {
    if (!SNAKE.test(t)) problems.push(`table "${t}" is not lowercase snake_case`);
    else if (!t.endsWith('s') && !t.endsWith('data')) warn('table names are plural nouns', `"${t}" does not look plural`);
    const cols = db.prepare(`PRAGMA table_info(${t})`).all();
    for (const c of cols) if (!SNAKE.test(c.name)) problems.push(`column "${t}.${c.name}" is not lowercase snake_case`);
    const pk = cols.filter((c) => c.pk > 0);
    if (!pk.length) problems.push(`table "${t}" has no primary key`);
    else if (pk.length === 1 && pk[0].name !== 'id') problems.push(`table "${t}" has a single-column primary key named "${pk[0].name}"; it should be "id"`);
    const idx = db.prepare(`PRAGMA index_list(${t})`).all().map((i) => db.prepare(`PRAGMA index_info(${i.name})`).all().map((c) => c.name));
    for (const fk of db.prepare(`PRAGMA foreign_key_list(${t})`).all()) {
      if (!idx.some((cols2) => cols2[0] === fk.from) && !(pk.length && pk[0].name === fk.from)) problems.push(`foreign key "${t}.${fk.from}" has no index`);
      if (fk.from !== `${singular(fk.table)}_id`) warn('foreign keys are named <table_singular>_id', `"${t}.${fk.from}" references "${fk.table}"`);
    }
    for (const t2 of cols.filter((c) => /(^|_)(created|updated)_(at|on)$/.test(c.name) || /(^|_)(date|time)$/.test(c.name))) {
      if (/_on$/.test(t2.name)) warn('timestamps are created_at and updated_at', `"${t}.${t2.name}"`);
    }
  }
  if (problems.length) for (const p of problems) fail('database standard', p); else pass('database standard: names, keys and foreign-key indexes');

  // -- 6. seed data -------------------------------------------------------------------------
  const seedFile = path.join(dir, 'seed.sql');
  if (fs.existsSync(seedFile)) {
    const seed = read(seedFile);
    try { db.exec(seed); pass('seed data loads'); } catch (err) { fail('seed data loads', err.message); }
    const safeDomain = /@([a-z0-9.-]*\.)?(example\.(com|org|net)|test|invalid|localhost)\b/i;
    const emails = seed.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
    const real = emails.filter((e) => !safeDomain.test(e));
    const phones = (seed.match(/\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g) || []).filter((p) => !p.includes('555'));
    if (real.length || phones.length) fail('no real personal data in seed', `looks real: ${[...real, ...phones].slice(0, 5).join(', ')}. Use example.com addresses and 555 numbers`);
    else pass('seed data has no real-looking personal data');
    // restore a clean slate for the rollback test
    db.close(); fs.rmSync(dbFile, { force: true });
    db = new DatabaseSync(dbFile); db.exec('PRAGMA foreign_keys = ON');
    applyAll();
  }

  // -- 7. rollback and repeat -------------------------------------------------------------------
  let rolled = true;
  for (const n of [...nums].reverse()) {
    if (!downs.has(n)) { rolled = false; break; }
    try { db.exec(read(path.join(migDir, downs.get(n).file))); }
    catch (err) { fail('migrations roll back', `${downs.get(n).file}: ${err.message}`); rolled = false; break; }
  }
  if (rolled) {
    const left = tables();
    if (left.length) fail('migrations roll back', `after rolling back everything these tables remain: ${left.join(', ')}`);
    else {
      pass('migrations roll back to an empty database');
      if (applyAll()) pass('migrations re-apply after a rollback');
    }
  }
}

try { db?.close(); fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* scratch file only */ }

function report(code) {
  const failed = results.filter((r) => !r.ok);
  const lines = [`## db_check ${nowIso()} (${failed.length ? 'FAIL' : 'PASS'})`, ''];
  for (const r of results) lines.push(`- ${r.ok ? (r.warn ? 'WARN' : 'PASS') : 'FAIL'} ${r.name}${r.detail ? `: ${r.detail}` : ''}`);
  const out = lines.join('\n');
  console.log(out);
  try {
    const st = parseStatus(read(path.join(idea.dir, 'status.md')));
    const cdir = path.join(idea.dir, 'cycles', `cycle-${Math.max(1, Number(st.cycle || 1))}`);
    fs.mkdirSync(cdir, { recursive: true });
    fs.appendFileSync(path.join(cdir, 'checks.md'), out + '\n\n');
  } catch { /* the report on screen is enough if the cycle folder is not writable */ }
  process.exit(code ?? (failed.length ? 1 : 0));
}
report();
