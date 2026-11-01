// SubagentStop hook: appends one line to the idea's record/metrics.jsonl and evaluates the budget (SPEC 15, 18).
// It never blocks: a failure here must not stop the character's work, so errors go to stderr and exit 0.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
try {
  const input = JSON.parse(raw);
  if (!input.agent_transcript_path) process.exit(0);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { recordInvocation } = await import(new URL('../lib/invocation.mjs', import.meta.url));
  recordInvocation({ transcript: input.agent_transcript_path, agent: input.agent_type, root });
} catch (err) {
  process.stderr.write(`subagent-stop: ${err.message}\n`);
}
process.exit(0);
