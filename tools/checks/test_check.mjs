// Farnham's check (SPEC 11.2): the tests run, every acceptance criterion has a test, and every test traces to a
// criterion. Exit 0 pass, 1 defect, 2 environment failure. Rejected patterns are flagged for Lazarus, never failed (A8).
// Usage: node test_check.mjs <idea-name>
import fs from 'node:fs';
import path from 'node:path';
import { findIdea, parseStatus } from '../lib/idea.mjs';
import { readFactoryJson, run, tail } from '../lib/run.mjs';
import { nowIso } from '../lib/paths.mjs';
import { scanFile, inventoryOf, compareInventory } from '../lib/testquality.mjs';

const name = process.argv[2];
if (!name) { console.error('usage: test_check <idea-name>'); process.exit(2); }
const idea = findIdea(name);
const dir = path.join(idea.dir, 'artifacts', 'tests');
const results = [];
const pass = (n) => results.push({ ok: true, name: n });
const fail = (n, detail) => results.push({ ok: false, name: n, detail });

function finish(code) {
  const failed = results.filter((r) => !r.ok);
  const out = [`## test_check ${nowIso()} (${failed.length ? 'FAIL' : 'PASS'})`, '', ...results.map((r) => `- ${r.ok ? (r.warn ? 'WARN' : 'PASS') : 'FAIL'} ${r.name}${r.detail ? `: ${r.detail}` : ''}`)].join('\n');
  console.log(out);
  try {
    const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
    const cdir = path.join(idea.dir, 'cycles', `cycle-${Math.max(1, Number(st.cycle || 1))}`);
    fs.mkdirSync(cdir, { recursive: true });
    fs.appendFileSync(path.join(cdir, 'checks.md'), out + '\n\n');
  } catch { /* on-screen report is enough */ }
  process.exit(code ?? (failed.length ? 1 : 0));
}

if (!fs.existsSync(dir)) { fail('artifacts/tests exists', 'no tests yet'); finish(1); }

// -- traceability ---------------------------------------------------------------------------------------
const brief = fs.existsSync(path.join(idea.dir, 'brief.md')) ? fs.readFileSync(path.join(idea.dir, 'brief.md'), 'utf8') : '';
const criteria = [...brief.matchAll(/^\|\s*(AC-\d+)\s*\|\s*(\S.*?)\s*\|/gm)].map((m) => m[1]);
const TEST_FILE = /(\.(test|spec)\.[a-z]+$|^test_.*\.py$|_test\.(py|go)$|Test\.java$|Tests?\.cs$)/i;
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', '.venv', '__pycache__']);
const testFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p); } else if (TEST_FILE.test(e.name)) testFiles.push(p);
  }
})(dir);
if (!testFiles.length) fail('tests exist', 'no test files found under artifacts/tests');
else {
  const texts = testFiles.map((f) => ({ f: path.relative(dir, f).replace(/\\/g, '/'), t: fs.readFileSync(f, 'utf8') }));
  const untraced = texts.filter(({ t }) => !/\bAC-\d+\b/.test(t)).map(({ f }) => f);
  if (untraced.length) fail('every test traces to an acceptance criterion', `no AC-NN reference in: ${untraced.join(', ')}`);
  else pass('every test file references an acceptance criterion');
  const uncovered = criteria.filter((ac) => !texts.some(({ t }) => new RegExp(`\\b${ac}\\b`).test(t)));
  if (!criteria.length) fail('the brief has acceptance criteria', 'brief.md lists no AC-NN rows');
  else if (uncovered.length) fail('every acceptance criterion has a test', `no test for: ${uncovered.join(', ')}`);
  else pass(`all ${criteria.length} acceptance criteria have a test`);
}

// -- test quality flags (SPEC 11.2): recorded for Lazarus, never a verdict ----------------------------------------
if (testFiles.length) {
  const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
  const cycle = Math.max(1, Number(st.cycle || 1)), cdir = path.join(idea.dir, 'cycles', `cycle-${cycle}`);
  fs.mkdirSync(cdir, { recursive: true });
  const waiverFile = path.join(idea.dir, 'record', 'test-waivers.md');
  const waivers = fs.existsSync(waiverFile) ? fs.readFileSync(waiverFile, 'utf8').split('\n').filter((l) => /approved by cain/i.test(l)) : [];
  const rel = (f) => path.relative(dir, f).replace(/\\/g, '/');
  let flags = [], inventory = {};
  for (const f of testFiles) { const text = fs.readFileSync(f, 'utf8'); flags.push(...scanFile(rel(f), text)); Object.assign(inventory, inventoryOf(rel(f), text)); }
  const prevDirs = fs.readdirSync(path.join(idea.dir, 'cycles')).filter((d) => /^cycle-\d+$/.test(d) && Number(d.slice(6)) < cycle).sort((a, b) => Number(b.slice(6)) - Number(a.slice(6)));
  const prevInv = prevDirs.map((d) => path.join(idea.dir, 'cycles', d, 'test-inventory.json')).find((p) => fs.existsSync(p));
  if (prevInv) flags.push(...compareInventory(JSON.parse(fs.readFileSync(prevInv, 'utf8')), inventory));
  const waived = (fl) => ['skipped', 'deleted-test', 'assertion-changed'].includes(fl.rule) && waivers.some((w) => w.includes(fl.file) && (w.includes(`::${fl.test}`) || w.includes(`${fl.file}::*`)));
  flags = flags.filter((fl) => !waived(fl));
  const flagFile = path.join(cdir, 'test-flags.json');
  const old = fs.existsSync(flagFile) ? JSON.parse(fs.readFileSync(flagFile, 'utf8')).flags : [];
  flags = flags.map((fl) => ({ ...fl, disposition: old.find((o) => o.id === fl.id)?.disposition ?? null }));
  fs.writeFileSync(flagFile, JSON.stringify({ cycle, flags }, null, 2) + '\n');
  fs.writeFileSync(path.join(cdir, 'test-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  for (const fl of flags) results.push({ ok: true, warn: true, name: `test-quality flag ${fl.id} (${fl.rule}) ${fl.file}${fl.line ? `:${fl.line}` : ''} "${fl.test}"`, detail: `${fl.detail}. Lazarus reviews it` });
  if (!flags.length) pass('no test-quality flags');
}

// -- run them ----------------------------------------------------------------------------------------------------
let fj;
try { fj = readFactoryJson(dir); } catch (err) { fail('factory.json is valid', err.message); finish(1); }
if (!fj) fail('artifacts/tests/factory.json exists', 'Farnham declares how to run the tests, for example {"test":"npm test"}');
else if (!fj.test) fail('factory.json has a "test" command', 'add "test"');
else {
  for (const step of ['install', 'test']) {
    if (!fj[step]) continue;
    const r = run(fj[step], dir, step === 'install' ? 600000 : 600000);
    if (r.kind === 'environment') { console.error(`test_check: environment failure: ${r.why}`); process.exit(2); }
    if (r.kind === 'failed') { fail(`tests ${step === 'test' ? 'pass' : 'install'}`, `"${fj[step]}" exited ${r.code}:\n${tail(r.out)}`); break; }
    pass(step === 'test' ? 'the tests pass' : 'test dependencies install');
  }
}
finish();
