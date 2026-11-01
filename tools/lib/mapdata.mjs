// What the village map shows, read from the factory's own files (SPEC 19.2): every status.md, ceo/queue.json,
// each idea's metrics. Character states are derived from the state of each item, never typed in.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { repoRoot } from './paths.mjs';
import { listIdeas } from './idea.mjs';
import { buildQueue } from './queue.mjs';
import { readMetrics } from './metrics.mjs';
import { readPlan, AREAS } from './plan.mjs';
import { openDefectList } from './defects.mjs';
import { readAll as readQuestions } from './questions.mjs';
import { current as currentEnv } from './env.mjs';

const OWNER = Object.fromEntries(Object.entries(AREAS).map(([a, o]) => [o, a]));

// Who is working and who is blocked on one item, as the `active_agents` / `blocked_agents` strings the map reads.
export function agentsOf(idea) {
  const st = idea.status, active = new Set(), blocked = [];
  const owners = () => {
    const plan = readPlan(idea);
    const fromPlan = (plan?.work ?? []).filter((r) => r[1]).map((r) => r[1].toLowerCase());
    const withDefects = openDefectList(idea).filter((d) => d.check.endsWith('_check') || d.check === 'test_quality').map((d) => d.owner);
    return Number(st.cycle) > 1 && withDefects.length ? withDefects : fromPlan;
  };
  switch (st.state) {
    case 'BRIEFING': active.add('cain'); break;
    case 'BUILDING': active.add('cain'); for (const o of owners()) active.add(o); break;
    case 'PRE_REVIEW': active.add('farnham'); break;
    case 'IN_REVIEW': active.add('lazarus'); break;
    case 'NOT_READY': active.add('cain'); break;
    case 'DEBRIEF': active.add('ogden'); active.add('lazarus'); break;
    case 'BLOCKED_FOR_CEO': active.add('cain'); for (const d of openDefectList(idea)) blocked.push([d.owner, 'red', `${d.id} unresolved after cycle ${st.cycle}`]); break;
    case 'ENVIRONMENT_BLOCKED': { const e = currentEnv(idea); blocked.push([e?.owner ?? 'cain', 'red', (e?.cause ?? 'environment failure').split('\n')[0]]); break; }
    case 'BUDGET_EXHAUSTED': blocked.push(['cain', 'gold', 'item budget spent']); break;
    default: break;
  }
  for (const q of readQuestions(idea).filter((x) => x.pending && x.blocking)) blocked.push([q.by, 'gold', `waiting on ${q.id}`]);
  const stuck = new Set(blocked.map((b) => b[0]));
  const seen = new Set();
  const b = blocked.filter((x) => !seen.has(x[0]) && seen.add(x[0]));
  return {
    active_agents: [...active].filter((a) => !stuck.has(a)).map((a) => `${a}:0.5`).join(', ') || 'none',
    blocked_agents: b.map(([a, c, r]) => `${a}:${c}:${r}`).join(', ') || 'none',
  };
}

export function registryOf(root = repoRoot) {
  const out = {};
  for (const f of fs.readdirSync(path.join(root, 'registry'))) {
    if (!f.endsWith('.yaml')) continue;
    const r = YAML.parse(fs.readFileSync(path.join(root, 'registry', f), 'utf8'));
    out[f.replace('.yaml', '')] = { character: r.character, role: r.role, tools: r.tools, skills: r.skills ?? [], connectors: r.connectors ?? [] };
  }
  return out;
}

export function liveData(root = repoRoot) {
  const queue = buildQueue(root), ideas = listIdeas(root);
  return {
    source: 'live', generated: new Date().toISOString(),
    queue,
    ideas: ideas.map((i) => ({ ...i.status, ...agentsOf(i) })),
    metrics: ideas.flatMap(readMetrics),
    registry: registryOf(root),
  };
}
