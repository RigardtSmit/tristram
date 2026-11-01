// Change requests (SPEC 8): changes/CR-NNN.md with a change map, the CEO's decision, brief versioning and the
// selective re-run. Status: DRAFT (Cain writes the map) -> PROPOSED (waiting for the CEO) -> APPROVED | REJECTED | NARROWING.
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './paths.mjs';
import { parseStatus, setStatusFields, logEvent, transition, writeAtomic, MAX_CYCLES } from './idea.mjs';
import { AREAS } from './areas.mjs';

const OWNER_AREA = Object.fromEntries(Object.entries(AREAS).map(([a, o]) => [o, a]));   // griswold -> api
const DEPENDENTS = { schema: ['api'], api: ['ui', 'tests'] };                              // a new contract version re-runs these
const dirOf = (idea) => path.join(idea.dir, 'changes');
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const briefFile = (idea) => path.join(idea.dir, 'brief.md');

export function list(idea) {
  if (!fs.existsSync(dirOf(idea))) return [];
  return fs.readdirSync(dirOf(idea)).filter((f) => /^CR-\d+\.md$/.test(f)).sort().map((f) => parse(path.join(dirOf(idea), f)));
}
export const find = (idea, id) => list(idea).find((c) => c.id === id) ?? (() => { throw new Error(`no change request ${id}`); })();

export function parse(file) {
  const text = read(file);
  const rows = (text.match(/^## Change map\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '').split('\n').filter((l) => /^\|/.test(l)).slice(2)
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim())).filter((r) => r[0]);
  const field = (n) => text.match(new RegExp(`^\\*\\*${n}:\\*\\*\\s*(.*)$`, 'm'))?.[1]?.trim() ?? null;
  const [from, to] = (field('Brief') ?? '').split('→').map((s) => s.trim());
  return {
    file, text, id: path.basename(file, '.md'), title: text.match(/^# CR-\d+: (.*)$/m)?.[1] ?? '', status: field('Status'), by: field('Raised by'),
    raised: field('Raised'), briefFrom: from, briefTo: to, cycles: Number(text.match(/^## Cycles required\s*\n+\s*(\d+)/m)?.[1] ?? NaN),
    appliesIn: field('Applies in cycle'), rows: rows.map(([artifact, was, now, owner, rerun]) => ({ artifact, was, now, owner: (owner || '').toLowerCase(), rerun: (rerun || '').toLowerCase() })),
  };
}

function setField(text, name, value) {
  const re = new RegExp(`^\\*\\*${name}:\\*\\*.*$`, 'm');
  return re.test(text) ? text.replace(re, `**${name}:** ${value}`) : text.replace(/^(\*\*Brief:\*\*.*)$/m, `$1\n**${name}:** ${value}`);
}
const bump = (v) => `v${Number(String(v).replace(/\D/g, '') || 1) + 1}`;

export function open(idea, { title, why, by }) {
  if (!['ceo', 'cain'].includes(by)) throw new Error('a change request is raised by the CEO or Cain (--by ceo|cain)');
  const st = parseStatus(read(path.join(idea.dir, 'status.md')));
  if (['CLOSED', 'STOPPED', 'DEBRIEF'].includes(st.state)) throw new Error(`${st.name} is ${st.state}; a finished item takes a new idea, not a change request`);
  const v = parseStatus(`version: ${read(briefFile(idea)).match(/^\*\*Version:\*\*\s*(v\d+)/m)?.[1] ?? 'v1'}`).version;
  const n = String(list(idea).length + 1).padStart(3, '0'), id = `CR-${n}`;
  const text = `# ${id}: ${title}

**Status:** DRAFT
**Raised by:** ${by}
**Raised:** ${nowIso()}
**Brief:** ${v} → ${bump(v)}

## What changes

${why}

## Why

${why}

## Change map

| Artifact | Was | Now | Owner | Re-run |
|---|---|---|---|---|

## Unchanged

## Cycles required

1
`;
  fs.mkdirSync(dirOf(idea), { recursive: true });
  writeAtomic(path.join(dirOf(idea), `${id}.md`), text);
  logEvent(idea.dir, by, `raised ${id}: ${title}`);
  return id;
}

// What a change map must say before the CEO sees it.
export function validate(idea, cr) {
  const problems = [];
  if (!cr.rows.length) problems.push('the change map has no rows. Cain assesses impact from traceability.md first');
  for (const r of cr.rows) {
    if (!r.was || !r.now) problems.push(`"${r.artifact}": say what it was and what it becomes`);
    else if (r.was === r.now) problems.push(`"${r.artifact}": Was and Now are the same`);
    if (r.owner !== 'cain' && !OWNER_AREA[r.owner]) problems.push(`"${r.artifact}": owner "${r.owner}" is not Cain, Wirt, Griswold, Adria or Farnham`);
    if (!['yes', 'no'].includes(r.rerun.split(/\s/)[0])) problems.push(`"${r.artifact}": Re-run must be yes or no`);
  }
  if (!cr.briefFrom || !cr.briefTo) problems.push('the Brief line must read "vN → vM"');
  if (!(cr.cycles >= 1)) problems.push('say how many cycles the change needs');
  else if (cr.cycles > MAX_CYCLES) problems.push(`the change needs ${cr.cycles} cycles, more than the limit of ${MAX_CYCLES}. Narrow it`);
  return problems;
}

// The areas to re-run: owners of rows marked yes, plus dependents when a contract version changed.
export function rerunAreas(cr) {
  const areas = new Set();
  for (const r of cr.rows.filter((x) => x.rerun.startsWith('yes'))) {
    const a = OWNER_AREA[r.owner];
    if (a) areas.add(a);
    if (a && /contract|\bv\d+\b|FROZEN/i.test(`${r.rerun} ${r.now}`)) for (const d of DEPENDENTS[a] ?? []) areas.add(d);
  }
  return Object.keys(AREAS).filter((a) => areas.has(a));
}

export function submit(idea, id) {
  const cr = find(idea, id);
  if (!['DRAFT', 'NARROWING'].includes(cr.status)) throw new Error(`${id} is ${cr.status}; only a DRAFT or NARROWING request can be submitted`);
  const problems = validate(idea, cr);
  if (problems.length) throw Object.assign(new Error(`${id} is not ready for the CEO:\n  - ${problems.join('\n  - ')}`), { problems });
  writeAtomic(cr.file, setField(cr.text, 'Status', 'PROPOSED'));
  logEvent(idea.dir, 'cain', `submitted ${id} to the CEO`);
}

// The impact of a requirement, read from traceability.md (SPEC 8.1 step 2).
export function impact(idea, req) {
  const f = path.join(idea.dir, 'artifacts', 'traceability.md');
  if (!fs.existsSync(f)) throw new Error('artifacts/traceability.md is missing. Cain writes it in cycle 1');
  const lines = read(f).split('\n').filter((l) => /^\|/.test(l));
  const head = lines[0].split('|').slice(1, -1).map((c) => c.trim());
  const row = lines.slice(2).map((l) => l.split('|').slice(1, -1).map((c) => c.trim())).find((r) => r[0] === req);
  if (!row) throw new Error(`${req} is not in traceability.md`);
  return Object.fromEntries(head.map((h, i) => [h, row[i] || '']).slice(1));
}

export function decide(idea, id, decision, { by, note }) {
  if (by !== 'ceo') throw new Error('a change request is decided by the CEO (--by ceo)');
  const cr = find(idea, id);
  if (cr.status !== 'PROPOSED') throw new Error(`${id} is ${cr.status}; the CEO decides a PROPOSED request`);
  const stamp = `${nowIso()} ${decision}${note ? ` (${note})` : ''}`;
  if (decision === 'reject') {
    writeAtomic(cr.file, setField(cr.text, 'Status', 'REJECTED') + `\n## Decision\n\n${stamp}\n`);
    logEvent(idea.dir, 'ceo', `rejected ${id}`);
    return { status: 'REJECTED' };
  }
  if (decision === 'narrow') {
    writeAtomic(cr.file, setField(cr.text, 'Status', 'NARROWING') + `\n## Decision\n\n${stamp}\n`);
    logEvent(idea.dir, 'ceo', `asked to narrow ${id}: ${note ?? ''}`);
    return { status: 'NARROWING' };
  }
  if (decision !== 'approve') throw new Error('decision is approve, reject or narrow');

  const st = parseStatus(read(path.join(idea.dir, 'status.md')));
  if (['CLOSED', 'STOPPED', 'DEBRIEF'].includes(st.state)) throw new Error(`${st.name} is ${st.state}; cannot apply a change`);
  const areas = rerunAreas(cr);
  // brief versioning: new version, changelog line naming the changed requirements, accepted by this decision
  let brief = read(briefFile(idea));
  const reqs = [...new Set(cr.rows.map((r) => r.artifact.match(/\bREQ-\d+\b/)?.[0]).filter(Boolean))];
  brief = brief.replace(/^\*\*Version:\*\*.*$/m, `**Version:** ${cr.briefTo}`).replace(/^\*\*Status:\*\*.*$/m, '**Status:** ACCEPTED')
    .replace(/\n*$/, '\n') + `- ${cr.briefTo}: ${id} ${cr.title}${reqs.length ? ` (changes ${reqs.join(', ')})` : ''}\n`;
  writeAtomic(briefFile(idea), brief);
  setStatusFields(idea, { brief: `${cr.briefTo} accepted` });

  // the cycle the change is built in
  let cycle = Number(st.cycle), state = st.state;
  if (state === 'IN_REVIEW') { transition(idea, 'NOT_READY', { actor: 'ceo', note: `${id} approved` }); state = 'NOT_READY'; }
  if (state === 'PRE_REVIEW' || state === 'NOT_READY') {
    if (cycle >= MAX_CYCLES) { transition(idea, 'BLOCKED_FOR_CEO', { actor: 'ceo', note: `${id} approved but no cycles are left` }); state = 'BLOCKED_FOR_CEO'; }
    else { cycle = transition(idea, 'BUILDING', { actor: 'ceo', note: `${id} approved; cycle ${cycle + 1} starts` }).cycle; state = 'BUILDING'; }
  }
  const applies = state === 'BRIEFING' ? 'when the build starts' : String(cycle);
  writeAtomic(cr.file, setField(setField(cr.text, 'Status', 'APPROVED'), 'Applies in cycle', applies) + `\n## Decision\n\n${stamp}\n\nRe-run areas: ${areas.join(', ') || 'none'}\n`);
  logEvent(idea.dir, 'ceo', `approved ${id}; brief ${cr.briefFrom} -> ${cr.briefTo}; re-run: ${areas.join(', ') || 'none'}`);
  return { status: 'APPROVED', areas, cycle, state };
}

// The approved change that the given cycle must build, if any.
export function activeFor(idea, cycle) {
  return list(idea).filter((c) => c.status === 'APPROVED' && c.appliesIn === String(cycle));
}
