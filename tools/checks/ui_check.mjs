// Adria's check (SPEC 7.3, 11): the UI builds, its mocks come from the current frozen contract, and no mock is
// reachable from the production build. Exit 0 pass, 1 defect, 2 environment failure.
// Usage: node ui_check.mjs <idea-name>
import fs from 'node:fs';
import path from 'node:path';
import { findIdea, parseStatus } from '../lib/idea.mjs';
import { readContract, contractHash } from '../lib/contract.mjs';
import { readMocks, dataFile } from '../lib/mocks.mjs';
import { list as listHandovers } from '../lib/handover.mjs';
import { readFactoryJson, run, tail } from '../lib/run.mjs';
import { nowIso } from '../lib/paths.mjs';

const name = process.argv[2];
if (!name) { console.error('usage: ui_check <idea-name>'); process.exit(2); }
const idea = findIdea(name);
const dir = path.join(idea.dir, 'artifacts', 'ui');
const results = [];
const pass = (n) => results.push({ ok: true, name: n });
const fail = (n, detail) => results.push({ ok: false, name: n, detail });
const warn = (n, detail) => results.push({ ok: true, warn: true, name: n, detail });

function finish(code) {
  const failed = results.filter((r) => !r.ok);
  const out = [`## ui_check ${nowIso()} (${failed.length ? 'FAIL' : 'PASS'})`, '', ...results.map((r) => `- ${r.ok ? (r.warn ? 'WARN' : 'PASS') : 'FAIL'} ${r.name}${r.detail ? `: ${r.detail}` : ''}`)].join('\n');
  console.log(out);
  try {
    const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
    const cdir = path.join(idea.dir, 'cycles', `cycle-${Math.max(1, Number(st.cycle || 1))}`);
    fs.mkdirSync(cdir, { recursive: true });
    fs.appendFileSync(path.join(cdir, 'checks.md'), out + '\n\n');
  } catch { /* on-screen report is enough */ }
  process.exit(code ?? (failed.length ? 1 : 0));
}

if (!fs.existsSync(dir)) { fail('artifacts/ui exists', 'no UI artifacts yet'); finish(1); }

// -- build ------------------------------------------------------------------------------------
let fj;
try { fj = readFactoryJson(dir); } catch (err) { fail('factory.json is valid', err.message); finish(1); }
if (!fj) fail('artifacts/ui/factory.json exists', 'Adria declares how to build, for example {"build":"npm run build","dist":"dist"}');
else if (!fj.build) fail('factory.json has a "build" command', 'add "build"');
else {
  for (const step of ['install', 'build', 'test']) {
    if (!fj[step]) continue;
    const r = run(fj[step], dir, step === 'install' ? 600000 : 300000);
    if (r.kind === 'environment') { console.error(`ui_check: environment failure: ${r.why}`); process.exit(2); }
    if (r.kind === 'failed') { fail(`UI ${step}`, `"${fj[step]}" exited ${r.code}:\n${tail(r.out)}`); break; }
    pass(`UI ${step} succeeds`);
  }
}

// -- mocks come from the current frozen contract ---------------------------------------------------
const api = readContract(idea, 'api');
const mocks = readMocks(idea);
if (api?.status === 'FROZEN') {
  if (!mocks) fail('mocks are listed in mocks.md', 'the api contract is frozen but there is no artifacts/ui/mocks.md. Run: node tools/mocks.mjs generate <idea>');
  else {
    let hashOk = false;
    try { hashOk = JSON.parse(fs.readFileSync(dataFile(idea), 'utf8')).hash === contractHash(idea, 'api'); } catch { /* handled below */ }
    if (!hashOk || !mocks.contract.includes(api.version)) fail('mocks are generated from the current frozen contract', `mocks were built from "${mocks.contract}" but the contract is FROZEN ${api.version}. Regenerate them`);
    else pass(`mocks come from api.yaml FROZEN ${api.version}`);
    // a ready handover from Griswold means the listed mocks must now be real calls
    const stale = new Set();
    for (const h of listHandovers(idea).filter((x) => x.from === 'griswold' && x.ready && x.to.includes('adria'))) {
      for (const n of (h.mocks.match(/\d+/g) || []).map(Number)) {
        const row = mocks.rows.find((r) => r.n === n);
        if (row && row.status === 'mock') stale.add(`${n} (${row.endpoint})`);
      }
    }
    if (stale.size) fail('mocks are replaced once the backend is ready', `still mocked although a ready handover lists them: ${[...stale].join(', ')}`);
    else if (mocks.rows.some((r) => r.status === 'mock')) warn('some endpoints are still mocked', `${mocks.rows.filter((r) => r.status === 'mock').length} of ${mocks.rows.length}`);
    else pass('every mock has been replaced by a real call');
  }
}

// -- no mock reachable from production -------------------------------------------------------------------
const MOCK_REF = /(["'`(][^"'`)\n]*\/mocks\/[^"'`)\n]*["'`)])|mock-data\.json|MOCK_API|USE_MOCKS\s*[=:]\s*true/i;
const SKIP_DIR = new Set(['node_modules', 'mocks', 'dist', 'build', '.next', '__tests__', 'coverage']);
function scan(root, skipMocks) {
  const hits = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!(skipMocks && SKIP_DIR.has(e.name))) walk(p); continue; }
      if (/\.(test|spec)\.|mocks\.md$|factory\.json$|\.(png|jpg|gif|ico|woff2?|map)$/i.test(e.name)) continue;
      const text = fs.readFileSync(p, 'utf8');
      if (text.length < 5_000_000 && MOCK_REF.test(text)) hits.push(path.relative(idea.dir, p).replace(/\\/g, '/'));
    }
  })(root);
  return hits;
}
// Best practice: the UI only knows an API base URL and Adria points it at the mock server (node tools/mocks.mjs serve),
// so no source file mentions the mocks. A development-only switch is allowed if the production build removes it,
// which the built output (factory.json "dist") proves. Without a "dist" folder the source scan is the only evidence.
const srcHits = scan(dir, true);
if (srcHits.length && !fj?.dist) fail('no mock is reachable from the production build', `source files reference the mocks: ${srcHits.slice(0, 5).join(', ')}, and factory.json has no "dist" to prove the production build removes them`);
else if (srcHits.length) warn('source files reference the mocks', `${srcHits.slice(0, 5).join(', ')} (allowed only if the production build removes them)`);
else pass('no source file references the mocks');
if (fj?.dist) {
  const dist = path.join(dir, fj.dist);
  if (!fs.existsSync(dist)) warn('production build output', `${fj.dist}/ not found after the build`);
  else {
    const built = scan(dist, false);
    if (built.length) fail('no mock is reachable from the production build', `the built output references the mocks: ${built.slice(0, 5).join(', ')}`);
    else pass('the production build contains no mock');
  }
} else warn('production build output', 'factory.json has no "dist" folder, so only the source was checked');

// -- UI states (SPEC standards/ux.md rule 1) ----------------------------------------------------------------
let srcText = '';
(function walk(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', 'dist', 'build', 'mocks'].includes(e.name)) walk(p); } else if (/\.(js|jsx|ts|tsx|vue|svelte|html|css)$/.test(e.name)) srcText += fs.readFileSync(p, 'utf8').toLowerCase() + '\n'; } })(dir);
const missing = ['loading', 'empty', 'error'].filter((s) => !srcText.includes(s));
if (srcText && missing.length) warn('UI states', `no mention of: ${missing.join(', ')}. Every screen needs loading, empty, error and success states`);
finish();
