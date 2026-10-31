// Contracts (SPEC 7): a schema or API definition that engineers build against.
// A contract is DRAFT until Cain freezes it as FROZEN vN; after that its files may only change through a contract change.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { nowIso } from './paths.mjs';
import { logEvent, writeAtomic } from './idea.mjs';

export const CONTRACTS = {
  schema: { dir: 'artifacts/schema', list: (d) => [...glob(d, 'migrations', /\.sql$/), ...(exists(d, 'seed.sql') ? ['seed.sql'] : [])] },
  api: { dir: 'artifacts/backend', list: (d) => (exists(d, 'api.yaml') ? ['api.yaml'] : []) },
};
function exists(d, rel) { return fs.existsSync(path.join(d, rel)); }
function glob(d, sub, re) {
  const p = path.join(d, sub);
  return fs.existsSync(p) ? fs.readdirSync(p).filter((f) => re.test(f)).sort().map((f) => `${sub}/${f}`) : [];
}

export function contractDir(idea, kind) {
  if (!CONTRACTS[kind]) throw new Error(`unknown contract "${kind}". Known: ${Object.keys(CONTRACTS).join(', ')}`);
  return path.join(idea.dir, CONTRACTS[kind].dir);
}
const contractFile = (idea, kind) => path.join(contractDir(idea, kind), 'CONTRACT.md');

// Hash of the contract's files, with line endings normalised so Windows and Linux agree.
export function contractHash(idea, kind) {
  const dir = contractDir(idea, kind);
  const h = crypto.createHash('sha256');
  for (const rel of CONTRACTS[kind].list(dir)) {
    h.update(rel + '\0' + fs.readFileSync(path.join(dir, rel), 'utf8').replace(/\r\n/g, '\n') + '\n');
  }
  return h.digest('hex');
}

export function readContract(idea, kind) {
  const file = contractFile(idea, kind);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const f = (k) => text.match(new RegExp(`^\\*\\*${k}:\\*\\*\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
  return { text, status: f('Status'), version: f('Version'), hash: f('Hash'), engine: f('Engine'), owner: f('Owner') };
}

export function initContract(idea, kind, { engine = 'sqlite', owner } = {}) {
  const dir = contractDir(idea, kind);
  fs.mkdirSync(dir, { recursive: true });
  if (readContract(idea, kind)) throw new Error(`${kind} contract already exists`);
  const text = [
    `# Contract: ${kind}`, '',
    `**Owner:** ${owner || (kind === 'schema' ? 'wirt' : 'griswold')}`,
    '**Status:** DRAFT',
    '**Version:** v0',
    ...(kind === 'schema' ? [`**Engine:** ${engine}`] : []),
    '**Hash:** none', '',
    'A DRAFT contract may change freely. Cain freezes it as `FROZEN vN`; after that it changes only through a contract change.', '',
  ].join('\n');
  writeAtomic(contractFile(idea, kind), text);
  logEvent(idea.dir, 'factory', `initialised ${kind} contract (DRAFT)`);
}

// Only Cain freezes, and only a contract that has files and passes its check.
export function freeze(idea, kind, { by, checkPassed }) {
  if (by !== 'cain') throw new Error('Cain freezes contracts (use --by cain)');
  const c = readContract(idea, kind);
  if (!c) throw new Error(`no ${kind} contract. Run: node tools/contract.mjs init <idea> ${kind}`);
  if (c.status === 'FROZEN') throw new Error(`${kind} is already FROZEN ${c.version}. Change it through a contract change`);
  if (!CONTRACTS[kind].list(contractDir(idea, kind)).length) throw new Error(`the ${kind} contract has no files to freeze`);
  if (!checkPassed) throw new Error(`the ${kind} check has not passed, so it cannot be frozen`);
  const version = 'v1';
  const hash = contractHash(idea, kind);
  let text = c.text.replace(/^\*\*Status:\*\*.*$/m, () => '**Status:** FROZEN')
    .replace(/^\*\*Version:\*\*.*$/m, () => `**Version:** ${version}`)
    .replace(/^\*\*Hash:\*\*.*$/m, () => `**Hash:** ${hash}`);
  text = text.replace(/^\*\*Version:\*\*.*$/m, (m) => `${m}\n**Frozen:** ${nowIso().slice(0, 10)} by Cain`);
  writeAtomic(contractFile(idea, kind), text);
  logEvent(idea.dir, 'cain', `froze ${kind} contract as FROZEN ${version}`);
  return { version, hash };
}

// Is the frozen contract still what was frozen?
export function verify(idea, kind) {
  const c = readContract(idea, kind);
  if (!c) return { ok: false, problem: `no ${kind} contract` };
  if (c.status !== 'FROZEN') return { ok: true, frozen: false };
  const now = contractHash(idea, kind);
  return now === c.hash ? { ok: true, frozen: true, version: c.version } : { ok: false, frozen: true, problem: `${kind} contract ${c.version} was FROZEN but its files changed. Use a contract change` };
}
