// plan.md (SPEC 7.1): Cain's work items, dependency graph and parallel steps for one cycle.
import fs from 'node:fs';
import path from 'node:path';
import { parseStatus } from './idea.mjs';
import { activeFor, rerunAreas } from './change.mjs';

import { AREAS } from './areas.mjs';
export { AREAS };
const CHARACTERS = ['cain', 'wirt', 'griswold', 'adria', 'farnham', 'lazarus', 'ogden'];

function table(text, heading) {
  const m = text.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  if (!m) return null;
  const rows = m[1].split('\n').filter((l) => /^\|/.test(l)).slice(2);       // skip header and divider
  return rows.map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}

export function readPlan(idea) {
  const f = path.join(idea.dir, 'plan.md');
  if (!fs.existsSync(f)) return null;
  const text = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const areas = (text.match(/^\*\*Areas:\*\*\s*(.*)$/m)?.[1] ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return {
    text, cycle: Number(text.match(/^\*\*Cycle:\*\*\s*(\d+)/m)?.[1] ?? NaN), areas,
    work: table(text, 'Work items'), deps: table(text, 'Dependencies'), parallel: /^## Parallel steps\s*\n\s*\S/m.test(text),
  };
}

export function validatePlan(idea) {
  const problems = [];
  const plan = readPlan(idea);
  if (!plan) return ['plan.md is missing. Cain writes it at the start of each cycle'];
  const st = parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
  if (plan.cycle !== Number(st.cycle)) problems.push(`plan.md is for cycle ${plan.cycle} but the idea is in cycle ${st.cycle}`);
  if (!plan.areas.length) problems.push('plan.md lists no Areas');
  for (const a of plan.areas) if (!AREAS[a]) problems.push(`unknown area "${a}". Known: ${Object.keys(AREAS).join(', ')}`);
  for (const cr of activeFor(idea, plan.cycle)) {
    const allowed = rerunAreas(cr);
    for (const a of plan.areas.filter((x) => AREAS[x] && !allowed.includes(x))) problems.push(`area "${a}" is not affected by ${cr.id}; only ${allowed.join(', ') || 'nothing'} re-run (SPEC 8.1)`);
  }
  if (!plan.work) problems.push('plan.md has no "Work items" table');
  else {
    const rows = plan.work.filter((r) => r[0] && r[2]);
    if (!rows.length) problems.push('the Work items table has no filled-in rows');
    for (const r of rows) if (!CHARACTERS.includes(r[1].toLowerCase())) problems.push(`work item ${r[0]} names "${r[1]}", who is not a character`);
    if (plan.cycle === 1) {
      for (const a of plan.areas.filter((x) => AREAS[x])) {
        if (!rows.some((r) => r[1].toLowerCase() === AREAS[a])) problems.push(`area "${a}" is in the plan but ${AREAS[a]} has no work item`);
      }
    }
  }
  if (!plan.deps) problems.push('plan.md has no "Dependencies" table');
  else for (const r of plan.deps.filter((x) => x[0])) {
    const needed = r[1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    for (const c of [...needed, r[2].toLowerCase()]) if (c && !CHARACTERS.includes(c)) problems.push(`dependency "${r[0]}" names "${c}", who is not a character`);
  }
  if (!plan.parallel) problems.push('plan.md has no "Parallel steps"');
  return problems;
}
