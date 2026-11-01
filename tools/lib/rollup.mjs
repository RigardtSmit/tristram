// Metrics roll-up (SPEC 18). Factory > idea > cycle > agent > invocation, built from one list of invocation records
// and each idea's transitions, so the totals at every level equal the sum of the level below by construction.
// Time comes from the hook's timestamps and the transitions log, never from an agent's estimate (18.6).
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './paths.mjs';
import { listIdeas, MAX_CYCLES } from './idea.mjs';
import { readMetrics, readUnattributed } from './metrics.mjs';
import { villageStatus } from './budget.mjs';
import { buildQueue } from './queue.mjs';
import { readEvents } from './defects.mjs';

const WAITING = new Set(['BLOCKED_FOR_CEO', 'ENVIRONMENT_BLOCKED', 'BUDGET_EXHAUSTED', 'PAUSED', 'NOT_READY']);
const secs = (r) => (r.ts_start && r.ts_end ? Math.max(0, (Date.parse(r.ts_end) - Date.parse(r.ts_start)) / 1000) : 0);
const add = (a, r) => { a.tokens += (r.tokens_in || 0) + (r.tokens_out || 0); a.tokens_in += r.tokens_in || 0; a.tokens_out += r.tokens_out || 0; a.invocations += 1; a.seconds += secs(r); a.tool_calls += r.tool_calls || 0; return a; };
const zero = () => ({ tokens: 0, tokens_in: 0, tokens_out: 0, invocations: 0, seconds: 0, tool_calls: 0 });
const sum = (xs) => xs.reduce((a, x) => { for (const k of Object.keys(a)) a[k] += x[k]; return a; }, zero());

function timeline(idea) {
  const f = path.join(idea.dir, 'record', 'transitions.jsonl');
  if (!fs.existsSync(f)) return [];
  const ev = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.to && e.from !== undefined);
  const out = [];
  for (let i = 0; i < ev.length; i++) {
    const end = ev[i + 1] ? Date.parse(ev[i + 1].ts) : ['CLOSED', 'STOPPED'].includes(ev[i].to) ? Date.parse(ev[i].ts) : Date.now();
    out.push({ state: ev[i].to, cycle: ev[i].cycle, from: ev[i].ts, seconds: Math.max(0, (end - Date.parse(ev[i].ts)) / 1000), waiting: WAITING.has(ev[i].to) });
  }
  return out;
}

export function rollup(root = repoRoot) {
  const ideas = listIdeas(root).map((idea) => {
    const recs = readMetrics(idea).map((r, n) => ({ ...r, id: `${idea.name}#${n + 1}` }));
    const cycleNums = [...new Set(recs.map((r) => r.cycle ?? 0))].sort((a, b) => a - b);
    const defects = readEvents(idea);
    const cycles = cycleNums.map((c) => {
      const inCycle = recs.filter((r) => (r.cycle ?? 0) === c);
      const agents = [...new Set(inCycle.map((r) => r.agent))].map((a) => ({ agent: a, ...inCycle.filter((r) => r.agent === a).reduce(add, zero()) }));
      const ev = defects.filter((d) => d.cycle === c);
      return { cycle: c, ...sum(agents), agents,
        defects_raised: ev.filter((d) => d.result === 'raised').length, defects_fixed: ev.filter((d) => d.result === 'fixed').length,
        defects_persisted: ev.filter((d) => d.result === 'persisted').length, checks: [...new Set(inCycle.flatMap((r) => r.checks_run || []))] };
    });
    const stages = [...new Set(recs.map((r) => r.stage ?? 'unknown'))].map((s) => ({ stage: s, ...recs.filter((r) => (r.stage ?? 'unknown') === s).reduce(add, zero()) }));
    const tl = timeline(idea);
    return {
      name: idea.name, id: idea.status.id, state: idea.status.state, cycle: Number(idea.status.cycle), ...sum(cycles), cycles, stages, invocations_list: recs,
      timeline: tl, working_seconds: tl.filter((t) => !t.waiting && !['CLOSED', 'STOPPED'].includes(t.state)).reduce((s, t) => s + t.seconds, 0),
      waiting_seconds: tl.filter((t) => t.waiting).reduce((s, t) => s + t.seconds, 0),
      defects: { raised: defects.filter((d) => d.result === 'raised').length, persisted: defects.filter((d) => d.result === 'persisted').length, fixed: defects.filter((d) => d.result === 'fixed').length },
    };
  });
  const agents = {};
  for (const i of ideas) for (const r of i.invocations_list) agents[r.agent] = add(agents[r.agent] ?? zero(), r);
  const unattributed = readUnattributed(root).reduce(add, zero());
  const all = sum(ideas);
  const done = ideas.filter((i) => i.state === 'CLOSED');
  const byState = {};
  for (const i of ideas) byState[i.state] = (byState[i.state] ?? 0) + 1;
  const q = buildQueue(root), v = villageStatus(root);
  return {
    generated: new Date().toISOString(), max_cycles: MAX_CYCLES,
    factory: { ...all, items: ideas.length, by_state: byState, unattributed, avg_cycles_per_closed_item: done.length ? done.reduce((s, i) => s + i.cycle, 0) / done.length : null,
      quota: { day: v.day, invocations: v.invocations, tokens: v.tokens, cap: v.cap }, waiting_for_ceo: q.filter((e) => e.colour === 'blue' || e.colour === 'gold').map((e) => ({ id: e.id, type: e.type, colour: e.colour, raised: e.raised })) },
    ideas: ideas.map(({ invocations_list, ...rest }) => ({ ...rest, invocation_ids: invocations_list.map((r) => r.id) })),
    agents, invocations: ideas.flatMap((i) => i.invocations_list),
  };
}
