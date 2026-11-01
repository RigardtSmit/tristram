// Budgets (SPEC 15): item ceiling by size tier, cycle shares, thresholds and the village daily cap.
// Tokens count input + output (cache reads excluded). Time is wall-clock from the first BUILDING to the end or now,
// so it includes waiting for the CEO. The larger of the two percentages decides.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, nowIso } from './paths.mjs';
import { transition, setStatusFields, logEvent, parseStatus } from './idea.mjs';
import { readMetrics, total, dailyUse } from './metrics.mjs';

export const config = (root = repoRoot) => JSON.parse(fs.readFileSync(path.join(root, 'config', 'budget.json'), 'utf8'));
const readStatus = (idea) => parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8'));
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const transitions = (idea) => {
  const t = path.join(idea.dir, 'record', 'transitions.jsonl');
  return fs.existsSync(t) ? fs.readFileSync(t, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const ENDED = ['CLOSED', 'STOPPED'];

// The item's ceilings, including any increase the CEO approved. null when no size is set.
export function ceilings(idea, root = repoRoot) {
  const st = readStatus(idea), size = String(st.size || 'none').toUpperCase();
  const tier = config(root).sizes[size];
  if (!tier) return null;
  return { size, tokens: tier.tokens + Number(st.budget_extra_tokens || 0), hours: tier.hours + Number(st.budget_extra_hours || 0) };
}

export function usage(idea, root = repoRoot) {
  const cfg = config(root), st = readStatus(idea), c = ceilings(idea, root), recs = readMetrics(idea), tr = transitions(idea);
  const tokens = total(recs);
  const t0 = tr.find((e) => e.to === 'BUILDING');
  const t1 = ENDED.includes(st.state) && tr.length ? Date.parse(tr[tr.length - 1].ts) : Date.now();
  const hours = t0 ? Math.max(0, (t1 - Date.parse(t0.ts)) / 3600000) : 0;
  const group = (key) => {
    const g = {};
    for (const r of recs) { const k = r[key] ?? 0; (g[k] ??= { tokens: 0, invocations: 0 }); g[k].tokens += (r.tokens_in || 0) + (r.tokens_out || 0); g[k].invocations += 1; }
    return g;
  };
  const tokenPct = c ? tokens / c.tokens : 0, timePct = c ? hours / c.hours : 0;
  const shares = Object.fromEntries(Object.entries(cfg.cycle_split).map(([k, v]) => [k, c ? Math.round(c.tokens * v) : null]));
  return { state: st.state, ceilings: c, tokens, hours, tokenPct, timePct, pct: Math.max(tokenPct, timePct), cycles: group('cycle'), agents: group('agent'), shares, invocations: recs.length };
}

// Thresholds already announced for this ceiling, so each fires once per ceiling (record/budget.json).
const crossFile = (idea) => path.join(idea.dir, 'record', 'budget.json');
export const crossed = (idea) => readJson(crossFile(idea), { crossed: [] }).crossed;

// Thresholds announced for the ceiling in force now (an increase re-arms them).
export function crossedNow(idea, root = repoRoot) {
  const c = ceilings(idea, root);
  return c ? crossed(idea).filter((x) => x.key.endsWith(`@${c.tokens}/${c.hours}`)) : [];
}

// Called after every invocation. Logs 70% and 90%, and moves the item to BUDGET_EXHAUSTED at 100%.
export function evaluate(idea, root = repoRoot) {
  const u = usage(idea, root), cfg = config(root), out = { usage: u, events: [] };
  if (!u.ceilings || ENDED.includes(u.state)) return out;
  const seen = crossed(idea), key = (n) => `${n}@${u.ceilings.tokens}/${u.ceilings.hours}`;
  const pc = Math.round(u.pct * 100);
  const fire = (name, level, text) => {
    if (u.pct < level || seen.some((s) => s.key === key(name))) return;
    seen.push({ key: key(name), name, ts: nowIso(), pct: pc });
    fs.mkdirSync(path.dirname(crossFile(idea)), { recursive: true });
    fs.writeFileSync(crossFile(idea), JSON.stringify({ crossed: seen }, null, 2) + '\n');
    logEvent(idea.dir, 'factory', text);
    out.events.push(name);
  };
  fire('gold', cfg.thresholds.gold, `budget at ${pc}% (${u.ceilings.size}): warning`);
  fire('check', cfg.thresholds.check, `budget at ${pc}% (${u.ceilings.size}): Cain must check that the remaining cycles can finish`);
  if (u.pct >= cfg.thresholds.exhausted) {
    fire('exhausted', cfg.thresholds.exhausted, `budget at ${pc}% (${u.ceilings.size}): spent`);
    if (['BUILDING', 'PRE_REVIEW', 'IN_REVIEW'].includes(u.state)) {
      transition(idea, 'BUDGET_EXHAUSTED', { actor: 'factory', note: `budget spent (${pc}%)` });
      out.events.push('transitioned');
    }
  }
  return out;
}

// The CEO raises the ceiling. Only the CEO does this; the new ceiling re-arms the thresholds.
export function increase(idea, { tokens = 0, hours = 0 }) {
  const st = readStatus(idea);
  setStatusFields(idea, { budget_extra_tokens: Number(st.budget_extra_tokens || 0) + tokens, budget_extra_hours: Number(st.budget_extra_hours || 0) + hours });
  logEvent(idea.dir, 'ceo', `budget increased by ${tokens} tokens, ${hours} h`);
}

export function villageStatus(root = repoRoot) {
  const cfg = config(root).village_daily, d = dailyUse(root);
  const capped = d.invocations >= cfg.invocations || d.tokens >= cfg.tokens;
  let at = null, n = 0, t = 0;
  for (const r of d.records) { n += 1; t += (r.tokens_in || 0) + (r.tokens_out || 0); if (!at && (n >= cfg.invocations || t >= cfg.tokens)) at = r.ts_end; }
  return { ...d, cap: cfg, capped, raised: at };
}
