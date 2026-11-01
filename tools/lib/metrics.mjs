// The metrics ledger (SPEC 18.3): record/metrics.jsonl, one line per invocation, appended only by the SubagentStop hook.
// Invocations that cannot be tied to an idea go to .factory/metrics-unattributed.jsonl, so the daily cap still sees them.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './paths.mjs';
import { listIdeas } from './idea.mjs';

const ledger = (idea) => path.join(idea.dir, 'record', 'metrics.jsonl');
const unattributed = (root) => path.join(root, '.factory', 'metrics-unattributed.jsonl');
const parse = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

export function readMetrics(idea) { return parse(ledger(idea)); }
export function readUnattributed(root = repoRoot) { return parse(unattributed(root)); }

export function appendMetric(idea, rec, root = repoRoot) {
  const f = idea ? ledger(idea) : unattributed(root);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify(rec) + '\n');
}

// Which idea a prompt is about: the idea folder named most often in it.
export function ideaFromText(text, root = repoRoot) {
  if (!text) return null;
  const hits = listIdeas(root).map((i) => ({ i, n: text.split(path.basename(i.dir)).length - 1 })).filter((h) => h.n > 0);
  hits.sort((a, b) => b.n - a.n);
  return hits[0]?.i ?? null;
}

export const total = (recs) => recs.reduce((s, r) => s + (r.tokens_in || 0) + (r.tokens_out || 0), 0);

// Village-wide use on one UTC day (default today), across every idea and unattributed runs.
export function dailyUse(root = repoRoot, day = new Date().toISOString().slice(0, 10)) {
  const recs = [...listIdeas(root).flatMap(readMetrics), ...readUnattributed(root)]
    .filter((r) => (r.ts_end || '').slice(0, 10) === day)
    .sort((a, b) => a.ts_end.localeCompare(b.ts_end));
  return { day, invocations: recs.length, tokens: total(recs), records: recs };
}
