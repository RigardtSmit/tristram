// Handovers (SPEC 7.5): "this artifact is ready, at this contract version".
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './paths.mjs';
import { parseStatus, setStatusFields, logEvent, writeAtomic } from './idea.mjs';
import { readContract } from './contract.mjs';

const CHARACTERS = ['cain', 'wirt', 'griswold', 'adria', 'farnham', 'lazarus', 'ogden'];
const dir = (idea) => path.join(idea.dir, 'handovers');

export function list(idea) {
  if (!fs.existsSync(dir(idea))) return [];
  return fs.readdirSync(dir(idea)).filter((f) => /^HO-\d{3}-\d{3}\.md$/.test(f)).sort().map((f) => {
    const text = fs.readFileSync(path.join(dir(idea), f), 'utf8').replace(/\r\n/g, '\n');
    const field = (k) => text.match(new RegExp(`^${k}: (.*)$`, 'm'))?.[1]?.trim() ?? '';
    const head = text.match(/^From: (\S+)\s+To: (.*)$/m);
    return {
      id: f.replace('.md', ''), file: f, from: head?.[1] ?? '', to: (head?.[2] ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      contract: field('Contract'), changed: field('Changed since previous'), ready: /^yes/i.test(field('Ready')), mocks: field('Mocks to replace'),
      acks: [...text.matchAll(/^Acknowledged: (\w+), built against (.+?), (\d{4}-\d{2}-\d{2})$/gm)].map((m) => ({ by: m[1], version: m[2], date: m[3] })),
    };
  });
}

// "api.yaml FROZEN v2" and "schema FROZEN v1" must match a contract that really is frozen at that version.
export function checkContractClaim(idea, contract) {
  for (const m of contract.matchAll(/\b(schema|api)(?:\.yaml)?\s+FROZEN\s+(v\d+)/gi)) {
    const kind = m[1].toLowerCase();
    const c = readContract(idea, kind);
    if (!c) throw new Error(`the handover says ${kind} is FROZEN ${m[2]}, but there is no ${kind} contract`);
    if (c.status !== 'FROZEN' || c.version !== m[2]) throw new Error(`the handover says ${kind} is FROZEN ${m[2]}, but the contract is ${c.status} ${c.version}. Freeze it first`);
  }
}

export function create(idea, { from, to, contract, changed = 'first version', ready = false, mocks = 'none' }) {
  from = String(from || '').toLowerCase();
  const tos = String(to || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!CHARACTERS.includes(from)) throw new Error(`"${from}" is not a character`);
  if (!tos.length || tos.some((t) => !CHARACTERS.includes(t))) throw new Error(`--to must be one or more of: ${CHARACTERS.join(', ')}`);
  if (!contract?.trim()) throw new Error('--contract is required, for example "api.yaml FROZEN v1"');
  checkContractClaim(idea, contract);
  const item = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8')).id.replace(/^WI-/, '');
  const seq = list(idea).reduce((m, h) => Math.max(m, Number(h.id.split('-')[2])), 0) + 1;
  const id = `HO-${item}-${String(seq).padStart(3, '0')}`;
  const text = [
    id, `From: ${from}  To: ${tos.join(', ')}`, `Contract: ${contract.trim()}`, `Changed since previous: ${changed}`,
    `Ready: ${ready ? 'yes' : 'no'}`, `Mocks to replace: ${mocks}`, `Raised: ${nowIso()}`, '',
  ].join('\n');
  fs.mkdirSync(dir(idea), { recursive: true });
  writeAtomic(path.join(dir(idea), `${id}.md`), text);
  setStatusFields(idea, { handovers: `${id} ${contract.trim()}${ready ? ' ready' : ''}` });
  logEvent(idea.dir, from, `handover ${id} to ${tos.join(', ')}: ${contract.trim()}`);
  return id;
}

// A dependent records which version it built against (SPEC 7.4 step 4).
export function ack(idea, id, { by, version }) {
  by = String(by || '').toLowerCase();
  const h = list(idea).find((x) => x.id === id);
  if (!h) throw new Error(`no handover ${id}`);
  if (!h.to.includes(by)) throw new Error(`${id} is addressed to ${h.to.join(', ')}, not ${by}`);
  if (!version?.trim()) throw new Error('--version is required, for example "api.yaml FROZEN v1"');
  checkContractClaim(idea, version);
  const f = path.join(dir(idea), h.file);
  writeAtomic(f, fs.readFileSync(f, 'utf8').replace(/\n*$/, '\n') + `Acknowledged: ${by}, built against ${version.trim()}, ${nowIso().slice(0, 10)}\n`);
  logEvent(idea.dir, by, `acknowledged ${id}, built against ${version.trim()}`);
}

// What each engineer is currently building against, and which handovers it has not read.
export function summary(idea) {
  const all = list(idea);
  const using = {};
  for (const h of all) for (const a of h.acks) using[a.by] = a.version;
  const unread = {};
  for (const c of CHARACTERS) unread[c] = all.filter((h) => h.to.includes(c) && !h.acks.some((a) => a.by === c));
  return { all, using, unread };
}
