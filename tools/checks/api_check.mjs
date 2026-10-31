// Griswold's check (SPEC 6.2, 11): the API contract follows the API standard, and the implementation builds and
// passes its tests. Exit 0 pass, 1 defect, 2 environment failure.
// Usage: node api_check.mjs <idea-name> [--contract-only]
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { findIdea, parseStatus } from '../lib/idea.mjs';
import { verify } from '../lib/contract.mjs';
import { readFactoryJson, run, tail } from '../lib/run.mjs';
import { nowIso } from '../lib/paths.mjs';

const name = process.argv[2];
const contractOnly = process.argv.includes('--contract-only');
if (!name) { console.error('usage: api_check <idea-name> [--contract-only]'); process.exit(2); }

const idea = findIdea(name);
const dir = path.join(idea.dir, 'artifacts', 'backend');
const results = [];
const pass = (n) => results.push({ ok: true, name: n });
const fail = (n, detail) => results.push({ ok: false, name: n, detail });
const warn = (n, detail) => results.push({ ok: true, warn: true, name: n, detail });
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const PAGE_PARAMS = ['limit', 'page_size', 'per_page', 'pagesize'];

function finish(code) {
  const failed = results.filter((r) => !r.ok);
  const out = [`## api_check ${nowIso()} (${failed.length ? 'FAIL' : 'PASS'})`, '', ...results.map((r) => `- ${r.ok ? (r.warn ? 'WARN' : 'PASS') : 'FAIL'} ${r.name}${r.detail ? `: ${r.detail}` : ''}`)].join('\n');
  console.log(out);
  try {
    const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
    const cdir = path.join(idea.dir, 'cycles', `cycle-${Math.max(1, Number(st.cycle || 1))}`);
    fs.mkdirSync(cdir, { recursive: true });
    fs.appendFileSync(path.join(cdir, 'checks.md'), out + '\n\n');
  } catch { /* on-screen report is enough */ }
  process.exit(code ?? (failed.length ? 1 : 0));
}

const specFile = path.join(dir, 'api.yaml');
if (!fs.existsSync(specFile)) { fail('api.yaml exists', 'artifacts/backend/api.yaml is missing'); finish(1); }

let spec;
try { spec = YAML.parse(fs.readFileSync(specFile, 'utf8')); } catch (err) { fail('api.yaml is valid YAML', err.message); finish(1); }

// -- the contract itself -----------------------------------------------------------------
if (!/^3\./.test(String(spec?.openapi ?? ''))) fail('api.yaml is OpenAPI 3', `"openapi" is ${spec?.openapi ?? 'missing'}`);
else if (!spec.info?.title || !spec.info?.version) fail('api.yaml has info.title and info.version', 'one of them is missing');
else if (!spec.paths || !Object.keys(spec.paths).length) fail('api.yaml defines paths', 'no paths');
else pass('api.yaml is OpenAPI 3 with info and paths');

const isErr = (code) => /^[45]\d\d$/.test(code) || code === 'default';
const ids = new Map();
const problems = [];
for (const [route, item] of Object.entries(spec?.paths ?? {})) {
  const sharedParams = item.parameters ?? [];
  for (const m of METHODS) {
    const op = item[m];
    if (!op) continue;
    const where = `${m.toUpperCase()} ${route}`;
    if (!op.operationId) problems.push(`${where} has no operationId`);
    else if (ids.has(op.operationId)) problems.push(`${where} reuses operationId "${op.operationId}" from ${ids.get(op.operationId)}`);
    else ids.set(op.operationId, where);
    const codes = Object.keys(op.responses ?? {}).map(String);
    if (!codes.some((c) => /^2\d\d$/.test(c))) problems.push(`${where} documents no 2xx response`);
    if (!codes.some(isErr)) problems.push(`${where} documents no error response`);
    if (op.requestBody && !codes.includes('422')) problems.push(`${where} takes a body but does not document 422 (validation errors)`);
    if (/\{[^}]+\}/.test(route) && !codes.includes('404')) problems.push(`${where} has a path parameter but does not document 404`);
    // list endpoints must bound their page size (L-0007 style rule from the API standard)
    const ok200 = op.responses?.['200']?.content?.['application/json']?.schema;
    const looksLikeList = m === 'get' && !/\{[^}]+\}\s*$/.test(route) && ok200 && (ok200.type === 'array' || ok200.properties?.items?.type === 'array' || ok200.properties?.data?.type === 'array' || ok200.properties?.results?.type === 'array');
    if (looksLikeList) {
      const params = [...sharedParams, ...(op.parameters ?? [])].map((p) => (p.$ref ? resolveRef(p.$ref) : p));
      const page = params.find((p) => PAGE_PARAMS.includes(String(p?.name).toLowerCase()));
      if (!page) problems.push(`${where} is a list endpoint with no page-size parameter (${PAGE_PARAMS.slice(0, 3).join(', ')})`);
      else if (typeof page.schema?.maximum !== 'number') problems.push(`${where} page-size parameter "${page.name}" has no maximum`);
    }
    for (const [code, resp] of Object.entries(op.responses ?? {})) {
      if (isErr(String(code)) && resp?.content && !JSON.stringify(resp).includes('#/components/schemas/Error')) warn('error responses use the shared Error schema', `${where} ${code}`);
    }
  }
}
function resolveRef(ref) { return ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], spec); }
if (problems.length) for (const p of problems) fail('API standard', p); else if (Object.keys(spec?.paths ?? {}).length) pass('API standard: operations, errors, 422, 404 and page sizes');

const v = verify(idea, 'api');
if (!v.ok && v.problem && !/no api contract/.test(v.problem)) fail('frozen contract is unchanged', v.problem);
else if (v.ok) pass(v.frozen ? `frozen contract ${v.version} is unchanged` : 'contract is DRAFT');

// -- the implementation ---------------------------------------------------------------------
if (!contractOnly && !results.some((r) => !r.ok)) {
  let fj;
  try { fj = readFactoryJson(dir); } catch (err) { fail('factory.json is valid', err.message); finish(1); }
  if (!fj) fail('artifacts/backend/factory.json exists', 'Griswold declares how to build and test, for example {"build":"npm run build","test":"npm test"}');
  else if (!fj.test) fail('factory.json has a "test" command', 'add "test"');
  else {
    for (const step of ['install', 'build', 'test']) {
      if (!fj[step]) continue;
      const r = run(fj[step], dir, step === 'install' ? 600000 : 300000);
      if (r.kind === 'environment') { console.error(`api_check: environment failure: ${r.why}`); process.exit(2); }
      if (r.kind === 'failed') { fail(`backend ${step}`, `"${fj[step]}" exited ${r.code}:\n${tail(r.out)}`); break; }
      pass(`backend ${step} succeeds`);
    }
  }
}
finish();
