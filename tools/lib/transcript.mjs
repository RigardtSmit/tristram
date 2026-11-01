// Reads a subagent transcript (JSONL) and sums what the invocation cost (SPEC 18.3).
// Claude Code repeats a message's usage on every line of that message, so messages are de-duplicated by id.
import fs from 'node:fs';

export function parseTranscript(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const byId = new Map(), tools = new Map(), models = {};
  let first = null, last = null, prompt = null;
  for (const l of lines) {
    if (l.timestamp) { first ??= l.timestamp; last = l.timestamp; }
    if (l.type === 'user' && prompt == null) {
      const c = l.message?.content;
      prompt = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p.type === 'text').map((p) => p.text).join('\n') : null;
    }
    if (l.type !== 'assistant' || !l.message) continue;
    const m = l.message;
    if (m.id && m.usage) byId.set(m.id, m.usage);
    if (m.model && m.model !== '<synthetic>') models[m.model] = (models[m.model] || 0) + 1;
    for (const c of Array.isArray(m.content) ? m.content : []) if (c.type === 'tool_use') tools.set(c.id, c);
  }
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
  for (const u of byId.values()) {
    input += u.input_tokens || 0; output += u.output_tokens || 0;
    cacheRead += u.cache_read_input_tokens || 0; cacheWrite += u.cache_creation_input_tokens || 0;
  }
  const commands = [...tools.values()].filter((t) => t.name === 'Bash').map((t) => String(t.input?.command || ''));
  const checks = [...new Set(commands.flatMap((c) => [...c.matchAll(/\b(db|api|ui|test)_check\b/g)].map((m) => `${m[1]}_check`)))];
  return {
    prompt, ts_start: first, ts_end: last,
    model: Object.entries(models).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    // tokens_in counts everything sent to the model except cache reads (budget decision); reads are kept separately.
    tokens_in: input + cacheWrite, tokens_out: output, tokens_cache_read: cacheRead,
    tool_calls: tools.size, checks_run: checks,
  };
}
