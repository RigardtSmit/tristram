// Town Square (SPEC 13): a recorded meeting. Every statement goes to a transcript; the decision goes to a summary that quotes
// the statements it relies on. For blocked work the CEO chooses A (send to Lazarus), B (return to a character) or C (stop).
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './paths.mjs';
import { parseStatus, transition, logEvent, writeAtomic } from './idea.mjs';
import { openDefectList } from './defects.mjs';

const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const dirOf = (idea) => path.join(idea.dir, 'town-square');
const SPEAKERS = ['cain', 'wirt', 'griswold', 'adria', 'farnham', 'lazarus', 'ogden', 'ceo', 'moderator'];
const stOf = (idea) => parseStatus(read(path.join(idea.dir, 'status.md')));

export function sessions(idea) {
  if (!fs.existsSync(dirOf(idea))) return [];
  return fs.readdirSync(dirOf(idea)).filter((f) => /-transcript\.md$/.test(f)).sort().map((f) => {
    const base = f.replace(/-transcript\.md$/, '');
    return { base, transcript: path.join(dirOf(idea), f), summary: path.join(dirOf(idea), `${base}-summary.md`), closed: fs.existsSync(path.join(dirOf(idea), `${base}-summary.md`)) };
  });
}
export const current = (idea) => sessions(idea).filter((s) => !s.closed).pop() ?? null;

// Who is summoned: the owners of the open defects, plus Cain (SPEC 13.1).
export function summoned(idea) {
  return ['cain', ...new Set(openDefectList(idea).map((d) => d.owner))].filter((o, i, a) => a.indexOf(o) === i);
}

export function open(idea, { kind = 'blocked' } = {}) {
  if (!['blocked', 'debrief'].includes(kind)) throw new Error('kind is blocked or debrief');
  const st = stOf(idea);
  if (kind === 'blocked' && st.state !== 'BLOCKED_FOR_CEO') throw new Error(`${st.name} is ${st.state}; a blocked-work Town Square is for BLOCKED_FOR_CEO`);
  if (kind === 'debrief' && st.state !== 'DEBRIEF') throw new Error(`${st.name} is ${st.state}; a debrief Town Square follows a READY verdict`);
  if (current(idea)) throw new Error(`a session is already open (${current(idea).base}). Close it with "decide" first`);
  const day = nowIso().slice(0, 10), n = sessions(idea).filter((s) => s.base.startsWith(day)).length + 1, base = `${day}-${n}`;
  fs.mkdirSync(dirOf(idea), { recursive: true });
  const who = kind === 'blocked' ? summoned(idea) : ['cain', 'lazarus', 'ogden', ...new Set(openDefectList(idea).map((d) => d.owner))];
  writeAtomic(path.join(dirOf(idea), `${base}-transcript.md`), `# Town Square ${base}: ${st.name}\n\nKind: ${kind}. Cycle ${st.cycle}. Opened ${nowIso()}.\nSummoned: ${who.join(', ')}\n\n`);
  logEvent(idea.dir, 'moderator', `opened Town Square ${base} (${kind})`);
  return { base, summoned: who };
}

let nextN = (text) => (text.match(/^\*\*\[S\d+\]/gm) || []).length + 1;
export function say(idea, { speaker, text }) {
  const s = current(idea) ?? (() => { throw new Error('no session is open. Run "open" first'); })();
  const who = String(speaker).toLowerCase();
  if (!SPEAKERS.includes(who)) throw new Error(`speaker must be one of ${SPEAKERS.join(', ')}`);
  if (!text) throw new Error('--text is required');
  const t = read(s.transcript), n = nextN(t);
  fs.appendFileSync(s.transcript, `**[S${n}] ${nowIso()} ${who}:** ${String(text).replace(/\n+/g, ' ')}\n\n`);
  return `S${n}`;
}

export function options(idea) {
  const owners = [...new Set(openDefectList(idea).map((d) => d.owner))];
  const defects = openDefectList(idea);
  return { defects, options: [{ key: 'A', label: 'Send to Lazarus, with the known defects listed' }, ...owners.map((o) => ({ key: 'B', to: o, label: `Return to ${o}, with your direction` })), { key: 'C', label: 'Stop the item' }] };
}

// The CEO decides. A: IN_REVIEW with the open defects recorded as known. B: back to BUILDING for the named character. C: STOPPED.
export function decide(idea, choice, { by, to, direction, reason, rely = [] }) {
  if (by !== 'ceo') throw new Error('the CEO decides in the Town Square (--by ceo)');
  const key = String(choice).toUpperCase();
  if (!['A', 'B', 'C'].includes(key)) throw new Error('choose A, B or C');
  const st = stOf(idea);
  if (st.state !== 'BLOCKED_FOR_CEO') throw new Error(`${st.name} is ${st.state}, not BLOCKED_FOR_CEO`);
  if (key === 'B' && (!to || !direction)) throw new Error('B needs --to <character> and --direction "..."');
  if (key === 'B' && !openDefectList(idea).some((d) => d.owner === to) && to !== 'cain') throw new Error(`${to} owns no open defect. Owners: ${[...new Set(openDefectList(idea).map((d) => d.owner))].join(', ')}`);
  let s = current(idea);
  if (!s) { open(idea); s = current(idea); say(idea, { speaker: 'moderator', text: 'The CEO decided without a full session; the decision is recorded below.' }); }
  const t = read(s.transcript), quotes = rely.map((id) => {
    const line = t.split('\n').find((l) => l.startsWith(`**[${id}]`));
    if (!line) throw new Error(`the transcript has no statement ${id}`);
    return `> ${line.replace(/^\*\*\[S\d+\] \S+ /, '').replace(/:\*\*/, ':')}  (${id})`;
  });
  const defects = openDefectList(idea), day = nowIso().slice(0, 10);
  const name = { A: 'send to Lazarus', B: `return to ${to}`, C: 'stop the item' }[key];
  const text = ['# Summary ' + s.base, '', `Decision: **${key}. ${name}**`, `Decided by the CEO ${nowIso()}.`, `Reason: ${reason || 'not given'}`, direction ? `Direction: ${direction}` : '', '',
    '## Open defects at the decision', '', ...(defects.length ? defects.map((d) => `- ${d.id} (${d.owner}): ${d.summary}`) : ['- none']), '',
    '## Statements relied on', '', ...(quotes.length ? quotes : ['- none quoted']), ''].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  writeAtomic(s.summary, text);
  const log = path.join(idea.dir, 'record', 'ceo-decisions.md');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.appendFileSync(log, `- ${nowIso()} Town Square ${s.base}: ${key} ${name}${reason ? ` (${reason})` : ''}\n`);
  if (key === 'A') {
    const acc = path.join(idea.dir, 'record', 'accepted-defects.md');
    fs.appendFileSync(acc, defects.map((d) => `- ${d.id} ${d.summary} (${d.owner}; accepted by the CEO ${day})\n`).join(''));
    transition(idea, 'IN_REVIEW', { actor: 'ceo', note: `Town Square ${s.base}: send to Lazarus with ${defects.length} known defect(s)` });
  } else if (key === 'B') {
    fs.writeFileSync(path.join(idea.dir, 'record', 'direction.json'), JSON.stringify({ to, text: direction, session: s.base, ts: nowIso() }, null, 2) + '\n');
    transition(idea, 'BUILDING', { actor: 'ceo', note: `Town Square ${s.base}: return to ${to}` });
  } else transition(idea, 'STOPPED', { actor: 'ceo', note: `Town Square ${s.base}: stop` });
  logEvent(idea.dir, 'ogden', `recorded Town Square ${s.base}: ${key} ${name}`);
  return { base: s.base, key, state: stOf(idea).state };
}

export const direction = (idea) => {
  const f = path.join(idea.dir, 'record', 'direction.json');
  return fs.existsSync(f) ? JSON.parse(read(f)) : null;
};
