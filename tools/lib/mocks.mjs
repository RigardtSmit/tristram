// Mocks (SPEC 7.3): generated from the frozen API contract, never written from memory.
// Each mock is listed in artifacts/ui/mocks.md with the endpoint it replaces.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import YAML from 'yaml';
import { nowIso } from './paths.mjs';
import { logEvent, writeAtomic } from './idea.mjs';
import { readContract, contractHash } from './contract.mjs';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const uiDir = (idea) => path.join(idea.dir, 'artifacts', 'ui');
export const mocksFile = (idea) => path.join(uiDir(idea), 'mocks.md');
export const dataFile = (idea) => path.join(uiDir(idea), 'mocks', 'mock-data.json');

// ---- example bodies from a schema ---------------------------------------------------------

function deref(spec, node) {
  let n = node, hops = 0;
  while (n?.$ref && hops++ < 20) n = n.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], spec);
  return n;
}
export function example(spec, schema, depth = 0) {
  const s = deref(spec, schema);
  if (!s || depth > 6) return null;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (s.enum?.length) return s.enum[0];
  if (s.allOf) return Object.assign({}, ...s.allOf.map((x) => example(spec, x, depth + 1)));
  if (s.oneOf || s.anyOf) return example(spec, (s.oneOf || s.anyOf)[0], depth + 1);
  switch (s.type) {
    case 'object': case undefined: {
      if (!s.properties) return s.type === 'object' ? {} : null;
      return Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, example(spec, v, depth + 1)]));
    }
    case 'array': return Array.from({ length: Math.max(1, s.minItems ?? 1) }, () => example(spec, s.items, depth + 1));
    case 'integer': return s.minimum ?? 1;
    case 'number': return s.minimum ?? 1.5;
    case 'boolean': return true;
    case 'string': {
      const f = s.format;
      if (f === 'email') return 'ada@example.com';
      if (f === 'date-time') return '2026-01-01T00:00:00Z';
      if (f === 'date') return '2026-01-01';
      if (f === 'uuid') return '00000000-0000-4000-8000-000000000001';
      if (f === 'uri' || f === 'url') return 'https://example.com';
      return s.minLength ? 'x'.repeat(s.minLength) : 'string';
    }
    default: return null;
  }
}

// ---- generate -----------------------------------------------------------------------------------

export function readMocks(idea) {
  if (!fs.existsSync(mocksFile(idea))) return null;
  const text = fs.readFileSync(mocksFile(idea), 'utf8').replace(/\r\n/g, '\n');
  const rows = [...text.matchAll(/^\|\s*(\d+)\s*\|\s*([A-Z]+ \S+)\s*\|\s*(\S+)\s*\|\s*([^|]*)\|\s*(mock|replaced)\s*\|$/gm)]
    .map((m) => ({ n: Number(m[1]), endpoint: m[2], operationId: m[3], statuses: m[4].trim(), status: m[5] }));
  return { text, contract: text.match(/^\*\*Contract:\*\*\s*(.*)$/m)?.[1]?.trim() ?? '', rows };
}

export function generate(idea) {
  const c = readContract(idea, 'api');
  if (!c || c.status !== 'FROZEN') throw new Error('mocks are generated from a FROZEN api contract. Cain freezes it first: node tools/contract.mjs freeze <idea> api --by cain');
  const spec = YAML.parse(fs.readFileSync(path.join(idea.dir, 'artifacts', 'backend', 'api.yaml'), 'utf8'));
  const previous = new Map((readMocks(idea)?.rows ?? []).map((r) => [r.operationId, r.status]));
  const ops = [];
  for (const [route, item] of Object.entries(spec.paths ?? {})) {
    for (const m of METHODS) {
      const op = item[m];
      if (!op) continue;
      const responses = {};
      for (const [code, resp] of Object.entries(op.responses ?? {})) {
        const schema = resp?.content?.['application/json']?.schema;
        responses[code] = { status: code === 'default' ? 500 : Number(code), body: schema ? example(spec, schema) : null };
      }
      ops.push({ n: ops.length + 1, method: m.toUpperCase(), path: route, operationId: op.operationId || `${m}_${route}`, responses });
    }
  }
  const version = `api.yaml ${c.status} ${c.version}`;
  fs.mkdirSync(path.dirname(dataFile(idea)), { recursive: true });
  writeAtomic(dataFile(idea), JSON.stringify({ contract: version, hash: contractHash(idea, 'api'), generated: nowIso(), operations: ops }, null, 2) + '\n');
  const rows = ops.map((o) => `| ${o.n} | ${o.method} ${o.path} | ${o.operationId} | ${Object.keys(o.responses).join(', ')} | ${previous.get(o.operationId) ?? 'mock'} |`);
  writeAtomic(mocksFile(idea), [
    '# Mocks', '', `**Contract:** ${version}`, `**Generated:** ${nowIso().slice(0, 10)} from the frozen contract. Do not edit by hand; regenerate with: node tools/mocks.mjs generate <idea>`, '',
    'Mocks return the documented error responses as well as success. Run them with: node tools/mocks.mjs serve <idea>', '',
    '| # | Endpoint | Replaces | Mocked statuses | Status |', '|---|---|---|---|---|', ...rows, '',
  ].join('\n'));
  logEvent(idea.dir, 'factory', `generated ${ops.length} mocks from ${version}`);
  return { version, count: ops.length };
}

export function replace(idea, n, by) {
  if (by !== 'adria') throw new Error('Adria replaces mocks with real calls (use --by adria)');
  const m = readMocks(idea);
  if (!m) throw new Error('no mocks.md yet');
  const row = m.rows.find((r) => r.n === Number(n));
  if (!row) throw new Error(`no mock number ${n}`);
  const re = new RegExp(`^(\\|\\s*${row.n}\\s*\\|.*\\|\\s*)mock(\\s*\\|)$`, 'm');
  writeAtomic(mocksFile(idea), m.text.replace(re, (_, a, b) => `${a}replaced${b}`));
  logEvent(idea.dir, by, `replaced mock ${n} (${row.endpoint}) with the real call`);
}

// ---- serve ------------------------------------------------------------------------------------------

const matcher = (route) => new RegExp('^' + route.replace(/\{[^}]+\}/g, '[^/]+') + '/?$');

// A small mock API for Adria to build against. ?mock_status=422 (or the x-mock-status header) picks a documented response.
export function serve(idea, port = 4010) {
  const data = JSON.parse(fs.readFileSync(dataFile(idea), 'utf8'));
  const table = data.operations.map((o) => ({ ...o, re: matcher(o.path) }));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const op = table.find((o) => o.method === req.method && o.re.test(url.pathname));
    if (!op) { res.writeHead(404, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'no such endpoint in the contract' })); return; }
    const want = url.searchParams.get('mock_status') || req.headers['x-mock-status'];
    const code = want && op.responses[want] ? want : Object.keys(op.responses).find((c) => /^2/.test(c)) || Object.keys(op.responses)[0];
    const r = op.responses[code];
    res.writeHead(r.status, { ...cors, 'content-type': 'application/json', 'x-mock': data.contract });
    res.end(r.body === null ? '' : JSON.stringify(r.body));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
