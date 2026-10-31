// Environment blocks (SPEC 10.2): a failure outside the work itself. It pauses the item at its checkpoint and does
// not count toward the cycle limit.
//   open -> the owning engineer tries to resolve it (at most two attempts) -> Cain confirms it is environmental
//   and raises it to the CEO (a red portal) -> when resolved the item resumes with the same cycle number.
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './paths.mjs';
import { parseStatus, setStatusFields, transition, logEvent, writeAtomic } from './idea.mjs';

export const MAX_ATTEMPTS = 2;
const file = (idea, cycle) => path.join(idea.dir, 'cycles', `cycle-${cycle}`, 'env.json');

function cycleOf(idea) { return Number(parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8')).cycle); }

// The block that is currently open, if any (the latest env.json whose status is not "resolved").
export function current(idea) {
  const dir = path.join(idea.dir, 'cycles');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((d) => /^cycle-\d+$/.test(d)).sort((a, b) => Number(b.slice(6)) - Number(a.slice(6)))
    .map((d) => path.join(dir, d, 'env.json')).filter((f) => fs.existsSync(f));
  for (const f of files) { const e = JSON.parse(fs.readFileSync(f, 'utf8')); if (e.status !== 'resolved') return { ...e, file: f }; }
  return null;
}

// Record a block. The caller moves the idea to ENVIRONMENT_BLOCKED, except when `move` is true (an engineer raising it).
export function open(idea, { checks, owner, cause, resumeTo = 'BUILDING', actor = 'factory', move = false }) {
  const cycle = cycleOf(idea);
  const e = { cycle, raised: nowIso(), checks, owner, cause, resumeTo, status: 'open', attempts: [], escalation: null };
  fs.mkdirSync(path.dirname(file(idea, cycle)), { recursive: true });
  writeAtomic(file(idea, cycle), JSON.stringify(e, null, 2) + '\n');
  const text = [`# Environment block, cycle ${cycle}`, '', `Raised: ${e.raised}`, `Owner: ${owner}`, `Checks: ${checks.join(', ')}`, `Resumes to: ${resumeTo} (same cycle)`, '', cause.trim(), ''].join('\n');
  writeAtomic(path.join(path.dirname(file(idea, cycle)), 'env.md'), text);
  if (move) transition(idea, 'ENVIRONMENT_BLOCKED', { actor, note: `${checks.join(', ')}: ${cause.split('\n')[0]}`.slice(0, 160) });
  setStatusFields(idea, { env_block: cause.split('\n')[0].slice(0, 160) });
  logEvent(idea.dir, actor, `environment block raised: ${cause.split('\n')[0].slice(0, 120)}`);
  return e;
}

function save(idea, e) { const { file: f, ...rest } = e; writeAtomic(f, JSON.stringify(rest, null, 2) + '\n'); }

// The owning engineer tries to fix it with its own skills. Two attempts at most (SPEC 10.2 step 3).
export function attempt(idea, { by, note, outcome }) {
  const e = current(idea);
  if (!e) throw new Error('no open environment block');
  if (by !== e.owner) throw new Error(`this block belongs to ${e.owner}; only the owner attempts the fix`);
  if (e.status === 'escalated') throw new Error('already escalated to the CEO');
  if (e.attempts.length >= MAX_ATTEMPTS) throw new Error(`${MAX_ATTEMPTS} attempts are used. Cain must confirm the cause and escalate: node tools/env.mjs escalate <idea> --by cain --reason "..."`);
  if (!note?.trim()) throw new Error('say what you tried (--note)');
  e.attempts.push({ ts: nowIso(), by, note: note.trim(), outcome: outcome || 'unknown' });
  save(idea, e);
  logEvent(idea.dir, by, `environment attempt ${e.attempts.length} of ${MAX_ATTEMPTS}: ${note.trim().slice(0, 100)}`);
  return e.attempts.length;
}

// Cain confirms it is environmental and raises it to the CEO, who sees a red portal (SPEC 10.2 step 4).
export function escalate(idea, { by, reason }) {
  if (by !== 'cain') throw new Error('Cain confirms and escalates environment blocks (use --by cain)');
  const e = current(idea);
  if (!e) throw new Error('no open environment block');
  if (e.attempts.length < MAX_ATTEMPTS) throw new Error(`the owner has made ${e.attempts.length} of ${MAX_ATTEMPTS} attempts; let ${e.owner} try first`);
  if (!reason?.trim()) throw new Error('say why this is environmental (--reason)');
  e.status = 'escalated';
  e.escalation = { ts: nowIso(), by, reason: reason.trim() };
  save(idea, e);
  logEvent(idea.dir, 'cain', `confirmed environment block and raised it to the CEO: ${reason.trim().slice(0, 100)}`);
}

// Back to work at the same cycle, once the cause is gone.
export function resume(idea, { by }) {
  const e = current(idea);
  if (!e) throw new Error('no open environment block');
  if (!['cain', 'ceo', e.owner].includes(by)) throw new Error(`only ${e.owner}, Cain or the CEO resume an item`);
  const before = cycleOf(idea);
  e.status = 'resolved';
  e.resolved = { ts: nowIso(), by };
  save(idea, e);
  transition(idea, e.resumeTo, { actor: by, note: `environment resolved; resumes cycle ${before}` });
  setStatusFields(idea, { env_block: 'none' });
  return { to: e.resumeTo, cycle: before };
}
