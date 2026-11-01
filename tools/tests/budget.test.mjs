import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { factory } from './helpers.mjs';

const queue = (x) => JSON.parse(fs.readFileSync(path.join(x.root, 'ceo', 'queue.json'), 'utf8'));
let seq = 0;
// A subagent transcript in Claude Code's shape: usage is repeated on every line of a message, so the parser must de-duplicate.
function transcript(x, { prompt, input = 10, output, cacheWrite = 0, cacheRead = 0, model = 'claude-test', tools = ['Read', 'Bash'] }) {
  const id = `msg_${++seq}`, usage = { input_tokens: input, output_tokens: output, cache_creation_input_tokens: cacheWrite, cache_read_input_tokens: cacheRead };
  const content = tools.map((name, i) => ({ type: 'tool_use', id: `tu_${seq}_${i}`, name, input: name === 'Bash' ? { command: 'node tools/checks/api_check.mjs demo' } : {} }));
  const lines = [{ type: 'user', timestamp: new Date(Date.now() - 300000).toISOString(), message: { role: 'user', content: prompt } },
    ...content.map((c) => ({ type: 'assistant', timestamp: new Date().toISOString(), message: { id, model, usage, content: [c] } }))];
  const f = path.join(x.root, `t${seq}.jsonl`);
  fs.writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return f;
}
const metrics = (x) => fs.readFileSync(path.join(x.dir, 'record', 'metrics.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const start = (x) => { x.tool('idea.mjs', 'accept-brief', 'demo', '--by', 'ceo'); x.tool('idea.mjs', 'accept-stack', 'demo', '--by', 'ceo', '--option', 'A'); x.tool('cycle.mjs', 'start', 'demo'); };
const record = (x, o) => x.tool('budget.mjs', 'record', '--transcript', transcript(x, { prompt: 'Work on ideas/2026-01-01-demo now', ...o }), '--agent', o.agent ?? 'griswold');

test('metrics: tokens are summed once per message, cache reads are kept apart, tools are counted', () => {
  const x = factory(); start(x);
  assert.equal(x.tool('budget.mjs', 'set-size', 'demo', 'S', '--by', 'ceo').status, 0);
  const r = record(x, { output: 1000, cacheWrite: 4000, cacheRead: 50000 });
  assert.equal(r.status, 0, r.stderr);
  const [m] = metrics(x);
  assert.deepEqual([m.agent, m.idea, m.cycle, m.invocation, m.stage], ['griswold', '2026-01-01-demo', 1, 1, 'build']);
  assert.deepEqual([m.tokens_in, m.tokens_out, m.tokens_cache_read, m.tool_calls], [4010, 1000, 50000, 2]);
  assert.deepEqual(m.checks_run, ['api_check']);
  record(x, { output: 10 });
  assert.equal(metrics(x)[1].invocation, 2);                       // the second run of the same agent in the cycle
  assert.match(x.tool('budget.mjs', 'show', 'demo').stdout, /griswold\s+.*2 invocation/);
});

test('thresholds: 70% and 90% warn once, 100% exhausts the item and raises a blue portal; the CEO can raise the ceiling', () => {
  const x = factory(); start(x);
  assert.match(x.tool('budget.mjs', 'set-size', 'demo', 'S').stderr, /only the CEO/);
  x.tool('budget.mjs', 'set-size', 'demo', 'S', '--by', 'ceo');               // 1,000,000 tokens
  record(x, { output: 750000, input: 0 });
  assert.equal(queue(x).find((e) => e.type === 'BUDGET_WARNING').colour, 'gold');
  assert.equal(x.status().state, 'BUILDING');
  record(x, { output: 170000, input: 0 });
  assert.match(queue(x).find((e) => e.type === 'BUDGET_WARNING').summary, /92%.*Cain must check/);
  const log = () => fs.readFileSync(path.join(x.dir, 'record', 'log.md'), 'utf8');
  assert.equal((log().match(/budget at \d+% \(S\): warning/g) || []).length, 1);   // each threshold fires once
  record(x, { output: 100000, input: 0 });
  assert.equal(x.status().state, 'BUDGET_EXHAUSTED');
  const blue = queue(x).find((e) => e.type === 'BUDGET_EXHAUSTED');
  assert.equal(blue.colour, 'blue');
  assert.deepEqual(blue.options, ['increase_budget', 'reduce_scope', 'stop']);
  assert.match(x.tool('budget.mjs', 'increase', 'demo', '--tokens', '500000').stderr, /no agent raises/);
  assert.equal(x.tool('queue.mjs', 'decide', blue.id, 'increase_budget').status, 0);
  assert.equal(x.status().state, 'BUILDING');
  assert.match(x.tool('budget.mjs', 'show', 'demo').stdout, /of 1,500,000/);
  assert.equal(queue(x).filter((e) => e.type === 'BUDGET_WARNING' || e.type === 'BUDGET_EXHAUSTED').length, 0);   // re-armed at the new ceiling
});

test('the village daily cap raises a red portal, and the invoke gate refuses new work', () => {
  const x = factory(); start(x);
  const cfg = path.join(x.root, 'config', 'budget.json');
  fs.writeFileSync(cfg, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfg, 'utf8')), village_daily: { invocations: 2, tokens: 1e9 } }));
  record(x, { output: 5 }); record(x, { output: 5 });
  assert.match(x.tool('budget.mjs', 'village').stdout, /CAP REACHED/);
  const red = queue(x).find((e) => e.type === 'DAILY_CAP');
  assert.equal(red.colour, 'red');
  const gate = (prompt) => x.spawn.spawnSync(process.execPath, [path.join(x.root, 'tools', 'hooks', 'invoke-gate.mjs')], { input: JSON.stringify({ tool_input: { prompt } }), encoding: 'utf8' });
  const g = gate('Build ideas/2026-01-01-demo');
  assert.equal(g.status, 2);
  assert.match(g.stderr, /daily cap is reached/);
  fs.writeFileSync(cfg, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfg, 'utf8')), village_daily: { invocations: 150, tokens: 1e9 } }));
  assert.equal(gate('Build ideas/2026-01-01-demo').status, 0);
  x.tool('idea.mjs', 'set-state', 'demo', 'STOPPED', '--actor', 'ceo');
  assert.match(gate('Build ideas/2026-01-01-demo').stderr, /is STOPPED/);
});
