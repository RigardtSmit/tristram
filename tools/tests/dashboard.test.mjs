import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { factory } from './helpers.mjs';
import { rollup } from '../lib/rollup.mjs';
import { dashboardHtml, metricsText } from '../lib/dashboard.mjs';

function seed(x) {
  const mk = (agent, cycle, stage, tin, tout, start, end, extra = {}) => ({ ts_start: start, ts_end: end, idea: '2026-01-01-demo', stage, cycle, agent, invocation: 1, reason: 'r', model: 'm', tokens_in: tin, tokens_out: tout, tool_calls: 3, checks_run: [], outcome: 'completed', ...extra });
  const recs = [
    mk('cain', 1, 'build', 1000, 200, '2026-01-01T10:00:00Z', '2026-01-01T10:05:00Z'), mk('wirt', 1, 'build', 2000, 300, '2026-01-01T10:06:00Z', '2026-01-01T10:10:00Z'),
    mk('griswold', 1, 'build', 5000, 900, '2026-01-01T10:06:00Z', '2026-01-01T10:20:00Z'), mk('griswold', 2, 'build', 700, 100, '2026-01-01T11:00:00Z', '2026-01-01T11:03:00Z', { invocation: 2 }),
    mk('lazarus', 2, 'review', 3000, 400, '2026-01-01T11:10:00Z', '2026-01-01T11:20:00Z'),
  ];
  fs.mkdirSync(path.join(x.dir, 'record'), { recursive: true });
  fs.writeFileSync(path.join(x.dir, 'record', 'metrics.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return recs;
}

test('totals at each level equal the sum of the level below, and equal the raw records', () => {
  const x = factory(); const recs = seed(x);
  const r = rollup(x.root);
  const raw = recs.reduce((s, q) => s + q.tokens_in + q.tokens_out, 0);
  const [i] = r.ideas;
  assert.equal(r.factory.tokens, raw);
  assert.equal(r.factory.tokens, r.ideas.reduce((s, q) => s + q.tokens, 0));                                // factory = sum of ideas
  assert.equal(i.tokens, i.cycles.reduce((s, c) => s + c.tokens, 0));                                       // idea = sum of cycles
  assert.equal(i.tokens, i.stages.reduce((s, c) => s + c.tokens, 0));                                       // idea = sum of stages
  for (const c of i.cycles) assert.equal(c.tokens, c.agents.reduce((s, a) => s + a.tokens, 0));            // cycle = sum of agents
  assert.equal(r.factory.tokens, Object.values(r.agents).reduce((s, a) => s + a.tokens, 0));               // factory = sum of agents
  assert.equal(r.invocations.length, r.factory.invocations);
  assert.equal(r.factory.seconds, i.cycles.reduce((s, c) => s + c.seconds, 0));
  assert.deepEqual(i.cycles.map((c) => [c.cycle, c.invocations, c.tokens]), [[1, 3, 9400], [2, 2, 4200]]);
  assert.equal(r.agents.griswold.invocations, 2);
  assert.equal(i.cycles[0].seconds, 300 + 240 + 840);                                                       // time from the records' timestamps
});

test('the dashboard page embeds the same figures, its script compiles, and /metrics prints them as text', () => {
  const x = factory(); seed(x);
  const html = dashboardHtml(x.root);
  const data = JSON.parse(html.match(/<script type="application\/json" id="data">(.*?)<\/script>/s)[1]);
  assert.equal(data.factory.tokens, rollup(x.root).factory.tokens);
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
  for (const v of ['Factory', 'Idea', 'Agent', 'Cycle', 'Invocation']) assert.match(script, new RegExp(`${v}`));
  const text = metricsText(x.root, { idea: 'demo', cycle: 1 });
  assert.match(text, /cycle 1: 9,400 tokens, 3 invocation\(s\), 23 min/);
  assert.match(text, /griswold\s+5,900 tokens/);
  assert.doesNotMatch(text, /cycle 2/);
  assert.match(metricsText(x.root, { agent: 'griswold' }), /griswold overall: 6,700 tokens, 2 invocation/);
});
