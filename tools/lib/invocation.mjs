// What happens when a character's invocation ends: one metrics line, then the budget thresholds (SPEC 15, 18).
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './paths.mjs';
import { parseStatus } from './idea.mjs';
import { parseTranscript } from './transcript.mjs';
import { appendMetric, readMetrics, ideaFromText } from './metrics.mjs';
import { evaluate, villageStatus } from './budget.mjs';
import { buildQueue } from './queue.mjs';

const CHARACTERS = ['cain', 'wirt', 'griswold', 'adria', 'farnham', 'lazarus', 'ogden'];

export function recordInvocation({ transcript, agent, idea: ideaOverride, root = repoRoot, outcome = 'completed' }) {
  const t = parseTranscript(transcript);
  const idea = ideaOverride ?? ideaFromText(t.prompt, root);
  const name = CHARACTERS.includes(String(agent).toLowerCase()) ? String(agent).toLowerCase() : String(agent || 'unknown');
  const st = idea ? parseStatus(fs.readFileSync(path.join(idea.dir, 'status.md'), 'utf8')) : null;
  const cycle = st ? Number(st.cycle) : null;
  const prior = idea ? readMetrics(idea).filter((r) => r.agent === name && r.cycle === cycle).length : 0;
  const rec = {
    ts_start: t.ts_start, ts_end: t.ts_end,
    idea: idea ? path.basename(idea.dir) : null, stage: st?.stage ?? null, cycle,
    agent: name, invocation: prior + 1,
    reason: (t.prompt || '').split('\n').find((l) => l.trim())?.trim().slice(0, 120) ?? null,
    model: t.model, tokens_in: t.tokens_in, tokens_out: t.tokens_out, tokens_cache_read: t.tokens_cache_read,
    tool_calls: t.tool_calls, checks_run: t.checks_run, outcome, rate_card_cost_usd: null,
  };
  appendMetric(idea, rec, root);
  const result = idea ? evaluate(idea, root) : { events: [] };
  try { buildQueue(root); } catch { /* rebuilt by the next queue command */ }
  return { rec, events: result.events, village: villageStatus(root) };
}
