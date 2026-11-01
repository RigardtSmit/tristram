// Lazarus's review (SPEC 11.3): start after clean pre-review checks, disposition every test-quality flag, then a verdict.
// READY -> DEBRIEF. NOT READY -> findings become defects for their owners, then the next cycle, or BLOCKED_FOR_CEO after cycle 3.
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './paths.mjs';
import { parseStatus, transition, logEvent, writeAtomic, MAX_CYCLES, docStatus } from './idea.mjs';
import { readPlan } from './plan.mjs';
import { recordCheck, openDefectList, defectState, renderCycleView } from './defects.mjs';

const CHECK_OF = { schema: 'db_check', api: 'api_check', ui: 'ui_check', tests: 'test_check' };
const CHARACTERS = ['cain', 'wirt', 'griswold', 'adria', 'farnham', 'ogden'];
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const stOf = (idea) => parseStatus(read(path.join(idea.dir, 'status.md')));
const cdir = (idea, c) => path.join(idea.dir, 'cycles', `cycle-${c}`);

export function flagsOf(idea, cycle) {
  const f = path.join(cdir(idea, cycle), 'test-flags.json');
  return fs.existsSync(f) ? JSON.parse(read(f)).flags : [];
}
function saveFlags(idea, cycle, flags) { writeAtomic(path.join(cdir(idea, cycle), 'test-flags.json'), JSON.stringify({ cycle, flags }, null, 2) + '\n'); }

// The latest result of each check in this cycle's checks.md.
function latestResults(idea, cycle) {
  const f = path.join(cdir(idea, cycle), 'checks.md');
  const out = {};
  if (fs.existsSync(f)) for (const m of read(f).matchAll(/^## (\w+_check) \S+ \((PASS|FAIL)\)/gm)) out[m[1]] = m[2];
  return out;
}

export function start(idea) {
  const st = stOf(idea);
  if (st.state !== 'PRE_REVIEW') throw new Error(`${st.name} is ${st.state}. Lazarus reviews an item in PRE_REVIEW after the pre-review checks pass`);
  const cycle = Number(st.cycle), problems = [];
  const open = openDefectList(idea).filter((d) => d.check.endsWith('_check'));
  if (open.length) problems.push(`${open.length} defect(s) are still open: ${open.map((d) => d.id).join(', ')}`);
  const res = latestResults(idea, cycle), plan = readPlan(idea);
  for (const a of plan?.areas ?? []) if (res[CHECK_OF[a]] !== 'PASS') problems.push(`${CHECK_OF[a]} has not passed in cycle ${cycle}`);
  if (problems.length) throw new Error(`the checks have not all run and passed, so there is nothing to review yet:\n  - ${problems.join('\n  - ')}`);
  transition(idea, 'IN_REVIEW', { actor: 'lazarus', note: `review of cycle ${cycle} begins` });
  return { cycle, flags: flagsOf(idea, cycle) };
}

export function disposition(idea, id, decision, reason) {
  const st = stOf(idea), cycle = Number(st.cycle), flags = flagsOf(idea, cycle);
  const fl = flags.find((x) => x.id === id) ?? (() => { throw new Error(`no flag ${id} in cycle ${cycle}. Flags: ${flags.map((x) => x.id).join(', ') || 'none'}`); })();
  if (!['confirm', 'dismiss'].includes(decision)) throw new Error('decision is confirm or dismiss');
  if (!reason) throw new Error('give the reason for the decision (--reason)');
  fl.disposition = { decision, reason, ts: nowIso() };
  saveFlags(idea, cycle, flags);
  logEvent(idea.dir, 'lazarus', `${decision}ed test-quality flag ${id}: ${reason}`);
  return fl;
}

const accepted = (idea) => {
  const f = path.join(idea.dir, 'record', 'accepted-defects.md');
  return fs.existsSync(f) ? read(f).split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)) : [];
};

export function verdict(idea, { verdict: v, findings = [], improvements = [] }) {
  const st = stOf(idea), cycle = Number(st.cycle);
  if (st.state !== 'IN_REVIEW') throw new Error(`${st.name} is ${st.state}; run "review.mjs start" first`);
  if (!['READY', 'NOT_READY'].includes(v)) throw new Error('verdict is READY or NOT_READY');
  const flags = flagsOf(idea, cycle), pending = flags.filter((f) => !f.disposition);
  if (pending.length) throw new Error(`review every test-quality flag first (a flag is not a verdict): ${pending.map((f) => f.id).join(', ')}`);
  const confirmed = flags.filter((f) => f.disposition.decision === 'confirm');
  for (const f of findings) if (!CHARACTERS.includes(f.owner)) throw new Error(`finding "${f.text}" is addressed to "${f.owner}", who cannot fix it. Use one of ${CHARACTERS.join(', ')}`);
  if (v === 'READY' && (findings.length || confirmed.length)) throw new Error('READY needs no findings and no confirmed test-quality flags. Use NOT_READY, or dismiss the flags with a reason');
  if (v === 'NOT_READY' && !findings.length && !confirmed.length) throw new Error('NOT READY needs at least one named finding (--finding "owner|what is wrong")');

  // record findings as defects with stable ids, grouped by owner; groups with no findings close their earlier defects
  const owners = [...new Set([...findings.map((f) => f.owner), ...[...defectState(idea).values()].filter((d) => d.check.startsWith('review_')).map((d) => d.owner)])];
  const ids = {};
  for (const o of owners) recordCheck(idea, { check: `review_${o}`, owner: o, cycle, findings: findings.filter((f) => f.owner === o).map((f) => f.text) });
  const tq = confirmed.map((f) => `${f.file}${f.line ? `:${f.line}` : ''} "${f.test}": ${f.detail}`);
  recordCheck(idea, { check: 'test_quality', owner: 'farnham', cycle, findings: tq });
  renderCycleView(idea, cycle);
  const all = [...defectState(idea).values()];
  const idOf = (check, text) => all.find((d) => d.check === check && d.summary === text)?.id ?? '';
  for (const f of findings) ids[f.text] = idOf(`review_${f.owner}`, f.text);

  const returned = [...new Set([...(tq.length ? ['Farnham (test quality)'] : []), ...findings.map((f) => `${cap(f.owner)} (${findings.indexOf(f) + 1})`)])];
  const text = [
    `VERDICT: ${v === 'READY' ? 'READY' : 'NOT READY'}`,
    `Work item: ${st.id} ${st.name}`,
    `Stack: ${st.active_stack}`,
    `Cycle: ${cycle} of ${MAX_CYCLES} (all pre-review checks passed on cycle ${cycle})`,
    `Reviewed: design.md, schema/, backend/, ui/, tests/`,
    '',
    `Test quality: ${confirmed.length ? 'REJECTED' : 'ACCEPTED'}${flags.length ? ` (${flags.length} flag(s) reviewed)` : ''}`,
    ...confirmed.map((f) => `  - ${f.file}${f.line ? `:${f.line}` : ''} "${f.test}": ${f.detail}. ${f.disposition.reason}`),
    ...flags.filter((f) => f.disposition.decision === 'dismiss').map((f) => `  - dismissed ${f.id} (${f.rule}) ${f.file} "${f.test}": ${f.disposition.reason}`),
    '',
    'Findings:',
    ...(findings.length ? findings.map((f, i) => `${i + 1}. ${cap(f.owner)}: ${f.text}  [${ids[f.text]}]`) : ['none']),
    ...(v === 'READY' && improvements.length ? ['', 'Non-blocking improvements:', ...improvements.map((x, i) => `${i + 1}. ${x}`)] : []),
    '',
    `Known and accepted by CEO: ${accepted(idea).join('; ') || 'none'}`,
    '',
    `Returned to: ${v === 'READY' ? 'nobody; on to the debrief' : returned.join(', ')}`,
    '',
  ].join('\n');
  fs.mkdirSync(path.join(idea.dir, 'reviews'), { recursive: true });
  writeAtomic(path.join(idea.dir, 'reviews', `review-${cycle}.md`), text);
  logEvent(idea.dir, 'lazarus', `verdict ${v === 'READY' ? 'READY' : 'NOT READY'} on cycle ${cycle}`);

  if (v === 'READY') { transition(idea, 'DEBRIEF', { actor: 'lazarus', note: 'READY' }); return { state: 'DEBRIEF', cycle }; }
  transition(idea, 'NOT_READY', { actor: 'lazarus', note: `NOT READY on cycle ${cycle}` });
  if (cycle >= MAX_CYCLES) { transition(idea, 'BLOCKED_FOR_CEO', { actor: 'factory', note: `NOT READY on cycle ${cycle}` }); return { state: 'BLOCKED_FOR_CEO', cycle }; }
  const r = transition(idea, 'BUILDING', { actor: 'factory', note: `review found problems; cycle ${cycle + 1} starts` });
  return { state: 'BUILDING', cycle: r.cycle };
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Cain-approved waiver for a skipped, deleted or rewritten test (SPEC 11.2).
export function waive(idea, { file, test, reason, by }) {
  if (by !== 'cain') throw new Error('only Cain approves a test waiver (--by cain)');
  if (!file || !test || !reason) throw new Error('--file, --test and --reason are required');
  const f = path.join(idea.dir, 'record', 'test-waivers.md');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, `- ${file}::${test} | ${reason} | approved by cain ${nowIso()}\n`);
  logEvent(idea.dir, 'cain', `approved a test waiver for ${file}::${test}: ${reason}`);
}
