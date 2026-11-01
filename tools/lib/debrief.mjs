// Debrief (SPEC 13.2): after a READY verdict every lesson candidate gets the CEO's decision, then Ogden writes
// record/debrief.md and the item moves to CLOSED.
import fs from 'node:fs';
import path from 'node:path';
import { parseStatus, transition, writeAtomic, logEvent } from './idea.mjs';
import { candidates } from './lessons.mjs';
import { defectState } from './defects.mjs';
import { readMetrics, total } from './metrics.mjs';
import { usage } from './budget.mjs';

const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const stOf = (idea) => parseStatus(read(path.join(idea.dir, 'status.md')));

export function briefing(idea) {
  const st = stOf(idea);
  if (st.state !== 'DEBRIEF') throw new Error(`${st.name} is ${st.state}; a debrief follows a READY verdict`);
  const reviews = fs.existsSync(path.join(idea.dir, 'reviews')) ? fs.readdirSync(path.join(idea.dir, 'reviews')).sort() : [];
  return { st, review: reviews.length ? read(path.join(idea.dir, 'reviews', reviews[reviews.length - 1])) : null, candidates: candidates(idea) };
}

export function close(idea, { by }) {
  if (by !== 'ogden') throw new Error('Ogden closes the debrief (--by ogden)');
  const { st, review } = briefing(idea);
  const cands = candidates(idea), pending = cands.filter((c) => c.status === 'PENDING');
  if (pending.length) throw new Error(`the CEO has not decided: ${pending.map((c) => c.id).join(', ')}. Every candidate is approved or rejected in the debrief`);
  const defects = [...defectState(idea).values()], recs = readMetrics(idea), u = usage(idea);
  const byAgent = {};
  for (const r of recs) byAgent[r.agent] = (byAgent[r.agent] ?? 0) + 1;
  const improvements = review?.match(/Non-blocking improvements:\n([\s\S]*?)(?=\n\n|$)/)?.[1] ?? 'none';
  const text = [
    `# Debrief: ${st.name}`, '',
    `Work item ${st.id}, closed after ${st.cycle} cycle(s). Stack: ${st.active_stack}. Brief: ${st.brief}.`, '',
    '## Verdict', '', review ? review.split('\n').slice(0, 1).join('') + ` (reviews/ holds the full text)` : 'No review file.', '',
    '## What each character did', '',
    ...(Object.keys(byAgent).length ? Object.entries(byAgent).map(([a, n]) => `- ${a}: ${n} invocation(s)`) : ['- no invocations were recorded']), '',
    '## Defects', '',
    `- ${defects.length} raised, ${defects.filter((d) => d.state === 'fixed').length} fixed, ${defects.filter((d) => d.state === 'open').length} still open`,
    ...defects.map((d) => `- ${d.id} (${d.owner}, ${d.check}): ${d.summary}; ${d.history.map((h) => `${h.cycle}:${h.result}`).join(' ')}`), '',
    '## Cost', '', u.ceilings ? `- ${u.ceilings.size}: ${u.tokens} tokens (${Math.round(u.tokenPct * 100)}%), ${u.hours.toFixed(1)} h (${Math.round(u.timePct * 100)}%)` : `- ${total(recs)} tokens; no size tier was set`, '',
    '## Non-blocking improvements', '', improvements, '',
    '## Lessons', '', ...(cands.length ? cands.map((c) => `- ${c.id} ${c.title}: ${c.status}${c.lesson ? ` as ${c.lesson}` : ''}`) : ['- no candidates']), '',
  ].join('\n');
  writeAtomic(path.join(idea.dir, 'record', 'debrief.md'), text);
  transition(idea, 'CLOSED', { actor: 'ogden', note: 'debrief complete' });
  logEvent(idea.dir, 'ogden', 'wrote record/debrief.md');
  return { cycles: st.cycle };
}
